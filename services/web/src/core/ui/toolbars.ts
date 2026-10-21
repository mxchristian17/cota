import { DEFAULT_TOOLBAR, type ToolbarSide, type ToolbarState, type ToolbarStates } from './toolbar'

/**
 * Barras de herramientas clásicas: datos puros (sin React) para la UI, los comandos TOOLBAR/-TOOLBAR y los
 * tests. Cada botón ejecuta un comando con sus respuestas, como las macros de botón de los CAD de escritorio
 * (`^C^C_zoom _w`): cancela el comando en curso y teclea los pasos. Los botones de referencia a objetos son
 * transparentes: entran en el prompt del comando en curso.
 *
 * Sólo hay botones de comandos que existen; `toolbars.test.ts` lo verifica.
 */

/** Listas desplegables de las barras. */
export type ToolbarCombo = 'layer' | 'linetype' | 'dimstyle'

export type ToolbarItem =
  | {
      kind: 'cmd'
      /** Clave del ícono (`ui/icons.tsx`). */
      icon: string
      label: string
      /** Comando y sus respuestas, como si se tecleara cada uno seguido de Enter. */
      run: string[]
      /** Referencia a objetos de un solo uso: se teclea dentro del comando en curso. */
      transparent?: boolean
    }
  | { kind: 'sep' }
  | { kind: 'combo'; combo: ToolbarCombo }

export interface ToolbarDef {
  id: string
  name: string
  /** Borde donde aparece la primera vez que se muestra. */
  side: ToolbarSide
  items: ToolbarItem[]
}

const b = (icon: string, label: string, ...run: string[]): ToolbarItem => ({ kind: 'cmd', icon, label, run })
const snap = (icon: string, label: string, key: string): ToolbarItem => ({ kind: 'cmd', icon, label, run: [key], transparent: true })
const SEP: ToolbarItem = { kind: 'sep' }
const combo = (c: ToolbarCombo): ToolbarItem => ({ kind: 'combo', combo: c })

export const TOOLBARS: ToolbarDef[] = [
  {
    id: 'dimension',
    name: 'Dimension',
    side: 'left',
    items: [
      b('dim', 'Smart dimension', 'DIM'),
      b('qdim', 'Quick dimension', 'QDIM'),
      b('autodim', 'Automatic dimensioning', 'AUTODIM'),
      SEP,
      b('dimlinear', 'Linear', 'DIMLINEAR'),
      b('dimaligned', 'Aligned', 'DIMALIGNED'),
      b('dimarc', 'Arc length', 'DIMARC'),
      b('dimordinate', 'Ordinate', 'DIMORDINATE'),
      SEP,
      b('dimradius', 'Radius', 'DIMRADIUS'),
      b('dimjogged', 'Jogged radius', 'DIMJOGGED'),
      b('dimdiameter', 'Diameter', 'DIMDIAMETER'),
      b('dimangular', 'Angular', 'DIMANGULAR'),
      SEP,
      b('dimbaseline', 'Baseline', 'DIMBASELINE'),
      b('dimcontinue', 'Continue', 'DIMCONTINUE'),
      b('dimspace', 'Dimension space', 'DIMSPACE'),
      b('dimbreak', 'Dimension break', 'DIMBREAK'),
      SEP,
      b('mleader', 'Multileader', 'MLEADER'),
      b('leader', 'Leader', 'LEADER'),
      b('dimcenter', 'Center mark', 'DIMCENTER'),
      b('centerline', 'Centerline', 'CENTERLINE'),
      b('diminspect', 'Inspection', 'DIMINSPECT'),
      b('dimjogline', 'Jogged linear', 'DIMJOGLINE'),
      SEP,
      b('dimedit', 'Dimension edit', 'DIMEDIT'),
      b('dimtedit', 'Dimension text edit', 'DIMTEDIT'),
      b('dimupdate', 'Dimension update', '-DIMSTYLE', 'A'),
      SEP,
      combo('dimstyle'),
      b('dimstyle', 'Dimension style', 'DIMSTYLE'),
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    side: 'top',
    items: [
      b('new', 'New', 'NEW'),
      b('open', 'Open', 'OPEN'),
      b('save', 'Save', 'SAVE'),
      b('plot', 'Plot', 'PLOT'),
      SEP,
      b('undo', 'Undo', 'UNDO'),
      b('redo', 'Redo', 'REDO'),
      SEP,
      b('matchprop', 'Match properties', 'MATCHPROP'),
      SEP,
      b('pan', 'Pan realtime', 'PAN'),
      b('zoom', 'Zoom realtime', 'ZOOM', ''),
      b('zoomwindow', 'Zoom window', 'ZOOM', 'W'),
      b('zoomprevious', 'Zoom previous', 'ZOOM', 'P'),
      SEP,
      b('properties', 'Properties', 'PROPERTIES'),
      b('help', 'Help', 'HELP'),
    ],
  },
  {
    id: 'styles',
    name: 'Styles',
    side: 'top',
    items: [combo('dimstyle'), b('dimstyle', 'Dimension style', 'DIMSTYLE'), SEP, b('mleaderstyle', 'Multileader style', 'MLEADERSTYLE')],
  },
  {
    id: 'layers',
    name: 'Layers',
    side: 'top',
    items: [b('layer', 'Layer properties manager', 'LAYER'), combo('layer'), b('laymcur', 'Make object’s layer current', 'LAYMCUR')],
  },
  {
    id: 'layers2',
    name: 'Layers II',
    side: 'top',
    items: [
      b('layiso', 'Layer isolate', 'LAYISO'),
      b('layuniso', 'Layer unisolate', 'LAYUNISO'),
      b('layoff', 'Layer off', 'LAYOFF'),
      b('layon', 'Turn all layers on', 'LAYON'),
      b('layfrz', 'Layer freeze', 'LAYFRZ'),
      b('laythw', 'Thaw all layers', 'LAYTHW'),
      b('laylck', 'Layer lock', 'LAYLCK'),
      b('layulk', 'Layer unlock', 'LAYULK'),
    ],
  },
  {
    id: 'properties',
    name: 'Properties',
    side: 'top',
    items: [combo('linetype'), b('linetype', 'Linetype manager', 'LINETYPE'), SEP, b('matchprop', 'Match properties', 'MATCHPROP'), b('properties', 'Properties', 'PROPERTIES')],
  },
  {
    id: 'draw',
    name: 'Draw',
    side: 'left',
    items: [
      b('line', 'Line', 'LINE'),
      b('pline', 'Polyline', 'PLINE'),
      b('polygon', 'Polygon', 'POLYGON'),
      b('rectangle', 'Rectangle', 'RECTANGLE'),
      b('arc', 'Arc', 'ARC'),
      b('circle', 'Circle', 'CIRCLE'),
      b('spline', 'Spline', 'SPLINE'),
      b('ellipse', 'Ellipse', 'ELLIPSE'),
      SEP,
      b('insert', 'Insert block', 'INSERT'),
      b('block', 'Make block', 'BLOCK'),
      SEP,
      b('hatch', 'Hatch', 'HATCH'),
      SEP,
      b('mtext', 'Multiline text', 'MTEXT'),
    ],
  },
  {
    id: 'modify',
    name: 'Modify',
    side: 'right',
    items: [
      b('erase', 'Erase', 'ERASE'),
      b('copy', 'Copy', 'COPY'),
      b('mirror', 'Mirror', 'MIRROR'),
      b('offset', 'Offset', 'OFFSET'),
      b('array', 'Array', 'ARRAY'),
      SEP,
      b('move', 'Move', 'MOVE'),
      b('rotate', 'Rotate', 'ROTATE'),
      b('scale', 'Scale', 'SCALE'),
      b('stretch', 'Stretch', 'STRETCH'),
      b('lengthen', 'Lengthen', 'LENGTHEN'),
      SEP,
      b('trim', 'Trim', 'TRIM'),
      b('extend', 'Extend', 'EXTEND'),
      b('breakatpoint', 'Break at point', 'BREAKATPOINT'),
      b('break', 'Break', 'BREAK'),
      b('join', 'Join', 'JOIN'),
      SEP,
      b('chamfer', 'Chamfer', 'CHAMFER'),
      b('fillet', 'Fillet', 'FILLET'),
      SEP,
      b('explode', 'Explode', 'EXPLODE'),
    ],
  },
  {
    id: 'modify2',
    name: 'Modify II',
    side: 'right',
    items: [
      b('pedit', 'Edit polyline', 'PEDIT'),
      b('hatchedit', 'Edit hatch', 'HATCHEDIT'),
      SEP,
      b('attedit', 'Edit attribute', 'ATTEDIT'),
      b('eattedit', 'Enhanced attribute editor', 'EATTEDIT'),
      b('attsync', 'Synchronize attributes', 'ATTSYNC'),
    ],
  },
  {
    id: 'osnap',
    name: 'Object Snap',
    side: 'right',
    items: [
      snap('snapend', 'Snap to endpoint', 'END'),
      snap('snapmid', 'Snap to midpoint', 'MID'),
      snap('snapint', 'Snap to intersection', 'INT'),
      snap('snapapp', 'Snap to apparent intersection', 'APP'),
      SEP,
      snap('snapcen', 'Snap to center', 'CEN'),
      snap('snapgce', 'Snap to geometric center', 'GCE'),
      snap('snapqua', 'Snap to quadrant', 'QUA'),
      snap('snaptan', 'Snap to tangent', 'TAN'),
      SEP,
      snap('snapper', 'Snap to perpendicular', 'PER'),
      snap('snapnod', 'Snap to node', 'NOD'),
      snap('snapnea', 'Snap to nearest', 'NEA'),
      SEP,
      b('osnap', 'Object snap settings', 'OSNAP'),
    ],
  },
  {
    id: 'ucs',
    name: 'UCS',
    side: 'top',
    items: [
      b('ucs', 'UCS', 'UCS'),
      b('ucsworld', 'World UCS', 'UCS', 'W'),
      b('ucsprevious', 'UCS previous', 'UCS', 'P'),
      b('ucsface', 'Face UCS', 'UCS', 'F'),
      b('ucsobject', 'Object UCS', 'UCS', 'OB'),
      b('ucsview', 'View UCS', 'UCS', 'V'),
      SEP,
      b('ucs3point', '3 Point UCS (origin, X axis, XY plane)', 'UCS'),
      b('ucszaxis', 'Z axis vector UCS', 'UCS', 'ZA'),
      b('ucsx', 'Rotate UCS about X', 'UCS', 'X'),
      b('ucsy', 'Rotate UCS about Y', 'UCS', 'Y'),
      b('ucsz', 'Rotate UCS about Z', 'UCS', 'Z'),
      SEP,
      b('ucsnamed', 'Named UCS', 'UCS', 'NA'),
    ],
  },
  {
    id: 'view',
    name: 'View',
    side: 'top',
    items: [
      b('views', 'Named views', 'VIEW'),
      SEP,
      b('viewtop', 'Top view', 'VIEW', 'TOP'),
      b('viewbottom', 'Bottom view', 'VIEW', 'BOTTOM'),
      b('viewleft', 'Left view', 'VIEW', 'LEFT'),
      b('viewright', 'Right view', 'VIEW', 'RIGHT'),
      b('viewfront', 'Front view', 'VIEW', 'FRONT'),
      b('viewback', 'Back view', 'VIEW', 'BACK'),
      SEP,
      b('viewswiso', 'SW isometric view', 'VIEW', 'SWISO'),
      b('viewseiso', 'SE isometric view', 'VIEW', 'SEISO'),
      b('viewneiso', 'NE isometric view', 'VIEW', 'NEISO'),
      b('viewnwiso', 'NW isometric view', 'VIEW', 'NWISO'),
    ],
  },
  {
    id: 'visualstyles',
    name: 'Visual Styles',
    side: 'top',
    items: [
      b('vs2d', '2D wireframe', 'VSCURRENT', '2Dwireframe'),
      b('vs3d', '3D wireframe', 'VSCURRENT', '3Dwireframe'),
      b('vshidden', 'Hidden', 'VSCURRENT', 'Hidden'),
      b('vsshaded', 'Shaded', 'VSCURRENT', 'Shaded'),
      b('vsedges', 'Shaded with edges', 'VSCURRENT', 'shadedEdges'),
    ],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    side: 'right',
    items: [
      b('zoomwindow', 'Zoom window', 'ZOOM', 'W'),
      b('zoomdynamic', 'Zoom dynamic', 'ZOOM', 'D'),
      b('zoomscale', 'Zoom scale', 'ZOOM', 'S'),
      b('zoomcenter', 'Zoom center', 'ZOOM', 'C'),
      b('zoomobject', 'Zoom object', 'ZOOM', 'O'),
      SEP,
      b('zoomin', 'Zoom in', 'ZOOM', '2X'),
      b('zoomout', 'Zoom out', 'ZOOM', '0.5X'),
      SEP,
      b('zoomall', 'Zoom all', 'ZOOM', 'A'),
      b('zoomextents', 'Zoom extents', 'ZOOM', 'E'),
      b('zoomprevious', 'Zoom previous', 'ZOOM', 'P'),
    ],
  },
  {
    id: 'viewports',
    name: 'Viewports',
    side: 'top',
    items: [
      b('vports', 'Viewports', 'VPORTS'),
      b('mview', 'Layout viewport', 'MVIEW'),
      b('vpclip', 'Clip viewport', 'VPCLIP'),
      SEP,
      b('vpmax', 'Maximize viewport', 'VPMAX'),
      b('vpmin', 'Minimize viewport', 'VPMIN'),
      b('vplayer', 'Viewport layer visibility', 'VPLAYER'),
    ],
  },
  {
    id: 'layouts',
    name: 'Layouts',
    side: 'top',
    items: [b('layoutnew', 'New layout', 'LAYOUT', 'N'), b('pagesetup', 'Page setup', 'PAGESETUP'), SEP, b('plot', 'Plot', 'PLOT'), b('publish', 'Publish', 'PUBLISH')],
  },
  {
    id: 'modeling',
    name: 'Modeling',
    side: 'left',
    items: [
      b('box', 'Box', 'BOX'),
      b('cylinder', 'Cylinder', 'CYLINDER'),
      b('cone', 'Cone', 'CONE'),
      b('sphere', 'Sphere', 'SPHERE'),
      b('torus', 'Torus', 'TORUS'),
      SEP,
      b('extrude', 'Extrude', 'EXTRUDE'),
      b('revolve', 'Revolve', 'REVOLVE'),
      SEP,
      b('align', 'Align', 'ALIGN'),
      b('flatshot', 'Flatshot', 'FLATSHOT'),
    ],
  },
  {
    id: 'solidediting',
    name: 'Solid Editing',
    side: 'left',
    items: [
      b('union', 'Union', 'UNION'),
      b('subtract', 'Subtract', 'SUBTRACT'),
      b('intersect', 'Intersect', 'INTERSECT'),
      SEP,
      b('filletedge', 'Fillet edges', 'FILLETEDGE'),
      b('chamferedge', 'Chamfer edges', 'CHAMFEREDGE'),
    ],
  },
  {
    id: 'text',
    name: 'Text',
    side: 'top',
    items: [b('text', 'Single line text', 'TEXT'), b('mtext', 'Multiline text', 'MTEXT'), SEP, b('field', 'Field', 'FIELD'), b('updatefield', 'Update fields', 'UPDATEFIELD')],
  },
  {
    id: 'multileader',
    name: 'Multileader',
    side: 'top',
    items: [
      b('mleader', 'Multileader', 'MLEADER'),
      b('mleaderedit', 'Add or remove leaders', 'MLEADEREDIT'),
      b('mleaderalign', 'Align multileaders', 'MLEADERALIGN'),
      SEP,
      b('mleaderstyle', 'Multileader style', 'MLEADERSTYLE'),
    ],
  },
  {
    id: 'insert',
    name: 'Insert',
    side: 'left',
    items: [b('insert', 'Insert block', 'INSERT'), b('block', 'Make block', 'BLOCK'), b('attdef', 'Define attributes', 'ATTDEF'), SEP, b('import', 'Import', 'IMPORT')],
  },
  {
    id: 'inquiry',
    name: 'Inquiry',
    side: 'top',
    items: [b('dist', 'Distance', 'DIST')],
  },
  {
    id: 'drawingviews',
    name: 'Drawing Views',
    side: 'top',
    items: [
      b('viewbase', 'Base view', 'VIEWBASE'),
      b('viewproj', 'Projected view', 'VIEWPROJ'),
      b('viewedit', 'Edit view', 'VIEWEDIT'),
      b('viewupdate', 'Update views', 'VIEWUPDATE'),
      b('viewstd', 'Drafting standard', 'VIEWSTD'),
      SEP,
      b('solprof', 'Solid profile', 'SOLPROF'),
      b('autodim', 'Automatic dimensioning', 'AUTODIM'),
    ],
  },
]

export const TOOLBAR_BY_ID: ReadonlyMap<string, ToolbarDef> = new Map(TOOLBARS.map((t) => [t.id, t]))

/**
 * Estado inicial de cada barra: Dimension visible a la izquierda; las demás ocultas, acopladas en su borde
 * (cuando se muestran aparecen ahí, después de las que ya estén).
 */
export const DEFAULT_TOOLBARS: ToolbarStates = Object.fromEntries(
  TOOLBARS.map((t, i): [string, ToolbarState] => [t.id, t.id === 'dimension' ? { ...DEFAULT_TOOLBAR } : { ...DEFAULT_TOOLBAR, visible: false, side: t.side, order: i }]),
)

/** Barra por su nombre tecleado (`Draw`, `layers ii`, `Object Snap`…) o su id; null si no existe. */
export function findToolbar(name: string): ToolbarDef | null {
  const key = name.trim().toLowerCase().replace(/[\s_-]+/g, '')
  return TOOLBARS.find((t) => t.id === key || t.name.toLowerCase().replace(/\s+/g, '') === key) ?? (key === 'dim' ? TOOLBAR_BY_ID.get('dimension') ?? null : null)
}

/** Texto del tooltip: nombre y comando (`Line (LINE)`, `Zoom window (ZOOM W)`). */
export const itemTitle = (it: Extract<ToolbarItem, { kind: 'cmd' }>): string =>
  `${it.label} (${it.run.filter((s) => s !== '').join(' ')})`
