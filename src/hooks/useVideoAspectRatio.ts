import { useEffect, useState, type RefObject } from 'react'

/**
 * Tracks a video element's real intrinsic aspect ratio. The calibration overlays assume
 * percentage-of-container coordinates equal percentage-of-video-frame coordinates, which is only
 * true when the container box has the same aspect ratio as the captured stream — otherwise
 * `object-fit` letterboxes/crops the video and every corner click ends up mapped to the wrong
 * pixels. Applying this ratio to the container's CSS `aspect-ratio` keeps the two in sync no
 * matter what the user shares (a 4:3 webcam, an ultrawide monitor, a narrow window, ...).
 */
export function useVideoAspectRatio(videoRef: RefObject<HTMLVideoElement | null>, stream: MediaStream | null) {
  const [ratio, setRatio] = useState<number | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) {
      setRatio(null)
      return
    }
    const update = () => setRatio(video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : null)
    update()
    video.addEventListener('loadedmetadata', update)
    // Fires when a shared window is resized or a phone camera rotates mid-stream.
    video.addEventListener('resize', update)
    return () => {
      video.removeEventListener('loadedmetadata', update)
      video.removeEventListener('resize', update)
    }
  }, [videoRef, stream])

  return ratio
}
