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

export const aboutLine = (): string => `${ABOUT.name} ${ABOUT.version} — © ${ABOUT.year} ${ABOUT.author} — ${ABOUT.license} — ${ABOUT.url}`
