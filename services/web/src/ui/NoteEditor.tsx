import { useEffect, useRef } from 'react'
import { useStore } from '../store/store'
import { NOTE_COLORS } from '../core/geom/note'

/** Editor del texto de una nota rápida, sobre la nota misma (doble clic). Ctrl+Enter o salir acepta; Esc descarta. */
export function NoteEditor() {
  const edit = useStore((s) => s.noteEdit)
  const close = useStore((s) => s.closeNoteEditor)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const t = ref.current
    if (!t) return
    t.focus()
    t.setSelectionRange(t.value.length, t.value.length)
  }, [edit?.id])
  if (!edit) return null
  const c = NOTE_COLORS[edit.color] ?? NOTE_COLORS.yellow
  const { left, top, width, height } = edit.rect
  return (
    <textarea
      ref={ref}
      data-testid="note-editor"
      defaultValue={edit.text}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') close(false)
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) close(true, e.currentTarget.value)
      }}
      onBlur={(e) => close(true, e.currentTarget.value)}
      style={{
        position: 'fixed',
        left,
        top,
        width: Math.max(80, width),
        height: Math.max(48, height),
        zIndex: 50,
        background: c.paper,
        color: c.ink,
        border: `2px solid ${c.fold}`,
        borderRadius: 2,
        padding: '18px 8px 8px',
        boxSizing: 'border-box',
        font: '16px "Segoe Print", "Bradley Hand", "Comic Sans MS", "Noto Sans", sans-serif',
        resize: 'none',
        outline: 'none',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
      }}
    />
  )
}
