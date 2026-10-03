import { Chess, type Color, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import ChessBoard from './components/ChessBoard'
import { ecoContinuations, ecoOpeningFor, useEco } from './eco'
import { AnalysisCancelledError, type StockfishEngine } from './engine'
import { courseCategories, OPENING_COURSES, type OpeningCourse } from './openings-data'
import { courseFromPgn, loadRepertoire, REPERTOIRE_CATEGORY, RepertoireError, saveRepertoire } from './repertoire'
import './styles/openings.css'

const OFF_BOOK_THRESHOLD_CP = 40
const CHECK_DEPTH = 12
const REJECTED_FLASH_MS = 700
const MAX_ECO_CONTINUATIONS = 8

type Feedback = { kind: 'correct' | 'off-book' | 'mistake' | 'info'; text: string } | null
type TrainerMode = 'lesson' | 'quiz'

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
  const [rejected, setRejected] = useState<{ from: Square; to: Square } | null>(null)
  const sessionTokenRef = useRef(0)
  const mountedRef = useRef(true)
  // Re-arm on every mount: StrictMode runs mount → cleanup → mount, and a cleanup-only effect
  // would leave the flag stuck at false, silently freezing the quiz and the engine feedback.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const [customCourses, setCustomCourses] = useState<OpeningCourse[]>(loadRepertoire)
  const [importing, setImporting] = useState(false)
  const [importName, setImportName] = useState('')
  const [importSide, setImportSide] = useState<Color>('w')
  const [importPgn, setImportPgn] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const eco = useEco()

  const allCourses = useMemo(() => [...OPENING_COURSES, ...customCourses], [customCourses])
  const course = allCourses.find((item) => item.id === selectedId) ?? OPENING_COURSES[0]
  const filteredCourses = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term
      ? allCourses.filter((item) => item.name.toLowerCase().includes(term) || item.eco.toLowerCase().includes(term))
      : allCourses
  }, [query, allCourses])
  const categories = useMemo(
    () => (customCourses.length ? [...courseCategories(), REPERTOIRE_CATEGORY] : courseCategories()),
    [customCourses.length],
  )

  const game = useMemo(() => gameUpTo(course, stepIndex), [course, stepIndex])
  const orientation = studentSide
  const currentStep = course.steps[stepIndex] ?? null
  const previousStep = stepIndex > 0 ? course.steps[stepIndex - 1] : null
  const finished = mode === 'quiz' && currentStep === null
  const isStudentTurn = mode === 'quiz' && currentStep !== null && game.turn() === studentSide
  const legalMoves = useMemo(
    () => (selected && isStudentTurn ? game.moves({ square: selected, verbose: true }) : []),
    [game, selected, isStudentTurn],
  )
  const legalTargets = useMemo(() => new Set(legalMoves.map((move) => move.to)), [legalMoves])
  const lastMove = useMemo(() => {
    if (stepIndex === 0) return null
    const replay = gameUpTo(course, stepIndex - 1)
    try {
      const move = replay.move(course.steps[stepIndex - 1].san)
      return { from: move.from, to: move.to }
    } catch {
      return null
    }
  }, [course, stepIndex])
  const ecoOpening = useMemo(() => (eco ? ecoOpeningFor(eco, game) : null), [eco, game])
  const ecoMoves = useMemo(() => (eco ? ecoContinuations(eco, game).slice(0, MAX_ECO_CONTINUATIONS) : []), [eco, game])
  const totalQuizMoves = useMemo(
    () => course.steps.filter((_, index) => gameUpTo(course, index).turn() === studentSide).length,
    [course, studentSide],
  )

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
    setRejected(null)
    setChecking(false)
  }

  function selectCourse(next: OpeningCourse) {
    resetSession({ id: next.id, side: next.studentSide })
  }

  function persistCustomCourses(next: OpeningCourse[]) {
    setCustomCourses(next)
    try {
      saveRepertoire(next)
    } catch {
      setImportError('Não foi possível salvar o repertório neste navegador.')
    }
  }

  async function importRepertoire(event: FormEvent) {
    event.preventDefault()
    setImportError(null)
    try {
      const imported = await courseFromPgn(importPgn, importName, importSide)
      // Read the list after the await: a course removed while the ECO data was loading must stay removed.
      persistCustomCourses([...loadRepertoire(), imported])
      setImporting(false)
      setImportName('')
      setImportPgn('')
      selectCourse(imported)
    } catch (error) {
      setImportError(error instanceof RepertoireError ? error.message : 'Não foi possível importar esse PGN.')
    }
  }

  function removeCustomCourse(target: OpeningCourse) {
    if (!window.confirm(`Remover "${target.name}" do seu repertório?`)) return
    persistCustomCourses(customCourses.filter((item) => item.id !== target.id))
    if (target.id === course.id) selectCourse(OPENING_COURSES[0])
  }
  function restart() {
    resetSession()
  }
  function switchMode(next: TrainerMode) {
    resetSession({ mode: next })
  }
  function switchSide(next: Color) {
    resetSession({ side: next })
  }

  useEffect(() => {
    if (mode !== 'quiz' || !currentStep) return
    if (game.turn() === studentSide) return
    const token = ++sessionTokenRef.current
    const timeout = window.setTimeout(() => {
      if (sessionTokenRef.current !== token || !mountedRef.current) return
      setFeedback({ kind: 'info', text: `${currentStep.san}: ${currentStep.comment}` })
      setStepIndex((value) => value + 1)
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [mode, stepIndex, currentStep, game, studentSide])

  async function tryStudentMove(from: Square, to: Square) {
    if (!currentStep || checking) return
    const token = sessionTokenRef.current
    const probe = gameUpTo(course, stepIndex)
    // chess.js lists under-promotions first; prefer the book's own move, else promote to a queen.
    const candidates = probe.moves({ square: from, verbose: true }).filter((move) => move.to === to)
    const candidate =
      candidates.find((move) => move.san === currentStep.san) ??
      candidates.find((move) => !move.promotion || move.promotion === 'q')
    if (!candidate) {
      setSelected(null)
      return
    }
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
    window.setTimeout(() => {
      if (sessionTokenRef.current === token && mountedRef.current) setRejected(null)
    }, REJECTED_FLASH_MS)

    if (!engine) {
      setMistakes((set) => new Set(set).add(stepIndex))
      setFeedback({
        kind: 'mistake',
        text: `Esse não é o lance principal aqui. O lance de livro é ${currentStep.san}: ${currentStep.comment}`,
      })
      return
    }

    setChecking(true)
    try {
      const played = gameUpTo(course, stepIndex)
      played.move(attemptedSan)
      const bookAfter = gameUpTo(course, stepIndex)
      bookAfter.move(currentStep.san)
      const playedEval = await engine.analyze(played.fen(), CHECK_DEPTH, 1)
      const bookEval = await engine.analyze(bookAfter.fen(), CHECK_DEPTH, 1)
      if (sessionTokenRef.current !== token || !mountedRef.current) return
      const playedScore = absoluteScore(playedEval.lines[0])
      const bookScore = absoluteScore(bookEval.lines[0])
      const sideSign = game.turn() === 'w' ? 1 : -1
      const loss = Math.round((bookScore - playedScore) * sideSign)
      if (loss <= OFF_BOOK_THRESHOLD_CP) {
        setFeedback({
          kind: 'off-book',
          text: `Fora do livro, mas é uma jogada razoável (diferença de ~${Math.max(0, loss)}cp). O lance clássico aqui é ${currentStep.san}: ${currentStep.comment}`,
        })
      } else {
        setMistakes((set) => new Set(set).add(stepIndex))
        setFeedback({
          kind: 'mistake',
          text: `${attemptedSan} enfraquece sua posição (perda ~${loss}cp). O lance de livro é ${currentStep.san}: ${currentStep.comment}`,
        })
      }
    } catch (error) {
      if (error instanceof AnalysisCancelledError) return
      if (sessionTokenRef.current !== token || !mountedRef.current) return
      setMistakes((set) => new Set(set).add(stepIndex))
      setFeedback({
        kind: 'mistake',
        text: `Esse não é o lance principal aqui. O lance de livro é ${currentStep.san}: ${currentStep.comment}`,
      })
    } finally {
      if (sessionTokenRef.current === token && mountedRef.current) setChecking(false)
    }
  }

  function clickSquare(square: Square) {
    if (mode !== 'quiz' || !isStudentTurn || checking) return
    const piece = game.get(square)
    if (!selected) {
      if (piece?.color === game.turn()) setSelected(square)
      return
    }
    if (piece?.color === game.turn()) {
      setSelected(square)
      return
    }
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
  function retreatLesson() {
    setStepIndex((value) => Math.max(0, value - 1))
  }

  return (
    <main className="trainer-shell">
      <header className="trainer-topbar">
        <div>
          <span className="eyebrow">MODO PROFESSOR</span>
          <h1>Estúdio de Aberturas</h1>
        </div>
      </header>
      <div className="trainer-layout">
        <aside className="trainer-sidebar">
          <input
            className="trainer-search"
            placeholder="Buscar abertura ou ECO..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="trainer-import-toggle"
            onClick={() => {
              setImporting((value) => !value)
              setImportError(null)
            }}
            aria-expanded={importing}
          >
            {importing ? 'Cancelar importação' : '+ Importar meu repertório (PGN)'}
          </button>
          {importing && (
            <form className="trainer-import-form" onSubmit={importRepertoire}>
              <input
                placeholder="Nome da linha (opcional)"
                value={importName}
                onChange={(event) => setImportName(event.target.value)}
                aria-label="Nome da linha"
              />
              <div className="trainer-side-toggle">
                <span>Você joga com</span>
                <button
                  type="button"
                  className={importSide === 'w' ? 'selected-tool' : ''}
                  onClick={() => setImportSide('w')}
                >
                  Brancas
                </button>
                <button
                  type="button"
                  className={importSide === 'b' ? 'selected-tool' : ''}
                  onClick={() => setImportSide('b')}
                >
                  Pretas
                </button>
              </div>
              <textarea
                placeholder={'1. e4 {Ocupa o centro} e5 2. Nf3 Nc6 ...'}
                value={importPgn}
                onChange={(event) => setImportPgn(event.target.value)}
                aria-label="PGN do repertório"
                required
              />
              <small>Comentários entre chaves viram as explicações dos lances. Só a linha principal é usada.</small>
              {importError && (
                <p className="trainer-import-error" role="alert">
                  {importError}
                </p>
              )}
              <button type="submit" className="trainer-reveal" disabled={!importPgn.trim()}>
                Salvar no repertório
              </button>
            </form>
          )}
          <div className="trainer-course-list">
            {categories.map((category) => {
              const items = filteredCourses.filter((item) => item.category === category)
              if (!items.length) return null
              return (
                <div key={category} className="trainer-category">
                  <span className="trainer-category-label">{category}</span>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      className={`trainer-course-item ${item.id === course.id ? 'active' : ''}`}
                      onClick={() => selectCourse(item)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.eco}</span>
                    </button>
                  ))}
                </div>
              )
            })}
            {!filteredCourses.length && <p className="empty-state">Nenhuma abertura encontrada para essa busca.</p>}
          </div>
        </aside>

        <div className="trainer-board-column">
          <div className="board-frame trainer-board-frame">
            <ChessBoard
              game={game}
              orientation={orientation}
              pieceSet={pieceSet}
              ariaLabel="Tabuleiro de estudo de aberturas"
              selected={selected}
              legalTargets={legalTargets}
              lastMove={lastMove}
              classForSquare={(square) => (rejected?.from === square || rejected?.to === square ? 'rejected' : '')}
              onSquareClick={clickSquare}
            />
          </div>
          <div className="trainer-controls">
            {mode === 'lesson' ? (
              <>
                <button onClick={retreatLesson} disabled={stepIndex === 0}>
                  ← Lance anterior
                </button>
                <span>
                  {stepIndex} / {course.steps.length}
                </span>
                <button onClick={advanceLesson} disabled={stepIndex >= course.steps.length}>
                  Próximo lance →
                </button>
              </>
            ) : (
              <>
                <button onClick={restart}>Reiniciar linha</button>
                <span>
                  {attempted.size} / {totalQuizMoves} testados · {mistakes.size} erro(s)
                </span>
              </>
            )}
          </div>
        </div>

        <aside className="trainer-panel">
          <section className="card trainer-course-card">
            <div className="card-title">
              <strong>{course.name}</strong>
              <span>{course.eco}</span>
            </div>
            <p>{course.summary}</p>
            {course.category === REPERTOIRE_CATEGORY && (
              <button className="trainer-remove-course" onClick={() => removeCustomCourse(course)}>
                Remover do repertório
              </button>
            )}
            <div className="trainer-mode-toggle">
              <button className={mode === 'lesson' ? 'selected-tool' : ''} onClick={() => switchMode('lesson')}>
                Lição explicada
              </button>
              <button className={mode === 'quiz' ? 'selected-tool' : ''} onClick={() => switchMode('quiz')}>
                Treino ativo
              </button>
            </div>
            <div className="trainer-side-toggle">
              <span>Você joga com</span>
              <button className={studentSide === 'w' ? 'selected-tool' : ''} onClick={() => switchSide('w')}>
                Brancas
              </button>
              <button className={studentSide === 'b' ? 'selected-tool' : ''} onClick={() => switchSide('b')}>
                Pretas
              </button>
            </div>
          </section>
          {mode === 'lesson' && (
            <section className="card trainer-step-card">
              <div className="card-title">
                <strong>Explicação</strong>
                <span>
                  lance {stepIndex} de {course.steps.length}
                </span>
              </div>
              {previousStep ? (
                <>
                  <b>{previousStep.san}</b>
                  <p>{previousStep.comment}</p>
                </>
              ) : (
                <p className="empty-state">Posição inicial. Clique em "Próximo lance" para começar a lição.</p>
              )}
              {currentStep && (
                <p className="trainer-next-hint">
                  A seguir: <code>{currentStep.san}</code>
                </p>
              )}
              {!currentStep && (
                <p className="trainer-end-note">
                  Fim da linha estudada. Você pode continuar explorando a posição no modo Análise livre do tabuleiro
                  principal.
                </p>
              )}
            </section>
          )}
          {mode === 'quiz' && (
            <section className={`card trainer-step-card ${feedback?.kind ?? ''}`}>
              <div className="card-title">
                <strong>Treino ativo</strong>
                {checking && <span className="mini-loader" />}
              </div>
              {finished ? (
                <div>
                  <strong>Linha concluída!</strong>
                  <p>
                    {mistakes.size === 0
                      ? 'Você acertou todos os lances de memória. Excelente domínio dessa linha.'
                      : `Você errou ${mistakes.size} lance(s) nesta tentativa. Reinicie para treinar novamente.`}
                  </p>
                </div>
              ) : isStudentTurn ? (
                <p>
                  Sua vez: encontre o lance principal da linha para {studentSide === 'w' ? 'as brancas' : 'as pretas'}.
                </p>
              ) : (
                <p className="muted">O oponente está jogando o lance de livro...</p>
              )}
              {feedback && <div className={`trainer-feedback ${feedback.kind}`}>{feedback.text}</div>}
              {(feedback?.kind === 'mistake' || feedback?.kind === 'off-book') && !finished && (
                <button className="trainer-reveal" onClick={playCorrectMove} disabled={checking}>
                  Jogar o lance certo e continuar
                </button>
              )}
            </section>
          )}
          <section className="card trainer-eco-card">
            <div className="card-title">
              <strong>Base ECO</strong>
              <span>{ecoOpening?.eco ?? '—'}</span>
            </div>
            {!eco ? (
              <p className="empty-state">Carregando a base de aberturas…</p>
            ) : (
              <>
                {ecoOpening ? <b>{ecoOpening.name}</b> : <p className="empty-state">Posição inicial.</p>}
                {ecoMoves.length ? (
                  <ul>
                    {ecoMoves.map((move) => (
                      <li key={move.san}>
                        <code>{move.san}</code>
                        <span>
                          {move.eco} · {move.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">Nenhuma continuação catalogada a partir desta posição.</p>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}
