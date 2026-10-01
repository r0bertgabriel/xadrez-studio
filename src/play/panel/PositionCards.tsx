import { useMemo } from 'react'
import { ecoContinuations, ecoOpeningFor, useEco } from '../../eco'
import type { PlaySession } from '../../hooks/usePlaySession'

const MAX_ECO_MOVES = 6

export function OpeningCard({ session }: { session: PlaySession }) {
  const { liveGame, opening, boardLocked, playBookMove } = session
  const eco = useEco()
  const ecoOpening = useMemo(() => (eco ? ecoOpeningFor(eco, liveGame) : null), [eco, liveGame])
  const ecoMoves = useMemo(
    () => (eco && !opening ? ecoContinuations(eco, liveGame).slice(0, MAX_ECO_MOVES) : []),
    [eco, liveGame, opening],
  )

  return (
    <section className="card opening-card">
      <div className="card-title">
        <strong>Abertura</strong>
        <span>{opening?.eco ?? ecoOpening?.eco ?? 'fora do livro'}</span>
      </div>
      {opening ? (
        <>
          <b>{opening.name}</b>
          <div className="book-moves">
            {opening.moves.map((move) => (
              <button key={move} onClick={() => playBookMove(move)} disabled={boardLocked}>
                {move}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {ecoOpening && <b>{ecoOpening.name}</b>}
          {ecoMoves.length ? (
            <div className="book-moves">
              {ecoMoves.map((move) => (
                <button
                  key={move.san}
                  onClick={() => playBookMove(move.san)}
                  disabled={boardLocked}
                  title={`${move.eco} · ${move.name}`}
                >
                  {move.san}
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {ecoOpening
                ? 'A posição já saiu das linhas catalogadas.'
                : 'O livro local não possui uma continuação catalogada nesta posição.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}

type Insight = { kind: string; text: string }

function InsightCard({
  className,
  title,
  items,
  empty,
}: {
  className: string
  title: string
  items: Insight[]
  empty: string
}) {
  return (
    <section className={`card ${className}`}>
      <div className="card-title">
        <strong>{title}</strong>
        <span>{items.length}</span>
      </div>
      {items.length ? (
        <ul>
          {items.map((item, index) => (
            <li className={item.kind} key={`${item.text}-${index}`}>
              {item.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">{empty}</p>
      )}
    </section>
  )
}

export function TacticalCards({ session }: { session: PlaySession }) {
  const { opportunities, threats } = session.tacticalInsights
  return (
    <>
      <InsightCard
        className="opportunities-card"
        title="Oportunidades táticas"
        items={opportunities}
        empty="Nenhum xeque, captura ou padrão tático relevante disponível para o lado a jogar."
      />
      <InsightCard
        className="threats-card"
        title="Ameaças reais"
        items={threats}
        empty="Nenhuma peça do lado a jogar está pendurada no momento."
      />
    </>
  )
}
