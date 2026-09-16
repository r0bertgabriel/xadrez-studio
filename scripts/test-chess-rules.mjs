import assert from 'node:assert/strict'
import { Chess } from 'chess.js'

function play(moves) {
  const game = new Chess()
  for (const move of moves) game.move(move)
  return game
}

const foolsMate = play(['f3', 'e5', 'g4', 'Qh4#'])
assert.equal(foolsMate.isGameOver(), true, 'checkmate must end the game')
assert.equal(foolsMate.isCheckmate(), true, 'Fool\'s mate must be detected')
assert.equal(foolsMate.inCheck(), true, 'checkmated king must be in check')
assert.match(foolsMate.history().at(-1), /#$/, 'mate SAN must include #')

const stalemate = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
assert.equal(stalemate.isStalemate(), true, 'stalemate must be detected')
assert.equal(stalemate.isGameOver(), true, 'stalemate must end the game')

const insufficient = new Chess('8/8/8/8/8/5k2/8/7K w - - 0 1')
assert.equal(insufficient.isInsufficientMaterial(), true, 'king vs king must be insufficient material')

const fiftyMove = new Chess('8/8/8/8/8/5k2/7R/7K w - - 100 51')
assert.equal(fiftyMove.isDrawByFiftyMoves(), true, '50-move draw must be detected explicitly')
assert.equal(fiftyMove.isGameOver(), true, '50-move draw must end the game')

const repetition = play(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'])
assert.equal(repetition.isThreefoldRepetition(), true, 'threefold repetition must be detected')

const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
const castleMove = castle.move('O-O')
assert.equal(castleMove.isKingsideCastle(), true, 'kingside castling flag must be available')

const enPassant = new Chess('8/8/8/3pP3/8/8/8/4K2k w - d6 0 1')
const ep = enPassant.move({ from: 'e5', to: 'd6' })
assert.equal(ep.isEnPassant(), true, 'en passant must be legal and flagged')

const promotion = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1')
const promoted = promotion.move({ from: 'a7', to: 'a8', promotion: 'n' })
assert.equal(promoted.isPromotion(), true, 'promotion must be detected')
assert.equal(promotion.get('a8')?.type, 'n', 'selected promotion piece must be used')

const customStart = new Chess('7k/8/8/8/8/8/5K2/6R1 w - - 0 1')
const startFen = customStart.fen()
customStart.move('Rg8+')
customStart.move('Kxg8')
while (customStart.history().length) customStart.undo()
assert.equal(customStart.fen(), startFen, 'rewinding a FEN-based game must preserve its custom starting position')

console.log('Chess rules smoke tests: OK')
