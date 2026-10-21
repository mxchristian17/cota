import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { PropertiesPanel } from './PropertiesPanel'
import { clampToViewport, clampWidth, dockFromDrop, MAX_WIDTH, MIN_WIDTH } from '../core/ui/palette'
import { focusCommandLine } from './focus'

/**
 * Paleta de Propiedades: se arrastra desde su barra de título, se **acopla** al soltarla
 * cerca de un borde lateral (y entonces reduce el área de dibujo), se minimiza y se cierra.
 *
 * Mientras se arrastra, la posición vive en estado local y sólo se escribe en el store al soltar: así
 * el viewport no se re-renderiza en cada movimiento del puntero.
 */
export function PropertiesPalette() {
  const palette = useStore((s) => s.propsPalette)
  const setPalette = useStore((s) => s.setPropsPalette)
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [dropHint, setDropHint] = useState<'left' | 'right' | null>(null)

  // Al redimensionar la ventana, una paleta flotante se mantiene visible.
  useEffect(() => {
    if (palette.dock !== null) return
    const onResize = () => {
      const c = clampToViewport(palette, window.innerWidth, window.innerHeight)
      if (c.x !== palette.x || c.y !== palette.y) setPalette(c)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [palette, setPalette])

  if (!palette.open) return null

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = ref.current?.getBoundingClientRect()
    const offsetX = rect ? e.clientX - rect.left : 0
    const offsetY = rect ? e.clientY - rect.top : 0
    setDrag({ x: e.clientX - offsetX, y: e.clientY - offsetY })

    const onMove = (ev: PointerEvent) => {
      const x = ev.clientX - offsetX
      const y = ev.clientY - offsetY
      setDrag({ x, y })
      setDropHint(dockFromDrop(x, palette.width, window.innerWidth))
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const x = ev.clientX - offsetX
      const y = ev.clientY - offsetY
      const dock = dockFromDrop(x, palette.width, window.innerWidth)
      const pos = clampToViewport({ x, y, width: palette.width }, window.innerWidth, window.innerHeight)
      setDrag(null)
      setDropHint(null)
      setPalette({ dock, ...pos })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startW = palette.width
    // Acoplada a la derecha, arrastrar hacia la izquierda agranda; en los demás casos, al revés.
    const sign = palette.dock === 'right' ? -1 : 1
    const onMove = (ev: PointerEvent) => {
      const w = clampWidth(startW + sign * (ev.clientX - startX))
      if (ref.current) ref.current.style.width = `${w}px`
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setPalette({ width: clampWidth(startW + sign * (ev.clientX - startX)) })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const floating = palette.dock === null || drag !== null
  const pos = drag ?? { x: palette.x, y: palette.y }
  const style: React.CSSProperties = floating
    ? { position: 'fixed', left: pos.x, top: pos.y, width: palette.width, zIndex: 30 }
    : { width: palette.width }

  // Acoplada y minimizada (por defecto): una franja vertical angosta, como una paleta oculta del
  // CAD clásico; deja todo el ancho para dibujar. Clic en ▣ (o en la franja) la despliega.
  if (!floating && palette.minimized) {
    return (
      <>
        {dropHint && <div className={`dock-hint dock-hint-${dropHint}`} data-testid="dock-hint" />}
        <aside
          ref={ref}
          className={`palette palette-docked palette-${palette.dock} palette-minimized palette-collapsed`}
          data-testid="properties-palette"
          data-dock={palette.dock ?? 'float'}
        >
          <button
            className="icon-btn"
            title="Restore"
            data-testid="palette-minimize"
            onClick={() => {
              setPalette({ minimized: false })
              focusCommandLine()
            }}
          >
            ▣
          </button>
          <button
            className="icon-btn"
            title="Close (PROPERTIES / PR to reopen)"
            data-testid="palette-close"
            onClick={() => {
              setPalette({ open: false })
              focusCommandLine()
            }}
          >
            ✕
          </button>
          <div className="palette-strip" onPointerDown={startDrag} data-testid="palette-title" title="Properties — drag to float or dock; ▣ to expand">
            Properties
          </div>
        </aside>
      </>
    )
  }

  return (
    <>
      {dropHint && <div className={`dock-hint dock-hint-${dropHint}`} data-testid="dock-hint" />}
      <aside
        ref={ref}
        className={
          'palette' +
          (floating ? ' palette-floating' : ` palette-docked palette-${palette.dock}`) +
          (palette.minimized ? ' palette-minimized' : '')
        }
        style={style}
        data-testid="properties-palette"
        data-dock={palette.dock ?? 'float'}
      >
        <div className="palette-title" onPointerDown={startDrag} data-testid="palette-title">
          <span className="palette-name">Properties</span>
          <button
            className="icon-btn"
            title={palette.minimized ? 'Restore' : 'Minimize'}
            data-testid="palette-minimize"
            onClick={() => {
              setPalette({ minimized: !palette.minimized })
              focusCommandLine()
            }}
          >
            {palette.minimized ? '▣' : '—'}
          </button>
          <button
            className="icon-btn"
            title="Close (PROPERTIES / PR to reopen)"
            data-testid="palette-close"
            onClick={() => {
              setPalette({ open: false })
              focusCommandLine()
            }}
          >
            ✕
          </button>
        </div>
        {!palette.minimized && (
          <>
            <div className="palette-body">
              <PropertiesPanel />
            </div>
            <div
              className={'palette-resizer' + (palette.dock === 'right' ? ' left' : ' right')}
              onPointerDown={startResize}
              title={`Drag to resize (${MIN_WIDTH}–${MAX_WIDTH} px)`}
              data-testid="palette-resizer"
            />
          </>
        )}
      </aside>
    </>
  )
}
