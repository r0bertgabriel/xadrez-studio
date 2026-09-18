import type { Chess, Color, Move, Square } from 'chess.js'
import { cellCenter, squareAt } from './geometry'
import type { Point } from './types'

export type BoardSignature = Partial<Record<Square, number>>

/** Average luminance (0-255) sampled from a small patch at each calibrated square's center. */
export function sampleBoardSignature(context: CanvasRenderingContext2D, corners: [Point, Point, Point, Point], orientation: Color): BoardSignature {
  const signature: BoardSignature = {}
  const { width, height } = context.canvas
  const patch = Math.max(4, Math.round((Math.min(width, height) / 8) * 0.22))
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const square = squareAt(row, col, orientation)
      const center = cellCenter(corners, row, col)
      const x = Math.round((center.x / 100) * width)
      const y = Math.round((center.y / 100) * height)
      const startX = Math.max(0, Math.min(width - patch, x - Math.floor(patch / 2)))
      const startY = Math.max(0, Math.min(height - patch, y - Math.floor(patch / 2)))
      const { data } = context.getImageData(startX, startY, patch, patch)
      let sum = 0
      for (let i = 0; i < data.length; i += 4) sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      signature[square] = sum / (data.length / 4)
    }
  }
  return signature
}

/** Squares whose sampled brightness changed enough to suggest a piece appeared, vanished or was replaced. */
export function diffSquares(previous: BoardSignature, current: BoardSignature, threshold = 16): Square[] {
  const changed: Square[] = []
  for (const key of Object.keys(current) as Square[]) {
    const before = previous[key]
    const after = current[key]
    if (before === undefined || after === undefined) continue
    if (Math.abs(before - after) > threshold) changed.push(key)
  }
  return changed
}

export function sameSquareSet(a: Square[], b: Square[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((square) => set.has(square))
}

/** All squares a move actually touches: origin/destination plus the rook (castling) or captured pawn (en passant). */
export function moveFootprint(move: Move): Square[] {
  const squares = new Set<Square>([move.from, move.to])
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    const rank = move.color === 'w' ? '1' : '8'
    if (move.isKingsideCastle()) { squares.add(`h${rank}` as Square); squares.add(`f${rank}` as Square) }
    else { squares.add(`a${rank}` as Square); squares.add(`d${rank}` as Square) }
  }
  if (move.isEnPassant()) squares.add(`${move.to[0]}${move.from[1]}` as Square)
  return [...squares]
}

export type MoveMatch = { move: Move; exact: boolean }

/**
 * Matches a set of visually-changed squares to the legal move(s) that would touch exactly those
 * squares. This is how a move is identified without any piece-type recognition: chess.js already
 * knows what piece sits on each square, so only the *set of squares that changed* is needed.
 */
export function matchMove(game: Chess, changed: Square[]): MoveMatch[] {
  if (changed.length < 2) return []
  const legal = game.moves({ verbose: true })
  const exact = legal.filter((move) => sameSquareSet(moveFootprint(move), changed))
  if (exact.length) return exact.map((move) => ({ move, exact: true }))
  const contained = legal.filter((move) => moveFootprint(move).every((square) => changed.includes(square)))
  return contained.map((move) => ({ move, exact: false }))
}
