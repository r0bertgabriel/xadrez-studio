import { Chess, type Color } from 'chess.js'
import { ecoOpeningFor, loadEco } from './eco'
import type { OpeningCourse } from './openings-data'

export const REPERTOIRE_CATEGORY = 'Meu repertório'
const REPERTOIRE_KEY = 'xadrez-studio-repertoire-v1'
const DEFAULT_COMMENT = 'Lance do seu repertório.'
const MAX_STEPS = 60

export class RepertoireError extends Error {}

export function loadRepertoire(): OpeningCourse[] {
  try {
    const saved = JSON.parse(localStorage.getItem(REPERTOIRE_KEY) ?? '[]') as OpeningCourse[]
    return Array.isArray(saved) ? saved.filter(isValidCourse) : []
  } catch {
    return []
  }
}

/** Hand-edited or corrupted storage must not crash the opening studio. */
function isValidCourse(course: OpeningCourse) {
  if (!course || typeof course.id !== 'string' || !Array.isArray(course.steps) || !course.steps.length) return false
  if (![course.name, course.eco, course.category].every((value) => typeof value === 'string')) return false
  if (course.studentSide !== 'w' && course.studentSide !== 'b') return false
  try {
    const game = new Chess()
    for (const step of course.steps) game.move(step.san)
    return true
  } catch {
    return false
  }
}

export function saveRepertoire(courses: OpeningCourse[]) {
  localStorage.setItem(REPERTOIRE_KEY, JSON.stringify(courses))
}

/** Strips engine/clock annotations such as [%clk 0:03:00] that some exports embed in comments. */
function cleanComment(comment: string) {
  return comment
    .replace(/\[%[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Turns the main line of a PGN into a course. Comments ({...}) after a move become its
 * explanation; side variations are ignored because the trainer follows a single line.
 */
export async function courseFromPgn(pgn: string, name: string, studentSide: Color): Promise<OpeningCourse> {
  const game = new Chess()
  try {
    game.loadPgn(pgn.trim())
  } catch {
    throw new RepertoireError('PGN inválido ou incompatível.')
  }
  if (game.getHeaders().SetUp === '1' || game.getHeaders().FEN)
    throw new RepertoireError('O repertório precisa começar da posição inicial (PGN sem cabeçalho FEN).')
  const moves = game.history({ verbose: true })
  if (!moves.length) throw new RepertoireError('O PGN não contém lances.')

  const comments = new Map(game.getComments().map((entry) => [entry.fen, cleanComment(entry.comment)]))
  const steps = moves
    .slice(0, MAX_STEPS)
    .map((move) => ({ san: move.san, comment: comments.get(move.after) || DEFAULT_COMMENT }))

  const eco = await loadEco().then(
    (db) => ecoOpeningFor(db, game),
    () => null,
  )
  return {
    id: `custom-${Date.now().toString(36)}`,
    name: name.trim() || eco?.name || 'Linha personalizada',
    eco: eco?.eco ?? 'PGN',
    category: REPERTOIRE_CATEGORY,
    summary: eco ? `Linha importada do seu PGN · ${eco.name}.` : 'Linha importada do seu PGN.',
    studentSide,
    steps,
  }
}
