import { describe, it, expect } from 'vitest'
import { mergeSegments, type ProjItem, type ProjSegment } from './orthographic'

type P2 = [number, number]

/** Distancia de un punto al trazo dibujado (línea, arco o círculo). */
function distTo(it: ProjItem, p: P2): number {
  if (it.kind === 'line') {
    const [a, b] = [it.a, it.b]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t)
  }
  const ang = Math.atan2(p[1] - it.c[1], p[0] - it.c[0])
  const radial = Math.abs(Math.hypot(p[0] - it.c[0], p[1] - it.c[1]) - it.r)
  if (it.kind === 'circle') return radial
  const tau = 2 * Math.PI
  const sweep = (((it.a1 - it.a0) % tau) + tau) % tau
  if ((((ang - it.a0) % tau) + tau) % tau <= sweep) return radial
  const end = (a: number): P2 => [it.c[0] + it.r * Math.cos(a), it.c[1] + it.r * Math.sin(a)]
  return Math.min(...[end(it.a0), end(it.a1)].map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))
}

/** Puntos de un trazo (arco o línea) para ver dónde quedó dibujado. */
function samples(it: ProjItem): P2[] {
  if (it.kind === 'line') return [it.a, it.b]
  const tau = 2 * Math.PI
  const sweep = it.kind === 'circle' ? tau : (((it.a1 - it.a0) % tau) + tau) % tau
  const a0 = it.kind === 'circle' ? 0 : it.a0
  return Array.from({ length: 9 }, (_, k) => [it.c[0] + it.r * Math.cos(a0 + (sweep * k) / 8), it.c[1] + it.r * Math.sin(a0 + (sweep * k) / 8)] as P2)
}

describe('vistas: los pedazos casi rectos de un círculo no corren su arco', () => {
  // Vista superior de un cuadro de bicicleta (tirante con su tapa, junto a la puntera): un arco teselado de r ≈ 6,3 y
  // pedazos cortos, casi en línea, que la visibilidad partió. Con ellos el centro "refinado" se iba 26 mm y el arco
  // (con los ángulos del centro original) se dibujaba a 35 mm de la pieza, fuera del cuadro.
  const arc: P2[] = [
    [-381.4884, 68.5904], [-381.6724, 68.536], [-383.0428, 68.0944], [-383.7732, 67.7504], [-384.2299, 67.4658],
    [-384.5495, 67.212], [-384.6984, 67.0692], [-384.8308, 66.9223], [-384.941, 66.7795],
  ]
  const pieces: P2[] = [[-379.5929, 69.4846], [-379.9806, 69.2881], [-380.3398, 69.1051], [-380.6835, 68.9338], [-381.002, 68.784], [-381.2966, 68.6597]]
  const segs: ProjSegment[] = []
  for (let i = 0; i + 1 < arc.length; i++) segs.push({ a: arc[i], b: arc[i + 1], hidden: false })
  for (let i = 0; i + 1 < pieces.length; i++) segs.push({ a: pieces[i], b: pieces[i + 1], hidden: false })
  // La tolerancia de la vista: 2e-4 de la diagonal del cuadro (≈ 880 mm).
  const tol = 0.18

  it('todo lo dibujado queda sobre los puntos de entrada', () => {
    const items = mergeSegments(segs, tol)
    const input = [...arc, ...pieces]
    for (const it of items) for (const q of samples(it)) expect(Math.min(...input.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])))).toBeLessThan(1)
    // …y cada punto de entrada tiene su trazo cerca.
    for (const p of input) expect(Math.min(...items.map((it) => distTo(it, p)))).toBeLessThan(0.5)
  })

  it('un pedazo que curva al revés no cierra el círculo', () => {
    // Vista superior del mismo cuadro: la unión del puente de freno con el tirante. El último tramo curva al revés; su
    // intervalo se medía por la vuelta larga y la vista mostraba un círculo de r 16 que no existe.
    const pts: P2[] = [
      [-212.666, -17.392], [-212.99, -17.488], [-213.307, -17.596], [-213.616, -17.713], [-214.015, -17.882], [-214.245, -17.988],
      [-214.471, -18.098], [-215.045, -18.402], [-215.586, -18.719], [-216.098, -19.044], [-216.582, -19.373], [-217.043, -19.701],
      [-217.482, -20.023], [-217.901, -20.337], [-218.303, -20.636], [-218.688, -20.912], [-219.02, -21.134], [-219.306, -21.304],
      [-219.528, -21.416], [-219.723, -21.495], [-219.908, -21.546],
    ]
    const chain: ProjSegment[] = pts.slice(1).map((b, i) => ({ a: pts[i], b, hidden: false }))
    const items = mergeSegments(chain, 0.18)
    expect(items.some((it) => it.kind === 'circle')).toBe(false)
    for (const it of items) for (const q of samples(it)) expect(Math.min(...pts.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])))).toBeLessThan(1)
  })
})
