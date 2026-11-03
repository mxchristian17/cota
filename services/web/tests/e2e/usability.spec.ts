import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/** Notas de uso real: selección con el mouse, ventanas en cualquier vista, guardar, deshacer y capas de la selección. */
const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function cmd(page: Page, ...steps: string[]) {
  const i = page.getByTestId('command-input')
  for (const s of steps) {
    await i.fill(s)
    await i.press('Enter')
    await page.waitForTimeout(40)
  }
}

const screen = (page: Page, p: number[]) =>
  page.evaluate((q) => {
    const s = (window as any).__cotaStore.getState()
    const r = s.activeViewport.renderer.domElement.getBoundingClientRect()
    const [x, y] = s.activeViewport.project({ x: q[0], y: q[1], z: q[2] })
    return [x + r.left, y + r.top] as [number, number]
  }, p)

async function clickAt(page: Page, p: number[], dx = 0, dy = 0) {
  const [x, y] = await screen(page, p)
  await page.mouse.move(x + dx + 1, y + dy)
  await page.mouse.move(x + dx, y + dy)
  await page.waitForTimeout(30)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(30)
}

/** Tipo de snap bajo el cursor al apoyarlo en un punto del mundo. */
async function snapAt(page: Page, p: number[]) {
  const [x, y] = await screen(page, p)
  await page.mouse.move(x + 2, y + 1)
  await page.waitForTimeout(50)
  await page.mouse.move(x + 1, y + 1)
  await page.waitForTimeout(50)
  return page.evaluate(() => {
    const r = (window as any).__cotaStore.getState().activeViewport.snapResult
    return r ? `${r.type}:${Math.round(r.point.x)},${Math.round(r.point.y)},${Math.round(r.point.z)}` : null
  })
}

test.describe('Uso real', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('RECT es RECTANGLE', async ({ page }) => {
    await cmd(page, 'RECT', '0,0', '10,5')
    expect(await st(page, 'return s.doc.entities[0].type')).toBe('RECTANGLE')
  })

  test('el doble clic abre las propiedades, también en polilíneas y rectángulos', async ({ page }) => {
    await cmd(page, 'PLINE', '0,0', '100,0', '100,50', '', 'ZOOM', 'E')
    const [x, y] = await screen(page, [50, 0, 0])
    await page.mouse.dblclick(x, y)
    await page.waitForTimeout(100)
    expect(await st(page, 'return [s.engine.busy, s.prompt ?? "", s.selection.length].join("|")')).toBe('false||1')
    expect(await st(page, 'return s.propsPalette.open')).toBe(true)
  })

  test('un clic sostenido con temblor abre la ventana en vez de cerrarla', async ({ page }) => {
    await cmd(page, 'LINE', '0,0', '100,0', '', 'ZOOM', 'E')
    const [x, y] = await screen(page, [50, 0, 0])
    await page.mouse.move(x, y - 80)
    await page.mouse.down()
    await page.mouse.move(x + 7, y - 80)
    await page.waitForTimeout(500)
    await page.mouse.up()
    await page.mouse.move(x + 200, y + 80, { steps: 4 })
    expect(await st(page, 'return s.selection.length')).toBe(0)
    // La segunda esquina cierra la ventana (de izquierda a derecha: sólo lo que queda adentro).
    await page.mouse.move(x - 400, y + 80, { steps: 3 })
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(60)
    expect(await st(page, 'return s.selection.length')).toBe(1)
  })

  test('un clic con temblor sobre una línea la selecciona', async ({ page }) => {
    await cmd(page, 'LINE', '0,0', '100,0', '', 'ZOOM', 'E')
    const [x, y] = await screen(page, [50, 0, 0])
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 6, y + 2)
    await page.mouse.up()
    await page.waitForTimeout(60)
    expect(await st(page, 'return s.selection.length')).toBe(1)
  })

  test('la tolerancia del clic: toma la línea a 8 px, y entre dos la que está justo debajo', async ({ page }) => {
    await cmd(page, 'LINE', '0,0', '100,0', '', 'LINE', '0,1', '100,1', '', 'ZOOM', 'E', 'ZOOM', '0.2')
    await page.waitForTimeout(100)
    for (const view of ['top', 'front', 'swiso']) {
      await cmd(page, '-VIEW', view)
      await page.waitForTimeout(120)
      const [x, y] = await screen(page, [50, 0, 0])
      expect(await page.evaluate(([a, b]) => (window as any).__cotaStore.getState().activeViewport.pickAt(a, b), [x, y + 8])).toBeTruthy()
    }
  })

  test('entre dos líneas gana la que está bajo el cursor, aunque la otra esté más cerca de la cámara', async ({ page }) => {
    await cmd(page, 'LINE', '0,0,0', '100,0,0', '', 'ZOOM', 'E', 'ZOOM', '0.5')
    await page.waitForTimeout(100)
    const wpp = await page.evaluate(() => (window as any).__cotaStore.getState().activeViewport.controller.worldPerPx())
    await cmd(page, 'LINE', `0,${6 * wpp},50`, `100,${6 * wpp},50`, '')
    await page.waitForTimeout(100)
    const ids = await st<string[]>(page, 'return s.doc.entities.map(e => e.id)')
    const [x, y] = await screen(page, [50, 0, 0])
    expect(await page.evaluate(([a, b]) => (window as any).__cotaStore.getState().activeViewport.pickAt(a, b), [x, y])).toBe(ids[0])
  })

  for (const view of ['front', 'right', 'swiso']) {
    test(`un rectángulo dibujado en ${view} se selecciona con clic y con ventana desde otras vistas`, async ({ page }) => {
      await cmd(page, '-VIEW', view)
      await page.waitForTimeout(150)
      await cmd(page, 'RECTANGLE', '0,0', '60,40')
      const id = await st<string>(page, 'return s.doc.entities[0].id')
      const pts = await st<number[][]>(page, 'const p = s.doc.entities[0].props; return p.vertices ?? [p.corner, [p.corner[0] + p.width, p.corner[1], p.corner[2]]]')
      const mid = [0, 1, 2].map((i) => (pts[0][i] + pts[1][i]) / 2)
      for (const other of ['top', 'front', 'right', 'swiso', 'neiso', 'left']) {
        await cmd(page, '-VIEW', other, 'ZOOM', 'E', 'ZOOM', '0.6')
        await page.waitForTimeout(150)
        await page.evaluate(() => (window as any).__cotaStore.setState({ selection: [] }))
        await clickAt(page, mid, 2, 1)
        expect(await st(page, 'return s.selection.join()'), `clic en ${other}`).toBe(id)
        await page.keyboard.press('Escape')
        // Ventana de cruce de derecha a izquierda alrededor del punto medio.
        const [x, y] = await screen(page, mid)
        await page.mouse.move(x + 15, y + 15)
        await page.mouse.down()
        await page.mouse.up()
        await page.mouse.move(x - 15, y - 15, { steps: 3 })
        await page.mouse.down()
        await page.mouse.up()
        await page.waitForTimeout(60)
        expect(await st(page, 'return s.selection.join()'), `cruce en ${other}`).toBe(id)
        await page.keyboard.press('Escape')
      }
    })
  }

  test('STRETCH en Front con UCS View: recuadro rectangular y la ventana toma lo que se ve', async ({ page }) => {
    await cmd(page, '-VIEW', 'front')
    await page.waitForTimeout(150)
    await cmd(page, 'UCS', 'V', 'RECTANGLE', '0,0', '60,40', 'ZOOM', 'E', 'ZOOM', '0.5')
    await page.waitForTimeout(150)
    const before = await st<number[][]>(page, 'return s.doc.entities[0].props.vertices')
    await cmd(page, 'STRETCH')
    await clickAt(page, [50, 0, -5])
    const [x, y] = await screen(page, [70, 0, 45])
    await page.mouse.move(x, y)
    // El recuadro es de verdad un rectángulo (4 esquinas distintas sobre el plano de la vista).
    const box = await st<number[][]>(page, 'const p = s.engine.computePreview({ x: 70, y: 0, z: 45 })[0].points; return p.map(q => [q.x, q.y, q.z])')
    expect(new Set(box.slice(0, 4).map((q) => q.map((n) => n.toFixed(3)).join())).size).toBe(4)
    expect(box.every((q) => Math.abs(q[1]) < 1e-6)).toBe(true)
    await clickAt(page, [70, 0, 45])
    await cmd(page, '60,0', '@20,0')
    const r = await st<{ vertices: number[][]; normal: number[] }>(page, 'return s.doc.entities[0].props')
    expect(r.vertices.map((v) => v[0])).toEqual([0, 80, 80, 0])
    expect(r.normal).toBeTruthy()
    expect(before.map((v) => v[2])).toEqual(r.vertices.map((v) => v[2]))
  })

  test('STRETCH en una vista 3D: la ventana es la de pantalla, aunque el objeto esté fuera del plano de trabajo', async ({ page }) => {
    await cmd(page, 'LINE', '0,0,30', '60,0,30', '', '-VIEW', 'swiso', 'ZOOM', 'E', 'ZOOM', '0.5')
    await page.waitForTimeout(150)
    const [x, y] = await screen(page, [60, 0, 30])
    await cmd(page, 'STRETCH')
    await page.mouse.move(x - 12, y - 12)
    await page.mouse.down()
    await page.mouse.up()
    await page.mouse.move(x + 12, y + 12)
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(40)
    await cmd(page, '0,0,0', '@10,0,0')
    expect(await st(page, 'return s.doc.entities[0].props.end')).toEqual([70, 0, 30])
    expect(await st(page, 'return s.doc.entities[0].props.start')).toEqual([0, 0, 30])
  })

  test('STRETCH en Front estira un mueble de sólidos extruidos', async ({ page }) => {
    await cmd(page, '-VIEW', 'front')
    await page.waitForTimeout(150)
    // Dos tableros vistos de frente (perfil en el plano XZ, extruidos hacia atrás).
    await cmd(page, 'RECTANGLE', '0,0', '100,18', 'EXTRUDE', 'L', '', '80', 'RECTANGLE', '100,0', '118,60', 'EXTRUDE', 'L', '', '80', 'ZOOM', 'E', 'ZOOM', '0.6')
    await page.waitForTimeout(150)
    await cmd(page, 'STRETCH')
    await clickAt(page, [130, 0, -10])
    await clickAt(page, [90, 0, 70])
    await expect(page.locator('.cmd-output')).toContainText('2 object(s) found.')
    await cmd(page, '0,0', '@20,0')
    await expect(page.locator('.cmd-output')).toContainText('Stretched 1 object(s), moved 1.')
    const xs = await st<number[][]>(page, 'return s.doc.entities.map(e => e.props.profile.map(v => Math.round(v[0])))')
    expect(xs).toEqual([[0, 120, 120, 0], [120, 138, 138, 120]])
  })

  test('con mucho zoom dentro de un modelo 3D se sigue eligiendo y el cursor sigue el plano de trabajo', async ({ page }) => {
    // Lo de abajo (z = -3000) deja el punto mirado más hondo que la línea: al acercarse, la cámara queda debajo de ella.
    await cmd(page, 'LINE', '0,0,2000', '100,0,2000', '', 'LINE', '-300,-300,-3000', '-250,-300,-3000', '', 'ZOOM', 'E')
    await page.waitForTimeout(150)
    for (let step = 0; step < 4; step++) {
      const [x, y] = await screen(page, [50, 0, 2000])
      await page.mouse.move(x, y)
      for (let k = 0; k < 6; k++) await page.mouse.wheel(0, -240)
      await page.waitForTimeout(120)
    }
    const camZ = await page.evaluate(() => (window as any).__cotaStore.getState().activeViewport.controller.camera.position.z)
    expect(camZ).toBeLessThan(2000)
    const [x, y] = await screen(page, [50, 0, 2000])
    await page.mouse.move(x + 1, y + 1)
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(80)
    expect(await st(page, 'return s.selection.length')).toBe(1)
    expect(await st<number>(page, 'return Math.round(s.cursor.x)')).toBe(50)
  })

  test('la versión de Cota se ve abajo a la derecha', async ({ page }) => {
    await expect(page.getByTestId('app-version')).toHaveText(/^v\d+\.\d+\.\d+$/)
    const box = await page.getByTestId('app-version').boundingBox()
    const vp = page.viewportSize()!
    expect(box!.x + box!.width).toBeGreaterThan(vp.width - 40)
    expect(box!.y + box!.height).toBeGreaterThan(vp.height - 40)
  })

  test('STRETCH con coordenadas no depende de la vista', async ({ page }) => {
    await cmd(page, 'LINE', '0,0', '60,0', '', '-VIEW', 'swiso', 'STRETCH', '50,-5', '70,5', '0,0', '@10,0')
    expect(await st(page, 'return s.doc.entities[0].props.end')).toEqual([70, 0, 0])
  })

  test('Fence, WPolygon y CPolygon con clics en vista Front toman lo que se ve', async ({ page }) => {
    await cmd(page, '-VIEW', 'front')
    await page.waitForTimeout(150)
    await cmd(page, 'RECTANGLE', '0,0', '60,40', 'ZOOM', 'E', 'ZOOM', '0.5')
    await page.waitForTimeout(150)
    const z = () => st<number>(page, 'return s.doc.entities[0].props.vertices[0][2]')
    await cmd(page, 'MOVE', 'F')
    await clickAt(page, [25, 0, -25])
    await clickAt(page, [25, 0, 25])
    await cmd(page, '', '', '0,0', '@0,10')
    expect(await z()).toBe(10)
    await cmd(page, 'MOVE', 'CP')
    await clickAt(page, [5, 0, -15])
    await clickAt(page, [45, 0, -15])
    await clickAt(page, [25, 0, 30])
    await cmd(page, '', '', '0,0', '@0,10')
    expect(await z()).toBe(20)
    await cmd(page, 'MOVE', 'WP')
    await clickAt(page, [-25, 0, -25])
    await clickAt(page, [90, 0, -25])
    await clickAt(page, [90, 0, 90])
    await clickAt(page, [-25, 0, 90])
    await cmd(page, '', '', '0,0', '@0,10')
    expect(await z()).toBe(30)
  })

  test('Window y Crossing tipeadas en Front usan el plano de la UCS', async ({ page }) => {
    await cmd(page, '-VIEW', 'front')
    await page.waitForTimeout(150)
    await cmd(page, 'RECTANGLE', '0,0', '60,40', 'MOVE', 'W', '-5,-5', '65,45', '', '0,0', '@0,10')
    expect(await st(page, 'return s.doc.entities[0].props.vertices[0][2]')).toBe(10)
    await cmd(page, 'MOVE', 'C', '20,5', '40,15', '', '0,0', '@0,10')
    expect(await st(page, 'return s.doc.entities[0].props.vertices[0][2]')).toBe(20)
  })

  test('ZOOM Window en 3D encuadra lo que marca el recuadro', async ({ page }) => {
    await cmd(page, 'LINE', '0,0', '100,0', '', '-VIEW', 'swiso', 'ZOOM', 'E', 'ZOOM', '0.5')
    await page.waitForTimeout(150)
    const [x, y] = await screen(page, [50, 0, 0])
    await cmd(page, 'ZOOM', 'W')
    await page.mouse.move(x - 20, y - 20)
    await page.mouse.down()
    await page.mouse.up()
    await page.mouse.move(x + 20, y + 20)
    await page.waitForTimeout(40)
    expect(await st(page, 'return s.engine.computePreview({ x: 60, y: 0, z: 0 })[0].points.length')).toBe(5)
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(100)
    const px = await page.evaluate(() => {
      const s = (window as any).__cotaStore.getState().activeViewport
      return 1 / s.controller.worldPerPx()
    })
    expect(px).toBeGreaterThan(5) // de ~0.5 px por unidad a pantalla llena con 40 px de ventana
  })

  test('deshacer dice qué se deshizo', async ({ page }) => {
    await cmd(page, 'RECTANGLE', '0,0', '10,5', 'EXTRUDE', 'L', '', '4')
    await page.keyboard.press('Control+z')
    await expect(page.locator('.cmd-output')).toContainText('Undo: EXTRUDE.')
    await page.keyboard.press('Control+y')
    await expect(page.locator('.cmd-output')).toContainText('Redo: EXTRUDE.')
    await cmd(page, 'UNDO')
    await cmd(page, 'U')
    await expect(page.locator('.cmd-output')).toContainText('Undo: RECTANGLE.')
  })

  test('Ctrl+S guarda con el nombre actual y SAVE con otro nombre dice el nuevo', async ({ page }) => {
    const first = page.waitForEvent('download')
    await page.locator('canvas').first().click({ position: { x: 300, y: 300 } })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+s')
    expect((await first).suggestedFilename()).toBe('drawing1.cota')
    await expect(page.locator('.cmd-output')).toContainText('<Saved "drawing1.cota"')
    const second = page.waitForEvent('download')
    await cmd(page, 'SAVE', 'plano-nuevo')
    expect((await second).suggestedFilename()).toBe('plano-nuevo.cota')
    await expect(page.locator('.cmd-output')).toContainText('<Saved "plano-nuevo.cota"')
    expect(await st(page, 'return s.docName')).toBe('plano-nuevo')
  })

  test('los controles de capa siguen a la selección como en el CAD clásico', async ({ page }) => {
    await cmd(page, '-LAYER', 'N', 'A,B', '', 'LINE', '0,0', '10,0', '', 'LINE', '0,5', '10,5', '')
    const [a, b] = await st<string[]>(page, 'const ids = n => s.doc.layers.find(l => l.name === n).id; return [ids("A"), ids("B")]')
    const cur = await st<string>(page, 'return s.currentLayerId')
    await st(page, `const e = s.doc.entities; e[0].layer = ${JSON.stringify(a)}; e[1].layer = ${JSON.stringify(b)}; s.doc.touch()`)
    const combo = page.getByTestId('layer-select')
    await expect(combo).toHaveValue(cur)
    const ids = await st<string[]>(page, 'return s.doc.entities.map(e => e.id)')
    await page.evaluate((v) => (window as any).__cotaStore.setState({ selection: v }), [ids[0]])
    await expect(combo).toHaveValue(a)
    await page.evaluate((v) => (window as any).__cotaStore.setState({ selection: v }), ids)
    await expect(combo.locator('option:checked')).toHaveText('A (+1)')
    // Elegir una capa con la selección abierta los mueve a ella; la capa actual no cambia.
    await combo.selectOption(b)
    expect(await st(page, 'return s.doc.entities.map(e => e.layer).join()')).toBe(`${b},${b}`)
    await expect(combo).toHaveValue(b)
    expect(await st(page, 'return s.currentLayerId')).toBe(cur)
    await page.evaluate(() => (window as any).__cotaStore.setState({ selection: [] }))
    await expect(combo).toHaveValue(cur)
  })

  // Rectángulo + extrusión: los vértices del sólido se toman con el mouse, sin importar cómo se llegó a la vista.
  const VERTS = [[0, 0, 0], [100, 0, 0], [100, 50, 40], [0, 50, 40], [0, 0, 40]]
  const snaps = async (page: Page) => {
    await page.waitForTimeout(120)
    for (const v of VERTS) expect(await snapAt(page, v)).toBe(`endpoint:${v.join()}`)
  }
  test('snaps: extruir en planta, ir a 3D y mover con el mouse', async ({ page }) => {
    await cmd(page, 'RECTANGLE', '0,0', '100,50', 'EXTRUDE', 'L', '', '40', '-VIEW', 'swiso', 'ZOOM', 'E', 'ZOOM', '0.7')
    await page.waitForTimeout(150)
    await clickAt(page, [50, 0, 0])
    await cmd(page, 'MOVE')
    await snaps(page)
  })
  test('snaps: todo en 3D, seleccionando dentro del comando', async ({ page }) => {
    await cmd(page, '-VIEW', 'swiso', 'RECTANGLE', '0,0', '100,50', 'ZOOM', 'E')
    await page.waitForTimeout(150)
    await cmd(page, 'EXTRUDE')
    await clickAt(page, [50, 0, 0])
    await cmd(page, '', '40', 'ZOOM', 'E', 'ZOOM', '0.7')
    await page.waitForTimeout(150)
    await cmd(page, 'MOVE')
    await clickAt(page, [50, 0, 0])
    await cmd(page, '')
    await snaps(page)
  })
  test('snaps: pieza dibujada en Front con la UCS de esa vista', async ({ page }) => {
    await cmd(page, '-VIEW', 'front')
    await page.waitForTimeout(150)
    await cmd(page, 'RECTANGLE', '0,0', '100,40', 'EXTRUDE', 'L', '', '50', '-VIEW', 'swiso', 'ZOOM', 'E', 'ZOOM', '0.7')
    await page.waitForTimeout(150)
    await cmd(page, 'MOVE', 'ALL', '')
    await page.waitForTimeout(120)
    for (const v of [[0, 0, 0], [100, 0, 40], [100, -50, 40], [0, -50, 0]]) expect(await snapAt(page, v)).toBe(`endpoint:${v.join()}`)
  })
  test('snaps: en perspectiva, con la pieza cerca de la cámara', async ({ page }) => {
    await cmd(page, 'RECTANGLE', '0,0', '100,50', 'EXTRUDE', 'L', '', '40', '-VIEW', 'swiso', 'PERSPECTIVE', 'ZOOM', 'E')
    await page.waitForTimeout(150)
    await page.evaluate(() => { const v = (window as any).__cotaStore.getState().activeViewport; v.controller.radius *= 0.45; v.invalidate() })
    await page.waitForTimeout(200)
    await cmd(page, 'MOVE', 'ALL', '')
    await page.waitForTimeout(120)
    expect(await snapAt(page, [100, 0, 40])).toBe('endpoint:100,0,40')
    expect(await snapAt(page, [0, 0, 40])).toBe('endpoint:0,0,40')
  })
  test('snaps: el Esc a mitad de un MOVE no deja rastro', async ({ page }) => {
    await cmd(page, '-VIEW', 'swiso', 'RECTANGLE', '0,0', '100,50', 'EXTRUDE', 'L', '', '40', 'ZOOM', 'E', 'ZOOM', '0.7')
    await page.waitForTimeout(150)
    await clickAt(page, [50, 0, 0])
    await cmd(page, 'MOVE')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await cmd(page, 'MOVE', 'ALL', '')
    await snaps(page)
  })
})

test.describe('Abrir un DWG de referencia', () => {
  test('el modelo, las hojas con sus viewports y lo simplificado se avisa', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    const b64 = readFileSync(new URL('../../src/core/io/__fixtures__/acadsharp/sample_AC1032.dwg', import.meta.url)).toString('base64')
    await page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      await (window as any).__cotaStore.getState().openDeviceFile(new File([bytes], 'muestra.dwg'))
    }, b64)
    await expect(page.locator('.cmd-output')).toContainText('Opened "muestra.dwg"')
    await expect(page.locator('.cmd-output')).toContainText('Simplified on open')
    await expect(page.locator('.cmd-output')).toContainText('3 3D solid(s) read with their faces')
    await expect(page.locator('.cmd-output')).not.toContainText('Unsupported entities')
    const tabs = await st<string[]>(page, 'return s.doc.layouts.map(l => l.name)')
    expect(tabs).toEqual(['Layout1', 'Layout2', 'MyLayout'])
    const vps = await st<number>(page, 'return s.doc.layouts[0].entities.filter(e => e.type === "VIEWPORT").length')
    expect(vps).toBe(1)
    if (process.env.SHOTS) {
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${process.env.SHOTS}/model.png` })
      await page.getByText('Layout1', { exact: true }).click()
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${process.env.SHOTS}/layout.png` })
    }
  })

  test('XLINE dibuja una línea infinita que se selecciona lejos de sus puntos y no afecta el zoom', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await cmd(page, 'LINE', '0,0', '100,50', '', 'XLINE', '0,0', '10,10', '', 'ZOOM', 'E')
    await page.waitForTimeout(150)
    const h = await page.evaluate(() => (window as any).__cotaStore.getState().activeViewport.controller.viewHeight)
    expect(h).toBeLessThan(200)
    expect(await st(page, 'return s.doc.entities[1].props.extend')).toBe('both')
    // Lejos de los dos puntos que la definen, sobre la recta: (40, 40).
    const [x, y] = await screen(page, [40, 40, 0])
    expect(await page.evaluate(([a, b]) => (window as any).__cotaStore.getState().activeViewport.pickAt(a, b), [x, y])).toBe(await st(page, 'return s.doc.entities[1].id'))
    if (process.env.SHOTS) {
      await page.waitForTimeout(200)
      await page.screenshot({ path: `${process.env.SHOTS}/xline.png` })
    }
  })

  test('EXPORT DXF lleva los sólidos como caras y las líneas infinitas como tales', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await cmd(page, 'RECTANGLE', '0,0', '10,5', 'EXTRUDE', 'L', '', '4', 'XLINE', '0,0', '10,10', '')
    const file = page.waitForEvent('download')
    await cmd(page, 'EXPORT', 'DXF')
    const text = readFileSync(await (await file).path(), 'utf8')
    expect(text).toContain('3DFACE')
    expect(text).toContain('XLINE')
  })
})

test.describe('Dibujos con muchos textos', () => {
  test('cada texto se crea al verse con un tamaño legible y se selecciona con un clic', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await st(
      page,
      `for (let i = 0; i < 3000; i++) s.doc.addEntity({ type: 'TEXT', layer: '0', props: { position: [(i % 60) * 20, Math.floor(i / 60) * 10, 0], text: 'T' + i, height: 2.5, rotation: 0, justify: 'left', normal: [0, 0, 1], kind: 'text' } }); s.doc.touch()`,
    )
    const labels = () => page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => /^T\d+$/.test(d.textContent ?? '')).length)
    // Todo el dibujo a la vista: cada texto mide menos de 3 px y no se dibuja (antes, 3000 elementos de 7 px).
    await cmd(page, 'ZOOM', 'E')
    await page.waitForTimeout(300)
    expect(await labels()).toBe(0)
    // De cerca: sólo los de la pantalla y sus alrededores.
    await cmd(page, 'ZOOM', 'W', '-5,-5', '95,45')
    await page.waitForTimeout(300)
    const near = await labels()
    expect(near).toBeGreaterThan(10)
    expect(near).toBeLessThan(600)
    await expect(page.locator('div', { hasText: /^T61$/ })).toBeVisible()
    // Un clic sobre un texto lo selecciona (las cajas de todos van en una sola malla invisible).
    await clickAt(page, [22, 11, 0])
    await page.waitForTimeout(200)
    expect(await st<string[]>(page, 'return s.selection.map((id) => s.doc.getEntity(id).props.text)')).toEqual(['T61'])
  })
})
