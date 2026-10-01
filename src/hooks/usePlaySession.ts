import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { ALL_SQUARES } from '../board-geometry'
import {
  classifyReview,
  cloneGame,
  evaluationForSide,
  mateMessage,
  moveToSan,
  reviewLoss,
  scoreForSide,
  scoreOf,
  tacticalIdeas,
  terminalEvaluation,
} from '../chess-analysis'
import { openingFor, threatsFor } from '../chess-tools'
import { AnalysisCancelledError, type EngineAnalysis } from '../engine'
import {
  accuracyFor,
  findCheckedKing,
  gameAtPly,
  gameResult,
  lastMoveOf,
  nextViewPly,
  type LastMove,
  type Mode,
  type ReviewMove,
} from '../game-helpers'
import type { OnlineGame } from '../online-games'
import { countGameHistory, getCachedReview, putCachedReview, putGameHistory, reviewCacheKey } from '../persistence'
import { useChessGame } from './useChessGame'
import { useStockfish } from './useStockfish'

export const SESSION_STORAGE_KEY = 'xadrez-dev-session-v2'

export type MarkTool = 'move' | 'arrow' | 'circle'
export type ManualArrow = { from: Square; to: Square }
type PendingPromotion = { from: Square; to: Square } | null
type AnalysisOptions = { mode?: Mode; depth?: number; multiPv?: number }
type SessionSnapshot = { pgn: string; fen: string; side: Color; mode: Mode; depth: number; multiPv: number }

function hasSavedSession() {
  try {
    return Boolean(localStorage.getItem(SESSION_STORAGE_KEY))
  } catch {
    return false
  }
}

/**
 * State and actions of the "Jogar & Analisar" area: the game, Stockfish analysis, post-game
 * review and board annotations. Presentation components receive this object as a prop.
 */
export function usePlaySession({ onReviewRecorded }: { onReviewRecorded: (side: Color, accuracy: number) => void }) {
  const { game, gameRef, replaceGame } = useChessGame()
  const { engine, engineRef, cancelAnalysis } = useStockfish()
  const requestRef = useRef(0)
  const sessionRef = useRef(0)

  const [playerSide, setPlayerSide] = useState<Color | null>(null)
  const [mode, setMode] = useState<Mode>('coach')
  const [selected, setSelected] = useState<Square | null>(null)
  const [lastMove, setLastMove] = useState<LastMove>(null)
  const [analysis, setAnalysis] = useState<EngineAnalysis | null>(null)
  const [thinking, setThinking] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewProgress, setReviewProgress] = useState<{ completed: number; total: number } | null>(null)
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
  const [savedSession, setSavedSession] = useState(hasSavedSession)
  const [puzzleIndex, setPuzzleIndex] = useState<number | null>(null)
  const [markTool, setMarkTool] = useState<MarkTool>('move')
  const [manualArrowStart, setManualArrowStart] = useState<Square | null>(null)
  const [manualArrows, setManualArrows] = useState<ManualArrow[]>([])
  const [manualCircles, setManualCircles] = useState<Square[]>([])
  const [lastReviewedSignature, setLastReviewedSignature] = useState<string | null>(null)
  const [storedGames, setStoredGames] = useState(0)

  const liveGame = useMemo(() => cloneGame(game), [game])
  const history = useMemo(() => liveGame.history(), [liveGame])
  const displayedGame = useMemo(() => (viewPly === null ? liveGame : gameAtPly(liveGame, viewPly)), [liveGame, viewPly])
  const orientation: Color = playerSide ?? 'w'
  const checkedKing = findCheckedKing(displayedGame)
  const result = gameResult(liveGame)
  const legalMoves = useMemo(
    () => (selected && viewPly === null ? liveGame.moves({ square: selected, verbose: true }) : []),
    [liveGame, selected, viewPly],
  )
  const legalTargets = useMemo(() => new Set(legalMoves.map((move) => move.to)), [legalMoves])
  const recommendationActive = Boolean(playerSide && (mode === 'analysis' || liveGame.turn() === playerSide))
  const bestMove = recommendationActive ? analysis?.bestMove : undefined
  const hintFrom = showHint && bestMove ? (bestMove.slice(0, 2) as Square) : null
  const hintTo = showHint && bestMove ? (bestMove.slice(2, 4) as Square) : null
  const perspective: Color = mode === 'analysis' ? 'w' : (playerSide ?? 'w')
  const userEval = analysis ? scoreForSide(scoreOf(analysis), perspective) : 0
  const boardLocked = reviewing || liveGame.isGameOver() || !playerSide || viewPly !== null
  const mateAlert = mateMessage(analysis, perspective, mode)
  const selectedReview = review.find((row) => row.ply === selectedReviewPly) ?? null
  const puzzles = review.filter((row) => row.label === 'Erro' || row.label === 'Erro grave')
  const activePuzzle = puzzleIndex === null ? null : (puzzles[puzzleIndex] ?? null)
  const opening = useMemo(() => openingFor(liveGame), [liveGame])
  const tacticalInsights = useMemo(() => threatsFor(liveGame), [liveGame])
  const bestMoveIdeas = useMemo(() => (bestMove ? tacticalIdeas(liveGame, bestMove) : []), [liveGame, bestMove])
  const bestSan = bestMove ? moveToSan(liveGame, bestMove) : null
  const accuracy = review.length ? accuracyFor(review) : null

  useEffect(() => {
    void countGameHistory().then(setStoredGames)
  }, [])

  useEffect(() => {
    if (!playerSide) return
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, button')) return
      if (event.key === 'Escape') {
        setSelected(null)
        return
      }
      if (event.key.toLowerCase() === 'h') {
        setShowHint((value) => !value)
        return
      }
      if (event.key === 'ArrowLeft' && history.length) {
        event.preventDefault()
        setViewPly((value) => Math.max(0, (value ?? history.length) - 1))
      }
      if (event.key === 'ArrowRight' && history.length && viewPly !== null) {
        event.preventDefault()
        setViewPly((value) => nextViewPly(value, history.length))
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [history.length, playerSide, viewPly])

  useEffect(() => {
    if (!playerSide) return
    const snapshot: SessionSnapshot = { pgn: game.pgn(), fen: game.fen(), side: playerSide, mode, depth, multiPv }
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      /* Session restore is optional. */
    }
  }, [game, playerSide, mode, depth, multiPv])

  function commitGame(next: Chess, move: LastMove) {
    replaceGame(next)
    setLastMove(move)
    setAnalysis(null)
    setThinking(false)
    setSelected(null)
    setPendingPromotion(null)
    setViewPly(null)
    setPuzzleIndex(null)
    setManualArrowStart(null)
    setShowGameOver(next.isGameOver())
  }

  function resetAnnotations() {
    setManualArrows([])
    setManualCircles([])
    setManualArrowStart(null)
    setMarkTool('move')
  }

  async function analyzePosition(position: Chess, side: Color, session: number, options: AnalysisOptions = {}) {
    const activeEngine = engineRef.current
    if (!activeEngine || position.isGameOver()) {
      setAnalysis(null)
      setThinking(false)
      return
    }
    const effectiveMode = options.mode ?? mode
    const effectiveDepth = options.depth ?? depth
    const effectiveMultiPv = options.multiPv ?? multiPv
    const expectedFen = position.fen()
    const requestId = ++requestRef.current
    cancelAnalysis()
    setThinking(true)
    setEngineError(null)
    setAnalysis(null)
    try {
      const response = await activeEngine.analyze(
        expectedFen,
        effectiveDepth,
        effectiveMode === 'analysis' || position.turn() === side ? effectiveMultiPv : 1,
      )
      if (requestRef.current !== requestId || sessionRef.current !== session || gameRef.current.fen() !== expectedFen)
        return
      setAnalysis(response)
    } catch (error) {
      if (error instanceof AnalysisCancelledError) return
      if (requestRef.current !== requestId || sessionRef.current !== session) return
      setEngineError(error instanceof Error ? error.message : 'Não foi possível analisar a posição.')
    } finally {
      if (requestRef.current === requestId) setThinking(false)
    }
  }

  /** Invalidates every in-flight engine request so late responses are ignored. */
  function invalidateRequests() {
    sessionRef.current += 1
    requestRef.current += 1
    cancelAnalysis()
  }

  function startWithSide(side: Color, nextMode: Mode = 'coach') {
    invalidateRequests()
    const next = new Chess()
    replaceGame(next)
    setPlayerSide(side)
    setMode(nextMode)
    setSelected(null)
    setLastMove(null)
    setAnalysis(null)
    setReview([])
    setEngineError(null)
    setPendingPromotion(null)
    setThinking(false)
    setViewPly(null)
    setSelectedReviewPly(null)
    setShowGameOver(false)
    resetAnnotations()
    setLastReviewedSignature(null)
    setSavedSession(true)
    const engineReset = engineRef.current?.newGame() ?? Promise.resolve()
    const analyzeStart = () => analyzePosition(next, side, sessionRef.current, { mode: nextMode })
    void engineReset.then(analyzeStart, analyzeStart)
  }

  function leaveToSetup() {
    invalidateRequests()
    setThinking(false)
    setAnalysis(null)
    setPlayerSide(null)
    setShowTools(false)
    setShowGameOver(false)
  }

  function playMove(current: Chess, move: { from: Square; to: Square }) {
    requestRef.current += 1
    cancelAnalysis()
    setReview([])
    setSelectedReviewPly(null)
    commitGame(current, move)
    if (playerSide && !current.isGameOver()) void analyzePosition(current, playerSide, sessionRef.current)
  }

  function executeMove(from: Square, to: Square, promotion?: PieceSymbol) {
    if (boardLocked) return
    const current = cloneGame(gameRef.current)
    const piece = current.get(from)
    if (!piece || piece.color !== current.turn()) return
    const candidates = current.moves({ square: from, verbose: true }).filter((move) => move.to === to)
    if (!candidates.length) {
      setSelected(null)
      return
    }
    if (!promotion && candidates.some((move) => Boolean(move.promotion))) {
      setPendingPromotion({ from, to })
      return
    }
    try {
      const move = current.move({ from, to, promotion })
      playMove(current, { from: move.from, to: move.to })
    } catch {
      setSelected(null)
    }
  }

  function playBookMove(san: string) {
    if (boardLocked) return
    const current = cloneGame(gameRef.current)
    try {
      const move = current.move(san)
      playMove(current, { from: move.from, to: move.to })
    } catch {
      setEngineError('Esse lance do livro não está disponível nesta posição.')
    }
  }

  function clickSquare(square: Square) {
    if (markTool === 'circle') {
      setManualCircles((circles) =>
        circles.includes(square) ? circles.filter((item) => item !== square) : [...circles, square],
      )
      return
    }
    if (markTool === 'arrow') {
      if (!manualArrowStart) {
        setManualArrowStart(square)
        return
      }
      if (manualArrowStart !== square) setManualArrows((arrows) => [...arrows, { from: manualArrowStart, to: square }])
      setManualArrowStart(null)
      return
    }
    if (boardLocked) return
    const current = gameRef.current
    const piece = current.get(square)
    if (!selected) {
      if (piece?.color === current.turn()) setSelected(square)
      return
    }
    if (piece?.color === current.turn()) {
      setSelected(square)
      return
    }
    executeMove(selected, square)
  }

  // Selecting the latest move must return to the live position; a viewPly equal to the history
  // length would show the same board but keep it locked as if it were a past position.
  function viewMove(ply: number) {
    setViewPly(ply >= history.length ? null : ply)
  }

  function stepBack() {
    setViewPly((value) => Math.max(0, (value ?? history.length) - 1))
  }

  function stepForward() {
    setViewPly((value) => nextViewPly(value, history.length))
  }

  function selectMarkTool(tool: MarkTool) {
    setMarkTool(tool)
    if (tool === 'move') setManualArrowStart(null)
  }

  function requestReset() {
    if (
      history.length &&
      !window.confirm('Iniciar uma nova partida? A posição atual continuará disponível somente na sessão salva.')
    )
      return
    resetGame()
  }

  function recordProfile(rows: ReviewMove[]) {
    if (!rows.length || !playerSide) return
    const signature = gameRef.current.pgn()
    if (!signature || signature === lastReviewedSignature) return
    onReviewRecorded(playerSide, accuracyFor(rows))
    setLastReviewedSignature(signature)
  }

  function dragStart(square: Square, event: DragEvent) {
    if (boardLocked || gameRef.current.get(square)?.color !== gameRef.current.turn()) {
      event.preventDefault()
      return
    }
    setSelected(square)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', square)
  }

  function dropOnSquare(square: Square, event: DragEvent) {
    event.preventDefault()
    if (boardLocked) return
    const from = event.dataTransfer.getData('text/plain') as Square
    if (from && ALL_SQUARES.includes(from)) executeMove(from, square)
  }

  function undoMove() {
    if (reviewing || !history.length || !playerSide) return
    invalidateRequests()
    const next = cloneGame(gameRef.current)
    next.undo()
    commitGame(next, lastMoveOf(next))
    setReview([])
    setEngineError(null)
    setShowGameOver(false)
    void analyzePosition(next, playerSide, sessionRef.current)
  }

  function resetGame() {
    if (playerSide) startWithSide(playerSide, mode)
  }

  function replacePosition(next: Chess, side = playerSide) {
    invalidateRequests()
    commitGame(next, lastMoveOf(next))
    setReview([])
    setSelectedReviewPly(null)
    setEngineError(null)
    setShowTools(false)
    resetAnnotations()
    setLastReviewedSignature(null)
    if (side && !next.isGameOver()) void analyzePosition(next, side, sessionRef.current)
  }

  function loadPgn() {
    try {
      const next = new Chess()
      next.loadPgn(importText.trim())
      replacePosition(next)
    } catch {
      setEngineError('PGN inválido ou incompatível.')
    }
  }

  function loadFen() {
    try {
      replacePosition(new Chess(importText.trim()))
    } catch {
      setEngineError('FEN inválido.')
    }
  }

  function loadOnlineGame(onlineGame: OnlineGame) {
    try {
      const next = new Chess()
      next.loadPgn(onlineGame.pgn)
      // In coach mode the review follows the user's own color in that game.
      const side = mode === 'coach' ? onlineGame.userColor : playerSide
      if (side !== playerSide) setPlayerSide(side)
      replacePosition(next, side)
    } catch {
      setEngineError('Não foi possível carregar o PGN dessa partida.')
    }
  }

  function openPuzzlePosition(fenValue: string) {
    setImportText(fenValue)
    setShowTools(true)
  }

  function restoreSession() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as SessionSnapshot
      if (!saved.side || !['w', 'b'].includes(saved.side) || !['coach', 'analysis'].includes(saved.mode))
        throw new Error('Sessão inválida')
      const restoredDepth = Number.isFinite(saved.depth) ? Math.max(10, Math.min(20, saved.depth)) : 14
      const restoredMultiPv = Number.isFinite(saved.multiPv) ? Math.max(1, Math.min(5, saved.multiPv)) : 3
      let next = new Chess()
      if (saved.pgn) next.loadPgn(saved.pgn)
      else next = new Chess(saved.fen)
      invalidateRequests()
      replaceGame(next)
      setPlayerSide(saved.side)
      setMode(saved.mode)
      setDepth(restoredDepth)
      setMultiPv(restoredMultiPv)
      setLastMove(lastMoveOf(next))
      setAnalysis(null)
      setThinking(false)
      setReview([])
      setSelectedReviewPly(null)
      setViewPly(null)
      setEngineError(null)
      setShowGameOver(next.isGameOver())
      if (!next.isGameOver())
        void analyzePosition(next, saved.side, sessionRef.current, {
          mode: saved.mode,
          depth: restoredDepth,
          multiPv: restoredMultiPv,
        })
    } catch {
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY)
      } catch {
        /* Ignore. */
      }
      setSavedSession(false)
      setEngineError('A sessão salva estava inválida e foi descartada.')
    }
  }

  async function reviewGame() {
    const activeEngine = engineRef.current
    const side = playerSide
    const source = cloneGame(gameRef.current)
    if (!activeEngine || !side || !source.history().length || reviewing) return
    const signature = source.pgn()
    const reviewDepth = Math.max(10, depth - 3)
    const cacheKey = reviewCacheKey(signature, side, mode, reviewDepth)
    const moves = source.history({ verbose: true })
    const totalReviewedMoves = moves.filter((move) => mode === 'analysis' || move.color === side).length
    const chartPerspective: Color = mode === 'analysis' ? 'w' : side
    requestRef.current += 1
    cancelAnalysis()
    setThinking(false)
    setReviewing(true)
    setReviewProgress({ completed: 0, total: totalReviewedMoves })
    setReview([])
    setSelectedReviewPly(null)
    setEngineError(null)

    try {
      const cached = await getCachedReview<ReviewMove>(cacheKey)
      if (cached?.rows?.length) {
        setReview(cached.rows)
        setLastReviewedSignature(signature)
        setStoredGames(await countGameHistory())
        return
      }

      const replay = gameAtPly(source, 0)
      const rows: ReviewMove[] = []
      // The position after move N is the same position as before move N+1 — reuse that
      // analysis instead of asking Stockfish to search it twice.
      let carriedAnalysis: EngineAnalysis | null = null
      for (let index = 0; index < moves.length; index += 1) {
        const move = moves[index]
        const mover = replay.turn()
        const actual = `${move.from}${move.to}${move.promotion ?? ''}`
        if (mover !== side && mode === 'coach') {
          replay.move({ from: move.from, to: move.to, promotion: move.promotion })
          carriedAnalysis = null
          continue
        }
        const fenBefore = replay.fen()
        const before = carriedAnalysis ?? (await activeEngine.analyze(fenBefore, reviewDepth, 1))
        const best = before.bestMove
        const bestMoveSan = moveToSan(replay, best)
        const beforeEval = evaluationForSide(before, mover)
        replay.move({ from: move.from, to: move.to, promotion: move.promotion })
        const afterAnalysis = replay.isGameOver() ? null : await activeEngine.analyze(replay.fen(), reviewDepth, 1)
        const afterEval = afterAnalysis ? evaluationForSide(afterAnalysis, mover) : terminalEvaluation(replay, mover)
        const chartEval = afterAnalysis
          ? evaluationForSide(afterAnalysis, chartPerspective)
          : terminalEvaluation(replay, chartPerspective)
        carriedAnalysis = afterAnalysis
        const loss = reviewLoss(beforeEval, afterEval)
        const chartScore =
          chartEval.mate !== null
            ? Math.sign(chartEval.mate) * (10000 - Math.min(99, Math.abs(chartEval.mate)))
            : (chartEval.cp ?? 0)
        rows.push({
          ply: index + 1,
          san: move.san,
          actual,
          best,
          bestSan: bestMoveSan,
          loss,
          label: classifyReview(loss, actual === best, beforeEval, afterEval),
          eval: chartScore,
          fenBefore,
          fenAfter: replay.fen(),
          ideas: tacticalIdeas(new Chess(fenBefore), best),
        })
        setReview([...rows])
        setReviewProgress({ completed: rows.length, total: totalReviewedMoves })
      }

      const reviewAccuracy = accuracyFor(rows)
      const now = Date.now()
      await putCachedReview<ReviewMove>({
        key: cacheKey,
        signature,
        pgn: signature,
        side,
        mode,
        depth: reviewDepth,
        accuracy: reviewAccuracy,
        rows,
        createdAt: now,
        updatedAt: now,
      })
      await putGameHistory({ signature, pgn: signature, side, mode, accuracy: reviewAccuracy, reviewedAt: now })
      setStoredGames(await countGameHistory())
      recordProfile(rows)
    } catch (error) {
      setReview([])
      setSelectedReviewPly(null)
      if (!(error instanceof AnalysisCancelledError))
        setEngineError(error instanceof Error ? error.message : 'A revisão não pôde ser concluída. Tente novamente.')
    } finally {
      setReviewing(false)
      setReviewProgress(null)
      if (playerSide && !gameRef.current.isGameOver())
        void analyzePosition(gameRef.current, playerSide, sessionRef.current)
    }
  }

  function selectReviewRow(ply: number) {
    setSelectedReviewPly(ply)
    viewMove(ply)
  }

  /** Re-runs the search when returning to the play area, since leaving it cancels analysis. */
  function resumeAnalysis() {
    if (playerSide && !analysis && !reviewing && !liveGame.isGameOver())
      void analyzePosition(gameRef.current, playerSide, sessionRef.current)
  }

  function recalculate() {
    if (playerSide) void analyzePosition(liveGame, playerSide, sessionRef.current)
  }

  return {
    engine,
    cancelAnalysis,
    // Game
    liveGame,
    displayedGame,
    history,
    playerSide,
    mode,
    orientation,
    perspective,
    result,
    checkedKing,
    selected,
    setSelected,
    lastMove,
    legalTargets,
    boardLocked,
    viewPly,
    setViewPly,
    viewMove,
    stepBack,
    stepForward,
    pendingPromotion,
    cancelPromotion: () => setPendingPromotion(null),
    // Engine
    analysis,
    thinking,
    engineError,
    depth,
    setDepth,
    multiPv,
    setMultiPv,
    recommendationActive,
    bestMove,
    bestSan,
    bestMoveIdeas,
    hintFrom,
    hintTo,
    showHint,
    toggleHint: () => setShowHint((value) => !value),
    userEval,
    mateAlert,
    opening,
    tacticalInsights,
    // Review
    review,
    reviewing,
    reviewProgress,
    accuracy,
    selectedReview,
    selectedReviewPly,
    selectReviewRow,
    puzzles,
    puzzleIndex,
    setPuzzleIndex,
    activePuzzle,
    storedGames,
    // Annotations
    markTool,
    selectMarkTool,
    manualArrows,
    manualCircles,
    clearAnnotations: resetAnnotations,
    // Dialogs and persistence
    showGameOver,
    setShowGameOver,
    showTools,
    setShowTools,
    importText,
    setImportText,
    savedSession,
    // Actions
    startWithSide,
    leaveToSetup,
    executeMove,
    playBookMove,
    clickSquare,
    dragStart,
    dropOnSquare,
    undoMove,
    requestReset,
    resetGame,
    loadPgn,
    loadFen,
    loadOnlineGame,
    openPuzzlePosition,
    restoreSession,
    reviewGame,
    resumeAnalysis,
    recalculate,
  }
}

export type PlaySession = ReturnType<typeof usePlaySession>
