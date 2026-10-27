import { Component, Fragment, useEffect, useState, type ReactNode } from 'react'
import { dismissError, reportError, subscribeErrors, type AppError } from '../core/errors'

/** Avisos cerrables de los errores inesperados (arriba, centrados). */
export function ErrorBanner() {
  const [list, setList] = useState<AppError[]>([])
  useEffect(() => subscribeErrors(setList), [])
  if (!list.length) return null
  return (
    <div className="error-banners" role="alert" data-testid="error-banner" translate="no">
      {list.map((e) => (
        <div key={e.id} className="error-banner">
          <span>{e.message}</span>
          <button title="Close" aria-label="Close" data-testid="error-banner-close" onClick={() => dismissError(e.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

interface GuardState {
  key: number
  caught: boolean
  failed: boolean
}

/**
 * Si la interfaz falla al dibujarse, se avisa y se vuelve a montar (el dibujo vive en el store, no se pierde).
 * Sólo si vuelve a fallar enseguida queda un aviso con la opción de recargar, nunca la pantalla gris.
 */
export class ErrorGuard extends Component<{ children: ReactNode }, GuardState> {
  state: GuardState = { key: 0, caught: false, failed: false }
  private last = 0

  static getDerivedStateFromError(): Partial<GuardState> {
    return { caught: true }
  }

  componentDidCatch(err: Error): void {
    reportError('Interface error', err)
    const now = Date.now()
    const again = now - this.last < 3000
    this.last = now
    this.setState((s) => (again ? { ...s, failed: true } : { key: s.key + 1, caught: false, failed: false }))
  }

  render() {
    if (this.state.failed)
      return (
        <div className="error-fallback" data-testid="error-fallback">
          <p>The interface stopped after an unexpected error.</p>
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      )
    if (this.state.caught) return null
    return <Fragment key={this.state.key}>{this.props.children}</Fragment>
  }
}
