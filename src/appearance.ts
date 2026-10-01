export const PIECE_SET_OPTIONS = [
  { id: 'cburnett', label: 'Cburnett', description: 'Clássico e competitivo' },
  { id: 'merida', label: 'Mérida', description: 'Tradicional e refinado' },
  { id: 'alpha', label: 'Alpha', description: 'Minimalista e técnico' },
  { id: 'chessnut', label: 'Chessnut', description: 'Esculpido e expressivo' },
  { id: 'rhosgfx', label: 'RhosGFX', description: 'Geométrico e nítido' },
  { id: 'fantasy', label: 'Fantasy', description: 'Ilustrado e distinto' },
  { id: 'spatial', label: 'Spatial', description: 'Moderno e volumétrico' },
  { id: 'celtic', label: 'Celtic', description: 'Ornamental e artístico' },
  { id: 'shapes', label: 'Shapes', description: 'Abstrato e direto' },
  { id: 'firi', label: 'Firi', description: 'Vetorial e elegante' },
] as const

export const BOARD_THEME_OPTIONS = [
  { id: 'walnut', label: 'Nogueira', description: 'Areia e nogueira' },
  { id: 'oak', label: 'Carvalho', description: 'Creme e musgo' },
  { id: 'graphite', label: 'Grafite', description: 'Pedra e carvão' },
  { id: 'tournament', label: 'Torneio', description: 'Marfim e verde FIDE' },
  { id: 'midnight', label: 'Meia-noite', description: 'Gelo e azul profundo' },
  { id: 'ocean', label: 'Oceano', description: 'Espuma e azul-petróleo' },
  { id: 'burgundy', label: 'Bordô', description: 'Pergaminho e vinho' },
  { id: 'lavender', label: 'Lavanda', description: 'Névoa e violeta' },
  { id: 'espresso', label: 'Espresso', description: 'Creme e café' },
  { id: 'ember', label: 'Brasa', description: 'Cinza e terracota' },
] as const

export const HINT_STYLE_OPTIONS = [
  { id: 'classic', label: 'Clássica', description: 'Dourada e discreta' },
  { id: 'tactical', label: 'Tática', description: 'Azul elétrico' },
  { id: 'forest', label: 'Floresta', description: 'Verde de confirmação' },
  { id: 'signal', label: 'Sinal', description: 'Coral de alto contraste' },
  { id: 'ghost', label: 'Sutil', description: 'Cinza translúcido' },
] as const

export type PieceSet = (typeof PIECE_SET_OPTIONS)[number]['id']
export type BoardTheme = (typeof BOARD_THEME_OPTIONS)[number]['id']
export type HintStyle = (typeof HINT_STYLE_OPTIONS)[number]['id']
export type FavoriteAppearance = { pieceSet: PieceSet; boardTheme: BoardTheme; hintStyle: HintStyle }
export type AppearancePreferences = FavoriteAppearance & { favoriteAppearance: FavoriteAppearance | null }

export const EXPORT_THEME_COLORS: Record<BoardTheme, { light: string; dark: string }> = {
  walnut: { light: '#d4bb8b', dark: '#63412f' },
  oak: { light: '#d8c99f', dark: '#5d7054' },
  graphite: { light: '#aeb7b4', dark: '#404b4a' },
  tournament: { light: '#dfd1aa', dark: '#526e48' },
  midnight: { light: '#bac8d0', dark: '#152b40' },
  ocean: { light: '#a9c8c0', dark: '#22545e' },
  burgundy: { light: '#d9c293', dark: '#592934' },
  lavender: { light: '#cbc0da', dark: '#5e4d75' },
  espresso: { light: '#cfb18a', dark: '#3f291f' },
  ember: { light: '#bbbcb4', dark: '#733d33' },
}

export const PREFERENCES_KEY = 'xadrez-studio-board-preferences-v1'

const isPieceSet = (value: unknown): value is PieceSet => PIECE_SET_OPTIONS.some((option) => option.id === value)
const isBoardTheme = (value: unknown): value is BoardTheme => BOARD_THEME_OPTIONS.some((option) => option.id === value)
const isHintStyle = (value: unknown): value is HintStyle => HINT_STYLE_OPTIONS.some((option) => option.id === value)

export function loadAppearancePreferences(): AppearancePreferences {
  const preferences: AppearancePreferences = {
    pieceSet: 'cburnett',
    boardTheme: 'walnut',
    hintStyle: 'classic',
    favoriteAppearance: null,
  }
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<AppearancePreferences>
    if (isPieceSet(saved.pieceSet)) preferences.pieceSet = saved.pieceSet
    if (isBoardTheme(saved.boardTheme)) preferences.boardTheme = saved.boardTheme
    if (isHintStyle(saved.hintStyle)) preferences.hintStyle = saved.hintStyle
    const favorite = saved.favoriteAppearance
    if (
      favorite &&
      isPieceSet(favorite.pieceSet) &&
      isBoardTheme(favorite.boardTheme) &&
      isHintStyle(favorite.hintStyle)
    )
      preferences.favoriteAppearance = favorite
  } catch {
    /* Preferences are optional. */
  }
  return preferences
}
