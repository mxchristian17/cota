import type { Vec3 } from '../math'
import { buildTopology } from '../editing/topology'
import type { SolidProps } from '../document/types'

/**
 * Proyección ortográfica de sólidos 3D a vistas 2D con eliminación de líneas ocultas (estilo FLATSHOT/
 * SOLVIEW). Toma mallas teseladas ({vertices, faces}) y devuelve segmentos 2D marcados como visibles u
 * ocultos. Framework-agnostic y testeable (no depende de THREE).
 *
 * Método: se extraen las **aristas de contorno** (borde o ángulo diedro > umbral) y se **muestrea** cada
 * arista; cada muestra se marca oculta si algún triángulo la tapa (más cerca del observador) en la
 * proyección. Las corridas consecutivas de igual visibilidad se emiten como un segmento.
 */

export type ViewDir = 'front' | 'top' | 'right'

export interface Mesh {
  /** Superficie de origen de cada cara (opcional, ver `render/csg`): separa una cara plana del empalme tangente. */
  surf?: ArrayLike<number> | null
  /** Topología ya calculada de esta malla (la del sólido, cacheada): evita rearmarla en cada vista. */
  topo?: ReturnType<typeof buildTopology> | null
  vertices: Vec3[]
  faces: number[][]
}

export interface ProjSegment {
  a: [number, number]
  b: [number, number]
  hidden: boolean
  /** Extremos en 3D (sobre la arista del sólido), para SOLPROF sin proyectar. */
  a3?: Vec3
  b3?: Vec3
}

/** Base de proyección: ejes de papel `right`/`up` y `out` hacia el observador (mayor = más cerca). */
export interface ProjBasis {
  right: Vec3
  up: Vec3
  out: Vec3
}

/** Bases de las vistas estándar de SOLVIEW/FLATSHOT. */
const AXES: Record<ViewDir, ProjBasis> = {
  front: { right: [1, 0, 0], up: [0, 0, 1], out: [0, -1, 0] }, // papel X/Z; el observador está en −Y (FRONT)
  top: { right: [1, 0, 0], up: [0, 1, 0], out: [0, 0, 1] }, // papel X/Y, profundidad Z
  right: { right: [0, 1, 0], up: [0, 0, 1], out: [1, 0, 0] }, // papel Y/Z, profundidad X
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const normalize = (v: Vec3): Vec3 => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / L, v[1] / L, v[2] / L]
}

interface Tri {
  i: [number, number, number]
  n: Vec3
  /** Grupo (entidad) al que pertenece el triángulo. */
  g: number
}

/** Une los grupos de mallas en una lista global de vértices (deduplicados) + triángulos por índice. */
function buildTriangles(groups: Mesh[][]): { verts: Vec3[]; tris: Tri[]; size: number } {
  const verts: Vec3[] = []
  const index = new Map<string, number>()
  const key = (v: Vec3): string => `${Math.round(v[0] * 1e6)},${Math.round(v[1] * 1e6)},${Math.round(v[2] * 1e6)}`
  const add = (v: Vec3): number => {
    const k = key(v)
    const hit = index.get(k)
    if (hit !== undefined) return hit
    const id = verts.length
    verts.push(v)
    index.set(k, id)
    return id
  }
  const tris: Tri[] = []
  groups.forEach((meshes, g) => {
    for (const m of meshes) {
      for (const f of m.faces) {
        // Triangula el polígono (fan) y agrega cada triángulo.
        for (let k = 1; k + 1 < f.length; k++) {
          const a = add(m.vertices[f[0]])
          const b = add(m.vertices[f[k]])
          const c = add(m.vertices[f[k + 1]])
          if (a === b || b === c || a === c) continue
          const n = normalize(cross(sub(verts[b], verts[a]), sub(verts[c], verts[a])))
          tris.push({ i: [a, b, c], n, g })
        }
      }
    }
  })
  // Diagonal de la caja envolvente (para sesgos relativos al tamaño).
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const v of verts)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], v[k])
      hi[k] = Math.max(hi[k], v[k])
    }
  const size = verts.length ? Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) : 1
  return { verts, tris, size }
}

/**
 * Aristas a dibujar de un grupo, como pares de puntos 3D: las aristas vivas de la topología (* tolerante a las uniones en T que deja la CSG: sin ella la vista mostraba la triangulación) y las
 * **siluetas** vistas desde `out` (generatrices de cilindros, contornos de esferas).
 */
/** Dos facetas vecinas con menos de 25° entre normales continúan la misma superficie suave (como la topología). */
const SMOOTH_DOT = Math.cos((25 * Math.PI) / 180)

function viewEdges(meshes: Mesh[], out: Vec3, tangential = false): Array<[Vec3, Vec3]> {
  // Cada sólido tiene sus propias aristas: se resuelven por separado (y con su topología cacheada, si la trae).
  if (meshes.length > 1) return meshes.flatMap((m) => viewEdges([m], out, tangential))
  const pos: number[] = []
  const surf: number[] = []
  const hasSurf = meshes.every((m) => m.surf)
  for (const m of meshes) {
    m.faces.forEach((f, fi) => {
      for (let k = 1; k + 1 < f.length; k++) {
        for (const i of [f[0], f[k], f[k + 1]]) pos.push(...m.vertices[i])
        if (hasSurf) surf.push(m.surf![fi])
      }
    })
  }
  if (!pos.length) return []
  const topo = meshes[0].topo ?? buildTopology(pos, hasSurf ? surf : null)
  const smooth = (a: Vec3, b: Vec3) => dot(a, b) > SMOOTH_DOT
  const res: Array<[Vec3, Vec3]> = []
  for (const e of topo.edges) {
    const n = e.pts.length
    for (let i = 0; i + 1 < n + (e.closed ? 1 : 0); i++) {
      // Entre dos caras vistas de canto: cae sobre el contorno (o es una astilla de la CSG en la pared
      // de un agujero visto a lo largo de su eje). No se dibuja.
      if (Math.abs(dot(e.n1[i], out)) < 0.05 && Math.abs(dot(e.n2[i], out)) < 0.05) continue
      // Arista tangente (cara plana ↔ empalme): sólo si se piden (la silueta, si cae ahí, sale abajo).
      if (!tangential && smooth(e.n1[i], e.n2[i])) continue
      res.push([e.pts[i], e.pts[(i + 1) % n]])
    }
  }
  for (const [ta, tb, a, b] of topo.links) {
    if (!smooth(topo.normals[ta], topo.normals[tb])) continue // arista viva: ya está dibujada
    // Silueta: el borde de la zona que mira al observador (una faceta de frente y la otra de espaldas o de canto).
    // Así también sale el contorno de un empalme que termina en una cara vista de canto (un cubo con todas las
    // aristas redondeadas). Dos facetas de canto (la pared de un agujero visto a lo largo de su eje) no cuentan:
    // sus diagonales saldrían como cuerdas del círculo.
    const [da, db] = [dot(topo.normals[ta], out), dot(topo.normals[tb], out)]
    if (da > 1e-6 !== db > 1e-6) res.push([topo.verts[a], topo.verts[b]])
  }
  // Sin el origen de cada cara, las tangentes se estiman por la forma de las facetas.
  if (tangential && !hasSurf) res.push(...tangentEdges(topo))
  return res
}

/**
 * Aristas tangentes (FLATSHOT ▸ *Include tangential edges*): donde una cara plana pasa en forma
 * suave a una superficie curva (el borde de un empalme). La curva teselada es una sucesión de bandas planas
 * angostas; una zona plana se distingue porque su área por largo de borde suave es mucho mayor que la de
 * las bandas de su misma cara suave.
 */
function tangentEdges(topo: ReturnType<typeof buildTopology>): Array<[Vec3, Vec3]> {
  const { verts, tris, normals, triFace, links } = topo
  const same = (a: Vec3, b: Vec3) => dot(a, b) > 1 - 1e-9
  // Grupos coplanares conectados (union-find por los vecinos con la misma normal).
  const parent = tris.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (const [ta, tb] of links) if (same(normals[ta], normals[tb])) parent[find(ta)] = find(tb)
  const area = new Map<number, number>()
  tris.forEach((t, i) => {
    const [a, b, c] = t.map((k) => verts[k])
    const cr = cross(sub(b, a), sub(c, a))
    const g = find(i)
    area.set(g, (area.get(g) ?? 0) + Math.hypot(cr[0], cr[1], cr[2]) / 2)
  })
  // Largo de borde suave (misma cara suave, normal distinta) de cada grupo.
  const smooth = links.filter(([ta, tb]) => triFace[ta] === triFace[tb] && !same(normals[ta], normals[tb]))
  const rim = new Map<number, number>()
  for (const [ta, tb, a, b] of smooth) {
    const L = Math.hypot(...sub(verts[a], verts[b]))
    for (const g of [find(ta), find(tb)]) rim.set(g, (rim.get(g) ?? 0) + L)
  }
  const ratio = (g: number) => (area.get(g) ?? 0) / Math.max(rim.get(g) ?? 0, 1e-12)
  const minByFace = new Map<number, number>()
  for (const [ta, tb] of smooth) {
    for (const t of [ta, tb]) {
      const f = triFace[t]
      minByFace.set(f, Math.min(minByFace.get(f) ?? Infinity, ratio(find(t))))
    }
  }
  const flat = (t: number) => ratio(find(t)) > 4 * (minByFace.get(triFace[t]) ?? Infinity)
  const res: Array<[Vec3, Vec3]> = []
  for (const [ta, tb, a, b] of smooth) if (flat(ta) !== flat(tb)) res.push([verts[a], verts[b]])
  return res
}

/** ¿Está (pu,pv) dentro del triángulo 2D? Devuelve las baricéntricas si lo está (para interpolar). */
function bary(pu: number, pv: number, au: number, av: number, bu: number, bv: number, cu: number, cv: number): [number, number, number] | null {
  const v0u = bu - au
  const v0v = bv - av
  const v1u = cu - au
  const v1v = cv - av
  const v2u = pu - au
  const v2v = pv - av
  const den = v0u * v1v - v1u * v0v
  if (Math.abs(den) < 1e-12) return null
  const b1 = (v2u * v1v - v1u * v2v) / den
  const b2 = (v0u * v2v - v2u * v0v) / den
  const b0 = 1 - b1 - b2
  const e = -1e-6
  if (b0 < e || b1 < e || b2 < e) return null
  return [b0, b1, b2]
}

/** Proyecta las mallas a una vista y devuelve los segmentos 2D (visibles + ocultos). */
export function orthoProject(meshes: Mesh[], view: ViewDir): ProjSegment[] {
  return projectHidden(meshes, AXES[view])
}

/**
 * Proyección paralela con líneas ocultas en una dirección **cualquiera** (la cámara de un viewport de
 * layout): las coordenadas 2D son `p·right` y `p·up`.
 */
export function projectHidden(meshes: Mesh[], basis: ProjBasis, opts: { tangential?: boolean } = {}): ProjSegment[] {
  return projectHiddenGroups([meshes], basis, opts)[0] ?? []
}

/**
 * Como `projectHidden`, pero por grupos (una entidad por grupo): las aristas salen de cada grupo y la
 * oclusión es contra **todos** los triángulos, así cada segmento conserva la capa de su entidad.
 */
export function projectHiddenGroups(groups: Mesh[][], basis: ProjBasis, opts: { tangential?: boolean } = {}): ProjSegment[][] {
  const { verts, tris, size } = buildTriangles(groups)
  const out: ProjSegment[][] = groups.map(() => [])
  if (verts.length === 0) return out
  const bias = 1e-4 * size
  const step = Math.max(size / 240, 1e-6) // longitud objetivo de muestreo

  // Precalcula proyecciones (u,v,depth) de cada vértice.
  const U = verts.map((p) => dot(p, basis.right))
  const V = verts.map((p) => dot(p, basis.up))
  const D = verts.map((p) => dot(p, basis.out)) // profundidad: mayor = más cerca del observador

  /**
   * ¿El punto 3D (por u,v,depth) está tapado por algún triángulo? Las caras que contienen la arista
   * muestreada quedan a su misma profundidad y el sesgo `bias` evita que se tapen a sí mismas.
   */
  // Grilla en el plano de la vista: cada muestra sólo se prueba contra los triángulos de su celda (antes, contra
  // todos: VIEWGEN y VIEWBASE tardaban segundos en piezas con empalmes).
  let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let k = 0; k < U.length; k++) {
    u0 = Math.min(u0, U[k])
    u1 = Math.max(u1, U[k])
    v0 = Math.min(v0, V[k])
    v1 = Math.max(v1, V[k])
  }
  const G = Math.max(8, Math.min(256, Math.ceil(Math.sqrt(tris.length))))
  const cw = (u1 - u0) / G || 1
  const ch = (v1 - v0) / G || 1
  const cellOf = (u: number, v: number): [number, number] => [Math.min(G - 1, Math.max(0, Math.floor((u - u0) / cw))), Math.min(G - 1, Math.max(0, Math.floor((v - v0) / ch)))]
  const grid: number[][] = Array.from({ length: G * G }, () => [])
  const maxD: number[] = []
  tris.forEach((t, k) => {
    const [ia, ib, ic] = t.i
    maxD.push(Math.max(D[ia], D[ib], D[ic]))
    const [a0, b0] = cellOf(Math.min(U[ia], U[ib], U[ic]), Math.min(V[ia], V[ib], V[ic]))
    const [a1, b1] = cellOf(Math.max(U[ia], U[ib], U[ic]), Math.max(V[ia], V[ib], V[ic]))
    for (let x = a0; x <= a1; x++) for (let y = b0; y <= b1; y++) grid[y * G + x].push(k)
  })
  const occluded = (pu: number, pv: number, pd: number): boolean => {
    const [gx, gy] = cellOf(pu, pv)
    for (const k of grid[gy * G + gx]) {
      if (maxD[k] <= pd + bias) continue // ningún punto del triángulo está delante
      const t = tris[k]
      const [ia, ib, ic] = t.i
      const bc = bary(pu, pv, U[ia], V[ia], U[ib], V[ib], U[ic], V[ic])
      if (!bc) continue
      const td = bc[0] * D[ia] + bc[1] * D[ib] + bc[2] * D[ic]
      if (td > pd + bias) return true // triángulo más cerca del observador → tapa
    }
    return false
  }

  for (let g = 0; g < groups.length; g++) {
    const segs = out[g]
    for (const [P, Q] of viewEdges(groups[g], basis.out, opts.tangential)) {
      const [ua, va, da] = [dot(P, basis.right), dot(P, basis.up), dot(P, basis.out)]
      const [ub, vb, db] = [dot(Q, basis.right), dot(Q, basis.up), dot(Q, basis.out)]
      const len = Math.hypot(ub - ua, vb - va)
      if (len < 1e-9) continue // arista vista de punta
      const n = Math.max(1, Math.min(200, Math.round(len / step)))
      let runStart = 0
      let runHidden = false
      const uAt = (t: number) => ua + (ub - ua) * t
      const vAt = (t: number) => va + (vb - va) * t
      const dAt = (t: number) => da + (db - da) * t
      const pAt = (t: number): Vec3 => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t]
      for (let s = 0; s < n; s++) {
        const tm = (s + 0.5) / n // punto medio del subintervalo
        const hidden = occluded(uAt(tm), vAt(tm), dAt(tm))
        if (s === 0) {
          runStart = 0
          runHidden = hidden
        } else if (hidden !== runHidden) {
          const t0 = runStart / n
          const t1 = s / n
          segs.push({ a: [uAt(t0), vAt(t0)], b: [uAt(t1), vAt(t1)], hidden: runHidden, a3: pAt(t0), b3: pAt(t1) })
          runStart = s
          runHidden = hidden
        }
      }
      const t0 = runStart / n
      segs.push({ a: [uAt(t0), vAt(t0)], b: [uAt(1), vAt(1)], hidden: runHidden, a3: pAt(t0), b3: pAt(1) })
    }
  }
  return out
}

function translateSegs(segs: ProjSegment[], du: number, dv: number): ProjSegment[] {
  return segs.map((s) => ({ a: [s.a[0] + du, s.a[1] + dv], b: [s.b[0] + du, s.b[1] + dv], hidden: s.hidden }))
}

/**
 * Dispone las tres vistas estándar (front/top/right) en un marco 2D común según la convención:
 * - Tercer diedro (ISO A / americano): TOP arriba del front, RIGHT a la derecha.
 * - Primer diedro (ISO E / europeo): TOP debajo del front, RIGHT a la izquierda.
 * El TOP se alinea con el front en U (eje X); el RIGHT se alinea en V (eje Z).
 */
export function layoutViews(
  front: ProjSegment[],
  top: ProjSegment[],
  right: ProjSegment[],
  firstAngle: boolean,
): ProjSegment[] {
  const o = viewOffsets(front, top, right, firstAngle)
  return [...front, ...translateSegs(top, o.top[0], o.top[1]), ...translateSegs(right, o.right[0], o.right[1])]
}

/** Desplazamiento de la planta y la lateral respecto de la frontal en la disposición de `layoutViews`. */
export function viewOffsets(front: ProjSegment[], top: ProjSegment[], right: ProjSegment[], firstAngle: boolean): { top: P2; right: P2 } {
  const fb = segmentsBounds(front)
  const tb = segmentsBounds(top)
  const rb = segmentsBounds(right)
  const gap = 0.25 * Math.max(fb.maxU - fb.minU, fb.maxV - fb.minV, 1e-6)
  return {
    top: [fb.minU - tb.minU, firstAngle ? fb.minV - gap - tb.maxV : fb.maxV + gap - tb.minV],
    right: [firstAngle ? fb.minU - gap - rb.maxU : fb.maxU + gap - rb.minU, fb.minV - rb.minV],
  }
}

/** Caja envolvente 2D de un conjunto de segmentos (para disponer las vistas). */
export function segmentsBounds(segs: ProjSegment[]): { minU: number; minV: number; maxU: number; maxV: number } {
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (const s of segs) {
    for (const p of [s.a, s.b]) {
      minU = Math.min(minU, p[0])
      minV = Math.min(minV, p[1])
      maxU = Math.max(maxU, p[0])
      maxV = Math.max(maxV, p[1])
    }
  }
  if (!isFinite(minU)) return { minU: 0, minV: 0, maxU: 0, maxV: 0 }
  return { minU, minV, maxU, maxV }
}

// ---------------------------------------------------------------------------------------------
// Entidades de dibujo (FLATSHOT)
// ---------------------------------------------------------------------------------------------

type P2 = [number, number]

/** Lo que FLATSHOT dibuja: líneas, arcos (antihorarios de `a0` a `a1`, radianes) y círculos. */
export type ProjItem =
  | { kind: 'line'; a: P2; b: P2; hidden: boolean; thin?: boolean }
  | { kind: 'arc'; c: P2; r: number; a0: number; a1: number; hidden: boolean; src?: P2[]; thin?: boolean; thread?: import('../thread/tables').ThreadInfo }
  | { kind: 'circle'; c: P2; r: number; hidden: boolean; src?: P2[] }

const d2 = (a: P2, b: P2): number => Math.hypot(a[0] - b[0], a[1] - b[1])

function distToSeg(p: P2, a: P2, b: P2): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  const L2 = dx * dx + dy * dy
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t)
}

/** Círculo por mínimos cuadrados (Kåsa) y su desvío máximo. */
function fitCircle(pts: P2[]): { c: P2; r: number; err: number } | null {
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p[0], 0) / n
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0
  for (const [x, y] of pts) {
    const u = x - mx
    const v = y - my
    suu += u * u
    svv += v * v
    suv += u * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < 1e-18) return null
  const b1 = (suuu + suvv) / 2
  const b2 = (svvv + svuu) / 2
  const uc = (b1 * svv - b2 * suv) / det
  const vc = (b2 * suu - b1 * suv) / det
  const c: P2 = [uc + mx, vc + my]
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n)
  const err = Math.max(...pts.map((p) => Math.abs(d2(p, c) - r)))
  return { c, r, err }
}

/**
 * Centro y radio exactos de puntos de una curva teselada: los vértices de la teselación están **sobre**
 * el círculo y los que agrega la CSG (uniones en T, cortes de visibilidad) caen sobre las cuerdas, por
 * dentro. Se ajusta el centro con los exteriores y el radio es la distancia máxima.
 */
function refineCircle(pts: P2[], c0: P2): { c: P2; r: number } {
  const ds = pts.map((p) => d2(p, c0)).sort((a, b) => a - b)
  const med = ds[Math.floor(ds.length / 2)]
  const outer = pts.filter((p) => d2(p, c0) >= med)
  const f = outer.length >= 3 ? fitCircle(outer) : null
  const c = f ? f.c : c0
  const dd = pts.map((p) => d2(p, c)).sort((a, b) => a - b)
  return { c, r: dd[Math.min(dd.length - 1, Math.floor(dd.length * 0.9))] }
}

/** Partes de una cadena de puntos: arcos (≥ 4 tramos que giran parejo) y líneas rectas. */
function splitChain(pts: P2[], closed: boolean, tol: number, hidden: boolean): ProjItem[] {
  const out: ProjItem[] = []
  const n = pts.length
  const turn = (i: number): number => {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]]
    const t = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])
    return Math.atan2(Math.sin(t), Math.cos(t))
  }
  /** Puntos i..j sobre un círculo: el desvío admitido es la flecha de sus tramos (teselación), no más. */
  const fits = (i: number, j: number): ReturnType<typeof fitCircle> => {
    const f = fitCircle(pts.slice(i, j + 1))
    if (!f) return null
    let L = 0
    for (let k = i; k < j; k++) L = Math.max(L, d2(pts[k], pts[k + 1]))
    // Tramos de teselación: cortos respecto del radio (un tramo recto largo no es parte del arco).
    if (L > 0.3 * f.r) return null // > ~17° por tramo: no es teselación de un arco
    return f.err <= Math.max(tol, (1.5 * L * L) / (8 * f.r)) ? f : null
  }
  /** Giro total de i a j (para no llamar arco a una recta con ruido). */
  const sweep = (i: number, j: number): number => {
    let t = 0
    for (let k = i + 1; k < j; k++) t += turn(k)
    return Math.abs(t)
  }
  let i = 0
  while (i < n - 1) {
    // Intenta un arco desde i: giros del mismo signo, menores a 35°, y puntos sobre un círculo.
    let j = i + 1
    let best: { j: number; f: NonNullable<ReturnType<typeof fitCircle>> } | null = null
    while (j + 1 < n) {
      const t = turn(j)
      if (Math.abs(t) < 1e-4 || Math.abs(t) > (35 * Math.PI) / 180) break
      if (j > i + 1 && Math.sign(t) !== Math.sign(turn(j - 1))) break
      const f = j + 1 - i >= 4 ? fits(i, j + 1) : null
      if (j + 1 - i >= 4 && !f) break
      if (f) best = { j: j + 1, f }
      j++
    }
    if (best && sweep(i, best.j) < (15 * Math.PI) / 180) best = null
    if (best) {
      const { c, r } = refineCircle(pts.slice(i, best.j + 1), best.f.c)
      const full = closed && i === 0 && best.j === n - 1 && d2(pts[0], pts[n - 1]) <= tol
      const src = pts.slice(i, best.j + 1)
      if (full) {
        out.push({ kind: 'circle', c, r, hidden, src })
        return out
      }
      const ang = (p: P2) => Math.atan2(p[1] - c[1], p[0] - c[0])
      const ccw = turn(i + 1) > 0
      const [s, e] = ccw ? [pts[i], pts[best.j]] : [pts[best.j], pts[i]]
      out.push({ kind: 'arc', c, r, a0: ang(s), a1: ang(e), hidden, src })
      i = best.j
      continue
    }
    // Línea: extiende mientras siga recta.
    let k = i + 1
    while (k + 1 < n && distToSeg(pts[k], pts[i], pts[k + 1]) <= tol && Math.abs(turn(k)) < 1e-3) k++
    out.push({ kind: 'line', a: pts[i], b: pts[k], hidden })
    i = k
  }
  return out
}

/**
 * Convierte los segmentos de una proyección en entidades de dibujo como las del CAD clásico: quita las
 * ocultas que caen sobre una visible, encadena los tramos y reconoce arcos y círculos.
 */
/**
 * Quita los segmentos que ya cubren otros (de mayor a menor largo): dos aristas que se ven superpuestas
 * (la boca de arriba y la de abajo de un agujero pasante) o un tramo partido por uniones en T. Se
 * compara contra los cercanos con una grilla.
 */
function dedupeCovered(segs: ProjSegment[], tol: number, against: ProjSegment[] = []): ProjSegment[] {
  const cell = Math.max(tol * 50, 1e-9)
  const grid = new Map<string, ProjSegment[]>()
  const cellsOf = (s: ProjSegment): string[] => {
    const [x0, x1] = [Math.min(s.a[0], s.b[0]) - tol, Math.max(s.a[0], s.b[0]) + tol]
    const [y0, y1] = [Math.min(s.a[1], s.b[1]) - tol, Math.max(s.a[1], s.b[1]) + tol]
    const out: string[] = []
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) out.push(`${i},${j}`)
    return out
  }
  const add = (s: ProjSegment) => {
    for (const k of cellsOf(s)) {
      const l = grid.get(k)
      if (l) l.push(s)
      else grid.set(k, [s])
    }
  }
  /** ¿`p` cae sobre un segmento ya dibujado **paralelo** a `s`? (uno que sólo lo cruza no lo tapa) */
  const covered = (s: ProjSegment) => (p: P2): boolean => {
    const [dx, dy] = [s.b[0] - s.a[0], s.b[1] - s.a[1]]
    const L = Math.hypot(dx, dy) || 1
    return (grid.get(`${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`) ?? []).some((v) => {
      if (distToSeg(p, v.a, v.b) > tol) return false
      const [ex, ey] = [v.b[0] - v.a[0], v.b[1] - v.a[1]]
      const M = Math.hypot(ex, ey) || 1
      return Math.abs(dx * ey - dy * ex) / (L * M) < 1e-3
    })
  }
  against.forEach(add)
  const kept: ProjSegment[] = []
  for (const s of [...segs].sort((p, q) => d2(q.a, q.b) - d2(p.a, p.b))) {
    const mid: P2 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]
    if ([s.a, mid, s.b].every(covered(s))) continue
    kept.push(s)
    add(s)
  }
  return kept
}

/**
 * Junta los pedazos de un mismo círculo: arcos con igual centro y radio, y las cuerdas cortas que caen
 * sobre ellos (la CSG parte las aristas). Si cubren toda la vuelta queda un círculo; si no, los arcos
 * contiguos se unen.
 */
function mergeCocircular(items: ProjItem[], tol: number): ProjItem[] {
  const rest: ProjItem[] = []
  const groups: Array<{ c: P2; r: number; hidden: boolean; spans: Array<[number, number]>; pts: P2[] }> = []
  const arcPts = (it: Extract<ProjItem, { kind: 'arc' | 'circle' }>): P2[] => {
    const [a0, sw] = it.kind === 'circle' ? [0, 2 * Math.PI] : [it.a0, norm2pi(it.a1 - it.a0) || 2 * Math.PI]
    return Array.from({ length: 9 }, (_, k) => [it.c[0] + it.r * Math.cos(a0 + (sw * k) / 8), it.c[1] + it.r * Math.sin(a0 + (sw * k) / 8)] as P2)
  }
  const norm2pi = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const near = (g: { c: P2; r: number }, c: P2, r: number) => {
    const t = Math.max(tol * 5, 0.01 * Math.max(g.r, r))
    return d2(g.c, c) <= t && Math.abs(g.r - r) <= t
  }
  const span = (it: ProjItem) => (it.kind === 'circle' ? 2 * Math.PI : it.kind === 'arc' ? norm2pi(it.a1 - it.a0 || 2 * Math.PI) * it.r : 0)
  /** ¿Los extremos y el medio del arco caen sobre el círculo del grupo? (un pedazo corto ajusta mal su centro) */
  const onGroup = (g: { c: P2; r: number }, it: Extract<ProjItem, { kind: 'arc' }>) => {
    const t = Math.max(tol * 5, 0.01 * g.r)
    const am = it.a0 + norm2pi(it.a1 - it.a0) / 2
    return [it.a0, it.a1, am].every((a) => Math.abs(d2([it.c[0] + it.r * Math.cos(a), it.c[1] + it.r * Math.sin(a)], g.c) - g.r) <= t)
  }
  for (const it of [...items].sort((p, q) => span(q) - span(p))) {
    if (it.kind === 'line') continue
    let g = groups.find((x) => x.hidden === it.hidden && (near(x, it.c, it.r) || (it.kind === 'arc' && onGroup(x, it))))
    if (!g) groups.push((g = { c: it.c, r: it.r, hidden: it.hidden, spans: [], pts: [] }))
    g.pts.push(...(it.src ?? arcPts(it)))
    if (it.kind === 'arc' && !near(g, it.c, it.r)) {
      // Pedazo absorbido: sus ángulos medidos desde el centro del grupo.
      const ang = (a: number) => norm2pi(Math.atan2(it.c[1] + it.r * Math.sin(a) - g!.c[1], it.c[0] + it.r * Math.cos(a) - g!.c[0]))
      const [b0, b1] = [ang(it.a0), ang(it.a1)]
      g.spans.push([b0, b0 + norm2pi(b1 - b0)])
      continue
    }
    if (it.kind === 'circle') g.spans.push([0, 2 * Math.PI])
    else g.spans.push([norm2pi(it.a0), norm2pi(it.a0) + norm2pi(it.a1 - it.a0 || 2 * Math.PI)])
  }
  for (const it of items) {
    if (it.kind !== 'line') continue
    // Cuerda corta sobre un círculo conocido: es un pedazo de él.
    const g = groups.find((x) => {
      if (x.hidden !== it.hidden) return false
      const t = Math.max(tol * 5, 0.01 * x.r)
      const mid: P2 = [(it.a[0] + it.b[0]) / 2, (it.a[1] + it.b[1]) / 2]
      return Math.abs(d2(it.a, x.c) - x.r) <= t && Math.abs(d2(it.b, x.c) - x.r) <= t && Math.abs(d2(mid, x.c) - x.r) <= t && d2(it.a, it.b) < 0.6 * x.r
    })
    if (!g) {
      rest.push(it)
      continue
    }
    g.pts.push(it.a, it.b)
    let a0 = norm2pi(Math.atan2(it.a[1] - g.c[1], it.a[0] - g.c[0]))
    let a1 = norm2pi(Math.atan2(it.b[1] - g.c[1], it.b[0] - g.c[0]))
    if (norm2pi(a1 - a0) > Math.PI) [a0, a1] = [a1, a0] // el tramo menor
    g.spans.push([a0, a0 + norm2pi(a1 - a0)])
  }
  for (const g of groups) {
    // Centro y radio con todos los pedazos (los ángulos de los intervalos no cambian por esto).
    const ref = refineCircle(g.pts, g.c)
    g.c = ref.c
    g.r = ref.r
    // Unión de intervalos angulares (con la vuelta).
    const sp = g.spans.flatMap(([a, b]) => (b > 2 * Math.PI ? [[a, 2 * Math.PI], [0, b - 2 * Math.PI]] : [[a, b]])).sort((p, q) => p[0] - q[0])
    const gapTol = Math.max((tol * 5) / g.r, 0.02)
    const merged: Array<[number, number]> = []
    for (const [a, b] of sp) {
      const last = merged[merged.length - 1]
      if (last && a <= last[1] + gapTol) last[1] = Math.max(last[1], b)
      else merged.push([a, b])
    }
    // Une el último con el primero si se tocan en 0 = 2π.
    if (merged.length > 1 && merged[0][0] <= gapTol && merged[merged.length - 1][1] >= 2 * Math.PI - gapTol) {
      const last = merged.pop()!
      merged[0] = [last[0] - 2 * Math.PI, merged[0][1]]
    }
    if (merged.length === 1 && merged[0][1] - merged[0][0] >= 2 * Math.PI - gapTol) rest.push({ kind: 'circle', c: g.c, r: g.r, hidden: g.hidden })
    else for (const [a, b] of merged) rest.push({ kind: 'arc', c: g.c, r: g.r, a0: a, a1: b, hidden: g.hidden })
  }
  return rest
}

export function mergeSegments(segs: ProjSegment[], tol: number): ProjItem[] {
  return mergeCollinear2D(mergeCocircular(mergeChains(segs, tol), tol), tol)
}

/** Une las líneas que están sobre la misma recta y se tocan o se superponen (la CSG las parte). */
function mergeCollinear2D(items: ProjItem[], tol: number): ProjItem[] {
  const lines = items.filter((i): i is Extract<ProjItem, { kind: 'line' }> => i.kind === 'line')
  const out: ProjItem[] = items.filter((i) => i.kind !== 'line')
  const used = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue
    const base = lines[i]
    const L = d2(base.a, base.b)
    const dir: P2 = [(base.b[0] - base.a[0]) / L, (base.b[1] - base.a[1]) / L]
    const off = (p: P2) => (p[0] - base.a[0]) * -dir[1] + (p[1] - base.a[1]) * dir[0]
    const t = (p: P2) => (p[0] - base.a[0]) * dir[0] + (p[1] - base.a[1]) * dir[1]
    let [lo, hi] = [0, L]
    let grew = true
    while (grew) {
      grew = false
      for (let j = i + 1; j < lines.length; j++) {
        if (used.has(j) || lines[j].hidden !== base.hidden) continue
        const o = lines[j]
        if (Math.abs(off(o.a)) > tol || Math.abs(off(o.b)) > tol) continue
        const [ta, tb] = [t(o.a), t(o.b)].sort((x, y) => x - y)
        if (tb < lo - tol || ta > hi + tol) continue
        lo = Math.min(lo, ta)
        hi = Math.max(hi, tb)
        used.add(j)
        grew = true
      }
    }
    const at = (s: number): P2 => [base.a[0] + dir[0] * s, base.a[1] + dir[1] * s]
    out.push({ kind: 'line', a: at(lo), b: at(hi), hidden: base.hidden })
  }
  return out
}

function mergeChains(segs: ProjSegment[], tol: number): ProjItem[] {
  const vis = dedupeCovered(segs.filter((s) => !s.hidden && d2(s.a, s.b) > tol), tol)
  // Las ocultas que caen sobre una visible no se dibujan (como el CAD clásico).
  const hid = dedupeCovered(segs.filter((s) => s.hidden && d2(s.a, s.b) > tol), tol, vis)
  const items: ProjItem[] = []
  for (const [list, hidden] of [[vis, false], [hid, true]] as const) {
    // Grafo por extremos cuantizados.
    const key = (p: P2) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`
    const seen = new Set<string>()
    const edges: Array<[P2, P2]> = []
    for (const s of list) {
      const [ka, kb] = [key(s.a), key(s.b)]
      if (ka === kb) continue
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      if (seen.has(k)) continue // duplicado (dos aristas que se ven superpuestas)
      seen.add(k)
      edges.push([s.a, s.b])
    }
    const adj = new Map<string, number[]>()
    edges.forEach(([a, b], i) => {
      for (const p of [a, b]) {
        const k = key(p)
        const l = adj.get(k)
        if (l) l.push(i)
        else adj.set(k, [i])
      }
    })
    const used = new Set<number>()
    const walk = (start: number, from: P2): { pts: P2[]; closed: boolean } => {
      const pts: P2[] = [from]
      let cur = start
      let at = from
      for (;;) {
        used.add(cur)
        const [a, b] = edges[cur]
        const next = key(a) === key(at) ? b : a
        pts.push(next)
        at = next
        const deg = adj.get(key(at)) ?? []
        if (deg.length !== 2) break
        const nxt = deg.find((e) => !used.has(e))
        if (nxt === undefined) return { pts, closed: key(pts[0]) === key(at) }
        cur = nxt
      }
      return { pts, closed: false }
    }
    // Primero desde extremos (grado ≠ 2), después los lazos.
    edges.forEach(([a], i) => {
      if (used.has(i)) return
      const [ka, kb] = [key(a), key(edges[i][1])]
      if ((adj.get(ka)?.length ?? 0) !== 2) {
        const c = walk(i, a)
        items.push(...splitChain(c.pts, c.closed, tol, hidden))
      } else if ((adj.get(kb)?.length ?? 0) !== 2) {
        const c = walk(i, edges[i][1])
        items.push(...splitChain(c.pts, c.closed, tol, hidden))
      }
    })
    edges.forEach(([a], i) => {
      if (used.has(i)) return
      const c = walk(i, a)
      items.push(...splitChain(c.pts, c.closed, tol, hidden))
    })
  }
  return items
}

// ---------------------------------------------------------------------------------------------
// Círculos exactos del árbol paramétrico
// ---------------------------------------------------------------------------------------------

/** Círculo exacto de una primitiva (bordes de cilindros y conos; contorno de esferas: `n` nulo). */
export interface CircleHint {
  c: Vec3
  n: Vec3 | null
  r: number
}

/** Círculos que definen las primitivas del árbol de un sólido (su radio y centro exactos). */
export function solidCircleHints(p: SolidProps): CircleHint[] {
  switch (p.op) {
    case 'CYLINDER':
    case 'CONE': {
      const a = normalize(p.axis ?? [0, 0, 1])
      const top: Vec3 = [p.base[0] + a[0] * p.height, p.base[1] + a[1] * p.height, p.base[2] + a[2] * p.height]
      const rt = p.op === 'CYLINDER' ? p.radius : (p.radiusTop ?? 0)
      return [{ c: p.base, n: a, r: p.radius }, ...(rt > 0 ? [{ c: top, n: a, r: rt }] : [])]
    }
    case 'SPHERE':
      return [{ c: p.center, n: null, r: p.radius }]
    case 'UNION':
    case 'SUBTRACT':
    case 'INTERSECT':
      return p.operands.flatMap(solidCircleHints)
    case 'SHELL':
    case 'FILLETEDGE':
    case 'CHAMFEREDGE':
      return solidCircleHints(p.solid)
    default:
      return []
  }
}

/** Los círculos exactos que se ven como círculos en una vista estándar, en sus coordenadas 2D. */
export function viewHints(hints: CircleHint[], view: ViewDir, offset: P2 = [0, 0]): Array<{ c: P2; r: number }> {
  const b = AXES[view]
  return hints
    .filter((h) => !h.n || Math.abs(dot(h.n, b.out)) > 0.999)
    .map((h) => ({ c: [dot(h.c, b.right) + offset[0], dot(h.c, b.up) + offset[1]] as P2, r: h.r }))
}

/** Lleva cada círculo o arco al círculo exacto de una primitiva que coincide (radio y centro). */
export function snapToHints(items: ProjItem[], hints: Array<{ c: P2; r: number }>): ProjItem[] {
  return items.map((it) => {
    if (it.kind === 'line') return it
    const h = hints.find((x) => Math.abs(x.r - it.r) <= 0.01 * x.r + 1e-6 && d2(x.c, it.c) <= 0.01 * x.r + 1e-6)
    return h ? { ...it, c: h.c, r: h.r } : it
  })
}
