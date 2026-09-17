import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import type { EngineAnalysis } from './engine'

const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

type ReviewEvaluation = { cp: number | null; mate: number | null }

export function cloneGame(source: Chess) {
  const clone = new Chess()
  const pgn = source.pgn()
  if (pgn && source.history().length) {
    clone.loadPgn(pgn)
    return clone
  }
  return new Chess(source.fen())
}

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: (uci[4] || 'q') as PieceSymbol }
}

export function scoreForSide(whiteScore: number, side: Color) { return side === 'w' ? whiteScore : -whiteScore }

export function scoreOf(analysis: EngineAnalysis) {
  const line = analysis.lines[0]
  if (!line) return 0
  if (line.mate !== null) return Math.sign(line.mate) * (10000 - Math.min(99, Math.abs(line.mate)))
  return line.scoreCp ?? 0
}

export function displayEval(cp: number) {
  if (Math.abs(cp) > 9000) return cp > 0 ? 'M+' : 'M−'
  const pawns = cp / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`
}

export function evaluationForSide(analysis: EngineAnalysis, side: Color): ReviewEvaluation {
  const line = analysis.lines[0]
  if (!line) return { cp: 0, mate: null }
  return {
    cp: line.scoreCp === null ? null : scoreForSide(line.scoreCp, side),
    mate: line.mate === null ? null : scoreForSide(line.mate, side),
  }
}

export function terminalEvaluation(game: Chess, side: Color): ReviewEvaluation {
  if (!game.isGameOver()) return { cp: 0, mate: null }
  if (!game.isCheckmate()) return { cp: 0, mate: null }
  const winner: Color = game.turn() === 'w' ? 'b' : 'w'
  return { cp: null, mate: winner === side ? 1 : -1 }
}

export function reviewLoss(before: ReviewEvaluation, after: ReviewEvaluation) {
  const beforeMate = before.mate
  const afterMate = after.mate

  if (beforeMate !== null && beforeMate > 0) {
    if (afterMate !== null && afterMate > 0) return Math.max(0, Math.abs(afterMate) - Math.abs(beforeMate)) * 10
    if (afterMate !== null && afterMate < 0) return 1000
    return 600
  }
  if (beforeMate !== null && beforeMate < 0) {
    if (afterMate !== null && afterMate < 0) return Math.max(0, Math.abs(beforeMate) - Math.abs(afterMate)) * 10
    return 0
  }
  if (afterMate !== null && afterMate < 0) return 1000
  if (afterMate !== null && afterMate > 0) return 0
  return Math.max(0, Math.round((before.cp ?? 0) - (after.cp ?? 0)))
}

export function classifyReview(loss: number, isBest: boolean, before: ReviewEvaluation, after: ReviewEvaluation) {
  if (isBest) return 'Melhor lance'
  const lostForcedMate = (before.mate ?? 0) > 0 && (after.mate === null || after.mate <= 0)
  const allowedForcedMate = (before.mate === null || before.mate >= 0) && (after.mate ?? 0) < 0
  if (lostForcedMate || allowedForcedMate) return 'Erro grave'
  if (loss <= 20) return 'Excelente'
  if (loss <= 55) return 'Bom'
  if (loss <= 110) return 'Imprecisão'
  if (loss <= 240) return 'Erro'
  return 'Erro grave'
}

export function moveToSan(game: Chess, uci: string) {
  if (!uci || uci === '(none)') return '—'
  const probe = cloneGame(game)
  try { return probe.move(uciToMove(uci)).san } catch { return uci }
}

function square(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
  return `${FILES[file]}${RANKS[rank]}` as Square
}

function attacksFrom(game: Chess, origin: Square): Square[] {
  const piece = game.get(origin)
  if (!piece) return []
  const file = FILES.indexOf(origin[0] as (typeof FILES)[number])
  const rank = RANKS.indexOf(origin[1] as (typeof RANKS)[number])
  const targets: Square[] = []
  const addRay = (df: number, dr: number) => {
    for (let step = 1; step < 8; step += 1) {
      const target = square(file + df * step, rank + dr * step)
      if (!target) break
      targets.push(target)
      if (game.get(target)) break
    }
  }
  if (piece.type === 'p') {
    const dr = piece.color === 'w' ? 1 : -1
    for (const df of [-1, 1]) { const target = square(file + df, rank + dr); if (target) targets.push(target) }
  } else if (piece.type === 'n') {
    for (const [df, dr] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) {
      const target = square(file + df, rank + dr); if (target) targets.push(target)
    }
  } else if (piece.type === 'k') {
    for (let df = -1; df <= 1; df += 1) for (let dr = -1; dr <= 1; dr += 1) {
      if (!df && !dr) continue
      const target = square(file + df, rank + dr); if (target) targets.push(target)
    }
  } else {
    if (piece.type === 'b' || piece.type === 'q') for (const [df, dr] of [[1,1],[1,-1],[-1,1],[-1,-1]]) addRay(df, dr)
    if (piece.type === 'r' || piece.type === 'q') for (const [df, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) addRay(df, dr)
  }
  return targets
}

function forkDescription(game: Chess, movedTo: Square, mover: Color) {
  const valuable = attacksFrom(game, movedTo)
    .map((target) => ({ target, piece: game.get(target) }))
    .filter(({ piece }) => piece && piece.color !== mover && PIECE_VALUES[piece.type] >= 3)
  if (valuable.length < 2) return null
  return `ataque duplo em ${valuable.slice(0, 2).map(({ target }) => target).join(' e ')}`
}

function createsAbsolutePin(game: Chess, movedTo: Square, mover: Color) {
  const piece = game.get(movedTo)
  if (!piece || !['b', 'r', 'q'].includes(piece.type)) return false
  const directions: Array<[number, number]> = []
  if (piece.type === 'b' || piece.type === 'q') directions.push([1,1],[1,-1],[-1,1],[-1,-1])
  if (piece.type === 'r' || piece.type === 'q') directions.push([1,0],[-1,0],[0,1],[0,-1])
  const file = FILES.indexOf(movedTo[0] as (typeof FILES)[number])
  const rank = RANKS.indexOf(movedTo[1] as (typeof RANKS)[number])
  for (const [df, dr] of directions) {
    let blockerSeen = false
    for (let step = 1; step < 8; step += 1) {
      const target = square(file + df * step, rank + dr * step)
      if (!target) break
      const targetPiece = game.get(target)
      if (!targetPiece) continue
      if (targetPiece.color === mover) break
      if (!blockerSeen) {
        if (targetPiece.type === 'k') break
        blockerSeen = true
        continue
      }
      if (targetPiece.type === 'k') return true
      break
    }
  }
  return false
}

export function tacticalIdeas(game: Chess, uci: string) {
  if (!uci || uci === '(none)') return []
  const probe = cloneGame(game)
  const mover = probe.turn()
  let move: Move
  try { move = probe.move(uciToMove(uci)) } catch { return [] }
  const ideas: string[] = []
  if (move.isCapture()) ideas.push('ganho de material / captura')
  if (probe.isCheckmate()) ideas.push('xeque-mate')
  else if (probe.inCheck()) ideas.push('xeque e ganho de tempo')
  if (move.isPromotion()) ideas.push('promoção de peão')
  if (move.isKingsideCastle() || move.isQueensideCastle()) ideas.push('segurança do rei')
  if (['d4', 'd5', 'e4', 'e5'].includes(move.to)) ideas.push('controle do centro')
  if (['n', 'b'].includes(move.piece) && ['1', '8'].includes(move.from[1])) ideas.push('desenvolvimento de peça')
  const fork = forkDescription(probe, move.to, mover)
  if (fork) ideas.push(fork)
  if (createsAbsolutePin(probe, move.to, mover)) ideas.push('cravada absoluta contra o rei')
  if (move.piece === 'q' && move.isCapture()) ideas.push('atividade da dama')
  if (!ideas.length) ideas.push('coordenação e melhora posicional')
  return [...new Set(ideas)]
}

export function explainMove(game: Chess, uci: string) {
  return `${moveToSan(game, uci)}: ${tacticalIdeas(game, uci).join('; ')}.`
}

export function mateMessage(analysis: EngineAnalysis | null, perspective: Color, mode: 'coach' | 'analysis') {
  const mate = analysis?.lines[0]?.mate
  if (mate === null || mate === undefined || mate === 0) return null
  const relative = scoreForSide(mate, perspective)
  if (mode === 'analysis') return relative > 0 ? `Brancas têm mate em ${Math.abs(relative)}` : `Pretas têm mate em ${Math.abs(relative)}`
  return relative > 0 ? `Você tem mate em ${Math.abs(relative)}` : `Atenção: o adversário ameaça mate em ${Math.abs(relative)}`
}
