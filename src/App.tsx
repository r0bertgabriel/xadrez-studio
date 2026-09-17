import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { boardSvg, openingFor, threatsFor } from './chess-tools'
import { AnalysisCancelledError, type EngineAnalysis } from './engine'
import { classifyReview, cloneGame, displayEval, evaluationForSide, explainMove, mateMessage, moveToSan, reviewLoss, scoreForSide, scoreOf, tacticalIdeas, terminalEvaluation } from './chess-analysis'
import { useChessGame } from './hooks/useChessGame'
import { useStockfish } from './hooks/useStockfish'
import OpeningTrainer from './OpeningTrainer'
import './enhancements.css'
import './styles.css'
import './styles/analysis.css'

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
const PIECE_SET_OPTIONS = [
  { id: 'cburnett', label: 'Cburnett', description: 'Clássico e competitivo' },
  { id: 'merida', label: 'Mérida', description: 'Tradicional e refinado' },
  { id: 'alpha', label: 'Alpha', description: 'Minimalista e técnico' },
  { id: 'chessnut', label: 'Chessnut', description: 'Esculpido e expressivo' },
  { id: 'rhosgfx', label: 'RhosGFX', description: 'Geométrico e nítido' },
  { id: 'fantasy', label: 'Fantasy', description: 'Ilustrado e distinto' },
  { id: 'spatial', label: 'Spatial', description: 'Moderno e volumétrico' },
  { id: 'celtic', label: 'Celtic', description: 'Ornamental e artístico' },
  { id: 'shapes', label: 'Shapes', description: 'Abstrato e direto' },
  { id: 'firi', label: 'Firi', description: 'Vetorial e elegante' },
] as const
const BOARD_THEME_OPTIONS = [
  { id: 'walnut', label: 'Nogueira', description: 'Areia e nogueira' },
  { id: 'oak', label: 'Carvalho', description: 'Creme e musgo' },
  { id: 'graphite', label: 'Grafite', description: 'Pedra e carvão' },
  { id: 'tournament', label: 'Torneio', description: 'Marfim e verde FIDE' },
  { id: 'midnight', label: 'Meia-noite', description: 'Gelo e azul profundo' },
  { id: 'ocean', label: 'Oceano', description: 'Espuma e azul-petróleo' },
  { id: 'burgundy', label: 'Bordô', description: 'Pergaminho e vinho' },
  { id: 'lavender', label: 'Lavanda', description: 'Névoa e violeta' },
  { id: 'espresso', label: 'Espresso', description: 'Creme e café' },
  { id: 'ember', label: 'Brasa', description: 'Cinza e terracota' },
] as const
type PieceSet = (typeof PIECE_SET_OPTIONS)[number]['id']
type BoardTheme = (typeof BOARD_THEME_OPTIONS)[number]['id']
const HINT_STYLE_OPTIONS = [
  { id: 'classic', label: 'Clássica', description: 'Dourada e discreta' },
  { id: 'tactical', label: 'Tática', description: 'Azul elétrico' },
  { id: 'forest', label: 'Floresta', description: 'Verde de confirmação' },
  { id: 'signal', label: 'Sinal', description: 'Coral de alto contraste' },
  { id: 'ghost', label: 'Sutil', description: 'Cinza translúcido' },
] as const
type HintStyle = (typeof HINT_STYLE_OPTIONS)[number]['id']
type FavoriteAppearance = { pieceSet: PieceSet; boardTheme: BoardTheme; hintStyle: HintStyle }
type MarkTool = 'move' | 'arrow' | 'circle'
type ManualArrow = { from: Square; to: Square }
type PerformanceProfile = { games: number; totalAccuracy: number; white: { games: number; accuracy: number }; black: { games: number; accuracy: number } }
const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }
const PREFERENCES_KEY = 'xadrez-studio-board-preferences-v1'
const PERFORMANCE_KEY = 'xadrez-studio-performance-v1'
const EXPORT_THEME_COLORS: Record<BoardTheme, { light: string; dark: string }> = {
  walnut: { light: '#d4bb8b', dark: '#63412f' }, oak: { light: '#d8c99f', dark: '#5d7054' }, graphite: { light: '#aeb7b4', dark: '#404b4a' }, tournament: { light: '#dfd1aa', dark: '#526e48' }, midnight: { light: '#bac8d0', dark: '#152b40' }, ocean: { light: '#a9c8c0', dark: '#22545e' }, burgundy: { light: '#d9c293', dark: '#592934' }, lavender: { light: '#cbc0da', dark: '#5e4d75' }, espresso: { light: '#cfb18a', dark: '#3f291f' }, ember: { light: '#bbbcb4', dark: '#733d33' },
}

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
function pvToSan(fen: string, pv: string[]) {
  const game = new Chess(fen)
  const san: string[] = []
  for (const uci of pv.slice(0, 8)) {
    try {
      const move = { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: (uci[4] || 'q') as PieceSymbol }
      san.push(game.move(move).san)
    } catch { break }
  }
  return san.join(' ')
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
function nextViewPly(value: number | null, historyLength: number): number | null {
  const next = (value ?? historyLength) + 1
  return next >= historyLength ? null : next
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
function pieceAsset(set: PieceSet, color: Color, piece: PieceSymbol) {
  return `/pieces/${set}/${color}${PIECE_NAMES[piece]}.svg`
}
function initialProfile(): PerformanceProfile { return { games: 0, totalAccuracy: 0, white: { games: 0, accuracy: 0 }, black: { games: 0, accuracy: 0 } } }
function downloadBoardPng(svg: string) {
  const image = new Image()
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  image.onload = () => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1200
    const context = canvas.getContext('2d'); context?.drawImage(image, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'posicao.png'; anchor.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
    URL.revokeObjectURL(source)
  }
  image.onerror = () => URL.revokeObjectURL(source)
  image.src = source
}

export default function App() {
  const { gameRef, fen, setFen } = useChessGame()
  const { engineRef, cancelAnalysis } = useStockfish()
  const requestRef = useRef(0)
  const sessionRef = useRef(0)
  const [playerSide, setPlayerSide] = useState<Color | null>(null)
  const [mode, setMode] = useState<Mode>('coach')
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
  const [pieceSet, setPieceSet] = useState<PieceSet>('cburnett')
  const [boardTheme, setBoardTheme] = useState<BoardTheme>('walnut')
  const [hintStyle, setHintStyle] = useState<HintStyle>('classic')
  const [favoriteAppearance, setFavoriteAppearance] = useState<FavoriteAppearance | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [markTool, setMarkTool] = useState<MarkTool>('move')
  const [manualArrowStart, setManualArrowStart] = useState<Square | null>(null)
  const [manualArrows, setManualArrows] = useState<ManualArrow[]>([])
  const [manualCircles, setManualCircles] = useState<Square[]>([])
  const [profile, setProfile] = useState<PerformanceProfile>(initialProfile)
  const [lastReviewedSignature, setLastReviewedSignature] = useState<string | null>(null)
  const [showOpeningTrainer, setShowOpeningTrainer] = useState(false)

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
  const opening = useMemo(() => openingFor(liveGame), [liveGame])
  const tacticalInsights = useMemo(() => threatsFor(liveGame), [liveGame])

  useEffect(() => { setSavedSession(Boolean(localStorage.getItem(STORAGE_KEY))) }, [])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PERFORMANCE_KEY) ?? '') as PerformanceProfile
      if (saved && typeof saved.games === 'number' && saved.white && saved.black) setProfile(saved)
    } catch { /* First session. */ }
  }, [])

  useEffect(() => { localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(profile)) }, [profile])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<FavoriteAppearance & { favoriteAppearance: FavoriteAppearance }>
      if (PIECE_SET_OPTIONS.some((option) => option.id === saved.pieceSet)) setPieceSet(saved.pieceSet!)
      if (BOARD_THEME_OPTIONS.some((option) => option.id === saved.boardTheme)) setBoardTheme(saved.boardTheme!)
      if (HINT_STYLE_OPTIONS.some((option) => option.id === saved.hintStyle)) setHintStyle(saved.hintStyle!)
      if (saved.favoriteAppearance && PIECE_SET_OPTIONS.some((option) => option.id === saved.favoriteAppearance?.pieceSet) && BOARD_THEME_OPTIONS.some((option) => option.id === saved.favoriteAppearance?.boardTheme) && HINT_STYLE_OPTIONS.some((option) => option.id === saved.favoriteAppearance?.hintStyle)) setFavoriteAppearance(saved.favoriteAppearance)
    } catch { /* Preferences are optional. */ }
  }, [])

  useEffect(() => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ pieceSet, boardTheme, hintStyle, favoriteAppearance }))
  }, [pieceSet, boardTheme, hintStyle, favoriteAppearance])

  useEffect(() => {
    if (!playerSide) return
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, button')) return
      if (event.key === 'Escape') { setSelected(null); return }
      if (event.key.toLowerCase() === 'h') { setShowHint((value) => !value); return }
      if (event.key === 'ArrowLeft' && history.length) {
        event.preventDefault(); setViewPly((value) => Math.max(0, (value ?? history.length) - 1))
      }
      if (event.key === 'ArrowRight' && history.length && viewPly !== null) {
        event.preventDefault(); setViewPly((value) => nextViewPly(value, history.length))
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [history.length, playerSide, viewPly])

  useEffect(() => {
    if (!playerSide) return
    const snapshot: SessionSnapshot = { pgn: gameRef.current.pgn(), fen: gameRef.current.fen(), side: playerSide, mode, depth, multiPv }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    setSavedSession(true)
  }, [fen, playerSide, mode, depth, multiPv, gameRef])

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
    setManualArrowStart(null)
  }

  async function analyzePosition(position: Chess, side: Color, session: number, options: AnalysisOptions = {}) {
    const engine = engineRef.current
    if (!engine || position.isGameOver()) { setAnalysis(null); setThinking(false); return }
    const effectiveMode = options.mode ?? mode
    const effectiveDepth = options.depth ?? depth
    const effectiveMultiPv = options.multiPv ?? multiPv
    const expectedFen = position.fen()
    const requestId = ++requestRef.current
    cancelAnalysis(); setThinking(true); setEngineError(null); setAnalysis(null)
    try {
      const response = await engine.analyze(expectedFen, effectiveDepth, effectiveMode === 'analysis' || position.turn() === side ? effectiveMultiPv : 1)
      if (requestRef.current !== requestId || sessionRef.current !== session || gameRef.current.fen() !== expectedFen) return
      setAnalysis(response)
    } catch (error) {
      if (error instanceof AnalysisCancelledError) return
      if (requestRef.current !== requestId || sessionRef.current !== session) return
      setEngineError(error instanceof Error ? error.message : 'Não foi possível analisar a posição.')
    } finally { if (requestRef.current === requestId) setThinking(false) }
  }

  function startWithSide(side: Color, nextMode: Mode = 'coach') {
    sessionRef.current += 1; requestRef.current += 1; cancelAnalysis()
    const next = new Chess()
    gameRef.current = next; setPlayerSide(side); setMode(nextMode); setFen(next.fen())
    setSelected(null); setLastMove(null); setAnalysis(null); setReview([]); setEngineError(null)
    setPendingPromotion(null); setThinking(false); setViewPly(null); setSelectedReviewPly(null); setShowGameOver(false); setManualArrows([]); setManualCircles([]); setMarkTool('move'); setLastReviewedSignature(null)
    const engineReset = engineRef.current?.newGame() ?? Promise.resolve()
    void engineReset.then(
      () => analyzePosition(next, side, sessionRef.current, { mode: nextMode }),
      () => analyzePosition(next, side, sessionRef.current, { mode: nextMode }),
    )
  }

  function leaveToSetup() {
    sessionRef.current += 1; requestRef.current += 1; cancelAnalysis()
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
      requestRef.current += 1; cancelAnalysis(); setReview([]); setSelectedReviewPly(null)
      commitGame(current, { from: move.from, to: move.to })
      if (playerSide && !current.isGameOver()) void analyzePosition(current, playerSide, sessionRef.current)
    } catch { setSelected(null) }
  }
  function playBookMove(san: string) {
    if (boardLocked) return
    const current = cloneGame(gameRef.current)
    try {
      const move = current.move(san)
      requestRef.current += 1; cancelAnalysis(); setReview([]); setSelectedReviewPly(null)
      commitGame(current, { from: move.from, to: move.to })
      if (playerSide && !current.isGameOver()) void analyzePosition(current, playerSide, sessionRef.current)
    } catch { setEngineError('Esse lance do livro não está disponível nesta posição.') }
  }

  function clickSquare(square: Square) {
    if (markTool === 'circle') {
      setManualCircles((circles) => circles.includes(square) ? circles.filter((item) => item !== square) : [...circles, square])
      return
    }
    if (markTool === 'arrow') {
      if (!manualArrowStart) { setManualArrowStart(square); return }
      if (manualArrowStart !== square) setManualArrows((arrows) => [...arrows, { from: manualArrowStart, to: square }])
      setManualArrowStart(null)
      return
    }
    if (boardLocked) return
    const current = gameRef.current
    const piece = current.get(square)
    if (!selected) { if (piece?.color === current.turn()) setSelected(square); return }
    if (piece?.color === current.turn()) { setSelected(square); return }
    executeMove(selected, square)
  }

  function clearAnnotations() {
    setManualArrows([]); setManualCircles([]); setManualArrowStart(null); setMarkTool('move')
  }
  function requestReset() {
    if (history.length && !window.confirm('Iniciar uma nova partida? A posição atual continuará disponível somente na sessão salva.')) return
    resetGame()
  }
  function saveProfile(rows: ReviewMove[]) {
    if (!rows.length || !playerSide) return
    const signature = gameRef.current.pgn()
    if (!signature || signature === lastReviewedSignature) return
    const accuracy = Math.max(0, Math.round(100 - rows.reduce((sum, row) => sum + Math.min(row.loss, 400), 0) / rows.length / 4))
    setProfile((current) => ({
      games: current.games + 1,
      totalAccuracy: current.totalAccuracy + accuracy,
      white: playerSide === 'w' ? { games: current.white.games + 1, accuracy: current.white.accuracy + accuracy } : current.white,
      black: playerSide === 'b' ? { games: current.black.games + 1, accuracy: current.black.accuracy + accuracy } : current.black,
    }))
    setLastReviewedSignature(signature)
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
    sessionRef.current += 1; requestRef.current += 1; cancelAnalysis()
    const next = cloneGame(gameRef.current); next.undo()
    commitGame(next, lastMoveOf(next))
    setReview([]); setEngineError(null); setShowGameOver(false)
    void analyzePosition(next, playerSide, sessionRef.current)
  }
  function resetGame() { if (playerSide) startWithSide(playerSide, mode) }

  function replacePosition(next: Chess) {
    sessionRef.current += 1; requestRef.current += 1; cancelAnalysis()
    commitGame(next, lastMoveOf(next)); setReview([]); setSelectedReviewPly(null); setEngineError(null); setShowTools(false); setShowGameOver(next.isGameOver()); setManualArrows([]); setManualCircles([]); setMarkTool('move'); setLastReviewedSignature(null)
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
      sessionRef.current += 1; requestRef.current += 1; cancelAnalysis()
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
    requestRef.current += 1; cancelAnalysis(); setThinking(false); setReviewing(true); setReview([]); setEngineError(null)
    const replay = gameAtPly(source, 0)
    const moves = source.history({ verbose: true }); const rows: ReviewMove[] = []
    try {
      for (let index = 0; index < moves.length; index += 1) {
        const move = moves[index]; const mover = replay.turn(); const actual = `${move.from}${move.to}${move.promotion ?? ''}`
        if (mover !== side && mode === 'coach') { replay.move({ from: move.from, to: move.to, promotion: move.promotion }); continue }
        const fenBefore = replay.fen(); const before = await engine.analyze(fenBefore, Math.max(10, depth - 3), 1)
        const best = before.bestMove; const bestSan = moveToSan(replay, best); const beforeEval = evaluationForSide(before, mover)
        replay.move({ from: move.from, to: move.to, promotion: move.promotion })
        let afterEval
        if (replay.isGameOver()) afterEval = terminalEvaluation(replay, mover)
        else afterEval = evaluationForSide(await engine.analyze(replay.fen(), Math.max(10, depth - 3), 1), mover)
        const loss = reviewLoss(beforeEval, afterEval)
        const afterScore = afterEval.mate !== null ? Math.sign(afterEval.mate) * (10000 - Math.min(99, Math.abs(afterEval.mate))) : (afterEval.cp ?? 0)
        rows.push({ ply: index + 1, san: move.san, actual, best, bestSan, loss, label: classifyReview(loss, actual === best, beforeEval, afterEval), eval: afterScore, fenBefore, fenAfter: replay.fen(), ideas: tacticalIdeas(new Chess(fenBefore), best) })
        setReview([...rows])
      }
      saveProfile(rows)
    } catch (error) {
      if (!(error instanceof AnalysisCancelledError)) setEngineError(error instanceof Error ? error.message : 'A revisão não pôde ser concluída.')
    } finally { setReviewing(false); if (playerSide && !gameRef.current.isGameOver()) void analyzePosition(gameRef.current, playerSide, sessionRef.current) }
  }

  const accuracy = review.length ? Math.max(0, Math.round(100 - review.reduce((sum, row) => sum + Math.min(row.loss, 400), 0) / review.length / 4)) : null
  const qualityCounts = review.reduce<Record<string, number>>((acc, row) => { acc[row.label] = (acc[row.label] ?? 0) + 1; return acc }, {})
  const bestSan = bestMove ? moveToSan(liveGame, bestMove) : null
  const lastSan = history.at(-1) ?? '—'
  const activeTurnLabel = liveGame.turn() === 'w' ? 'Brancas' : 'Pretas'
  const moveNumber = Math.floor(history.length / 2) + 1

  const globalTabs = <nav className="global-tabs" aria-label="Navegação principal">
    <button className={showOpeningTrainer ? '' : 'active'} onClick={() => setShowOpeningTrainer(false)}>Jogar &amp; Analisar</button>
    <button className={showOpeningTrainer ? 'active' : ''} onClick={() => { cancelAnalysis(); setShowOpeningTrainer(true) }}>Professor de Aberturas</button>
  </nav>

  if (showOpeningTrainer) {
    return <>{globalTabs}<OpeningTrainer engine={engineRef.current} pieceSet={pieceSet} /></>
  }

  if (!playerSide) {
    return <>{globalTabs}<main className="setup-shell"><section className="setup-card">
      <div className="brand-mark">XS</div><span className="eyebrow">STOCKFISH 19 · LOCAL</span><h1>Xadrez Studio</h1>
      <p>Escolha como quer usar o tabuleiro. Todo o processamento continua local no navegador.</p>
      <div className="side-options">
        <button className="side-option white-option" onClick={() => startWithSide('w')}><span className="side-piece">♔</span><strong>Jogar com brancas</strong><small>Análise focada na perspectiva das brancas.</small></button>
        <button className="side-option black-option" onClick={() => startWithSide('b')}><span className="side-piece">♚</span><strong>Jogar com pretas</strong><small>Análise focada na perspectiva das pretas.</small></button>
      </div>
      <button className="analysis-start" onClick={() => startWithSide('w', 'analysis')}>Modo análise livre · ambos os lados</button>
      {savedSession && <button className="restore-button" onClick={restoreSession}>Restaurar última sessão</button>}
      {engineError && <div className="error-banner"><strong>Sessão:</strong> {engineError}</div>}
      <div className="setup-note">Sem LLM, API paga ou adversário obrigatório.</div>
    </section></main></>
  }

  const topLabel = orientation === 'w' ? 'Pretas' : 'Brancas'
  const bottomLabel = orientation === 'w' ? 'Brancas' : 'Pretas'
  const arrowFrom = hintFrom ? squareCenter(hintFrom, orientation) : null
  const arrowTo = hintTo ? squareCenter(hintTo, orientation) : null

  return <>{globalTabs}<main className="app-shell">
    <header className="topbar"><div className="brand-block"><div className="brand-mark small">XS</div><div><span className="eyebrow">ANÁLISE LOCAL</span><h1>Xadrez Studio</h1></div></div>
      <div className="top-actions"><div className="session-meta"><span>PARTIDA</span><b>{mode === 'analysis' ? 'ANÁLISE LIVRE' : `LANCE ${moveNumber}`}</b></div><button className="ghost-button" onClick={() => setPanelCollapsed((value) => !value)}>{panelCollapsed ? 'Mostrar painel' : 'Ocultar painel'}</button><button className="ghost-button" onClick={() => setShowTools(true)}>PGN / FEN</button><button className="ghost-button" onClick={leaveToSetup}>Trocar modo</button><div className={`engine-status ${engineError ? 'error' : ''}`} role="status" aria-live="polite"><span className={thinking || reviewing ? 'pulse' : 'dot'} />{engineError ? 'Falha na engine' : reviewing ? 'Revisando partida' : thinking ? 'Calculando' : 'Engine pronta'}</div></div>
    </header>
    {engineError && <div className="error-banner"><strong>Stockfish:</strong> {engineError}</div>}
    {mateAlert && !result && <div className="mate-alert">{mateAlert}</div>}

    <section className={`game-layout ${panelCollapsed ? 'panel-collapsed' : ''}`}><div className="board-column">
      <div className="player-row opponent-row"><div><span className="player-dot opponent" /><strong>{topLabel}</strong></div><span>{mode === 'analysis' ? 'análise livre' : 'adversário'}</span></div>
      <div className={`board-frame board-theme-${boardTheme}`}>
        <div className="board" role="grid" aria-label={`Tabuleiro orientado pelas ${orientation === 'w' ? 'brancas' : 'pretas'}`}>
          {boardSquares.map((square, index) => {
            const piece = displayedGame.get(square); const target = legalTargets.has(square); const last = viewPly === null && (lastMove?.from === square || lastMove?.to === square)
            const hintedFrom = viewPly === null && hintFrom === square; const hintedTo = viewPly === null && hintTo === square; const row = Math.floor(index / 8); const col = index % 8
            return <button key={square} type="button" className={`square ${isLightSquare(square) ? 'light' : 'dark'} ${selected === square ? 'selected' : ''} ${target ? 'target' : ''} ${last ? 'last-move' : ''} ${checkedKing === square ? (displayedGame.isCheckmate() ? 'checkmated' : 'checked') : ''} ${hintedFrom ? 'hint-from' : ''} ${hintedTo ? 'hint-to' : ''}`} onClick={() => clickSquare(square)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnSquare(square, event)} aria-label={square}>
              {piece && <span className={`piece piece-${pieceSet} ${piece.color}`} draggable={!boardLocked && piece.color === liveGame.turn()} onDragStart={(event) => dragStart(square, event)}><img src={pieceAsset(pieceSet, piece.color, piece.type)} alt={PIECES[`${piece.color}${piece.type}`]} draggable={false} /></span>}
              {col === 0 && <span className={`coord rank-label ${isLightSquare(square) ? 'on-light' : 'on-dark'}`} aria-hidden="true">{square[1]}</span>}{row === 7 && <span className={`coord file-label ${isLightSquare(square) ? 'on-light' : 'on-dark'}`} aria-hidden="true">{square[0]}</span>}
            </button>
          })}
          {arrowFrom && arrowTo && viewPly === null && <svg className={`hint-arrow hint-${hintStyle}`} viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="arrowhead" markerWidth="3.8" markerHeight="3.8" refX="3.2" refY="1.9" orient="auto"><polygon points="0 0, 3.8 1.9, 0 3.8" /></marker></defs><line x1={arrowFrom.x} y1={arrowFrom.y} x2={arrowTo.x} y2={arrowTo.y} markerEnd="url(#arrowhead)" /></svg>}
          {(manualArrows.length > 0 || manualCircles.length > 0) && <svg className="manual-annotations" viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="manual-arrowhead" markerWidth="3.8" markerHeight="3.8" refX="3.2" refY="1.9" orient="auto"><polygon points="0 0, 3.8 1.9, 0 3.8" /></marker></defs>{manualArrows.map((arrow, index) => { const from = squareCenter(arrow.from, orientation); const to = squareCenter(arrow.to, orientation); return <line key={`${arrow.from}-${arrow.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#manual-arrowhead)" /> })}{manualCircles.map((square) => { const center = squareCenter(square, orientation); return <circle key={square} cx={center.x} cy={center.y} r="5.2" /> })}</svg>}
        </div>
        {reviewing && <div className="board-overlay"><span className="spinner" /><strong>Analisando seus lances</strong></div>}
      </div>
      <div className="player-row my-row"><div><span className="player-dot mine" /><strong>{bottomLabel}</strong></div><span>{mode === 'analysis' ? 'ambos os lados analisados' : (liveGame.turn() === playerSide ? 'sua recomendação está ativa' : 'aguardando o adversário')}</span></div>
      <div className={`turn-banner ${result ? 'finished' : ''}`} aria-live="polite"><div><span className={`turn-chip ${result ? 'finished' : recommendationActive ? 'mine' : 'opponent'}`}>{result ? 'PARTIDA ENCERRADA' : recommendationActive ? 'ANÁLISE ATIVA' : 'AGUARDANDO'}</span><strong>{result ?? (recommendationActive ? `Sua vez: ${activeTurnLabel} jogam.` : `${activeTurnLabel} jogam.`)}</strong></div><span>{viewPly !== null ? `REVISÃO · ${viewPly}/${history.length}` : thinking ? 'ENGINE CALCULANDO' : `LANCE ${moveNumber}`}</span></div>
      <div className="history-controls" aria-label="Navegação da partida"><button aria-label="Ir para o início" title="Ir para o início" onClick={() => setViewPly(0)} disabled={!history.length}>⏮</button><button aria-label="Lance anterior" title="Lance anterior (←)" onClick={() => setViewPly((value) => Math.max(0, (value ?? history.length) - 1))} disabled={!history.length}>←</button><span>{viewPly === null ? 'POSIÇÃO ATUAL' : `LANCE ${viewPly} DE ${history.length}`}</span><button aria-label="Próximo lance" title="Próximo lance (→)" onClick={() => setViewPly((value) => nextViewPly(value, history.length))} disabled={!history.length || viewPly === null}>→</button><button aria-label="Ir para a posição atual" title="Ir para a posição atual" onClick={() => setViewPly(null)} disabled={viewPly === null}>⏭</button></div>
      <div className="actions"><button onClick={requestReset}>Nova partida</button><button onClick={undoMove} disabled={!history.length || reviewing}>Desfazer lance</button><button className="primary" onClick={() => setShowHint((value) => !value)} title="Atalho: H">{showHint ? 'Ocultar dica' : 'Mostrar dica'} <kbd>H</kbd></button></div>
      <div className="annotation-toolbar"><span>Marcações</span><button className={markTool === 'move' ? 'selected-tool' : ''} onClick={() => { setMarkTool('move'); setManualArrowStart(null) }}>Mover</button><button className={markTool === 'arrow' ? 'selected-tool' : ''} onClick={() => setMarkTool('arrow')}>Seta</button><button className={markTool === 'circle' ? 'selected-tool' : ''} onClick={() => setMarkTool('circle')}>Círculo</button><button onClick={clearAnnotations} disabled={!manualArrows.length && !manualCircles.length}>Limpar</button></div>
      <p className="board-shortcuts"><kbd>←</kbd><kbd>→</kbd> navega pela partida · <kbd>H</kbd> alterna dica · <kbd>Esc</kbd> limpa a seleção</p>
    </div>

    <aside className="coach-panel">
      <section className="eval-card"><div className="card-heading"><div><span className="section-label">AVALIAÇÃO {mode === 'analysis' ? 'DAS BRANCAS' : 'DO SEU LADO'}</span><strong className="big-eval">{analysis ? displayEval(userEval) : '—'}</strong></div><span className="side-badge">{mode === 'analysis' ? 'Livre' : playerSide === 'w' ? 'Brancas' : 'Pretas'}</span></div><div className="eval-track"><div className="eval-fill" style={{ width: `${Math.max(4, Math.min(96, 50 + userEval / 20))}%` }} /></div>{mateAlert ? <small className="mate-inline">{mateAlert}</small> : <small>Positivo significa vantagem para a perspectiva exibida.</small>}</section>
      <section className="card opening-card"><div className="card-title"><strong>Abertura</strong><span>{opening?.eco ?? 'fora do livro'}</span></div>{opening ? <><b>{opening.name}</b><div className="book-moves">{opening.moves.map((move) => <button key={move} onClick={() => playBookMove(move)} disabled={boardLocked}>{move}</button>)}</div></> : <p className="empty-state">O livro local não possui uma continuação catalogada nesta posição.</p>}</section>
      <section className="card opportunities-card"><div className="card-title"><strong>Oportunidades táticas</strong><span>{tacticalInsights.opportunities.length}</span></div>{tacticalInsights.opportunities.length ? <ul>{tacticalInsights.opportunities.map((item, index) => <li className={item.kind} key={`opportunity-${item.text}-${index}`}>{item.text}</li>)}</ul> : <p className="empty-state">Nenhum xeque, captura ou padrão tático relevante disponível para o lado a jogar.</p>}</section>
      <section className="card threats-card"><div className="card-title"><strong>Ameaças reais</strong><span>{tacticalInsights.threats.length}</span></div>{tacticalInsights.threats.length ? <ul>{tacticalInsights.threats.map((item, index) => <li className={item.kind} key={`threat-${item.text}-${index}`}>{item.text}</li>)}</ul> : <p className="empty-state">Nenhuma peça do lado a jogar está sob ameaça real no momento.</p>}</section>
      <section className={`card recommendation-card ${recommendationActive ? 'active' : ''}`}><div className="card-title"><span className="section-label">MELHOR JOGADA</span>{thinking && <span className="mini-loader" />}</div>{recommendationActive ? <>{bestMove ? <><div className="move-hero"><b>{bestSan}</b><span className="uci-move">{bestMove.slice(0, 2)} → {bestMove.slice(2, 4)}</span></div><p>{explainMove(liveGame, bestMove)}</p><div className="idea-tags">{tacticalIdeas(liveGame, bestMove).map((idea) => <span key={idea}>{idea}</span>)}</div></> : <span className="muted">Calculando…</span>}</> : <div className="waiting-coach"><strong>Primeiro mova o adversário</strong><p>A engine recalcula a melhor resposta após o lance.</p></div>}</section>
      <section className="card"><div className="card-title"><strong>Linhas candidatas</strong><span>Top {multiPv}</span></div><div className="lines">{recommendationActive && analysis?.lines.length ? analysis.lines.map((line) => { const score = line.mate !== null ? scoreForSide(Math.sign(line.mate) * 10000, perspective) : scoreForSide(line.scoreCp ?? 0, perspective); return <div className="line" key={line.multipv}><b>{line.multipv}</b><code>{pvToSan(liveGame.fen(), line.pv)}</code><span>{line.mate !== null ? `${score > 0 ? 'M+' : 'M−'}${Math.abs(line.mate)}` : displayEval(score)}</span></div> }) : <div className="empty-state">Sem variantes nesta posição.</div>}</div></section>
      <section className="card engine-metrics"><div className="card-title"><strong>Telemetria</strong><span>linha principal</span></div>{analysis?.lines[0] ? <div><span><b>Prof.</b> {analysis.lines[0].depth}{analysis.lines[0].selDepth ? `/${analysis.lines[0].selDepth}` : ''}</span><span><b>Nós</b> {analysis.lines[0].nodes?.toLocaleString('pt-BR') ?? '—'}</span><span><b>NPS</b> {analysis.lines[0].nps?.toLocaleString('pt-BR') ?? '—'}</span><span><b>Tempo</b> {analysis.lines[0].timeMs ? `${analysis.lines[0].timeMs} ms` : '—'}</span></div> : <p className="empty-state">Aguardando análise.</p>}</section>
      <section className="card appearance-card"><div className="card-title"><strong>Aparência</strong><span>salvo localmente</span></div><label className="appearance-select"><span>Conjunto de peças · {PIECE_SET_OPTIONS.length} estilos</span><select value={pieceSet} onChange={(event) => setPieceSet(event.target.value as PieceSet)}>{PIECE_SET_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}</select></label><label className="appearance-select"><span>Tabuleiro · {BOARD_THEME_OPTIONS.length} temas</span><select value={boardTheme} onChange={(event) => setBoardTheme(event.target.value as BoardTheme)}>{BOARD_THEME_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}</select></label><label className="appearance-select"><span>Seta de dica · {HINT_STYLE_OPTIONS.length} estilos</span><select value={hintStyle} onChange={(event) => setHintStyle(event.target.value as HintStyle)}>{HINT_STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}</select></label><div className="favorite-appearance"><div><strong>{favoriteAppearance ? 'Favorito salvo' : 'Sem favorito salvo'}</strong><small>{favoriteAppearance ? `${PIECE_SET_OPTIONS.find((option) => option.id === favoriteAppearance.pieceSet)?.label} · ${BOARD_THEME_OPTIONS.find((option) => option.id === favoriteAppearance.boardTheme)?.label} · ${HINT_STYLE_OPTIONS.find((option) => option.id === favoriteAppearance.hintStyle)?.label}` : 'Salve sua combinação atual para recuperá-la em um clique.'}</small></div><button onClick={() => setFavoriteAppearance({ pieceSet, boardTheme, hintStyle })}>Salvar favorito</button>{favoriteAppearance && <button className="apply-favorite" onClick={() => { setPieceSet(favoriteAppearance.pieceSet); setBoardTheme(favoriteAppearance.boardTheme); setHintStyle(favoriteAppearance.hintStyle) }}>Aplicar favorito</button>}</div></section>
      <section className="card engine-settings"><div className="card-title"><strong>Força da análise</strong><span>local</span></div><label>Profundidade <b>{depth}</b><input type="range" min="10" max="20" value={depth} onChange={(e) => setDepth(Number(e.target.value))} /></label><label>Variantes <b>{multiPv}</b><input type="range" min="1" max="5" value={multiPv} onChange={(e) => setMultiPv(Number(e.target.value))} /></label><button onClick={() => analyzePosition(liveGame, playerSide, sessionRef.current)} disabled={thinking || liveGame.isGameOver()}>Recalcular</button></section>
      <section className="card moves-card"><div className="card-title"><strong>Partida</strong><span>{history.length} meios-lances</span></div><div className="move-list">{Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => <div key={index}><b>{index + 1}.</b><button className={viewPly === index * 2 + 1 ? 'active-move' : ''} aria-current={viewPly === index * 2 + 1 ? 'step' : undefined} onClick={() => setViewPly(index * 2 + 1)}>{history[index * 2] ?? ''}</button><button className={viewPly === index * 2 + 2 ? 'active-move' : ''} aria-current={viewPly === index * 2 + 2 ? 'step' : undefined} onClick={() => setViewPly(index * 2 + 2)}>{history[index * 2 + 1] ?? ''}</button></div>)}{!history.length && <div className="empty-state">Nenhum lance registrado.</div>}</div><div className="move-actions"><button className="review-button" onClick={reviewGame} disabled={!history.length || reviewing}>Analisar lances</button><button onClick={() => downloadText('partida.pgn', liveGame.pgn(), 'application/x-chess-pgn')}>Exportar PGN</button></div></section>
      <section className="card export-card"><div className="card-title"><strong>Exportar posição</strong><span>tema atual</span></div><div className="move-actions"><button onClick={() => downloadText('posicao.svg', boardSvg(liveGame, pieceSet, EXPORT_THEME_COLORS[boardTheme]), 'image/svg+xml')}>SVG</button><button onClick={() => downloadBoardPng(boardSvg(liveGame, pieceSet, EXPORT_THEME_COLORS[boardTheme]))}>PNG</button></div></section>
      <section className="card profile-card"><div className="card-title"><strong>Seu desempenho</strong><span>{profile.games} revisão(ões)</span></div>{profile.games ? <div><strong>{Math.round(profile.totalAccuracy / profile.games)}%</strong><span>média geral</span><small>Brancas: {profile.white.games ? `${Math.round(profile.white.accuracy / profile.white.games)}%` : '—'} · Pretas: {profile.black.games ? `${Math.round(profile.black.accuracy / profile.black.games)}%` : '—'}</small></div> : <p className="empty-state">Analise uma partida para começar seu histórico local.</p>}</section>
    </aside></section>

    {review.length > 0 && <section className="review-section"><div className="review-header"><div><span className="eyebrow">PÓS-PARTIDA</span><h2>Revisão interativa</h2></div><div className="accuracy"><span>Precisão estimada</span><strong>{accuracy}%</strong></div></div>
      <div className="quality-summary">{Object.entries(qualityCounts).map(([label, count]) => <span key={label}><b>{count}</b> {label}</span>)}</div>
      <div className="eval-chart"><svg viewBox="0 0 600 120" preserveAspectRatio="none"><line x1="0" y1="60" x2="600" y2="60" /><polyline points={review.map((row, index) => `${review.length === 1 ? 300 : index * (600 / (review.length - 1))},${Math.max(5, Math.min(115, 60 - row.eval / 25))}`).join(' ')} />{review.map((row, index) => { const x = review.length === 1 ? 300 : index * (600 / (review.length - 1)); const y = Math.max(5, Math.min(115, 60 - row.eval / 25)); return <circle key={row.ply} className={selectedReviewPly === row.ply ? 'selected-point' : ''} cx={x} cy={y} r="4" onClick={() => { setSelectedReviewPly(row.ply); setViewPly(row.ply) }}><title>{`${row.san}: ${displayEval(row.eval)}`}</title></circle> })}</svg><small>Clique em um ponto para abrir o lance.</small></div>
      <div className="review-grid">{review.map((row) => <button className={`review-row ${selectedReviewPly === row.ply ? 'selected-review' : ''}`} key={row.ply} onClick={() => { setSelectedReviewPly(row.ply); setViewPly(row.ply) }}><div className="move-number">{Math.ceil(row.ply / 2)}{row.ply % 2 === 0 ? '…' : '.'}</div><div><strong>{row.san}</strong><small>{row.actual}</small></div><span className={`quality q-${row.label.toLowerCase().replaceAll(' ', '-')}`}>{row.label}</span><div><small>melhor</small><code>{row.bestSan}</code></div><div><small>perda</small><strong>{row.loss} cp</strong></div><div><small>avaliação</small><strong>{displayEval(row.eval)}</strong></div></button>)}</div>
      {selectedReview && <div className="review-detail"><div><span>Seu lance</span><strong>{selectedReview.san}</strong><code>{selectedReview.actual}</code></div><div className="versus">×</div><div><span>Melhor lance</span><strong>{selectedReview.bestSan}</strong><code>{selectedReview.best}</code></div><p>{selectedReview.ideas.join(' · ')}</p></div>}
      {puzzles.length > 0 && <div className="puzzle-lab"><div><span className="eyebrow">TREINO DOS SEUS ERROS</span><h3>{puzzles.length} posição(ões) para praticar</h3></div><button onClick={() => { setPuzzleIndex(0); setViewPly(null) }}>Treinar erros</button>{activePuzzle && <div className="puzzle-card"><strong>Encontre a melhor jogada da posição antes de {activePuzzle.san}</strong><code>{activePuzzle.fenBefore}</code><button onClick={() => openPuzzlePosition(activePuzzle.fenBefore)}>Abrir posição na ferramenta FEN</button><details><summary>Ver solução</summary><b>{activePuzzle.bestSan}</b> · {activePuzzle.ideas.join(', ')}</details><div className="puzzle-nav"><button onClick={() => setPuzzleIndex((value) => Math.max(0, (value ?? 0) - 1))}>Anterior</button><span>{(puzzleIndex ?? 0) + 1}/{puzzles.length}</span><button onClick={() => setPuzzleIndex((value) => Math.min(puzzles.length - 1, (value ?? 0) + 1))}>Próximo</button></div></div>}</div>}
    </section>}

    {showGameOver && result && <div className="modal-backdrop"><div className="gameover-modal" role="dialog" aria-modal="true"><span className="section-label">{resultTitle(liveGame)}</span><div className="mate-symbol">{liveGame.isCheckmate() ? '♚' : '½'}</div><h2>{result}</h2><p>Último lance: <strong>{lastSan}</strong></p><div className="gameover-actions"><button onClick={() => setShowGameOver(false)}>Fechar</button><button onClick={() => { setShowGameOver(false); void reviewGame() }}>Revisar partida</button><button className="primary" onClick={resetGame}>Nova partida</button></div></div></div>}

    {pendingPromotion && <div className="modal-backdrop" onClick={() => setPendingPromotion(null)}><div className="promotion-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><span className="section-label">PROMOÇÃO</span><h2>Escolha a peça</h2><div className="promotion-grid">{PROMOTIONS.map(({ piece, label }) => <button key={piece} onClick={() => executeMove(pendingPromotion.from, pendingPromotion.to, piece)}><img src={pieceAsset(pieceSet, liveGame.turn(), piece)} alt={label} /><small>{label}</small></button>)}</div></div></div>}

    {showTools && <div className="modal-backdrop" onClick={() => setShowTools(false)}><div className="tools-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><span className="section-label">IMPORTAR POSIÇÃO / PARTIDA</span><h2>PGN e FEN</h2><textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Cole um PGN completo ou uma posição FEN..." /><div className="tool-actions"><button onClick={loadPgn}>Carregar PGN</button><button onClick={loadFen}>Carregar FEN</button><button onClick={() => setImportText(liveGame.fen())}>Usar FEN atual</button><button onClick={() => navigator.clipboard?.writeText(liveGame.fen())}>Copiar FEN</button></div><small>A importação substitui a posição atual. A sessão é salva automaticamente no navegador.</small></div></div>}
  </main></>
}
