import { Chess, type Square } from 'chess.js'
import { findHangingPieces, tacticalIdeas } from './chess-analysis'

export type BookEntry = { name: string; eco: string; moves: string[] }
export type Threat = { kind: 'check' | 'capture' | 'hanging' | 'fork' | 'pin' | 'mate' | 'skewer' | 'discovered'; text: string; from?: Square; to?: Square }
export type TacticalInsights = { opportunities: Threat[]; threats: Threat[] }

const BOOK: Record<string, BookEntry> = {
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': { name: 'Posição inicial', eco: 'A00', moves: ['e4', 'd4', 'Nf3', 'c4'] },
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': { name: 'Abertura do Peão do Rei', eco: 'C20', moves: ['e5', 'c5', 'e6', 'c6', 'd6'] },
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -': { name: 'Abertura do Peão da Dama', eco: 'D00', moves: ['d5', 'Nf6', 'e6', 'g6'] },
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -': { name: 'Abertura Reti', eco: 'A04', moves: ['d5', 'Nf6', 'c5', 'g6'] },
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -': { name: 'Abertura Inglesa', eco: 'A10', moves: ['e5', 'c5', 'Nf6', 'e6'] },
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': { name: 'Jogo Aberto', eco: 'C20', moves: ['Nf3', 'Bc4', 'f4', 'd4'] },
  'rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq -': { name: 'Centro Clássico', eco: 'C21', moves: ['exd4', 'Nc6', 'd6'] },
}

export function positionKey(game: Chess) { return game.fen().split(' ').slice(0, 3).join(' ') }
export function openingFor(game: Chess) { return BOOK[positionKey(game)] ?? BOOK[`${positionKey(game)} -`] ?? null }

export function threatsFor(game: Chess): TacticalInsights {
  const side = game.turn()
  const opportunities: Threat[] = []
  const threats: Threat[] = []

  for (const move of game.moves({ verbose: true })) {
    const uci = `${move.from}${move.to}${move.promotion ?? ''}`
    if (move.san.includes('#')) opportunities.push({ kind: 'mate', text: `${move.san} finaliza com xeque-mate`, from: move.from, to: move.to })
    else if (move.san.includes('+')) opportunities.push({ kind: 'check', text: `${move.san} cria xeque`, from: move.from, to: move.to })
    if (move.captured) opportunities.push({ kind: 'capture', text: `${move.san} captura material em ${move.to}`, from: move.from, to: move.to })

    const ideas = tacticalIdeas(game, uci)
    const fork = ideas.find((idea) => idea.startsWith('ataque duplo'))
    if (fork) opportunities.push({ kind: 'fork', text: `${move.san} cria ${fork}`, from: move.from, to: move.to })
    if (ideas.includes('cravada absoluta contra o rei')) opportunities.push({ kind: 'pin', text: `${move.san} cria uma cravada absoluta`, from: move.from, to: move.to })
    const skewer = ideas.find((idea) => idea.startsWith('espeto:'))
    if (skewer) opportunities.push({ kind: 'skewer', text: `${move.san} cria ${skewer}`, from: move.from, to: move.to })
    const discovered = ideas.find((idea) => idea.startsWith('ataque descoberto'))
    if (discovered) opportunities.push({ kind: 'discovered', text: `${move.san} cria ${discovered}`, from: move.from, to: move.to })
  }

  for (const item of findHangingPieces(game, side)) {
    threats.push({ kind: 'hanging', text: `${item.square} está pendurada e sem defesa (${item.value} ponto(s))`, to: item.square })
  }

  const unique = (items: Threat[]) => items.filter((item, index) => items.findIndex((other) => other.kind === item.kind && other.text === item.text) === index)
  return { opportunities: unique(opportunities).slice(0, 8), threats: unique(threats).slice(0, 8) }
}

export function boardSvg(game: Chess, pieceSet: string, theme: { light: string; dark: string }) {
  const size = 800
  const cell = size / 8
  const ranks = ['8','7','6','5','4','3','2','1']
  const files = ['a','b','c','d','e','f','g','h']
  const board = ranks.flatMap((rank, row) => files.map((file, col) => {
    const square = `${file}${rank}` as Square
    const piece = game.get(square)
    const fill = (col + row) % 2 === 0 ? theme.light : theme.dark
    const x = col * cell; const y = row * cell
    const artwork = piece ? `<image href="${location.origin}/pieces/${pieceSet}/${piece.color}${piece.type.toUpperCase()}.svg" x="${x + 4}" y="${y + 4}" width="${cell - 8}" height="${cell - 8}"/>` : ''
    const labels = `${col === 0 ? `<text x="${x + 7}" y="${y + 16}" font-size="14" font-family="monospace" fill="#111">${rank}</text>` : ''}${row === 7 ? `<text x="${x + cell - 16}" y="${y + cell - 7}" font-size="14" font-family="monospace" fill="#111">${file}</text>` : ''}`
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"/>${artwork}${labels}`
  })).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${board}</svg>`
}
