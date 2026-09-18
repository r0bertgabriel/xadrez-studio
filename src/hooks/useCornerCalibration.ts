import { useCallback, useState, type MouseEvent } from 'react'
import { orderCorners, validCorners } from '../vision/geometry'
import type { Point } from '../vision/types'

/** Lets the user click the four corners of a board inside a video overlay to calibrate a perspective grid. */
export function useCornerCalibration() {
  const [corners, setCorners] = useState<Point[]>([])
  const addCorner = useCallback((event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const point = { x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 }
    setCorners((current) => (current.length === 4 ? [point] : [...current, point]))
  }, [])
  const reset = useCallback(() => setCorners([]), [])
  const calibrated = validCorners(corners)
  const quad = calibrated ? orderCorners(corners) : null
  return { corners, addCorner, reset, calibrated, quad }
}
