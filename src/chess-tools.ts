import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'

export type BookEntry = { name: string; eco: string; moves: string[] }
export type Threat = { kind: 'check' | 'capture' | 'hanging'; text: string; from?: Square; to?: Square }

const BOOK: Record<string, BookEntry> = {
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': { name: 'Posição inicial', eco: 'A00', moves: ['e4', 'd4', 'Nf3', 'c4'] },
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': { name: 'Abertura do Peão do Rei', eco: 'C20', moves: ['e5', 'c5', 'e6', 'c6', 'd6'] },
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -': { name: 'Abertura do Peão da Dama', eco: 'D00', moves: ['d5', 'Nf6', 'e6', 'g6'] },
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -': { name: 'Abertura Reti', eco: 'A04', moves: ['d5', 'Nf6', 'c5', 'g6'] },
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -': { name: 'Abertura Inglesa', eco: 'A10', moves: ['e5', 'c5', 'Nf6', 'e6'] },
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': { name: 'Jogo Aberto', eco: 'C20', moves: ['Nf3', 'Bc4', 'f4', 'd4'] },
  'rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq -': { name: 'Centro Clássico', eco: 'C21', moves: ['exd4', 'Nc6', 'd6'] },
}

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 }

// Halfmove/fullmove and en-passant target do not alter the opening identity.
export function positionKey(game: Chess) { return game.fen().split(' ').slice(0, 3).join(' ') }
export function openingFor(game: Chess) { return BOOK[positionKey(game)] ?? BOOK[`${positionKey(game)} -`] ?? null }

export function threatsFor(game: Chess): Threat[] {
  const side = game.turn()
  const enemy: Color = side === 'w' ? 'b' : 'w'
  const threats: Threat[] = []
  for (const move of game.moves({ verbose: true })) {
    if (move.san.includes('#') || move.san.includes('+')) threats.push({ kind: 'check', text: `${move.san} cria xeque`, from: move.from, to: move.to })
    if (move.captured && VALUES[move.captured] >= 3) threats.push({ kind: 'capture', text: `${move.san} ganha ${move.captured === 'q' ? 'a dama' : 'material'}`, from: move.from, to: move.to })
  }
  for (const square of ['a1','b1','c1','d1','e1','f1','g1','h1','a2','b2','c2','d2','e2','f2','g2','h2','a3','b3','c3','d3','e3','f3','g3','h3','a4','b4','c4','d4','e4','f4','g4','h4','a5','b5','c5','d5','e5','f5','g5','h5','a6','b6','c6','d6','e6','f6','g6','h6','a7','b7','c7','d7','e7','f7','g7','h7','a8','b8','c8','d8','e8','f8','g8','h8'] as Square[]) {
    const piece = game.get(square)
    if (piece?.color === side && piece.type !== 'k' && game.isAttacked(square, enemy) && !game.isAttacked(square, side)) threats.push({ kind: 'hanging', text: `${square} está sob ataque`, to: square })
  }
  return threats.slice(0, 4)
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
