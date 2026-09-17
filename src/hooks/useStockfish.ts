import { useCallback, useEffect, useRef, useState } from 'react'
import { StockfishEngine } from '../engine'

/** Keeps the Stockfish worker lifecycle out of presentation components. */
export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null)
  const [engine, setEngine] = useState<StockfishEngine | null>(null)

  useEffect(() => {
    const instance = new StockfishEngine()
    engineRef.current = instance
    setEngine(instance)
    return () => {
      instance.cancelAnalysis()
      instance.destroy()
      engineRef.current = null
    }
  }, [])

  const cancelAnalysis = useCallback(() => {
    engineRef.current?.cancelAnalysis()
  }, [])

  return { engine, engineRef, cancelAnalysis }
}
