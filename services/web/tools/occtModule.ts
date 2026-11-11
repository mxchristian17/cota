import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Núcleo de sólidos exacto (OpenCascade, LGPL-2.1 con la excepción de OCCT) como módulo aparte y reemplazable:
 * el `.wasm` y su glue de Emscripten se sirven sin modificar en `/occt/<versión>/`, junto con sus licencias y el
 * enlace a su código fuente. El resto de la app (Apache-2.0) sólo los carga por URL desde un Worker, cuando hay
 * sólidos. Quien quiera usar otra compilación del mismo núcleo reemplaza esos archivos.
 *
 * - En desarrollo los sirve desde `node_modules/occt-wasm/dist` y `vendor/occt`.
 * - En el build los emite a `occt/<versión>/` (el service worker no los precarga: se guardan al usarlos).
 * - El envoltorio TypeScript (MIT) importa su glue por defecto; en el build ese import se reemplaza por un módulo
 *   vacío, porque Cota le pasa el glue cargado por URL (así el glue no queda copiado dentro del bundle).
 */
export const OCCT_PACKAGE_DIR = join(process.cwd(), 'node_modules', 'occt-wasm')

export function occtVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(OCCT_PACKAGE_DIR, 'package.json'), 'utf8')) as { version: string }).version
  } catch {
    return '0.0.0'
  }
}

/** Archivos del módulo: nombre publicado → archivo de origen. */
export function occtModuleFiles(vendorDir = join(process.cwd(), 'vendor', 'occt')): Record<string, string> {
  return {
    'occt-wasm.js': join(OCCT_PACKAGE_DIR, 'dist', 'occt-wasm.js'),
    'occt-wasm.wasm': join(OCCT_PACKAGE_DIR, 'dist', 'occt-wasm.wasm'),
    'LICENSE_LGPL_21.txt': join(vendorDir, 'LICENSE_LGPL_21.txt'),
    'OCCT_LGPL_EXCEPTION.txt': join(vendorDir, 'OCCT_LGPL_EXCEPTION.txt'),
    'occt-wasm-LICENSE-MIT.txt': join(vendorDir, 'occt-wasm-LICENSE-MIT.txt'),
    'README.txt': join(vendorDir, 'README.txt'),
  }
}

const TYPES: Record<string, string> = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' }
const GLUE_STUB = '\0cota-occt-glue-stub'

/**
 * En el build, el import del glue por defecto del envoltorio (`./occt-wasm.js`, que además arrastraría el `.wasm`
 * como asset) se reemplaza por un módulo vacío: Cota le pasa el glue cargado por URL. Va también en los Workers.
 */
export function occtGlueStub(): Plugin {
  return {
    name: 'cota-occt-glue-stub',
    apply: 'build',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === './occt-wasm.js' && importer && /occt-wasm[\\/]dist[\\/]index\.js$/.test(importer)) return GLUE_STUB
      return null
    },
    load(id) {
      return id === GLUE_STUB ? 'export default () => { throw new Error("Cota loads the OpenCascade module by URL") }' : null
    },
  }
}

export function occtModule(base = '/'): Plugin {
  const version = occtVersion()
  const prefix = `${base.replace(/\/?$/, '/')}occt/${version}/`
  return {
    name: 'cota-occt-module',
    configureServer(server) {
      const files = occtModuleFiles()
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (!path.startsWith(prefix)) return next()
        const name = path.slice(prefix.length)
        const src = files[name]
        if (!src) return next()
        try {
          const body = readFileSync(src)
          res.setHeader('Content-Type', TYPES[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream')
          res.end(body)
        } catch {
          next()
        }
      })
    },
    generateBundle() {
      for (const [name, src] of Object.entries(occtModuleFiles())) {
        this.emitFile({ type: 'asset', fileName: `occt/${version}/${name}`, source: readFileSync(src) })
      }
    },
  }
}
