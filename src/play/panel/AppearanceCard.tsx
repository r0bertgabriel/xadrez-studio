import { BOARD_THEME_OPTIONS, HINT_STYLE_OPTIONS, PIECE_SET_OPTIONS } from '../../appearance'
import type { Appearance } from '../../hooks/useAppearance'

type Option = { readonly id: string; readonly label: string; readonly description: string }

function AppearanceSelect<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly Option[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <label className="appearance-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} — {option.description}
          </option>
        ))}
      </select>
    </label>
  )
}

function labelOf(options: readonly Option[], id: string) {
  return options.find((option) => option.id === id)?.label
}

export default function AppearanceCard({ appearance }: { appearance: Appearance }) {
  const favorite = appearance.favoriteAppearance
  return (
    <section className="card appearance-card">
      <div className="card-title">
        <strong>Aparência</strong>
        <span>salvo localmente</span>
      </div>
      <AppearanceSelect
        label={`Conjunto de peças · ${PIECE_SET_OPTIONS.length} estilos`}
        options={PIECE_SET_OPTIONS}
        value={appearance.pieceSet}
        onChange={appearance.setPieceSet}
      />
      <AppearanceSelect
        label={`Tabuleiro · ${BOARD_THEME_OPTIONS.length} temas`}
        options={BOARD_THEME_OPTIONS}
        value={appearance.boardTheme}
        onChange={appearance.setBoardTheme}
      />
      <AppearanceSelect
        label={`Seta de dica · ${HINT_STYLE_OPTIONS.length} estilos`}
        options={HINT_STYLE_OPTIONS}
        value={appearance.hintStyle}
        onChange={appearance.setHintStyle}
      />
      <div className="favorite-appearance">
        <div>
          <strong>{favorite ? 'Favorito salvo' : 'Sem favorito salvo'}</strong>
          <small>
            {favorite
              ? `${labelOf(PIECE_SET_OPTIONS, favorite.pieceSet)} · ${labelOf(BOARD_THEME_OPTIONS, favorite.boardTheme)} · ${labelOf(HINT_STYLE_OPTIONS, favorite.hintStyle)}`
              : 'Salve sua combinação atual para recuperá-la em um clique.'}
          </small>
        </div>
        <button onClick={appearance.saveFavorite}>Salvar favorito</button>
        {favorite && (
          <button className="apply-favorite" onClick={appearance.applyFavorite}>
            Aplicar favorito
          </button>
        )}
      </div>
    </section>
  )
}
