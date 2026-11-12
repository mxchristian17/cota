import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import type { TextRun } from '../core/document/types'
import { mergeRuns, type TextEditState } from '../core/text/inplace'

const SYMBOLS = ['Ø', '°', '±']
const FONTS = ['Arial', 'Times New Roman', 'Courier New', 'Verdana']
const SIZES = [0.5, 0.75, 1, 1.5, 2]
const ROOT_FONT = 'sans-serif'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const firstFamily = (f: string): string => f.split(',')[0].trim().replace(/^["']|["']$/g, '')
const toHex = (rgb: string): string => {
  const m = rgb.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return rgb
  return '#' + m.slice(0, 3).map((x) => Math.round(Number(x)).toString(16).padStart(2, '0')).join('')
}

/** HTML editable de unos tramos (los saltos de renglón, `<br>`; el alto relativo, en `em`). */
export function runsToHtml(runs: TextRun[]): string {
  return runs
    .map((r) => {
      const st = [
        r.b ? 'font-weight:700' : '',
        r.i ? 'font-style:italic' : '',
        r.u ? 'text-decoration:underline' : '',
        r.f ? `font-family:'${r.f.replace(/'/g, '')}'` : '',
        r.h ? `font-size:${r.h}em` : '',
        r.c ? `color:${r.c}` : '',
      ].filter(Boolean)
      const body = esc(r.s).replace(/\n/g, '<br>')
      return st.length ? `<span style="${st.join(';')}">${body}</span>` : body
    })
    .join('')
}

/** Tramos de lo escrito en el editor, con el formato que se ve (estilo calculado de cada pedazo de texto). */
function readRuns(root: HTMLElement): TextRun[] {
  const rc = getComputedStyle(root)
  const basePx = parseFloat(rc.fontSize) || 16
  const rootFam = firstFamily(rc.fontFamily)
  const look = (el: Element): Omit<TextRun, 's'> => {
    const cs = getComputedStyle(el)
    let u = false
    for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
      if (getComputedStyle(n).textDecorationLine.includes('underline')) {
        u = true
        break
      }
    }
    const fam = firstFamily(cs.fontFamily)
    const h = Math.round((parseFloat(cs.fontSize) / basePx) * 100) / 100
    return {
      ...(Number(cs.fontWeight) >= 600 ? { b: true } : {}),
      ...(cs.fontStyle !== 'normal' ? { i: true } : {}),
      ...(u ? { u: true } : {}),
      ...(fam && fam !== rootFam ? { f: fam } : {}),
      ...(Math.abs(h - 1) > 0.02 ? { h } : {}),
      ...(cs.color !== rc.color ? { c: toHex(cs.color) } : {}),
    }
  }
  const out: TextRun[] = []
  const walk = (n: Node): void => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE) {
        if (c.textContent) out.push({ s: c.textContent, ...look(c.parentElement ?? root) })
      } else if (c.nodeName === 'BR') out.push({ s: '\n', ...look(c.parentElement ?? root) })
      else if (c instanceof HTMLElement) {
        // Un renglón como bloque (lo que algunos navegadores arman con Enter) empieza en un renglón nuevo.
        if (/^(DIV|P)$/.test(c.nodeName) && out.length && !out[out.length - 1].s.endsWith('\n')) out.push({ s: '\n', ...look(c) })
        walk(c)
      }
    }
  }
  walk(root)
  const runs = mergeRuns(out)
  const last = runs[runs.length - 1]
  if (last?.s.endsWith('\n')) {
    last.s = last.s.slice(0, -1) // el <br> de relleno del final
    if (!last.s) runs.pop()
  }
  return runs
}

/**
 * Editor de MTEXT en el lugar: texto enriquecido sobre el dibujo, en la posición, el alto y el giro del texto. La barra
 * da formato a lo seleccionado (negrita, itálica, subrayado, color, fuente, tamaño relativo, símbolos) y al texto entero
 * (alto, justificación). Enter hace un renglón nuevo; Ctrl+Enter, OK o un clic afuera aceptan; Esc cancela.
 */
export function TextEditor() {
  const edit = useStore((s) => s.textEdit)
  const close = useStore((s) => s.closeTextEditor)
  const [height, setHeight] = useState(1)
  const [justify, setJustify] = useState<TextEditState['justify']>('left')
  const box = useRef<HTMLDivElement>(null)
  const ed = useRef<HTMLDivElement>(null)
  const range = useRef<Range | null>(null)
  const accept = useRef<() => void>(() => undefined)

  const save = (): void => {
    const s = window.getSelection()
    if (s && s.rangeCount && ed.current?.contains(s.anchorNode)) range.current = s.getRangeAt(0).cloneRange()
  }
  const restore = (): void => {
    ed.current?.focus()
    const s = window.getSelection()
    if (s && range.current) {
      s.removeAllRanges()
      s.addRange(range.current)
    }
  }
  const exec = (cmd: string, value?: string): void => {
    restore()
    document.execCommand(cmd, false, value)
    save()
  }
  /** Tamaño relativo de lo seleccionado (un tramo con su alto en `em`). */
  const resize = (k: number): void => {
    restore()
    const s = window.getSelection()
    if (!s || !s.rangeCount || s.isCollapsed) return
    const r = s.getRangeAt(0)
    const span = document.createElement('span')
    span.style.fontSize = `${k}em`
    span.appendChild(r.extractContents())
    r.insertNode(span)
    s.removeAllRanges()
    const nr = document.createRange()
    nr.selectNodeContents(span)
    s.addRange(nr)
    save()
  }

  useEffect(() => {
    if (!edit) return
    setHeight(edit.state.height)
    setJustify(edit.state.justify)
    const runs = edit.state.runs ?? [{ s: edit.state.text, ...(edit.state.bold ? { b: true } : {}), ...(edit.state.italic ? { i: true } : {}) }]
    if (ed.current) {
      ed.current.innerHTML = runsToHtml(runs)
      ed.current.focus()
      const s = window.getSelection()
      const r = document.createRange()
      r.selectNodeContents(ed.current)
      r.collapse(false)
      s?.removeAllRanges()
      s?.addRange(r)
      save()
    }
    document.execCommand('styleWithCSS', false, 'true')
    // Un clic afuera acepta (como salir del editor del CAD clásico).
    const onDown = (ev: MouseEvent) => {
      if (box.current && !box.current.contains(ev.target as Node)) accept.current()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [edit])

  if (!edit) return null
  const font = edit.state.font
  accept.current = () => {
    if (!ed.current) return
    const runs = readRuns(ed.current)
    // Un editor vacío puede empezar con un <br> de relleno: ese renglón vacío al principio no es del usuario.
    if (!edit.state.text.startsWith('\n') && runs[0]?.s.startsWith('\n')) {
      runs[0].s = runs[0].s.slice(1)
      if (!runs[0].s) runs.shift()
    }
    close({ text: runs.map((r) => r.s).join(''), runs, height, bold: false, italic: false, justify, ...(font ? { font } : {}) })
  }
  const fontPx = (edit.px * height) / (edit.baseHeight || 1)
  const keep = (e: React.MouseEvent) => e.preventDefault() // la barra no le saca la selección al texto
  const btn = (on = false): React.CSSProperties => ({ minWidth: 24, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 3, background: on ? 'var(--accent)' : 'var(--panel-2)', color: on ? '#fff' : 'var(--text)', cursor: 'pointer', font: '12px sans-serif' })
  return (
    <div ref={box} data-testid="text-editor" style={{ position: 'fixed', left: edit.left, top: edit.top, zIndex: 60, transform: `rotate(${edit.angle}deg)`, transformOrigin: '0 0' }}>
      <div onMouseDown={keep} style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, display: 'flex', gap: 3, alignItems: 'center', padding: 4, background: 'var(--panel)', border: '1px solid var(--accent)', borderRadius: 4, whiteSpace: 'nowrap', transform: `rotate(${-edit.angle}deg)`, transformOrigin: '0 100%' }}>
        <button title="Bold (selection)" style={{ ...btn(), fontWeight: 700 }} onClick={() => exec('bold')}>B</button>
        <button title="Italic (selection)" style={{ ...btn(), fontStyle: 'italic' }} onClick={() => exec('italic')}>I</button>
        <button title="Underline (selection)" style={{ ...btn(), textDecoration: 'underline' }} onClick={() => exec('underline')}>U</button>
        <input title="Color (selection)" type="color" defaultValue="#ff4040" onMouseDown={(e) => { e.stopPropagation(); save() }} onChange={(e) => exec('foreColor', e.target.value)} style={{ width: 26, height: 22, padding: 0, border: 'none', background: 'none' }} />
        <select title="Font (selection)" defaultValue="" onMouseDown={(e) => { e.stopPropagation(); save() }} onChange={(e) => exec('fontName', e.target.value || ROOT_FONT)}>
          <option value="">Font…</option>
          {FONTS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <select title="Size of the selection" defaultValue="" onMouseDown={(e) => { e.stopPropagation(); save() }} onChange={(e) => e.target.value && resize(Number(e.target.value))}>
          <option value="">Size…</option>
          {SIZES.map((k) => (
            <option key={k} value={k}>{k}×</option>
          ))}
        </select>
        <label style={{ color: 'var(--text)', font: '12px sans-serif', marginLeft: 4 }} onMouseDown={(e) => e.stopPropagation()}>
          Height{' '}
          <input data-testid="text-editor-height" type="number" min={0} step="any" value={height} onChange={(e) => Number(e.target.value) > 0 && setHeight(Number(e.target.value))} style={{ width: 60 }} />
        </label>
        {(['left', 'center', 'right'] as const).map((j) => (
          <button key={j} title={`Justify ${j}`} style={btn(justify === j)} onClick={() => setJustify(j)}>{j[0].toUpperCase()}</button>
        ))}
        {SYMBOLS.map((s) => (
          <button key={s} title={`Insert ${s}`} style={btn()} onClick={() => exec('insertText', s)}>{s}</button>
        ))}
        <button data-testid="text-editor-ok" style={btn(true)} onClick={() => accept.current()}>OK</button>
        <button style={btn()} onClick={() => close(null)}>Cancel</button>
      </div>
      <div
        ref={ed}
        data-testid="text-editor-area"
        contentEditable
        suppressContentEditableWarning
        onKeyUp={save}
        onMouseUp={save}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') close(null)
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            accept.current()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            document.execCommand('insertLineBreak')
          }
        }}
        style={{
          fontSize: fontPx,
          lineHeight: 1.35,
          fontFamily: font || ROOT_FONT,
          textAlign: justify,
          minWidth: Math.max(120, fontPx * 8),
          minHeight: fontPx * 1.35,
          whiteSpace: 'pre-wrap',
          background: 'rgba(128,128,128,0.12)',
          color: 'var(--text)',
          border: '1px dashed var(--accent)',
          outline: 'none',
          padding: 2,
        }}
      />
    </div>
  )
}
