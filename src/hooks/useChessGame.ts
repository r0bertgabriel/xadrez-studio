import { Chess } from 'chess.js'
import { useCallback, useRef, useState } from 'react'

/**
 * Owns the current chess.js instance. `game` drives rendering; `gameRef` mirrors it for
 * async callbacks (engine responses) that must compare against the latest position.
 * Instances are treated as immutable: callers clone before moving and then replace.
 */
export function useChessGame() {
  const [game, setGame] = useState(() => new Chess())
  const gameRef = useRef(game)

  const replaceGame = useCallback((next: Chess) => {
    gameRef.current = next
    setGame(next)
  }, [])

  return { game, gameRef, replaceGame }
}
