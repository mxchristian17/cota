import { describe, it, expect } from 'vitest'
import type { Entity, Layer, LayoutDef, ViewportEntity } from '../document/types'
import { defaultPageSetup } from '../layout/paper'
import { newViewportProps, viewAngles } from '../layout/viewport'
import { MM_TO_PT } from './pdf'
import { layoutPage, plotLayouts, plotsHidden, viewportContent } from './layoutPlot'

const layer = (id: string, color: string, extra: Partial<Layer> = {}): Layer => ({
  id,
  name: id,
  color,
  lineWeight: 0.5,
  lineType: 'CONTINUOUS',
  locked: false,
  visible: true,
  printable: true,
  ...extra,
})
const layers = [layer('0', '#ffffff'), layer('red', '#ff0000'), layer('noplot', '#00ff00', { printable: false })]
const line = (id: string, a: number[], b: number[], l = '0'): Entity =>
  ({ id, type: 'LINE', layer: l, props: { start: a, end: b } }) as Entity

/** Viewport 1:50 de 100 × 60 mm centrado en (100, 100) del papel, mirando el origen del modelo. */
function vp(patch: Partial<ViewportEntity['props']> = {}): ViewportEntity {
  return { id: 'v', type: 'VIEWPORT', layer: '0', props: { ...newViewportProps([100, 100, 0], 100, 60), scale: 0.02, ...patch } }
}
const style = { plotStyle: 'color' as const, lineWeights: true }
const pt = (mm: number) => (Math.round(mm * MM_TO_PT * 1000) / 1000).toString()

describe('PLOT de layout (E9a)', () => {
  it('a 1:50 una línea de 1000 mm del modelo mide 20 mm en el papel', () => {
    const s = viewportContent(vp().props, [line('a', [0, 0, 0], [1000, 0, 0])], layers, 'mm', style)
    expect(s).toContain(`${pt(100)} ${pt(100)} m\n${pt(120)} ${pt(100)} l\nS`)
  })

  it('recorta con el contorno del viewport y descarta lo que cae afuera', () => {
    const s = viewportContent(vp().props, [line('far', [100000, 0, 0], [100100, 0, 0])], layers, 'mm', style)
    expect(s.startsWith('q\n')).toBe(true)
    expect(s).toMatch(/h\nW n\n/) // clipping path del rectángulo
    expect(s.trimEnd().endsWith('Q')).toBe(true)
    expect(s).not.toContain(' l\nS') // la línea lejana no se traza
    const clipped = viewportContent(vp({ clip: [[50, 70], [150, 70], [100, 130]] }).props, [], layers, 'mm', style)
    expect(clipped).toContain(`${pt(50)} ${pt(70)} m\n${pt(150)} ${pt(70)} l\n${pt(100)} ${pt(130)} l\n${pt(50)} ${pt(70)} l\nh\nW n`)
  })

  it('respeta capas no imprimibles y congeladas en el viewport; lineweights en mm absolutos', () => {
    const model = [line('a', [0, 0, 0], [100, 0, 0], 'noplot'), line('b', [0, 0, 0], [100, 0, 0], 'red')]
    expect(viewportContent(vp({ frozenLayers: ['red'] }).props, model, layers, 'mm', style)).not.toContain(' RG')
    const s = viewportContent(vp({ scale: 0.001 }).props, model, layers, 'mm', style)
    expect(s).toContain('1 0 0 RG')
    expect(s).toContain(`${pt(0.5)} w`) // 0.5 mm aunque la escala sea 1:1000
  })

  it('color 7 → negro; monocromo → todo negro; grises → luminancia', () => {
    const model = [line('a', [0, 0, 0], [10, 0, 0], '0'), line('b', [0, 0, 0], [10, 0, 0], 'red')]
    expect(viewportContent(vp().props, model, layers, 'mm', style)).toContain('0 0 0 RG')
    const mono = viewportContent(vp().props, model, layers, 'mm', { ...style, plotStyle: 'monochrome' })
    expect(mono).not.toContain('1 0 0 RG')
    const gray = viewportContent(vp().props, model, layers, 'mm', { ...style, plotStyle: 'grayscale' })
    expect(gray).toContain('0.299 0.299 0.299 RG')
  })

  it('las unidades del dibujo convierten la escala (m: 1:100 → 10 mm por metro)', () => {
    const s = viewportContent(vp({ scale: 0.01 }).props, [line('a', [0, 0, 0], [1, 0, 0])], layers, 'm', style)
    expect(s).toContain(`${pt(100)} ${pt(100)} m\n${pt(110)} ${pt(100)} l`)
  })

  it('en vista FRONT proyecta X→derecha y Z→arriba', () => {
    const s = viewportContent(vp({ ...viewAngles('FRONT'), scale: 1 }).props, [line('a', [0, 0, 0], [0, 0, 10])], layers, 'mm', style)
    expect(s).toContain(`${pt(100)} ${pt(100)} m\n${pt(100)} ${pt(110)} l`)
  })

  it('la hoja A3 apaisada mide 420 × 297 mm; incluye papel y viewports encendidos; varias páginas', () => {
    const layout: LayoutDef = {
      id: 'L1',
      name: 'Layout1',
      pageSetup: defaultPageSetup('A3'),
      entities: [],
    }
    const paper: Entity[] = [vp(), { ...vp(), id: 'off', props: { ...vp().props, on: false, center: [300, 100, 0] } }, line('p', [10, 10, 0], [20, 10, 0])]
    const model = [line('m', [0, 0, 0], [1000, 0, 0])]
    const page = layoutPage({ layout, paper, model, layers, units: 'mm' })
    expect(page.w).toBeCloseTo(420 * MM_TO_PT, 6)
    expect(page.h).toBeCloseTo(297 * MM_TO_PT, 6)
    expect(page.content.match(/W n/g)).toHaveLength(1) // sólo el viewport encendido
    expect(page.content).toContain(`${pt(10)} ${pt(10)} m\n${pt(20)} ${pt(10)} l`) // papel 1:1
    const pdf = new TextDecoder('latin1').decode(plotLayouts([{ layout, paper, model, layers, units: 'mm' }, { layout, paper: [], model, layers, units: 'mm' }]))
    expect(pdf).toContain('/Count 2')
    expect(pdf).toContain(`/MediaBox [0 0 ${pt(420)} ${pt(297)}]`)
  })
})

/** Cubo (malla) de lado `s` con su esquina en `o`. */
function cube(id: string, o: number[], s: number): Entity {
  const [x, y, z] = o
  const v = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [x + (i & 1 ? s : 0), y + (i & 2 ? s : 0), z + (i & 4 ? s : 0)])
  const faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]
  return { id, type: 'MESH3D', layer: 'red', props: { vertices: v, faces } } as unknown as Entity
}
const meshOf = (e: Entity) => (e.type === 'MESH3D' ? e.props : null)
const strokes = (s: string) => (s.match(/ l\nS/g) ?? []).length

describe('PLOT completo (E9b)', () => {
  it('shade plot Hidden (o As displayed con estilo oculto/sombreado) quita las aristas ocultas en un VP ISO', () => {
    const iso = { ...viewAngles('ISO'), scale: 0.5 }
    const model = [cube('a', [0, 0, 0], 20), cube('b', [-25, -25, 0], 20)]
    const wire = viewportContent(vp(iso).props, model, layers, 'mm', style, meshOf)
    const hid = viewportContent(vp({ ...iso, shadePlot: 'hidden' }).props, model, layers, 'mm', style, meshOf)
    const shaded = viewportContent(vp({ ...iso, visualStyle: 'shadedEdges' }).props, model, layers, 'mm', style, meshOf)
    expect(strokes(wire)).toBe(24) // 12 aristas por cubo
    expect(strokes(hid)).toBeLessThan(24)
    expect(strokes(hid)).toBeGreaterThanOrEqual(18) // 9 aristas visibles por cubo, algunas partidas
    expect(shaded).toBe(hid)
    expect(hid).toContain('1 0 0 RG') // conserva la capa de cada sólido
    expect(plotsHidden({ shadePlot: 'wireframe', visualStyle: 'hidden' })).toBe(false)
  })

  it('texto afín: rotado en planta y proyectado en una vista lateral; de canto no se dibuja', () => {
    const txt = (rotation: number, normal = [0, 0, 1]): Entity =>
      ({ id: 't', type: 'TEXT', layer: '0', props: { position: [0, 0, 0], text: 'A', height: 100, rotation, justify: 'left', normal } }) as Entity
    const rot = viewportContent(vp().props, [txt(Math.PI / 2)], layers, 'mm', style)
    expect(rot).toMatch(/\/F1 1 Tf\n0 5\.669 -5\.669 0 [-\d.]+ [-\d.]+ Tm/) // 100 × 1:50 = 2 mm = 5.669 pt
    const front = viewportContent(vp(viewAngles('FRONT')).props, [txt(0, [0, -1, 0])], layers, 'mm', style)
    expect(front).toContain(' Tm\n(A) Tj')
    const edge = viewportContent(vp(viewAngles('FRONT')).props, [txt(0)], layers, 'mm', style)
    expect(edge).not.toContain('Tj')
  })

  it('el texto girado del papel también usa matriz afín', () => {
    const t = { id: 't', type: 'TEXT', layer: '0', props: { position: [10, 10, 0], text: 'ROT', height: 5, rotation: Math.PI / 2, justify: 'left', normal: [0, 0, 1] } } as Entity
    const layout: LayoutDef = { id: 'L1', name: 'L', pageSetup: defaultPageSetup('A3'), entities: [] }
    expect(layoutPage({ layout, paper: [t], model: [], layers, units: 'mm' }).content).toContain('(ROT) Tj')
    expect(layoutPage({ layout, paper: [t], model: [], layers, units: 'mm' }).content).toContain(' Tm\n')
  })

  it('"Hide paperspace objects" plotea los sólidos del papel con ocultas', () => {
    const layout: LayoutDef = { id: 'L1', name: 'L', pageSetup: { ...defaultPageSetup('A3'), hidePaperspaceObjects: true }, entities: [] }
    const c = cube('c', [10, 10, 0], 20)
    const page = layoutPage({ layout, paper: [c], model: [], layers, units: 'mm', meshOf })
    expect(strokes(page.content)).toBe(4) // en planta sólo se ve el contorno superior
  })
})
