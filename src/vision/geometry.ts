import type { Color, Square } from 'chess.js'
import type { Point } from './types'

const FILES = ['a','b','c','d','e','f','g','h'] as const
function cross(a: Point, b: Point, c: Point) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x) }
export function validCorners(points: Point[]) {
  if (points.length !== 4 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false
  if (new Set(points.map((p) => `${p.x}:${p.y}`)).size !== 4) return false
  const signs = [cross(points[0], points[1], points[2]), cross(points[1], points[2], points[3]), cross(points[2], points[3], points[0]), cross(points[3], points[0], points[1])]
  return signs.every((value) => Math.abs(value) > 0.001) && (signs.every((value) => value > 0) || signs.every((value) => value < 0))
}
export function squareAt(row: number, col: number, orientation: Color): Square {
  const file = orientation === 'w' ? FILES[col] : FILES[7-col]
  const rank = orientation === 'w' ? 8-row : row+1
  return `${file}${rank}` as Square
}
export function squareRowCol(square: Square, orientation: Color): { row: number; col: number } {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number])
  const rank = Number(square[1])
  const col = orientation === 'w' ? file : 7 - file
  const row = orientation === 'w' ? 8 - rank : rank - 1
  return { row, col }
}
export function gridLines(corners: [Point, Point, Point, Point]) {
  const [tl,tr,br,bl] = corners
  return Array.from({length:9}, (_, i) => { const t=i/8; const lerp=(a:Point,b:Point):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}); return { a:lerp(tl,bl), b:lerp(tr,br), c:lerp(tl,tr), d:lerp(bl,br) } })
}
/** Maps a unit square (u,v both in [0,1]) onto the quadrilateral described by [tl, tr, br, bl]. */
export function bilinear([tl, tr, br, bl]: [Point, Point, Point, Point], u: number, v: number): Point {
  const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u }
  const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u }
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v }
}
/** Center point of grid cell (row, col), row 0 = top edge (tl→tr), col 0 = left edge (tl→bl). */
export function cellCenter(corners: [Point, Point, Point, Point], row: number, col: number): Point {
  return bilinear(corners, (col + 0.5) / 8, (row + 0.5) / 8)
}
/** The four corners of grid cell (row, col), same orientation convention as cellCenter. */
export function cellCorners(corners: [Point, Point, Point, Point], row: number, col: number): [Point, Point, Point, Point] {
  return [
    bilinear(corners, col / 8, row / 8),
    bilinear(corners, (col + 1) / 8, row / 8),
    bilinear(corners, (col + 1) / 8, (row + 1) / 8),
    bilinear(corners, col / 8, (row + 1) / 8),
  ]
}
