import { describe, it, expect } from 'vitest'
import { computePlotTransform, exportPdf, MM_TO_PT, PAGE_SIZES, plotContentStream, strokeStyleOps, worldToPage } from './pdf'
import type { Entity, Layer } from '../document/types'

const layers: Layer[] = [
  { id: '0', name: '0', color: '#ffffff', lineWeight: 0.5, lineType: 'CONTINUOUS', locked: false, visible: true, printable: true },
  { id: 'hidden', name: 'h', color: '#ff0000', lineWeight: 0.25, lineType: 'CONTINUOUS', locked: false, visible: false, printable: true },
  { id: 'noplot', name: 'n', color: '#00ff00', lineWeight: 0.25, lineType: 'CONTINUOUS', locked: false, visible: true, printable: false },
]

const line = (id: string, layer: string): Entity => ({ id, type: 'LINE', layer, props: { start: [0, 0, 0], end: [100, 0, 0] } })

describe('computePlotTransform / worldToPage', () => {
  it('escala fija: una medida conocida mide lo esperado en el papel', () => {
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 50 }
    const t = computePlotTransform(bounds, PAGE_SIZES.A4, 28, MM_TO_PT) // 1 unidad = 1 pt·(mm→pt) => 1:1 real
    const [x0] = worldToPage(0, 0, t)
    const [x1] = worldToPage(100, 0, t)
    expect(x1 - x0).toBeCloseTo(100 * MM_TO_PT, 3) // 100 mm en puntos
  })

  it('fit: centra y ajusta el contenido al área imprimible', () => {
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 50 }
    const t = computePlotTransform(bounds, PAGE_SIZES.A4, 28)
    // El span mapeado no excede el área imprimible
    const [xmin] = worldToPage(0, 0, t)
    const [xmax] = worldToPage(100, 0, t)
    expect(xmax - xmin).toBeLessThanOrEqual(PAGE_SIZES.A4.w - 2 * 28 + 0.01)
    expect(xmin).toBeGreaterThanOrEqual(28 - 0.01)
  })
})

describe('plotContentStream (line weight y filtros)', () => {
  it('el ancho de línea deriva del line weight (mm→pt)', () => {
    const t = computePlotTransform({ minX: 0, minY: 0, maxX: 100, maxY: 1 }, PAGE_SIZES.A4, 28)
    const s = plotContentStream([line('a', '0')], layers, t)
    // layer 0: 0.5 mm → 0.5*MM_TO_PT ≈ 1.417 pt
    const expected = (Math.round(0.5 * MM_TO_PT * 1000) / 1000).toString()
    expect(s).toContain(`${expected} w`)
    expect(s).toContain(' m\n') // moveTo
    expect(s).toContain(' l\n') // lineTo
    expect(s).toContain('S\n') // stroke
  })

  it('omite layers ocultos y no imprimibles', () => {
    const t = computePlotTransform({ minX: 0, minY: 0, maxX: 100, maxY: 1 }, PAGE_SIZES.A4, 28)
    const s = plotContentStream([line('a', '0'), line('b', 'hidden'), line('c', 'noplot')], layers, t)
    const strokes = (s.match(/S\n/g) ?? []).length
    expect(strokes).toBe(1) // solo el de layer '0'
  })

  it('omite las capas congeladas', () => {
    const t = computePlotTransform({ minX: 0, minY: 0, maxX: 100, maxY: 1 }, PAGE_SIZES.A4, 28)
    const frozen = layers.map((l) => (l.id === '0' ? { ...l, frozen: true } : l))
    expect(plotContentStream([line('a', '0')], frozen, t)).not.toContain('S\n')
  })
})

describe('exportPdf', () => {
  it('genera un PDF válido (cabecera, EOF, xref)', () => {
    const { bytes, empty } = exportPdf([line('a', '0')], layers)
    expect(empty).toBe(false)
    const head = String.fromCharCode(...bytes.slice(0, 8))
    expect(head).toBe('%PDF-1.4')
    const text = String.fromCharCode(...bytes)
    expect(text).toContain('startxref')
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('marca empty cuando no hay geometría imprimible', () => {
    const { empty } = exportPdf([line('b', 'hidden')], layers)
    expect(empty).toBe(true)
  })
})

describe('texto en WinAnsi', () => {
  it('acentos y signos tipográficos llegan como bytes WinAnsi', async () => {
    const { pdfText } = await import('./pdf')
    expect(pdfText('Revisó — “ok” 5°')).toBe('Revisó \x97 \x93ok\x94 5°')
    expect(pdfText('emoji 😀')).toBe('emoji ??')
  })
})

describe('tipos de línea en el PDF', () => {
  const layer = (lineType: string): Layer => ({ id: 'l', name: 'L', color: '#00ffff', visible: true, locked: false, printable: true, lineType, lineWeight: 0 }) as Layer
  it('el patrón de trazo del PDF queda lleno: los trazos son geometría', () => {
    expect(strokeStyleOps(layer('DASHED'))).toContain('[] 0 d')
  })
  it('una línea DASHED de capa se imprime a trazos (12,7 / 6,35 mm) que empiezan y terminan con trazo', () => {
    const line: Entity = { id: 'a', type: 'LINE', layer: 'l', props: { start: [0, 0, 0], end: [100, 0, 0] } }
    const t = { s: 1, ox: 0, oy: 0 }
    const lt = { patterns: new Map([['DASHED', [12.7, -6.35]]]), factor: 1, plinegen: false }
    const ops = plotContentStream([line], [layer('DASHED')], t, undefined, undefined, lt)
    const strokes = ops.split('S\n').filter((x) => x.includes(' m\n'))
    // 100 = 12,7 + 4·19,05 + resto: 4 repeticiones → 5 trazos, los extremos alargados por igual.
    expect(strokes.length).toBe(5)
    expect(ops.startsWith('1 J')).toBe(true)
    const cont = plotContentStream([line], [layer('CONTINUOUS')], t, undefined, undefined, lt)
    expect(cont.split('S\n').filter((x) => x.includes(' m\n')).length).toBe(1)
  })
})


describe('vistas sombreadas en el PDF', () => {
  const layers: Layer[] = [{ id: '0', name: '0', color: '#ffffff', visible: true, locked: false, lineType: 'CONTINUOUS', lineWeight: 0.25, printable: true } as Layer]
  const shade = {
    id: 's',
    type: 'SHADE',
    layer: '0',
    props: { tris: [0, 0, -0.001, 10, 0, -0.001, 0, 10, -0.001], colors: [1, 0, 0] },
  } as Entity
  it('cada triángulo se rellena con su color; en grises, con su luminancia', () => {
    const t = { s: 1, ox: 0, oy: 0 }
    const color = plotContentStream([shade], layers, t)
    expect(color).toContain('1 0 0 rg')
    expect(color).toMatch(/h\nf\n/)
    const gray = plotContentStream([shade], layers, t, { plotStyle: 'grayscale', lineWeights: true })
    expect(gray).toContain('0.3 0.3 0.3 rg')
  })
})
