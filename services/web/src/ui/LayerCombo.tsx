import { shownLayer } from '../core/layers/selectionLayer'
import { useStore } from '../store/store'

/** Valor del combo cuando la selección abarca varias capas: se muestra, pero no se puede elegir. */
const SEVERAL = '__several__'

/**
 * Combo de capas (barras y barra de estado): muestra la capa de los objetos seleccionados, con "(+N)" si son varias, y
 * vuelve a la actual al deseleccionar. Elegir una capa con objetos seleccionados los mueve a ella; si no, la hace actual.
 */
export function LayerCombo({ className, testId, onPicked }: { className: string; testId: string; onPicked: () => void }) {
  useStore((s) => s.version) // refresca capas y objetos movidos
  useStore((s) => s.prompt) // al entrar en un comando, los controles vuelven a la capa actual
  const doc = useStore((s) => s.doc)
  const engine = useStore((s) => s.engine)
  const layerSvc = useStore((s) => s.layerSvc)
  const currentLayerId = useStore((s) => s.currentLayerId)
  const selection = useStore((s) => s.selection)
  const setCurrentLayer = useStore((s) => s.setCurrentLayer)
  const shown = shownLayer(currentLayerId, engine.busy ? [] : selection.map((id) => doc.getEntity(id)))
  const several = shown.others > 0
  return (
    <select
      className={className}
      title="Layer of the selected objects (choosing one moves them to it); with nothing selected, the current layer"
      value={several ? SEVERAL : shown.id}
      data-testid={testId}
      onChange={(e) => {
        if (e.target.value !== SEVERAL) setCurrentLayer(e.target.value)
        onPicked()
      }}
    >
      {several && (
        <option value={SEVERAL} hidden>
          {`${layerSvc.get(shown.id)?.name ?? ''} (+${shown.others})`}
        </option>
      )}
      {layerSvc.list().map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  )
}
