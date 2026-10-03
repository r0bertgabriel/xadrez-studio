import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useAppearance } from './hooks/useAppearance'
import { usePerformanceProfile } from './hooks/usePerformanceProfile'
import { usePlaySession } from './hooks/usePlaySession'
import { useTheme } from './hooks/useTheme'
import { GlobalTabs, ProjectCredit, ThemeTransitionEffect, type ActiveArea } from './play/AppChrome'
import PlayScreen from './play/PlayScreen'
import SetupScreen from './play/SetupScreen'
import './enhancements.css'
import './styles.css'
import './styles/analysis.css'

// Secondary areas load on demand so the first paint only ships the main board.
const OpeningTrainer = lazy(() => import('./OpeningTrainer'))
const TrainingHub = lazy(() => import('./TrainingHub'))
const CameraAnalysis = lazy(() => import('./CameraAnalysis'))
const ScreenAnalysis = lazy(() => import('./ScreenAnalysis'))

export default function App() {
  const [activeArea, setActiveArea] = useState<ActiveArea>('play')
  const { theme, transitioning, toggleTheme } = useTheme()
  const appearance = useAppearance()
  const { profile, recordReview } = usePerformanceProfile()
  const session = usePlaySession({ onReviewRecorded: recordReview })

  function selectArea(area: ActiveArea) {
    if (area === activeArea) return
    setActiveArea(area)
    // Leaving the play area stops its search; coming back restarts it so the panel is not stuck.
    if (area === 'play') session.resumeAnalysis()
    // A running review keeps going in the background; cancelling it would silently discard it.
    else if (!session.reviewing) session.cancelAnalysis()
  }

  let content: ReactNode
  if (activeArea === 'openings') content = <OpeningTrainer engine={session.engine} pieceSet={appearance.pieceSet} />
  else if (activeArea === 'training') content = <TrainingHub pieceSet={appearance.pieceSet} />
  else if (activeArea === 'camera') content = <CameraAnalysis />
  else if (activeArea === 'screen') content = <ScreenAnalysis engine={session.engine} pieceSet={appearance.pieceSet} />
  else if (!session.playerSide) content = <SetupScreen session={session} />
  else content = <PlayScreen session={session} appearance={appearance} profile={profile} />

  return (
    <>
      <GlobalTabs activeArea={activeArea} onSelect={selectArea} theme={theme} onToggleTheme={toggleTheme} />
      <ThemeTransitionEffect active={transitioning} />
      <Suspense
        fallback={
          <main className="area-loading" role="status">
            Carregando…
          </main>
        }
      >
        {content}
      </Suspense>
      <ProjectCredit />
    </>
  )
}
