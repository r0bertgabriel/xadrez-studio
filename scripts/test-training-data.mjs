import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Chess } from 'chess.js'

const source = fs.readFileSync(new URL('../src/training-data.ts', import.meta.url), 'utf8')
const pattern = /fen: '([^']+)'[\s\S]*?side: '([wb])'[\s\S]*?solution: '([a-h][1-8][a-h][1-8][qrbn]?)'/g
const positions = [...source.matchAll(pattern)]
assert.ok(positions.length >= 8, 'training catalog should expose multiple positions')

const ids = [...source.matchAll(/id: '([^']+)'/g)].map((match) => match[1])
assert.equal(new Set(ids).size, ids.length, 'training position ids must be unique')

const signatures = new Set()
for (const [, fen, side, uci] of positions) {
  const signature = `${fen}|${uci}`
  assert.equal(signatures.has(signature), false, `duplicate training position ${signature}`)
  signatures.add(signature)
  const game = new Chess(fen)
  assert.equal(game.turn(), side, `side-to-move mismatch for ${fen}`)
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const promotion = uci[4]
  const legal = game.moves({ square: from, verbose: true }).some((move) =>
    move.to === to && (!promotion || move.promotion === promotion)
  )
  assert.equal(legal, true, `illegal training solution ${uci} for ${fen}`)
}

console.log(`Training catalog smoke tests: OK (${positions.length} positions, ${ids.length} unique ids)`)
