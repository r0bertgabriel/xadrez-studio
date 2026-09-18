export const STORAGE_SCHEMA_KEY = 'xadrez-dev-storage-schema'
export const STORAGE_SCHEMA_VERSION = 3
export const SESSION_KEY = 'xadrez-dev-session-v2'

const DB_NAME = 'xadrez-dev'
const DB_VERSION = 3
const REVIEW_STORE = 'reviews'
const GAME_STORE = 'games'
const TRAINING_STORE = 'training-progress'
const REVIEW_ALGORITHM_VERSION = 2

export type StoredReview<Row = unknown> = {
  key: string
  signature: string
  pgn: string
  side: 'w' | 'b'
  mode: 'coach' | 'analysis'
  depth: number
  accuracy: number
  rows: Row[]
  createdAt: number
  updatedAt: number
}

export type StoredGame = {
  signature: string
  pgn: string
  side: 'w' | 'b'
  mode: 'coach' | 'analysis'
  accuracy: number
  reviewedAt: number
}

export type TrainingProgress = {
  id: string
  attempts: number
  successes: number
  streak: number
  intervalDays: number
  nextReviewAt: number
  lastReviewedAt: number
}

export function reviewCacheKey(signature: string, side: 'w' | 'b', mode: 'coach' | 'analysis', depth: number) {
  return `review-v${REVIEW_ALGORITHM_VERSION}\u0000${signature}\u0000${side}\u0000${mode}\u0000${depth}`
}

export function migrateLegacyStorage() {
  const rawVersion = Number(localStorage.getItem(STORAGE_SCHEMA_KEY) ?? '0')
  if (rawVersion >= STORAGE_SCHEMA_VERSION) return
  if (rawVersion < 1) {
    const legacySession = localStorage.getItem('xadrez-dev-session-v1')
    if (legacySession && !localStorage.getItem(SESSION_KEY)) localStorage.setItem(SESSION_KEY, legacySession)
  }
  localStorage.setItem(STORAGE_SCHEMA_KEY, String(STORAGE_SCHEMA_VERSION))
}

function openDb(): Promise<IDBDatabase | null> {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(REVIEW_STORE)) db.createObjectStore(REVIEW_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(GAME_STORE)) db.createObjectStore(GAME_STORE, { keyPath: 'signature' })
      if (!db.objectStoreNames.contains(TRAINING_STORE)) db.createObjectStore(TRAINING_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await openDb()
    if (!db) return null
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const request = action(tx.objectStore(storeName))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => db.close()
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch {
    return null
  }
}

export async function getCachedReview<Row>(key: string) {
  return transaction<StoredReview<Row> | undefined>(REVIEW_STORE, 'readonly', (store) => store.get(key))
}

export async function putCachedReview<Row>(entry: StoredReview<Row>) {
  await transaction<IDBValidKey>(REVIEW_STORE, 'readwrite', (store) => store.put(entry))
}

export async function listReviews<Row>() {
  return (await transaction<StoredReview<Row>[]>(REVIEW_STORE, 'readonly', (store) => store.getAll())) ?? []
}

export async function putGameHistory(entry: StoredGame) {
  await transaction<IDBValidKey>(GAME_STORE, 'readwrite', (store) => store.put(entry))
}

export async function listGameHistory() {
  return (await transaction<StoredGame[]>(GAME_STORE, 'readonly', (store) => store.getAll())) ?? []
}

export async function countGameHistory() {
  return (await transaction<number>(GAME_STORE, 'readonly', (store) => store.count())) ?? 0
}

export async function listTrainingProgress() {
  return (await transaction<TrainingProgress[]>(TRAINING_STORE, 'readonly', (store) => store.getAll())) ?? []
}

export async function putTrainingProgress(entry: TrainingProgress) {
  await transaction<IDBValidKey>(TRAINING_STORE, 'readwrite', (store) => store.put(entry))
}

export function nextTrainingProgress(current: TrainingProgress | undefined, success: boolean, now = Date.now()): TrainingProgress {
  const attempts = (current?.attempts ?? 0) + 1
  const successes = (current?.successes ?? 0) + (success ? 1 : 0)
  const streak = success ? (current?.streak ?? 0) + 1 : 0
  const previous = current?.intervalDays ?? 0
  const intervalDays = success ? (streak === 1 ? 1 : streak === 2 ? 3 : Math.min(60, Math.max(4, Math.round(previous * 2.3)))) : 0
  const nextReviewAt = success ? now + intervalDays * 86_400_000 : now + 10 * 60_000
  return { id: current?.id ?? '', attempts, successes, streak, intervalDays, nextReviewAt, lastReviewedAt: now }
}
