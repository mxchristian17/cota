import type { AppHooks } from '../core/commands/types'
import type { DocumentModel } from '../core/document/DocumentModel'
import type { SolidProps } from '../core/document/types'
import { flatshotItems } from '../core/projection/flatshot'
import { solidCircleHints, type Mesh, type ProjBasis } from '../core/projection/orthographic'
import type { Vec3 } from '../core/math'
import { solidMeshWithSurfaces } from '../render/csg'
import { LayerService } from '../core/layers/LayerService'

/**
 * Hooks de proyección reales (los mismos cálculos que la app) para tests de vistas de dibujo: VIEWBASE, HATCH o
 * AUTODIM sobre la geometría proyectada de sólidos de verdad. `doc()` da el documento del harness.
 */
export function solidViewHooks(doc: () => DocumentModel): Partial<AppHooks> {
  const solids = (ids: string[] | null): SolidProps[] => {
    const pick = ids ? new Set(ids) : null
    return doc().modelEntities.flatMap((e) => (e.type === 'SOLID3D' && (!pick || pick.has(e.id)) ? [e.props] : []))
  }
  const meshes = (ids: string[] | null): Mesh[] => solids(ids).map((p) => solidMeshWithSurfaces(p))
  return {
    projectModel: (ids: string[] | null, basis: ProjBasis, opts: { showObscured: boolean; tangential: boolean }) => {
      const ms = meshes(ids)
      return ms.length ? flatshotItems(ms, solids(ids).flatMap(solidCircleHints), basis, opts) : []
    },
    viewAnchor: (ids: string[] | null): Vec3 | null => {
      const lo = [Infinity, Infinity, Infinity]
      const hi = [-Infinity, -Infinity, -Infinity]
      for (const m of meshes(ids)) for (const v of m.vertices) for (let k = 0; k < 3; k++) [lo[k], hi[k]] = [Math.min(lo[k], v[k]), Math.max(hi[k], v[k])]
      return isFinite(lo[0]) ? [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] : null
    },
    ensureLayer: (name: string, lineType?: string) => {
      const d = doc()
      return d.layers.find((l) => l.name === name)?.id ?? new LayerService(d).create(name, lineType ? { lineType } : {}).id
    },
  }
}
