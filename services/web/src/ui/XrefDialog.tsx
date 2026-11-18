import { useStore } from '../store/store'
import { xrefFileName } from '../core/io/xref'

const STATUS: Record<string, string> = { missing: 'Not found', loading: 'Reading…', loaded: 'Loaded', error: 'Could not be read' }

/**
 * Referencias externas que faltan al abrir un DWG/DXF: antes de terminar de abrirlo, deja elegir el archivo de cada una
 * (el navegador no puede leer la ruta con que se guardaron). Las que no se eligen quedan vacías en el dibujo.
 */
export function XrefDialog() {
  const ask = useStore((s) => s.xrefAsk)
  const browse = useStore((s) => s.xrefBrowse)
  const finish = useStore((s) => s.xrefFinish)
  if (!ask) return null
  const busy = ask.items.some((it) => it.status === 'loading')
  const loaded = ask.items.filter((it) => it.status === 'loaded').length
  return (
    <div className="modal-backdrop" data-testid="xref-dialog">
      <div className="modal xref-modal" role="dialog" aria-modal="true" aria-labelledby="xref-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="xref-title">External references not found</h2>
        </div>
        <p className="xref-intro">
          This drawing uses other drawings that could not be found. Choose each file to open it with the drawing, or go on
          without them (they stay empty).
        </p>
        <table className="xref-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Saved path</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ask.items.map((it) => (
              <tr key={it.name} data-testid={`xref-row-${it.name}`}>
                <td>{it.name}</td>
                <td className="xref-path" title={it.path}>
                  {it.path || '—'}
                </td>
                <td className={'xref-status is-' + it.status} title={it.message}>
                  {STATUS[it.status]}
                  {it.file && it.status !== 'missing' ? `: ${it.file}` : ''}
                </td>
                <td>
                  <button className="btn" disabled={it.status === 'loading'} onClick={() => browse(it.name)} data-testid={`xref-browse-${it.name}`} title={`Choose ${xrefFileName(it.path) || 'the file'}`}>
                    Browse…
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="btn primary" disabled={busy} onClick={finish} data-testid="xref-open">
            {loaded ? `Open with ${loaded} reference(s)` : 'Open without them'}
          </button>
        </div>
      </div>
    </div>
  )
}
