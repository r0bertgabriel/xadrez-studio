import type { PlaySession } from '../hooks/usePlaySession'

export default function SetupScreen({ session }: { session: PlaySession }) {
  return (
    <main className="setup-shell">
      <section className="setup-card">
        <div className="brand-mark">
          <img src="/brand/robert-araujo.jpeg" alt="Logo de Robert Araújo" />
        </div>
        <span className="eyebrow">STOCKFISH 19 · LOCAL</span>
        <h1>Xadrez Studio</h1>
        <p>Escolha como quer usar o tabuleiro. Todo o processamento continua local no navegador.</p>
        <div className="side-options">
          <button className="side-option white-option" onClick={() => session.startWithSide('w')}>
            <span className="side-piece">♔</span>
            <strong>Jogar com brancas</strong>
            <small>Análise focada na perspectiva das brancas.</small>
          </button>
          <button className="side-option black-option" onClick={() => session.startWithSide('b')}>
            <span className="side-piece">♚</span>
            <strong>Jogar com pretas</strong>
            <small>Análise focada na perspectiva das pretas.</small>
          </button>
        </div>
        <button className="analysis-start" onClick={() => session.startWithSide('w', 'analysis')}>
          Modo análise livre · ambos os lados
        </button>
        {session.savedSession && (
          <button className="restore-button" onClick={session.restoreSession}>
            Restaurar última sessão
          </button>
        )}
        {session.engineError && (
          <div className="error-banner">
            <strong>Sessão:</strong> {session.engineError}
          </div>
        )}
        <div className="setup-note">Sem LLM, API paga ou adversário obrigatório.</div>
      </section>
    </main>
  )
}
