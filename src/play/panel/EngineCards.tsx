import { displayEval, scoreForSide } from '../../chess-analysis'
import { pvToSan } from '../../game-helpers'
import type { PlaySession } from '../../hooks/usePlaySession'

export function RecommendationCard({ session }: { session: PlaySession }) {
  const { recommendationActive, bestMove, bestSan, bestMoveIdeas, thinking } = session
  return (
    <section className={`card recommendation-card ${recommendationActive ? 'active' : ''}`}>
      <div className="card-title">
        <span className="section-label">MELHOR JOGADA</span>
        {thinking && <span className="mini-loader" />}
      </div>
      {recommendationActive ? (
        bestMove ? (
          <>
            <div className="move-hero">
              <b>{bestSan}</b>
              <span className="uci-move">
                {bestMove.slice(0, 2)} → {bestMove.slice(2, 4)}
              </span>
            </div>
            <p>
              {bestSan}: {bestMoveIdeas.join('; ')}.
            </p>
            <div className="idea-tags">
              {bestMoveIdeas.map((idea) => (
                <span key={idea}>{idea}</span>
              ))}
            </div>
          </>
        ) : (
          <span className="muted">Calculando…</span>
        )
      ) : (
        <div className="waiting-coach">
          <strong>Primeiro mova o adversário</strong>
          <p>A engine recalcula a melhor resposta após o lance.</p>
        </div>
      )}
    </section>
  )
}

export function CandidateLinesCard({ session }: { session: PlaySession }) {
  const { analysis, recommendationActive, multiPv, perspective, liveGame } = session
  return (
    <section className="card">
      <div className="card-title">
        <strong>Linhas candidatas</strong>
        <span>Top {multiPv}</span>
      </div>
      <div className="lines">
        {recommendationActive && analysis?.lines.length ? (
          analysis.lines.map((line) => {
            const score =
              line.mate !== null
                ? scoreForSide(Math.sign(line.mate) * 10000, perspective)
                : scoreForSide(line.scoreCp ?? 0, perspective)
            return (
              <div className="line" key={line.multipv}>
                <b>{line.multipv}</b>
                <code>{pvToSan(liveGame.fen(), line.pv).join(' ')}</code>
                <span>
                  {line.mate !== null ? `${score > 0 ? 'M+' : 'M−'}${Math.abs(line.mate)}` : displayEval(score)}
                </span>
              </div>
            )
          })
        ) : (
          <div className="empty-state">Sem variantes nesta posição.</div>
        )}
      </div>
    </section>
  )
}

export function TelemetryCard({ session }: { session: PlaySession }) {
  const main = session.analysis?.lines[0]
  return (
    <section className="card engine-metrics">
      <div className="card-title">
        <strong>Telemetria</strong>
        <span>linha principal</span>
      </div>
      {main ? (
        <div>
          <span>
            <b>Prof.</b> {main.depth}
            {main.selDepth ? `/${main.selDepth}` : ''}
          </span>
          <span>
            <b>Nós</b> {main.nodes?.toLocaleString('pt-BR') ?? '—'}
          </span>
          <span>
            <b>NPS</b> {main.nps?.toLocaleString('pt-BR') ?? '—'}
          </span>
          <span>
            <b>Tempo</b> {main.timeMs ? `${main.timeMs} ms` : '—'}
          </span>
        </div>
      ) : (
        <p className="empty-state">Aguardando análise.</p>
      )}
    </section>
  )
}

export function EngineSettingsCard({ session }: { session: PlaySession }) {
  const { depth, setDepth, multiPv, setMultiPv, thinking, reviewing, liveGame } = session
  return (
    <section className="card engine-settings">
      <div className="card-title">
        <strong>Força da análise</strong>
        <span>local</span>
      </div>
      <label>
        Profundidade <b>{depth}</b>
        <input type="range" min="10" max="20" value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
      </label>
      <label>
        Variantes <b>{multiPv}</b>
        <input type="range" min="1" max="5" value={multiPv} onChange={(e) => setMultiPv(Number(e.target.value))} />
      </label>
      <button onClick={session.recalculate} disabled={thinking || reviewing || liveGame.isGameOver()}>
        Recalcular
      </button>
    </section>
  )
}
