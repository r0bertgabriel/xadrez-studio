// Regenerates public/eco/openings.json from the lichess-org/chess-openings dataset (CC0-1.0).
// Usage: node scripts/build-eco.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Chess } from 'chess.js'

const SOURCE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master'
const VOLUMES = ['a', 'b', 'c', 'd', 'e']
const target = resolve('public/eco/openings.json')

/** FEN without the move counters, so transpositions share one key. */
function positionKey(game) {
  return game.fen().split(' ').slice(0, 4).join(' ')
}

const entries = {}
// How many catalogued lines pass through each position: a proxy for how mainstream it is.
const lineCounts = {}
for (const volume of VOLUMES) {
  const response = await fetch(`${SOURCE}/${volume}.tsv`)
  if (!response.ok) throw new Error(`Falha ao baixar ${volume}.tsv: HTTP ${response.status}`)
  const rows = (await response.text()).trim().split('\n').slice(1)
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t')
    const game = new Chess()
    game.loadPgn(pgn)
    // Later (deeper, more specific) rows for the same position win, matching the dataset's intent.
    entries[positionKey(game)] = [eco, name]
    const replay = new Chess()
    for (const move of game.history()) {
      replay.move(move)
      const key = positionKey(replay)
      lineCounts[key] = (lineCounts[key] ?? 0) + 1
    }
  }
}
for (const [key, entry] of Object.entries(entries)) entry.push(lineCounts[key] ?? 1)

await mkdir(resolve('public/eco'), { recursive: true })
await writeFile(target, JSON.stringify(entries))
console.log(`ECO: ${Object.keys(entries).length} posições gravadas em ${target}`)
