import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cross-origin isolation enables SharedArrayBuffer, required by the multithreaded
// Stockfish build. `credentialless` keeps cross-origin assets (Google Fonts) working.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  plugins: [react()],
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
})
