import { type Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { displayedSquares, isLightSquare, pieceAsset } from '../board-geometry'

const PIECE_SYMBOLS: Record<string, string> = {
  wp: '♙',
  wn: '♘',
  wb: '♗',
  wr: '♖',
  wq: '♕',
  wk: '♔',
  bp: '♟',
  bn: '♞',
  bb: '♝',
  br: '♜',
  bq: '♛',
  bk: '♚',
}

const PIECE_LABELS: Record<PieceSymbol, string> = {
  p: 'peão',
  n: 'cavalo',
  b: 'bispo',
  r: 'torre',
  q: 'dama',
  k: 'rei',
}
const NAVIGATION_KEYS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

function squareLabel(
  square: Square,
  piece: { type: PieceSymbol; color: Color } | undefined,
  selected: boolean,
  target: boolean,
) {
  const feminine = piece?.type === 'r' || piece?.type === 'q'
  const color = piece?.color === 'w' ? (feminine ? 'branca' : 'branco') : feminine ? 'preta' : 'preto'
  const parts: string[] = [square, piece ? `${PIECE_LABELS[piece.type]} ${color}` : 'vazia']
  if (selected) parts.push('selecionada')
  if (target) parts.push(piece ? 'captura possível' : 'destino possível')
  return parts.join(', ')
}

type Props = {
  game: Chess
  orientation: Color
  pieceSet: string
  ariaLabel: string
  selected?: Square | null
  legalTargets?: ReadonlySet<Square>
  lastMove?: { from: Square; to: Square } | null
  classForSquare?: (square: Square) => string
  onSquareClick?: (square: Square) => void
  draggable?: (square: Square) => boolean
  onDragStart?: (square: Square, event: DragEvent) => void
  onDrop?: (square: Square, event: DragEvent) => void
  showCoordinates?: boolean
  /** Escape pressed while a square has focus. */
  onCancel?: () => void
  children?: ReactNode
}

export default function ChessBoard({
  game,
  orientation,
  pieceSet,
  ariaLabel,
  selected = null,
  legalTargets = new Set<Square>(),
  lastMove = null,
  classForSquare,
  onSquareClick,
  draggable,
  onDragStart,
  onDrop,
  showCoordinates = false,
  onCancel,
  children,
}: Props) {
  const squares = displayedSquares(orientation)
  const buttonsRef = useRef(new Map<Square, HTMLButtonElement>())
  const [focusedSquare, setFocusedSquare] = useState<Square | null>(null)
  // Roving tabindex: the board is a single Tab stop and the arrow keys move between squares.
  const tabStop = focusedSquare ?? selected ?? squares[56]

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'Escape') {
      onCancel?.()
      return
    }
    const row = Math.floor(index / 8)
    const col = index % 8
    let next: number | null = null
    const step = NAVIGATION_KEYS[event.key]
    if (step) {
      const nextRow = row + step[0]
      const nextCol = col + step[1]
      if (nextRow >= 0 && nextRow < 8 && nextCol >= 0 && nextCol < 8) next = nextRow * 8 + nextCol
      else next = index
    } else if (event.key === 'Home') next = row * 8
    else if (event.key === 'End') next = row * 8 + 7
    if (next === null) return
    event.preventDefault()
    buttonsRef.current.get(squares[next])?.focus()
  }

  return (
    <div className="board" role="group" aria-label={`${ariaLabel}. Use as setas para navegar e Enter para selecionar.`}>
      {squares.map((square, index) => {
        const piece = game.get(square)
        const row = Math.floor(index / 8)
        const col = index % 8
        const light = isLightSquare(square)
        const target = legalTargets.has(square)
        const last = lastMove?.from === square || lastMove?.to === square
        return (
          <button
            key={square}
            ref={(element) => {
              if (element) buttonsRef.current.set(square, element)
              else buttonsRef.current.delete(square)
            }}
            type="button"
            tabIndex={square === tabStop ? 0 : -1}
            onFocus={() => setFocusedSquare(square)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`square ${light ? 'light' : 'dark'} ${selected === square ? 'selected' : ''} ${target ? 'target' : ''} ${last ? 'last-move' : ''} ${classForSquare?.(square) ?? ''}`}
            onClick={() => onSquareClick?.(square)}
            onDragOver={onDrop ? (event) => event.preventDefault() : undefined}
            onDrop={onDrop ? (event) => onDrop(square, event) : undefined}
            aria-label={squareLabel(square, piece, selected === square, target)}
          >
            {piece && (
              <span
                className={`piece piece-${pieceSet} ${piece.color}`}
                draggable={draggable?.(square) ?? false}
                onDragStart={onDragStart ? (event) => onDragStart(square, event) : undefined}
              >
                <img
                  src={pieceAsset(pieceSet, piece.color, piece.type)}
                  alt={PIECE_SYMBOLS[`${piece.color}${piece.type}`]}
                  draggable={false}
                />
              </span>
            )}
            {showCoordinates && col === 0 && (
              <span className={`coord rank-label ${light ? 'on-light' : 'on-dark'}`} aria-hidden="true">
                {square[1]}
              </span>
            )}
            {showCoordinates && row === 7 && (
              <span className={`coord file-label ${light ? 'on-light' : 'on-dark'}`} aria-hidden="true">
                {square[0]}
              </span>
            )}
          </button>
        )
      })}
      {children}
    </div>
  )
}
