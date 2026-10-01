import type { Theme } from '../hooks/useTheme'

export type ActiveArea = 'play' | 'openings' | 'training' | 'camera' | 'screen'

type GlobalTabsProps = {
  activeArea: ActiveArea
  onSelect: (area: ActiveArea) => void
  theme: Theme
  onToggleTheme: () => void
}

export function GlobalTabs({ activeArea, onSelect, theme, onToggleTheme }: GlobalTabsProps) {
  return (
    <nav className="global-tabs" aria-label="Navegação principal">
      <button className={activeArea === 'play' ? 'active' : ''} onClick={() => onSelect('play')}>
        Jogar &amp; Analisar
      </button>
      <button className={activeArea === 'openings' ? 'active' : ''} onClick={() => onSelect('openings')}>
        Professor de Aberturas
      </button>
      <button className={activeArea === 'training' ? 'active' : ''} onClick={() => onSelect('training')}>
        Centro de Treino
      </button>
      <button className="under-development" disabled title="Em desenvolvimento">
        Visão por câmera <span>Em desenvolvimento</span>
      </button>
      <button className="under-development" disabled title="Em desenvolvimento">
        Análise da tela ao vivo <span>Em desenvolvimento</span>
      </button>
      <button
        className="theme-toggle"
        onClick={onToggleTheme}
        aria-pressed={theme === 'light'}
        aria-label={`Ativar tema ${theme === 'dark' ? 'claro' : 'escuro'}`}
      >
        <span aria-hidden="true">{theme === 'dark' ? '☼' : '☾'}</span>
        {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      </button>
    </nav>
  )
}

export function ThemeTransitionEffect({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div className="theme-piece-transition" aria-hidden="true">
      <div className="theme-bishop">
        <span className="theme-bishop-glow" />
        <img src="/effects/bishop-transition-3d.png" alt="" />
      </div>
    </div>
  )
}

export function ProjectCredit() {
  return (
    <footer className="project-credit">
      <img src="/brand/robert-araujo.jpeg" alt="Robert Araújo" />
      <span>
        Projeto desenvolvido por <strong>Robert Araújo</strong>
      </span>
      <a href="https://github.com/r0bertgabriel" target="_blank" rel="noreferrer">
        GitHub @r0bertgabriel
      </a>
    </footer>
  )
}
