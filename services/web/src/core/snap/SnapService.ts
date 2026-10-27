import { fromVec3, pt, toVec3, type Pt, type Vec3 } from '../math'
import type { ArcProps, CircleProps, EllipseProps, Entity } from '../document/types'
import { ucsToWorld, worldToUcs, type Ucs } from '../ucs'
import { solidArcCenters, solidCenters, solidQuadrants, solidVertices } from '../editing/solid'
import { ellipseMinorVec, ellipseParamSweep, ellipsePointAt, ellipsePoints, ellipseQuadrants, isEllipseArc } from '../geom/ellipse'
import {
  arcBasis,
  arcContainsAngle,
  arcMidpoint,
  arcPointAtAngle,
  arcQuadrants,
  arcSegmentCount,
  sweepOf,
  tessellateArc,
} from '../geom/arc'
import { bulgeArc, bulgeAt, hasBulges, polylineCentroid, polylineMidpoints, polylineSpans } from '../geom/polyline'
import { curveOf, type Curve } from '../geom/curve'
import { intersectCurves, selfIntersections } from '../geom/intersect'
import type { TanObject } from '../geom/tangency'
import type { OsnapConfig } from './osnap'
import { endpointsOfEntity, segmentsOfEntity } from './segments'

export type SnapType =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  /** Centro geométrico (centroide de área) de polilíneas cerradas y rectángulos — GCEN. */
  | 'geometricCenter'
  | 'quadrant'
  | 'intersection'
  | 'apparentIntersection'
  | 'perpendicular'
  | 'tangent'
  | 'nearest'
  | 'node'
  | 'grid'
  /** Captura sobre una línea de alineación del object snap tracking (no es un running osnap). */
  | 'tracking'

/** Segmentos consecutivos de una polilínea de puntos. */
const toSegs = (pts: Pt[]): [Pt, Pt][] => pts.slice(1).map((p, i) => [pts[i], p])

export interface SnapResult {
  point: Pt
  type: SnapType | null
  /**
   * TAN/PER **diferidos**: sin punto anterior, el clic sólo elige la curva; el comando calcula
   * el punto de tangencia/perpendicularidad cuando conoce el siguiente punto (el CAD clásico *Deferred Tangent*).
   */
  deferred?: { kind: 'tangent' | 'perpendicular'; obj: TanObject }
  /** Entidad que dio el punto (no en intersecciones entre dos objetos). */
  owner?: string
}

/** Proyección de un punto de mundo a píxeles de pantalla (o null si no es visible). */
export type Projector = (p: Pt) => [number, number] | null

export interface SnapSettings {
  gridSnap: boolean
  gridStep: number
  esnap: boolean
  ucs: Ucs
  /** Object snaps activos (running osnaps). */
  osnap: OsnapConfig
  /** Punto base del prompt actual (para perpendicular/tangent). */
  base: Pt | null
  /** Cursor en píxeles de pantalla (para medir la captura del esnap en 3D). */
  cursorPx: [number, number]
  /** Umbral de captura del esnap en píxeles. */
  pixelThreshold: number
  /** Proyección mundo→píxeles de la cámara activa. */
  project: Projector
  /** Distancia del punto a la cámara (para elegir el objeto más cercano en apparent intersection). */
  depth?: (p: Pt) => number
  /** El snap se pidió tipeado para este punto (CEN, TAN…), no por los osnaps activos. */
  explicitOsnap?: boolean
}

/** Tipos de candidato de object snap (todos menos la grilla y el tracking). */
type Kind = Exclude<SnapType, 'grid' | 'tracking'>

/**
 * Nivel 1 — **punto bajo el cursor** (el punto de snap cae dentro de la apertura): prioridad de
 * desempate estilo CAD clásico y luego distancia.
 */
const PRIORITY: Record<Kind, number> = {
  endpoint: 10,
  midpoint: 9,
  center: 8,
  geometricCenter: 8,
  intersection: 7,
  apparentIntersection: 6,
  quadrant: 5,
  node: 4,
  perpendicular: 3,
  tangent: 2,
  nearest: 1,
}

/**
 * Nivel 2 — **objeto bajo el cursor** (el punto puede estar lejos: se dispara pasando por el objeto).
 * Si el usuario tildó PER/TAN los quiere: ganan al CEN disparado desde la misma curva (D3).
 */
const OBJECT_PRIORITY: Partial<Record<Kind, number>> = {
  perpendicular: 4,
  tangent: 3,
  center: 2,
  geometricCenter: 1,
}

/** Margen (px) para considerar que dos objetos están "igual de bajo el cursor" en el nivel 2. */
const OBJECT_TIE_PX = 2

const mid = (a: Pt, b: Pt): Pt => pt((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)

const lerp = (a: Pt, b: Pt, t: number): Pt =>
  pt(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), a.z + t * (b.z - a.z))

const sub3 = (a: Pt, b: Pt): Vec3 => [a.x - b.x, a.y - b.y, a.z - b.z]
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Punto más cercano (en pantalla) sobre el segmento 3D a→b respecto del cursor en píxeles. */
function nearestOnSegmentScreen(cursorPx: [number, number], a: Pt, b: Pt, project: Projector): Pt | null {
  const pa = project(a)
  const pb = project(b)
  if (!pa || !pb) return null
  const abx = pb[0] - pa[0]
  const aby = pb[1] - pa[1]
  const len2 = abx * abx + aby * aby
  if (len2 === 0) return { x: a.x, y: a.y, z: a.z }
  let t = ((cursorPx[0] - pa[0]) * abx + (cursorPx[1] - pa[1]) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  return lerp(a, b, t)
}

/**
 * Pie de la perpendicular desde `base` a la **recta** que pasa por a→b, en 3D. Como en el CAD clásico, el
 * pie puede caer en la prolongación del tramo.
 */
function perpFoot(base: Pt, a: Pt, b: Pt): Pt {
  const ab = sub3(b, a)
  const len2 = dot3(ab, ab)
  if (len2 === 0) return a
  return lerp(a, b, dot3(sub3(base, a), ab) / len2)
}

/**
 * Intersección **real** (3D) de los segmentos a→b y c→d: puntos más cercanos entre ambos y, si
 * están a menos de la tolerancia, su punto medio. Paralelos o cruzados a distinta altura → null.
 */
function segIntersect3D(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const u = sub3(b, a)
  const v = sub3(d, c)
  const w = sub3(a, c)
  const uu = dot3(u, u)
  const vv = dot3(v, v)
  const uv = dot3(u, v)
  const den = uu * vv - uv * uv
  if (uu === 0 || vv === 0 || den <= 1e-12 * uu * vv) return null
  const s = (uv * dot3(v, w) - vv * dot3(u, w)) / den
  const t = (uu * dot3(v, w) - uv * dot3(u, w)) / den
  const eps = 1e-9
  if (s < -eps || s > 1 + eps || t < -eps || t > 1 + eps) return null
  const p = lerp(a, b, s)
  const q = lerp(c, d, t)
  const tol = 1e-7 * Math.max(1, Math.sqrt(uu), Math.sqrt(vv))
  if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > tol) return null
  return p
}

/** Curva analítica de una entidad plana con **z constante** (para INT exacto), o null. */
function flatCurve(e: Entity): { curve: Curve; z: number } | null {
  const c = curveOf(e)
  if (!c) return null
  const z = c.prims[0].k === 'L' ? c.prims[0].a[2] : c.prims[0].c[2]
  for (const p of c.prims) {
    const zs = p.k === 'L' ? [p.a[2], p.b[2]] : [p.c[2]]
    if (zs.some((q) => Math.abs(q - z) > 1e-9)) return null
  }
  return { curve: c, z }
}

/** Arco de un círculo completo (barrido nulo = vuelta completa), para tratar círculos y arcos igual. */
const fullCircle = (c: CircleProps): ArcProps => ({ center: c.center, radius: c.radius, startAngle: 0, endAngle: 0, normal: c.normal })

/** Raíces de `g` en el barrido de la elipse (muestreo + bisección), como parámetros. */
function ellipseRoots(e: EllipseProps, g: (param: number) => number): number[] {
  const p0 = isEllipseArc(e) ? (e.startParam as number) : 0
  const sw = ellipseParamSweep(e)
  const N = 128
  const out: number[] = []
  let prev = g(p0)
  for (let i = 1; i <= N; i++) {
    const lo = p0 + ((i - 1) / N) * sw
    const hi = p0 + (i / N) * sw
    const cur = g(hi)
    if (prev === 0) out.push(lo)
    else if (prev * cur < 0) {
      let a = lo
      let b = hi
      let ga = prev
      for (let it = 0; it < 60; it++) {
        const m = (a + b) / 2
        const gm = g(m)
        if (ga * gm <= 0) b = m
        else {
          a = m
          ga = gm
        }
      }
      out.push((a + b) / 2)
    }
    prev = cur
  }
  return out
}

/**
 * Cruce **visual** de dos segmentos 3D: se intersecan sus proyecciones en píxeles y se devuelve el
 * punto sobre el segmento más cercano a la cámara (en el CAD clásico: "apparent intersection"). Devuelve null
 * si no se cruzan en pantalla o si en realidad se tocan en el espacio (eso ya es `intersection`).
 */
function apparentIntersection(a: Pt, b: Pt, c: Pt, d: Pt, s: SnapSettings): Pt | null {
  const pa = s.project(a)
  const pb = s.project(b)
  const pc = s.project(c)
  const pd = s.project(d)
  if (!pa || !pb || !pc || !pd) return null
  const r1x = pb[0] - pa[0]
  const r1y = pb[1] - pa[1]
  const r2x = pd[0] - pc[0]
  const r2y = pd[1] - pc[1]
  const denom = r1x * r2y - r1y * r2x
  if (Math.abs(denom) < 1e-9) return null
  const t = ((pc[0] - pa[0]) * r2y - (pc[1] - pa[1]) * r2x) / denom
  const u = ((pc[0] - pa[0]) * r1y - (pc[1] - pa[1]) * r1x) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  const p1 = lerp(a, b, t)
  const p2 = lerp(c, d, u)
  const gap = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z)
  if (gap < 1e-6) return null // se tocan de verdad → es una intersección real, no aparente
  if (!s.depth) return p1
  return s.depth(p1) <= s.depth(p2) ? p1 : p2
}

const CIRCLE_SAMPLES = 96
const MAX_INTERSECT_SEGS = 40
const MAX_INTERSECT_CURVES = 24
/** Curvas más largas (p. ej. curvas de nivel importadas) intersecan por segmentos: el costo es O(n·m). */
const MAX_CURVE_PRIMS = 300

interface Cand {
  point: Pt
  type: Kind
  /** 1 = punto bajo el cursor, 2 = objeto bajo el cursor, 3 = nearest. */
  tier: 1 | 2 | 3
  d: number
  deferred?: SnapResult['deferred']
  owner?: string
}

/** Candidato ganador: nivel 1 por prioridad y distancia; nivel 2 el objeto más cercano y, en él, PER > TAN > CEN > GCEN. */
function pick(cands: Cand[]): Cand | null {
  const t1 = cands.filter((c) => c.tier === 1)
  if (t1.length > 0) return t1.sort((a, b) => PRIORITY[b.type] - PRIORITY[a.type] || a.d - b.d)[0]
  const t2 = cands.filter((c) => c.tier === 2)
  if (t2.length > 0) {
    const minD = Math.min(...t2.map((c) => c.d))
    const op = (c: Cand) => OBJECT_PRIORITY[c.type] ?? 0
    return t2.filter((c) => c.d <= minD + OBJECT_TIE_PX).sort((a, b) => op(b) - op(a) || a.d - b.d)[0]
  }
  return cands.filter((c) => c.tier === 3).sort((a, b) => a.d - b.d)[0] ?? null
}

/**
 * Calcula el punto de captura para el cursor. El esnap se mide en **píxeles de pantalla**
 * (proyección de la cámara), por lo que funciona en cualquier vista 3D; el grid se resuelve
 * sobre el plano del UCS. Los tipos activos vienen de `s.osnap`.
 *
 * Resolución en tres niveles: 1) puntos bajo el cursor (endpoint, midpoint, center sobre el
 * centro, intersecciones, quadrant, node, GCEN sobre el centroide); 2) objeto bajo el cursor (PER,
 * TAN, CEN desde la curva, GCEN desde el borde); 3) nearest.
 */
export function computeSnap(cursor: Pt, entities: Entity[], s: SnapSettings): SnapResult {
  if (s.esnap) {
    const [cx, cy] = s.cursorPx
    const thr = s.pixelThreshold
    const cands: Cand[] = []
    const pxDist = (p: Pt): number => {
      const pr = s.project(p)
      return pr ? Math.hypot(pr[0] - cx, pr[1] - cy) : Infinity
    }
    /** Nivel 1: el punto de snap está bajo el cursor. */
    let owner: string | undefined // entidad en curso (los candidatos la llevan)
    const add = (point: Pt, type: Kind): void => {
      if (!s.osnap[type]) return
      const d = pxDist(point)
      if (d <= thr) cands.push({ point, type, tier: 1, d, owner })
    }
    /** Nivel 2: el cursor pasa por el objeto (a `trigD` px) y el punto puede estar lejos. */
    const addObj = (point: Pt, type: Kind, trigD: number, deferred?: SnapResult['deferred']): void => {
      if (s.osnap[type] && trigD <= thr) cands.push({ point, type, tier: 2, d: trigD, owner, ...(deferred ? { deferred } : {}) })
    }
    const addNearest = (point: Pt): void => {
      if (!s.osnap.nearest) return
      const d = pxDist(point)
      if (d <= thr) cands.push({ point, type: 'nearest', tier: 3, d, owner })
    }
    /** Distancia en pantalla del cursor a una polilínea de puntos y el punto más cercano. */
    const edge = (pts: Pt[]): { d: number; p: Pt | null } => {
      let best: { d: number; p: Pt | null } = { d: Infinity, p: null }
      for (let i = 0; i + 1 < pts.length; i++) {
        const np = nearestOnSegmentScreen(s.cursorPx, pts[i], pts[i + 1], s.project)
        if (!np) continue
        const d = pxDist(np)
        if (d < best.d) best = { d, p: np }
      }
      return best
    }
    /** El candidato más cercano al cursor (en pantalla) de una lista. */
    const closest = (pts: Pt[]): Pt | null => {
      let best: Pt | null = null
      let bd = Infinity
      for (const p of pts) {
        const d = pxDist(p)
        if (d < bd) {
          bd = d
          best = p
        }
      }
      return best
    }

    /**
     * Círculo, arco o tramo curvo de polilínea: CEN (nivel 1 sobre el centro, nivel 2 desde la
     * traza), cuadrantes, nearest exacto y PER/TAN en el plano de la curva.
     */
    const round = (a: ArcProps, nearest: boolean): void => {
      const center = fromVec3(a.center)
      const trace = tessellateArc(a, arcSegmentCount(sweepOf(a), CIRCLE_SAMPLES)).map(fromVec3)
      const e = edge(trace)
      add(center, 'center')
      addObj(center, 'center', e.d)
      for (const q of arcQuadrants(a)) add(fromVec3(q), 'quadrant')
      const { u, v } = arcBasis(a.normal)
      const local = (p: Pt): [number, number] => {
        const w = sub3(p, center)
        return [dot3(w, u), dot3(w, v)]
      }
      const onArc = (ang: number): Pt | null => (arcContainsAngle(a, ang) ? fromVec3(arcPointAtAngle(a, ang)) : null)
      // Punto exacto de la curva bajo el cursor (proyección radial del punto de la cuerda).
      const onCurve = e.p ? (() => {
        const [x, y] = local(e.p)
        return onArc(Math.atan2(y, x))
      })() : null
      if (nearest && onCurve) addNearest(onCurve)
      if (!s.base) {
        // Sin punto anterior: TAN/PER diferidos sobre la curva.
        if (onCurve && e.d <= thr) {
          const obj: TanObject = { kind: 'circle', c: a.center, r: a.radius }
          addObj(onCurve, 'tangent', e.d, { kind: 'tangent', obj })
          // En una curva la tangente diferida es la habitual; la perpendicular sólo si TAN está apagado.
          if (!s.osnap.tangent) addObj(onCurve, 'perpendicular', e.d, { kind: 'perpendicular', obj })
        }
        return
      }
      if (e.d > thr) return
      const [bx, by] = local(s.base)
      const dn = Math.hypot(bx, by)
      if (dn <= 1e-9) return
      const ang = Math.atan2(by, bx)
      if (s.osnap.perpendicular) {
        const p = closest([onArc(ang), onArc(ang + Math.PI)].filter((q): q is Pt => q !== null))
        if (p) addObj(p, 'perpendicular', e.d)
      }
      if (s.osnap.tangent && dn > a.radius + 1e-9) {
        const off = Math.acos(a.radius / dn)
        const p = closest([onArc(ang + off), onArc(ang - off)].filter((q): q is Pt => q !== null))
        if (p) addObj(p, 'tangent', e.d)
      }
    }

    /** Elipse o arco de elipse: CEN, cuadrantes, nearest y PER/TAN por raíces sobre el parámetro. */
    const ellipse = (el: EllipseProps): void => {
      const center = fromVec3(el.center)
      const e = edge(ellipsePoints(el, CIRCLE_SAMPLES, true).map(fromVec3))
      if (e.p) addNearest(e.p)
      add(center, 'center')
      addObj(center, 'center', e.d)
      for (const q of ellipseQuadrants(el)) add(fromVec3(q), 'quadrant')
      if (!s.base || e.d > thr) return
      const minor = ellipseMinorVec(el)
      const at = (t: number): Vec3 => ellipsePointAt(el, t)
      const der = (t: number): Vec3 => {
        const c = Math.cos(t)
        const n = Math.sin(t)
        return [-n * el.major[0] + c * minor[0], -n * el.major[1] + c * minor[1], -n * el.major[2] + c * minor[2]]
      }
      const b = toVec3(s.base)
      const rel = (t: number): Vec3 => {
        const p = at(t)
        return [p[0] - b[0], p[1] - b[1], p[2] - b[2]]
      }
      const pts = (ts: number[]) => ts.map((t) => fromVec3(at(t)))
      if (s.osnap.perpendicular) {
        const p = closest(pts(ellipseRoots(el, (t) => dot3(rel(t), der(t)))))
        if (p) addObj(p, 'perpendicular', e.d)
      }
      if (s.osnap.tangent) {
        const n = el.normal ?? [0, 0, 1]
        const tan = (t: number): number => {
          const r = rel(t)
          const d = der(t)
          return dot3([r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]], n)
        }
        const p = closest(pts(ellipseRoots(el, tan)))
        if (p) addObj(p, 'tangent', e.d)
      }
    }

    /** GCEN de un contorno cerrado: nivel 1 sobre el centroide, nivel 2 desde el borde. */
    const geometricCenter = (c: Vec3 | null, segs: [Pt, Pt][]): void => {
      if (!c || !s.osnap.geometricCenter) return
      const g = fromVec3(c)
      add(g, 'geometricCenter')
      let d = Infinity
      for (const [a, b] of segs) {
        const np = nearestOnSegmentScreen(s.cursorPx, a, b, s.project)
        if (np) d = Math.min(d, pxDist(np))
      }
      addObj(g, 'geometricCenter', d)
    }

    const wantInt = s.osnap.intersection || s.osnap.apparentIntersection
    /** Segmentos cercanos con su entidad y si ésta tiene curva analítica (su INT real va por `nearCurves`). */
    const nearSegs: Array<{ a: Pt; b: Pt; owner: number; exact: boolean }> = []
    const nearCurves: Array<{ curve: Curve; z: number; self: boolean }> = []
    entities.forEach((e, idx) => {
      owner = e.id
      // En sólidos/mallas facetadas, los bordes curvos se muestrean: NO generar midpoint/perp
      // (serían ruido de facetado que confunde quadrant/tangent). Sí endpoint (esquinas) y nearest.
      const faceted = e.type === 'SOLID3D' || e.type === 'MESH3D'
      const bulged = e.type === 'POLYLINE' && hasBulges(e.props)
      // Curvas **muestreadas**: sus segmentos son una aproximación, así que no generan midpoint ni
      // perpendicular desde la tesselación. Los verdaderos se agregan aparte, más abajo.
      const sampled = faceted || e.type === 'ARC' || bulged
      const smooth = e.type === 'CIRCLE' || e.type === 'ELLIPSE'
      const perSegPerp = !sampled && !smooth && e.type !== 'SPLINE'
      for (const v of endpointsOfEntity(e)) add(v, 'endpoint')

      const segs: [Pt, Pt][] =
        e.type === 'CIRCLE'
          ? toSegs(tessellateArc(fullCircle(e.props), CIRCLE_SAMPLES).map(fromVec3))
          : e.type === 'ELLIPSE'
            ? toSegs(ellipsePoints(e.props, CIRCLE_SAMPLES, true).map(fromVec3))
            : segmentsOfEntity(e)
      const fc0 = wantInt ? flatCurve(e) : null
      const fc = fc0 && fc0.curve.n <= MAX_CURVE_PRIMS ? fc0 : null
      const segStart = nearSegs.length
      let near = false
      for (const [a, b] of segs) {
        if (!sampled && !smooth) add(mid(a, b), 'midpoint')
        const np = nearestOnSegmentScreen(s.cursorPx, a, b, s.project)
        if (!np) continue
        const d = pxDist(np)
        // Nearest: en círculos/arcos lo da la proyección radial exacta (ver `round`).
        if (e.type !== 'CIRCLE' && e.type !== 'ARC' && e.type !== 'ELLIPSE') addNearest(np)
        if (d <= 4 * thr) {
          near = true
          if (wantInt && nearSegs.length < MAX_INTERSECT_SEGS) nearSegs.push({ a, b, owner: idx, exact: fc !== null })
        }
        if (s.osnap.perpendicular && s.base && perSegPerp) addObj(perpFoot(s.base, a, b), 'perpendicular', d)
        else if (s.osnap.perpendicular && !s.base && perSegPerp) {
          addObj(np, 'perpendicular', d, { kind: 'perpendicular', obj: { kind: 'line', a: toVec3(a), b: toVec3(b) } })
        }
      }
      if (near && fc && s.osnap.intersection && nearCurves.length < MAX_INTERSECT_CURVES) {
        nearCurves.push({ ...fc, self: e.type === 'POLYLINE' || e.type === 'SPLINE' })
      } else {
        for (let k = segStart; k < nearSegs.length; k++) nearSegs[k].exact = false // sin curva: va por segmentos
      }

      if (e.type === 'SPLINE') for (const cp of e.props.controlPoints) add(fromVec3(cp), 'node')

      if (e.type === 'POLYLINE') {
        const p = e.props
        if (bulged) {
          // Puntos medios reales de los tramos (el del arco, no el de la cuerda) y, por tramo, PER en
          // los rectos y CEN/QUA/PER/TAN en los curvos.
          for (const m of polylineMidpoints(p)) add(fromVec3(m), 'midpoint')
          for (const [i, j] of polylineSpans(p)) {
            const a = fromVec3(p.vertices[i])
            const b = fromVec3(p.vertices[j])
            const arc = bulgeArc(p.vertices[i], p.vertices[j], bulgeAt(p, i), p.normal)
            if (arc) round(arc, false)
            else if (s.osnap.perpendicular && s.base) {
              const np = nearestOnSegmentScreen(s.cursorPx, a, b, s.project)
              if (np) addObj(perpFoot(s.base, a, b), 'perpendicular', pxDist(np))
            }
          }
        }
        geometricCenter(polylineCentroid(p), segs)
      }
      if (e.type === 'RECTANGLE') {
        const [x, y, z] = e.props.corner
        geometricCenter([x + e.props.width / 2, y + e.props.height / 2, z], segs)
      }

      if (e.type === 'SOLID3D') {
        for (const c of solidCenters(e.props)) add(fromVec3(c), 'center') // centros de cilindro/cono/esfera
        for (const q of solidQuadrants(e.props)) add(fromVec3(q), 'quadrant') // cuadrantes de bordes curvos
        // Centros de los empalmes: sólo con CEN tipeado (por defecto, los puntos de tangencia ya son extremos).
        if (s.explicitOsnap) for (const c of solidArcCenters(e.props)) add(fromVec3(c), 'center')
      }

      if (e.type === 'CIRCLE') round(fullCircle(e.props), true)
      else if (e.type === 'ARC') {
        round(e.props, true)
        add(fromVec3(arcMidpoint(e.props)), 'midpoint')
      } else if (e.type === 'ELLIPSE') ellipse(e.props)
    })

    owner = undefined // las intersecciones son de dos objetos
    // INT exacto entre curvas planas cercanas; el resto, por segmentos en 3D.
    if (s.osnap.intersection) {
      for (let i = 0; i < nearCurves.length; i++) {
        const ci = nearCurves[i]
        if (ci.self) for (const [ta] of selfIntersections(ci.curve)) add(fromVec3(ci.curve.pointAt(ta)), 'intersection')
        for (let j = i + 1; j < nearCurves.length; j++) {
          const cj = nearCurves[j]
          if (Math.abs(ci.z - cj.z) > 1e-9) continue
          for (const h of intersectCurves(ci.curve, cj.curve)) add(fromVec3(h.point), 'intersection')
        }
      }
    }
    if (wantInt) {
      const realVerts = new Map<number, Pt[]>()
      const facetJoint = (owner: number, p: Pt): boolean => {
        const e = entities[owner]
        if (e?.type !== 'SOLID3D') return false
        let vs = realVerts.get(owner)
        if (!vs) realVerts.set(owner, (vs = solidVertices(e.props).map(fromVec3)))
        const tol = 1e-6 * (1 + Math.hypot(p.x, p.y, p.z))
        return !vs.some((q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < Math.max(tol, 1e-4))
      }
      for (let i = 0; i < nearSegs.length; i++) {
        for (let j = i + 1; j < nearSegs.length; j++) {
          const { a: a1, b: b1, owner: o1, exact: x1 } = nearSegs[i]
          const { a: a2, b: b2, owner: o2, exact: x2 } = nearSegs[j]
          // Entre dos curvas analíticas (o dentro de una), el INT exacto ya está calculado arriba.
          if (s.osnap.intersection && !(x1 && x2) && !(o1 === o2 && x1)) {
            const ip = segIntersect3D(a1, b1, a2, b2)
            // En un sólido, dos tramos de una misma arista curva (el facetado de un empalme o de un cilindro) se tocan
            // en cada vértice del facetado: eso no es una intersección. Las esquinas reales sí lo son.
            if (ip && !(o1 === o2 && facetJoint(o1, ip))) add(ip, 'intersection')
          }
          // Apparent intersection: se cruzan EN PANTALLA aunque no se toquen en el espacio.
          if (s.osnap.apparentIntersection) {
            const ap = apparentIntersection(a1, b1, a2, b2, s)
            if (ap && !(o1 === o2 && facetJoint(o1, ap))) add(ap, 'apparentIntersection')
          }
        }
      }
    }

    const best = pick(cands)
    if (best) return { point: best.point, type: best.type, ...(best.deferred ? { deferred: best.deferred } : {}), ...(best.owner ? { owner: best.owner } : {}) }
  }

  if (s.gridSnap) {
    const u = worldToUcs(cursor, s.ucs)
    const gx = Math.round(u.x / s.gridStep) * s.gridStep
    const gy = Math.round(u.y / s.gridStep) * s.gridStep
    return { point: ucsToWorld(pt(gx, gy, 0), s.ucs), type: 'grid' }
  }

  return { point: cursor, type: null }
}
