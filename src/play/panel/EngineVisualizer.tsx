import type { Color } from 'chess.js'
import { useEffect, useRef, useState } from 'react'
import type { StockfishEngine } from '../../engine'
import { SearchScene, type SceneColors, type SceneStats } from '../engine-visualizer/search-scene'
import '../../styles/engine-visualizer.css'

const CANVAS_HEIGHT = 250
const STATS_INTERVAL_MS = 250

const compactNumber = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

function readColors(element: HTMLElement): SceneColors {
  const style = getComputedStyle(element)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    text: token('--text', '#f2ece7'),
    muted: token('--text-muted', '#afa49d'),
    subtle: token('--text-subtle', '#7f756f'),
    border: token('--border-strong', '#51433c'),
    accent: token('--accent', '#d9785d'),
    positive: token('--positive', '#5fb583'),
    danger: token('--danger', '#ea6a60'),
    surface: token('--surface', '#211d1b'),
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Live view of Stockfish at work: the real search tree plus a schematic of its NNUE evaluator. */
export default function EngineVisualizer({
  engine,
  perspective,
}: {
  engine: StockfishEngine | null
  perspective: Color
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scene] = useState(() => new SearchScene())
  const [stats, setStats] = useState<SceneStats | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    scene.setPerspective(perspective)
  }, [scene, perspective])

  useEffect(() => {
    if (!engine) return
    return engine.subscribe((progress) => scene.push(progress))
  }, [engine, scene])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    let frame = 0
    let visible = true
    let lastStats = 0
    let lastStatsKey = ''
    let width = 0

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      width = canvas.clientWidth
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(CANVAS_HEIGHT * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    const render = (now: number) => {
      frame = 0
      scene.step(now, reducedMotion)
      scene.draw(context, width, CANVAS_HEIGHT, readColors(canvas), now)
      if (now - lastStats >= STATS_INTERVAL_MS) {
        lastStats = now
        const next = scene.stats()
        const key = JSON.stringify(next)
        if (key !== lastStatsKey) {
          lastStatsKey = key
          setStats(next)
        }
      }
      schedule()
    }

    // Keep drawing while visible: even when idle the frame is cheap, and new searches start instantly.
    const schedule = () => {
      if (!frame && visible) frame = requestAnimationFrame(render)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      schedule()
    })
    visibilityObserver.observe(canvas)
    resize()
    schedule()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
    }
  }, [scene, reducedMotion])

  // Stockfish only reports `currmove` after a few seconds of search; until then show the leading line.
  const examining =
    stats?.currMoveSan && stats.currMoveNumber
      ? `${stats.currMoveSan} (${stats.currMoveNumber}/${stats.legalMoves})`
      : null
  const best = stats?.bestSan ? `${stats.bestSan} ${stats.bestScore ?? ''}`.trim() : '—'

  return (
    <section className="card engine-visualizer">
      <div className="card-title">
        <strong>Stockfish ao vivo</strong>
        <span className={stats?.searching ? 'engine-visualizer-live' : ''}>
          {stats?.searching ? 'calculando' : 'em espera'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="engine-visualizer-canvas"
        style={{ height: CANVAS_HEIGHT }}
        role="img"
        aria-label={`Árvore de busca do Stockfish com profundidade ${stats?.depth ?? 0} e esquema da rede neural NNUE.`}
      />
      <dl className="engine-visualizer-stats">
        <div>
          <dt>Profundidade</dt>
          <dd>{stats?.depth || '—'}</dd>
        </div>
        <div>
          <dt>Posições</dt>
          <dd>{stats?.nodes ? compactNumber.format(stats.nodes) : '—'}</dd>
        </div>
        <div>
          <dt>Por segundo</dt>
          <dd>{stats?.nps ? compactNumber.format(stats.nps) : '—'}</dd>
        </div>
        <div>
          <dt>{examining ? 'Examinando' : 'Melhor até agora'}</dt>
          <dd>{examining ?? best}</dd>
        </div>
      </dl>
      <details className="engine-visualizer-help">
        <summary>Como ler esta animação</summary>
        <p>
          O Stockfish combina uma <b>busca alfa-beta</b>, que explora a árvore de lances possíveis, com a <b>NNUE</b>,
          uma rede neural que avalia cada posição alcançada. Os ramos da árvore são as variantes reais que o motor
          considera melhores; eles crescem conforme a profundidade aumenta, e o anel marca o lance examinado no momento.
          Os pulsos acompanham o ritmo de posições por segundo.
        </p>
        <p>
          Na rede, a grade da esquerda mostra as peças de posições dessas variantes, que são a entrada da NNUE. As
          camadas internas são esquemáticas: o motor não expõe as ativações reais.
        </p>
      </details>
    </section>
  )
}
