export type EngineLine = {
  multipv: number
  depth: number
  scoreCp: number | null
  mate: number | null
  pv: string[]
}

export type EngineAnalysis = {
  bestMove: string
  ponder?: string
  lines: EngineLine[]
}

type Pending = {
  resolve: (value: EngineAnalysis) => void
  reject: (reason?: unknown) => void
  lines: Map<number, EngineLine>
  fen: string
  timeoutId: number
}

const ENGINE_PATH = '/stockfish/stockfish-19-lite-single.js'
const ENGINE_READY_TIMEOUT_MS = 12_000
const ENGINE_SEARCH_TIMEOUT_MS = 30_000

export class StockfishEngine {
  private worker: Worker
  private ready: Promise<void>
  private pending: Pending | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private destroyed = false
  private workerFailed = false

  constructor() {
    this.worker = this.createWorker()
    this.ready = this.initializeWorker(this.worker)
  }

  analyze(fen: string, depth = 15, multiPv = 3): Promise<EngineAnalysis> {
    return this.enqueue(async () => {
      await this.ensureReady()
      this.worker.postMessage('stop')
      this.worker.postMessage('setoption name UCI_LimitStrength value false')
      this.worker.postMessage(`setoption name MultiPV value ${Math.max(1, Math.min(5, multiPv))}`)
      this.worker.postMessage(`position fen ${fen}`)
      return this.startSearch(fen, `go depth ${Math.max(1, depth)}`)
    })
  }

  bestMove(fen: string, elo = 1500, moveTimeMs = 450): Promise<string> {
    return this.enqueue(async () => {
      await this.ensureReady()
      this.worker.postMessage('stop')
      this.worker.postMessage('setoption name MultiPV value 1')
      this.worker.postMessage('setoption name UCI_LimitStrength value true')
      this.worker.postMessage(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`)
      this.worker.postMessage(`position fen ${fen}`)

      try {
        const result = await this.startSearch(fen, `go movetime ${Math.max(100, moveTimeMs)}`)
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

  async newGame() {
    await this.ensureReady()
    this.stop()
    this.worker.postMessage('ucinewgame')
    this.worker.postMessage('isready')
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.rejectPending(new Error('Engine encerrada.'))
    this.worker.terminate()
  }

  private createWorker() {
    const worker = new Worker(ENGINE_PATH)
    worker.onmessage = (event) => this.handleMessage(String(event.data))
    worker.onerror = () => {
      this.markWorkerFailed(new Error('O Web Worker do Stockfish falhou durante a execução.'), worker)
    }
    return worker
  }

  private initializeWorker(worker: Worker): Promise<void> {
    return new Promise((resolve, reject) => {
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

  private startSearch(fen: string, command: string): Promise<EngineAnalysis> {
    return new Promise<EngineAnalysis>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (!this.pending || this.pending.fen !== fen) return
        this.worker.postMessage('stop')
        const pending = this.pending
        this.pending = null
        pending.reject(new Error('A análise do Stockfish excedeu o tempo limite.'))
      }, ENGINE_SEARCH_TIMEOUT_MS)

      this.pending = { resolve, reject, lines: new Map(), fen, timeoutId }
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
    this.rejectPending(error)
    worker.terminate()
  }

  private ensureAlive() {
    if (this.destroyed) throw new Error('Stockfish já foi encerrado.')
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job)
    this.queue = next.then(() => undefined, () => undefined)
    return next
  }

  private handleMessage(message: string) {
    if (message.startsWith('info string CRITICAL ERROR')) {
      this.markWorkerFailed(new Error(`Stockfish rejeitou a posição ou comando UCI: ${message}`))
      return
    }

    if (!this.pending) return

    if (message.startsWith('info ') && message.includes(' pv ')) {
      const multipv = Number(message.match(/\bmultipv (\d+)/)?.[1] ?? '1')
      const depth = Number(message.match(/\bdepth (\d+)/)?.[1] ?? '0')
      const cpMatch = message.match(/\bscore cp (-?\d+)/)
      const mateMatch = message.match(/\bscore mate (-?\d+)/)
      const pvRaw = message.split(' pv ')[1] ?? ''
      const sideToMove = this.pending.fen.split(' ')[1]
      const perspective = sideToMove === 'w' ? 1 : -1

      this.pending.lines.set(multipv, {
        multipv,
        depth,
        scoreCp: cpMatch ? Number(cpMatch[1]) * perspective : null,
        mate: mateMatch ? Number(mateMatch[1]) * perspective : null,
        pv: pvRaw.trim().split(/\s+/).filter(Boolean),
      })
      return
    }

    if (message.startsWith('bestmove ')) {
      const [, bestMove, ponderToken, ponder] = message.split(/\s+/)
      const pending = this.pending
      this.pending = null
      window.clearTimeout(pending.timeoutId)
      pending.resolve({
        bestMove,
        ponder: ponderToken === 'ponder' ? ponder : undefined,
        lines: [...pending.lines.values()].sort((a, b) => a.multipv - b.multipv),
      })
    }
  }
}
