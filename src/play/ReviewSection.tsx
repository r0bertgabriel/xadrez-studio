import { displayEval } from '../chess-analysis'
import type { ReviewMove } from '../game-helpers'
import type { PlaySession } from '../hooks/usePlaySession'

const CHART_WIDTH = 600

function chartPoint(row: ReviewMove, index: number, count: number) {
  const x = count === 1 ? CHART_WIDTH / 2 : index * (CHART_WIDTH / (count - 1))
  const y = Math.max(5, Math.min(115, 60 - row.eval / 25))
  return { x, y }
}

function EvaluationChart({ session }: { session: PlaySession }) {
  const { review, selectedReviewPly, selectReviewRow } = session
  const points = review.map((row, index) => chartPoint(row, index, review.length))
  return (
    <div className="eval-chart">
      <svg viewBox={`0 0 ${CHART_WIDTH} 120`} preserveAspectRatio="none">
        <line x1="0" y1="60" x2={CHART_WIDTH} y2="60" />
        <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {review.map((row, index) => (
          <circle
            key={row.ply}
            className={selectedReviewPly === row.ply ? 'selected-point' : ''}
            cx={points[index].x}
            cy={points[index].y}
            r="4"
            onClick={() => selectReviewRow(row.ply)}
          >
            <title>{`${row.san}: ${displayEval(row.eval)}`}</title>
          </circle>
        ))}
      </svg>
      <small>Clique em um ponto para abrir o lance.</small>
    </div>
  )
}

function PuzzleLab({ session }: { session: PlaySession }) {
  const { puzzles, puzzleIndex, setPuzzleIndex, activePuzzle } = session
  if (!puzzles.length) return null
  return (
    <div className="puzzle-lab">
      <div>
        <span className="eyebrow">TREINO DOS SEUS ERROS</span>
        <h3>{puzzles.length} posição(ões) para praticar</h3>
      </div>
      <button
        onClick={() => {
          setPuzzleIndex(0)
          session.setViewPly(null)
        }}
      >
        Treinar erros
      </button>
      {activePuzzle && (
        <div className="puzzle-card">
          <strong>Encontre a melhor jogada da posição antes de {activePuzzle.san}</strong>
          <code>{activePuzzle.fenBefore}</code>
          <button onClick={() => session.openPuzzlePosition(activePuzzle.fenBefore)}>
            Abrir posição na ferramenta FEN
          </button>
          <details>
            <summary>Ver solução</summary>
            <b>{activePuzzle.bestSan}</b> · {activePuzzle.ideas.join(', ')}
          </details>
          <div className="puzzle-nav">
            <button onClick={() => setPuzzleIndex((value) => Math.max(0, (value ?? 0) - 1))}>Anterior</button>
            <span>
              {(puzzleIndex ?? 0) + 1}/{puzzles.length}
            </span>
            <button onClick={() => setPuzzleIndex((value) => Math.min(puzzles.length - 1, (value ?? 0) + 1))}>
              Próximo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReviewSection({ session }: { session: PlaySession }) {
  const { review, accuracy, selectedReviewPly, selectedReview, selectReviewRow } = session
  if (!review.length) return null
  const qualityCounts = review.reduce<Record<string, number>>((counts, row) => {
    counts[row.label] = (counts[row.label] ?? 0) + 1
    return counts
  }, {})

  return (
    <section className="review-section">
      <div className="review-header">
        <div>
          <span className="eyebrow">PÓS-PARTIDA</span>
          <h2>Revisão interativa</h2>
        </div>
        <div className="accuracy">
          <span>Precisão estimada</span>
          <strong>{accuracy}%</strong>
        </div>
      </div>
      <div className="quality-summary">
        {Object.entries(qualityCounts).map(([label, count]) => (
          <span key={label}>
            <b>{count}</b> {label}
          </span>
        ))}
      </div>
      <EvaluationChart session={session} />
      <div className="review-grid">
        {review.map((row) => (
          <button
            className={`review-row ${selectedReviewPly === row.ply ? 'selected-review' : ''}`}
            key={row.ply}
            onClick={() => selectReviewRow(row.ply)}
          >
            <div className="move-number">
              {Math.ceil(row.ply / 2)}
              {row.ply % 2 === 0 ? '…' : '.'}
            </div>
            <div>
              <strong>{row.san}</strong>
              <small>{row.actual}</small>
            </div>
            <span className={`quality q-${row.label.toLowerCase().replaceAll(' ', '-')}`}>{row.label}</span>
            <div>
              <small>melhor</small>
              <code>{row.bestSan}</code>
            </div>
            <div>
              <small>perda</small>
              <strong>{row.loss} cp</strong>
            </div>
            <div>
              <small>avaliação</small>
              <strong>{displayEval(row.eval)}</strong>
            </div>
          </button>
        ))}
      </div>
      {selectedReview && (
        <div className="review-detail">
          <div>
            <span>Seu lance</span>
            <strong>{selectedReview.san}</strong>
            <code>{selectedReview.actual}</code>
          </div>
          <div className="versus">×</div>
          <div>
            <span>Melhor lance</span>
            <strong>{selectedReview.bestSan}</strong>
            <code>{selectedReview.best}</code>
          </div>
          <p>{selectedReview.ideas.join(' · ')}</p>
        </div>
      )}
      <PuzzleLab session={session} />
    </section>
  )
}
