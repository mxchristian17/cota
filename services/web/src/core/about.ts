import { version } from '../../package.json'

/** Créditos de la aplicación (ABOUT y el pie de la ayuda). */
export const ABOUT = {
  name: 'Cota',
  version,
  author: 'Christian Orengia',
  year: 2026,
  license: 'Apache License 2.0',
  url: 'https://github.com/mxchristian17/cota',
} as const

/** Documentación: la del mismo sitio si el build la generó (`/docs/`); si no, la publicada. */
export const docsUrl = (path = ''): string =>
  (import.meta.env.VITE_DOCS_BUILT ? `${import.meta.env.BASE_URL}docs/` : 'https://mxchristian17.github.io/cota/docs/') + path

export const aboutLine = (): string => `${ABOUT.name} ${ABOUT.version} — © ${ABOUT.year} ${ABOUT.author} — ${ABOUT.license} — ${ABOUT.url}`
