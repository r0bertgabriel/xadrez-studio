import type { Color, PieceSymbol, Square } from 'chess.js'

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const
export const ALL_SQUARES = RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}` as Square))

const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }

/** Squares in reading order (top-left to bottom-right) for the given orientation. */
export function displayedSquares(side: Color) {
  const files = side === 'w' ? [...FILES] : [...FILES].reverse()
  const ranks = side === 'w' ? [...RANKS] : [...RANKS].reverse()
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square))
}

export function isLightSquare(square: Square) {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number])
  return (file + Number(square[1])) % 2 === 0
}

/** Center of a square in a 0–100 board coordinate system, used by SVG overlays. */
export function squareCenter(square: Square, side: Color) {
  const fileIndex = FILES.indexOf(square[0] as (typeof FILES)[number])
  const rank = Number(square[1])
  const col = side === 'w' ? fileIndex : 7 - fileIndex
  const row = side === 'w' ? 8 - rank : rank - 1
  return { x: (col + 0.5) * 12.5, y: (row + 0.5) * 12.5 }
}

export function pieceAsset(set: string, color: Color, piece: PieceSymbol) {
  return `/pieces/${set}/${color}${PIECE_NAMES[piece]}.svg`
}
