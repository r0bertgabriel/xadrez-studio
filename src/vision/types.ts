import type { Color, PieceSymbol, Square } from 'chess.js'

export type Point = { x: number; y: number }
export type Calibration = { corners: [Point, Point, Point, Point]; orientation: Color }
export type VisionClass = 'empty' | `${Color}${Uppercase<PieceSymbol>}`
export type SquarePrediction = { square: Square; label: VisionClass; confidence: number }
export type BoardPrediction = { predictions: SquarePrediction[]; confidence: number; fen: string }
