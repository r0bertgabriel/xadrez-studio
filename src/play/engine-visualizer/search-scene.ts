import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import type { EngineLine, SearchProgress } from '../../engine'

/** 0 = empty, 1 = white piece, 2 = black piece, in board order a8…h1. */
type Occupancy = Uint8Array

type Branch = {
  key: string
  uci: string
  san: string[]
  positions: Occupancy[]
  /** Score from the viewer's perspective, in centipawns (mates mapped to ±10000). */
  score: number | null
  scoreLabel: string
  rank: number
  y: number
  /** Animated y, eased towards `y` when lines reorder. */
  drawY: number
}

type Particle = { branch: string; start: number; duration: number }
type Wave = { start: number; occupancy: Occupancy; seed: number }

export type SceneColors = {
  text: string
  muted: string
  subtle: string
  border: string
  accent: string
  positive: string
  danger: string
  surface: string
}

export type SceneStats = {
  depth: number
  nodes: number | null
  nps: number | null
  currMoveSan: string | null
  currMoveNumber: number | null
  legalMoves: number
  bestSan: string | null
  bestScore: string | null
  searching: boolean
}

const MAX_PLIES = 8
const MAX_BRANCHES = 5
const REBUILD_INTERVAL_MS = 120
const NODE_APPEAR_MS = 260
/** Delay between consecutive nodes of a branch appearing, so fast searches still visibly grow. */
const NODE_STAGGER_MS = 70
const ACTIVE_LEVEL = 0.15
const TREE_HEIGHT = 156
const MIN_PLY_GAP = 34
const NNUE_LAYERS = [12, 8, 6]
const SCORE_NEUTRAL_CP = 50

function occupancyOf(game: Chess): Occupancy {
  const cells = new Uint8Array(64)
  game.board().forEach((row, rank) =>
    row.forEach((piece, file) => {
      if (piece) cells[rank * 8 + file] = piece.color === 'w' ? 1 : 2
    }),
  )
  return cells
}

function playUci(game: Chess, uci: string) {
  return game.move({
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] || undefined) as PieceSymbol | undefined,
  })
}

function scoreFor(line: EngineLine, perspective: Color) {
  const sign = perspective === 'w' ? 1 : -1
  if (line.mate !== null) {
    const mate = line.mate * sign
    return { score: Math.sign(mate) * 10000, label: `M${mate > 0 ? '+' : '−'}${Math.abs(mate)}` }
  }
  if (line.scoreCp === null) return { score: null, label: '' }
  const cp = line.scoreCp * sign
  return { score: cp, label: `${cp >= 0 ? '+' : '−'}${(Math.abs(cp) / 100).toFixed(1)}` }
}

/** Small deterministic PRNG so a given position always lights the network the same way. */
function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashOccupancy(cells: Occupancy) {
  let hash = 2166136261
  for (let index = 0; index < cells.length; index += 1) hash = Math.imul(hash ^ (cells[index] * (index + 1)), 16777619)
  return hash >>> 0
}

const easeOut = (t: number) => 1 - (1 - t) ** 3

/**
 * Turns the engine's live search output into an animated scene: a search tree built from the
 * real principal variations, and a schematic NNUE network fed with positions from those lines.
 */
export class SearchScene {
  private fen: string | null = null
  private rootGame: Chess | null = null
  private branches = new Map<string, Branch>()
  private nodeBirth = new Map<string, number>()
  private particles: Particle[] = []
  private waves: Wave[] = []
  private latest: SearchProgress | null = null
  private linesKey = ''
  private lastRebuild = 0
  private lastParticle = 0
  private lastWave = 0
  private waveCursor = 0
  private perspective: Color = 'w'
  private currMoveSan: string | null = null
  private legalMoves = 0
  private searching = false
  private lastEvent = 0

  setPerspective(perspective: Color) {
    if (perspective === this.perspective) return
    this.perspective = perspective
    this.linesKey = ''
  }

  /** Called for every engine `info` line; cheap — heavy work happens in `step`. */
  push(progress: SearchProgress) {
    this.latest = progress
    this.searching = !progress.done
    this.lastEvent = performance.now()
  }

  stats(): SceneStats {
    const progress = this.latest
    return {
      depth: progress?.depth ?? 0,
      nodes: progress?.nodes ?? null,
      nps: progress?.nps ?? null,
      currMoveSan: this.searching ? this.currMoveSan : null,
      bestSan: this.bestBranch()?.san[0] ?? null,
      bestScore: this.bestBranch()?.scoreLabel || null,
      currMoveNumber: this.searching ? (progress?.currMoveNumber ?? null) : null,
      legalMoves: this.legalMoves,
      searching: this.searching,
    }
  }

  get isAnimating() {
    return this.searching || this.particles.length > 0 || this.waves.length > 0
  }

  private resetFor(fen: string, now: number) {
    this.fen = fen
    this.branches.clear()
    this.nodeBirth.clear()
    this.particles = []
    this.waves = []
    this.linesKey = ''
    this.currMoveSan = null
    try {
      this.rootGame = new Chess(fen)
      this.legalMoves = this.rootGame.moves().length
    } catch {
      this.rootGame = null
      this.legalMoves = 0
    }
    this.lastRebuild = now - REBUILD_INTERVAL_MS
  }

  private rebuild(progress: SearchProgress, now: number) {
    const root = this.rootGame
    if (!root) return
    const lines = progress.lines.slice(0, MAX_BRANCHES)
    const key = `${this.perspective}|${lines.map((line) => `${line.multipv}:${line.depth}:${line.pv.slice(0, MAX_PLIES).join(',')}`).join('|')}`
    if (key !== this.linesKey) {
      this.linesKey = key
      const next = new Map<string, Branch>()
      lines.forEach((line, index) => {
        if (!line.pv.length) return
        const game = new Chess(root.fen())
        const san: string[] = []
        const positions: Occupancy[] = []
        for (const uci of line.pv.slice(0, MAX_PLIES)) {
          try {
            san.push(playUci(game, uci).san)
            positions.push(occupancyOf(game))
          } catch {
            break
          }
        }
        if (!san.length) return
        const uci = line.pv[0]
        const { score, label } = scoreFor(line, this.perspective)
        const previous = this.branches.get(uci)
        const y = lines.length === 1 ? 0.5 : index / (lines.length - 1)
        next.set(uci, {
          key: uci,
          uci,
          san,
          positions,
          score,
          scoreLabel: label,
          rank: index + 1,
          y,
          drawY: previous?.drawY ?? y,
        })
        let previousBirth = now - NODE_STAGGER_MS
        san.forEach((_, ply) => {
          const nodeKey = `${uci}:${ply}`
          const birth = this.nodeBirth.get(nodeKey) ?? Math.max(now, previousBirth + NODE_STAGGER_MS)
          this.nodeBirth.set(nodeKey, birth)
          previousBirth = birth
        })
      })
      this.branches = next
    }
    const currMove = progress.currMove
    if (currMove) {
      try {
        this.currMoveSan = playUci(new Chess(root.fen()), currMove).san
      } catch {
        this.currMoveSan = null
      }
    }
  }

  private bestBranch() {
    return [...this.branches.values()].find((branch) => branch.rank === 1)
  }

  private branchForCurrMove() {
    const uci = this.latest?.currMove
    return uci ? this.branches.get(uci) : undefined
  }

  /** Advances the simulation: rebuilds the tree from the latest lines and spawns or retires pulses. */
  step(now: number, reducedMotion: boolean) {
    const progress = this.latest
    if (progress && progress.fen !== this.fen) this.resetFor(progress.fen, now)
    if (progress && now - this.lastRebuild >= REBUILD_INTERVAL_MS) {
      this.lastRebuild = now
      this.rebuild(progress, now)
    }
    // A search that stopped reporting (cancelled) should stop animating too.
    if (this.searching && now - this.lastEvent > 4_000) this.searching = false

    for (const branch of this.branches.values()) branch.drawY += (branch.y - branch.drawY) * 0.18

    if (reducedMotion) {
      this.particles = []
      this.waves = []
      return
    }

    const nps = progress?.nps ?? 0
    if (this.searching && this.branches.size) {
      // Spawn rate grows with the logarithm of nodes per second: visible, but never a blur.
      const perSecond = Math.max(3, Math.min(26, Math.log10(Math.max(10, nps)) * 4))
      if (now - this.lastParticle > 1000 / perSecond) {
        this.lastParticle = now
        this.particles.push(this.spawnParticle(now))
      }
      const wavesPerSecond = Math.max(1.5, Math.min(3, Math.log10(Math.max(10, nps)) - 2.5))
      if (now - this.lastWave > 1000 / wavesPerSecond) {
        this.lastWave = now
        const wave = this.spawnWave(now)
        if (wave) this.waves.push(wave)
      }
    }
    this.particles = this.particles.filter((particle) => now - particle.start < particle.duration)
    this.waves = this.waves.filter((wave) => now - wave.start < 900)
  }

  private spawnParticle(now: number): Particle {
    const branches = [...this.branches.values()]
    const current = this.branchForCurrMove()
    const weights = branches.map((branch) => (branch === current ? 4 : branch.rank === 1 ? 2.5 : 1))
    let pick = Math.random() * weights.reduce((sum, weight) => sum + weight, 0)
    let chosen = branches[0]
    for (let index = 0; index < branches.length; index += 1) {
      pick -= weights[index]
      if (pick <= 0) {
        chosen = branches[index]
        break
      }
    }
    return { branch: chosen.key, start: now, duration: 700 + chosen.san.length * 110 }
  }

  private spawnWave(now: number): Wave | null {
    const positions = [...this.branches.values()].flatMap((branch) => branch.positions)
    if (!positions.length) return null
    this.waveCursor = (this.waveCursor + 1) % positions.length
    const occupancy = positions[this.waveCursor]
    return { start: now, occupancy, seed: hashOccupancy(occupancy) }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, colors: SceneColors, now: number) {
    ctx.clearRect(0, 0, width, height)
    ctx.font = '10px "DM Mono", ui-monospace, monospace'
    ctx.textBaseline = 'middle'
    this.drawTree(ctx, width, colors, now)
    ctx.strokeStyle = colors.border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, TREE_HEIGHT + 0.5)
    ctx.lineTo(width, TREE_HEIGHT + 0.5)
    ctx.stroke()
    this.drawNetwork(ctx, width, height, colors, now)
  }

  private scoreColor(score: number | null, colors: SceneColors) {
    if (score === null || Math.abs(score) < SCORE_NEUTRAL_CP) return colors.muted
    return score > 0 ? colors.positive : colors.danger
  }

  private treeGeometry(width: number) {
    const rootX = 16
    const firstX = 74
    const lastX = width - 52
    const top = 30
    const bottom = TREE_HEIGHT - 18
    // Narrow cards show fewer plies so node labels never collide.
    const plies = Math.max(3, Math.min(MAX_PLIES, Math.floor((lastX - firstX) / MIN_PLY_GAP) + 1))
    const plyGap = (lastX - firstX) / (plies - 1)
    return { rootX, firstX, plyGap, plies, top, bottom, rootY: (top + bottom) / 2 }
  }

  /** Points of a branch: root first, then one node per ply of its principal variation. */
  private branchPoints(branch: Branch, width: number) {
    const { rootX, firstX, plyGap, plies, top, bottom, rootY } = this.treeGeometry(width)
    const y = top + branch.drawY * (bottom - top)
    const points = [{ x: rootX, y: rootY }]
    branch.san.slice(0, plies).forEach((_, ply) => points.push({ x: firstX + ply * plyGap, y }))
    return points
  }

  private drawTree(ctx: CanvasRenderingContext2D, width: number, colors: SceneColors, now: number) {
    const { rootX, rootY } = this.treeGeometry(width)
    ctx.fillStyle = colors.subtle
    ctx.textAlign = 'left'
    ctx.fillText('ÁRVORE DE BUSCA', 0, 9)
    if (this.latest) {
      ctx.textAlign = 'right'
      ctx.fillText(`profundidade ${this.latest.depth}`, width, 9)
    }

    const current = this.searching ? this.branchForCurrMove() : undefined
    const branches = [...this.branches.values()].sort((a, b) => b.rank - a.rank)

    for (const branch of branches) {
      const points = this.branchPoints(branch, width)
      const color = this.scoreColor(branch.score, colors)
      const highlighted = branch === current
      ctx.strokeStyle = color
      ctx.globalAlpha = highlighted || branch.rank === 1 ? 0.95 : 0.55
      ctx.lineWidth = branch.rank === 1 ? 2 : 1.25
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      // Root edge curves out to the branch row; the rest of the line runs straight.
      const midX = (points[0].x + points[1].x) / 2
      ctx.bezierCurveTo(midX, points[0].y, midX, points[1].y, points[1].x, points[1].y)
      for (let index = 2; index < points.length; index += 1) {
        const birth = this.nodeBirth.get(`${branch.key}:${index - 1}`) ?? 0
        const grow = easeOut(Math.min(1, (now - birth) / NODE_APPEAR_MS))
        const previous = points[index - 1]
        ctx.lineTo(previous.x + (points[index].x - previous.x) * grow, points[index].y)
      }
      ctx.stroke()

      points.slice(1).forEach((point, ply) => {
        const birth = this.nodeBirth.get(`${branch.key}:${ply}`) ?? 0
        const appear = easeOut(Math.min(1, (now - birth) / NODE_APPEAR_MS))
        if (appear <= 0) return
        const radius = (ply === 0 ? 4.5 : 2.6) * appear
        ctx.globalAlpha = (ply === 0 ? 1 : 0.85) * ctx.globalAlpha
        ctx.fillStyle = ply === 0 ? color : colors.surface
        ctx.strokeStyle = color
        ctx.lineWidth = 1.25
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.globalAlpha = highlighted || branch.rank === 1 ? 0.95 : 0.55
      })

      ctx.globalAlpha = 1
      ctx.fillStyle = highlighted ? colors.accent : colors.text
      ctx.textAlign = 'center'
      ctx.fillText(branch.san[0], points[1].x, points[1].y - 11)
      if (branch.san[1] && points[2]) {
        ctx.fillStyle = colors.subtle
        ctx.fillText(branch.san[1], points[2].x, points[2].y - 10)
      }
      ctx.textAlign = 'left'
      ctx.fillStyle = color
      ctx.fillText(branch.scoreLabel, points[points.length - 1].x + 9, points[points.length - 1].y)

      if (highlighted) {
        ctx.strokeStyle = colors.accent
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(points[1].x, points[1].y, 8, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    ctx.globalAlpha = 1
    for (const particle of this.particles) {
      const branch = this.branches.get(particle.branch)
      if (!branch) continue
      const points = this.branchPoints(branch, width)
      const t = Math.min(1, (now - particle.start) / particle.duration)
      const segments = points.length - 1
      const position = t * segments
      const index = Math.min(segments - 1, Math.floor(position))
      const local = position - index
      const from = points[index]
      const to = points[index + 1]
      ctx.fillStyle = colors.accent
      ctx.globalAlpha = 1 - t * 0.6
      ctx.beginPath()
      ctx.arc(from.x + (to.x - from.x) * local, from.y + (to.y - from.y) * local, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    ctx.fillStyle = colors.text
    ctx.beginPath()
    ctx.arc(rootX, rootY, 5.5, 0, Math.PI * 2)
    ctx.fill()

    if (!this.branches.size) {
      ctx.fillStyle = colors.subtle
      ctx.textAlign = 'left'
      ctx.fillText(this.latest ? 'Montando as primeiras variantes…' : 'Aguardando a próxima análise', rootX + 14, rootY)
    }
  }

  private drawNetwork(ctx: CanvasRenderingContext2D, width: number, height: number, colors: SceneColors, now: number) {
    const top = TREE_HEIGHT + 10
    ctx.fillStyle = colors.subtle
    ctx.textAlign = 'left'
    ctx.fillText('REDE NNUE · ESQUEMÁTICA', 0, top + 4)

    const cell = 7
    const gridX = 0
    const gridY = top + 14
    const gridSize = cell * 8
    const latestWave = this.waves.at(-1)
    const occupancy = latestWave?.occupancy ?? this.branches.values().next().value?.positions[0]

    for (let index = 0; index < 64; index += 1) {
      const x = gridX + (index % 8) * cell
      const y = gridY + Math.floor(index / 8) * cell
      const value = occupancy?.[index] ?? 0
      ctx.globalAlpha = 1
      if (value === 1) {
        ctx.fillStyle = colors.text
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2)
      } else if (value === 2) {
        ctx.strokeStyle = colors.text
        ctx.lineWidth = 1
        ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3)
      } else {
        ctx.fillStyle = colors.border
        ctx.fillRect(x + cell / 2 - 0.5, y + cell / 2 - 0.5, 1, 1)
      }
    }

    const outputX = width - 18
    const layerXs = NNUE_LAYERS.map(
      (_, index) => gridSize + 26 + ((outputX - gridSize - 52) * index) / (NNUE_LAYERS.length - 1 || 1),
    )
    const centerY = gridY + gridSize / 2
    const layerYs = NNUE_LAYERS.map((count) => {
      const span = Math.min(gridSize, (count - 1) * 8)
      return Array.from({ length: count }, (_, index) => centerY - span / 2 + (span * index) / Math.max(1, count - 1))
    })

    // Activation per neuron from the newest wave, revealed layer by layer.
    const activations = NNUE_LAYERS.map((count) => new Float32Array(count))
    let outputLevel = 0
    for (const wave of this.waves.slice(-1)) {
      const age = now - wave.start
      const random = mulberry32(wave.seed)
      NNUE_LAYERS.forEach((count, layer) => {
        const local = (age - layer * 110) / 420
        if (local < 0 || local > 1) {
          for (let index = 0; index < count; index += 1) random()
          return
        }
        const envelope = Math.sin(local * Math.PI)
        for (let index = 0; index < count; index += 1) {
          const value = random()
          if (value > 0.72) activations[layer][index] = Math.max(activations[layer][index], envelope * value)
        }
      })
      const outputLocal = (age - NNUE_LAYERS.length * 110) / 420
      if (outputLocal >= 0 && outputLocal <= 1) outputLevel = Math.max(outputLevel, Math.sin(outputLocal * Math.PI))
    }

    // Resting edges form a faint mesh; an edge lights up only when both of its neurons fire.
    let edgeGroup = 0
    const drawEdges = (
      fromX: number,
      fromYs: number[],
      fromLevels: ArrayLike<number> | null,
      toX: number,
      toYs: number[],
      toLevels: ArrayLike<number>,
    ) => {
      edgeGroup += 1
      fromYs.forEach((fromY, fromIndex) => {
        toYs.forEach((toY, toIndex) => {
          const level = Math.min(fromLevels ? fromLevels[fromIndex] : 1, toLevels[toIndex] ?? 0)
          // A fixed subset of "strong" connections carries the signal; the rest stay at rest.
          const strong = (fromIndex * 7 + toIndex * 13 + edgeGroup * 5) % 3 === 0 || toYs.length === 1
          const active = strong && level > ACTIVE_LEVEL
          ctx.strokeStyle = active ? colors.accent : colors.border
          ctx.globalAlpha = active ? 0.2 + level * 0.5 : 0.22
          ctx.lineWidth = active ? 1 : 0.5
          ctx.beginPath()
          ctx.moveTo(fromX, fromY)
          ctx.lineTo(toX, toY)
          ctx.stroke()
        })
      })
    }

    const gridAnchorsY = [gridY + gridSize * 0.2, gridY + gridSize * 0.5, gridY + gridSize * 0.8]
    drawEdges(gridSize + 2, gridAnchorsY, null, layerXs[0], layerYs[0], activations[0])
    for (let layer = 1; layer < NNUE_LAYERS.length; layer += 1) {
      drawEdges(
        layerXs[layer - 1],
        layerYs[layer - 1],
        activations[layer - 1],
        layerXs[layer],
        layerYs[layer],
        activations[layer],
      )
    }
    const lastLayer = NNUE_LAYERS.length - 1
    drawEdges(layerXs[lastLayer], layerYs[lastLayer], activations[lastLayer], outputX, [centerY], [outputLevel])
    ctx.globalAlpha = 1

    NNUE_LAYERS.forEach((count, layer) => {
      for (let index = 0; index < count; index += 1) {
        const level = activations[layer][index]
        ctx.fillStyle = level > ACTIVE_LEVEL ? colors.accent : colors.surface
        ctx.strokeStyle = level > ACTIVE_LEVEL ? colors.accent : colors.muted
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(layerXs[layer], layerYs[layer][index], 2.6 + level * 1.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    })

    const best = [...this.branches.values()].find((branch) => branch.rank === 1)
    const outputColor = this.scoreColor(best?.score ?? null, colors)
    ctx.fillStyle = outputLevel > ACTIVE_LEVEL ? outputColor : colors.surface
    ctx.strokeStyle = outputColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(outputX, centerY, 6 + outputLevel * 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = outputColor
    ctx.textAlign = 'center'
    ctx.fillText(best?.scoreLabel ?? '—', outputX, Math.min(height - 6, centerY + 18))
  }
}
