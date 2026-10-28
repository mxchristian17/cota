/**
 * Multicomandos (scripts del CAD clásico): entradas separadas por espacios o saltos de línea; `""` es un Enter
 * vacío y el texto con espacios va entre comillas (`\"` dentro de ellas es una comilla).
 */
export function parseScript(text: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '"') {
      let tok = ''
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && text[i + 1] === '"') {
          tok += '"'
          i += 2
          continue
        }
        tok += text[i++]
      }
      i++ // comilla de cierre
      out.push(tok)
      continue
    }
    let tok = ''
    while (i < text.length && !/\s/.test(text[i])) tok += text[i++]
    out.push(tok)
  }
  return out
}

/** ¿El texto pegado en la línea de comandos es un lote (más de una entrada)? */
export const isScript = (text: string): boolean => parseScript(text).length > 1

const PREFIX = '#script='

/** Enlace para compartir un lote: la dirección de la app con el lote en el fragmento (no viaja al servidor). */
export function scriptLink(text: string, base: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return base.replace(/#.*$/, '') + PREFIX + b64
}

/** El lote de un enlace compartido (`#script=…`), o null. */
export function scriptFromHash(hash: string): string | null {
  if (!hash.startsWith(PREFIX)) return null
  try {
    const b64 = hash.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))
  } catch {
    return null
  }
}
