/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Id del sitio en Umami (estadísticas de visitas sin cookies de la demo pública). */
  readonly VITE_ANALYTICS_UMAMI?: string
  /** '1' si el build generó las docs en `/docs/` (lo define el plugin `tools/docsSite.ts`). */
  readonly VITE_DOCS_BUILT?: string
  /** Servidor de Umami (por defecto la nube de Umami; puede ser una instalación propia). */
  readonly VITE_ANALYTICS_UMAMI_HOST?: string
}

/** Versión del módulo OpenCascade (`occt-wasm`) que se sirve en `occt/<versión>/` (la define vite.config.ts). */
declare const __OCCT_VERSION__: string
