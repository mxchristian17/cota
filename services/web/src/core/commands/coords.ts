import { pt, type Pt } from '../math'
import { ucsDirToWorld, ucsToWorld, WORLD_UCS, type Ucs } from '../ucs'

/**
 * Parsea una coordenada tecleada en la línea de comandos, en los ejes de la UCS activa.
 *
 * Al **continuar desde un punto** (hay `base`), las coordenadas son **relativas** a ese punto (como la
 * entrada dinámica del CAD clásico). Para el **primer punto** (sin `base`) son absolutas.
 * Formatos (la Z omitida vale 0 en la UCS):
 *   - Relativa (default con base):  "dx,dy[,dz]" · "dist<ang" (polar en el XY de la UCS)
 *   - Relativa explícita:           "@dx,dy[,dz]" · "@dist<ang" · "@dist<ang,dz" (cilíndrica) ·
 *                                   "@dist<angXY<angZ" (esférica: ángulo sobre el XY)
 *   - Absoluta en la UCS:           "#x,y[,z]" · "#dist<ang" (y sin base: "x,y[,z]", "dist<ang"…)
 *   - Absoluta en el mundo (WCS):   "*x,y[,z]"
 * `base` está en coordenadas de mundo. Devuelve el punto en mundo, o null si es inválido.
 */
export function parseCoordinate(text: string, base: Pt | null, ucs: Ucs = WORLD_UCS): Pt | null {
  const s = text.trim()
  if (!s) return null

  // Absoluto en el mundo con '*' (en el CAD clásico: ignora la UCS).
  if (s.startsWith('*')) {
    const parts = parseNumbers(s.slice(1))
    if (!parts || parts.length < 2 || parts.length > 3) return null
    return pt(parts[0], parts[1], parts[2] ?? 0)
  }

  const absolute = s.startsWith('#')
  const explicitRel = s.startsWith('@')
  const body = absolute || explicitRel ? s.slice(1) : s
  // '@' solo = el punto base (en el CAD clásico: "@" repite el último punto; BREAK lo usa para cortar sin quitar).
  if (explicitRel && body.trim() === '') return base ? pt(base.x, base.y, base.z) : null
  // Relativo: por '@', o cuando hay un punto base (se continúa desde una geometría).
  const relative = !absolute && (explicitRel || base != null)
  if (relative && base == null) return null // '@' sin base

  const local = body.includes('<') ? parsePolar(body) : parseCartesian(body)
  if (!local) return null
  if (relative) {
    const d = ucsDirToWorld([local.x, local.y, local.z], ucs)
    return pt(base!.x + d[0], base!.y + d[1], base!.z + d[2])
  }
  return ucsToWorld(local, ucs)
}

/** "x,y[,z]" en la UCS. */
function parseCartesian(body: string): Pt | null {
  const parts = parseNumbers(body)
  if (!parts || parts.length < 2 || parts.length > 3) return null
  return pt(parts[0], parts[1], parts[2] ?? 0)
}

/** "d<a" (polar), "d<a,z" (cilíndrica) o "d<a<b" (esférica), en la UCS. Ángulos en grados. */
function parsePolar(body: string): Pt | null {
  const segs = body.split('<')
  if (segs.length > 3) return null
  const [dStr, aRaw, bStr] = segs
  let aStr = aRaw
  let zStr: string | null = null
  if (segs.length === 2 && aRaw.includes(',')) [aStr, zStr] = aRaw.split(',')
  const nums = [dStr, aStr, ...(bStr !== undefined ? [bStr] : []), ...(zStr !== null ? [zStr] : [])]
  if (nums.some((n) => n === undefined || n.trim() === '' || !isFinite(Number(n)))) return null
  const d = Number(dStr)
  const a = (Number(aStr) * Math.PI) / 180
  if (bStr !== undefined) {
    const b = (Number(bStr) * Math.PI) / 180
    return pt(d * Math.cos(b) * Math.cos(a), d * Math.cos(b) * Math.sin(a), d * Math.sin(b))
  }
  return pt(d * Math.cos(a), d * Math.sin(a), zStr !== null ? Number(zStr) : 0)
}

/** Parsea un número simple (radio, distancia, etc.). Devuelve null si no es válido. */
export function parseNumber(text: string): number | null {
  const s = text.trim()
  if (s === '') return null
  const n = Number(s)
  return isFinite(n) ? n : null
}

function parseNumbers(body: string): number[] | null {
  const raw = body.split(',')
  const nums: number[] = []
  for (const r of raw) {
    if (r.trim() === '') return null
    const n = Number(r)
    if (!isFinite(n)) return null
    nums.push(n)
  }
  return nums
}
