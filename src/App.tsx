import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { StockfishEngine, type EngineAnalysis } from './engine'
import './styles.css'
import './enhancements.css'

const PIECES: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
}
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const
const ALL_SQUARES = RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}` as Square))
const STORAGE_KEY = 'xadrez-dev-session-v2'
const PROMOTIONS: Array<{ piece: PieceSymbol; label: string }> = [
  { piece: 'q', label: 'Dama' }, { piece: 'r', label: 'Torre' },
  { piece: 'b', label: 'Bispo' }, { piece: 'n', label: 'Cavalo' },
]

type LastMove = { from: Square; to: Square } | null
type PendingPromotion = { from: Square; to: Square } | null
type Mode = 'coach' | 'analysis'
type AnalysisOptions = { mode?: Mode; depth?: number; multiPv?: number }
type ReviewMove = {
  ply: number
  san: string
  actual: string
  best: string
  bestSan: string
  loss: number
  label: string
  eval: number
  fenBefore: string
  fenAfter: string
  ideas: string[]
}
type SessionSnapshot = {
  pgn: string
  fen: string
  side: Color
  mode: Mode
  depth: number
  multiPv: number
}

function cloneGame(source: Chess) {
  const clone = new Chess()
  const pgn = source.pgn()
  if (pgn && source.history().length) {
    clone.loadPgn(pgn)
    return clone
  }
  return new Chess(source.fen())
}

function uciToMove(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: (uci[4] || 'q') as PieceSymbol }
}

function scoreOf(analysis: EngineAnalysis) {
  const line = analysis.lines[0]
  if (!line) return 0
  if (line.mate !== null) return Math.sign(line.mate) * (10000 - Math.min(99, Math.abs(line.mate)))
  return line.scoreCp ?? 0
}
function scoreForSide(whiteScore: number, side: Color) { return side === 'w' ? whiteScore : -whiteScore }
function displayEval(cp: number) {
  if (Math.abs(cp) > 9000) return cp > 0 ? 'M+' : 'M−'
  const pawns = cp / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`
}
function classify(loss: number, isBest: boolean) {
  if (isBest) return 'Melhor lance'
  if (loss <= 20) return 'Excelente'
  if (loss <= 55) return 'Bom'
  if (loss <= 110) return 'Imprecisão'
  if (loss <= 240) return 'Erro'
  return 'Erro grave'
}
function displayedSquares(side: Color) {
  const files = side === 'w' ? [...FILES] : [...FILES].reverse()
  const ranks = side === 'w' ? [...RANKS] : [...RANKS].reverse()
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square))
}
function isLightSquare(square: Square) {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number])
  return (file + Number(square[1])) % 2 === 0
}
function findCheckedKing(game: Chess): Square | null {
  if (!game.inCheck()) return null
  for (const square of ALL_SQUARES) {
    const piece = game.get(square)
    if (piece?.type === 'k' && piece.color === game.turn()) return square
  }
  return null
}
function gameResult(game: Chess) {
  if (!game.isGameOver()) return null
  if (game.isCheckmate()) return game.turn() === 'w' ? 'Pretas venceram por xeque-mate.' : 'Brancas venceram por xeque-mate.'
  if (game.isStalemate()) return 'Empate por afogamento.'
  if (game.isThreefoldRepetition()) return 'Empate por repetição tripla.'
  if (game.isInsufficientMaterial()) return 'Empate por material insuficiente.'
  if (game.isDrawByFiftyMoves()) return 'Empate pela regra dos 50 lances.'
  return 'Partida encerrada em empate.'
}
function resultTitle(game: Chess) {
  if (game.isCheckmate()) return 'XEQUE-MATE'
  if (game.isStalemate()) return 'AFOGAMENTO'
  if (game.isThreefoldRepetition()) return 'REPETIÇÃO TRIPLA'
  if (game.isInsufficientMaterial()) return 'MATERIAL INSUFICIENTE'
  if (game.isDrawByFiftyMoves()) return 'REGRA DOS 50 LANCES'
  return 'FIM DE PARTIDA'
}
function moveToSan(game: Chess, uci: string) {
  if (!uci || uci === '(none)') return '—'
  const probe = cloneGame(game)
  try { return probe.move(uciToMove(uci)).san } catch { return uci }
}
function tacticalIdeas(game: Chess, uci: string) {
  if (!uci || uci === '(none)') return []
  const probe = cloneGame(game)
  let move: Move
  try { move = probe.move(uciToMove(uci)) } catch { return [] }
  const ideas: string[] = []
  if (move.isCapture()) ideas.push('ganho de material / captura')
  if (probe.isCheckmate()) ideas.push('xeque-mate')
  else if (probe.inCheck()) ideas.push('xeque e ganho de tempo')
  if (move.isPromotion()) ideas.push('promoção de peão')
  if (move.isKingsideCastle() || move.isQueensideCastle()) ideas.push('segurança do rei')
  if (['d4', 'd5', 'e4', 'e5'].includes(move.to)) ideas.push('controle do centro')
  if (['n', 'b'].includes(move.piece) && ['1', '8'].includes(move.from[1])) ideas.push('desenvolvimento de peça')
  if (move.piece === 'q' && move.isCapture()) ideas.push('atividade da dama')
  if (!ideas.length) ideas.push('coordenação e melhora posicional')
  return ideas
}
function explainMove(game: Chess, uci: string) {
  return `${moveToSan(game, uci)}: ${tacticalIdeas(game, uci).join('; ')}.`
}
function pvToSan(fen: string, pv: string[]) {
  const game = new Chess(fen)
  const san: string[] = []
  for (const uci of pv.slice(0, 8)) {
    try { san.push(game.move(uciToMove(uci)).san) } catch { break }
  }
  return san.join(' ')
}
function terminalScore(game: Chess, side: Color) {
  if (!game.isGameOver() || !game.isCheckmate()) return 0
  const winner: Color = game.turn() === 'w' ? 'b' : 'w'
  return winner === side ? 10000 : -10000
}
function mateMessage(analysis: EngineAnalysis | null, perspective: Color, mode: Mode) {
  const mate = analysis?.lines[0]?.mate
  if (mate === null || mate === undefined || mate === 0) return null
  const relative = scoreForSide(mate, perspective)
  if (mode === 'analysis') return relative > 0 ? `Brancas têm mate em ${Math.abs(relative)}` : `Pretas têm mate em ${Math.abs(relative)}`
  return relative > 0 ? `Você tem mate em ${Math.abs(relative)}` : `Atenção: o adversário ameaça mate em ${Math.abs(relative)}`
}
function squareCenter(square: Square, side: Color) {
  const fileIndex = FILES.indexOf(square[0] as (typeof FILES)[number])
  const rank = Number(square[1])
  const col = side === 'w' ? fileIndex : 7 - fileIndex
  const row = side === 'w' ? 8 - rank : rank - 1
  return { x: (col + 0.5) * 12.5, y: (row + 0.5) * 12.5 }
}
function gameAtPly(source: Chess, ply: number) {
  const copy = cloneGame(source)
  for (let index = copy.history().length; index > ply; index -= 1) copy.undo()
  return copy
}
function lastMoveOf(game: Chess): LastMove {
  const latest = game.history({ verbose: true }).at(-1)
  return latest ? { from: latest.from, to: latest.to } : null
}
function downloadText(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const gameRef = useRef(new Chess())
  const engineRef = useRef<StockfishEngine | null>(null)
  const requestRef = useRef(0)
  const sessionRef = useRef(0)
  const [playerSide, setPlayerSide] = useState<Color | null>(null)
  const [mode, setMode] = useState<Mode>('coach')
  const [fen, setFen] = useState(gameRef.current.fen())
  const [selected, setSelected] = useState<Square | null>(null)
  const [lastMove, setLastMove] = useState<LastMove>(null)
  const [analysis, setAnalysis] = useState<EngineAnalysis | null>(null)
  const [thinking, setThinking] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [showHint, setShowHint] = useState(true)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion>(null)
  const [review, setReview] = useState<ReviewMove[]>([])
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [selectedReviewPly, setSelectedReviewPly] = useState<number | null>(null)
  const [showGameOver, setShowGameOver] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [importText, setImportText] = useState('')
  const [depth, setDepth] = useState(14)
  const [multiPv, setMultiPv] = useState(3)
  const [savedSession, setSavedSession] = useState(false)
  const [puzzleIndex, setPuzzleIndex] = useState<number | null>(null)

  const liveGame = useMemo(() => cloneGame(gameRef.current), [fen])
  const history = liveGame.history()
  const displayedGame = useMemo(() => viewPly === null ? liveGame : gameAtPly(liveGame, viewPly), [liveGame, viewPly])
  const orientation = playerSide ?? 'w'
  const boardSquares = useMemo(() => displayedSquares(orientation), [orientation])
  const checkedKing = findCheckedKing(displayedGame)
  const result = gameResult(liveGame)
  const legalMoves = useMemo(() => selected && viewPly === null ? liveGame.moves({ square: selected, verbose: true }) : [], [liveGame, selected, viewPly])
  const legalTargets = useMemo(() => new Set(legalMoves.map((move) => move.to)), [legalMoves])
  const recommendationActive = Boolean(playerSide && (mode === 'analysis' || liveGame.turn() === playerSide))
  const bestMove = recommendationActive ? analysis?.bestMove : undefined
  const hintFrom = showHint && bestMove ? bestMove.slice(0, 2) as Square : null
  const hintTo = showHint && bestMove ? bestMove.slice(2, 4) as Square : null
  const perspective: Color = mode === 'analysis' ? 'w' : (playerSide ?? 'w')
  const userEval = analysis ? scoreForSide(scoreOf(analysis), perspective) : 0
  const boardLocked = reviewing || liveGame.isGameOver() || !playerSide || viewPly !== null
  const mateAlert = mateMessage(analysis, perspective, mode)
  const selectedReview = review.find((row) => row.ply === selectedReviewPly) ?? null
  const puzzles = review.filter((row) => row.label === 'Erro' || row.label === 'Erro grave')
  const activePuzzle = puzzleIndex === null ? null : puzzles[puzzleIndex] ?? null

  useEffect(() => {
    const engine = new StockfishEngine()
    engineRef.current = engine
    setSavedSession(Boolean(localStorage.getItem(STORAGE_KEY)))
    return () => { requestRef.current += 1; engine.destroy() }
  }, [])

  useEffect(() => {
    if (!playerSide) return
    const snapshot: SessionSnapshot = { pgn: gameRef.current.pgn(), fen: gameRef.current.fen(), side: playerSide, mode, depth, multiPv }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    setSavedSession(true)
  }, [fen, playerSide, mode, depth, multiPv])

  useEffect(() => {
    if (liveGame.isGameOver()) setShowGameOver(true)
  }, [fen, liveGame])

  function commitGame(next: Chess, move: LastMove) {
    gameRef.current = next
    setFen(next.fen())
    setLastMove(move)
    setAnalysis(null)
    setThinking(false)
    setSelected(null)
    setPendingPromotion(null)
    setViewPly(null)
    setPuzzleIndex(null)
  }

  async function analyzePosition(position: Chess, side: Color, session: number, options: AnalysisOptions = {}) {
    const engine = engineRef.current
    if (!engine || position.isGameOver()) { setAnalysis(null); setThinking(false); return }
    const effectiveMode = options.mode ?? mode
    const effectiveDepth = options.depth ?? depth
    const effectiveMultiPv = options.multiPv ?? multiPv
    const expectedFen = position.fen()
    const requestId = ++requestRef.current
    engine.stop(); setThinking(true); setEngineError(null); setAnalysis(null)
    try {
      const response = await engine.analyze(expectedFen, effectiveDepth, effectiveMode === 'analysis' || position.turn() === side ? effectiveMultiPv : 1)
      if (requestRef.current !== requestId || sessionRef.current !== session || gameRef.current.fen() !== expectedFen) return
      setAnalysis(response)
    } catch (error) {
      if (requestRef.current !== requestId || sessionRef.current !== session) return
      setEngineError(error instanceof Error ? error.message : 'Não foi possível analisar a posição.')
    } finally { if (requestRef.current === requestId) setThinking(false) }
  }

  function startWithSide(side: Color, nextMode: Mode = 'coach') {
    sessionRef.current += 1; requestRef.current += 1; engineRef.current?.stop()
    const next = new Chess()
    gameRef.current = next; setPlayerSide(side); setMode(nextMode); setFen(next.fen())
    setSelected(null); setLastMove(null); setAnalysis(null); setReview([]); setEngineError(null)
    setPendingPromotion(null); setThinking(false); setViewPly(null); setSelectedReviewPly(null); setShowGameOver(false)
    void analyzePosition(next, side, sessionRef.current, { mode: nextMode })
  }

  function leaveToSetup() {
    sessionRef.current += 1; requestRef.current += 1; engineRef.current?.stop()
    setThinking(false); setAnalysis(null); setPlayerSide(null); setShowTools(false); setShowGameOver(false)
  }

  function executeMove(from: Square, to: Square, promotion?: PieceSymbol) {
    if (boardLocked) return
    const current = cloneGame(gameRef.current)
    const piece = current.get(from)
    if (!piece || piece.color !== current.turn()) return
    const candidates = current.moves({ square: from, verbose: true }).filter((move) => move.to === to)
    if (!candidates.length) { setSelected(null); return }
    if (!promotion && candidates.some((move) => Boolean(move.promotion))) { setPendingPromotion({ from, to }); return }
    try {
      const move = current.move({ from, to, promotion })
      requestRef.current += 1; engineRef.current?.stop(); setReview([]); setSelectedReviewPly(null)
      commitGame(current, { from: move.from, to: move.to })
      if (playerSide && !current.isGameOver()) void analyzePosition(current, playerSide, sessionRef.current)
    } catch { setSelected(null) }
  }

  function clickSquare(square: Square) {
    if (boardLocked) return
    const current = gameRef.current
    const piece = current.get(square)
    if (!selected) { if (piece?.color === current.turn()) setSelected(square); return }
    if (piece?.color === current.turn()) { setSelected(square); return }
    executeMove(selected, square)
  }
  function dragStart(square: Square, event: React.DragEvent) {
    if (boardLocked || gameRef.current.get(square)?.color !== gameRef.current.turn()) { event.preventDefault(); return }
    setSelected(square); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', square)
  }
  function dropOnSquare(square: Square, event: React.DragEvent) {
    event.preventDefault(); if (boardLocked) return
    const from = event.dataTransfer.getData('text/plain') as Square
    if (from && ALL_SQUARES.includes(from)) executeMove(from, square)
  }
  function undoMove() {
    if (reviewing || !history.length || !playerSide) return
    sessionRef.current += 1; requestRef.current += 1; engineRef.current?.stop()
    const next = cloneGame(gameRef.current); next.undo()
    commitGame(next, lastMoveOf(next))
    setReview([]); setEngineError(null); setShowGameOver(false)
    void analyzePosition(next, playerSide, sessionRef.current)
  }
  function resetGame() { if (playerSide) startWithSide(playerSide, mode) }

  function replacePosition(next: Chess) {
    sessionRef.current += 1; requestRef.current += 1; engineRef.current?.stop()
    commitGame(next, lastMoveOf(next)); setReview([]); setSelectedReviewPly(null); setEngineError(null); setShowTools(false); setShowGameOver(next.isGameOver())
    if (playerSide && !next.isGameOver()) void analyzePosition(next, playerSide, sessionRef.current)
  }
  function loadPgn() {
    try { const next = new Chess(); next.loadPgn(importText.trim()); replacePosition(next) }
    catch { setEngineError('PGN inválido ou incompatível.') }
  }
  function loadFenValue(value: string) {
    try { replacePosition(new Chess(value.trim())) }
    catch { setEngineError('FEN inválido.') }
  }
  function loadFen() { loadFenValue(importText) }
  function openPuzzlePosition(fenValue: string) {
    setImportText(fenValue)
    setShowTools(true)
  }
  function restoreSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return
      const saved = JSON.parse(raw) as SessionSnapshot
      if (!saved.side || !['w', 'b'].includes(saved.side) || !['coach', 'analysis'].includes(saved.mode)) throw new Error('Sessão inválida')
      const restoredDepth = Number.isFinite(saved.depth) ? Math.max(10, Math.min(20, saved.depth)) : 14
      const restoredMultiPv = Number.isFinite(saved.multiPv) ? Math.max(1, Math.min(5, saved.multiPv)) : 3
      let next = new Chess()
      if (saved.pgn) next.loadPgn(saved.pgn); else next = new Chess(saved.fen)
      sessionRef.current += 1; requestRef.current += 1; engineRef.current?.stop()
      gameRef.current = next; setPlayerSide(saved.side); setMode(saved.mode); setDepth(restoredDepth); setMultiPv(restoredMultiPv)
      setFen(next.fen()); setLastMove(lastMoveOf(next)); setAnalysis(null); setThinking(false); setReview([]); setSelectedReviewPly(null); setViewPly(null); setEngineError(null); setShowGameOver(next.isGameOver())
      if (!next.isGameOver()) void analyzePosition(next, saved.side, sessionRef.current, { mode: saved.mode, depth: restoredDepth, multiPv: restoredMultiPv })
    } catch {
      localStorage.removeItem(STORAGE_KEY); setSavedSession(false); setEngineError('A sessão salva estava inválida e foi descartada.')
    }
  }

  async function reviewGame() {
    const engine = engineRef.current; const side = playerSide; const source = cloneGame(gameRef.current)
    if (!engine || !side || !source.history().length || reviewing) return
    requestRef.current += 1; engine.stop(); setThinking(false); setReviewing(true); setReview([]); setEngineError(null)
    const replay = gameAtPly(source, 0)
    const moves = source.history({ verbose: true }); const rows: ReviewMove[] = []
    try {
      for (let index = 0; index < moves.length; index += 1) {
        const move = moves[index]; const mover = replay.turn(); const actual = `${move.from}${move.to}${move.promotion ?? ''}`
        if (mover !== side && mode === 'coach') { replay.move({ from: move.from, to: move.to, promotion: move.promotion }); continue }
        const fenBefore = replay.fen(); const before = await engine.analyze(fenBefore, Math.max(10, depth - 3), 1)
        const best = before.bestMove; const bestSan = moveToSan(replay, best); const beforeScore = scoreForSide(scoreOf(before), mover)
        replay.move({ from: move.from, to: move.to, promotion: move.promotion })
        const afterScore = replay.isGameOver() ? terminalScore(replay, mover) : scoreForSide(scoreOf(await engine.analyze(replay.fen(), Math.max(10, depth - 3), 1)), mover)
        const loss = Math.max(0, Math.round(beforeScore - afterScore))
        rows.push({ ply: index + 1, san: move.san, actual, best, bestSan, loss, label: classify(loss, actual === best), eval: afterScore, fenBefore, fenAfter: replay.fen(), ideas: tacticalIdeas(new Chess(fenBefore), best) })
        setReview([...rows])
      }
    } catch (error) { setEngineError(error instanceof Error ? error.message : 'A revisão não pôde ser concluída.') }
    finally { setReviewing(false); if (playerSide && !gameRef.current.isGameOver()) void analyzePosition(gameRef.current, playerSide, sessionRef.current) }
  }

  const accuracy = review.length ? Math.max(0, Math.round(100 - review.reduce((sum, row) => sum + Math.min(row.loss, 400), 0) / review.length / 4)) : null
  const qualityCounts = review.reduce<Record<string, number>>((acc, row) => { acc[row.label] = (acc[row.label] ?? 0) + 1; return acc }, {})
  const bestSan = bestMove ? moveToSan(liveGame, bestMove) : null
  const lastSan = history.at(-1) ?? '—'

  if (!playerSide) {
    return <main className="setup-shell"><section className="setup-card">
      <div className="brand-mark">XS</div><span className="eyebrow">STOCKFISH 18 · LOCAL</span><h1>Xadrez Studio</h1>
      <p>Escolha como quer usar o tabuleiro. Todo o processamento continua local no navegador.</p>
      <div className="side-options">
        <button className="side-option white-option" onClick={() => startWithSide('w')}><span className="side-piece">♔</span><strong>Jogar com brancas</strong><small>Análise focada na perspectiva das brancas.</small></button>
        <button className="side-option black-option" onClick={() => startWithSide('b')}><span className="side-piece">♚</span><strong>Jogar com pretas</strong><small>Análise focada na perspectiva das pretas.</small></button>
      </div>
      <button className="analysis-start" onClick={() => startWithSide('w', 'analysis')}>Modo análise livre · ambos os lados</button>
      {savedSession && <button className="restore-button" onClick={restoreSession}>Restaurar última sessão</button>}
      {engineError && <div className="error-banner"><strong>Sessão:</strong> {engineError}</div>}
      <div className="setup-note">Sem LLM, API paga ou adversário obrigatório.</div>
    </section></main>
  }

  const topLabel = orientation === 'w' ? 'Pretas' : 'Brancas'
  const bottomLabel = orientation === 'w' ? 'Brancas' : 'Pretas'
  const arrowFrom = hintFrom ? squareCenter(hintFrom, orientation) : null
  const arrowTo = hintTo ? squareCenter(hintTo, orientation) : null

  return <main className="app-shell">
    <header className="topbar"><div className="brand-block"><div className="brand-mark small">XS</div><div><span className="eyebrow">ANÁLISE LOCAL</span><h1>Xadrez Studio</h1></div></div>
      <div className="top-actions"><button className="ghost-button" onClick={() => setShowTools(true)}>PGN / FEN</button><button className="ghost-button" onClick={leaveToSetup}>Trocar modo</button><div className={`engine-status ${engineError ? 'error' : ''}`}><span className={thinking || reviewing ? 'pulse' : 'dot'} />{engineError ? 'Falha na engine' : reviewing ? 'Revisando partida' : thinking ? 'Calculando' : 'Engine pronta'}</div></div>
    </header>
    {engineError && <div className="error-banner"><strong>Stockfish:</strong> {engineError}</div>}
    {mateAlert && !result && <div className="mate-alert">{mateAlert}</div>}

    <section className="game-layout"><div className="board-column">
      <div className="player-row opponent-row"><div><span className="player-dot opponent" /><strong>{topLabel}</strong></div><span>{mode === 'analysis' ? 'análise livre' : 'adversário'}</span></div>
      <div className="board-frame">
        <div className="board" role="grid" aria-label={`Tabuleiro orientado pelas ${orientation === 'w' ? 'brancas' : 'pretas'}`}>
          {boardSquares.map((square, index) => {
            const piece = displayedGame.get(square); const target = legalTargets.has(square); const last = viewPly === null && (lastMove?.from === square || lastMove?.to === square)
            const hintedFrom = viewPly === null && hintFrom === square; const hintedTo = viewPly === null && hintTo === square; const row = Math.floor(index / 8); const col = index % 8
            return <button key={square} type="button" className={`square ${isLightSquare(square) ? 'light' : 'dark'} ${selected === square ? 'selected' : ''} ${target ? 'target' : ''} ${last ? 'last-move' : ''} ${checkedKing === square ? (displayedGame.isCheckmate() ? 'checkmated' : 'checked') : ''} ${hintedFrom ? 'hint-from' : ''} ${hintedTo ? 'hint-to' : ''}`} onClick={() => clickSquare(square)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnSquare(square, event)} aria-label={square}>
              {piece && <span className={`piece ${piece.color}`} draggable={!boardLocked && piece.color === liveGame.turn()} onDragStart={(event) => dragStart(square, event)}>{PIECES[`${piece.color}${piece.type}`]}</span>}
              {col === 0 && <span className="coord rank-label">{square[1]}</span>}{row === 7 && <span className="coord file-label">{square[0]}</span>}
            </button>
          })}
          {arrowFrom && arrowTo && viewPly === null && <svg className="hint-arrow" viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="arrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><polygon points="0 0, 5 2.5, 0 5" /></marker></defs><line x1={arrowFrom.x} y1={arrowFrom.y} x2={arrowTo.x} y2={arrowTo.y} markerEnd="url(#arrowhead)" /></svg>}
        </div>
        {reviewing && <div className="board-overlay"><span className="spinner" /><strong>Analisando seus lances</strong></div>}
      </div>
      <div className="player-row my-row"><div><span className="player-dot mine" /><strong>{bottomLabel}</strong></div><span>{mode === 'analysis' ? 'ambos os lados analisados' : (liveGame.turn() === playerSide ? 'sua recomendação está ativa' : 'aguardando o adversário')}</span></div>
      <div className={`turn-banner ${result ? 'finished' : ''}`}><div><span className={`turn-chip ${result ? 'finished' : recommendationActive ? 'mine' : 'opponent'}`}>{result ? 'PARTIDA ENCERRADA' : recommendationActive ? 'ANÁLISE ATIVA' : 'ADVERSÁRIO'}</span><strong>{result ?? (recommendationActive ? 'Faça o lance recomendado ou escolha outra jogada.' : `Mova manualmente as ${liveGame.turn() === 'w' ? 'brancas' : 'pretas'}.`)}</strong></div><span>{viewPly !== null ? `Revendo lance ${viewPly}/${history.length}` : liveGame.turn() === 'w' ? 'Brancas jogam' : 'Pretas jogam'}</span></div>
      <div className="history-controls"><button onClick={() => setViewPly(0)} disabled={!history.length}>⏮</button><button onClick={() => setViewPly((value) => Math.max(0, (value ?? history.length) - 1))} disabled={!history.length}>←</button><span>{viewPly === null ? 'posição atual' : `${viewPly}/${history.length}`}</span><button onClick={() => setViewPly((value) => Math.min(history.length, (value ?? history.length) + 1))} disabled={!history.length || viewPly === null}>→</button><button onClick={() => setViewPly(null)} disabled={viewPly === null}>⏭</button></div>
      <div className="actions"><button onClick={resetGame}>Nova partida</button><button onClick={undoMove} disabled={!history.length || reviewing}>Desfazer lance</button><button className="primary" onClick={() => setShowHint((value) => !value)}>{showHint ? 'Ocultar dica' : 'Mostrar dica'}</button></div>
    </div>

    <aside className="coach-panel">
      <section className="eval-card"><div className="card-heading"><div><span className="section-label">AVALIAÇÃO {mode === 'analysis' ? 'DAS BRANCAS' : 'DO SEU LADO'}</span><strong className="big-eval">{analysis ? displayEval(userEval) : '—'}</strong></div><span className="side-badge">{mode === 'analysis' ? 'Livre' : playerSide === 'w' ? 'Brancas' : 'Pretas'}</span></div><div className="eval-track"><div className="eval-fill" style={{ width: `${Math.max(4, Math.min(96, 50 + userEval / 20))}%` }} /></div>{mateAlert ? <small className="mate-inline">{mateAlert}</small> : <small>Positivo significa vantagem para a perspectiva exibida.</small>}</section>
      <section className={`card recommendation-card ${recommendationActive ? 'active' : ''}`}><div className="card-title"><span className="section-label">MELHOR JOGADA</span>{thinking && <span className="mini-loader" />}</div>{recommendationActive ? <>{bestMove ? <><div className="move-hero"><b>{bestSan}</b><span className="uci-move">{bestMove.slice(0, 2)} → {bestMove.slice(2, 4)}</span></div><p>{explainMove(liveGame, bestMove)}</p><div className="idea-tags">{tacticalIdeas(liveGame, bestMove).map((idea) => <span key={idea}>{idea}</span>)}</div></> : <span className="muted">Calculando…</span>}</> : <div className="waiting-coach"><strong>Primeiro mova o adversário</strong><p>A engine recalcula a melhor resposta após o lance.</p></div>}</section>
      <section className="card"><div className="card-title"><strong>Linhas candidatas</strong><span>Top {multiPv}</span></div><div className="lines">{recommendationActive && analysis?.lines.length ? analysis.lines.map((line) => { const score = line.mate !== null ? scoreForSide(Math.sign(line.mate) * 10000, perspective) : scoreForSide(line.scoreCp ?? 0, perspective); return <div className="line" key={line.multipv}><b>{line.multipv}</b><code>{pvToSan(liveGame.fen(), line.pv)}</code><span>{line.mate !== null ? `${score > 0 ? 'M+' : 'M−'}${Math.abs(line.mate)}` : displayEval(score)}</span></div> }) : <div className="empty-state">Sem variantes nesta posição.</div>}</div></section>
      <section className="card engine-settings"><div className="card-title"><strong>Força da análise</strong><span>local</span></div><label>Profundidade <b>{depth}</b><input type="range" min="10" max="20" value={depth} onChange={(e) => setDepth(Number(e.target.value))} /></label><label>Variantes <b>{multiPv}</b><input type="range" min="1" max="5" value={multiPv} onChange={(e) => setMultiPv(Number(e.target.value))} /></label><button onClick={() => analyzePosition(liveGame, playerSide, sessionRef.current)} disabled={thinking || liveGame.isGameOver()}>Recalcular</button></section>
      <section className="card moves-card"><div className="card-title"><strong>Partida</strong><span>{history.length} meios-lances</span></div><div className="move-list">{Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => <div key={index}><b>{index + 1}.</b><button onClick={() => setViewPly(index * 2 + 1)}>{history[index * 2] ?? ''}</button><button onClick={() => setViewPly(index * 2 + 2)}>{history[index * 2 + 1] ?? ''}</button></div>)}{!history.length && <div className="empty-state">Nenhum lance registrado.</div>}</div><div className="move-actions"><button className="review-button" onClick={reviewGame} disabled={!history.length || reviewing}>Analisar lances</button><button onClick={() => downloadText('partida.pgn', liveGame.pgn(), 'application/x-chess-pgn')}>Exportar PGN</button></div></section>
    </aside></section>

    {review.length > 0 && <section className="review-section"><div className="review-header"><div><span className="eyebrow">PÓS-PARTIDA</span><h2>Revisão interativa</h2></div><div className="accuracy"><span>Precisão estimada</span><strong>{accuracy}%</strong></div></div>
      <div className="quality-summary">{Object.entries(qualityCounts).map(([label, count]) => <span key={label}><b>{count}</b> {label}</span>)}</div>
      <div className="eval-chart"><svg viewBox="0 0 600 120" preserveAspectRatio="none"><line x1="0" y1="60" x2="600" y2="60" /><polyline points={review.map((row, index) => `${review.length === 1 ? 300 : index * (600 / (review.length - 1))},${Math.max(5, Math.min(115, 60 - row.eval / 25))}`).join(' ')} /></svg></div>
      <div className="review-grid">{review.map((row) => <button className={`review-row ${selectedReviewPly === row.ply ? 'selected-review' : ''}`} key={row.ply} onClick={() => { setSelectedReviewPly(row.ply); setViewPly(row.ply) }}><div className="move-number">{Math.ceil(row.ply / 2)}{row.ply % 2 === 0 ? '…' : '.'}</div><div><strong>{row.san}</strong><small>{row.actual}</small></div><span className={`quality q-${row.label.toLowerCase().replaceAll(' ', '-')}`}>{row.label}</span><div><small>melhor</small><code>{row.bestSan}</code></div><div><small>perda</small><strong>{row.loss} cp</strong></div><div><small>avaliação</small><strong>{displayEval(row.eval)}</strong></div></button>)}</div>
      {selectedReview && <div className="review-detail"><div><span>Seu lance</span><strong>{selectedReview.san}</strong><code>{selectedReview.actual}</code></div><div className="versus">×</div><div><span>Melhor lance</span><strong>{selectedReview.bestSan}</strong><code>{selectedReview.best}</code></div><p>{selectedReview.ideas.join(' · ')}</p></div>}
      {puzzles.length > 0 && <div className="puzzle-lab"><div><span className="eyebrow">TREINO DOS SEUS ERROS</span><h3>{puzzles.length} posição(ões) para praticar</h3></div><button onClick={() => { setPuzzleIndex(0); setViewPly(null) }}>Treinar erros</button>{activePuzzle && <div className="puzzle-card"><strong>Encontre a melhor jogada da posição antes de {activePuzzle.san}</strong><code>{activePuzzle.fenBefore}</code><button onClick={() => openPuzzlePosition(activePuzzle.fenBefore)}>Abrir posição na ferramenta FEN</button><details><summary>Ver solução</summary><b>{activePuzzle.bestSan}</b> · {activePuzzle.ideas.join(', ')}</details><div className="puzzle-nav"><button onClick={() => setPuzzleIndex((value) => Math.max(0, (value ?? 0) - 1))}>Anterior</button><span>{(puzzleIndex ?? 0) + 1}/{puzzles.length}</span><button onClick={() => setPuzzleIndex((value) => Math.min(puzzles.length - 1, (value ?? 0) + 1))}>Próximo</button></div></div>}</div>}
    </section>}

    {showGameOver && result && <div className="modal-backdrop"><div className="gameover-modal" role="dialog" aria-modal="true"><span className="section-label">{resultTitle(liveGame)}</span><div className="mate-symbol">{liveGame.isCheckmate() ? '♚' : '½'}</div><h2>{result}</h2><p>Último lance: <strong>{lastSan}</strong></p><div className="gameover-actions"><button onClick={() => setShowGameOver(false)}>Fechar</button><button onClick={() => { setShowGameOver(false); void reviewGame() }}>Revisar partida</button><button className="primary" onClick={resetGame}>Nova partida</button></div></div></div>}

    {pendingPromotion && <div className="modal-backdrop" onClick={() => setPendingPromotion(null)}><div className="promotion-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><span className="section-label">PROMOÇÃO</span><h2>Escolha a peça</h2><div className="promotion-grid">{PROMOTIONS.map(({ piece, label }) => <button key={piece} onClick={() => executeMove(pendingPromotion.from, pendingPromotion.to, piece)}><span>{PIECES[`${liveGame.turn()}${piece}`]}</span><small>{label}</small></button>)}</div></div></div>}

    {showTools && <div className="modal-backdrop" onClick={() => setShowTools(false)}><div className="tools-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><span className="section-label">IMPORTAR POSIÇÃO / PARTIDA</span><h2>PGN e FEN</h2><textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Cole um PGN completo ou uma posição FEN..." /><div className="tool-actions"><button onClick={loadPgn}>Carregar PGN</button><button onClick={loadFen}>Carregar FEN</button><button onClick={() => setImportText(liveGame.fen())}>Usar FEN atual</button><button onClick={() => navigator.clipboard?.writeText(liveGame.fen())}>Copiar FEN</button></div><small>A importação substitui a posição atual. A sessão é salva automaticamente no navegador.</small></div></div>}
  </main>
}
