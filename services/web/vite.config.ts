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
  // La librería de DWG (acad-ts) busca sus clases por nombre (`constructor.name`): al minificar sin conservarlos, abrir
  // o guardar algunos DWG fallaba ("Rt is not a DXF subclass"). También en el hilo aparte que lee los DWG.
  build: { rolldownOptions: { output: { keepNames: true } } },
  worker: { rolldownOptions: { output: { keepNames: true } } },
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
    // Los tests de CSG son pesados: en paralelo (y en las máquinas del CI) pueden pasar de los 5 s por defecto.
    testTimeout: 15_000,
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
