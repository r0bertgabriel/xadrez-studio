import { useCallback, useEffect, useRef } from 'react'
import { StockfishEngine } from '../engine'

/** Keeps the Stockfish worker lifecycle out of presentation components. */
export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null)

  useEffect(() => {
    const engine = new StockfishEngine()
    engineRef.current = engine
    return () => {
      engine.cancelAnalysis()
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  const cancelAnalysis = useCallback(() => {
    engineRef.current?.cancelAnalysis()
  }, [])

  return { engineRef, cancelAnalysis }
}
