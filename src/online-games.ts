import type { Color } from 'chess.js'

export type OnlinePlatform = 'lichess' | 'chesscom'

export type OnlineGame = {
  id: string
  platform: OnlinePlatform
  white: string
  black: string
  whiteRating: number | null
  blackRating: number | null
  /** '1-0', '0-1', '½-½' or '*' */
  result: string
  timeClass: string
  playedAt: number
  opening: string | null
  pgn: string
  /** Color the searched user played with. */
  userColor: Color
}

export const ONLINE_PLATFORMS: Array<{ id: OnlinePlatform; label: string }> = [
  { id: 'lichess', label: 'Lichess' },
  { id: 'chesscom', label: 'Chess.com' },
]

const MAX_GAMES = 12
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{2,30}$/

export class OnlineGamesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OnlineGamesError'
  }
}

export async function fetchRecentGames(
  platform: OnlinePlatform,
  username: string,
  signal?: AbortSignal,
): Promise<OnlineGame[]> {
  const user = username.trim()
  if (!USERNAME_PATTERN.test(user)) throw new OnlineGamesError('Nome de usuário inválido.')
  return platform === 'lichess' ? fetchLichess(user, signal) : fetchChessCom(user, signal)
}

async function request(url: string, init: RequestInit, platformLabel: string) {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new OnlineGamesError(`Não foi possível contatar o ${platformLabel}. Verifique sua conexão.`)
  }
  if (response.status === 404) throw new OnlineGamesError(`Usuário não encontrado no ${platformLabel}.`)
  if (response.status === 429)
    throw new OnlineGamesError(`O ${platformLabel} limitou as requisições. Aguarde um minuto e tente de novo.`)
  if (!response.ok) throw new OnlineGamesError(`O ${platformLabel} respondeu com erro (HTTP ${response.status}).`)
  return response
}

type LichessPlayer = { user?: { name: string }; rating?: number; aiLevel?: number }
type LichessGame = {
  id: string
  variant: string
  speed: string
  createdAt: number
  winner?: 'white' | 'black'
  status: string
  players: { white: LichessPlayer; black: LichessPlayer }
  opening?: { eco: string; name: string }
  pgn: string
}

function lichessName(player: LichessPlayer) {
  return player.user?.name ?? (player.aiLevel ? `Stockfish nível ${player.aiLevel}` : 'Anônimo')
}

async function fetchLichess(user: string, signal?: AbortSignal): Promise<OnlineGame[]> {
  const params = new URLSearchParams({
    max: String(MAX_GAMES),
    pgnInJson: 'true',
    opening: 'true',
    clocks: 'false',
    evals: 'false',
    perfType: 'ultraBullet,bullet,blitz,rapid,classical,correspondence',
  })
  const response = await request(
    `https://lichess.org/api/games/user/${encodeURIComponent(user)}?${params}`,
    { headers: { Accept: 'application/x-ndjson' }, signal },
    'Lichess',
  )
  const lines = (await response.text()).split('\n').filter((line) => line.trim())
  return lines
    .map((line) => JSON.parse(line) as LichessGame)
    .filter((game) => game.variant === 'standard' && game.pgn)
    .map((game) => {
      const white = lichessName(game.players.white)
      return {
        id: game.id,
        platform: 'lichess' as const,
        white,
        black: lichessName(game.players.black),
        whiteRating: game.players.white.rating ?? null,
        blackRating: game.players.black.rating ?? null,
        result:
          game.winner === 'white'
            ? '1-0'
            : game.winner === 'black'
              ? '0-1'
              : // A finished game without a winner is a draw (e.g. flag fall against insufficient material).
                ['created', 'started', 'aborted', 'noStart', 'unknownFinish'].includes(game.status)
                ? '*'
                : '½-½',
        timeClass: game.speed,
        playedAt: game.createdAt,
        opening: game.opening ? `${game.opening.eco} · ${game.opening.name}` : null,
        pgn: game.pgn,
        userColor: white.toLowerCase() === user.toLowerCase() ? 'w' : 'b',
      }
    })
}

type ChessComPlayer = { username: string; rating?: number; result: string }
type ChessComGame = {
  url: string
  pgn?: string
  rules: string
  time_class: string
  end_time: number
  white: ChessComPlayer
  black: ChessComPlayer
}

const CHESSCOM_DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

function chessComResult(game: ChessComGame) {
  if (game.white.result === 'win') return '1-0'
  if (game.black.result === 'win') return '0-1'
  return CHESSCOM_DRAWS.has(game.white.result) ? '½-½' : '*'
}

function chessComOpening(pgn: string) {
  const url = pgn.match(/\[ECOUrl "[^"]*\/openings\/([^"]+)"\]/)?.[1]
  const eco = pgn.match(/\[ECO "([^"]+)"\]/)?.[1]
  // The URL slug appends the moves played past the named line ("...9.Nc3-Bg7"); keep only the name.
  const name = url
    ? decodeURIComponent(url)
        .split(/\.\.\.|-\d+\./)[0]
        .replaceAll('-', ' ')
    : null
  return name ? `${eco ? `${eco} · ` : ''}${name}` : (eco ?? null)
}

async function fetchChessCom(user: string, signal?: AbortSignal): Promise<OnlineGame[]> {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games`
  const archivesResponse = await request(`${base}/archives`, { signal }, 'Chess.com')
  const { archives } = (await archivesResponse.json()) as { archives: string[] }
  const games: ChessComGame[] = []
  // Archives are monthly; walk back from the latest until there are enough games.
  for (const archive of [...archives].reverse().slice(0, 3)) {
    const monthResponse = await request(archive, { signal }, 'Chess.com')
    const month = (await monthResponse.json()) as { games: ChessComGame[] }
    games.unshift(...month.games.filter((game) => game.rules === 'chess' && game.pgn))
    if (games.length >= MAX_GAMES) break
  }
  return games
    .sort((a, b) => b.end_time - a.end_time)
    .slice(0, MAX_GAMES)
    .map((game) => ({
      id: game.url,
      platform: 'chesscom' as const,
      white: game.white.username,
      black: game.black.username,
      whiteRating: game.white.rating ?? null,
      blackRating: game.black.rating ?? null,
      result: chessComResult(game),
      timeClass: game.time_class,
      playedAt: game.end_time * 1000,
      opening: chessComOpening(game.pgn!),
      pgn: game.pgn!,
      userColor: game.white.username.toLowerCase() === user.toLowerCase() ? 'w' : 'b',
    }))
}
