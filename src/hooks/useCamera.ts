import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraState = 'idle' | 'active' | 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'error'
export type CameraDevice = { id: string; label: string }

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null)
  // Bumped by every start/stop so a permission prompt resolved after a newer request (or unmount) is discarded.
  const requestRef = useRef(0)
  const [state, setState] = useState<CameraState>(() =>
    !navigator.mediaDevices ? 'unsupported' : !window.isSecureContext ? 'insecure' : 'idle',
  )
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [stream, setStream] = useState<MediaStream | null>(null)
  const stop = useCallback(() => {
    requestRef.current += 1
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setState('idle')
  }, [])
  const start = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices) {
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
        const next = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
          audio: false,
        })
        if (requestRef.current !== requestId) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = next
        setStream(next)
        setState('active')
        try {
          const list = await navigator.mediaDevices.enumerateDevices()
          if (requestRef.current !== requestId) return
          setDevices(
            list
              .filter((device) => device.kind === 'videoinput')
              .map((device) => ({ id: device.deviceId, label: device.label || 'Câmera' })),
          )
        } catch {
          /* The device list is optional; the camera itself is running. */
        }
      } catch (error) {
        if (requestRef.current !== requestId) return
        setState(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'denied'
            : error instanceof DOMException && error.name === 'NotFoundError'
              ? 'unavailable'
              : 'error',
        )
      }
    },
    [stop],
  )
  useEffect(() => stop, [stop])
  return { state, devices, stream, start, stop }
}
