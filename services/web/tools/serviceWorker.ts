import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { occtVersion } from './occtModule'

/**
 * Service worker de la app instalable (PWA): se genera en el build con la lista de archivos de esa versión, así
 * la app abre y dibuja sin conexión. Cada build con archivos distintos cambia el nombre del caché: el service
 * worker nuevo se instala solo y borra el anterior. Las llamadas al servidor (`/api/`) siempre van a la red.
 */
export function serviceWorker(publicDir = 'public'): Plugin {
  return {
    name: 'cota-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      // OpenCascade no se precarga: el de STEP/IGES (~8 MB) se baja sólo cuando alguien abre uno de esos archivos y el
      // núcleo de sólidos (`occt/<versión>/`) cuando hay sólidos (ver `serviceWorkerSource`). Su Worker sí (es chico).
      // Las docs (`docs/`) no se precargan: son un sitio aparte que se lee con conexión.
      const built = Object.keys(bundle).filter(
        (f) => !f.endsWith('.map') && f !== 'index.html' && !/occt-import-js/i.test(f) && !f.startsWith('occt/') && !f.startsWith('docs/'),
      )
      let fromPublic: string[] = []
      try {
        fromPublic = readdirSync(join(process.cwd(), publicDir))
      } catch {
        /* sin carpeta pública */
      }
      const files = ['./', ...fromPublic, ...built].sort()
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(version, files, occtVersion()) })
    },
  }
}

/**
 * El núcleo de sólidos exacto (`occt/<versión>/`, ~21 MB, ~4,7 MB comprimido) tampoco se precarga: quien abre sólidos
 * lo baja una vez y queda guardado en su propio caché, que sobrevive a las versiones nuevas de la app y se borra
 * recién cuando cambia la versión del núcleo.
 */
export function serviceWorkerSource(version: string, files: string[], occt = '0'): string {
  return `// Cota service worker (generado en el build).
const CACHE = 'cota-${version}'
const FILES = ${JSON.stringify(files)}
const OCCT_CACHE = 'occt-${occt}'
const OCCT_PATH = 'occt/${occt}/'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => (k.startsWith('cota-') && k !== CACHE) || (k.startsWith('occt-') && k !== OCCT_CACHE)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return
  // Las docs son otro sitio: van a la red y nunca reemplazan la página de la app guardada para usar sin conexión.
  if (url.pathname.startsWith(new URL('docs/', self.registration.scope).pathname)) return
  if (req.mode === 'navigate') {
    // La página: primero la red (versión nueva), sin conexión la guardada.
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Sólo una página buena reemplaza la guardada (no un 404, un 5xx ni un portal cautivo).
          if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('./', copy))
          }
          return res
        })
        .catch(() => caches.match('./')),
    )
    return
  }
  // Núcleo de sólidos: de su caché; si no está, de la red, y se guarda para la próxima.
  if (url.pathname.startsWith(new URL(OCCT_PATH, self.registration.scope).pathname)) {
    event.respondWith(
      caches.open(OCCT_CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone())
          return res
        })),
      ),
    )
    return
  }
  // Archivos de la app: los del build salen de la caché; el resto va a la red sin guardarse.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)))
})
`
}
