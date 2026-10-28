import { DocumentModel } from '../core/document/DocumentModel'
import type { Entity, EntityInput } from '../core/document/types'
import { CommandEngine } from '../core/commands/CommandEngine'
import { registerDefaultCommands } from '../core/commands/registry'
import type { AppHooks } from '../core/commands/types'
import { WORLD_UCS, type Ucs } from '../core/ucs'
import { resetMemory } from '../core/commands/memory'
import { resetDimSession } from '../core/commands/impl/dim'
import { resetMatchSettings } from '../core/commands/impl/matchprop'
import type { ViewName, VisualStyle } from '../core/view'
import type { Vec3 } from '../core/math'
import { solidMesh } from '../render/csg'

/**
 * Motor de comandos con un documento vacío y hooks de app inertes, para tests de comandos
 *. `run` tipea entradas en la línea de comandos; `click` simula un click en el viewport
 * sobre una entidad (con Shift opcional).
 */
export function makeEngine() {
  resetMemory() // cada harness es una sesión nueva: sin valores recordados
  resetDimSession()
  resetMatchSettings()
  const doc = DocumentModel.createDefault()
  const prints: string[] = []
  let selection: string[] = []
  let style: VisualStyle = '2dwireframe'
  let clayer = '0'
  /** Normal de la vista hacia el observador (undefined = planta, cae en `constructionNormal`). */
  let facing: Vec3 | undefined
  const views: ViewName[] = []
  let ucs: Ucs = { ...WORLD_UCS }
  let ucsName: string | null = 'World'
  const history: Ucs[] = []
  const plans: Ucs[] = []
  let viewAxes: { right: Vec3; up: Vec3 } = { right: [1, 0, 0], up: [0, 1, 0] }
  /** Llamadas a los hooks de navegación: nombre y argumentos. */
  const calls: Array<[string, unknown[]]> = []
  const VIEW = { target: [50, 25, 0] as Vec3, az: -Math.PI / 2, el: Math.PI / 2, radius: 100, mode: 'ortho' as const }
  const NAV: Record<string, (...a: unknown[]) => unknown> = {
    zoomPrevious: () => true,
    viewHeight: () => 100,
    viewRect: () => ({ center: VIEW.target, right: [1, 0, 0], up: [0, 1, 0], width: 200, height: 100 }),
    getViewState: () => VIEW,
    windowViewState: () => ({ ...VIEW, radius: 10 }),
    extentsBox: () => ({ min: [0, 0, 0], max: [100, 50, 0] }),
    isPlanView: () => true,
  }
  const app = new Proxy({} as AppHooks, {
    get: (_t, k) => {
      if (k === 'clearSelection') return () => (selection = [])
      if (k === 'preselection') return () => [...selection]
      if (k === 'visualStyle') return () => style
      if (k === 'setVisualStyle') return (m: VisualStyle) => (style = m)
      if (k === 'constructionNormal') return () => [0, 0, 1]
      if (k === 'setCurrentLayer') return (id: string) => (clayer = id)
      if (k === 'facingNormal') return () => facing
      if (k === 'setUcs')
        return (u: Ucs, name?: string) => {
          history.push(ucs)
          ucs = u
          ucsName = name ?? null
        }
      if (k === 'getUcs') return () => ucs
      if (k === 'solidMesh') return (e: Entity) => (e.type === 'SOLID3D' ? solidMesh(e.props) : e.type === 'MESH3D' ? e.props : null)
      if (k === 'ucsName') return () => ucsName
      if (k === 'previousUcs')
        return () => {
          const u = history.pop()
          if (u) ucs = u
          return u ?? null
        }
      if (k === 'viewAxes') return () => viewAxes
      if (k === 'planView') return (u: Ucs) => plans.push(u)
      if (k === 'setView') return (v: ViewName) => views.push(v)
      if (typeof k === 'string' && /^(zoom|pan|realtime|restoreViewState|viewHeight|viewRect|getViewState|windowViewState|extentsBox|isPlanView)/.test(k))
        return (...a: unknown[]) => {
          calls.push([k, a])
          return NAV[k]?.(...a)
        }
      return () => undefined
    },
  })
  const engine = new CommandEngine({
    doc,
    currentLayerId: () => clayer,
    isOrtho: () => false,
    currentCursor: () => ({ x: 0, y: 0, z: 0 }),
    currentUcs: () => ucs,
    currentSelection: () => selection,
    onSelectionChange: (ids) => (selection = ids),
    app,
    onPrompt: () => {},
    onPrint: (l) => prints.push(l),
    onChange: () => {},
    onOpenHelp: () => {},
    onBeforeCommand: () => {},
    onAfterCommand: () => {},
  })
  registerDefaultCommands(engine)
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
  return {
    doc,
    engine,
    prints,
    async run(...inputs: string[]): Promise<void> {
      for (const s of inputs) {
        engine.submitText(s)
        await flush()
      }
    },
    async click(x: number, y: number, id: string | null = null, shift = false): Promise<void> {
      engine.submitClick({ x, y, z: 0 }, id, false, shift)
      await flush()
    },
    /** Clic con la UCS dinámica: el viewport detectó una cara plana con esa UCS. */
    async clickFace(x: number, y: number, z: number, face: Ucs): Promise<void> {
      engine.submitClick({ x, y, z }, null, false, false, undefined, undefined, face)
      await new Promise((r) => setTimeout(r, 20))
    },
    /** Clic en un punto 3D del mundo (p. ej. sobre el plano de la UCS Front). */
    async click3(x: number, y: number, z: number, id: string | null = null): Promise<void> {
      engine.submitClick({ x, y, z }, id, false, false)
      await flush()
    },
    add(type: string, props: object, layer = '0'): Entity {
      return doc.addEntity({ type, layer, props } as unknown as EntityInput)
    },
    ofType(type: string): Entity[] {
      return doc.entities.filter((e) => e.type === type)
    },
    setSelection(ids: string[]): void {
      selection = ids
    },
    style: (): VisualStyle => style,
    currentLayer: (): string => clayer,
    /** Simula la vista activa por su normal hacia el observador (FRONT = [0, -1, 0]). */
    setFacing(n: Vec3 | undefined): void {
      facing = n
    },
    views,
    calls,
    ucs: (): Ucs => ucs,
    plans,
    setViewAxes(right: Vec3, up: Vec3): void {
      viewAxes = { right, up }
    },
    setUcs(u: Ucs): void {
      ucs = u
    },
  }
}
