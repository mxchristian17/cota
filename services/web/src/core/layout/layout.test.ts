import { describe, it, expect } from 'vitest'
import { defaultPageSetup, paperSizeMm, printableArea } from './paper'
import { formatScale, parseScale, paperPerModel, standardScale } from './scale'
import type { ViewportEntity } from '../document/types'
import { applyGrip, entityGrips } from '../editing/grips'
import { applyField, entityFields } from '../editing/props'
import { scaleEntity, translateEntity } from '../editing/edit'
import { DocumentModel } from '../document/DocumentModel'
import { expandEntities } from '../editing/block'
import { fieldContextFor, resolveFieldTexts } from '../fields/context'
import { activateTab, addViewport, layoutViewports, viewportAt } from './layouts'
import { fitViewport, modelToPaper, modelViewHeight, newViewportProps, viewAngles, viewBasis, viewNameOf, viewportRing } from './viewport'

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))

describe('papel', () => {
  it('A3 apaisado mide 420 × 297 mm y el área imprimible descuenta márgenes', () => {
    const ps = defaultPageSetup('A3')
    expect(paperSizeMm(ps)).toEqual({ width: 420, height: 297 })
    expect(paperSizeMm({ ...ps, orientation: 'portrait' })).toEqual({ width: 297, height: 420 })
    expect(printableArea(ps)).toEqual({ minX: 5, minY: 5, maxX: 415, maxY: 292 })
  })

  it('papel personalizado usa su tamaño', () => {
    const ps = { ...defaultPageSetup(), paper: 'CUSTOM', customSize: [500, 300] as [number, number] }
    expect(paperSizeMm(ps)).toEqual({ width: 500, height: 300 })
  })
})

describe('escalas', () => {
  it('parsea las notaciones del CAD clásico', () => {
    expect(parseScale('1:50')).toBeCloseTo(0.02)
    expect(parseScale('1/100')).toBeCloseTo(0.01)
    expect(parseScale('2:1')).toBe(2)
    expect(parseScale('0.02xp')).toBeCloseTo(0.02)
    expect(parseScale('1:50XP')).toBeCloseTo(0.02)
    expect(parseScale('abc')).toBeNull()
    expect(parseScale('0')).toBeNull()
  })

  it('formatea estándar y personalizadas', () => {
    expect(formatScale(1 / 50)).toBe('1:50')
    expect(standardScale(1 / 50)?.label).toBe('1:50')
    expect(formatScale(1 / 33)).toBe('1:33')
    expect(formatScale(3)).toBe('3:1')
    expect(standardScale(1 / 33)).toBeUndefined()
  })

  it('convierte con las unidades del dibujo', () => {
    expect(paperPerModel(1 / 50, 'mm')).toBeCloseTo(0.02)
    expect(paperPerModel(1 / 50, 'm')).toBeCloseTo(20)
  })
})

describe('viewport', () => {
  it('la base de vista coincide con la cámara (TOP: X derecha, Y arriba; FRONT: X derecha, Z arriba)', () => {
    const top = viewAngles('TOP')
    const b = viewBasis(top.az, top.el)
    close(b.right, [1, 0, 0])
    close(b.up, [0, 1, 0])
    const fr = viewAngles('FRONT')
    const f = viewBasis(fr.az, fr.el)
    close(f.right, [1, 0, 0])
    close(f.up, [0, 0, 1])
    close(f.out, [0, -1, 0])
  })

  it('a 1:50 una línea de 1000 mm mide 20 mm en el papel', () => {
    const vp = { ...newViewportProps([200, 150, 0], 100, 80), scale: 1 / 50 }
    const a = modelToPaper([0, 0, 0], vp, 'mm')
    const b = modelToPaper([1000, 0, 0], vp, 'mm')
    expect(b[0] - a[0]).toBeCloseTo(20)
    close(a, [200, 150]) // el target queda en el centro del viewport
    expect(modelViewHeight(vp, 'mm')).toBeCloseTo(4000)
  })

  it('fitViewport encuadra la caja y centra el objetivo', () => {
    const vp = newViewportProps([0, 0, 0], 100, 50)
    const fit = fitViewport({ min: [0, 0, 0], max: [1000, 200, 0] }, vp, 'mm', 1)
    close(fit.target, [500, 100, 0])
    expect(fit.scale).toBeCloseTo(0.1) // limita el ancho: 100 mm / 1000
    expect(fitViewport(null, vp, 'mm')).toEqual({ target: [0, 0, 0], scale: 1 })
  })

  it('reconoce vistas estándar y libres', () => {
    const iso = viewAngles('ISO')
    expect(viewNameOf(iso.az, iso.el)).toBe('ISO')
    expect(viewNameOf(0.3, 0.2)).toBeUndefined()
  })

  it('el contorno es el recorte si existe, si no el rectángulo (cerrado)', () => {
    const vp = newViewportProps([10, 10, 0], 20, 10)
    expect(viewportRing(vp)).toEqual([[0, 5, 0], [20, 5, 0], [20, 15, 0], [0, 15, 0], [0, 5, 0]])
    expect(viewportRing({ ...vp, clip: [[0, 0], [5, 0], [0, 5]] })).toHaveLength(4)
  })
})

describe('VIEWPORT como entidad', () => {
  const mk = (): ViewportEntity => ({ id: 'v', type: 'VIEWPORT', layer: '0', props: newViewportProps([50, 50, 0], 40, 20) })

  it('grip de esquina redimensiona con la opuesta fija', () => {
    const e = mk()
    const grips = entityGrips(e)
    expect(grips).toHaveLength(5)
    const ne = grips.find((g) => g.role.t === 'rect-corner' && g.role.corner === 2)!
    applyGrip(e, ne, [80, 70, 0])
    expect(e.props).toMatchObject({ width: 50, height: 30, center: [55, 55, 0] })
  })

  it('paleta: escala estándar, vista y bloqueo', () => {
    const e = mk()
    applyField(e, 'standardScale', '1:50')
    applyField(e, 'view', 'FRONT')
    applyField(e, 'locked', true)
    expect(e.props.scale).toBeCloseTo(0.02)
    expect(viewNameOf(e.props.az, e.props.el)).toBe('FRONT')
    expect(entityFields(e).find((f) => f.key === 'standardScale')?.value).toBe('1:50')
    expect(e.props.locked).toBe(true)
  })

  it('SCALE escala el marco y la escala de vista; MOVE no cambia la vista', () => {
    const e = mk()
    scaleEntity(e, [0, 0, 0], 2)
    expect(e.props).toMatchObject({ width: 80, height: 40, scale: 2, center: [100, 100, 0] })
    translateEntity(e, 10, 0)
    expect(e.props.center).toEqual([110, 100, 0])
    expect(e.props.target).toEqual([0, 0, 0])
  })
})

describe('viewportAt', () => {
  it('devuelve el viewport encendido bajo el punto (el último creado gana) y respeta el recorte', () => {
    const doc = DocumentModel.createDefault()
    activateTab(doc, 'L1', '0') // crea el viewport inicial sobre el área imprimible
    const [first] = layoutViewports(doc)
    const small = addViewport(doc, [100, 100], [200, 200], '0')
    expect(viewportAt(doc, 150, 150)).toBe(small.id)
    expect(viewportAt(doc, 50, 100)).toBe(first.id)
    expect(viewportAt(doc, 1, 1)).toBeNull() // margen no imprimible
    small.props.clip = [[100, 100], [200, 100], [100, 200]] // triángulo: la esquina superior derecha queda afuera
    expect(viewportAt(doc, 190, 190)).toBe(first.id)
    small.props.on = false
    expect(viewportAt(doc, 110, 110)).toBe(first.id)
  })
})

describe('rótulo IRAM (criterio 13)', () => {
  it('Layout1 nace con marco, rótulo y viewport; los campos muestran escala, fecha, archivo y hoja', () => {
    const doc = DocumentModel.createDefault()
    doc.addEntity({ type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [4100, 0, 0] } })
    activateTab(doc, 'L1', '0')
    doc.meta.modified = '2026-10-12T10:00:00'
    const [vp] = layoutViewports(doc)
    vp.props.scale = 0.01
    const ins = doc.layouts[0].entities.find((e) => e.type === 'INSERT')!
    expect(ins.type === 'INSERT' && ins.props.attributes?.map((a) => a.tag)).toEqual(['COMPANY', 'TITLE', 'DRAWN', 'CHECKED', 'APPROVED', 'DWG_NO'])
    if (ins.type === 'INSERT') ins.props.attributes![1].value = 'Planta baja'
    const shown = resolveFieldTexts(expandEntities(doc.layouts[0].entities, doc.blocks), fieldContextFor(doc, 'casa.cota', 'L1'))
      .flatMap((e) => (e.type === 'TEXT' ? [e.props.text] : []))
    for (const t of ['1:100', '12/10/2026', 'FILE: casa.cota', 'SHEET 1 OF 1', 'Planta baja']) expect(shown).toContain(t)
  })

  it('un papel chico (A5 vertical) no lleva rótulo; un TITLE_BLOCK del usuario se respeta', () => {
    const doc = DocumentModel.createDefault()
    doc.setBlock({ name: 'TITLE_BLOCK', entities: [] })
    activateTab(doc, 'L1', '0')
    expect(doc.getBlock('TITLE_BLOCK')!.entities).toEqual([])
    const small = doc.addLayout('Chico', { ...defaultPageSetup('A4'), customSize: [100, 140], paper: 'CUSTOM', orientation: 'portrait' })
    activateTab(doc, small.id, '0')
    expect(small.entities.map((e) => e.type)).toEqual(['RECTANGLE', 'VIEWPORT'])
  })
})

describe('hoja predeterminada y vistas isométricas (revisión 2026-10-13)', () => {
  it('marco y rótulo van en la capa 0; el viewport, en la capa actual (aunque no se imprima)', () => {
    const doc = DocumentModel.createDefault()
    activateTab(doc, doc.layouts[0].id, 'VPORTS')
    const types = Object.fromEntries(doc.layoutEntities(doc.layouts[0].id).map((e) => [e.type, e.layer]))
    expect(types).toEqual({ RECTANGLE: '0', INSERT: '0', VIEWPORT: 'VPORTS' })
  })

  it('las cuatro isométricas del CAD clásico tienen su azimut y se reconocen de vuelta', () => {
    expect(viewAngles('NWISO').az).toBeCloseTo((3 * Math.PI) / 4)
    expect(viewAngles('SWISO').az).toBeCloseTo((-3 * Math.PI) / 4)
    for (const n of ['ISO', 'SWISO', 'NEISO', 'NWISO'] as const) {
      const { az, el } = viewAngles(n)
      expect(viewNameOf(az, el)).toBe(n)
    }
  })
})

