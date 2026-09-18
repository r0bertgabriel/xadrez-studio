import { useCallback, useEffect, useRef, useState } from 'react'

export type ScreenCaptureState = 'idle' | 'active' | 'unsupported' | 'insecure' | 'denied' | 'error'

/** Captures a shared screen/window/tab as a MediaStream, for reading a live chess broadcast off-screen. */
export function useScreenCapture() {
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<ScreenCaptureState>(() => !navigator.mediaDevices?.getDisplayMedia ? 'unsupported' : !window.isSecureContext ? 'insecure' : 'idle')
  const [stream, setStream] = useState<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setState('idle')
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) { setState('unsupported'); return }
    if (!window.isSecureContext) { setState('insecure'); return }
    stop()
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false })
      streamRef.current = next
      next.getVideoTracks()[0]?.addEventListener('ended', stop)
      setStream(next)
      setState('active')
    } catch (error) {
      setState(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'error')
    }
  }, [stop])

  useEffect(() => stop, [stop])
  return { state, stream, start, stop }
}
