import type { CameraMode, ViewName } from '../core/view'
import {
  cameraOnNet,
  cornerDir,
  cornerName,
  dirToAzEl,
  edgeDir,
  edgeName,
  eyeDir,
  isoNameOf,
  neighborFace,
  netCells,
  NET_COLS,
  NET_ROWS,
  type ProjStd,
  type Side,
  type V3,
} from '../core/viewNet'
import { focusCommandLine } from './focus'

/** Lado de una celda, grosor de la franja de una arista y tamaño de una esquina (px). */
const C = 26
const EDGE = 7
const CORNER = 9

const LABEL: Record<string, string> = { TOP: 'TOP', BOTTOM: 'BOT', FRONT: 'FRONT', BACK: 'BACK', LEFT: 'LEFT', RIGHT: 'RIGHT' }
const ISO_TITLE: Record<string, string> = { ISO: 'SE Isometric', SWISO: 'SW Isometric', NEISO: 'NE Isometric', NWISO: 'NW Isometric' }

/** Tolerancia para dar por "actual" una cara, arista o esquina (≈0,4°). */
const along = (az: number, el: number, d: V3): boolean => {
  const e = eyeDir(az, el)
  return e[0] * d[0] + e[1] * d[1] + e[2] * d[2] > 1 - 2e-5
}

interface Hotspot {
  key: string
  name: string
  dir: V3
  iso: ViewName | null
  style: React.CSSProperties
}

/** Aristas y esquinas del desplegado, sin repetir las que caen en el mismo lugar (lados compartidos). */
function hotspots(std: ProjStd): { edges: Hotspot[]; corners: Hotspot[] } {
  const cells = netCells(std)
  const edges = new Map<string, Hotspot>()
  const corners = new Map<string, Hotspot>()
  for (const c of cells) {
    for (const side of ['left', 'right', 'top', 'bottom'] as Side[]) {
      const vertical = side === 'left' || side === 'right'
      const lx = (c.col + (side === 'right' ? 1 : 0)) * C
      const ly = (c.row + (side === 'bottom' ? 1 : 0)) * C
      const key = `${vertical ? 'v' : 'h'}:${lx}:${ly}`
      if (edges.has(key)) continue
      const style: React.CSSProperties = vertical
        ? { left: lx - EDGE / 2, top: ly + CORNER / 2 + 1, width: EDGE, height: C - CORNER - 2 }
        : { left: lx + CORNER / 2 + 1, top: ly - EDGE / 2, width: C - CORNER - 2, height: EDGE }
      edges.set(key, { key, name: edgeName(c.face, neighborFace(c, side)), dir: edgeDir(c, side), iso: null, style })
    }
    for (const sx of [-1, 1] as const) {
      for (const sy of [-1, 1] as const) {
        const px = (c.col + (sx > 0 ? 1 : 0)) * C
        const py = (c.row + (sy > 0 ? 0 : 1)) * C
        const key = `${px}:${py}`
        if (corners.has(key)) continue
        const dir = cornerDir(c, sx, sy)
        const style = { left: px - CORNER / 2, top: py - CORNER / 2, width: CORNER, height: CORNER }
        corners.set(key, { key, name: cornerName(dir), dir, iso: isoNameOf(dir), style })
      }
    }
  }
  return { edges: [...edges.values()], corners: [...corners.values()] }
}

export interface ViewNetProps {
  az: number
  el: number
  mode: CameraMode
  /** Disposición de las vistas: ISO-E (primer diedro) o ISO-A (tercer diedro). */
  std: ProjStd
  onView: (v: ViewName) => void
  /** Vista desde una dirección cualquiera (aristas y esquinas que no son isométricas estándar). */
  onViewDir: (az: number, el: number) => void
  onToggleMode: () => void
  onToggleStd: () => void
  /** Menú de UCS: la actual (`WCS`, nombre o `Unnamed`), las guardadas y "New UCS". */
  ucs?: { current: string; named: string[]; onPick: (name: string) => void }
}

/**
 * Navegación por **cubo desplegado en Monge**, por viewport: las caras son las vistas principales, las
 * aristas las vistas a 45° entre dos caras y las esquinas las isométricas. Un punto marca dónde está la cámara
 * sobre el cubo y se mueve al orbitar.
 */
export function ViewNet({ az, el, mode, std, onView, onViewDir, onToggleMode, onToggleStd, ucs }: ViewNetProps) {
  const cells = netCells(std)
  const { edges, corners } = hotspots(std)
  const cam = cameraOnNet(az, el, std)
  const goFace = (v: ViewName) => () => {
    onView(v)
    focusCommandLine()
  }
  const goDir = (h: Hotspot) => () => {
    if (h.iso) onView(h.iso)
    else {
      const { az: a, el: e } = dirToAzEl(h.dir)
      onViewDir(a, e)
    }
    focusCommandLine()
  }
  const face = cells.find((c) => along(az, el, c.n))
  const edge = face ? undefined : edges.find((h) => along(az, el, h.dir))
  const corner = face || edge ? undefined : corners.find((h) => along(az, el, h.dir))
  const label = face?.face ?? edge?.name ?? (corner ? (corner.iso ?? corner.name) : '—')

  return (
    <div className="viewcube viewnet" data-testid="viewcube" data-std={std}>
      <div className="viewnet-grid" style={{ width: NET_COLS * C, height: NET_ROWS * C }}>
        {cells.map((c) => (
          <button
            key={c.face}
            className={'viewnet-face' + (face?.face === c.face ? ' active' : '')}
            style={{ left: c.col * C, top: c.row * C, width: C, height: C }}
            title={c.face}
            data-testid={`viewcube-${c.face}`}
            onClick={goFace(c.face as ViewName)}
          >
            {LABEL[c.face]}
          </button>
        ))}
        {edges.map((h) => (
          <button
            key={h.key}
            className={'viewnet-edge' + (edge?.key === h.key || (edge && edge.name === h.name) ? ' active' : '')}
            style={h.style}
            title={h.name}
            data-testid={`viewcube-edge-${h.name}`}
            onClick={goDir(h)}
          />
        ))}
        {corners.map((h) => (
          <button
            key={h.key}
            className={'viewnet-corner' + (corner && corner.name === h.name ? ' active' : '')}
            style={h.style}
            title={h.iso ? ISO_TITLE[h.iso] : h.name}
            data-testid={h.iso ? `viewcube-iso-${h.iso}` : `viewcube-corner-${h.name}`}
            onClick={goDir(h)}
          />
        ))}
        <div className="viewnet-cam" style={{ left: cam.x * C, top: cam.y * C }} data-testid="viewcube-camera" data-face={cam.face} />
      </div>
      <div className="viewnet-row">
        <div className="viewcube-label" data-testid="viewcube-label">
          {label}
        </div>
        <button
          className="viewcube-proj"
          title={std === 'E' ? 'Views laid out ISO-E (first angle). Click for ISO-A (third angle)' : 'Views laid out ISO-A (third angle). Click for ISO-E (first angle)'}
          data-testid="viewnet-std"
          onClick={() => {
            onToggleStd()
            focusCommandLine()
          }}
        >
          {std === 'E' ? 'ISO-E' : 'ISO-A'}
        </button>
      </div>
      <button
        className={'viewcube-proj' + (mode === 'persp' ? ' on' : '')}
        title="Toggle perspective / orthographic"
        data-testid="proj-toggle"
        onClick={() => {
          onToggleMode()
          focusCommandLine()
        }}
      >
        {mode === 'persp' ? 'Persp' : 'Ortho'}
      </button>
      {ucs && (
        <select
          className="viewcube-ucs"
          title="UCS"
          data-testid="viewcube-ucs"
          value={ucs.current}
          onChange={(e) => {
            ucs.onPick(e.target.value)
            focusCommandLine()
          }}
        >
          {ucs.current !== 'WCS' && !ucs.named.includes(ucs.current) && <option value={ucs.current}>{ucs.current}</option>}
          <option value="WCS">WCS</option>
          {ucs.named.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="__new">New UCS…</option>
        </select>
      )}
    </div>
  )
}
