import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { ALL_SQUARES } from './board-geometry'
import { cloneGame } from './chess-analysis'

export type Mode = 'coach' | 'analysis'
export type LastMove = { from: Square; to: Square } | null
export type ReviewMove = {
  ply: number
  san: string
  actual: string
  best: string
  bestSan: string
  loss: number
  label: string
  eval: number
  fenBefore: string
  fenAfter: string
  ideas: string[]
}

export function findCheckedKing(game: Chess): Square | null {
  if (!game.inCheck()) return null
  for (const square of ALL_SQUARES) {
    const piece = game.get(square)
    if (piece?.type === 'k' && piece.color === game.turn()) return square
  }
  return null
}

export function gameResult(game: Chess) {
  if (!game.isGameOver()) return null
  if (game.isCheckmate())
    return game.turn() === 'w' ? 'Pretas venceram por xeque-mate.' : 'Brancas venceram por xeque-mate.'
  if (game.isStalemate()) return 'Empate por afogamento.'
  if (game.isThreefoldRepetition()) return 'Empate por repetição tripla.'
  if (game.isInsufficientMaterial()) return 'Empate por material insuficiente.'
  if (game.isDrawByFiftyMoves()) return 'Empate pela regra dos 50 lances.'
  return 'Partida encerrada em empate.'
}

export function resultTitle(game: Chess) {
  if (game.isCheckmate()) return 'XEQUE-MATE'
  if (game.isStalemate()) return 'AFOGAMENTO'
  if (game.isThreefoldRepetition()) return 'REPETIÇÃO TRIPLA'
  if (game.isInsufficientMaterial()) return 'MATERIAL INSUFICIENTE'
  if (game.isDrawByFiftyMoves()) return 'REGRA DOS 50 LANCES'
  return 'FIM DE PARTIDA'
}

export function pvToSan(fen: string, pv: string[], maxMoves = 8) {
  const game = new Chess(fen)
  const san: string[] = []
  for (const uci of pv.slice(0, maxMoves)) {
    try {
      const move = {
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: (uci[4] || 'q') as PieceSymbol,
      }
      san.push(game.move(move).san)
    } catch {
      break
    }
  }
  return san
}

export function gameAtPly(source: Chess, ply: number) {
  const copy = cloneGame(source)
  for (let index = copy.history().length; index > ply; index -= 1) copy.undo()
  return copy
}

/**
 * Full-move number and mover of half-move `ply` (1-based). Games loaded from a FEN may start on
 * a later move or with Black to play, so this cannot be derived from the ply alone.
 */
export function moveLabelFor(startFen: string, ply: number): { number: number; color: Color } {
  const [, turn, , , , fullMove] = startFen.split(' ')
  const index = ply - 1 + (turn === 'b' ? 1 : 0)
  return { number: (Number(fullMove) || 1) + Math.floor(index / 2), color: index % 2 === 0 ? 'w' : 'b' }
}

export function nextViewPly(value: number | null, historyLength: number): number | null {
  const next = (value ?? historyLength) + 1
  return next >= historyLength ? null : next
}

export function lastMoveOf(game: Chess): LastMove {
  const latest = game.history({ verbose: true }).at(-1)
  return latest ? { from: latest.from, to: latest.to } : null
}

export function accuracyFor(rows: ReviewMove[]) {
  return Math.max(
    0,
    Math.round(100 - rows.reduce((sum, row) => sum + Math.min(row.loss, 400), 0) / Math.max(1, rows.length) / 4),
  )
}

export function sideLabel(side: Color) {
  return side === 'w' ? 'Brancas' : 'Pretas'
}
