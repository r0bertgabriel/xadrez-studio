import type { Color, Square } from 'chess.js'
import type { Point } from './types'

const FILES = ['a','b','c','d','e','f','g','h'] as const
function cross(a: Point, b: Point, c: Point) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x) }
export function validCorners(points: Point[]) {
  if (points.length !== 4 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false
  if (new Set(points.map((p) => `${p.x}:${p.y}`)).size !== 4) return false
  const signs = [cross(points[0], points[1], points[2]), cross(points[1], points[2], points[3]), cross(points[2], points[3], points[0]), cross(points[3], points[0], points[1])]
  return signs.every((value) => Math.abs(value) > 0.001) && signs.every((value) => value > 0) || signs.every((value) => value < 0)
}
export function squareAt(row: number, col: number, orientation: Color): Square {
  const file = orientation === 'w' ? FILES[col] : FILES[7-col]
  const rank = orientation === 'w' ? 8-row : row+1
  return `${file}${rank}` as Square
}
export function gridLines(corners: [Point, Point, Point, Point]) {
  const [tl,tr,br,bl] = corners
  return Array.from({length:9}, (_, i) => { const t=i/8; const lerp=(a:Point,b:Point):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}); return { a:lerp(tl,bl), b:lerp(tr,br), c:lerp(tl,tr), d:lerp(bl,br) } })
}
