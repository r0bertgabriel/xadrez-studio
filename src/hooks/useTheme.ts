import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'xadrez-studio-theme-v1'
const TRANSITION_MS = 1_220

function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** Light/dark theme with the bishop transition effect while switching. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* Optional. */
    }
  }, [theme])

  function toggleTheme() {
    const root = document.documentElement
    root.classList.remove('theme-switching')
    // Force a reflow so the transition restarts when toggled repeatedly.
    void root.offsetWidth
    root.classList.add('theme-switching')
    setTransitioning(true)
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
    window.setTimeout(() => {
      root.classList.remove('theme-switching')
      setTransitioning(false)
    }, TRANSITION_MS)
  }

  return { theme, transitioning, toggleTheme }
}
