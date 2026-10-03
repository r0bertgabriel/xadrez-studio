import { useCallback, useEffect, useRef, useState } from 'react'

export type ScreenCaptureState = 'idle' | 'active' | 'unsupported' | 'insecure' | 'denied' | 'error'

/** Captures a shared screen/window/tab as a MediaStream, for reading a live chess broadcast off-screen. */
export function useScreenCapture() {
  const streamRef = useRef<MediaStream | null>(null)
  // Bumped by every start/stop so a picker resolved after a newer request (or unmount) is discarded.
  const requestRef = useRef(0)
  const [state, setState] = useState<ScreenCaptureState>(() =>
    !navigator.mediaDevices?.getDisplayMedia ? 'unsupported' : !window.isSecureContext ? 'insecure' : 'idle',
  )
  const [stream, setStream] = useState<MediaStream | null>(null)

  const stop = useCallback(() => {
    requestRef.current += 1
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setState('idle')
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setState('unsupported')
      return
    }
    if (!window.isSecureContext) {
      setState('insecure')
      return
    }
    stop()
    const requestId = requestRef.current
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false })
      if (requestRef.current !== requestId) {
        next.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = next
      next.getVideoTracks()[0]?.addEventListener('ended', stop)
      setStream(next)
      setState('active')
    } catch (error) {
      if (requestRef.current !== requestId) return
      setState(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'error')
    }
  }, [stop])

  useEffect(() => stop, [stop])
  return { state, stream, start, stop }
}
