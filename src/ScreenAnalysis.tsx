import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { useEffect, useRef, useState } from 'react'
import ChessBoard from './components/ChessBoard'
import { AnalysisCancelledError, type EngineAnalysis, type StockfishEngine } from './engine'
import { displayEval, moveToSan, scoreOf } from './chess-analysis'
import { useCornerCalibration } from './hooks/useCornerCalibration'
import { useScreenCapture } from './hooks/useScreenCapture'
import { useVideoAspectRatio } from './hooks/useVideoAspectRatio'
import { cellCenter, cellCorners, gridLines, squareRowCol } from './vision/geometry'
import { diffSquares, matchMove, sampleBoardSignature, sameSquareSet, type BoardSignature, type MoveMatch } from './vision/board-tracker'
import type { Point } from './vision/types'
import './styles/screen-analysis.css'

const SAMPLE_INTERVAL_MS = 600
const STABLE_TICKS_REQUIRED = 2
const PROMOTION_PIECES: Array<{ piece: PieceSymbol; label: string }> = [
  { piece: 'q', label: 'Dama' }, { piece: 'r', label: 'Torre' }, { piece: 'b', label: 'Bispo' }, { piece: 'n', label: 'Cavalo' },
]
const CORNER_STEPS = ['superior-esquerdo', 'superior-direito', 'inferior-direito', 'inferior-esquerdo']

function calibrationHint(cornerCount: number, calibrated: boolean) {
  if (calibrated) return 'Calibração pronta.'
  if (cornerCount >= 4) return 'Os 4 pontos marcados não formam um quadrilátero válido. Toque na tela para recomeçar a calibração.'
  return `Toque nos 4 cantos do tabuleiro nesta ordem — ${CORNER_STEPS.join(' → ')}. Próximo: ${CORNER_STEPS[cornerCount]} (${cornerCount}/4).`
}

type Snapshot = { fen: string; signature: BoardSignature }

function squarePoint(corners: [Point, Point, Point, Point], square: Square, orientation: Color): Point {
  const { row, col } = squareRowCol(square, orientation)
  return cellCenter(corners, row, col)
}

export default function ScreenAnalysis({ engine, pieceSet }: { engine: StockfishEngine | null; pieceSet: string }) {
  const { state: captureState, stream, start: startCapture, stop: stopCapture } = useScreenCapture()
  const { corners, addCorner, reset: resetCorners, calibrated } = useCornerCalibration()
  const [orientation, setOrientation] = useState<Color>('w')
  const [tracking, setTracking] = useState(false)
  const [fen, setFen] = useState(new Chess().fen())
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
  const [status, setStatus] = useState('Compartilhe a tela e calibre os quatro cantos do tabuleiro exibido.')
  const [ambiguous, setAmbiguous] = useState<MoveMatch[] | null>(null)
  const [unresolved, setUnresolved] = useState(false)
  const [analysis, setAnalysis] = useState<EngineAnalysis | null>(null)
  const [thinking, setThinking] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const aspectRatio = useVideoAspectRatio(videoRef, stream)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gameRef = useRef(new Chess())
  const baselineRef = useRef<BoardSignature | null>(null)
  const lastSampleRef = useRef<BoardSignature | null>(null)
  const previousChangedRef = useRef<Square[]>([])
  const attemptedKeyRef = useRef<string>('')
  const stableTicksRef = useRef(0)
  const historyRef = useRef<Snapshot[]>([])
  const requestRef = useRef(0)

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream }, [stream])
  if (!canvasRef.current) canvasRef.current = document.createElement('canvas')

  useEffect(() => {
    if (captureState !== 'active' && tracking) { setTracking(false); setStatus('Compartilhamento de tela encerrado.') }
  }, [captureState, tracking])

  async function analyzeCurrent(nextFen: string) {
    if (!engine || new Chess(nextFen).isGameOver()) return
    const requestId = ++requestRef.current
    setThinking(true); setEngineError(null)
    try {
      const result = await engine.analyze(nextFen, 14, 1)
      if (requestRef.current !== requestId) return
      setAnalysis(result)
    } catch (error) {
      if (error instanceof AnalysisCancelledError) return
      if (requestRef.current !== requestId) return
      setEngineError(error instanceof Error ? error.message : 'Não foi possível analisar a posição.')
    } finally {
      if (requestRef.current === requestId) setThinking(false)
    }
  }

  function resetTrackerState() {
    previousChangedRef.current = []
    attemptedKeyRef.current = ''
    stableTicksRef.current = 0
    setAmbiguous(null)
    setUnresolved(false)
  }

  function commit(move: MoveMatch['move'], sample: BoardSignature) {
    historyRef.current.push({ fen: gameRef.current.fen(), signature: baselineRef.current ?? sample })
    gameRef.current.move({ from: move.from, to: move.to, promotion: move.promotion })
    baselineRef.current = sample
    resetTrackerState()
    setFen(gameRef.current.fen())
    setLastMove({ from: move.from, to: move.to })
    setStatus(gameRef.current.isGameOver() ? `Partida encerrada. Último lance: ${move.san}.` : `Lance detectado: ${move.san}.`)
    if (gameRef.current.isGameOver()) setTracking(false)
    void analyzeCurrent(gameRef.current.fen())
  }

  function startTracking() {
    const context = canvasRef.current?.getContext('2d')
    const video = videoRef.current
    if (!context || !video || !calibrated) return
    canvasRef.current!.width = video.videoWidth || 640
    canvasRef.current!.height = video.videoHeight || 640
    context.drawImage(video, 0, 0, canvasRef.current!.width, canvasRef.current!.height)
    gameRef.current = new Chess()
    historyRef.current = []
    baselineRef.current = sampleBoardSignature(context, corners as [Point, Point, Point, Point], orientation)
    resetTrackerState()
    setFen(gameRef.current.fen())
    setLastMove(null)
    setStatus('Reconhecendo lances a partir da posição inicial padrão.')
    setTracking(true)
    void engine?.newGame().then(() => analyzeCurrent(gameRef.current.fen()))
  }

  function stopTracking() {
    setTracking(false)
    setStatus('Reconhecimento pausado. Ajuste a calibração ou reinicie quando quiser.')
  }

  function ignoreNoise() {
    if (lastSampleRef.current) baselineRef.current = lastSampleRef.current
    resetTrackerState()
    setStatus('Alteração ignorada como ruído visual. Aguardando o próximo lance.')
  }

  function undoLast() {
    const previous = historyRef.current.pop()
    if (!previous) return
    gameRef.current = new Chess(previous.fen)
    baselineRef.current = previous.signature
    resetTrackerState()
    setFen(gameRef.current.fen())
    setLastMove(null)
    setStatus('Último lance detectado foi desfeito.')
    void analyzeCurrent(gameRef.current.fen())
  }

  function resolveMove(move: MoveMatch['move']) {
    const sample = lastSampleRef.current
    if (!sample) return
    commit(move, sample)
  }

  useEffect(() => {
    if (!tracking) return
    const timer = window.setInterval(() => {
      const context = canvasRef.current?.getContext('2d')
      const video = videoRef.current
      if (!context || !video || video.readyState < 2) return
      context.drawImage(video, 0, 0, canvasRef.current!.width, canvasRef.current!.height)
      const sample = sampleBoardSignature(context, corners as [Point, Point, Point, Point], orientation)
      lastSampleRef.current = sample
      if (!baselineRef.current) { baselineRef.current = sample; return }
      if (ambiguous || unresolved) return

      const changed = diffSquares(baselineRef.current, sample)
      if (!changed.length) { previousChangedRef.current = []; stableTicksRef.current = 0; return }

      if (sameSquareSet(changed, previousChangedRef.current)) stableTicksRef.current += 1
      else { previousChangedRef.current = changed; stableTicksRef.current = 1 }

      if (stableTicksRef.current < STABLE_TICKS_REQUIRED) return
      const key = [...changed].sort().join(',')
      if (key === attemptedKeyRef.current) return
      attemptedKeyRef.current = key

      const matches = matchMove(gameRef.current, changed)
      if (matches.length === 1) { commit(matches[0].move, sample); return }
      if (matches.length > 1) { setAmbiguous(matches); setStatus('Vários lances possíveis foram encontrados. Confirme qual foi jogado.'); return }
      setUnresolved(true)
      setStatus('Não foi possível identificar o lance automaticamente. Confirme manualmente abaixo.')
    }, SAMPLE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [tracking, corners, orientation, ambiguous, unresolved])

  const promotionGroup = ambiguous && ambiguous.every((m) => m.move.from === ambiguous[0].move.from && m.move.to === ambiguous[0].move.to && m.move.promotion) ? ambiguous : null
  const genericAmbiguous = ambiguous && !promotionGroup ? ambiguous : null
  const legalMoves = unresolved ? gameRef.current.moves({ verbose: true }) : []

  const bestMove = analysis?.bestMove
  const bestSan = bestMove ? moveToSan(gameRef.current, bestMove) : null
  const arrowFrom = bestMove && tracking ? squarePoint(corners as [Point, Point, Point, Point], bestMove.slice(0, 2) as Square, orientation) : null
  const arrowTo = bestMove && tracking ? squarePoint(corners as [Point, Point, Point, Point], bestMove.slice(2, 4) as Square, orientation) : null
  const lastMoveCells = lastMove ? [lastMove.from, lastMove.to].map((square) => {
    const { row, col } = squareRowCol(square, orientation)
    return cellCorners(corners as [Point, Point, Point, Point], row, col)
  }) : []

  const captureMessage: Record<string, string> = {
    idle: 'Nenhuma tela compartilhada.', unsupported: 'Este navegador não oferece captura de tela.', insecure: 'A captura de tela exige HTTPS ou localhost.', denied: 'Permissão de captura negada.', error: 'Não foi possível iniciar a captura de tela.', active: 'Compartilhando tela.',
  }

  return <main className="screen-shell">
    <header className="trainer-topbar"><div><span className="eyebrow">VISÃO LOCAL · TRANSMISSÃO</span><h1>Análise da tela ao vivo</h1></div></header>
    <section className="screen-layout">
      <div className="screen-stage" style={aspectRatio ? { aspectRatio } : undefined} onClick={!calibrated ? addCorner : undefined}>
        <video ref={videoRef} autoPlay muted playsInline />
        {!calibrated && corners.map((point, index) => <i className="camera-point" key={index} style={{ left: `${point.x}%`, top: `${point.y}%` }} />)}
        {calibrated && <svg viewBox="0 0 100 100" className="camera-grid">
          {gridLines(corners as [Point, Point, Point, Point]).flatMap((line, index) => [
            <line key={`v${index}`} x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} />,
            <line key={`h${index}`} x1={line.c.x} y1={line.c.y} x2={line.d.x} y2={line.d.y} />,
          ])}
        </svg>}
        {calibrated && lastMoveCells.map((cell, index) => <svg viewBox="0 0 100 100" className="screen-lastmove" key={index}><polygon points={cell.map((p) => `${p.x},${p.y}`).join(' ')} /></svg>)}
        {calibrated && arrowFrom && arrowTo && <svg viewBox="0 0 100 100" className="screen-hint-arrow"><defs><marker id="screen-arrowhead" markerWidth="3.8" markerHeight="3.8" refX="3.2" refY="1.9" orient="auto"><polygon points="0 0, 3.8 1.9, 0 3.8" /></marker></defs><line x1={arrowFrom.x} y1={arrowFrom.y} x2={arrowTo.x} y2={arrowTo.y} markerEnd="url(#screen-arrowhead)" /></svg>}
      </div>

      <aside className="card screen-panel">
        <div className="card-title"><strong>Captura de tela</strong><span>{captureState}</span></div>
        <p className="empty-state">{captureMessage[captureState] ?? captureMessage.idle}</p>
        <div className="move-actions">
          {captureState === 'active' ? <button onClick={() => { stopTracking(); stopCapture() }}>Encerrar captura</button> : <button className="primary" onClick={() => void startCapture()}>Compartilhar tela</button>}
        </div>

        {captureState === 'active' && <>
          <label>Orientação <select value={orientation} onChange={(event) => setOrientation(event.target.value as Color)} disabled={tracking}><option value="w">Brancas embaixo</option><option value="b">Pretas embaixo</option></select></label>
          <p className="empty-state">{calibrationHint(corners.length, calibrated)}</p>
          <div className="move-actions">
            <button onClick={resetCorners} disabled={tracking || !corners.length}>Recalibrar</button>
            {!tracking ? <button className="primary" onClick={startTracking} disabled={!calibrated}>Iniciar reconhecimento</button> : <button onClick={stopTracking}>Pausar reconhecimento</button>}
          </div>
        </>}

        <div className="screen-status"><strong>Status</strong><p>{status}</p></div>

        {promotionGroup && <div className="screen-resolve">
          <strong>Promoção detectada — confirme a peça:</strong>
          <div className="move-actions">{PROMOTION_PIECES.map(({ piece, label }) => {
            const match = promotionGroup.find((m) => m.move.promotion === piece)
            return match ? <button key={piece} onClick={() => resolveMove(match.move)}>{label}</button> : null
          })}</div>
        </div>}

        {genericAmbiguous && <div className="screen-resolve">
          <strong>Confirme o lance jogado:</strong>
          <div className="move-actions">{genericAmbiguous.map((match) => <button key={`${match.move.from}${match.move.to}${match.move.promotion ?? ''}`} onClick={() => resolveMove(match.move)}>{match.move.san}</button>)}</div>
        </div>}

        {unresolved && <div className="screen-resolve">
          <strong>Selecione o lance jogado:</strong>
          <div className="move-actions screen-manual-grid">{legalMoves.map((move) => <button key={`${move.from}${move.to}${move.promotion ?? ''}`} onClick={() => resolveMove(move)}>{move.san}</button>)}</div>
        </div>}

        {tracking && (ambiguous || unresolved) && <div className="move-actions"><button onClick={ignoreNoise}>Ignorar (não houve lance)</button></div>}
        {historyRef.current.length > 0 && <div className="move-actions"><button onClick={undoLast}>Desfazer último lance detectado</button></div>}

        <div className="screen-board-preview"><ChessBoard game={new Chess(fen)} orientation={orientation} pieceSet={pieceSet} ariaLabel="Posição reconhecida" showCoordinates /></div>

        <div className="card-title"><strong>Recomendação do Stockfish</strong>{thinking && <span className="mini-loader" />}</div>
        {engineError && <p className="empty-state">{engineError}</p>}
        {!engine && <p className="empty-state">Engine indisponível.</p>}
        {engine && bestSan ? <div><strong>{bestSan}</strong><span> {displayEval(scoreOf(analysis!))}</span></div> : <p className="empty-state">Aguardando lances para recomendar.</p>}
      </aside>
    </section>
  </main>
}
