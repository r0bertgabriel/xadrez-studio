import type { PieceSymbol } from 'chess.js'
import { lazy, Suspense } from 'react'
import { pieceAsset } from '../board-geometry'
import { resultTitle } from '../game-helpers'
import type { PlaySession } from '../hooks/usePlaySession'

const OnlineGameImport = lazy(() => import('../components/OnlineGameImport'))

const PROMOTIONS: Array<{ piece: PieceSymbol; label: string }> = [
  { piece: 'q', label: 'Dama' },
  { piece: 'r', label: 'Torre' },
  { piece: 'b', label: 'Bispo' },
  { piece: 'n', label: 'Cavalo' },
]

export function GameOverDialog({ session }: { session: PlaySession }) {
  const { showGameOver, result, liveGame, history, setShowGameOver } = session
  if (!showGameOver || !result) return null
  return (
    <div className="modal-backdrop">
      <div className="gameover-modal" role="dialog" aria-modal="true">
        <span className="section-label">{resultTitle(liveGame)}</span>
        <div className="mate-symbol">{liveGame.isCheckmate() ? '♚' : '½'}</div>
        <h2>{result}</h2>
        <p>
          Último lance: <strong>{history.at(-1) ?? '—'}</strong>
        </p>
        <div className="gameover-actions">
          <button onClick={() => setShowGameOver(false)}>Fechar</button>
          <button
            onClick={() => {
              setShowGameOver(false)
              void session.reviewGame()
            }}
          >
            Revisar partida
          </button>
          <button className="primary" onClick={session.resetGame}>
            Nova partida
          </button>
        </div>
      </div>
    </div>
  )
}

export function PromotionDialog({ session, pieceSet }: { session: PlaySession; pieceSet: string }) {
  const { pendingPromotion, liveGame } = session
  if (!pendingPromotion) return null
  return (
    <div className="modal-backdrop" onClick={session.cancelPromotion}>
      <div className="promotion-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <span className="section-label">PROMOÇÃO</span>
        <h2>Escolha a peça</h2>
        <div className="promotion-grid">
          {PROMOTIONS.map(({ piece, label }) => (
            <button key={piece} onClick={() => session.executeMove(pendingPromotion.from, pendingPromotion.to, piece)}>
              <img src={pieceAsset(pieceSet, liveGame.turn(), piece)} alt={label} />
              <small>{label}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ToolsDialog({ session }: { session: PlaySession }) {
  const { showTools, setShowTools, importText, setImportText, liveGame } = session
  if (!showTools) return null
  return (
    <div className="modal-backdrop" onClick={() => setShowTools(false)}>
      <div className="tools-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <span className="section-label">IMPORTAR POSIÇÃO / PARTIDA</span>
        <h2>PGN e FEN</h2>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Cole um PGN completo ou uma posição FEN..."
        />
        <div className="tool-actions">
          <button onClick={session.loadPgn}>Carregar PGN</button>
          <button onClick={session.loadFen}>Carregar FEN</button>
          <button onClick={() => setImportText(liveGame.fen())}>Usar FEN atual</button>
          <button onClick={() => navigator.clipboard?.writeText(liveGame.fen())}>Copiar FEN</button>
        </div>
        <small>A importação substitui a posição atual. A sessão é salva automaticamente no navegador.</small>
        <Suspense fallback={null}>
          <OnlineGameImport onSelect={session.loadOnlineGame} />
        </Suspense>
      </div>
    </div>
  )
}
