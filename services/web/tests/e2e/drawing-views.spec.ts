import { expect, test, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
  }
}

const store = (page: Page, js: string) =>
  page.evaluate((code) => {
    const key = Object.keys(window).find((k) => /^__\w+Store$/.test(k))!
    const st = (window as unknown as Record<string, { getState: () => Record<string, unknown> }>)[key]
    return new Function('s', code)(st.getState())
  }, js)

test.describe('Cota drawing views and error handling', () => {
  test('VIEWPROJ with preselected solids does not hang; VIEWBASE + VIEWPROJ work', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'CYLINDER', '#0,0,0', '10', '20')
    await typeCmd(page, 'BOX', '#30,-10,0', '#50,10,0', '20')
    // Cilindro y prisma preseleccionados en el modelo: antes VIEWPROJ quedaba en un bucle y colgaba la app.
    await store(page, 's.selectAll()')
    await typeCmd(page, 'VIEWPROJ')
    await expect(page.locator('.cmd-output')).toContainText('VIEWPROJ works on drawing views in a layout.')
    await typeCmd(page, 'VIEWBASE', '', '', '#100,150', '#250,150', '')
    await expect(page.locator('.cmd-output')).toContainText('Base view created with 1 projected view(s)')
    // En el layout, con las vistas preseleccionadas, sigue respondiendo.
    await store(page, 's.selectAll()')
    await typeCmd(page, 'VIEWPROJ', '#100,60', '')
    await expect(page.locator('.cmd-output')).toContainText('1 projected view(s) created.')
  })

  test('VIEWBASE documents a cube with every edge rounded', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'BOX', '#0,0', '#40,40', '40')
    const mids = ['#20,0,0', '#40,20,0', '#20,40,0', '#0,20,0', '#20,0,40', '#40,20,40', '#20,40,40', '#0,20,40', '#0,0,20', '#40,0,20', '#40,40,20', '#0,40,20']
    await typeCmd(page, 'FILLETEDGE', 'R', '6', ...mids, '')
    await expect(page.locator('.cmd-output')).toContainText('12 edge(s) selected for fillet.', { timeout: 30_000 })
    await typeCmd(page, '')
    await typeCmd(page, 'VIEWBASE', '', '', '#100,150', '')
    await expect(page.locator('.cmd-output')).toContainText('Base view created', { timeout: 30_000 })
  })

  test('an unexpected error shows a closable banner and the app keeps working', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await page.evaluate(() => setTimeout(() => { throw new Error('boom') }))
    await expect(page.getByTestId('error-banner')).toContainText('boom')
    await page.getByTestId('error-banner-close').click()
    await expect(page.getByTestId('error-banner')).toHaveCount(0)
    await typeCmd(page, 'LINE', '#0,0', '#10,0', '')
    await expect(page.locator('.cmd-output')).toContainText('Command: LINE')
  })
})

test.describe('Cota STRETCH', () => {
  test('the crossing window ignores ortho and the found objects stay highlighted', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'LINE', '#0,0', '#1000,0', '')
    await typeCmd(page, 'ZOOM', 'C', '#0,0', '100')
    await store(page, 's.toggleOrtho()')
    expect(await store(page, 'return s.ortho')).toBe(true)
    const box = (await page.locator('canvas').first().boundingBox())!
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]
    await typeCmd(page, 'STRETCH')
    // Con ortho la segunda esquina quedaba alineada con la primera: ventana de alto 0 que no cruzaba la línea.
    await page.mouse.click(cx - 30, cy - 30)
    await page.mouse.move(cx + 30, cy + 30)
    await page.mouse.click(cx + 30, cy + 30)
    await expect(page.locator('.cmd-output')).toContainText('1 object(s) found.')
    expect(await store(page, 'return s.selection.length')).toBe(1)
    await page.keyboard.press('Escape')
    await expect.poll(() => store(page, 'return s.selection.length')).toBe(0)
  })
})

test.describe('Cota PLINE snaps', () => {
  test('the segments already drawn give object snaps before the polyline is finished', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'ZOOM', 'C', '#10,10', '50')
    const box = (await page.locator('canvas').first().boundingBox())!
    const s = box.height / 50
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]
    await typeCmd(page, 'PLINE', '#0,0', '#20,0', '#20,20')
    // Cerca del punto medio del primer tramo (10,0): el MIDpoint de la polilínea en curso.
    await page.mouse.move(cx + 3, cy + 10 * s - 3)
    await page.mouse.move(cx + 2, cy + 10 * s - 2)
    await page.mouse.click(cx + 2, cy + 10 * s - 2)
    await typeCmd(page, '')
    const verts = await store(page, 'const l = s.doc.entities; return l[l.length - 1].props.vertices')
    expect(verts[3]).toEqual([10, 0, 0])
  })
})

test.describe('Cota INT on the segment being drawn', () => {
  test('with ortho, the crossing of the rubber-band direction with an object snaps as an intersection', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'LINE', '#10,-10', '#10,20', '')
    await typeCmd(page, 'CIRCLE', '#25,0', '5')
    await typeCmd(page, 'ZOOM', 'C', '#10,0', '50')
    await store(page, 's.toggleOrtho()')
    const box = (await page.locator('canvas').first().boundingBox())!
    const s = box.height / 50
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]
    // Desde (0,3) hacia la derecha con ortho: el cursor apenas fuera de la recta y=3, cerca de la línea x=10.
    await typeCmd(page, 'LINE', '#0,3')
    await page.mouse.move(cx + 2, cy - 3 * s - 4)
    await page.mouse.move(cx + 3, cy - 3 * s - 5)
    await page.mouse.click(cx + 3, cy - 3 * s - 5)
    // Y el cruce con el círculo (x = 25 − 4 = 21).
    await page.mouse.move(cx + 11 * s + 3, cy - 3 * s - 5)
    await page.mouse.move(cx + 11 * s + 2, cy - 3 * s - 4)
    await page.mouse.click(cx + 11 * s + 2, cy - 3 * s - 4)
    await typeCmd(page, '')
    const ends = await store(page, 'return s.doc.entities.slice(-2).map((e) => e.props.end)')
    expect(ends[0]).toEqual([10, 3, 0])
    expect(ends[1]).toEqual([21, 3, 0])
  })
})

test.describe('Cota CHAMFER on a solid', () => {
  test('picking a solid edge in CHAMFER works like CHAMFEREDGE', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'BOX', '#0,0', '#40,40', '40')
    await typeCmd(page, 'CHAMFER', '#20,0,40', '')
    await expect(page.locator('.cmd-output')).toContainText('1 edge(s) selected for chamfer.')
    await typeCmd(page, '')
    expect(await store(page, 'const l = s.doc.entities; return l[l.length - 1].props.op')).toBe('CHAMFEREDGE')
  })
})

test.describe('Cota context menu and clipboard', () => {
  test('right-click menus: idle, during a command and with a selection; Ctrl+C / Ctrl+V', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    const canvas = page.locator('canvas').first()
    const box = (await canvas.boundingBox())!
    const at = { x: box.width / 2 + 40, y: box.height / 2 + 40 }
    // Sin selección ni comando: Undo, Pan, Zoom…
    await canvas.click({ button: 'right', position: at })
    await expect(page.getByTestId('context-menu')).toContainText('Undo')
    await page.keyboard.press('Escape')
    // Durante LINE: Enter termina el comando y las opciones del prompt aparecen.
    await typeCmd(page, 'LINE', '#0,0', '#10,0')
    await canvas.click({ button: 'right', position: at })
    await expect(page.getByTestId('ctx-kw-undo')).toBeVisible()
    await page.getByTestId('ctx-enter').click()
    await expect.poll(() => store(page, 'return s.engine.busy')).toBe(false)
    // Repeat LINE.
    await canvas.click({ button: 'right', position: at })
    await expect(page.getByTestId('ctx-repeat')).toHaveText('Repeat LINE')
    await page.keyboard.press('Escape')
    // Con selección: Copy al portapapeles y Paste to Original Coordinates.
    await store(page, 's.selectAll()')
    await canvas.click({ button: 'right', position: at })
    await expect(page.getByTestId('ctx-erase')).toBeVisible()
    await page.getByTestId('ctx-clipboard').hover()
    await page.getByTestId('ctx-copyclip').click()
    await expect(page.locator('.cmd-output')).toContainText('1 object(s) copied to the clipboard.')
    await typeCmd(page, 'PASTEORIG')
    expect(await store(page, 'return s.doc.entities.length')).toBe(2)
    // Ctrl+V pega en un punto.
    await page.keyboard.press('Control+v')
    await typeCmd(page, '#0,20')
    expect(await store(page, 'const l = s.doc.entities; return l[l.length - 1].props.start')).toEqual([0, 20, 0])
  })
})

test.describe('Cota OPEN 3D models', () => {
  test('OPEN reads an STL as a new drawing; an invalid STEP shows a message and the app keeps working', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    const stl = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid t\n'
    await page.evaluate((text) => {
      const key = Object.keys(window).find((k) => /^__\w+Store$/.test(k))!
      const s = (window as unknown as Record<string, { getState: () => { openDeviceFile: (f: File) => Promise<void> } }>)[key].getState()
      return s.openDeviceFile(new File([text], 'part.stl'))
    }, stl)
    await expect(page.locator('.cmd-output')).toContainText('Opened "part.stl" from the device (1 mesh(es)).')
    expect(await store(page, 'return s.doc.entities.map((e) => e.type)')).toEqual(['MESH3D'])
    await page.evaluate(() => {
      const key = Object.keys(window).find((k) => /^__\w+Store$/.test(k))!
      const s = (window as unknown as Record<string, { getState: () => { openDeviceFile: (f: File) => Promise<void> } }>)[key].getState()
      return s.openDeviceFile(new File(['not a step file'], 'bad.step'))
    })
    await expect(page.locator('.cmd-output')).toContainText('"bad.step" could not be read (The STEP file could not be read.)', { timeout: 30_000 })
    await typeCmd(page, 'LINE', '#0,0', '#5,5', '')
    await expect(page.locator('.cmd-output')).toContainText('Command: LINE')
  })
})

test.describe('Cota picking solids', () => {
  test('a clean click inside a solid selects it, in wireframe too; a frozen layer is visible but not selectable', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'BOX', '#-20,-20', '#20,20', '10')
    await typeCmd(page, 'ZOOM', 'C', '#0,0', '100')
    const box = (await page.locator('canvas').first().boundingBox())!
    const [cx, cy] = [box.x + box.width / 2 + 7, box.y + box.height / 2 + 5] // dentro de la cara, lejos de las aristas
    for (const style of ['2DWIREFRAME', 'REALISTIC']) {
      await typeCmd(page, 'VSCURRENT', style)
      await store(page, 's.clearSelection()')
      await expect(async () => {
        await page.mouse.click(cx, cy)
        expect(await store(page, 'return s.selection.length')).toBe(1)
      }).toPass({ timeout: 10_000 })
    }
    await store(page, 's.clearSelection()')
    // Una pieza en una capa congelada (encima de la otra): se ve pero el clic pasa de largo hasta la de abajo.
    await typeCmd(page, '-LAYER', 'M', 'Hielo', '')
    await typeCmd(page, 'BOX', '#-20,-20,10', '#20,20,10', '10')
    await typeCmd(page, '-LAYER', 'S', '0', 'F', 'Hielo', '')
    await store(page, 's.clearSelection()')
    await page.mouse.click(cx, cy)
    const picked = await store(page, 'return s.selection.map((id) => s.doc.getEntity(id).layer)')
    expect(picked).toEqual(['0'])
    await store(page, 's.clearSelection()')
  })
})

test.describe('Cota VIEWBASE alignment', () => {
  test('projected views keep the Monge correspondence even when a view has arcs', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    // Caja menos un cilindro que la muerde: en la vista de arriba queda un arco cuyo círculo completo se sale de la
    // pieza (antes eso corría esa vista hacia un costado).
    await store(
      page,
      `s.doc.addEntity({ type: 'SOLID3D', layer: '0', props: { op: 'SUBTRACT', operands: [
        { op: 'BOX', origin: [0, 0, 0], width: 100, depth: 60, height: 10 },
        { op: 'CYLINDER', base: [30, -20, 0], radius: 45, height: 10, segments: 64 } ] } }); s.doc.touch()`,
    )
    await typeCmd(page, 'VIEWBASE', '', '', '#150,150', '#150,60', '#40,150', '')
    await expect(page.locator('.cmd-output')).toContainText('Base view created with 2 projected view(s)', { timeout: 30_000 })
    const ext = await store(
      page,
      `return s.doc.activeLayout.entities.filter((e) => e.props.view).map((e) => {
        const b = s.doc.blocks.find((x) => x.name === e.props.name)
        const xs = [], ys = []
        const s0 = e.props.scale[0]
        for (const l of b.entities) if (l.type === 'LINE') for (const p of [l.props.start, l.props.end]) { xs.push(p[0] * s0 + e.props.position[0]); ys.push(p[1] * s0 + e.props.position[1]) }
        return { o: e.props.view.orientation, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
      })`,
    )
    const [front, below, side] = ext
    expect(front.o).toBe('FRONT')
    // Vista de abajo (alineada en vertical): mismos x que el frente; lateral (en horizontal): mismos y.
    expect(below.minX).toBeCloseTo(front.minX, 3)
    expect(below.maxX).toBeCloseTo(front.maxX, 3)
    expect(side.minY).toBeCloseTo(front.minY, 3)
    expect(side.maxY).toBeCloseTo(front.maxY, 3)
  })
})

test.describe('Cota picked objects are highlighted', () => {
  test('FILLET and OFFSET highlight the object taken with a click until the command ends', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'LINE', '#-40,0', '#40,0', '')
    await typeCmd(page, 'ZOOM', 'C', '#0,0', '100')
    const box = (await page.locator('canvas').first().boundingBox())!
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]
    for (const cmd of ['FILLET', 'OFFSET']) {
      await typeCmd(page, cmd, ...(cmd === 'OFFSET' ? ['5'] : []))
      await page.mouse.click(cx + 20, cy)
      await expect.poll(() => store(page, 'return s.picked.length')).toBe(1)
      await page.keyboard.press('Escape')
      await expect.poll(() => store(page, 'return s.picked.length')).toBe(0)
    }
  })
})

test.describe('Cota orbit commands', () => {
  test('3DORBIT turns the view by dragging; 3DFORBIT can pass over the pole; Esc exits', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'BOX', '#0,0', '#20,20', '20')
    const box = (await page.locator('canvas').first().boundingBox())!
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2]
    const cam = () => store(page, 'const c = s.activeViewport.getCamera(); return [c.az, c.el]')
    for (const cmd of ['3DORBIT', '3DFORBIT']) {
      const before = await cam()
      await typeCmd(page, cmd)
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + 60, cy + 40, { steps: 6 })
      await page.mouse.up()
      const after = await cam()
      expect(Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1])).toBeGreaterThan(0.3)
      await page.keyboard.press('Escape')
      await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
    }
  })
})

test.describe('Cota VIEWGEN', () => {
  test('the diagram picks the views; in a layout they are created aligned, ISO-E by default', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'BOX', '#0,0', '#40,30', '20')
    await page.getByText('Layout1').click()
    await typeCmd(page, 'VIEWGEN', '')
    await expect(page.getByTestId('viewgen-dialog')).toBeVisible()
    // Por defecto: alzado, planta, izquierda e isométrica SE; se agrega la derecha y se saca la isométrica.
    await page.getByTestId('viewgen-RIGHT').click()
    await page.getByTestId('viewgen-ISO').click()
    await page.getByTestId('viewgen-ok').click()
    await typeCmd(page, '#200,150')
    await expect(page.locator('.cmd-output')).toContainText('4 view(s) created (ISO-E, first-angle')
    const v = await store(
      page,
      `return s.doc.activeLayout.entities.filter((e) => e.props.view).map((e) => ({ out: e.props.view.basis.out, x: e.props.position[0], y: e.props.position[1] }))`,
    )
    const find = (o: number[]) => v.find((w: { out: number[] }) => w.out.every((c: number, i: number) => Math.abs(c - o[i]) < 1e-9))!
    const front = find([0, -1, 0])
    const top = find([0, 0, 1])
    const left = find([-1, 0, 0])
    const right = find([1, 0, 0])
    // ISO-E: planta debajo del alzado, vista izquierda a la derecha, derecha a la izquierda.
    expect(top.x).toBeCloseTo(front.x, 6)
    expect(top.y).toBeLessThan(front.y)
    expect(left.y).toBeCloseTo(front.y, 6)
    expect(left.x).toBeGreaterThan(front.x)
    expect(right.x).toBeLessThan(front.x)
  })
})
