/* Menús de la barra superior: datos puros, sin React, para la UI y los tests. */

/**
 * Barra de menús con todos los comandos, en el orden de la barra de menús del CAD clásico (Archivo, Edición, Vista,
 * Insertar, Formato, Herramientas, Dibujar, Acotar, Modificar, Ayuda). Cada ítem muestra su
 * **identificador de comando** (y alias), para que al elegir del menú el usuario aprenda el comando
 * equivalente. Al hacer clic ejecuta el comando como si se tecleara en la línea.
 *
 * En cada menú, `§Título` abre una sección y `@zoom`, `@views`, `@toolbars` insertan los submenús propios de
 * Vista. Los comandos que sólo fijan una variable de sistema no van en los menús (se escriben, como en
 * el CAD clásico); cualquier otro comando no listado cae en "Otros", así ninguno queda sin acceso.
 */
export const CATEGORIES: { label: string; names: string[] }[] = [
  {
    label: 'File',
    names: ['NEW', 'OPEN', 'OPENFOLDER', 'SAVE', 'CLOUD', '§Import / export', 'IMPORT', 'EXPORT', '§Print', 'PAGESETUP', 'PLOT', 'PUBLISH', '§Drawing', 'DWGPROPS', 'LOGIN'],
  },
  { label: 'Edit', names: ['UNDO', 'REDO', '§Clipboard', 'CUTCLIP', 'COPYCLIP', 'COPYBASE', 'PASTECLIP', 'PASTEORIG', '§Selection', 'SELECTALL', 'SELECT', 'SELECTSIMILAR', 'ERASE'] },
  {
    label: 'View',
    names: [
      'REDRAW', 'ZOOM', '@zoom', '§Pan', 'PAN', '-PAN', '§Orbit', '3DORBIT', '3DFORBIT', '3DCORBIT', '3DPAN', '3DZOOM', '§Views', 'VIEW', 'PLAN', 'PERSPECTIVE', 'ORTHOGRAPHIC', '@views',
      '§Viewports', 'VPORTS', 'MVIEW', 'MSPACE', 'PSPACE', 'VPMAX', 'VPMIN', 'VPCLIP', 'VPLAYER',
      '§Visual styles', 'VSCURRENT', 'SHADEMODE', '§Display', 'FULLSCREEN', 'CLEANSCREENON', 'CLEANSCREENOFF', 'COMMANDLINE', 'COMMANDLINEHIDE', 'NAVVCUBE', 'UCSICON', 'ATTDISP',
    ],
  },
  { label: 'Insert', names: ['INSERT', '§Layout', 'LAYOUT', '§Drawing views', 'VIEWBASE', 'VIEWGEN', 'VIEWPROJ', 'VIEWEDIT', 'VIEWUPDATE', 'VIEWSTD', '§Fields', 'FIELD', 'UPDATEFIELD'] },
  {
    label: 'Format',
    names: [
      'LAYER', '§Layer tools', 'LAYMCUR', 'LAYISO', 'LAYUNISO', 'LAYOFF', 'LAYON', 'LAYFRZ', 'LAYTHW', 'LAYLCK', 'LAYULK',
      '§Styles', 'LINETYPE', 'DIMSTYLE', 'MLEADERSTYLE', '§Drawing', 'LIMITS',
    ],
  },
  { label: 'Tools', names: ['@toolbars', 'TOOLBAR', 'OPTIONS', 'OSNAP', 'GRID', '§UCS', 'UCS', '§Inquiry', 'DIST', '§Other', 'PROMPT', 'ATTSYNC'] },
  {
    label: 'Draw',
    names: [
      'LINE', 'PLINE', 'POLYGON', 'RECTANGLE', 'ARC', 'CIRCLE', 'SPLINE', 'ELLIPSE', '§Block', 'BLOCK', 'ATTDEF',
      '§Hatch', 'HATCH', '§Text', 'TEXT', 'MTEXT',
      '§Modeling', 'BOX', 'CYLINDER', 'CONE', 'SPHERE', 'TORUS', 'EXTRUDE', 'REVOLVE', 'FLATSHOT', 'SOLPROF',
    ],
  },
  {
    label: 'Dimension',
    names: [
      'DIM', 'QDIM', 'AUTODIM', '§Linear', 'DIMLINEAR', 'DIMALIGNED', 'DIMARC', 'DIMORDINATE', '§Radial and angular', 'DIMRADIUS', 'DIMJOGGED',
      'DIMDIAMETER', 'DIMANGULAR', '§Baseline and continue', 'DIMBASELINE', 'DIMCONTINUE', 'DIMSPACE', 'DIMBREAK',
      '§Leaders and marks', 'MLEADER', 'QLEADER', 'LEADER', 'MLEADEREDIT', 'MLEADERALIGN', 'DIMCENTER', 'CENTERLINE', 'DIMINSPECT', 'DIMJOGLINE',
      '§Edit', 'DIMEDIT', 'DIMTEDIT', 'DIMOVERRIDE', 'DIMREASSOCIATE', 'DIMDISASSOCIATE', 'DIMREGEN', '§Style', 'DIMSTYLE',
    ],
  },
  {
    label: 'Modify',
    names: [
      'PROPERTIES', 'MATCHPROP', '§Object', 'PEDIT', 'HATCHEDIT', 'ATTEDIT', 'EATTEDIT',
      '§Modify', 'ERASE', 'COPY', 'MIRROR', 'OFFSET', 'ARRAY', 'MOVE', 'ROTATE', 'SCALE', 'STRETCH', 'LENGTHEN', 'TRIM', 'EXTEND',
      'BREAKATPOINT', 'BREAK', 'JOIN', 'CHAMFER', 'FILLET',
      '§3D operations', 'ALIGN', '§Solid editing', 'UNION', 'SUBTRACT', 'INTERSECT', 'SLICE', 'FILLETEDGE', 'CHAMFEREDGE', '§', 'EXPLODE',
    ],
  },
  { label: 'Help', names: ['HELP', 'ABOUT'] },
]

/** Comandos que figuran en algún menú (para tests). */
export const MENU_COMMANDS = new Set(CATEGORIES.flatMap((c) => c.names.filter((n) => !n.startsWith('§') && !n.startsWith('@'))))

