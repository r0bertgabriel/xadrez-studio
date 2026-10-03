import type { EXPORT_THEME_COLORS } from '../../appearance'
import { boardSvg } from '../../chess-tools'
import { downloadBoardPng, downloadText } from '../../downloads'
import type { PerformanceProfile } from '../../hooks/usePerformanceProfile'
import type { PlaySession } from '../../hooks/usePlaySession'

export function MovesCard({ session }: { session: PlaySession }) {
  const { history, viewPly, viewMove, reviewing, liveGame } = session

  function moveButton(ply: number) {
    const san = history[ply - 1]
    if (!san) return <span />
    return (
      <button
        className={viewPly === ply ? 'active-move' : ''}
        aria-current={viewPly === ply ? 'step' : undefined}
        onClick={() => viewMove(ply)}
      >
        {san}
      </button>
    )
  }

  return (
    <section className="card moves-card">
      <div className="card-title">
        <strong>Partida</strong>
        <span>{history.length} meios-lances</span>
      </div>
      <div className="move-list">
        {Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => (
          <div key={index}>
            <b>{index + 1}.</b>
            {moveButton(index * 2 + 1)}
            {moveButton(index * 2 + 2)}
          </div>
        ))}
        {!history.length && <div className="empty-state">Nenhum lance registrado.</div>}
      </div>
      <div className="move-actions">
        <button className="review-button" onClick={session.reviewGame} disabled={!history.length || reviewing}>
          Analisar lances
        </button>
        <button onClick={() => downloadText('partida.pgn', liveGame.pgn(), 'application/x-chess-pgn')}>
          Exportar PGN
        </button>
      </div>
    </section>
  )
}

export function ExportCard({
  session,
  pieceSet,
  colors,
}: {
  session: PlaySession
  pieceSet: string
  colors: (typeof EXPORT_THEME_COLORS)[keyof typeof EXPORT_THEME_COLORS]
}) {
  async function exportBoard(format: 'svg' | 'png') {
    try {
      const svg = await boardSvg(session.liveGame, pieceSet, colors)
      if (format === 'svg') downloadText('posicao.svg', svg, 'image/svg+xml')
      else downloadBoardPng(svg)
    } catch (error) {
      console.error('Falha ao exportar a posição.', error)
    }
  }

  return (
    <section className="card export-card">
      <div className="card-title">
        <strong>Exportar posição</strong>
        <span>tema atual</span>
      </div>
      <div className="move-actions">
        <button onClick={() => void exportBoard('svg')}>SVG</button>
        <button onClick={() => void exportBoard('png')}>PNG</button>
      </div>
    </section>
  )
}

function averageOf(total: number, games: number) {
  return games ? `${Math.round(total / games)}%` : '—'
}

export function ProfileCard({ profile, storedGames }: { profile: PerformanceProfile; storedGames: number }) {
  return (
    <section className="card profile-card">
      <div className="card-title">
        <strong>Seu desempenho</strong>
        <span>{storedGames} partida(s) no IndexedDB</span>
      </div>
      {profile.games ? (
        <div>
          <strong>{Math.round(profile.totalAccuracy / profile.games)}%</strong>
          <span>média geral</span>
          <small>
            Brancas: {averageOf(profile.white.accuracy, profile.white.games)} · Pretas:{' '}
            {averageOf(profile.black.accuracy, profile.black.games)} · {profile.games} revisão(ões)
          </small>
        </div>
      ) : (
        <p className="empty-state">Analise uma partida para começar seu histórico local.</p>
      )}
    </section>
  )
}
