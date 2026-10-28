import { isScript } from '../core/commands/script'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { suggestCommands, type CommandSuggestion } from '../core/commands/complete'

export function CommandLine() {
  const output = useStore((s) => s.output)
  const prompt = useStore((s) => s.prompt)
  const submit = useStore((s) => s.submitCommand)
  const cancel = useStore((s) => s.cancel)
  const [text, setText] = useState('')
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const [sugIdx, setSugIdx] = useState(-1)
  const [sugOpen, setSugOpen] = useState(true)
  // Nombre aleatorio y estable por montaje: Chrome indexa el historial de autocompletado por
  // `name`, así que uno impredecible no tiene valores previos que ofrecer (ni del prompt de IA,
  // ni de la contraseña de login que el gestor pudiera haber guardado).
  const [fieldName] = useState(() => 'cmd-' + Math.random().toString(36).slice(2))
  const outputHeight = useStore((s) => s.cmdHeight)
  const setCmdHeight = useStore((s) => s.setCmdHeight)
  const [dragH, setDragH] = useState<number | null>(null)
  /** COMMANDLINEHIDE / Ctrl+9: sólo la fila de entrada; se sigue escribiendo igual. */
  const compact = useStore((s) => s.commandLineCompact)
  const endRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)
  // Marca si el próximo "paste" viene del teclado (Ctrl/⌘+V) para permitirlo; si no, se bloquea
  // (paste del botón central del mouse).
  const pasteViaKeyboard = useRef(false)

  useEffect(() => {
    endRef.current?.scrollIntoView()
  }, [output])

  // Sugerencias: sólo cuando se está tecleando un COMANDO (no hay prompt de comando activo).
  const suggestions = useMemo<CommandSuggestion[]>(() => {
    if (!sugOpen || prompt !== '' || text.trim() === '') return []
    return suggestCommands(useStore.getState().engine.getCommands(), text)
  }, [text, prompt, sugOpen])

  const run = (cmd: string) => {
    submit(cmd)
    setText('')
    setHistIdx(null)
    setSugIdx(-1)
    setSugOpen(true)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      pasteViaKeyboard.current = true // el paste que sigue es legítimo (teclado)
    }
    // El CAD clásico: la barra espaciadora confirma igual que Enter, salvo cuando el prompt pide una cadena
    // (TEXT/MTEXT, nombre de bloque o de archivo), donde el espacio es un carácter más.
    if (e.key === ' ' && useStore.getState().engine.pendingKind() !== 'string') {
      e.preventDefault()
      run(suggestions[sugIdx]?.name ?? text)
      return
    }
    if (e.key === 'Enter') {
      run(suggestions[sugIdx]?.name ?? text)
    } else if (e.key === 'Tab') {
      // Tab completa con la sugerencia (la elegida o la primera) sin ejecutarla.
      const pick = suggestions[sugIdx] ?? suggestions[0]
      if (!pick) return
      e.preventDefault()
      setText(pick.name)
      setSugIdx(-1)
    } else if (e.key === 'Escape') {
      if (suggestions.length > 0) {
        // Primero cierra la lista de sugerencias; un segundo Esc ya cancela el comando.
        e.preventDefault()
        setSugOpen(false)
        setSugIdx(-1)
        return
      }
      setText('')
      setHistIdx(null)
      cancel()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setSugIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
        return
      }
      // Sin sugerencias: recupera comandos previos (más reciente primero), como en el CAD clásico.
      const h = useStore.getState().engine.commandHistory()
      if (h.length === 0) return
      const i = histIdx === null ? h.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(i)
      setText(h[i])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length > 0) {
        setSugIdx((i) => (i >= suggestions.length - 1 ? 0 : i + 1))
        return
      }
      const h = useStore.getState().engine.commandHistory()
      if (h.length === 0 || histIdx === null) return
      const i = histIdx + 1
      if (i >= h.length) {
        setHistIdx(null)
        setText('')
      } else {
        setHistIdx(i)
        setText(h[i])
      }
    }
  }

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: outputHeight }
    let last: number | null = null
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const dy = dragRef.current.startY - ev.clientY // arrastrar hacia arriba agranda
      last = Math.max(48, Math.min(400, dragRef.current.startH + dy))
      setDragH(last)
    }
    const onUp = () => {
      dragRef.current = null
      // Al soltar queda guardado en las preferencias.
      if (last !== null) setCmdHeight(last)
      setDragH(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className={`commandline${compact ? ' compact' : ''}`} data-compact={compact ? 'true' : undefined}>
      {!compact && (
      <div
        className="cmd-resizer"
        title="Drag to resize"
        onPointerDown={onResizeDown}
        data-testid="cmd-resizer"
      />
      )}
      <div className="cmd-output" style={{ height: compact ? 0 : (dragH ?? outputHeight) }} hidden={compact}>
        {output.map((line, i) => (
          <div key={i} className="cmd-line">
            {line}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="cmd-input-row">
        {suggestions.length > 0 && (
          <ul className="cmd-suggest" data-testid="cmd-suggest">
            {suggestions.map((s, i) => (
              <li key={s.name}>
                <button
                  type="button"
                  className={'cmd-suggest-item' + (i === sugIdx ? ' active' : '')}
                  // El mousedown se adelanta al blur del input para no perder el foco del teclado.
                  onMouseDown={(ev) => {
                    ev.preventDefault()
                    run(s.name)
                  }}
                >
                  <span className="cmd-suggest-name">{s.name}</span>
                  {s.alias && <span className="cmd-suggest-alias">{s.alias}</span>}
                  <span className="cmd-suggest-desc">{s.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <span className="cmd-prompt">{prompt || 'Command:'}</span>
        <input
          autoFocus
          className="cmd-input"
          value={text}
          type="text"
          spellCheck={false}
          // Evita el autocompletado del navegador y de los gestores de contraseñas
          // (Chrome ignora `autocomplete="off"` a secas; estos atributos sí se respetan).
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          name={fieldName}
          role="presentation"
          data-form-type="other"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          onChange={(e) => {
            setText(e.target.value)
            setSugIdx(-1)
            setSugOpen(true)
          }}
          onKeyDown={onKeyDown}
          // Evita el "paste" del botón central del mouse (selección PRIMARY de X11), que
          // insertaba el último texto seleccionado en cualquier campo. El botón central se usa
          // para orbitar/paned en el viewport, no para pegar en la barra de comandos.
          onMouseDown={(e) => {
            if (e.button === 1) e.preventDefault()
          }}
          onAuxClick={(e) => {
            if (e.button === 1) e.preventDefault()
          }}
          onPaste={(e) => {
            // Solo se permite pegar con teclado (Ctrl/⌘+V). Un paste sin esa combinación proviene
            // del botón central (X11) → se bloquea.
            if (!pasteViaKeyboard.current) e.preventDefault()
            else {
              // Varias entradas pegadas (multicomandos): corren como un lote, en un solo paso de deshacer, como el
              // espacio del CAD clásico confirma cada una. En un prompt de texto se pega tal cual.
              const pasted = e.clipboardData.getData('text')
              if (useStore.getState().engine.pendingKind() !== 'string' && isScript(pasted)) {
                e.preventDefault()
                setText('')
                void useStore.getState().runScript(pasted)
              }
            }
            pasteViaKeyboard.current = false
          }}
          data-testid="command-input"
        />
      </div>
    </div>
  )
}
