import { useState } from 'react'
import { EXPORT_THEME_COLORS } from '../appearance'
import type { Appearance } from '../hooks/useAppearance'
import type { PerformanceProfile } from '../hooks/usePerformanceProfile'
import type { PlaySession } from '../hooks/usePlaySession'
import BoardColumn from './BoardColumn'
import AppearanceCard from './panel/AppearanceCard'
import { CandidateLinesCard, EngineSettingsCard, RecommendationCard, TelemetryCard } from './panel/EngineCards'
import EngineVisualizer from './panel/EngineVisualizer'
import EvaluationCard from './panel/EvaluationCard'
import { ExportCard, MovesCard, ProfileCard } from './panel/GameCards'
import { OpeningCard, TacticalCards } from './panel/PositionCards'
import { GameOverDialog, PromotionDialog, ToolsDialog } from './PlayDialogs'
import ReviewSection from './ReviewSection'

type Props = { session: PlaySession; appearance: Appearance; profile: PerformanceProfile }

function EngineStatus({ session }: { session: PlaySession }) {
  const { engineError, thinking, reviewing } = session
  const label = engineError
    ? 'Falha na engine'
    : reviewing
      ? 'Revisando partida'
      : thinking
        ? 'Calculando'
        : 'Engine pronta'
  return (
    <div className={`engine-status ${engineError ? 'error' : ''}`} role="status" aria-live="polite">
      <span className={thinking || reviewing ? 'pulse' : 'dot'} />
      {label}
    </div>
  )
}

export default function PlayScreen({ session, appearance, profile }: Props) {
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const { mode, liveGame, engineError, mateAlert, result } = session
  const moveNumber = liveGame.moveNumber()

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark small">
            <img src="/brand/robert-araujo.jpeg" alt="Logo de Robert Araújo" />
          </div>
          <div>
            <span className="eyebrow">ANÁLISE LOCAL</span>
            <h1>Xadrez Studio</h1>
          </div>
        </div>
        <div className="top-actions">
          <div className="session-meta">
            <span>PARTIDA</span>
            <b>{mode === 'analysis' ? 'ANÁLISE LIVRE' : `LANCE ${moveNumber}`}</b>
          </div>
          <button className="ghost-button" onClick={() => setPanelCollapsed((value) => !value)}>
            {panelCollapsed ? 'Mostrar painel' : 'Ocultar painel'}
          </button>
          <button className="ghost-button" onClick={() => session.setShowTools(true)}>
            PGN / FEN
          </button>
          <button className="ghost-button" onClick={session.leaveToSetup}>
            Trocar modo
          </button>
          <EngineStatus session={session} />
        </div>
      </header>
      {engineError && (
        <div className="error-banner">
          <strong>Stockfish:</strong> {engineError}
        </div>
      )}
      {mateAlert && !result && <div className="mate-alert">{mateAlert}</div>}

      <section className={`game-layout ${panelCollapsed ? 'panel-collapsed' : ''}`}>
        <BoardColumn session={session} appearance={appearance} />
        <aside className="coach-panel">
          <EngineVisualizer engine={session.engine} perspective={session.perspective} />
          <EvaluationCard session={session} />
          <OpeningCard session={session} />
          <TacticalCards session={session} />
          <RecommendationCard session={session} />
          <CandidateLinesCard session={session} />
          <TelemetryCard session={session} />
          <AppearanceCard appearance={appearance} />
          <EngineSettingsCard session={session} />
          <MovesCard session={session} />
          <ExportCard
            session={session}
            pieceSet={appearance.pieceSet}
            colors={EXPORT_THEME_COLORS[appearance.boardTheme]}
          />
          <ProfileCard profile={profile} storedGames={session.storedGames} />
        </aside>
      </section>

      <ReviewSection session={session} />
      <GameOverDialog session={session} />
      <PromotionDialog session={session} pieceSet={appearance.pieceSet} />
      <ToolsDialog session={session} />
    </main>
  )
}
