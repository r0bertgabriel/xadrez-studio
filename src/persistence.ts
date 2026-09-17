export const STORAGE_SCHEMA_KEY = 'xadrez-dev-storage-schema'
export const STORAGE_SCHEMA_VERSION = 2
export const SESSION_KEY = 'xadrez-dev-session-v2'

const DB_NAME = 'xadrez-dev'
const DB_VERSION = 2
const REVIEW_STORE = 'reviews'
const GAME_STORE = 'games'
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

  // Existing v1 preference/performance keys remain readable. Versioning here records
  // that their current shapes are intentionally supported instead of being accidental.
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

export async function putGameHistory(entry: StoredGame) {
  await transaction<IDBValidKey>(GAME_STORE, 'readwrite', (store) => store.put(entry))
}

export async function countGameHistory() {
  return (await transaction<number>(GAME_STORE, 'readonly', (store) => store.count())) ?? 0
}
