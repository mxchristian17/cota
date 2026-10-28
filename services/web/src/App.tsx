import { DimContextMenu } from './ui/DimContextMenu'
import { ContextMenu } from './ui/ContextMenu'
import { ViewGenDialog } from './ui/ViewGenDialog'
import { useEffect, useRef, useState } from 'react'
import { ViewportView } from './ui/ViewportView'
import { FloatingToolbars, ToolbarDialog, ToolbarDock } from './ui/Toolbar'
import { canInstall, enterFullscreen, isStandalone, onInstallChange, promptInstall } from './ui/appWindow'
import { FlatshotDialog } from './ui/FlatshotDialog'
import { PlotDialog } from './ui/PlotDialog'
import { QSelectDialog } from './ui/QSelectDialog'
import { CLOUD_ENABLED } from './core/io/backend'
import { BRAND_HTML } from './ui/brand'
import { focusCommandLine } from './ui/focus'
import { StatusBar } from './ui/StatusBar'
import { CommandLine } from './ui/CommandLine'
import { CommandBar } from './ui/CommandBar'
import { PropertiesPalette } from './ui/PropertiesPalette'
import { LayerDialog } from './ui/LayerDialog'
import { HelpDialog } from './ui/HelpDialog'
import { LoginDialog } from './ui/LoginDialog'
import { OpenDialog } from './ui/OpenDialog'
import { OptionsDialog } from './ui/OptionsDialog'
import { OsnapDialog } from './ui/OsnapDialog'
import { DimStyleDialog } from './ui/DimStyleDialog'
import { DwgPropsDialog } from './ui/DwgPropsDialog'
import { AttEditDialog } from './ui/AttEditDialog'
import { PageSetupDialog } from './ui/PageSetupDialog'
import { TemplateDialog } from './ui/TemplateDialog'
import { AiDialog } from './ui/AiDialog'
import { LinetypeDialog } from './ui/LinetypeDialog'
import { HatchPanel } from './ui/HatchPanel'
import { RealtimeMenu } from './ui/RealtimeMenu'
import { useStore } from './store/store'
import { canAutosave } from './core/io/autosave'

/**
 * ¿Se está editando texto ahora mismo? El foco de Cota vive en la línea de comandos, así que si se
 * exigiera "ningún campo enfocado" los atajos del modelo (Ctrl+Z/Ctrl+Y) nunca dispararían. Sólo la
 * línea de comandos **con texto a medio tipear** y cualquier otro campo cuentan como edición de texto.
 */
function editingText(): boolean {
  const el = document.activeElement as HTMLInputElement | null
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return false
  if (el.getAttribute('data-testid') === 'command-input') return el.value !== ''
  return true
}

/** ¿El foco está en un campo de texto o un combo que no es la línea de comandos? Ahí se escribe normal. */
function inOtherField(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el || el.getAttribute('data-testid') === 'command-input') return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

export default function App() {
  const openHelp = useStore((s) => s.openHelp)
  const toggleOrtho = useStore((s) => s.toggleOrtho)
  const toggleSnap = useStore((s) => s.toggleSnap)
  const toggleEsnap = useStore((s) => s.toggleEsnap)
  const toggleOtrack = useStore((s) => s.toggleOtrack)
  const toggleDynInput = useStore((s) => s.toggleDynInput)
  const togglePolar = useStore((s) => s.togglePolar)
  const email = useStore((s) => s.email)
  const token = useStore((s) => s.token)
  const docName = useStore((s) => s.docName)
  const docFolder = useStore((s) => s.docFolder)
  const docId = useStore((s) => s.docId)
  const setDocPath = useStore((s) => s.setDocPath)
  const openLoginDialog = useStore((s) => s.openLoginDialog)
  const logout = useStore((s) => s.logout)
  const restoreSession = useStore((s) => s.restoreSession)
  const palette = useStore((s) => s.propsPalette)
  const toggleProperties = useStore((s) => s.toggleProperties)
  const autosave = useStore((s) => s.autosave)
  const fsFolderName = useStore((s) => s.fsFolderName)
  const fsFilePath = useStore((s) => s.fsFilePath)
  const fsPending = useStore((s) => s.fsPending)
  const fsSupported = useStore((s) => s.fsSupported)
  const pickWorkspaceFolder = useStore((s) => s.pickWorkspaceFolder)
  const reconnectWorkspace = useStore((s) => s.reconnectWorkspace)
  const toggleAutosave = useStore((s) => s.toggleAutosave)
  const lastSavedRev = useRef(-1)
  const cleanScreen = useStore((s) => s.cleanScreen)

  // Restaura sólo el estado de UI; el JWT real nunca es accesible desde JavaScript.
  useEffect(() => {
    void restoreSession()
  }, [restoreSession])

  // Cerrar o recargar la pestaña con cambios sin guardar pide confirmación al navegador (el dibujo que se
  // muestra al arrancar cuenta como guardado).
  useEffect(() => {
    useStore.getState().markSaved()
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useStore.getState().isDirty()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Autoguardado cada 2 min, si el documento cambió desde el último guardado. Guarda en la cuenta
  // (si hay sesión) o sobre el archivo abierto de la carpeta local; un dibujo local que
  // todavía no se guardó nunca no se crea solo: hace falta un SAVE explícito.
  useEffect(() => {
    if (!autosave) return
    const id = setInterval(() => {
      const s = useStore.getState()
      if (!canAutosave(s)) return
      const rev = s.doc.revision
      if (rev === lastSavedRev.current) return
      lastSavedRev.current = rev
      void s.saveDocument()
    }, 120_000)
    return () => clearInterval(id)
  }, [autosave])

  // App instalable: el botón aparece cuando el navegador ofrece instalarla.
  const [installable, setInstallable] = useState(canInstall())
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), [])

  // Pantalla completa recordada: los navegadores sólo la permiten tras un gesto, así que se reactiva
  // con el primer clic o tecla; si el usuario sale (mantener Esc, F11 del navegador), queda anotado.
  useEffect(() => {
    const st = useStore.getState
    const onChange = () => {
      if (!document.fullscreenElement && st().fullscreen) st().setFullscreen(false, false)
    }
    const onGesture = () => {
      if (st().fullscreen && !document.fullscreenElement) void enterFullscreen()
    }
    document.addEventListener('fullscreenchange', onChange)
    window.addEventListener('pointerdown', onGesture, true)
    window.addEventListener('keydown', onGesture, true)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('pointerdown', onGesture, true)
      window.removeEventListener('keydown', onGesture, true)
    }
  }, [])

  // El foco no se queda en la nada: si cae en el body (un menú o un panel que se cierra, un botón que desaparece),
  // vuelve a la línea de comandos, salvo que haya un cuadro de diálogo abierto o texto marcado para copiar.
  useEffect(() => {
    let down = false
    const settle = () => {
      if (down || document.activeElement !== document.body || document.querySelector('.modal-backdrop')) return
      if (!document.getSelection()?.isCollapsed) return
      focusCommandLine()
    }
    const onFocusOut = () => setTimeout(settle, 0)
    const onDown = () => (down = true)
    const onUp = (e: PointerEvent) => {
      down = false
      if (e.pointerType !== 'touch') setTimeout(settle, 0) // en un teléfono no se abre el teclado con cada toque
    }
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    return () => {
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Como el CAD clásico: escribir con el cursor en cualquier lado va a la línea de comandos, salvo que se esté
      // escribiendo en otro campo de texto o haya un cuadro de diálogo abierto. El foco cambia antes
      // de que llegue la tecla.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !inOtherField() && !document.querySelector('.modal-backdrop')) {
        const el = document.activeElement as HTMLElement | null
        const onButton = !!el && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button')
        if (!(e.key === ' ' && onButton)) focusCommandLine()
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === '0' || e.key === '9')) {
        // Ctrl+0 = pantalla limpia, Ctrl+9 = línea de comandos compacta (el CAD clásico).
        e.preventDefault()
        const s = useStore.getState()
        if (e.key === '0') s.setScreen({ cleanScreen: !s.cleanScreen })
        else s.setScreen({ commandLineCompact: !s.commandLineCompact })
        return
      }
      // Portapapeles del dibujo (CAD clásico): Ctrl+C, Ctrl+X, Ctrl+Shift+C y Ctrl+V. Si hay texto marcado (en la
      // línea de comandos o en la página), el atajo queda para el texto.
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'c' || k === 'x' || k === 'v') && !editingText() && !inOtherField()) {
        const el = document.activeElement as HTMLInputElement | null
        const textMarked = !!window.getSelection()?.toString() || (!!el && typeof el.selectionStart === 'number' && el.selectionStart !== el.selectionEnd)
        const s = useStore.getState()
        if (!textMarked && !s.engine.busy) {
          const cmd = k === 'v' ? 'PASTECLIP' : k === 'x' ? 'CUTCLIP' : e.shiftKey ? 'COPYBASE' : 'COPYCLIP'
          if (k === 'v' || s.selection.length || cmd === 'COPYBASE') {
            e.preventDefault()
            s.submitCommand(cmd)
            return
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && e.shiftKey && !e.altKey && !editingText() && !inOtherField()) {
        // Ctrl+Shift+A = selección de grupos sí/no (PICKSTYLE), como el CAD clásico.
        e.preventDefault()
        useStore.getState().togglePickstyle()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && !e.shiftKey && !e.altKey) {
        // Ctrl+A = seleccionar todo (CAD clásico), salvo que se esté escribiendo en un campo.
        if (!editingText() && !inOtherField()) {
          e.preventDefault()
          useStore.getState().selectAll()
        }
        return
      }
      if (e.key === 'F7') {
        // F7 = mostrar u ocultar la grilla.
        e.preventDefault()
        useStore.getState().setGrid()
      } else if (e.key === 'F8') {
        e.preventDefault()
        toggleOrtho()
      } else if (e.key === 'F9') {
        e.preventDefault()
        toggleSnap()
      } else if (e.key === 'F3') {
        e.preventDefault()
        toggleEsnap()
      } else if (e.key === 'F11') {
        // F11 = object snap tracking (CAD clásico); se evita el pantalla completa del navegador.
        e.preventDefault()
        toggleOtrack()
      } else if (e.key === 'F10' && !e.shiftKey) {
        // F10 = rastreo polar (CAD clásico); Shift+F10 sigue siendo el menú contextual.
        e.preventDefault()
        togglePolar()
      } else if (e.key === 'F12') {
        // F12 = entrada dinámica (CAD clásico): coordenadas relativas sin '@' tras el primer punto.
        e.preventDefault()
        toggleDynInput()
      } else if (e.key === 'Delete') {
        // Suprimir: borra la selección cuando no hay comando activo ni se está tecleando.
        const s = useStore.getState()
        const el = document.activeElement as HTMLInputElement | null
        const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value !== ''
        if (!typing && s.prompt === '' && s.selection.length > 0) {
          e.preventDefault()
          s.deleteSelection()
        }
      } else if (e.key === 'Escape') {
        // Esc cierra el cuadro de diálogo de arriba, como su ✕.
        const dialogs = document.querySelectorAll('.modal-backdrop')
        const top = dialogs[dialogs.length - 1]
        if (top) {
          e.preventDefault()
          top.querySelector<HTMLElement>('[aria-label="Close"]')?.click()
          return
        }
        // ESC global: si el foco no está en la línea de comandos (que ya la maneja), cancela y
        // deselecciona igual (permite deseleccionar con el cursor sobre el viewport).
        const el = document.activeElement as HTMLElement | null
        const inCmd = el?.getAttribute('data-testid') === 'command-input'
        if (!inCmd) useStore.getState().cancel()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        // Ctrl+Z = undo del modelo (salvo que se esté editando texto en un campo).
        if (!editingText()) {
          e.preventDefault()
          useStore.getState().undo()
        }
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))
      ) {
        // Ctrl+Y (o Ctrl+Shift+Z) = redo.
        if (!editingText()) {
          e.preventDefault()
          useStore.getState().redo()
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R') && !e.shiftKey) {
        // Ctrl+R = siguiente viewport (CAD clásico); se evita la recarga del navegador.
        e.preventDefault()
        useStore.getState().cycleViewport()
      } else if (e.ctrlKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
        // Ctrl+PgUp/PgDn = pestaña anterior/siguiente (Model, Layout1, …), como el CAD clásico.
        e.preventDefault()
        useStore.getState().cycleTab(e.key === 'PageUp' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleOrtho, toggleSnap, toggleEsnap, toggleOtrack, toggleDynInput, togglePolar])

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="icon-btn"
          title="Show/hide the Properties palette (PROPERTIES)"
          onClick={toggleProperties}
          data-testid="toggle-sidebar"
        >
          ☰
        </button>
        <span className="brand" title="Cota — free CAD in your browser" aria-label="Cota" dangerouslySetInnerHTML={{ __html: BRAND_HTML }} />
        <input
          className="doc-name-input"
          value={docFolder ? `${docFolder}/${docName}` : docName}
          onChange={(e) => setDocPath(e.target.value)}
          title="Drawing name / project folder (editable). Use folder/subfolder/name"
          aria-label="Drawing name and folder"
          spellCheck={false}
          autoComplete="off"
          data-testid="doc-name"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            color: 'inherit',
            font: 'inherit',
            padding: '2px 6px',
            borderRadius: 4,
            minWidth: 120,
            maxWidth: 320,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#555')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
        />
        {/* El dibujo está "guardado" si tiene documento en la nube o archivo en la carpeta local. */}
        <span className="muted" title={docId || fsFilePath ? 'Saved' : 'Unsaved'}>{docId || fsFilePath ? '' : '*'}</span>
        {/* Carpeta de trabajo del sistema: SAVE/OPEN usan archivos reales de esa carpeta. */}
        <button
          className={'btn workspace-btn' + (fsFolderName && !fsPending ? ' on' : '')}
          data-testid="workspace-button"
          title={
            fsPending
              ? `Reconnect "${fsFolderName}" (the browser needs your confirmation again)`
              : fsFolderName
                ? `Working folder: ${fsFolderName}${fsFilePath ? ` — ${fsFilePath}` : ''} (click to change)`
                : fsSupported
                  ? 'Choose a system folder for your drawings (OPENFOLDER)'
                  : 'This browser cannot open system folders (Chrome/Edge required): drawings are stored in your account'
          }
          onClick={() => void (fsPending ? reconnectWorkspace() : pickWorkspaceFolder())}
        >
          {fsPending ? `📁 ${fsFolderName} · Reconnect` : fsFolderName ? `📁 ${fsFolderName}` : CLOUD_ENABLED ? '☁ Cloud' : '📁 Choose folder'}
        </button>
        {/* Barra única: los menús van en la misma línea que la barra superior. */}
        <CommandBar />
        <div className="spacer" />
        {installable && !isStandalone() && (
          <button className="btn" onClick={() => void promptInstall()} title="Install Cota as an app: its own window, without the address bar, with a desktop shortcut; works offline" data-testid="install-app">
            Install app
          </button>
        )}
        <button
          className={'btn' + (autosave ? ' on' : '')}
          onClick={toggleAutosave}
          title="Toggle autosave (every 2 min)"
          data-testid="autosave-toggle"
          aria-pressed={autosave}
        >
          Autosave {autosave ? 'on' : 'off'}
        </button>
        <button className="btn" onClick={openHelp} data-testid="help-button">
          Help
        </button>
        {token ? (
          <>
            <span className="muted" data-testid="user-email">
              {email}
            </span>
            <button className="btn" onClick={logout} data-testid="logout-button">
              Logout
            </button>
          </>
        ) : (
          CLOUD_ENABLED && <button className="btn" onClick={openLoginDialog} data-testid="login-button">
            Login
          </button>
        )}
      </header>

      <div className="main">
        {/* La paleta acoplada a la izquierda va antes del área de dibujo; flotante se posiciona sola. */}
        {/* Pantalla limpia (Ctrl+0): sin paletas ni barras de herramientas. */}
        {!cleanScreen && palette.open && palette.dock !== 'right' && <PropertiesPalette />}
        {/* Barras acopladas a los cuatro bordes del dibujo; la pantalla limpia (Ctrl+0) las oculta. */}
        <section className="center">
          {!cleanScreen && <ToolbarDock side="top" />}
          {!cleanScreen && <ToolbarDock side="left" />}
          <ViewportView />
          {!cleanScreen && <ToolbarDock side="right" />}
          {!cleanScreen && <ToolbarDock side="bottom" />}
          <StatusBar />
        </section>
        {!cleanScreen && palette.open && palette.dock === 'right' && <PropertiesPalette />}
      </div>

      {!cleanScreen && <FloatingToolbars />}
      <ToolbarDialog />
      <CommandLine />
      <HelpDialog />
      <LoginDialog />
      <OpenDialog />
      <OptionsDialog />
      <OsnapDialog />
      <DimStyleDialog />
      <DimContextMenu />
      <ContextMenu />
      <DwgPropsDialog />
      <AttEditDialog />
      <PageSetupDialog />
      <TemplateDialog />
      <LayerDialog />
      <LinetypeDialog />
      <HatchPanel />
      <RealtimeMenu />
      <AiDialog />
      <FlatshotDialog />
      <PlotDialog />
      <QSelectDialog />
      <ViewGenDialog />
    </div>
  )
}
