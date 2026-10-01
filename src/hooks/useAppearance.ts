import { useEffect, useState } from 'react'
import {
  loadAppearancePreferences,
  PREFERENCES_KEY,
  type BoardTheme,
  type FavoriteAppearance,
  type HintStyle,
  type PieceSet,
} from '../appearance'

/** Board appearance preferences, persisted to localStorage. */
export function useAppearance() {
  const [initial] = useState(loadAppearancePreferences)
  const [pieceSet, setPieceSet] = useState<PieceSet>(initial.pieceSet)
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(initial.boardTheme)
  const [hintStyle, setHintStyle] = useState<HintStyle>(initial.hintStyle)
  const [favoriteAppearance, setFavoriteAppearance] = useState<FavoriteAppearance | null>(initial.favoriteAppearance)

  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ pieceSet, boardTheme, hintStyle, favoriteAppearance }))
    } catch {
      /* Preferences are optional. */
    }
  }, [pieceSet, boardTheme, hintStyle, favoriteAppearance])

  function saveFavorite() {
    setFavoriteAppearance({ pieceSet, boardTheme, hintStyle })
  }

  function applyFavorite() {
    if (!favoriteAppearance) return
    setPieceSet(favoriteAppearance.pieceSet)
    setBoardTheme(favoriteAppearance.boardTheme)
    setHintStyle(favoriteAppearance.hintStyle)
  }

  return {
    pieceSet,
    setPieceSet,
    boardTheme,
    setBoardTheme,
    hintStyle,
    setHintStyle,
    favoriteAppearance,
    saveFavorite,
    applyFavorite,
  }
}

export type Appearance = ReturnType<typeof useAppearance>
