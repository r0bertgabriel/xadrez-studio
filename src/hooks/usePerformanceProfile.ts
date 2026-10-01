import type { Color } from 'chess.js'
import { useEffect, useState } from 'react'

export type PerformanceProfile = {
  games: number
  totalAccuracy: number
  white: { games: number; accuracy: number }
  black: { games: number; accuracy: number }
}

const PERFORMANCE_KEY = 'xadrez-studio-performance-v1'

function initialProfile(): PerformanceProfile {
  return { games: 0, totalAccuracy: 0, white: { games: 0, accuracy: 0 }, black: { games: 0, accuracy: 0 } }
}

function loadProfile(): PerformanceProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(PERFORMANCE_KEY) ?? '') as PerformanceProfile
    if (saved && typeof saved.games === 'number' && saved.white && saved.black) return saved
  } catch {
    /* First session. */
  }
  return initialProfile()
}

/** Running accuracy averages across reviewed games, persisted to localStorage. */
export function usePerformanceProfile() {
  const [profile, setProfile] = useState<PerformanceProfile>(loadProfile)

  useEffect(() => {
    try {
      localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(profile))
    } catch {
      /* Optional. */
    }
  }, [profile])

  function recordReview(side: Color, accuracy: number) {
    setProfile((current) => ({
      games: current.games + 1,
      totalAccuracy: current.totalAccuracy + accuracy,
      white:
        side === 'w' ? { games: current.white.games + 1, accuracy: current.white.accuracy + accuracy } : current.white,
      black:
        side === 'b' ? { games: current.black.games + 1, accuracy: current.black.accuracy + accuracy } : current.black,
    }))
  }

  return { profile, recordReview }
}
