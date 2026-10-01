import { Chess } from 'chess.js'
import { useEffect, useState } from 'react'

/** Position key (FEN without move counters) → [ECO code, opening name, catalogued lines through it]. */
export type EcoDatabase = Record<string, [string, string, number]>
export type EcoOpening = { eco: string; name: string }
export type EcoContinuation = EcoOpening & { san: string }

const ECO_URL = '/eco/openings.json'
let ecoPromise: Promise<EcoDatabase> | null = null

export function loadEco(): Promise<EcoDatabase> {
  ecoPromise ??= fetch(ECO_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json() as Promise<EcoDatabase>
    })
    .catch((error) => {
      // Allow a later retry instead of caching the failure forever.
      ecoPromise = null
      throw error
    })
  return ecoPromise
}

/** Loads the ECO database once; returns null while loading or if it is unavailable. */
export function useEco() {
  const [eco, setEco] = useState<EcoDatabase | null>(null)
  useEffect(() => {
    let active = true
    loadEco().then(
      (data) => {
        if (active) setEco(data)
      },
      () => {
        /* The ECO names are optional. */
      },
    )
    return () => {
      active = false
    }
  }, [])
  return eco
}

function keyOf(fen: string) {
  return fen.split(' ').slice(0, 4).join(' ')
}

function positionKey(game: Chess) {
  return keyOf(game.fen())
}

function toOpening(entry: EcoDatabase[string] | undefined): EcoOpening | null {
  return entry ? { eco: entry[0], name: entry[1] } : null
}

/** Most specific named opening reached along the game, even after it leaves the catalogue. */
export function ecoOpeningFor(db: EcoDatabase, game: Chess): EcoOpening | null {
  let found = toOpening(db[positionKey(game)])
  if (found) return found
  // Walk back through the game so a position past the catalogue keeps its last known name.
  const moves = game.history({ verbose: true })
  for (let index = moves.length - 1; index >= 0 && !found; index -= 1) {
    found = toOpening(db[keyOf(moves[index].before)])
  }
  return found
}

/** Legal moves from this position that reach a catalogued opening, most established lines first. */
export function ecoContinuations(db: EcoDatabase, game: Chess): EcoContinuation[] {
  const continuations: Array<EcoContinuation & { lines: number }> = []
  for (const move of game.moves({ verbose: true })) {
    const entry = db[keyOf(move.after)]
    if (entry) continuations.push({ san: move.san, eco: entry[0], name: entry[1], lines: entry[2] })
  }
  return continuations
    .sort((a, b) => b.lines - a.lines || a.eco.localeCompare(b.eco))
    .map(({ lines: _lines, ...continuation }) => continuation)
}
