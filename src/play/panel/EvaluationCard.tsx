import { useEffect, useMemo, useState } from 'react'
import { displayEval, expectedScore, formatEval, scoreForSide, scoreOf } from '../../chess-analysis'
import type { PlaySession } from '../../hooks/usePlaySession'

type EvaluationState = 'winning' | 'better' | 'equal' | 'worse' | 'losing'

const EVALUATION_COPY: Record<EvaluationState, { label: string; description: string }> = {
  winning: { label: 'Vantagem decisiva', description: 'Converta a vantagem com lances seguros e sem pressa.' },
  better: { label: 'Você está melhor', description: 'Há espaço para pressionar e aumentar sua iniciativa.' },
  equal: { label: 'Posição equilibrada', description: 'Nenhum lado tem uma vantagem relevante neste momento.' },
  worse: { label: 'Você está pior', description: 'A posição pede atenção: procure recursos defensivos.' },
  losing: { label: 'Posição crítica', description: 'Priorize defesa, segurança do rei e reduza riscos.' },
}

/** Centipawn thresholds between the five states, from "losing" up to "winning". */
const THRESHOLDS = [-180, -60, 60, 180]
const LIVE_INTERVAL_MS = 150
const CHART_HEIGHT = 56

function evaluationState(score: number): EvaluationState {
  if (score >= THRESHOLDS[3]) return 'winning'
  if (score >= THRESHOLDS[2]) return 'better'
  if (score <= THRESHOLDS[0]) return 'losing'
  if (score <= THRESHOLDS[1]) return 'worse'
  return 'equal'
}

const isMate = (score: number) => Math.abs(score) > 9000

/** Expected score (0–1) of a `scoreOf`-encoded evaluation, where mates are ±(10000 − n). */
function expectation(score: number) {
  return isMate(score) ? (score > 0 ? 1 : 0) : expectedScore({ cp: score, mate: null })
}

/** Zone widths of the meter in expectation space, so the marker and the state label always agree. */
const ZONE_COLUMNS = [0, ...THRESHOLDS.map(expectation), 1]
  .slice(1)
  .map((edge, index, edges) => `${((edge - (index ? edges[index - 1] : 0)) * 100).toFixed(2)}fr`)
  .join(' ')

type LiveEval = { fen: string; score: number; depth: number }

/**
 * Follows every Stockfish search: the live estimate of the current position while it is being calculated,
 * plus the final score of every position it finishes, keyed by FEN (the post-game review fills in past moves).
 */
function useEngineEvaluations(engine: PlaySession['engine'], currentFen: string) {
  const [live, setLive] = useState<LiveEval | null>(null)
  const [settled, setSettled] = useState<Map<string, number>>(() => new Map())

  useEffect(() => {
    if (!engine) return
    let lastLive = 0
    return engine.subscribe((progress) => {
      const line = progress.lines[0]
      if (!line || (line.scoreCp === null && line.mate === null)) return
      const score = scoreOf({ bestMove: '', lines: progress.lines })
      if (progress.done) {
        setSettled((previous) => {
          if (previous.get(progress.fen) === score) return previous
          return new Map(previous).set(progress.fen, score)
        })
      }
      const now = performance.now()
      if (!progress.done && now - lastLive < LIVE_INTERVAL_MS) return
      lastLive = now
      setLive({ fen: progress.fen, score, depth: progress.depth })
    })
  }, [engine])

  return { live: live?.fen === currentFen ? live : null, settled }
}

function EvaluationChart({
  points,
  activePly,
  onSelect,
}: {
  points: (number | null)[]
  activePly: number
  onSelect: (ply: number) => void
}) {
  const columns = points.length
  const x = (ply: number) => ((ply + 0.5) / columns) * 100
  const y = (value: number) => (1 - value) * CHART_HEIGHT
  const known = points.flatMap((value, ply) => (value === null ? [] : [{ ply, value }]))
  const path = known.map(({ ply, value }, index) => `${index ? 'L' : 'M'}${x(ply)},${y(value)}`).join(' ')
  const area = known.length
    ? `${path} L${x(known[known.length - 1].ply)},${y(0.5)} L${x(known[0].ply)},${y(0.5)} Z`
    : ''

  return (
    <div className="evaluation-chart">
      <svg viewBox={`0 0 100 ${CHART_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <clipPath id="evaluation-chart-upper">
            <rect x="0" y="0" width="100" height={CHART_HEIGHT / 2} />
          </clipPath>
          <clipPath id="evaluation-chart-lower">
            <rect x="0" y={CHART_HEIGHT / 2} width="100" height={CHART_HEIGHT / 2} />
          </clipPath>
        </defs>
        <line className="chart-midline" x1="0" x2="100" y1={y(0.5)} y2={y(0.5)} />
        {area && (
          <>
            <path className="chart-area-upper" d={area} clipPath="url(#evaluation-chart-upper)" />
            <path className="chart-area-lower" d={area} clipPath="url(#evaluation-chart-lower)" />
            <path className="chart-line" d={path} />
          </>
        )}
        <line className="chart-cursor" x1={x(activePly)} x2={x(activePly)} y1="0" y2={CHART_HEIGHT} />
      </svg>
      <div className="evaluation-chart-hits">
        {points.map((value, ply) => (
          <button
            key={ply}
            type="button"
            className={ply === activePly ? 'active' : ''}
            onClick={() => onSelect(ply)}
            title={
              ply === 0
                ? 'Posição inicial'
                : `Lance ${Math.ceil(ply / 2)}${ply % 2 ? '' : '…'}${value === null ? '' : ` · ${Math.round(value * 100)}%`}`
            }
            aria-label={`Ver posição após ${ply} meio-lances`}
          />
        ))}
      </div>
    </div>
  )
}

export default function EvaluationCard({ session }: { session: PlaySession }) {
  const { analysis, perspective, mode, playerSide, mateAlert, liveGame, thinking, viewPly, viewMove } = session
  const fens = useMemo(() => {
    const moves = liveGame.history({ verbose: true })
    return [moves[0]?.before ?? liveGame.fen(), ...moves.map((move) => move.after)]
  }, [liveGame])
  const { live, settled } = useEngineEvaluations(session.engine, fens[fens.length - 1])

  // While Stockfish is still calculating, show its running estimate instead of an empty card.
  const whiteScore = analysis ? scoreOf(analysis) : live?.score
  const hasEval = whiteScore !== undefined
  const score = hasEval ? scoreForSide(whiteScore, perspective) : 0
  const provisional = !analysis && hasEval
  const depth = analysis?.lines[0]?.depth ?? live?.depth ?? null
  const state = hasEval ? evaluationState(score) : 'equal'
  const copy = hasEval
    ? EVALUATION_COPY[state]
    : {
        label: 'Aguardando avaliação',
        description: 'A engine mostrará o balanço da posição assim que começar o cálculo.',
      }
  const chance = expectation(score)

  const currentPly = fens.length - 1
  const points = fens.map((fen, ply) => {
    const white = ply === currentPly && hasEval ? whiteScore : settled.get(fen)
    return white === undefined ? null : expectation(scoreForSide(white, perspective))
  })
  const previousWhite = currentPly > 0 ? settled.get(fens[currentPly - 1]) : undefined
  const previous = previousWhite === undefined ? null : scoreForSide(previousWhite, perspective)
  const delta = hasEval && previous !== null && !isMate(score) && !isMate(previous) ? score - previous : null
  const swing = previous !== null && hasEval ? Math.round((chance - expectation(previous)) * 100) : null

  const displayed = hasEval
    ? analysis
      ? formatEval(analysis, perspective)
      : isMate(score)
        ? `${score > 0 ? 'M+' : 'M−'}${10000 - Math.abs(score)}`
        : displayEval(score)
    : '—'
  const ownerLabel = mode === 'analysis' ? 'Brancas' : 'Você'

  return (
    <section className={`eval-card eval-${state} ${provisional ? 'is-provisional' : ''}`}>
      <div className="card-heading">
        <div>
          <span className="section-label">AVALIAÇÃO {mode === 'analysis' ? 'DAS BRANCAS' : 'DO SEU LADO'}</span>
          <strong className="big-eval" aria-live="polite">
            {displayed}
          </strong>
        </div>
        <div className="eval-heading-meta">
          <span className="side-badge">
            {mode === 'analysis' ? 'Livre' : playerSide === 'w' ? 'Brancas' : 'Pretas'}
          </span>
          <span className={`eval-depth ${thinking ? 'is-live' : ''}`}>
            {depth ? `${thinking ? 'calculando · ' : ''}prof. ${depth}` : thinking ? 'calculando' : ''}
          </span>
        </div>
      </div>

      <div
        className="evaluation-meter"
        role="meter"
        aria-label={`Expectativa de resultado: ${Math.round(chance * 100)}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(chance * 100)}
      >
        <div className="meter-zones" style={{ gridTemplateColumns: ZONE_COLUMNS }} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="meter-marker" style={{ left: `${Math.max(2, Math.min(98, chance * 100))}%` }}>
          <span />
        </div>
      </div>
      <div className="evaluation-axis" aria-hidden="true">
        <span>Crítica</span>
        <span>Igual</span>
        <span>Ganha</span>
      </div>

      <dl className="evaluation-facts">
        <div>
          <dt>Expectativa</dt>
          <dd>{hasEval ? `${Math.round(chance * 100)}%` : '—'}</dd>
        </div>
        <div>
          <dt>Último lance</dt>
          <dd className={swing === null || swing === 0 ? '' : swing > 0 ? 'is-up' : 'is-down'}>
            {swing === null
              ? '—'
              : delta !== null
                ? `${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${displayEval(Math.abs(delta)).replace('+', '')}`
                : `${swing > 0 ? '▲' : swing < 0 ? '▼' : '='} ${Math.abs(swing)} pts`}
          </dd>
        </div>
        <div>
          <dt>Material</dt>
          <dd>{materialBalance(liveGame.board(), perspective)}</dd>
        </div>
      </dl>

      {currentPly > 0 && (
        <div className="evaluation-trend">
          <div className="evaluation-trend-title">
            <span>Evolução da partida</span>
            <small>{ownerLabel} ↑</small>
          </div>
          <EvaluationChart points={points} activePly={viewPly ?? currentPly} onSelect={viewMove} />
        </div>
      )}

      <div className="evaluation-summary">
        <span>
          <i />
          {copy.label}
        </span>
        {mateAlert ? <strong className="mate-inline">{mateAlert}</strong> : <small>{copy.description}</small>}
      </div>
    </section>
  )
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Material difference in pawns from `side`'s point of view, e.g. "+2" or "=". */
function materialBalance(board: ReturnType<PlaySession['liveGame']['board']>, side: 'w' | 'b') {
  let balance = 0
  for (const row of board)
    for (const square of row) if (square) balance += PIECE_VALUES[square.type] * (square.color === side ? 1 : -1)
  return balance === 0 ? '=' : `${balance > 0 ? '+' : '−'}${Math.abs(balance)}`
}
