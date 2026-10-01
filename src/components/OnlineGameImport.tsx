import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  fetchRecentGames,
  ONLINE_PLATFORMS,
  OnlineGamesError,
  type OnlineGame,
  type OnlinePlatform,
} from '../online-games'
import '../styles/online-import.css'

const LAST_LOOKUP_KEY = 'xadrez-studio-online-import-v1'

function loadLastLookup(): { platform: OnlinePlatform; username: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_LOOKUP_KEY) ?? '{}') as { platform?: string; username?: string }
    return {
      platform: saved.platform === 'chesscom' ? 'chesscom' : 'lichess',
      username: typeof saved.username === 'string' ? saved.username : '',
    }
  } catch {
    return { platform: 'lichess', username: '' }
  }
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Lets the user pick one of their recent Lichess/Chess.com games to load and review. */
export default function OnlineGameImport({ onSelect }: { onSelect: (game: OnlineGame) => void }) {
  const [platform, setPlatform] = useState<OnlinePlatform>(() => loadLastLookup().platform)
  const [username, setUsername] = useState(() => loadLastLookup().username)
  const [games, setGames] = useState<OnlineGame[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  async function search(event: FormEvent) {
    event.preventDefault()
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError(null)
    setGames(null)
    try {
      const found = await fetchRecentGames(platform, username, controller.signal)
      try {
        localStorage.setItem(LAST_LOOKUP_KEY, JSON.stringify({ platform, username: username.trim() }))
      } catch {
        /* Optional. */
      }
      setGames(found)
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof OnlineGamesError ? caught.message : 'Não foi possível carregar as partidas.')
    } finally {
      if (controllerRef.current === controller) setLoading(false)
    }
  }

  return (
    <section className="online-import" aria-labelledby="online-import-title">
      <span className="section-label" id="online-import-title">
        PARTIDAS ONLINE
      </span>
      <form className="online-import-form" onSubmit={search}>
        <select
          value={platform}
          onChange={(event) => setPlatform(event.target.value as OnlinePlatform)}
          aria-label="Plataforma"
        >
          {ONLINE_PLATFORMS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Seu usuário"
          aria-label="Nome de usuário"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={loading || !username.trim()}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {error && (
        <p className="online-import-error" role="alert">
          {error}
        </p>
      )}
      {games && !games.length && <p className="online-import-empty">Nenhuma partida de xadrez padrão encontrada.</p>}
      {games && games.length > 0 && (
        <ul className="online-import-list">
          {games.map((game) => (
            <li key={game.id}>
              <button type="button" onClick={() => onSelect(game)}>
                <span className="online-import-players">
                  <b>{game.white}</b>
                  {game.whiteRating ? ` (${game.whiteRating})` : ''} × <b>{game.black}</b>
                  {game.blackRating ? ` (${game.blackRating})` : ''}
                </span>
                <span className="online-import-result">{game.result}</span>
                <small>
                  {dateFormat.format(game.playedAt)} · {game.timeClass}
                  {game.opening ? ` · ${game.opening}` : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <small>A busca consulta a API pública da plataforma escolhida. O resto da análise continua local.</small>
    </section>
  )
}
