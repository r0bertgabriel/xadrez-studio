import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { StockfishEngine } from './engine'
import { courseCategories, OPENING_COURSES, type OpeningCourse } from './openings-data'
import './styles/openings.css'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const
const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }
const OFF_BOOK_THRESHOLD_CP = 40
const CHECK_DEPTH = 12
const REJECTED_FLASH_MS = 700

type Feedback = { kind: 'correct' | 'off-book' | 'mistake' | 'info'; text: string } | null
type TrainerMode = 'lesson' | 'quiz'

function isLightSquare(square: Square) {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number])
  return (file + Number(square[1])) % 2 === 0
}
function displayedSquares(side: Color) {
  const files = side === 'w' ? [...FILES] : [...FILES].reverse()
  const ranks = side === 'w' ? [...RANKS] : [...RANKS].reverse()
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square))
}
function pieceAsset(set: string, color: Color, piece: PieceSymbol) {
  return `/pieces/${set}/${color}${PIECE_NAMES[piece]}.svg`
}
function gameUpTo(course: OpeningCourse, count: number) {
  const game = new Chess()
  for (let index = 0; index < count; index += 1) game.move(course.steps[index].san)
  return game
}
function absoluteScore(line: { mate: number | null; scoreCp: number | null } | undefined) {
  if (!line) return 0
  if (line.mate !== null) return Math.sign(line.mate) * 10000
  return line.scoreCp ?? 0
}

export default function OpeningTrainer({ engine, pieceSet }: { engine: StockfishEngine | null; pieceSet: string }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>(OPENING_COURSES[0].id)
  const [mode, setMode] = useState<TrainerMode>('lesson')
  const [studentSide, setStudentSide] = useState<Color>(OPENING_COURSES[0].studentSide)
  const [stepIndex, setStepIndex] = useState(0)
  const [selected, setSelected] = useState<Square | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [mistakes, setMistakes] = useState<Set<number>>(new Set())
  const [attempted, setAttempted] = useState<Set<number>>(new Set())
  const [checking, setChecking] = useState(false)
  const [finished, setFinished] = useState(false)
  const [rejected, setRejected] = useState<{ from: Square; to: Square } | null>(null)
  const sessionTokenRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const course = OPENING_COURSES.find((item) => item.id === selectedId) ?? OPENING_COURSES[0]
  const filteredCourses = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? OPENING_COURSES.filter((item) => item.name.toLowerCase().includes(term) || item.eco.toLowerCase().includes(term)) : OPENING_COURSES
  }, [query])
  const categories = useMemo(() => courseCategories(), [])

  const game = useMemo(() => gameUpTo(course, stepIndex), [course, stepIndex])
  const orientation = studentSide
  const boardSquares = useMemo(() => displayedSquares(orientation), [orientation])
  const currentStep = course.steps[stepIndex] ?? null
  const previousStep = stepIndex > 0 ? course.steps[stepIndex - 1] : null
  const isStudentTurn = mode === 'quiz' && currentStep !== null && game.turn() === studentSide
  const legalMoves = useMemo(() => selected && isStudentTurn ? game.moves({ square: selected, verbose: true }) : [], [game, selected, isStudentTurn])
  const legalTargets = useMemo(() => new Set(legalMoves.map((move) => move.to)), [legalMoves])
  const lastMove = useMemo(() => {
    if (stepIndex === 0) return null
    const replay = gameUpTo(course, stepIndex - 1)
    try { const move = replay.move(course.steps[stepIndex - 1].san); return { from: move.from, to: move.to } } catch { return null }
  }, [course, stepIndex])
  const totalQuizMoves = useMemo(() => course.steps.filter((_, index) => gameUpTo(course, index).turn() === studentSide).length, [course, studentSide])

  function resetSession(overrides: Partial<{ id: string; mode: TrainerMode; side: Color }> = {}) {
    sessionTokenRef.current += 1
    if (overrides.id !== undefined) setSelectedId(overrides.id)
    if (overrides.mode !== undefined) setMode(overrides.mode)
    if (overrides.side !== undefined) setStudentSide(overrides.side)
    setStepIndex(0)
    setSelected(null)
    setFeedback(null)
    setMistakes(new Set())
    setAttempted(new Set())
    setFinished(false)
    setRejected(null)
    setChecking(false)
  }

  function selectCourse(next: OpeningCourse) { resetSession({ id: next.id, side: next.studentSide }) }
  function restart() { resetSession() }
  function switchMode(next: TrainerMode) { resetSession({ mode: next }) }
  function switchSide(next: Color) { resetSession({ side: next }) }

  useEffect(() => {
    if (mode !== 'quiz' || finished) return
    if (!currentStep) { setFinished(true); return }
    if (game.turn() === studentSide) return
    const token = ++sessionTokenRef.current
    const timeout = window.setTimeout(() => {
      if (sessionTokenRef.current !== token || !mountedRef.current) return
      setFeedback({ kind: 'info', text: `${currentStep.san}: ${currentStep.comment}` })
      setStepIndex((value) => value + 1)
    }, 650)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stepIndex, currentStep, game, studentSide, finished])

  useEffect(() => {
    if (mode === 'quiz' && !currentStep && !finished) setFinished(true)
  }, [mode, currentStep, finished])

  async function tryStudentMove(from: Square, to: Square) {
    if (!currentStep || checking) return
    const token = sessionTokenRef.current
    const probe = gameUpTo(course, stepIndex)
    const candidate = probe.moves({ square: from, verbose: true }).find((move) => move.to === to)
    if (!candidate) { setSelected(null); return }
    const attemptedSan = candidate.san
    setSelected(null)
    setAttempted((set) => new Set(set).add(stepIndex))
    setRejected(null)

    if (attemptedSan === currentStep.san) {
      setFeedback({ kind: 'correct', text: `Correto! ${currentStep.comment}` })
      setStepIndex((value) => value + 1)
      return
    }

    setRejected({ from, to })
    window.setTimeout(() => { if (sessionTokenRef.current === token && mountedRef.current) setRejected(null) }, REJECTED_FLASH_MS)

    if (!engine) {
      setMistakes((set) => new Set(set).add(stepIndex))
      setFeedback({ kind: 'mistake', text: `Esse não é o lance principal aqui. O lance de livro é ${currentStep.san}: ${currentStep.comment}` })
      return
    }

    setChecking(true)
    try {
      const played = gameUpTo(course, stepIndex); played.move(attemptedSan)
      const bookAfter = gameUpTo(course, stepIndex); bookAfter.move(currentStep.san)
      const [playedEval, bookEval] = await Promise.all([
        engine.analyze(played.fen(), CHECK_DEPTH, 1),
        engine.analyze(bookAfter.fen(), CHECK_DEPTH, 1),
      ])
      if (sessionTokenRef.current !== token || !mountedRef.current) return
      const playedScore = absoluteScore(playedEval.lines[0])
      const bookScore = absoluteScore(bookEval.lines[0])
      // Both scores are already normalised to White's perspective by the engine wrapper;
      // flip for Black so a positive "loss" always means the student's move was worse.
      const sideSign = game.turn() === 'w' ? 1 : -1
      const loss = Math.round((bookScore - playedScore) * sideSign)
      if (loss <= OFF_BOOK_THRESHOLD_CP) {
        setFeedback({ kind: 'off-book', text: `Fora do livro, mas é uma jogada razoável (diferença de ~${Math.max(0, loss)}cp). O lance clássico aqui é ${currentStep.san}: ${currentStep.comment}` })
      } else {
        setMistakes((set) => new Set(set).add(stepIndex))
        setFeedback({ kind: 'mistake', text: `${attemptedSan} enfraquece sua posição (perda ~${loss}cp). O lance de livro é ${currentStep.san}: ${currentStep.comment}` })
      }
    } catch {
      if (sessionTokenRef.current !== token || !mountedRef.current) return
      setMistakes((set) => new Set(set).add(stepIndex))
      setFeedback({ kind: 'mistake', text: `Esse não é o lance principal aqui. O lance de livro é ${currentStep.san}: ${currentStep.comment}` })
    } finally {
      if (sessionTokenRef.current === token && mountedRef.current) setChecking(false)
    }
  }

  function clickSquare(square: Square) {
    if (mode !== 'quiz' || !isStudentTurn || checking) return
    const piece = game.get(square)
    if (!selected) { if (piece?.color === game.turn()) setSelected(square); return }
    if (piece?.color === game.turn()) { setSelected(square); return }
    void tryStudentMove(selected, square)
  }

  function playCorrectMove() {
    if (!currentStep) return
    setRejected(null)
    setFeedback({ kind: 'info', text: `${currentStep.san}: ${currentStep.comment}` })
    setStepIndex((value) => value + 1)
  }

  function advanceLesson() {
    if (stepIndex >= course.steps.length) return
    setStepIndex((value) => value + 1)
  }
  function retreatLesson() { setStepIndex((value) => Math.max(0, value - 1)) }

  return <main className="trainer-shell">
    <header className="trainer-topbar">
      <div><span className="eyebrow">MODO PROFESSOR</span><h1>Estúdio de Aberturas</h1></div>
    </header>

    <div className="trainer-layout">
      <aside className="trainer-sidebar">
        <input className="trainer-search" placeholder="Buscar abertura ou ECO..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="trainer-course-list">
          {categories.map((category) => {
            const items = filteredCourses.filter((item) => item.category === category)
            if (!items.length) return null
            return <div key={category} className="trainer-category">
              <span className="trainer-category-label">{category}</span>
              {items.map((item) => <button key={item.id} className={`trainer-course-item ${item.id === course.id ? 'active' : ''}`} onClick={() => selectCourse(item)}>
                <strong>{item.name}</strong><span>{item.eco}</span>
              </button>)}
            </div>
          })}
          {!filteredCourses.length && <p className="empty-state">Nenhuma abertura encontrada para essa busca.</p>}
        </div>
      </aside>

      <div className="trainer-board-column">
        <div className="board-frame trainer-board-frame">
          <div className="board" role="grid" aria-label="Tabuleiro de estudo de aberturas">
            {boardSquares.map((square) => {
              const piece = game.get(square)
              const target = legalTargets.has(square)
              const last = lastMove?.from === square || lastMove?.to === square
              const isRejected = rejected?.from === square || rejected?.to === square
              return <button key={square} type="button" className={`square ${isLightSquare(square) ? 'light' : 'dark'} ${selected === square ? 'selected' : ''} ${target ? 'target' : ''} ${last ? 'last-move' : ''} ${isRejected ? 'rejected' : ''}`} onClick={() => clickSquare(square)} aria-label={square}>
                {piece && <span className={`piece piece-${pieceSet} ${piece.color}`}><img src={pieceAsset(pieceSet, piece.color, piece.type)} alt="" draggable={false} /></span>}
              </button>
            })}
          </div>
        </div>
        <div className="trainer-controls">
          {mode === 'lesson' ? <>
            <button onClick={retreatLesson} disabled={stepIndex === 0}>← Lance anterior</button>
            <span>{stepIndex} / {course.steps.length}</span>
            <button onClick={advanceLesson} disabled={stepIndex >= course.steps.length}>Próximo lance →</button>
          </> : <>
            <button onClick={restart}>Reiniciar linha</button>
            <span>{attempted.size} / {totalQuizMoves} testados · {mistakes.size} erro(s)</span>
          </>}
        </div>
      </div>

      <aside className="trainer-panel">
        <section className="card trainer-course-card">
          <div className="card-title"><strong>{course.name}</strong><span>{course.eco}</span></div>
          <p>{course.summary}</p>
          <div className="trainer-mode-toggle">
            <button className={mode === 'lesson' ? 'selected-tool' : ''} onClick={() => switchMode('lesson')}>Lição explicada</button>
            <button className={mode === 'quiz' ? 'selected-tool' : ''} onClick={() => switchMode('quiz')}>Treino ativo</button>
          </div>
          <div className="trainer-side-toggle">
            <span>Você joga com</span>
            <button className={studentSide === 'w' ? 'selected-tool' : ''} onClick={() => switchSide('w')}>Brancas</button>
            <button className={studentSide === 'b' ? 'selected-tool' : ''} onClick={() => switchSide('b')}>Pretas</button>
          </div>
        </section>

        {mode === 'lesson' && <section className="card trainer-step-card">
          <div className="card-title"><strong>Explicação</strong><span>lance {stepIndex} de {course.steps.length}</span></div>
          {previousStep ? <><b>{previousStep.san}</b><p>{previousStep.comment}</p></> : <p className="empty-state">Posição inicial. Clique em "Próximo lance" para começar a lição.</p>}
          {currentStep && <p className="trainer-next-hint">A seguir: <code>{currentStep.san}</code></p>}
          {!currentStep && <p className="trainer-end-note">Fim da linha estudada. Você pode continuar explorando a posição no modo Análise livre do tabuleiro principal.</p>}
        </section>}

        {mode === 'quiz' && <section className={`card trainer-step-card ${feedback?.kind ?? ''}`}>
          <div className="card-title"><strong>Treino ativo</strong>{checking && <span className="mini-loader" />}</div>
          {finished ? <div><strong>Linha concluída!</strong><p>{mistakes.size === 0 ? 'Você acertou todos os lances de memória. Excelente domínio dessa linha.' : `Você errou ${mistakes.size} lance(s) nesta tentativa. Reinicie para treinar novamente.`}</p></div>
            : isStudentTurn ? <p>Sua vez: encontre o lance principal da linha para {studentSide === 'w' ? 'as brancas' : 'as pretas'}.</p>
            : <p className="muted">O oponente está jogando o lance de livro...</p>}
          {feedback && <div className={`trainer-feedback ${feedback.kind}`}>{feedback.text}</div>}
          {(feedback?.kind === 'mistake' || feedback?.kind === 'off-book') && !finished && <button className="trainer-reveal" onClick={playCorrectMove} disabled={checking}>Jogar o lance certo e continuar</button>}
        </section>}
      </aside>
    </div>
  </main>
}
