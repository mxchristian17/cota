import { describe, it, expect, beforeEach } from 'vitest'
import { DocumentModel } from '../document/DocumentModel'
import { CommandEngine } from './CommandEngine'
import { registerDefaultCommands } from './registry'
import { WORLD_UCS } from '../ucs'
import type {
  ArcEntity,
  CircleEntity,
  EllipseEntity,
  LineEntity,
  PolylineEntity,
  RectangleEntity,
  SolidEntity,
} from '../document/types'
import { arcEndpoints, arcIsClockwise, arcTangentAt, sweepOf } from '../geom/arc'
import { isEllipseArc } from '../geom/ellipse'

const flush = () => new Promise((r) => setTimeout(r, 0))

const setup = () => {
  const doc = DocumentModel.createDefault()
  const prints: string[] = []
  let helpOpened = false
  let ortho = false
  let selection: string[] = []
  let cursor = { x: 0, y: 0, z: 0 }
  const engine = new CommandEngine({
    doc,
    currentLayerId: () => '0',
    isOrtho: () => ortho,
    currentCursor: () => cursor,
    currentUcs: () => WORLD_UCS,
    currentSelection: () => selection,
    onSelectionChange: (ids) => {
      selection = ids
    },
    app: {
      newDocument: () => {},
      openDialog: () => {},
      save: () => {},
      docName: () => 'drawing1',
      loginDialog: () => {},
      isAuthenticated: () => false,
      undo: () => {},
      redo: () => {},
      clearSelection: () => {
        selection = []
      },
      setUcs: () => {},
      setView: () => {},
      setCameraMode: () => {},
      constructionNormal: () => [0, 0, 1],
      zoomExtents: () => {},
      zoomWindow: () => {},
      openDimStyle: () => {},
      setViewportLayout: () => {},
      exportPdf: () => {},
      importFile: () => {},
      openFromDevice: () => {},
      visualStyle: () => '2dwireframe',
      exportModel: () => {},
      openOptions: () => {},
      openOsnap: () => {},
      setVisualStyle: () => {},
      toggleProperties: () => {},
      openLayers: () => {},
      pickWorkspaceFolder: () => {},
      useCloudStorage: () => {},
      workspaceName: () => null,
      redraw: () => {},
      openDwgProps: () => {},
      editAttributes: async () => null,
      openPageSetup: () => {},
      publish: () => {},
      openTemplateDialog: () => {},
      saveLayoutTemplate: () => {},
      sheetInit: () => undefined,
      openAi: () => {},
      projectOrthographic: () => 0,
    },
    onPrompt: () => {},
    onPrint: (l) => prints.push(l),
    onChange: () => {},
    onOpenHelp: () => {
      helpOpened = true
    },
    onBeforeCommand: () => {},
    onAfterCommand: () => {},
  })
  registerDefaultCommands(engine)
  return {
    doc,
    engine,
    prints,
    helpOpened: () => helpOpened,
    setOrtho: (v: boolean) => {
      ortho = v
    },
    setCursor: (p: { x: number; y: number; z: number }) => {
      cursor = p
    },
    setSelection: (s: string[]) => {
      selection = s
    },
    getSelection: () => selection,
  }
}

describe('CommandEngine', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })

  it('LINE crea segmentos entre puntos y termina con Enter vacío', async () => {
    const { engine, doc } = ctx
    engine.submitText('LINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,0')
    await flush()
    engine.submitText('@0,10')
    await flush()
    engine.submitText('') // Enter -> finaliza
    await flush()

    expect(doc.entities).toHaveLength(2)
    const l0 = doc.entities[0] as LineEntity
    expect(l0.type).toBe('LINE')
    expect(l0.props.start).toEqual([0, 0, 0])
    expect(l0.props.end).toEqual([10, 0, 0])
    const l1 = doc.entities[1] as LineEntity
    expect(l1.props.end).toEqual([10, 10, 0])
  })

  it('LINE Undo elimina el último segmento', async () => {
    const { engine, doc } = ctx
    engine.submitText('L') // alias
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,0')
    await flush()
    engine.submitText('20,0')
    await flush()
    expect(doc.entities).toHaveLength(2)
    engine.submitText('Undo')
    await flush()
    expect(doc.entities).toHaveLength(1)
    engine.submitText('')
    await flush()
  })

  it('CIRCLE crea un círculo con centro y radio', async () => {
    const { engine, doc } = ctx
    engine.submitText('CIRCLE')
    await flush()
    engine.submitText('5,5')
    await flush()
    engine.submitText('10') // radio como número
    await flush()

    expect(doc.entities).toHaveLength(1)
    const c = doc.entities[0] as CircleEntity
    expect(c.type).toBe('CIRCLE')
    expect(c.props.center).toEqual([5, 5, 0])
    expect(c.props.radius).toBe(10)
  })

  it('CIRCLE acepta un punto como radio (distancia al centro)', async () => {
    const { engine, doc } = ctx
    engine.submitText('C')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('3,4') // distancia = 5
    await flush()
    const c = doc.entities[0] as CircleEntity
    expect(c.props.radius).toBeCloseTo(5, 6)
  })

  it('submitPoint (click) alimenta el punto pendiente', async () => {
    const { engine, doc } = ctx
    engine.submitText('LINE')
    await flush()
    engine.submitPoint({ x: 1, y: 2, z: 0 })
    await flush()
    engine.submitPoint({ x: 3, y: 4, z: 0 })
    await flush()
    engine.submitText('')
    await flush()
    const l = doc.entities[0] as LineEntity
    expect(l.props.start).toEqual([1, 2, 0])
    expect(l.props.end).toEqual([3, 4, 0])
  })

  it('comando desconocido informa el error', async () => {
    const { engine, prints } = ctx
    engine.submitText('FOO')
    await flush()
    expect(prints.some((p) => p.includes('Unknown command: FOO'))).toBe(true)
  })

  it('HELP abre el panel y lista los comandos', async () => {
    const { engine, prints, helpOpened } = ctx
    engine.submitText('HELP')
    await flush()
    expect(helpOpened()).toBe(true)
    expect(prints.some((p) => p.includes('LINE'))).toBe(true)
    expect(prints.some((p) => p.includes('CIRCLE'))).toBe(true)
  })

  it('ORTHO restringe el punto de click al eje dominante', async () => {
    const { engine, doc, setOrtho } = ctx
    setOrtho(true)
    engine.submitText('LINE')
    await flush()
    engine.submitPoint({ x: 0, y: 0, z: 0 })
    await flush()
    // cursor con más desplazamiento en X -> se fuerza y = base.y
    engine.submitPoint({ x: 50, y: 8, z: 0 })
    await flush()
    engine.submitText('')
    await flush()
    const l = doc.entities[0] as LineEntity
    expect(l.props.end).toEqual([50, 0, 0])
  })

  it('computePreview devuelve el segmento rubber-band durante LINE', async () => {
    const { engine } = ctx
    engine.submitText('LINE')
    await flush()
    engine.submitPoint({ x: 0, y: 0, z: 0 })
    await flush()
    const shapes = engine.computePreview({ x: 10, y: 5, z: 0 })
    expect(shapes).toHaveLength(1)
    expect(shapes[0]).toMatchObject({ kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 5 } })
  })

  it('computePreview aplica ORTHO al rubber-band', async () => {
    const { engine, setOrtho } = ctx
    setOrtho(true)
    engine.submitText('LINE')
    await flush()
    engine.submitPoint({ x: 0, y: 0, z: 0 })
    await flush()
    const shapes = engine.computePreview({ x: 10, y: 3, z: 0 })
    expect(shapes[0]).toMatchObject({ kind: 'line', b: { x: 10, y: 0 } })
  })

  it('direct distance entry: número + dirección del cursor', async () => {
    const { engine, doc, setCursor } = ctx
    engine.submitText('LINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    setCursor({ x: 100, y: 0, z: 0 }) // dirección +X
    engine.submitText('50') // largo 50 en esa dirección
    await flush()
    engine.submitText('')
    await flush()
    const l = doc.entities[0] as LineEntity
    expect(l.props.end[0]).toBeCloseTo(50, 6)
    expect(l.props.end[1]).toBeCloseTo(0, 6)
  })

  it('direct distance entry respeta ORTHO', async () => {
    const { engine, doc, setCursor, setOrtho } = ctx
    setOrtho(true)
    engine.submitText('LINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    setCursor({ x: 80, y: 12, z: 0 }) // mayor delta en X -> eje X
    engine.submitText('30')
    await flush()
    engine.submitText('')
    await flush()
    const l = doc.entities[0] as LineEntity
    expect(l.props.end[0]).toBeCloseTo(30, 6)
    expect(l.props.end[1]).toBeCloseTo(0, 6)
  })

  it('PLINE se cierra con la tecla "c"', async () => {
    const { engine, doc } = ctx
    engine.submitText('PLINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,0')
    await flush()
    engine.submitText('10,10')
    await flush()
    engine.submitText('c') // abreviatura de Close
    await flush()
    const pl = doc.entities[0] as PolylineEntity
    expect(pl.type).toBe('POLYLINE')
    expect(pl.props.closed).toBe(true)
  })

  it('PLINE crea una polilínea y [Close] la cierra', async () => {
    const { engine, doc } = ctx
    engine.submitText('PLINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,0')
    await flush()
    engine.submitText('10,10')
    await flush()
    engine.submitText('Close')
    await flush()
    expect(doc.entities).toHaveLength(1)
    const pl = doc.entities[0] as PolylineEntity
    expect(pl.type).toBe('POLYLINE')
    expect(pl.props.closed).toBe(true)
    expect(pl.props.vertices).toHaveLength(3)
  })

  it('RECTANGLE crea un rectángulo por dos esquinas', async () => {
    const { engine, doc } = ctx
    engine.submitText('REC')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('20,10')
    await flush()
    const r = doc.entities[0] as RectangleEntity
    expect(r.type).toBe('RECTANGLE')
    expect(r.props.width).toBe(20)
    expect(r.props.height).toBe(10)
    expect(r.props.corner).toEqual([0, 0, 0])
  })

  it('ERASE elimina los objetos seleccionados por click', async () => {
    const { engine, doc } = ctx
    // dibujar una línea
    engine.submitText('LINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,0')
    await flush()
    engine.submitText('')
    await flush()
    const id = doc.entities[0].id

    engine.submitText('ERASE')
    await flush()
    engine.submitClick({ x: 0, y: 0, z: 0 }, id) // pick
    await flush()
    engine.submitText('') // finalizar selección
    await flush()
    expect(doc.entities).toHaveLength(0)
  })

  it('MOVE traslada la selección de base a destino', async () => {
    const { engine, doc } = ctx
    engine.submitText('LINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,0')
    await flush()
    engine.submitText('')
    await flush()
    const id = doc.entities[0].id

    engine.submitText('MOVE')
    await flush()
    engine.submitClick({ x: 0, y: 0, z: 0 }, id)
    await flush()
    engine.submitText('') // fin selección
    await flush()
    engine.submitText('0,0') // base
    await flush()
    engine.submitText('5,5') // destino
    await flush()
    const l = doc.entities[0] as LineEntity
    expect(l.props.start).toEqual([5, 5, 0])
    expect(l.props.end).toEqual([15, 5, 0])
  })

  it('EXTRUDE convierte un perfil cerrado en un SOLID3D', async () => {
    const { engine, doc } = ctx
    engine.submitText('RECTANGLE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,10')
    await flush()
    const rectId = doc.entities[0].id

    engine.submitText('EXTRUDE')
    await flush()
    engine.submitClick({ x: 0, y: 0, z: 0 }, rectId)
    await flush()
    engine.submitText('') // fin selección
    await flush()
    engine.submitText('20') // altura
    await flush()

    expect(doc.entities).toHaveLength(1)
    const solid = doc.entities[0] as SolidEntity
    expect(solid.type).toBe('SOLID3D')
    expect(solid.props.op).toBe('EXTRUDE')
    if (solid.props.op === 'EXTRUDE') {
      expect(solid.props.height).toBe(20)
      expect(solid.props.profile).toHaveLength(4)
    }
  })

  it('UNION combina dos sólidos en un árbol booleano', async () => {
    const { engine, doc } = ctx
    const a = doc.addEntity({
      type: 'SOLID3D',
      layer: '0',
      props: { op: 'EXTRUDE', profile: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]], height: 5 },
    })
    const b = doc.addEntity({
      type: 'SOLID3D',
      layer: '0',
      props: { op: 'EXTRUDE', profile: [[5, 5, 0], [15, 5, 0], [15, 15, 0], [5, 15, 0]], height: 5 },
    })

    engine.submitText('UNION')
    await flush()
    engine.submitClick({ x: 0, y: 0, z: 0 }, a.id)
    await flush()
    engine.submitClick({ x: 0, y: 0, z: 0 }, b.id)
    await flush()
    engine.submitText('') // fin selección
    await flush()

    expect(doc.entities).toHaveLength(1)
    const solid = doc.entities[0] as SolidEntity
    expect(solid.props.op).toBe('UNION')
    if (solid.props.op === 'UNION') expect(solid.props.operands).toHaveLength(2)
  })

  it('LINE con Close convierte los segmentos en una POLYLINE cerrada', async () => {
    const { engine, doc } = ctx
    engine.submitText('LINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,0')
    await flush()
    engine.submitText('10,10')
    await flush()
    engine.submitText('Close')
    await flush()
    expect(doc.entities).toHaveLength(1)
    const e = doc.entities[0]
    expect(e.type).toBe('POLYLINE')
    if (e.type === 'POLYLINE') {
      expect(e.props.closed).toBe(true)
      expect(e.props.vertices).toHaveLength(3)
    }
  })

  it('override de snap de un solo uso (cen/end/…) se fija y se consume con la captura', async () => {
    const { engine } = ctx
    engine.submitText('LINE')
    await flush()
    engine.submitText('cen') // no resuelve el punto; fija el override
    await flush()
    expect(engine.osnapOverride()).toBe('center')
    expect(engine.hasPending).toBe(true) // sigue esperando el punto
    engine.submitPoint({ x: 5, y: 5, z: 0 })
    await flush()
    expect(engine.osnapOverride()).toBeNull() // consumido
    engine.cancel()
  })

  it('ESC cancela el comando en curso', async () => {
    const { engine, doc } = ctx
    engine.submitText('LINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.cancel()
    await flush()
    expect(doc.entities).toHaveLength(0)
    expect(engine.busy).toBe(false)
  })

  it('pre-selección (noun-verb): ERASE con algo seleccionado no vuelve a pedir selección', async () => {
    const { engine, doc, setSelection } = ctx
    const e = doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } })
    setSelection([e.id])
    engine.submitText('ERASE')
    await flush()
    expect(engine.hasPending).toBe(false) // no pidió selección
    expect(doc.entities).toHaveLength(0) // borró la pre-selección
  })

  it('DIST mide distancia y deltas entre dos puntos (3-4-5)', async () => {
    const { engine, prints } = ctx
    engine.submitText('DIST')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('3,4')
    await flush()
    expect(prints.some((l) => l.includes('Distance = 5.0000'))).toBe(true)
    expect(prints.some((l) => l.includes('Delta X = 3.0000') && l.includes('Delta Y = 4.0000'))).toBe(true)
  })

  it('sin selección previa, ERASE sí pide seleccionar objetos', async () => {
    const { engine, doc } = ctx
    doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } })
    engine.submitText('ERASE')
    await flush()
    expect(engine.isSelecting).toBe(true) // espera selección interactiva
    engine.cancel()
  })

  it('osnap tiene prioridad sobre ORTHO; sin snap ORTHO 3D permite el eje Z', async () => {
    const { engine, setOrtho } = ctx
    setOrtho(true)
    const c = (engine as unknown as { ctx: import('./types').CommandContext }).ctx
    // Punto base = origen.
    const p0 = c.getPoint('base: ')
    engine.submitPoint({ x: 0, y: 0, z: 0 })
    await p0
    // Con snap: el punto exacto (2,1,50) NO se reconstriñe por ORTHO.
    const p1 = c.getPoint('dest: ', { base: { x: 0, y: 0, z: 0 } })
    engine.submitClick({ x: 2, y: 1, z: 50 }, null, true)
    const r1 = await p1
    expect(r1).toMatchObject({ kind: 'point', point: { x: 2, y: 1, z: 50 } })
    // Sin snap: ORTHO 3D elige el eje dominante (Z) → (0,0,50).
    const p2 = c.getPoint('dest: ', { base: { x: 0, y: 0, z: 0 } })
    engine.submitClick({ x: 2, y: 1, z: 50 }, null, false)
    const r2 = await p2
    expect(r2).toMatchObject({ kind: 'point', point: { x: 0, y: 0, z: 50 } })
  })

  it('getString devuelve el texto tecleado y el default con Enter vacío', async () => {
    const { engine } = ctx
    const ctxAny = (engine as unknown as { ctx: import('./types').CommandContext }).ctx
    // texto explícito
    const p1 = ctxAny.getString('Name: ', { default: 'drawing1' })
    engine.submitText('plano-a')
    expect(await p1).toBe('plano-a')
    // Enter vacío -> default
    const p2 = ctxAny.getString('Name: ', { default: 'drawing1' })
    engine.submitText('')
    expect(await p2).toBe('drawing1')
    // ESC -> null
    const p3 = ctxAny.getString('Name: ', { default: 'drawing1' })
    engine.cancel()
    expect(await p3).toBeNull()
  })
  // --- ---------------------------------------------------------------

  it('ignora el prefijo _ de los comandos y de las keywords (macros del CAD clásico)', async () => {
    const { engine, doc } = ctx
    engine.submitText('_circle')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('5')
    await flush()
    expect(doc.entities).toHaveLength(1)
    expect(doc.entities[0].type).toBe('CIRCLE')

    // keyword con guion bajo: _Close cierra la polilínea
    engine.submitText('_PLINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,0')
    await flush()
    engine.submitText('10,10')
    await flush()
    engine.submitText('_Close')
    await flush()
    const pl = doc.entities[1] as PolylineEntity
    expect(pl.type).toBe('POLYLINE')
    expect(pl.props.closed).toBe(true)
  })

  it('un comando inexistente sigue reportándose (el _ no inventa comandos)', async () => {
    const { engine, prints } = ctx
    engine.submitText('_nope')
    await flush()
    expect(prints.some((l) => l.includes('Unknown command'))).toBe(true)
  })

  it('pendingKind informa el tipo de prompt activo (espacio = Enter salvo en texto)', async () => {
    const { engine } = ctx
    expect(engine.pendingKind()).toBeNull()
    engine.submitText('LINE')
    await flush()
    expect(engine.pendingKind()).toBe('point')
    engine.cancel()
    await flush()
    const ctxAny = (engine as unknown as { ctx: import('./types').CommandContext }).ctx
    void ctxAny.getString('Name: ')
    expect(engine.pendingKind()).toBe('string')
    engine.cancel()
    expect(engine.pendingKind()).toBeNull()
  })

  it('en Select objects el click suma, con Shift resta y la ventana acumula', async () => {
    const { engine, doc, getSelection } = ctx
    const a = doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [10, 0, 0] } })
    const b = doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 5, 0], end: [10, 5, 0] } })
    const c = doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 9, 0], end: [10, 9, 0] } })
    engine.submitText('ERASE')
    await flush()
    expect(engine.pendingKind()).toBe('selection')
    engine.submitClick({ x: 0, y: 0, z: 0 }, a.id)
    engine.submitClick({ x: 0, y: 5, z: 0 }, b.id)
    expect(getSelection()).toEqual([a.id, b.id])
    // volver a clickear sin Shift NO deselecciona (antes era un toggle)
    engine.submitClick({ x: 0, y: 5, z: 0 }, b.id)
    expect(getSelection()).toEqual([a.id, b.id])
    // Shift resta
    engine.submitClick({ x: 0, y: 0, z: 0 }, a.id, false, true)
    expect(getSelection()).toEqual([b.id])
    // ventana: addPicks acumula, removePicks resta
    engine.addPicks([a.id, c.id])
    expect(getSelection().sort()).toEqual([a.id, b.id, c.id].sort())
    engine.removePicks([b.id, c.id])
    expect(getSelection()).toEqual([a.id])
    engine.submitText('') // Enter cierra la selección y ERASE borra
    await flush()
    expect(doc.entities.map((e) => e.id)).toEqual([b.id, c.id])
  })

  it('el preview de PLINE incluye los tramos ya fijados', async () => {
    const { engine } = ctx
    engine.submitText('PLINE')
    await flush()
    engine.submitText('0,0')
    await flush()
    engine.submitText('10,0')
    await flush()
    const shapes = engine.computePreview({ x: 10, y: 10, z: 0 })
    expect(shapes).toHaveLength(1)
    expect(shapes[0]).toMatchObject({ kind: 'polyline' })
    const poly = shapes[0] as { kind: 'polyline'; points: { x: number; y: number }[] }
    expect(poly.points).toHaveLength(3)
    expect(poly.points[0]).toMatchObject({ x: 0, y: 0 })
    expect(poly.points[1]).toMatchObject({ x: 10, y: 0 })
    expect(poly.points[2]).toMatchObject({ x: 10, y: 10 })
  })
})

/**
 * ARC. Las coordenadas se escriben con `#` para forzar absolutas: con un punto base, el
 * default de Cota es relativo.
 */
describe('comando ARC', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })

  /** Ejecuta una secuencia de entradas de la línea de comandos. */
  const run = async (...inputs: string[]): Promise<void> => {
    for (const i of inputs) {
      ctx.engine.submitText(i)
      await flush()
    }
  }
  const onlyArc = (): ArcEntity => {
    expect(ctx.doc.entities).toHaveLength(1)
    const e = ctx.doc.entities[0]
    expect(e.type).toBe('ARC')
    return e as ArcEntity
  }

  it('3 puntos: el arco pasa por el punto intermedio y conserva el sentido', async () => {
    await run('A', '#0,0', '#5,5', '#10,0')
    const a = onlyArc()
    expect(a.props.center[0]).toBeCloseTo(5, 9)
    expect(a.props.center[1]).toBeCloseTo(0, 9)
    expect(a.props.radius).toBeCloseTo(5, 9)
    expect(arcIsClockwise(a.props)).toBe(true)
    expect(sweepOf(a.props)).toBeCloseTo(Math.PI, 9)
  })

  it('Center, Start, End arranca pidiendo el centro', async () => {
    await run('ARC', 'C', '#0,0', '#10,0', '#0,10')
    const a = onlyArc()
    expect(a.props.radius).toBeCloseTo(10, 9)
    expect(sweepOf(a.props)).toBeCloseTo(Math.PI / 2, 9)
    expect(arcIsClockwise(a.props)).toBe(false)
  })

  it('Start, Center, Angle con ángulo negativo dibuja horario', async () => {
    await run('ARC', '#10,0', 'C', '#0,0', 'A', '-90')
    const a = onlyArc()
    expect(arcIsClockwise(a.props)).toBe(true)
    const [, end] = arcEndpoints(a.props)
    expect(end[0]).toBeCloseTo(0, 6)
    expect(end[1]).toBeCloseTo(-10, 6)
  })

  it('Start, Center, chord Length resuelve el barrido por la cuerda', async () => {
    await run('ARC', '#10,0', 'C', '#0,0', 'L', '10')
    expect(sweepOf(onlyArc().props)).toBeCloseTo(Math.PI / 3, 6)
  })

  it('Start, End, Radius dibuja el arco menor', async () => {
    await run('ARC', '#0,0', 'E', '#10,0', 'R', '5')
    const a = onlyArc()
    expect(a.props.radius).toBeCloseTo(5, 9)
    expect(sweepOf(a.props)).toBeCloseTo(Math.PI, 9)
  })

  it('Start, End, Direction sale tangente a la dirección pedida', async () => {
    await run('ARC', '#0,0', 'E', '#10,0', 'D', '90')
    const a = onlyArc()
    const t = arcTangentAt(a.props, 0)
    expect(t[0]).toBeCloseTo(0, 6)
    expect(t[1]).toBeCloseTo(1, 6)
  })

  it('Start, End, Angle usa el ángulo incluido', async () => {
    await run('ARC', '#0,0', 'E', '#10,0', 'A', '90')
    const a = onlyArc()
    expect(sweepOf(a.props)).toBeCloseTo(Math.PI / 2, 6)
    expect(a.props.center[1]).toBeCloseTo(5, 6)
  })

  it('Enter continúa tangente al último trazo', async () => {
    await run('LINE', '#0,0', '#10,0', '')
    expect(ctx.doc.entities).toHaveLength(1)
    await run('ARC', '', '#15,5')
    expect(ctx.doc.entities).toHaveLength(2)
    const a = ctx.doc.entities[1] as ArcEntity
    expect(a.type).toBe('ARC')
    const [s] = arcEndpoints(a.props)
    expect(s[0]).toBeCloseTo(10, 6) // arranca donde terminó la línea
    expect(s[1]).toBeCloseTo(0, 6)
    const t = arcTangentAt(a.props, 0)
    expect(t[0]).toBeCloseTo(1, 6) // tangente = dirección de la línea
    expect(t[1]).toBeCloseTo(0, 6)
  })

  it('sin trazo previo, Enter avisa y no dibuja nada', async () => {
    await run('ARC', '')
    expect(ctx.doc.entities).toHaveLength(0)
    expect(ctx.prints.some((p) => p.includes('No previous line or arc'))).toBe(true)
  })

  it('un barrido de 360° se guarda como círculo (el CAD clásico no admite arcos cerrados)', async () => {
    await run('ARC', '#10,0', 'C', '#0,0', 'A', '360')
    expect(ctx.doc.entities).toHaveLength(1)
    const c = ctx.doc.entities[0] as CircleEntity
    expect(c.type).toBe('CIRCLE')
    expect(c.props.radius).toBeCloseTo(10, 9)
  })

  it('tres puntos colineales no crean nada y lo informan', async () => {
    await run('A', '#0,0', '#5,0', '#10,0')
    expect(ctx.doc.entities).toHaveLength(0)
    expect(ctx.prints.some((p) => p.includes('Invalid arc'))).toBe(true)
  })

  it('ESC en medio del comando no deja nada', async () => {
    ctx.engine.submitText('ARC')
    await flush()
    ctx.engine.submitText('#0,0')
    await flush()
    ctx.engine.cancel()
    await flush()
    expect(ctx.doc.entities).toHaveLength(0)
  })

  it('el preview muestra el arco antes de fijar el último punto', async () => {
    await run('A', '#0,0', '#5,5')
    const shapes = ctx.engine.computePreview({ x: 10, y: 0, z: 0 })
    expect(shapes).toHaveLength(1)
    expect(shapes[0].kind).toBe('polyline')
    const poly = shapes[0] as { kind: 'polyline'; points: { x: number; y: number }[] }
    expect(poly.points.length).toBeGreaterThan(5) // es la curva, no la cuerda
  })
})

describe('PLINE con tramos de arco', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })
  const run = async (...inputs: string[]): Promise<void> => {
    for (const i of inputs) {
      ctx.engine.submitText(i)
      await flush()
    }
  }

  it('la opción Arc agrega un tramo tangente y lo guarda como bulge', async () => {
    await run('PL', '#0,0', '#10,0', 'A', '#10,10', '')
    expect(ctx.doc.entities).toHaveLength(1)
    const pl = ctx.doc.entities[0] as PolylineEntity
    expect(pl.props.vertices).toHaveLength(3)
    // Tangente a +X desde (10,0) hasta (10,10): media vuelta ⇒ bulge = tan(45°) = 1.
    expect(pl.props.bulges?.[0]).toBe(0)
    expect(pl.props.bulges?.[1]).toBeCloseTo(1, 6)
  })

  it('Line vuelve al modo recto y el resultado no guarda bulges nulos', async () => {
    await run('PL', '#0,0', '#10,0', 'A', 'L', '#10,10', '')
    const pl = ctx.doc.entities[0] as PolylineEntity
    expect(pl.props.vertices).toHaveLength(3)
    expect(pl.props.bulges).toBeUndefined()
  })

  it('CEnter define el arco por su centro', async () => {
    // Centro (10,5) con el arco arrancando en (10,0): media vuelta antihoraria hasta (10,10).
    await run('PL', '#0,0', '#10,0', 'A', 'CE', '#10,5', '#10,10', '')
    const pl = ctx.doc.entities[0] as PolylineEntity
    expect(pl.props.vertices[2]).toEqual([10, 10, 0])
    expect(pl.props.bulges?.[1]).toBeCloseTo(1, 6) // 180° ⇒ tan(45°)
  })

  it('Undo quita el último tramo', async () => {
    await run('PL', '#0,0', '#10,0', '#20,0', 'U', '')
    const pl = ctx.doc.entities[0] as PolylineEntity
    expect(pl.props.vertices).toHaveLength(2)
  })
})

describe('ELLIPSE Arc', () => {
  it('recorta la elipse por ángulos y los guarda como parámetros', async () => {
    const ctx = setup()
    const run = async (...inputs: string[]): Promise<void> => {
      for (const i of inputs) {
        ctx.engine.submitText(i)
        await flush()
      }
    }
    await run('ELLIPSE', 'A', '#-10,0', '#10,0', '5', '0', '90')
    expect(ctx.doc.entities).toHaveLength(1)
    const el = ctx.doc.entities[0] as EllipseEntity
    expect(el.type).toBe('ELLIPSE')
    expect(el.props.ratio).toBeCloseTo(0.5, 9)
    expect(el.props.startParam).toBeCloseTo(0, 9)
    expect(el.props.endParam).toBeCloseTo(Math.PI / 2, 9)
    expect(isEllipseArc(el.props)).toBe(true)
  })
})
