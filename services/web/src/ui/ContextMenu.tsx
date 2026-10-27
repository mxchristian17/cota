import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { matchOsnapOverride } from '../core/snap/osnap'
import { Sub } from './DimContextMenu'
import { focusCommandLine } from './focus'

/**
 * Menú contextual general (clic derecho sin arrastre en un viewport, tecla Menú o Shift+F10), como el CAD clásico:
 * - con un comando en curso: Enter, Cancel, las opciones del prompt y los object snaps puntuales;
 * - con objetos seleccionados: Repeat, portapapeles, Erase/Move/Copy/Scale/Rotate, Select Similar, Deselect All y
 *   Properties;
 * - sin selección: Repeat, recientes, Paste, Undo/Redo, Pan, Zoom y Options.
 */
type Listener = (at: { x: number; y: number } | null) => void
const listeners = new Set<Listener>()
export function openGeneralMenu(x: number, y: number): void {
  listeners.forEach((l) => l({ x, y }))
}

const SNAPS: Array<[string, string]> = [
  ['Endpoint', 'END'],
  ['Midpoint', 'MID'],
  ['Intersection', 'INT'],
  ['Apparent Intersect', 'APP'],
  ['Extension', 'EXT'],
  ['Center', 'CEN'],
  ['Quadrant', 'QUA'],
  ['Tangent', 'TAN'],
  ['Perpendicular', 'PER'],
  ['Parallel', 'PAR'],
  ['Node', 'NOD'],
  ['Insert', 'INS'],
  ['Nearest', 'NEA'],
  ['None', 'NON'],
]

export function ContextMenu() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const l: Listener = (p) => setAt(p)
    listeners.add(l)
    let last = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const onMove = (e: PointerEvent) => (last = { x: e.clientX, y: e.clientY })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAt(null)
      // Tecla Menú o Shift+F10: el menú donde está el cursor.
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault()
        setAt(last)
      }
    }
    const onDown = () => setAt(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      listeners.delete(l)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [])
  return at ? <MenuBody x={at.x} y={at.y} close={() => setAt(null)} /> : null
}

function MenuBody({ x, y, close }: { x: number; y: number; close: () => void }) {
  const s = useStore.getState()
  const info = s.engine.menuInfo()
  const has = (name: string) => s.engine.getCommands().some((c) => c.name === name)
  const act = (fn: () => void) => () => {
    close()
    fn()
    focusCommandLine()
  }
  const run = (cmd: string) => act(() => s.submitCommand(cmd))
  const item = (label: string, onClick: () => void, testId: string, disabled = false) => (
    <button key={testId} data-testid={testId} disabled={disabled} onClick={onClick}>
      <span className="check" />
      {label}
    </button>
  )
  const cmdItem = (label: string, cmd: string) => (has(cmd) ? item(label, run(cmd), `ctx-${cmd.toLowerCase()}`) : null)
  const sep = (k: string) => <div key={k} className="context-sep" />
  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y, window.innerHeight - 420)
  const busy = s.engine.busy
  const selected = s.selection.length > 0

  let body: React.ReactNode
  if (busy) {
    const snaps = SNAPS.filter(([, code]) => matchOsnapOverride(code))
    body = (
      <>
        {item('Enter', run(''), 'ctx-enter')}
        {item('Cancel', act(() => s.cancel()), 'ctx-cancel')}
        {info.keywords.length > 0 && sep('k')}
        {info.keywords.map((k) => item(k, run(k), `ctx-kw-${k.toLowerCase()}`))}
        {s.engine.awaitingPoint && snaps.length > 0 && (
          <>
            {sep('s')}
            <Sub label="Snap Overrides" testId="ctx-snaps">
              {snaps.map(([label, code]) => item(label, run(code), `ctx-snap-${code.toLowerCase()}`))}
            </Sub>
          </>
        )}
      </>
    )
  } else {
    const clipboard = (
      <Sub label="Clipboard" testId="ctx-clipboard">
        {selected && cmdItem('Cut', 'CUTCLIP')}
        {selected && cmdItem('Copy', 'COPYCLIP')}
        {selected && cmdItem('Copy with Base Point', 'COPYBASE')}
        {cmdItem('Paste', 'PASTECLIP')}
        {cmdItem('Paste to Original Coordinates', 'PASTEORIG')}
      </Sub>
    )
    body = (
      <>
        {info.last && item(`Repeat ${info.last}`, run(info.last), 'ctx-repeat')}
        {info.recent.length > 0 && (
          <Sub label="Recent Input" testId="ctx-recent">
            {info.recent.map((c) => item(c, run(c), `ctx-recent-${c.toLowerCase()}`))}
          </Sub>
        )}
        {sep('a')}
        {clipboard}
        {sep('b')}
        {selected ? (
          <>
            {cmdItem('Erase', 'ERASE')}
            {cmdItem('Move', 'MOVE')}
            {cmdItem('Copy Selection', 'COPY')}
            {cmdItem('Scale', 'SCALE')}
            {cmdItem('Rotate', 'ROTATE')}
            {cmdItem('Mirror', 'MIRROR')}
            {sep('c')}
            {cmdItem('Select Similar', 'SELECTSIMILAR')}
            {item('Deselect All', act(() => s.clearSelection()), 'ctx-deselect')}
            {sep('d')}
            {cmdItem('Properties', 'PROPERTIES')}
          </>
        ) : (
          <>
            {cmdItem('Undo', 'UNDO')}
            {cmdItem('Redo', 'REDO')}
            {cmdItem('Pan', 'PAN')}
            {cmdItem('Zoom', 'ZOOM')}
            {sep('c')}
            {cmdItem('Select All', 'SELECTALL')}
            {cmdItem('Options...', 'OPTIONS')}
          </>
        )}
      </>
    )
  }
  return (
    <div className="context-menu" style={{ left, top }} data-testid="context-menu" translate="no" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {body}
    </div>
  )
}
