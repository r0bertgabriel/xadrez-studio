import { Chess } from 'chess.js'
import { useRef, useState } from 'react'

/**
 * Owns the mutable chess.js instance and the reactive FEN used to invalidate
 * React derived state. UI-specific state (selection, review, annotations) stays
 * outside this hook so the chess domain remains reusable.
 */
export function useChessGame() {
  const gameRef = useRef(new Chess())
  const [fen, setFen] = useState(() => gameRef.current.fen())

  function replaceGame(next: Chess) {
    gameRef.current = next
    setFen(next.fen())
  }

  return { gameRef, fen, setFen, replaceGame }
}
