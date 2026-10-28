import coordinates from './docs/coordinates.md?raw'
import selection from './docs/selection.md?raw'
import draw2d from './docs/draw-2d.md?raw'
import modify2d from './docs/modify-2d.md?raw'
import annotate from './docs/annotate.md?raw'
import properties from './docs/properties.md?raw'
import solids3d from './docs/solids-3d.md?raw'
import layouts from './docs/layouts.md?raw'
import blocksGroups from './docs/blocks-groups.md?raw'
import inquiry from './docs/inquiry.md?raw'

/** Guías que el agente lee con `read_doc` (cada una chica y de un solo tema). */
export const GUIDES: Record<string, string> = {
  coordinates,
  selection,
  'draw-2d': draw2d,
  'modify-2d': modify2d,
  annotate,
  properties,
  'solids-3d': solids3d,
  layouts,
  'blocks-groups': blocksGroups,
  inquiry,
}
