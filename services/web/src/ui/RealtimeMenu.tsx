import { useStore } from '../store/store'
import { focusCommandLine } from './focus'

const ITEMS: Array<{ a: 'exit' | 'pan' | 'zoom' | 'window' | 'original' | 'extents'; label: string }> = [
  { a: 'exit', label: 'Exit' },
  { a: 'pan', label: 'Pan' },
  { a: 'zoom', label: 'Zoom' },
  { a: 'window', label: 'Zoom Window' },
  { a: 'original', label: 'Zoom Original' },
  { a: 'extents', label: 'Zoom Extents' },
]

/** Menú del clic derecho durante ZOOM/PAN en tiempo real, como el del CAD clásico. */
export function RealtimeMenu() {
  const menu = useStore((s) => s.realtimeMenu)
  const act = useStore((s) => s.realtimeAction)
  const close = useStore((s) => s.setRealtimeMenu)
  if (!menu) return null
  return (
    <>
      <div className="command-backdrop" onClick={() => close(null)} onContextMenu={(e) => (e.preventDefault(), close(null))} />
      <div className="toolbar-menu" style={{ left: menu.x, top: menu.y }} data-testid="realtime-menu">
        {ITEMS.map((i) => (
          <button
            key={i.a}
            className="command-item"
            onClick={() => {
              act(i.a)
              focusCommandLine()
            }}
            data-testid={`realtime-${i.a}`}
          >
            {i.label}
          </button>
        ))}
      </div>
    </>
  )
}
