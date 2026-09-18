import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import ChessBoard from './components/ChessBoard'
import { openingFor } from './chess-tools'
import {
  listGameHistory, listReviews, listTrainingProgress, nextTrainingProgress, putTrainingProgress,
  type StoredGame, type StoredReview, type TrainingProgress,
} from './persistence'
import { ENDGAME_POSITIONS, TACTICAL_POSITIONS, type TrainingPosition } from './training-data'
import './styles/training.css'

type ReviewRow = {
  ply: number
  san: string
  actual: string
  best: string
  bestSan: string
  label: string
  loss: number
  fenBefore: string
  ideas: string[]
}

type ErrorPuzzle = TrainingPosition & { source: 'review'; loss: number }
type Area = 'overview' | 'errors' | 'tactics' | 'endgames'

function errorPuzzles(reviews: StoredReview<ReviewRow>[]): ErrorPuzzle[] {
  const unique = new Map<string, ErrorPuzzle>()
  for (const review of reviews) {
    for (const row of review.rows) {
      if (!['Erro', 'Erro grave'].includes(row.label) || !row.fenBefore || !row.best) continue
      const id = `error:${row.fenBefore}:${row.best}`
      if (unique.has(id)) continue
      unique.set(id, {
        id,
        title: `${row.label} no lance ${Math.ceil(row.ply / 2)}`,
        category: 'Seus erros',
        theme: row.ideas[0] ?? 'melhor lance',
        fen: row.fenBefore,
        side: new Chess(row.fenBefore).turn(),
        solution: row.best,
        explanation: row.ideas.length ? `Ideias: ${row.ideas.join(' · ')}` : `O melhor lance era ${row.bestSan}.`,
        source: 'review',
        loss: row.loss,
      })
    }
  }
  return [...unique.values()].sort((a, b) => b.loss - a.loss)
}

function detectOpening(pgn: string) {
  try {
    const full = new Chess()
    full.loadPgn(pgn)
    const replay = new Chess()
    let name = 'Fora do livro'
    for (const san of full.history().slice(0, 20)) {
      replay.move(san)
      const opening = openingFor(replay)
      if (opening) name = opening.name
    }
    return name
  } catch {
    return 'PGN não identificado'
  }
}

function TrainingBoard({
  position, pieceSet, progress, onResult,
}: {
  position: TrainingPosition
  pieceSet: string
  progress?: TrainingProgress
  onResult: (success: boolean) => void
}) {
  const [game, setGame] = useState(() => new Chess(position.fen))
  const [selected, setSelected] = useState<Square | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const legalTargets = useMemo(() => selected ? new Set(game.moves({ square: selected, verbose: true }).map((move) => move.to)) : new Set<Square>(), [game, selected])

  useEffect(() => {
    setGame(new Chess(position.fen))
    setSelected(null)
    setFeedback(null)
  }, [position.id, position.fen])

  function click(square: Square) {
    if (feedback?.startsWith('Correto')) return
    const piece = game.get(square)
    if (!selected) {
      if (piece?.color === game.turn()) setSelected(square)
      return
    }
    if (piece?.color === game.turn()) {
      setSelected(square)
      return
    }
    const candidate = game.moves({ square: selected, verbose: true }).find((move) => move.to === square)
    if (!candidate) { setSelected(null); return }
    const uci = `${candidate.from}${candidate.to}${candidate.promotion ?? ''}`
    const normalized = position.solution.length === 5 && uci.length === 4 ? `${uci}${position.solution[4]}` : uci
    const success = normalized === position.solution
    if (success) {
      const next = new Chess(position.fen)
      next.move({ from: candidate.from, to: candidate.to, promotion: (position.solution[4] || candidate.promotion || 'q') as PieceSymbol })
      setGame(next)
      setFeedback(`Correto. ${position.explanation}`)
    } else {
      setFeedback('Ainda não. Reavalie xeques, capturas, ameaças e peças sem defesa.')
    }
    setSelected(null)
    onResult(success)
  }

  return <div className="training-exercise">
    <div className="training-board-wrap"><ChessBoard game={game} orientation={position.side} pieceSet={pieceSet} ariaLabel={position.title} selected={selected} legalTargets={legalTargets} onSquareClick={click} showCoordinates /></div>
    <div className="training-exercise-copy">
      <span className="eyebrow">{position.category.toUpperCase()}</span>
      <h2>{position.title}</h2>
      <p>{position.theme}</p>
      <small>{progress?.attempts ? `${progress.successes}/${progress.attempts} acertos · sequência ${progress.streak}` : 'Ainda não praticado'}</small>
      {feedback && <div className={feedback.startsWith('Correto') ? 'training-feedback success' : 'training-feedback'}>{feedback}</div>}
      <details><summary>Ver solução</summary><code>{position.solution}</code><p>{position.explanation}</p></details>
    </div>
  </div>
}

export default function TrainingHub({ pieceSet }: { pieceSet: string }) {
  const [area, setArea] = useState<Area>('overview')
  const [reviews, setReviews] = useState<StoredReview<ReviewRow>[]>([])
  const [games, setGames] = useState<StoredGame[]>([])
  const [progress, setProgress] = useState<TrainingProgress[]>([])
  const [index, setIndex] = useState(0)

  async function refresh() {
    const [nextReviews, nextGames, nextProgress] = await Promise.all([
      listReviews<ReviewRow>(), listGameHistory(), listTrainingProgress(),
    ])
    setReviews(nextReviews)
    setGames(nextGames)
    setProgress(nextProgress)
  }

  useEffect(() => { void refresh() }, [])

  const errors = useMemo(() => errorPuzzles(reviews), [reviews])
  const progressMap = useMemo(() => new Map(progress.map((item) => [item.id, item])), [progress])
  const now = Date.now()
  const dueErrors = useMemo(() => errors.filter((puzzle) => (progressMap.get(puzzle.id)?.nextReviewAt ?? 0) <= now), [errors, progressMap, now])
  const orderedErrors = dueErrors.length ? dueErrors : errors
  const currentList: TrainingPosition[] = area === 'errors' ? orderedErrors : area === 'tactics' ? TACTICAL_POSITIONS : area === 'endgames' ? ENDGAME_POSITIONS : []
  const current = currentList.length ? currentList[index % currentList.length] : null

  const weakness = useMemo(() => {
    const counts = new Map<string, number>()
    for (const review of reviews) for (const row of review.rows) {
      if (!['Erro', 'Erro grave'].includes(row.label)) continue
      for (const idea of row.ideas.slice(0, 3)) counts.set(idea, (counts.get(idea) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [reviews])

  const openingStats = useMemo(() => {
    const grouped = new Map<string, { games: number; total: number }>()
    for (const game of games) {
      const name = detectOpening(game.pgn)
      const row = grouped.get(name) ?? { games: 0, total: 0 }
      row.games += 1; row.total += game.accuracy; grouped.set(name, row)
    }
    return [...grouped.entries()].map(([name, value]) => ({ name, games: value.games, accuracy: Math.round(value.total / value.games) })).sort((a, b) => b.games - a.games)
  }, [games])

  const solved = progress.reduce((sum, item) => sum + item.successes, 0)
  const attempts = progress.reduce((sum, item) => sum + item.attempts, 0)
  const accuracy = attempts ? Math.round(solved / attempts * 100) : 0

  async function record(position: TrainingPosition, success: boolean) {
    const currentProgress = progressMap.get(position.id)
    const next = nextTrainingProgress(currentProgress, success)
    next.id = position.id
    await putTrainingProgress(next)
    setProgress((items) => [...items.filter((item) => item.id !== position.id), next])
    if (success) window.setTimeout(() => setIndex((value) => value + 1), 650)
  }

  return <main className="training-shell">
    <header className="training-header">
      <div><span className="eyebrow">TREINO PERSONALIZADO</span><h1>Centro de Treino</h1><p>Puzzles gerados das suas revisões, repetição espaçada e módulos locais de finais e tática.</p></div>
      <div className="training-nav">
        <button className={area === 'overview' ? 'active' : ''} onClick={() => setArea('overview')}>Progresso</button>
        <button className={area === 'errors' ? 'active' : ''} onClick={() => { setIndex(0); setArea('errors') }}>Seus erros ({errors.length})</button>
        <button className={area === 'tactics' ? 'active' : ''} onClick={() => { setIndex(0); setArea('tactics') }}>Táticas</button>
        <button className={area === 'endgames' ? 'active' : ''} onClick={() => { setIndex(0); setArea('endgames') }}>Finais</button>
      </div>
    </header>

    {area === 'overview' ? <>
      <section className="training-metrics">
        <div><span>Partidas revisadas</span><strong>{games.length}</strong></div>
        <div><span>Puzzles próprios</span><strong>{errors.length}</strong></div>
        <div><span>Para revisar agora</span><strong>{dueErrors.length}</strong></div>
        <div><span>Precisão no treino</span><strong>{accuracy}%</strong></div>
      </section>
      <section className="training-dashboard-grid">
        <article className="training-card"><div className="card-title"><strong>Mapa de fraquezas</strong><span>erros recorrentes</span></div>
          {weakness.length ? <div className="weakness-list">{weakness.map(([name, count]) => <div key={name}><span>{name}</span><b>{count}</b><i style={{ width: `${Math.min(100, count / weakness[0][1] * 100)}%` }} /></div>)}</div> : <p className="empty-state">Revise partidas para gerar seu mapa de fraquezas.</p>}
        </article>
        <article className="training-card"><div className="card-title"><strong>Desempenho por abertura</strong><span>partidas revisadas</span></div>
          {openingStats.length ? <div className="opening-stats">{openingStats.slice(0, 8).map((item) => <div key={item.name}><span>{item.name}</span><b>{item.accuracy}%</b><small>{item.games} partida(s)</small></div>)}</div> : <p className="empty-state">Nenhuma partida revisada disponível.</p>}
        </article>
      </section>
      <section className="training-card training-next"><div><span className="eyebrow">PRÓXIMA SESSÃO</span><h2>{dueErrors.length ? `${dueErrors.length} erro(s) prontos para revisão` : errors.length ? 'Revisões em dia' : 'Analise uma partida para gerar seus primeiros puzzles'}</h2></div>{errors.length > 0 && <button onClick={() => { setIndex(0); setArea('errors') }}>Treinar agora</button>}</section>
    </> : current ? <>
      <TrainingBoard position={current} pieceSet={pieceSet} progress={progressMap.get(current.id)} onResult={(success) => void record(current, success)} />
      <div className="training-pager"><button onClick={() => setIndex((value) => Math.max(0, value - 1))}>Anterior</button><span>{(index % currentList.length) + 1} / {currentList.length}</span><button onClick={() => setIndex((value) => value + 1)}>Próximo</button></div>
    </> : <section className="training-card"><h2>Nenhum puzzle próprio ainda</h2><p>Finalize ou importe uma partida, execute a revisão pós-partida e os erros serão transformados automaticamente em exercícios.</p></section>}
  </main>
}
