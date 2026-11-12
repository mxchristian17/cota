import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import type { TextEditState } from '../core/text/inplace'

const SYMBOLS = ['Ø', '°', '±']
const FONTS = ['', 'Arial', 'Times New Roman', 'Courier New', 'Verdana']

/**
 * Editor de MTEXT en el lugar: una ventana de texto sobre el dibujo, en la posición, el alto y el giro del texto, con su
 * barra de formato (negrita, itálica, alto, fuente, justificación y símbolos). Ctrl+Enter o un clic afuera aceptan;
 * Esc cancela; Enter hace un renglón nuevo.
 */
export function TextEditor() {
  const edit = useStore((s) => s.textEdit)
  const close = useStore((s) => s.closeTextEditor)
  const [st, setSt] = useState<TextEditState | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const stRef = useRef<TextEditState | null>(null)
  stRef.current = st
  useEffect(() => {
    setSt(edit ? { ...edit.state } : null)
    if (!edit) return
    const t = setTimeout(() => {
      area.current?.focus()
      area.current?.setSelectionRange(area.current.value.length, area.current.value.length)
    }, 0)
    // Un clic afuera acepta (como salir del editor del CAD clásico).
    const onDown = (ev: MouseEvent) => {
      if (box.current && !box.current.contains(ev.target as Node)) close(stRef.current)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [edit, close])
  if (!edit || !st) return null
  const fontPx = (edit.px * st.height) / (edit.baseHeight || 1)
  const set = (patch: Partial<TextEditState>) => setSt({ ...st, ...patch })
  const insert = (sym: string) => {
    const a = area.current
    const i = a?.selectionStart ?? st.text.length
    const j = a?.selectionEnd ?? i
    set({ text: st.text.slice(0, i) + sym + st.text.slice(j) })
    setTimeout(() => a?.setSelectionRange(i + sym.length, i + sym.length), 0)
  }
  const btn = (on: boolean): React.CSSProperties => ({ minWidth: 26, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 3, background: on ? 'var(--accent)' : 'var(--panel-2)', color: on ? '#fff' : 'var(--text)', cursor: 'pointer', font: '12px sans-serif' })
  return (
    <div ref={box} data-testid="text-editor" style={{ position: 'fixed', left: edit.left, top: edit.top, zIndex: 60, transform: `rotate(${edit.angle}deg)`, transformOrigin: '0 0' }}>
      <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, display: 'flex', gap: 3, alignItems: 'center', padding: 4, background: 'var(--panel)', border: '1px solid var(--accent)', borderRadius: 4, whiteSpace: 'nowrap', transform: `rotate(${-edit.angle}deg)`, transformOrigin: '0 100%' }}>
        <button title="Bold" style={{ ...btn(st.bold), fontWeight: 700 }} onClick={() => set({ bold: !st.bold })}>B</button>
        <button title="Italic" style={{ ...btn(st.italic), fontStyle: 'italic' }} onClick={() => set({ italic: !st.italic })}>I</button>
        <label style={{ color: 'var(--text)', font: '12px sans-serif', marginLeft: 4 }}>
          Height{' '}
          <input data-testid="text-editor-height" type="number" min={0} step="any" value={st.height} onChange={(e) => Number(e.target.value) > 0 && set({ height: Number(e.target.value) })} style={{ width: 64 }} />
        </label>
        <select title="Font" value={st.font ?? ''} onChange={(e) => set({ font: e.target.value || undefined })}>
          {FONTS.map((f) => (
            <option key={f} value={f}>{f || 'Cota'}</option>
          ))}
        </select>
        {(['left', 'center', 'right'] as const).map((j) => (
          <button key={j} title={`Justify ${j}`} style={btn(st.justify === j)} onClick={() => set({ justify: j })}>{j[0].toUpperCase()}</button>
        ))}
        {SYMBOLS.map((s) => (
          <button key={s} title={`Insert ${s}`} style={btn(false)} onClick={() => insert(s)}>{s}</button>
        ))}
        <button data-testid="text-editor-ok" style={btn(true)} onClick={() => close(st)}>OK</button>
        <button style={btn(false)} onClick={() => close(null)}>Cancel</button>
      </div>
      <textarea
        ref={area}
        data-testid="text-editor-area"
        value={st.text}
        onChange={(e) => set({ text: e.target.value })}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') close(null)
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) close(st)
        }}
        rows={Math.max(1, st.text.split('\n').length)}
        style={{
          fontSize: fontPx,
          lineHeight: 1.35,
          fontWeight: st.bold ? 700 : 400,
          fontStyle: st.italic ? 'italic' : 'normal',
          fontFamily: st.font || 'sans-serif',
          textAlign: st.justify,
          minWidth: Math.max(120, fontPx * 8),
          width: `${Math.max(8, ...st.text.split('\n').map((l) => l.length + 2))}ch`,
          background: 'rgba(128,128,128,0.12)',
          color: 'var(--text)',
          border: '1px dashed var(--accent)',
          outline: 'none',
          resize: 'both',
          padding: 2,
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
