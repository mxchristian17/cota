import { useStore } from '../store/store'
import { ABOUT } from '../core/about'

export function HelpDialog() {
  const open = useStore((s) => s.helpOpen)
  const close = useStore((s) => s.closeHelp)
  const listCommands = useStore((s) => s.listCommands)
  if (!open) return null

  const commands = listCommands()

  return (
    <div className="modal-backdrop" onClick={close} data-testid="help-dialog">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Available commands</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="help-about" data-testid="help-about">
          {ABOUT.name} {ABOUT.version} · © {ABOUT.year} {ABOUT.author} · {ABOUT.license} ·{' '}
          <a href={ABOUT.url} target="_blank" rel="noreferrer">
            {ABOUT.url.replace('https://', '')}
          </a>{' '}
          ·{' '}
          <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`} target="_blank" rel="noreferrer" data-testid="third-party-licenses">
            Third-party licenses
          </a>
        </p>
        <table className="help-table">
          <thead>
            <tr>
              <th>Command</th>
              <th>Aliases</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((c) => (
              <tr key={c.name}>
                <td className="mono">{c.name}</td>
                <td className="mono muted">{c.aliases.join(', ') || '—'}</td>
                <td>{c.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="help-hint">
          Type a command in the command line, then follow the prompts. Coordinates: absolute
          <span className="mono"> x,y</span>, relative <span className="mono">@dx,dy</span>, polar
          <span className="mono"> @dist&lt;ang</span> (with dynamic input, F12, <span className="mono">x,y</span> after the
          first point is relative and <span className="mono">#x,y</span> absolute). Press <span className="mono">Enter</span> to finish,
          <span className="mono"> Esc</span> to cancel. Pan with the middle button, orbit with the right button, zoom with the wheel.
        </p>
      </div>
    </div>
  )
}
