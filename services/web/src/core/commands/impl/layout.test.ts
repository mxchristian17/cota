import { describe, it, expect } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import { MODEL_TAB } from '../../document/DocumentModel'
import type { ViewportEntity } from '../../document/types'
import { activateTab, defaultMsViewport, layoutViewports, neighborTab, nextMsViewport } from '../../layout/layouts'
import { modelToPaper, modelViewHeight } from '../../layout/viewport'
import { applyGrip, entityGrips } from '../../editing/grips'
import { LayerService } from '../../layers/LayerService'

describe('LAYOUT', () => {
  it('New / Rename / Copy / Delete / ?', async () => {
    const h = makeEngine()
    await h.run('LAYOUT', 'N', '')
    expect(h.doc.layouts.map((l) => l.name)).toEqual(['Layout1', 'Layout2'])
    await h.run('LO', 'R', 'Layout2', 'Planta')
    await h.run('LO', 'C', 'Planta', '')
    expect(h.doc.layouts.map((l) => l.name)).toEqual(['Layout1', 'Planta', 'Planta (2)'])
    await h.run('LO', 'D', 'Planta (2)')
    await h.run('LO', '?')
    expect(h.prints.at(-1)).toBe('Model, Layout1, Planta')
    await h.run('LO', 'R', 'Layout1', 'planta')
    expect(h.prints.at(-1)).toMatch(/already exists/)
  })

  it('Set activa el layout y crea su viewport inicial con el modelo a extensiones', async () => {
    const h = makeEngine()
    h.add('LINE', { start: [0, 0, 0], end: [10000, 0, 0] })
    await h.run('LO', 'S', 'Layout1')
    expect(h.doc.activeTab).toBe(h.doc.layouts[0].id)
    expect(h.doc.layouts[0].initialized).toBe(true)
    const [vp] = layoutViewports(h.doc)
    // Hoja predeterminada: marco + rótulo IRAM (46 mm) abajo y el viewport encima.
    expect(h.doc.layouts[0].entities.map((e) => e.type)).toEqual(['RECTANGLE', 'INSERT', 'VIEWPORT'])
    expect(h.doc.getBlock('TITLE_BLOCK')).toBeTruthy()
    expect(vp.props).toMatchObject({ center: [210, 171.5, 0], width: 410, height: 241 })
    expect(vp.props.target).toEqual([5000, 0, 0])
    // A3 con márgenes de 5 mm: 410 mm de ancho para 10 m con 5 % de aire.
    expect(vp.props.scale).toBeCloseTo(410 / (10000 * 1.05))
    expect(h.doc.modelEntities).toHaveLength(1) // el viewport vive en el papel
    await h.run('LO', 'S', 'Model')
    expect(h.doc.activeTab).toBe(MODEL_TAB)
  })

  it('activar de nuevo no duplica el viewport; Ctrl+PgUp/PgDn recorre en círculo', () => {
    const h = makeEngine()
    const l1 = h.doc.layouts[0].id
    activateTab(h.doc, l1, '0')
    activateTab(h.doc, MODEL_TAB, '0')
    activateTab(h.doc, l1, '0')
    expect(layoutViewports(h.doc)).toHaveLength(1)
    const vp = layoutViewports(h.doc)[0] as ViewportEntity
    expect(modelViewHeight(vp.props, 'mm')).toBeCloseTo(241) // modelo vacío → 1:1
    const l2 = h.doc.addLayout().id
    expect(neighborTab(h.doc, 1)).toBe(l2)
    activateTab(h.doc, l2, '0')
    expect(neighborTab(h.doc, 1)).toBe(MODEL_TAB)
    expect(neighborTab(h.doc, -1)).toBe(l1)
  })
})

describe('MVIEW / VPORTS en layout', () => {
  /** Layout1 activo y sin viewports (para contar sólo los que crea el comando). */
  function inLayout() {
    const h = makeEngine()
    h.add('LINE', { start: [0, 0, 0], end: [4000, 3000, 0] })
    const id = h.doc.layouts[0].id
    h.doc.setActiveTab(id)
    h.doc.markLayoutInitialized(id)
    return h
  }
  const vps = (h: ReturnType<typeof makeEngine>) => layoutViewports(h.doc)

  it('en Model no aplica', async () => {
    const h = makeEngine()
    await h.run('MV', '')
    expect(h.prints.at(-1)).toMatch(/not allowed in Model/)
  })

  it('dos esquinas y Fit (Enter) crean viewports a extensiones', async () => {
    const h = inLayout()
    await h.run('MV', '#20,20', '@200,100')
    expect(vps(h)[0].props).toMatchObject({ center: [120, 70, 0], width: 200, height: 100 })
    expect(vps(h)[0].props.target).toEqual([2000, 1500, 0])
    await h.run('MV', '')
    expect(vps(h)[1].props).toMatchObject({ width: 410, height: 287 })
  })

  it('2/3/4 dividen la caja; 3 Left deja el grande a la izquierda', async () => {
    const h = inLayout()
    await h.run('MV', '2', 'H', '#0,0', '100,100')
    expect(vps(h).map((v) => v.props.center.slice(0, 2))).toEqual([[50, 75], [50, 25]])
    await h.run('MV', '3', 'L', 'F')
    const three = vps(h).slice(2)
    expect(three.map((v) => [v.props.width, v.props.height])).toEqual([[205, 287], [205, 143.5], [205, 143.5]])
    await h.run('MV', '4', '')
    expect(vps(h)).toHaveLength(9)
  })

  it('ON/OFF, Lock y Shadeplot cambian los viewports seleccionados', async () => {
    const h = inLayout()
    await h.run('MV', '')
    const [v] = vps(h)
    h.setSelection([v.id]) // selección previa: getSelection la toma
    await h.run('MV', 'OFF', '')
    expect(v.props.on).toBe(false)
    h.setSelection([v.id])
    await h.run('MV', 'L', 'ON', '')
    expect(v.props.locked).toBe(true)
    h.setSelection([v.id])
    await h.run('MV', 'S', 'H', '')
    expect(v.props.shadePlot).toBe('hidden')
  })

  it('Polygonal y Object crean viewports recortados', async () => {
    const h = inLayout()
    await h.run('MV', 'P', '#10,10', '@100,0', '@0,50', '')
    const [poly] = vps(h)
    expect(poly.props.clip).toEqual([[10, 10], [110, 10], [110, 60]])
    expect(poly.props).toMatchObject({ width: 100, height: 50, center: [60, 35, 0] })
    const c = h.add('CIRCLE', { center: [300, 150, 0], radius: 40 })
    await h.run('MV', 'O')
    await h.click(340, 150, c.id)
    const obj = vps(h)[1]
    expect(obj.props.clip!.length).toBeGreaterThan(16)
    expect(obj.props.width).toBeCloseTo(80, 6)
    expect(h.doc.getEntity(c.id)).toBeUndefined() // el círculo pasa a ser el contorno
  })

  it('VPORTS en un layout crea viewports con vistas TOP/FRONT/LEFT/ISO; en Model sigue siendo tiled', async () => {
    const h = inLayout()
    await h.run('VPORTS', '4', '')
    expect(vps(h).map((v) => [v.props.az, v.props.el].map((a) => +a.toFixed(4)))).toEqual([
      [-1.5708, 1.5708],
      [-1.5708, 0],
      [3.1416, 0],
      [-0.7854, 0.6155],
    ])
    h.doc.setActiveTab(MODEL_TAB)
    await h.run('VPORTS', '2')
    expect(vps(h)).toHaveLength(0)
  })

  it('desde MSPACE vuelve al papel antes de crear', async () => {
    const h = inLayout()
    await h.run('MV', '')
    h.doc.setMsViewport(vps(h)[0].id)
    await h.run('MV', '#0,0', '50,50')
    expect(h.doc.inPaperSpace).toBe(true)
    expect(vps(h)).toHaveLength(2)
    expect(h.doc.modelEntities).toHaveLength(1)
  })
})

describe('MSPACE / PSPACE / VPMAX / ZOOM nXP', () => {
  function withTwo() {
    const h = makeEngine()
    h.add('LINE', { start: [0, 0, 0], end: [1000, 0, 0] })
    activateTab(h.doc, h.doc.layouts[0].id, '0') // viewport inicial
    const [a] = layoutViewports(h.doc)
    return { h, a }
  }

  it('MS entra por el último viewport usado; PS vuelve; en Model no aplican', async () => {
    const { h, a } = withTwo()
    await h.run('MV', '#10,10', '50,50')
    const b = layoutViewports(h.doc)[1]
    await h.run('MS')
    expect(h.doc.msViewportId).toBe(a.id)
    h.doc.setMsViewport(b.id)
    await h.run('PS')
    expect(h.doc.inPaperSpace).toBe(true)
    expect(defaultMsViewport(h.doc)).toBe(b.id)
    await h.run('MS')
    expect(h.doc.msViewportId).toBe(b.id)
    expect(nextMsViewport(h.doc)).toBe(a.id)
    await h.run('MS')
    expect(h.prints.at(-1)).toMatch(/Already in model space/)
    h.doc.setActiveTab(MODEL_TAB)
    await h.run('PS')
    expect(h.prints.at(-1)).toMatch(/not allowed in Model/)
  })

  it('MS sin viewports encendidos avisa', async () => {
    const { h, a } = withTwo()
    a.props.on = false
    await h.run('MS')
    expect(h.prints.at(-1)).toMatch(/no active model space viewports/)
    expect(h.doc.inPaperSpace).toBe(true)
  })

  it('VPMAX maximiza el viewport (y entra al modelo); VPMIN restaura y vuelve al papel', async () => {
    const { h, a } = withTwo()
    await h.run('VPMAX') // un solo viewport: no pregunta
    expect(h.doc.maximizedViewportId).toBe(a.id)
    expect(h.doc.msViewportId).toBe(a.id)
    await h.run('VPMAX')
    expect(h.prints.at(-1)).toMatch(/already maximized/)
    await h.run('VPMIN')
    expect(h.doc.maximizedViewportId).toBeNull()
    expect(h.doc.inPaperSpace).toBe(true)
  })

  it('VPMAX con varios viewports pide uno; cambiar de viewport o de pestaña lo restaura', async () => {
    const { h, a } = withTwo()
    await h.run('MV', '#10,10', '50,50')
    const b = layoutViewports(h.doc)[1]
    await h.run('VPMAX')
    await h.click(30, 30)
    expect(h.doc.maximizedViewportId).toBe(b.id)
    h.doc.setMsViewport(a.id)
    expect(h.doc.maximizedViewportId).toBeNull()
    h.doc.setMaximizedViewport(a.id)
    h.doc.load(h.doc.toJSON()) // undo/redo conserva el VPMAX
    expect(h.doc.maximizedViewportId).toBe(a.id)
    h.doc.setActiveTab(MODEL_TAB)
    expect(h.doc.maximizedViewportId).toBeNull()
  })

  it('ZOOM nXP fija la escala del viewport de MSPACE conservando el centro', async () => {
    const { h, a } = withTwo()
    const target = [...a.props.target]
    await h.run('Z', '1/50xp')
    expect(h.prints.at(-1)).toMatch(/only valid in model space/)
    h.doc.setMsViewport(a.id)
    await h.run('ZOOM', '1:100XP')
    expect(a.props.scale).toBeCloseTo(0.01)
    expect(a.props.target).toEqual(target)
    expect(h.prints.at(-1)).toBe('Viewport scale: 1:100.')
    await h.run('Z', '2xp')
    expect(a.props.scale).toBe(2)
  })
})

describe('VPCLIP / VPLAYER', () => {
  function setup() {
    const h = makeEngine()
    h.add('LINE', { start: [0, 0, 0], end: [1000, 0, 0] })
    const id = h.doc.layouts[0].id
    h.doc.setActiveTab(id)
    h.doc.markLayoutInitialized(id)
    return h
  }

  it('VPCLIP con polígono: el marco pasa a su caja y el modelo no se mueve en el papel; Delete lo quita', async () => {
    const h = setup()
    await h.run('MV', '#0,0', '#200,100')
    const [v] = layoutViewports(h.doc)
    const before = modelToPaper([500, 0, 0], v.props, 'mm')
    await h.run('VPCLIP')
    await h.click(100, 50) // dentro del viewport
    await h.run('P', '#20,20', '#120,20', '#120,80', '')
    expect(v.props.clip).toEqual([[20, 20], [120, 20], [120, 80]])
    expect(v.props).toMatchObject({ center: [70, 50, 0], width: 100, height: 60 })
    const after = modelToPaper([500, 0, 0], v.props, 'mm')
    expect(after[0]).toBeCloseTo(before[0], 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
    await h.run('VPCLIP')
    await h.click(100, 30)
    await h.run('D')
    expect(v.props.clip).toBeUndefined()
    expect(v.props).toMatchObject({ width: 100, height: 60 })
  })

  it('VPCLIP con un objeto cerrado lo consume como contorno; grips de vértice editan el recorte', async () => {
    const h = setup()
    await h.run('MV', '#0,0', '#200,100')
    const [v] = layoutViewports(h.doc)
    const r = h.add('RECTANGLE', { corner: [10, 10, 0], width: 50, height: 40 })
    await h.run('VPCLIP')
    await h.click(150, 50)
    await h.click(10, 30, r.id)
    expect(v.props.clip).toHaveLength(4)
    expect(h.doc.getEntity(r.id)).toBeUndefined()
    const grips = entityGrips(v)
    expect(grips.filter((g) => g.role.t === 'vertex')).toHaveLength(4)
    applyGrip(v, grips[1], [0, 0, 0]) // primer vértice al origen
    expect(v.props.clip![0]).toEqual([0, 0])
    expect(v.props.width).toBeGreaterThanOrEqual(70) // el marco sigue cubriendo el contorno
  })

  it('VPLAYER Freeze/Thaw/Reset con All/Select/Current, ? y comodines', async () => {
    const h = setup()
    const svc = new LayerService(h.doc)
    const ejes = svc.create('Ejes')
    const cotas = svc.create('Cotas')
    await h.run('MV', '#0,0', '#100,100', 'MV', '#100,0', '#200,100')
    const [a, b] = layoutViewports(h.doc)
    await h.run('VPLAYER', 'F', 'ej*,nope', 'A')
    expect(h.prints).toContain('Layer "nope" not found.')
    expect(a.props.frozenLayers).toEqual([ejes.id])
    expect(b.props.frozenLayers).toEqual([ejes.id])
    h.doc.setMsViewport(b.id)
    await h.run('VPLAYER', 'T', 'EJES', '')
    expect(b.props.frozenLayers).toEqual([])
    expect(a.props.frozenLayers).toEqual([ejes.id])
    await h.run('VPLAYER', '?')
    expect(h.prints.at(-1)).toBe('No layers are frozen in this viewport.')
    await h.run('VPLAYER', 'F', 'Cotas', 'S')
    await h.click(0, 50, a.id) // se elige el viewport por su borde
    await h.run('')
    expect(a.props.frozenLayers).toEqual([ejes.id, cotas.id])
    expect(h.doc.inPaperSpace).toBe(true) // Select vuelve al papel
    svc.setNewVpFreeze(cotas.id, true)
    await h.run('VPLAYER', 'R', '*', 'A')
    expect(a.props.frozenLayers).toEqual([cotas.id])
    expect(b.props.frozenLayers).toEqual([cotas.id])
  })

  it('Newfrz crea capas congeladas en todos los viewports; Vpvisdflt y New VP Freeze afectan a los nuevos', async () => {
    const h = setup()
    await h.run('MV', '#0,0', '#100,100')
    const [a] = layoutViewports(h.doc)
    await h.run('VPLAYER', 'N', 'Notas')
    const notas = h.doc.layers.find((l) => l.name === 'Notas')!
    expect(notas.newVpFreeze).toBe(true)
    expect(a.props.frozenLayers).toEqual([notas.id])
    await h.run('VPLAYER', 'V', 'notas', 'T')
    expect(notas.newVpFreeze).toBeUndefined()
    await h.run('VPLAYER', 'V', '0', 'F')
    await h.run('MV', '#100,0', '#200,100')
    expect(layoutViewports(h.doc)[1].props.frozenLayers).toEqual(['0'])
  })
})
