import { type Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import type { DragEvent, ReactNode } from 'react'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const
const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }
const PIECE_SYMBOLS: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
}

export function displayedSquares(side: Color) {
  const files = side === 'w' ? [...FILES] : [...FILES].reverse()
  const ranks = side === 'w' ? [...RANKS] : [...RANKS].reverse()
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square))
}

export function isLightSquare(square: Square) {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number])
  return (file + Number(square[1])) % 2 === 0
}

export function pieceAsset(set: string, color: Color, piece: PieceSymbol) {
  return `/pieces/${set}/${color}${PIECE_NAMES[piece]}.svg`
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
  children?: ReactNode
}

export default function ChessBoard({
  game, orientation, pieceSet, ariaLabel, selected = null, legalTargets = new Set<Square>(), lastMove = null,
  classForSquare, onSquareClick, draggable, onDragStart, onDrop, showCoordinates = false, children,
}: Props) {
  const squares = displayedSquares(orientation)
  return <div className="board" role="grid" aria-label={ariaLabel}>
    {squares.map((square, index) => {
      const piece = game.get(square)
      const row = Math.floor(index / 8)
      const col = index % 8
      const light = isLightSquare(square)
      const target = legalTargets.has(square)
      const last = lastMove?.from === square || lastMove?.to === square
      return <button
        key={square}
        type="button"
        className={`square ${light ? 'light' : 'dark'} ${selected === square ? 'selected' : ''} ${target ? 'target' : ''} ${last ? 'last-move' : ''} ${classForSquare?.(square) ?? ''}`}
        onClick={() => onSquareClick?.(square)}
        onDragOver={onDrop ? (event) => event.preventDefault() : undefined}
        onDrop={onDrop ? (event) => onDrop(square, event) : undefined}
        aria-label={square}
      >
        {piece && <span className={`piece piece-${pieceSet} ${piece.color}`} draggable={draggable?.(square) ?? false} onDragStart={onDragStart ? (event) => onDragStart(square, event) : undefined}>
          <img src={pieceAsset(pieceSet, piece.color, piece.type)} alt={PIECE_SYMBOLS[`${piece.color}${piece.type}`]} draggable={false} />
        </span>}
        {showCoordinates && col === 0 && <span className={`coord rank-label ${light ? 'on-light' : 'on-dark'}`} aria-hidden="true">{square[1]}</span>}
        {showCoordinates && row === 7 && <span className={`coord file-label ${light ? 'on-light' : 'on-dark'}`} aria-hidden="true">{square[0]}</span>}
      </button>
    })}
    {children}
  </div>
}
