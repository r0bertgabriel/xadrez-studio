export type EngineLine = {
  multipv: number
  depth: number
  selDepth: number | null
  scoreCp: number | null
  mate: number | null
  nodes: number | null
  nps: number | null
  timeMs: number | null
  pv: string[]
}

export type EngineAnalysis = {
  bestMove: string
  ponder?: string
  lines: EngineLine[]
}

/** Live snapshot of a running search, emitted for every UCI `info` line. */
export type SearchProgress = {
  fen: string
  /** Principal variations found so far, ordered by MultiPV rank. */
  lines: EngineLine[]
  depth: number
  nodes: number | null
  nps: number | null
  timeMs: number | null
  /** Root move being searched right now (UCI), when Stockfish reports it. */
  currMove: string | null
  currMoveNumber: number | null
  done: boolean
}
export type SearchListener = (progress: SearchProgress) => void

type Pending = {
  resolve: (value: EngineAnalysis) => void
  reject: (reason?: unknown) => void
  lines: Map<number, EngineLine>
  fen: string
  timeoutId: number
  generation: number
  depth: number
  nodes: number | null
  nps: number | null
  timeMs: number | null
  currMove: string | null
  currMoveNumber: number | null
}

export type StockfishVariant = 'lite' | 'full'

type EngineBuild = { path: string; threaded: boolean }

const SINGLE_THREADED_BUILDS: Record<StockfishVariant, EngineBuild> = {
  lite: { path: '/stockfish/stockfish-19-lite-single.js', threaded: false },
  full: { path: '/stockfish/stockfish-19-single.js', threaded: false },
}
// The full multithreaded build (~94 MB) is not shipped; only lite has a threaded variant.
const MULTI_THREADED_BUILDS: Partial<Record<StockfishVariant, EngineBuild>> = {
  lite: { path: '/stockfish/stockfish-19-lite.js', threaded: true },
}
const ENGINE_READY_TIMEOUT_MS = 12_000
const ENGINE_SEARCH_TIMEOUT_MS = 30_000
/** How long a `stop`ped search may take to print its `bestmove` before the worker is considered hung. */
const ENGINE_STOP_GRACE_MS = 5_000
const MAX_ENGINE_THREADS = 8
const THREADED_HASH_MB = 64

function supportsThreadedEngine() {
  return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true
}

function selectBuild(variant: StockfishVariant): EngineBuild {
  const threaded = MULTI_THREADED_BUILDS[variant]
  return threaded && supportsThreadedEngine() ? threaded : SINGLE_THREADED_BUILDS[variant]
}

/** Leaves one core free for the UI thread. */
function engineThreadCount() {
  const cores = navigator.hardwareConcurrency || 2
  return Math.max(1, Math.min(MAX_ENGINE_THREADS, cores - 1))
}

function sortedLines(pending: Pending) {
  return [...pending.lines.values()].sort((a, b) => a.multipv - b.multipv)
}

export class AnalysisCancelledError extends Error {
  constructor() {
    super('Análise cancelada porque uma posição mais recente foi solicitada.')
    this.name = 'AnalysisCancelledError'
  }
}

export class StockfishEngine {
  private worker: Worker
  private ready: Promise<void>
  private pending: Pending | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private destroyed = false
  private workerFailed = false
  private analysisGeneration = 0
  /** True between posting `go` and receiving its `bestmove`, even if nobody awaits the result anymore. */
  private searching = false
  private searchFinishedWaiters: Array<() => void> = []
  private readonly variant: StockfishVariant
  private build: EngineBuild
  private readonly searchListeners = new Set<SearchListener>()

  constructor(variant: StockfishVariant = 'lite') {
    this.variant = variant
    this.build = selectBuild(variant)
    this.worker = this.createWorker()
    this.ready = this.startWorker()
  }

  /** Receives live progress of every search; returns the unsubscribe function. */
  subscribe(listener: SearchListener) {
    this.searchListeners.add(listener)
    return () => {
      this.searchListeners.delete(listener)
    }
  }

  /** Number of search threads the running build uses (1 for single-threaded builds). */
  get threads() {
    return this.build.threaded ? engineThreadCount() : 1
  }

  analyze(fen: string, depth = 15, multiPv = 3): Promise<EngineAnalysis> {
    const generation = this.analysisGeneration
    return this.enqueue(async () => {
      this.ensureCurrentAnalysis(generation)
      await this.prepareForSearch()
      this.ensureCurrentAnalysis(generation)
      this.worker.postMessage('setoption name UCI_LimitStrength value false')
      this.worker.postMessage(`setoption name MultiPV value ${Math.max(1, Math.min(5, multiPv))}`)
      await this.waitForReady()
      this.ensureCurrentAnalysis(generation)
      this.worker.postMessage(`position fen ${fen}`)
      return this.startSearch(fen, `go depth ${Math.max(1, depth)}`, generation)
    })
  }

  bestMove(fen: string, elo = 1500, moveTimeMs = 450): Promise<string> {
    const generation = this.analysisGeneration
    return this.enqueue(async () => {
      this.ensureCurrentAnalysis(generation)
      await this.prepareForSearch()
      this.ensureCurrentAnalysis(generation)
      this.worker.postMessage('setoption name MultiPV value 1')
      this.worker.postMessage('setoption name UCI_LimitStrength value true')
      this.worker.postMessage(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`)
      await this.waitForReady()
      this.ensureCurrentAnalysis(generation)
      this.worker.postMessage(`position fen ${fen}`)

      try {
        const result = await this.startSearch(fen, `go movetime ${Math.max(100, moveTimeMs)}`, generation)
        if (!result.bestMove || result.bestMove === '(none)') {
          throw new Error('Stockfish não retornou um lance válido.')
        }
        return result.bestMove
      } finally {
        if (!this.destroyed && !this.workerFailed) {
          this.worker.postMessage('setoption name UCI_LimitStrength value false')
        }
      }
    })
  }

  stop() {
    if (!this.destroyed && !this.workerFailed) this.worker.postMessage('stop')
  }

  cancelAnalysis() {
    this.analysisGeneration += 1
    if (!this.destroyed && !this.workerFailed) this.worker.postMessage('stop')
    this.rejectPending(new AnalysisCancelledError())
  }

  newGame() {
    return this.enqueue(async () => {
      await this.prepareForSearch()
      this.worker.postMessage('ucinewgame')
      await this.waitForReady()
    })
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.analysisGeneration += 1
    this.rejectPending(new Error('Engine encerrada.'))
    this.worker.terminate()
    this.searching = false
    this.flushSearchFinishedWaiters()
  }

  private createWorker() {
    const worker = new Worker(this.build.path)
    this.searching = false
    this.flushSearchFinishedWaiters()
    worker.onmessage = (event) => this.handleMessage(String(event.data))
    worker.onerror = () => {
      this.markWorkerFailed(new Error('O Web Worker do Stockfish falhou durante a execução.'), worker)
    }
    return worker
  }

  /** Starts the selected build, falling back to the single-threaded one if threads fail to boot. */
  private startWorker(): Promise<void> {
    const promise = this.initializeWorker(this.worker).catch((error) => {
      if (!this.build.threaded || this.destroyed) throw error
      this.worker.terminate()
      this.build = SINGLE_THREADED_BUILDS[this.variant]
      this.worker = this.createWorker()
      this.workerFailed = false
      return this.initializeWorker(this.worker)
    })
    promise.catch(() => {})
    return promise
  }

  private initializeWorker(worker: Worker): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      let settled = false
      const timeoutId = window.setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        this.workerFailed = true
        reject(new Error('Stockfish não respondeu durante a inicialização. Verifique os arquivos em public/stockfish.'))
      }, ENGINE_READY_TIMEOUT_MS)

      const cleanup = () => {
        window.clearTimeout(timeoutId)
        worker.removeEventListener('message', listener)
        worker.removeEventListener('error', onError)
      }

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        this.workerFailed = true
        reject(error)
      }

      const onError = () => {
        fail(new Error('Falha ao carregar o Web Worker do Stockfish.'))
      }

      const listener = (event: MessageEvent) => {
        const message = String(event.data)
        if (message.startsWith('info string CRITICAL ERROR')) {
          fail(new Error(`Stockfish falhou durante a inicialização: ${message}`))
          return
        }
        if (message === 'uciok') {
          if (this.build.threaded) {
            worker.postMessage(`setoption name Threads value ${engineThreadCount()}`)
            worker.postMessage(`setoption name Hash value ${THREADED_HASH_MB}`)
          }
          worker.postMessage('isready')
          return
        }
        if (message === 'readyok' && !settled) {
          settled = true
          cleanup()
          this.workerFailed = false
          resolve()
        }
      }

      worker.addEventListener('message', listener)
      worker.addEventListener('error', onError)
      worker.postMessage('uci')
    })
    // The engine may be destroyed/recreated (e.g. React StrictMode's mount-cleanup-mount)
    // before anything awaits `this.ready`. Without this, a later timeout/error here
    // surfaces as an unhandled promise rejection even though nobody still cares about it.
    promise.catch(() => {})
    return promise
  }

  private async ensureReady() {
    this.ensureAlive()

    if (this.workerFailed) {
      this.worker.terminate()
      this.worker = this.createWorker()
      this.workerFailed = false
      this.ready = this.initializeWorker(this.worker)
    }

    try {
      await this.ready
    } catch (error) {
      this.workerFailed = true
      throw error
    }

    this.ensureAlive()
  }

  /**
   * Leaves the worker idle and ready for new commands. The stockfish.js wrapper only queues `go` and
   * `setoption` while searching; `isready`, `position` and `ucinewgame` run immediately. Starting a new
   * search before the previous `bestmove` arrives would let that stale `bestmove` resolve the new
   * request (wrong hint, no lines, live view marked as finished) and change the position mid-search.
   */
  private async prepareForSearch() {
    await this.ensureReady()
    if (!this.searching) return
    await this.waitForSearchToFinish()
    // A hung search marks the worker as failed; this restarts it.
    await this.ensureReady()
  }

  private waitForSearchToFinish(): Promise<void> {
    const worker = this.worker
    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.markWorkerFailed(new Error('Stockfish não interrompeu a busca anterior.'), worker)
        resolve()
      }, ENGINE_STOP_GRACE_MS)
      this.searchFinishedWaiters.push(() => {
        window.clearTimeout(timeoutId)
        resolve()
      })
      worker.postMessage('stop')
    })
  }

  private flushSearchFinishedWaiters() {
    const waiters = this.searchFinishedWaiters
    this.searchFinishedWaiters = []
    for (const waiter of waiters) waiter()
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const timeoutId = window.setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('Stockfish não confirmou que está pronto para analisar.'))
      }, ENGINE_READY_TIMEOUT_MS)

      const cleanup = () => {
        window.clearTimeout(timeoutId)
        this.worker.removeEventListener('message', onMessage)
        this.worker.removeEventListener('error', onError)
      }
      const onMessage = (event: MessageEvent) => {
        if (String(event.data) !== 'readyok' || settled) return
        settled = true
        cleanup()
        resolve()
      }
      const onError = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('Stockfish falhou enquanto aplicava a configuração UCI.'))
      }

      this.worker.addEventListener('message', onMessage)
      this.worker.addEventListener('error', onError)
      this.worker.postMessage('isready')
    })
  }

  private startSearch(fen: string, command: string, generation: number): Promise<EngineAnalysis> {
    this.ensureCurrentAnalysis(generation)
    return new Promise<EngineAnalysis>((resolve, reject) => {
      const worker = this.worker
      // On timeout, `stop` makes Stockfish answer with the best line found so far; only a worker
      // that ignores it too is treated as hung and restarted.
      const timeoutId = window.setTimeout(() => {
        const pending = this.pending
        if (!pending || pending.fen !== fen || pending.generation !== generation) return
        worker.postMessage('stop')
        pending.timeoutId = window.setTimeout(() => {
          this.markWorkerFailed(new Error('A análise do Stockfish excedeu o tempo limite.'), worker)
        }, ENGINE_STOP_GRACE_MS)
      }, ENGINE_SEARCH_TIMEOUT_MS)

      this.pending = {
        resolve,
        reject,
        lines: new Map(),
        fen,
        timeoutId,
        generation,
        depth: 0,
        nodes: null,
        nps: null,
        timeMs: null,
        currMove: null,
        currMoveNumber: null,
      }
      this.searching = true
      this.worker.postMessage(command)
    })
  }

  private rejectPending(error: Error) {
    if (!this.pending) return
    const pending = this.pending
    this.pending = null
    window.clearTimeout(pending.timeoutId)
    pending.reject(error)
  }

  private markWorkerFailed(error: Error, worker = this.worker) {
    if (worker !== this.worker || this.destroyed) return
    this.workerFailed = true
    this.searching = false
    this.rejectPending(error)
    worker.terminate()
    this.flushSearchFinishedWaiters()
  }

  private ensureAlive() {
    if (this.destroyed) throw new Error('Stockfish já foi encerrado.')
  }

  private ensureCurrentAnalysis(generation: number) {
    this.ensureAlive()
    if (generation !== this.analysisGeneration) throw new AnalysisCancelledError()
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job)
    this.queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  private handleMessage(message: string) {
    if (message.startsWith('info string CRITICAL ERROR')) {
      this.markWorkerFailed(new Error(`Stockfish rejeitou a posição ou comando UCI: ${message}`))
      return
    }

    if (message.startsWith('bestmove ')) {
      this.searching = false
      this.flushSearchFinishedWaiters()
    }

    if (!this.pending) return
    if (this.pending.generation !== this.analysisGeneration) {
      this.rejectPending(new AnalysisCancelledError())
      return
    }

    if (message.startsWith('info ') && !message.startsWith('info string')) {
      const pending = this.pending
      const depthMatch = message.match(/\bdepth (\d+)/)
      const nodesMatch = message.match(/\bnodes (\d+)/)
      const npsMatch = message.match(/\bnps (\d+)/)
      const timeMatch = message.match(/\btime (\d+)/)
      const currMoveMatch = message.match(/\bcurrmove (\S+)/)
      const currMoveNumberMatch = message.match(/\bcurrmovenumber (\d+)/)
      if (depthMatch) pending.depth = Math.max(pending.depth, Number(depthMatch[1]))
      if (nodesMatch) pending.nodes = Number(nodesMatch[1])
      if (npsMatch) pending.nps = Number(npsMatch[1])
      if (timeMatch) pending.timeMs = Number(timeMatch[1])
      if (currMoveMatch) {
        pending.currMove = currMoveMatch[1]
        pending.currMoveNumber = currMoveNumberMatch ? Number(currMoveNumberMatch[1]) : null
      }

      if (message.includes(' pv ')) {
        const multipv = Number(message.match(/\bmultipv (\d+)/)?.[1] ?? '1')
        const selDepthMatch = message.match(/\bseldepth (\d+)/)
        const cpMatch = message.match(/\bscore cp (-?\d+)/)
        const mateMatch = message.match(/\bscore mate (-?\d+)/)
        const pvRaw = message.split(' pv ')[1] ?? ''
        const sideToMove = pending.fen.split(' ')[1]
        const perspective = sideToMove === 'w' ? 1 : -1

        pending.lines.set(multipv, {
          multipv,
          depth: Number(depthMatch?.[1] ?? '0'),
          selDepth: selDepthMatch ? Number(selDepthMatch[1]) : null,
          scoreCp: cpMatch ? Number(cpMatch[1]) * perspective : null,
          mate: mateMatch ? Number(mateMatch[1]) * perspective : null,
          nodes: nodesMatch ? Number(nodesMatch[1]) : null,
          nps: npsMatch ? Number(npsMatch[1]) : null,
          timeMs: timeMatch ? Number(timeMatch[1]) : null,
          pv: pvRaw.trim().split(/\s+/).filter(Boolean),
        })
      }
      this.emitProgress(pending, false)
      return
    }

    if (message.startsWith('bestmove ')) {
      const [, bestMove, ponderToken, ponder] = message.split(/\s+/)
      const pending = this.pending
      this.pending = null
      window.clearTimeout(pending.timeoutId)
      this.emitProgress(pending, true)
      pending.resolve({
        bestMove,
        ponder: ponderToken === 'ponder' ? ponder : undefined,
        lines: sortedLines(pending),
      })
    }
  }

  private emitProgress(pending: Pending, done: boolean) {
    if (!this.searchListeners.size) return
    const progress: SearchProgress = {
      fen: pending.fen,
      lines: sortedLines(pending),
      depth: pending.depth,
      nodes: pending.nodes,
      nps: pending.nps,
      timeMs: pending.timeMs,
      currMove: pending.currMove,
      currMoveNumber: pending.currMoveNumber,
      done,
    }
    for (const listener of this.searchListeners) listener(progress)
  }
}
