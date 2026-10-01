import type { Square } from 'chess.js'
import ChessBoard from '../components/ChessBoard'
import { sideLabel } from '../game-helpers'
import type { Appearance } from '../hooks/useAppearance'
import type { MarkTool, PlaySession } from '../hooks/usePlaySession'
import { HintArrow, ManualAnnotations } from './BoardOverlays'

const MARK_TOOLS: Array<{ id: MarkTool; label: string }> = [
  { id: 'move', label: 'Mover' },
  { id: 'arrow', label: 'Seta' },
  { id: 'circle', label: 'Círculo' },
]

export default function BoardColumn({ session, appearance }: { session: PlaySession; appearance: Appearance }) {
  const {
    displayedGame,
    liveGame,
    history,
    orientation,
    mode,
    playerSide,
    viewPly,
    checkedKing,
    hintFrom,
    hintTo,
    result,
    recommendationActive,
    thinking,
    reviewing,
    reviewProgress,
  } = session
  const live = viewPly === null
  const activeTurnLabel = sideLabel(liveGame.turn())
  const moveNumber = Math.floor(history.length / 2) + 1

  function classForSquare(square: Square) {
    const check = checkedKing === square ? (displayedGame.isCheckmate() ? 'checkmated' : 'checked') : ''
    return `${check} ${live && hintFrom === square ? 'hint-from' : ''} ${live && hintTo === square ? 'hint-to' : ''}`
  }

  return (
    <div className="board-column">
      <div className="player-row opponent-row">
        <div>
          <span className="player-dot opponent" />
          <strong>{sideLabel(orientation === 'w' ? 'b' : 'w')}</strong>
        </div>
        <span>{mode === 'analysis' ? 'análise livre' : 'adversário'}</span>
      </div>
      <div className={`board-frame board-theme-${appearance.boardTheme}`}>
        <ChessBoard
          game={displayedGame}
          orientation={orientation}
          pieceSet={appearance.pieceSet}
          ariaLabel={`Tabuleiro orientado pelas ${orientation === 'w' ? 'brancas' : 'pretas'}`}
          selected={session.selected}
          legalTargets={session.legalTargets}
          lastMove={live ? session.lastMove : null}
          classForSquare={classForSquare}
          onSquareClick={session.clickSquare}
          draggable={(square) => !session.boardLocked && displayedGame.get(square)?.color === liveGame.turn()}
          onDragStart={session.dragStart}
          onDrop={session.dropOnSquare}
          onCancel={() => session.setSelected(null)}
          showCoordinates
        >
          {hintFrom && hintTo && live && (
            <HintArrow from={hintFrom} to={hintTo} orientation={orientation} hintStyle={appearance.hintStyle} />
          )}
          <ManualAnnotations arrows={session.manualArrows} circles={session.manualCircles} orientation={orientation} />
        </ChessBoard>
        {reviewing && (
          <div className="board-overlay">
            <span className="spinner" />
            <strong>
              Analisando seus lances{reviewProgress ? ` · ${reviewProgress.completed}/${reviewProgress.total}` : ''}
            </strong>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {history.length ? `${history.length % 2 ? 'Brancas' : 'Pretas'} jogaram ${history.at(-1)}.` : ''}
      </p>
      <div className="player-row my-row">
        <div>
          <span className="player-dot mine" />
          <strong>{sideLabel(orientation)}</strong>
        </div>
        <span>
          {mode === 'analysis'
            ? 'ambos os lados analisados'
            : liveGame.turn() === playerSide
              ? 'sua recomendação está ativa'
              : 'aguardando o adversário'}
        </span>
      </div>
      <div className={`turn-banner ${result ? 'finished' : ''}`} aria-live="polite">
        <div>
          <span className={`turn-chip ${result ? 'finished' : recommendationActive ? 'mine' : 'opponent'}`}>
            {result ? 'PARTIDA ENCERRADA' : recommendationActive ? 'ANÁLISE ATIVA' : 'AGUARDANDO'}
          </span>
          <strong>
            {result ?? (recommendationActive ? `Sua vez: ${activeTurnLabel} jogam.` : `${activeTurnLabel} jogam.`)}
          </strong>
        </div>
        <span>
          {viewPly !== null
            ? `REVISÃO · ${viewPly}/${history.length}`
            : thinking
              ? 'ENGINE CALCULANDO'
              : `LANCE ${moveNumber}`}
        </span>
      </div>
      <div className="history-controls" aria-label="Navegação da partida">
        <button
          aria-label="Ir para o início"
          title="Ir para o início"
          onClick={() => session.setViewPly(0)}
          disabled={!history.length}
        >
          ⏮
        </button>
        <button
          aria-label="Lance anterior"
          title="Lance anterior (←)"
          onClick={session.stepBack}
          disabled={!history.length}
        >
          ←
        </button>
        <span>{viewPly === null ? 'POSIÇÃO ATUAL' : `LANCE ${viewPly} DE ${history.length}`}</span>
        <button
          aria-label="Próximo lance"
          title="Próximo lance (→)"
          onClick={session.stepForward}
          disabled={!history.length || viewPly === null}
        >
          →
        </button>
        <button
          aria-label="Ir para a posição atual"
          title="Ir para a posição atual"
          onClick={() => session.setViewPly(null)}
          disabled={viewPly === null}
        >
          ⏭
        </button>
      </div>
      <div className="actions">
        <button onClick={session.requestReset}>Nova partida</button>
        <button onClick={session.undoMove} disabled={!history.length || reviewing}>
          Desfazer lance
        </button>
        <button className="primary" onClick={session.toggleHint} title="Atalho: H">
          {session.showHint ? 'Ocultar dica' : 'Mostrar dica'} <kbd>H</kbd>
        </button>
      </div>
      <div className="annotation-toolbar">
        <span>Marcações</span>
        {MARK_TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={session.markTool === tool.id ? 'selected-tool' : ''}
            onClick={() => session.selectMarkTool(tool.id)}
          >
            {tool.label}
          </button>
        ))}
        <button
          onClick={session.clearAnnotations}
          disabled={!session.manualArrows.length && !session.manualCircles.length}
        >
          Limpar
        </button>
      </div>
      <p className="board-shortcuts">
        <kbd>←</kbd>
        <kbd>→</kbd> navega pela partida · <kbd>H</kbd> alterna dica · <kbd>Esc</kbd> limpa a seleção · <kbd>Tab</kbd> +
        setas percorrem o tabuleiro
      </p>
    </div>
  )
}
