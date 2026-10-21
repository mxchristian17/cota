import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { serviceWorker } from './tools/serviceWorker'

// Destino del backend para el proxy de dev. En Docker: http://api:8000.
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:8000'

// Config de Vite + Vitest. El frontend llama al backend same-origin bajo `/api`
// (proxeado por Vite), evitando CORS y problemas de puerto/host.
export default defineConfig({
  // Ruta base del sitio: `/` en local; la demo en GitHub Pages se publica bajo `/<repositorio>/`.
  base: process.env.COTA_BASE || '/',
  // La app es instalable (PWA): el service worker se genera en el build.
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
    // Sólo esta máquina; el contenedor de desarrollo pasa `--host 0.0.0.0`.
    host: process.env.VITE_HOST || 'localhost',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
