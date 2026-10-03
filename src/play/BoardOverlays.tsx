import type { Color, Square } from 'chess.js'
import type { HintStyle } from '../appearance'
import { squareCenter } from '../board-geometry'
import type { ManualArrow } from '../hooks/usePlaySession'

export function HintArrow({
  from,
  to,
  orientation,
  hintStyle,
}: {
  from: Square
  to: Square
  orientation: Color
  hintStyle: HintStyle
}) {
  const start = squareCenter(from, orientation)
  const end = squareCenter(to, orientation)
  return (
    <svg className={`hint-arrow hint-${hintStyle}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <marker id="arrowhead" markerWidth="3.8" markerHeight="3.8" refX="3.2" refY="1.9" orient="auto">
          <polygon points="0 0, 3.8 1.9, 0 3.8" />
        </marker>
      </defs>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd="url(#arrowhead)" />
    </svg>
  )
}

export function ManualAnnotations({
  arrows,
  circles,
  orientation,
}: {
  arrows: ManualArrow[]
  circles: Square[]
  orientation: Color
}) {
  if (!arrows.length && !circles.length) return null
  return (
    <svg className="manual-annotations" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <marker id="manual-arrowhead" markerWidth="3.8" markerHeight="3.8" refX="3.2" refY="1.9" orient="auto">
          <polygon points="0 0, 3.8 1.9, 0 3.8" />
        </marker>
      </defs>
      {arrows.map((arrow, index) => {
        const from = squareCenter(arrow.from, orientation)
        const to = squareCenter(arrow.to, orientation)
        return (
          <line
            key={`${arrow.from}-${arrow.to}-${index}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            markerEnd="url(#manual-arrowhead)"
          />
        )
      })}
      {circles.map((square) => {
        const center = squareCenter(square, orientation)
        return <circle key={square} cx={center.x} cy={center.y} r="5.2" />
      })}
    </svg>
  )
}
