import { formatEval } from '../../chess-analysis'
import type { PlaySession } from '../../hooks/usePlaySession'

type EvaluationState = 'winning' | 'better' | 'equal' | 'worse' | 'losing'

const EVALUATION_COPY: Record<EvaluationState, { label: string; description: string }> = {
  winning: { label: 'Vantagem decisiva', description: 'Converta a vantagem com lances seguros e sem pressa.' },
  better: { label: 'Você está melhor', description: 'Há espaço para pressionar e aumentar sua iniciativa.' },
  equal: { label: 'Posição equilibrada', description: 'Nenhum lado tem uma vantagem relevante neste momento.' },
  worse: { label: 'Você está pior', description: 'A posição pede atenção: procure recursos defensivos.' },
  losing: { label: 'Posição crítica', description: 'Priorize defesa, segurança do rei e reduza riscos.' },
}

function evaluationState(score: number): EvaluationState {
  if (score >= 180) return 'winning'
  if (score >= 60) return 'better'
  if (score <= -180) return 'losing'
  if (score <= -60) return 'worse'
  return 'equal'
}

export default function EvaluationCard({ session }: { session: PlaySession }) {
  const { analysis, userEval, perspective, mode, playerSide, mateAlert } = session
  const state = analysis ? evaluationState(userEval) : 'equal'
  const copy = analysis
    ? EVALUATION_COPY[state]
    : {
        label: 'Aguardando avaliação',
        description: 'A engine mostrará o balanço da posição assim que concluir o cálculo.',
      }
  const percent = Math.max(4, Math.min(96, 50 + userEval / 20))

  return (
    <section className={`eval-card eval-${state}`}>
      <div className="card-heading">
        <div>
          <span className="section-label">AVALIAÇÃO {mode === 'analysis' ? 'DAS BRANCAS' : 'DO SEU LADO'}</span>
          <strong className="big-eval">{analysis ? formatEval(analysis, perspective) : '—'}</strong>
        </div>
        <span className="side-badge">{mode === 'analysis' ? 'Livre' : playerSide === 'w' ? 'Brancas' : 'Pretas'}</span>
      </div>
      <div
        className="evaluation-meter"
        role="meter"
        aria-label="Balanço da posição"
        aria-valuemin={-1000}
        aria-valuemax={1000}
        aria-valuenow={Math.max(-1000, Math.min(1000, userEval))}
      >
        <div className="meter-zones" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="meter-marker" style={{ left: `${percent}%` }}>
          <span />
        </div>
      </div>
      <div className="evaluation-axis" aria-hidden="true">
        <span>Crítica</span>
        <span>Pior</span>
        <span>Igual</span>
        <span>Melhor</span>
        <span>Ganha</span>
      </div>
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
