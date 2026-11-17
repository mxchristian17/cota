import { useEffect, useState } from 'react'

/**
 * Tooltip propio para los botones de ícono de las barras de herramientas: nombre, comando y alias, con el estilo de
 * la interfaz (el `title` nativo cambia de aspecto y de demora según el sistema). Cualquier elemento con `data-tip`
 * lo muestra: `data-tip` es el nombre, `data-tip-cmd` el comando y `data-tip-alias` su alias. El nombre accesible
 * del botón sigue en su `aria-label`.
 */
interface Tip {
  name: string
  cmd: string
  alias: string
  x: number
  y: number
  side: 'right' | 'left' | 'below'
}

const DELAY = 380

export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null)
  useEffect(() => {
    let timer = 0
    let current: HTMLElement | null = null
    const hide = () => {
      window.clearTimeout(timer)
      current = null
      setTip(null)
    }
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null
      if (el === current) return
      hide()
      if (!el) return
      current = el
      timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect()
        const vertical = !!el.closest('.toolbar-left, .toolbar-right')
        const rightDock = !!el.closest('.toolbar-right')
        const side: Tip['side'] = vertical ? (rightDock ? 'left' : 'right') : 'below'
        setTip({
          name: el.dataset.tip ?? '',
          cmd: el.dataset.tipCmd ?? '',
          alias: el.dataset.tipAlias ?? '',
          x: side === 'right' ? r.right + 8 : side === 'left' ? r.left - 8 : r.left + r.width / 2,
          y: side === 'below' ? r.bottom + 8 : r.top + r.height / 2,
          side,
        })
      }, DELAY)
    }
    document.addEventListener('pointerover', over)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])
  if (!tip) return null
  return (
    <div className={`ui-tooltip ui-tooltip-${tip.side}`} style={{ left: tip.x, top: tip.y }} role="tooltip" data-testid="ui-tooltip">
      <span className="ui-tooltip-name">{tip.name}</span>
      {tip.cmd && (
        <span className="ui-tooltip-cmd">
          {tip.cmd}
          {tip.alias && <span className="ui-tooltip-alias">{tip.alias}</span>}
        </span>
      )}
    </div>
  )
}
