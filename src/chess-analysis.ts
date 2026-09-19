import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import type { EngineAnalysis } from './engine'

export const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const
const ALL_SQUARES = RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}` as Square))

export type ReviewEvaluation = { cp: number | null; mate: number | null }

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

/** Unlike displayEval, this keeps the exact mate distance instead of collapsing it into the encoded centipawn score. */
export function formatEval(analysis: EngineAnalysis | null, side: Color) {
  const line = analysis?.lines[0]
  if (!line) return '—'
  if (line.mate !== null) {
    const relative = scoreForSide(line.mate, side)
    return `${relative > 0 ? 'M+' : 'M−'}${Math.abs(relative)}`
  }
  return displayEval(scoreForSide(line.scoreCp ?? 0, side))
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

function expectedScore(evaluation: ReviewEvaluation) {
  if (evaluation.mate !== null) return evaluation.mate > 0 ? 1 : 0
  const cp = Math.max(-1200, Math.min(1200, evaluation.cp ?? 0))
  return 1 / (1 + Math.exp(-cp / 260))
}

/** Context-aware move quality: the same centipawn swing matters more in an equal position than in a decided one. */
export function classifyReview(loss: number, isBest: boolean, before: ReviewEvaluation, after: ReviewEvaluation) {
  if (isBest) return 'Melhor lance'
  const lostForcedMate = (before.mate ?? 0) > 0 && (after.mate === null || after.mate <= 0)
  const allowedForcedMate = (before.mate === null || before.mate >= 0) && (after.mate ?? 0) < 0
  if (lostForcedMate || allowedForcedMate) return 'Erro grave'

  const expectedScoreLoss = Math.max(0, expectedScore(before) - expectedScore(after))
  if (expectedScoreLoss <= 0.012 && loss <= 45) return 'Excelente'
  if (expectedScoreLoss <= 0.035 && loss <= 100) return 'Bom'
  if (expectedScoreLoss <= 0.09) return 'Imprecisão'
  if (expectedScoreLoss <= 0.22) return 'Erro'
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

export function attacksFrom(game: Chess, origin: Square): Square[] {
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

export type HangingPiece = { square: Square; piece: PieceSymbol; value: number }
export function findHangingPieces(game: Chess, color: Color): HangingPiece[] {
  const enemy: Color = color === 'w' ? 'b' : 'w'
  return ALL_SQUARES.flatMap((sq) => {
    const piece = game.get(sq)
    if (!piece || piece.color !== color || piece.type === 'k') return []
    const attacked = game.isAttacked(sq, enemy)
    const defended = game.isAttacked(sq, color)
    return attacked && !defended ? [{ square: sq, piece: piece.type, value: PIECE_VALUES[piece.type] }] : []
  }).sort((a, b) => b.value - a.value)
}

function forkDescription(game: Chess, movedTo: Square, mover: Color) {
  const valuable = attacksFrom(game, movedTo)
    .map((target) => ({ target, piece: game.get(target) }))
    .filter(({ piece }) => piece && piece.color !== mover && PIECE_VALUES[piece.type] >= 3)
  if (valuable.length < 2) return null
  return `ataque duplo em ${valuable.slice(0, 2).map(({ target }) => target).join(' e ')}`
}

function sliderDirections(piece: PieceSymbol) {
  const directions: Array<[number, number]> = []
  if (piece === 'b' || piece === 'q') directions.push([1,1],[1,-1],[-1,1],[-1,-1])
  if (piece === 'r' || piece === 'q') directions.push([1,0],[-1,0],[0,1],[0,-1])
  return directions
}

function rayVictims(game: Chess, origin: Square, mover: Color) {
  const piece = game.get(origin)
  if (!piece) return [] as Array<{ first: Square; second: Square; firstValue: number; secondValue: number }>
  const file = FILES.indexOf(origin[0] as (typeof FILES)[number])
  const rank = RANKS.indexOf(origin[1] as (typeof RANKS)[number])
  const pairs: Array<{ first: Square; second: Square; firstValue: number; secondValue: number }> = []
  for (const [df, dr] of sliderDirections(piece.type)) {
    const victims: Array<{ square: Square; value: number }> = []
    for (let step = 1; step < 8; step += 1) {
      const target = square(file + df * step, rank + dr * step)
      if (!target) break
      const targetPiece = game.get(target)
      if (!targetPiece) continue
      if (targetPiece.color === mover) break
      victims.push({ square: target, value: PIECE_VALUES[targetPiece.type] })
      if (victims.length === 2) break
    }
    if (victims.length === 2) pairs.push({ first: victims[0].square, second: victims[1].square, firstValue: victims[0].value, secondValue: victims[1].value })
  }
  return pairs
}

function createsAbsolutePin(game: Chess, movedTo: Square, mover: Color) {
  return rayVictims(game, movedTo, mover).some(({ second }) => game.get(second)?.type === 'k')
}

function skewerDescription(game: Chess, movedTo: Square, mover: Color) {
  const pair = rayVictims(game, movedTo, mover).find(({ firstValue, secondValue }) => firstValue > secondValue)
  return pair ? `espeto: força ${pair.first} e expõe ${pair.second}` : null
}

function discoveredAttackDescription(before: Chess, after: Chess, move: Move, mover: Color) {
  const movedPieceTargets = new Set(attacksFrom(after, move.to))
  for (const sq of ALL_SQUARES) {
    const piece = after.get(sq)
    if (!piece || piece.color === mover || PIECE_VALUES[piece.type] < 3) continue
    if (!before.isAttacked(sq, mover) && after.isAttacked(sq, mover) && !movedPieceTargets.has(sq)) return `ataque descoberto contra ${sq}`
  }
  return null
}

export function tacticalIdeas(game: Chess, uci: string) {
  if (!uci || uci === '(none)') return []
  const before = cloneGame(game)
  const probe = cloneGame(game)
  const mover = probe.turn()
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  let move: Move
  try { move = probe.move(uciToMove(uci)) } catch { return [] }
  const ideas: string[] = []
  if (move.isCapture()) ideas.push(`captura em ${move.to}${move.captured ? ` (${PIECE_VALUES[move.captured]} ponto(s) de material)` : ''}`)
  if (probe.isCheckmate()) ideas.push('xeque-mate imediato')
  else if (probe.inCheck()) ideas.push('xeque com ganho de tempo')
  if (move.isPromotion()) ideas.push('promoção de peão')
  if (move.isKingsideCastle() || move.isQueensideCastle()) ideas.push('melhora a segurança do rei')
  if (['d4', 'd5', 'e4', 'e5'].includes(move.to)) ideas.push('aumenta o controle do centro')
  if (['n', 'b'].includes(move.piece) && ['1', '8'].includes(move.from[1])) ideas.push('desenvolve uma peça menor')

  const fork = forkDescription(probe, move.to, mover)
  if (fork) ideas.push(fork)
  if (createsAbsolutePin(probe, move.to, mover)) ideas.push('cravada absoluta contra o rei')
  const skewer = skewerDescription(probe, move.to, mover)
  if (skewer) ideas.push(skewer)
  const discovered = discoveredAttackDescription(before, probe, move, mover)
  if (discovered) ideas.push(discovered)

  const enemyHanging = findHangingPieces(probe, enemy)
  if (enemyHanging.length) ideas.push(`deixa ${enemyHanging[0].square} pendurada e sem defesa`)
  const movedPiece = probe.get(move.to)
  if (movedPiece && movedPiece.type !== 'k' && probe.isAttacked(move.to, enemy) && !probe.isAttacked(move.to, mover)) ideas.push(`atenção: ${move.to} fica sem defesa`)

  if (move.piece === 'q' && move.isCapture()) ideas.push('ativa a dama com ganho de material')
  if (!ideas.length) ideas.push('melhora coordenação e atividade das peças')
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
