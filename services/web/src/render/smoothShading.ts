import * as THREE from 'three'

/** Facetas de una misma superficie curva (lado de un cilindro, esfera, empalme) se suavizan hasta este ángulo. */
export const SAME_SURFACE_SMOOTH_DEG = 30

/**
 * Normales de sombreado con ángulo de suavizado («auto-smooth»), sobre una geometría no indexada.
 * En cada vértice se promedian (pesadas por su ángulo en esa esquina, no por área: así no depende de cómo se
 * trianguló) las caras vecinas que forman con la cara propia menos de `angleDeg`;
 * si las dos caras vienen de la misma superficie de origen (atributo `surf`), el tope es
 * `max(angleDeg, SAME_SURFACE_SMOOTH_DEG)`: un cilindro de 32 lados (11,25°) se ve liso aunque el ángulo sea 10°.
 * Los triángulos degenerados (área nula o un ángulo de casi 180°, que la CSG deja al cerrar uniones en T) no tienen
 * una normal confiable: no suman a sus vecinos y heredan la normal de una cara vecina sana (si no, se ven puntitos).
 * `angleDeg` = 0 deja todas las caras planas. Reescribe el atributo `normal`; las indexadas no se tocan (las
 * primitivas ya traen sus normales analíticas).
 */
export function smoothShading(geom: THREE.BufferGeometry, angleDeg: number): void {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos || geom.getIndex()) return
  const nt = Math.floor(pos.count / 3)
  const p = pos.array
  const surfAttr = geom.getAttribute('surf') as THREE.BufferAttribute | undefined
  const surf = surfAttr?.array
  // Normal unitaria de cada cara y ángulo interior de cada esquina.
  const fu = new Float64Array(nt * 3)
  const ang = new Float64Array(nt * 3)
  const bad = new Uint8Array(nt)
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < p.length; i++) {
    if (p[i] < lo) lo = p[i]
    if (p[i] > hi) hi = p[i]
  }
  for (let t = 0; t < nt; t++) {
    const o = t * 9
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2]
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2]
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx
    const l = Math.hypot(x, y, z)
    for (let k = 0; k < 3; k++) {
      const a = o + 3 * k, b = o + 3 * ((k + 1) % 3), c = o + 3 * ((k + 2) % 3)
      const ax = p[b] - p[a], ay = p[b + 1] - p[a + 1], az = p[b + 2] - p[a + 2]
      const bx = p[c] - p[a], by = p[c + 1] - p[a + 1], bz = p[c + 2] - p[a + 2]
      const d = Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz))
      ang[t * 3 + k] = d > 0 ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / d))) : 0
    }
    if (l === 0 || Math.max(ang[t * 3], ang[t * 3 + 1], ang[t * 3 + 2]) > Math.PI - 0.01) bad[t] = 1
    if (l > 0) {
      fu[t * 3] = x / l
      fu[t * 3 + 1] = y / l
      fu[t * 3 + 2] = z / l
    }
  }
  const out = new Float32Array(nt * 9)
  const got = new Uint8Array(nt * 3)
  const cosA = angleDeg > 0 ? Math.cos((Math.min(angleDeg, 180) * Math.PI) / 180) - 1e-9 : 2
  const cosS = angleDeg > 0 ? Math.min(cosA, Math.cos((SAME_SURFACE_SMOOTH_DEG * Math.PI) / 180) - 1e-9) : 2
  // Vértices coincidentes: posición cuantizada (la CSG puede dejar diferencias de redondeo entre vecinos).
  const q = Math.max(hi - lo, 1e-9) * 1e-7
  const nc = nt * 3
  const qi = new Float64Array(nc * 3)
  for (let i = 0; i < nc * 3; i++) qi[i] = Math.round(p[i] / q)
  const order = Array.from({ length: nc }, (_, i) => i)
  order.sort((i, j) => qi[i * 3] - qi[j * 3] || qi[i * 3 + 1] - qi[j * 3 + 1] || qi[i * 3 + 2] - qi[j * 3 + 2])
  const corners: number[][] = []
  for (let k = 0; k < nc; k++) {
    const i = order[k]
    const j = k > 0 ? order[k - 1] : -1
    if (j >= 0 && qi[i * 3] === qi[j * 3] && qi[i * 3 + 1] === qi[j * 3 + 1] && qi[i * 3 + 2] === qi[j * 3 + 2]) corners[corners.length - 1].push(i)
    else corners.push([i])
  }
  for (const list of corners) {
    for (const c of list) {
      const t = Math.floor(c / 3)
      if (bad[t]) continue
      let x = 0, y = 0, z = 0
      for (const d of list) {
        const u = Math.floor(d / 3)
        if (bad[u]) continue
        const dot = fu[t * 3] * fu[u * 3] + fu[t * 3 + 1] * fu[u * 3 + 1] + fu[t * 3 + 2] * fu[u * 3 + 2]
        if (u !== t && dot < (surf && surf[t * 3] === surf[u * 3] ? cosS : cosA)) continue
        x += ang[d] * fu[u * 3]
        y += ang[d] * fu[u * 3 + 1]
        z += ang[d] * fu[u * 3 + 2]
      }
      const l = Math.hypot(x, y, z)
      out[c * 3] = l > 0 ? x / l : fu[t * 3]
      out[c * 3 + 1] = l > 0 ? y / l : fu[t * 3 + 1]
      out[c * 3 + 2] = l > 0 ? z / l : fu[t * 3 + 2]
    }
    // Degenerados: la normal de la esquina sana más parecida (misma superficie primero).
    for (const c of list) {
      const t = Math.floor(c / 3)
      if (!bad[t]) continue
      let best = -1
      let score = -Infinity
      for (const d of list) {
        const u = Math.floor(d / 3)
        if (bad[u]) continue
        const sc = (surf && surf[t * 3] === surf[u * 3] ? 10 : 0) + fu[t * 3] * fu[u * 3] + fu[t * 3 + 1] * fu[u * 3 + 1] + fu[t * 3 + 2] * fu[u * 3 + 2]
        if (sc > score) [best, score] = [d, sc]
      }
      if (best >= 0) {
        for (let k = 0; k < 3; k++) out[c * 3 + k] = out[best * 3 + k]
        got[c] = 1
      }
    }
  }
  // Esquinas de un degenerado sin vecina sana (la punta de una unión en T): la de otra esquina del mismo triángulo.
  for (let t = 0; t < nt; t++) {
    if (!bad[t]) continue
    const from = [0, 1, 2].find((k) => got[t * 3 + k])
    for (let k = 0; k < 3; k++) {
      const c = t * 3 + k
      if (got[c]) continue
      for (let j = 0; j < 3; j++) out[c * 3 + j] = from === undefined ? fu[t * 3 + j] : out[(t * 3 + from) * 3 + j]
    }
  }
  geom.setAttribute('normal', new THREE.BufferAttribute(out, 3))
}
