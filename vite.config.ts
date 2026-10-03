import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Cross-origin isolation enables SharedArrayBuffer, required by the multithreaded
// Stockfish build. `credentialless` keeps cross-origin assets (Google Fonts) working.
// Production hosts need the same headers: see public/_headers and vercel.json.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

// `--mode lan` serves over HTTPS (self-signed). Browsers only grant cross-origin isolation, camera
// and screen capture to secure contexts, and plain http://192.168.x.x is not one.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'lan' ? [basicSsl()] : [])],
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
}))
