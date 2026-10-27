import type { Command, CommandContext, PointResult } from '../types'
import type { Pt, Vec3 } from '../../math'
import { fromVec3 } from '../../math'
import type { EdgeBlendProps, EdgeRef, Entity, SolidProps } from '../../document/types'
import type { PreviewShape } from '../../preview'
import { selectableEntities } from '../selectionSets'
import { closestOnSegment, vadd, vdist, vdot, vnorm, vscale, vsub } from '../../geom/vec3'
import {
  edgeChain,
  edgeLoop,
  edgeMidpoint,
  edgeSegments,
  nearestEdge,
  pickClosest,
  rayEdge,
  solidTopology,
  type TopoEdge,
  type Topology,
} from '../../editing/topology'
import { askNumber, fmt } from '../ask'
import { sysvars } from '../sysvars'

type Solid = Extract<Entity, { type: 'SOLID3D' }>
type Mode = 'Edge' | 'Chain' | 'Loop'

/** Lo que distingue a FILLETEDGE de CHAMFEREDGE dentro del diálogo común. */
export interface EdgeTool {
  noun: 'fillet' | 'chamfer'
  status(): string
  /** Modos de selección ofrecidos (CHAMFEREDGE no tiene Chain). */
  modes: Mode[]
  /** Opción de ajuste (Radius / Distance). */
  setting: string
  /** Pide el ajuste; false = ESC. */
  ask(ctx: CommandContext): Promise<boolean>
  /** ¿Guarda la cara de referencia de cada arista (chaflán asimétrico)? */
  withBase: boolean
  node(solid: SolidProps, edges: EdgeRef[]): EdgeBlendProps
}

interface EdgeHit {
  solid: Solid
  topo: Topology
  edge: number
  /** Dirección hacia el observador: elige la cara de referencia y el primer lazo. */
  toViewer: Vec3
  score: number
}

const DONE = 'Done'
const isSolid = (e: Entity): e is Solid => e.type === 'SOLID3D'
const vec = (p: Pt): Vec3 => [p.x, p.y, p.z]
const positive = (v: number): string | null => (v > 0 ? null : 'Requires a positive value.')
const PROMPTS: Record<Mode, string> = { Edge: 'Select an edge', Chain: 'Select edge chain', Loop: 'Select edge loop' }

/**
 * Arista de un sólido bajo el punto: con `ray` usa el rayo de la vista (click/cursor) y elige la más
 * cercana al cursor (en los estilos sombreados, sólo las visibles); sin él (coordenada tecleada) la
 * más cercana en 3D.
 */
function pickEdge(ctx: CommandContext, p: Pt, ray: boolean): EdgeHit | null {
  const r = ray ? (ctx.app.viewRay?.(p) ?? null) : null
  const toViewer: Vec3 = r ? vscale(r.dir, -1) : (ctx.app.facingNormal?.() ?? ctx.app.constructionNormal())
  const wire = ctx.app.visualStyle().endsWith('wireframe')
  const hits: (EdgeHit & { dist: number; t: number })[] = []
  for (const solid of selectableEntities(ctx.doc).filter(isSolid)) {
    const topo = solidTopology(solid.props)
    if (!topo) continue
    if (r) {
      const hit = rayEdge(topo, r.origin, r.dir, r.tol, wire)
      if (hit) hits.push({ solid, topo, edge: hit.edge, toViewer, score: hit.t, dist: hit.dist, t: hit.t })
      continue
    }
    const hit = nearestEdge(topo, vec(p), topo.diag * 0.05)
    if (hit) hits.push({ solid, topo, edge: hit.edge, toViewer, score: hit.dist, dist: hit.dist, t: 0 })
  }
  return pickClosest(hits, r?.tol ?? 0)
}

/** Normales de las dos caras en el tramo de la arista más cercano a `p`. */
function normalsAt(e: TopoEdge, p: Vec3): [Vec3, Vec3] {
  let k = 0
  let bd = Infinity
  edgeSegments(e).forEach(([i, j], s) => {
    const d = vdist(closestOnSegment(p, e.pts[i], e.pts[j]).point, p)
    if (d < bd) [bd, k] = [d, s]
  })
  return [e.n1[k], e.n2[k]]
}

/** Cara de la arista que mira más hacia el observador (cara de referencia del chaflán). */
function viewerFace(e: TopoEdge, toViewer: Vec3): number {
  const [n1, n2] = normalsAt(e, edgeMidpoint(e))
  return vdot(n1, toViewer) >= vdot(n2, toViewer) ? e.faces[0] : e.faces[1]
}

/**
 * Referencia persistente de la arista: su punto medio y, si `face` no es null, un punto apenas
 * adentro de esa cara (la de referencia: Distance1 se mide sobre ella).
 */
function edgeRef(topo: Topology, i: number, face: number | null): EdgeRef {
  const e = topo.edges[i]
  const at = edgeMidpoint(e)
  if (face === null) return { at }
  const [n1, n2] = normalsAt(e, at)
  const [nb, no] = face === e.faces[0] ? [n1, n2] : [n2, n1]
  // Dirección sobre la cara de referencia que se aleja de la arista (como `u1` del perfil).
  const u = vnorm(vscale(vsub(no, vscale(nb, vdot(nb, no))), e.convex ? -1 : 1))
  return { at, base: vadd(at, vscale(u, topo.diag * 1e-3)) }
}

/** Aristas resaltadas como polilíneas (preview). */
function highlight(topo: Topology | null, edges: Iterable<number>): PreviewShape[] {
  const out: PreviewShape[] = []
  if (!topo) return out
  for (const i of edges) {
    const e = topo.edges[i]
    out.push({ kind: 'polyline', points: (e.closed ? [...e.pts, e.pts[0]] : e.pts).map(fromVec3) })
  }
  return out
}

/** Preview de la selección: aristas elegidas + la que está bajo el cursor (o su cadena). */
function hover(ctx: CommandContext, solid: Solid | null, picked: Map<number, number>, mode: Mode, cursor: Pt): PreviewShape[] {
  const shapes = solid ? highlight(solidTopology(solid.props), picked.keys()) : []
  const hit = pickEdge(ctx, cursor, true)
  if (hit && (!solid || hit.solid === solid)) {
    shapes.push(...highlight(hit.topo, mode === 'Chain' ? edgeChain(hit.topo, hit.edge) : [hit.edge]))
  }
  return shapes
}

/** Opción Loop: lazo de una de las dos caras de la arista, con Accept/Next. null = ESC. */
async function chooseLoop(ctx: CommandContext, hit: EdgeHit): Promise<{ edges: number[]; face: number } | null> {
  const e = hit.topo.edges[hit.edge]
  let face = viewerFace(e, hit.toViewer)
  for (;;) {
    const edges = edgeLoop(hit.topo, hit.edge, face)
    const r = await ctx.getPoint('Enter an option [Accept/Next] <Accept>: ', {
      keywords: ['Accept', 'Next'],
      enterKeyword: 'Accept',
      preview: () => highlight(hit.topo, edges),
    })
    if (r.kind === 'cancel') return null
    if (r.kind === 'keyword' && r.keyword === 'Next') {
      face = face === e.faces[0] ? e.faces[1] : e.faces[0]
      continue
    }
    return { edges, face }
  }
}

/** Fase de selección. Devuelve el sólido y sus aristas (→ cara de referencia), o null si se cancela. */
async function selectEdges(
  ctx: CommandContext,
  tool: EdgeTool,
  first?: PointResult,
): Promise<{ solid: Solid; picked: Map<number, number> } | null> {
  let solid: Solid | null = null
  const picked = new Map<number, number>()
  let mode: Mode = 'Edge'
  let next = first
  for (;;) {
    const opts = [...tool.modes.filter((m) => m !== mode), tool.setting]
    const r =
      next ??
      (await ctx.getPoint(`${PROMPTS[mode]} or [${opts.join('/')}]: `, {
        keywords: opts,
        enterKeyword: DONE,
        preview: (c) => hover(ctx, solid, picked, mode, c),
      }))
    next = undefined
    if (r.kind === 'cancel') return null
    if (r.kind === 'keyword') {
      if (r.keyword === DONE) return solid && picked.size ? { solid, picked } : null
      if (r.keyword === tool.setting) {
        if (!(await tool.ask(ctx))) return null
      } else mode = r.keyword as Mode
      continue
    }
    const hit = pickEdge(ctx, r.pick?.raw ?? r.point, !!r.pick)
    if (!hit) {
      ctx.print('No edge found.')
      continue
    }
    if (solid && hit.solid !== solid) {
      ctx.print('Edges must belong to the same solid.')
      continue
    }
    solid = hit.solid
    const loop = mode === 'Loop' ? await chooseLoop(ctx, hit) : null
    if (mode === 'Loop' && !loop) return null
    const edges = loop?.edges ?? (mode === 'Chain' ? edgeChain(hit.topo, hit.edge) : [hit.edge])
    for (const i of edges) if (!picked.has(i)) picked.set(i, loop?.face ?? viewerFace(hit.topo.edges[i], hit.toViewer))
  }
}

/**
 * Diálogo común de FILLETEDGE y CHAMFEREDGE: selección de aristas de un sólido (Chain/Loop), y
 * aceptación con el resultado aplicado en vivo (cambiar el ajuste lo recalcula). `first` es el pick
 * que trae FILLET/CHAMFER al redirigir sobre un sólido.
 */
export async function runEdgeBlend(ctx: CommandContext, tool: EdgeTool, first?: PointResult): Promise<void> {
  ctx.app.clearSelection()
  ctx.print(tool.status())
  const sel = await selectEdges(ctx, tool, first)
  if (!sel) return
  const { solid, picked } = sel
  ctx.print(`${picked.size} edge(s) selected for ${tool.noun}.`)
  const original = solid.props
  const topo = solidTopology(original) as Topology
  const refs = [...picked].map(([i, face]) => edgeRef(topo, i, tool.withBase ? face : null))
  const apply = (props: SolidProps): void => {
    solid.props = props
    ctx.doc.touch()
  }
  apply(tool.node(original, refs))
  for (;;) {
    const r = await ctx.getPoint(`Press Enter to accept the ${tool.noun} or [${tool.setting}]: `, {
      keywords: [tool.setting],
      enterKeyword: 'Accept',
    })
    if (r.kind === 'keyword' && r.keyword === 'Accept') return
    if (r.kind === 'cancel' || (r.kind === 'keyword' && !(await tool.ask(ctx)))) {
      apply(original)
      return
    }
    if (r.kind === 'keyword') apply(tool.node(original, refs))
  }
}

// --- FILLETEDGE ----------------------------------------------------------------------------------

async function askEdgeRadius(ctx: CommandContext): Promise<boolean> {
  const r = await askNumber(ctx, `Enter fillet radius <${fmt(sysvars.FILLETRAD)}>: `, { def: sysvars.FILLETRAD, check: positive })
  if (r?.kind === 'number') sysvars.FILLETRAD = r.value
  return !!r
}

export const FILLETEDGE_TOOL: EdgeTool = {
  noun: 'fillet',
  status: () => `Radius = ${fmt(sysvars.FILLETRAD)}`,
  modes: ['Edge', 'Chain', 'Loop'],
  setting: 'Radius',
  ask: askEdgeRadius,
  withBase: false,
  node: (solid, edges) => ({ op: 'FILLETEDGE', solid, edges, radius: sysvars.FILLETRAD }),
}

/** FILLETEDGE: redondea aristas de un sólido con radio FILLETRAD (nodo paramétrico). */
export const filletEdgeCommand: Command = {
  name: 'FILLETEDGE',
  aliases: [],
  description: 'Round and fillet the edges of solid objects',
  run: (ctx) => runEdgeBlend(ctx, FILLETEDGE_TOOL),
}

// --- CHAMFEREDGE ---------------------------------------------------------------------------------

async function askEdgeDistances(ctx: CommandContext): Promise<boolean> {
  const a = await askNumber(ctx, `Specify Distance1 <${fmt(sysvars.CHAMFERA)}>: `, { def: sysvars.CHAMFERA, check: positive })
  if (a?.kind !== 'number') return false
  const b = await askNumber(ctx, `Specify Distance2 <${fmt(sysvars.CHAMFERB)}>: `, { def: sysvars.CHAMFERB, check: positive })
  if (b?.kind !== 'number') return false
  ;[sysvars.CHAMFERA, sysvars.CHAMFERB] = [a.value, b.value]
  return true
}

export const CHAMFEREDGE_TOOL: EdgeTool = {
  noun: 'chamfer',
  status: () => `Distance1 = ${fmt(sysvars.CHAMFERA)}, Distance2 = ${fmt(sysvars.CHAMFERB)}`,
  modes: ['Edge', 'Loop'],
  setting: 'Distance',
  ask: askEdgeDistances,
  withBase: true,
  node: (solid, edges) => ({ op: 'CHAMFEREDGE', solid, edges, d1: sysvars.CHAMFERA, d2: sysvars.CHAMFERB }),
}

/**
 * CHAMFEREDGE: bisela aristas de un sólido; Distance1 (CHAMFERA) se mide sobre la cara de
 * referencia (la que mira al observador, o la cara del lazo) y Distance2 (CHAMFERB) sobre la otra.
 */
export const chamferEdgeCommand: Command = {
  name: 'CHAMFEREDGE',
  aliases: [],
  description: 'Bevel the edges of solid objects',
  run: (ctx) => runEdgeBlend(ctx, CHAMFEREDGE_TOOL),
}
