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
