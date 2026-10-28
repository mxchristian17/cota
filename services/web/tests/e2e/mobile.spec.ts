import { devices, expect, test, type CDPSession, type Page } from '@playwright/test'

/** Vista mobile para obra (PRD076): teléfono emulado con pantalla táctil; los dedos van por CDP (toques reales). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _phoneBrowser, ...phone } = devices['Pixel 5']

const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

type P = [number, number]
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: P[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })

/** Un dedo que se apoya, se arrastra en pasos y se levanta. */
async function drag(page: Page, cdp: CDPSession, from: P, to: P, steps = 8) {
  await touch(cdp, 'touchStart', [from])
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]])
    await page.waitForTimeout(16)
  }
  await touch(cdp, 'touchEnd', [])
}

/** Punto del mundo en coordenadas de la página (para apuntar la mira). */
const screenOf = (page: Page, p: { x: number; y: number; z: number }) =>
  page.evaluate((q) => {
    const s = (window as any).__cotaStore.getState()
    const r = (document.querySelector('.m-canvas canvas') as HTMLCanvasElement).getBoundingClientRect()
    const [x, y] = s.activeViewport.project(q)
    return [x + r.left, y + r.top] as [number, number]
  }, p)

const camera = (page: Page) => st<{ az: number; el: number; radius: number }>(page, 'return s.activeViewport.getCamera()')

async function part(page: Page) {
  await st(page, "return s.runScript('BOX 0,0,0 100,60 20\\nCYLINDER 50,30,20 15 30\\nUNION ALL \"\"\\n-LAYER M Ejes \"\"\\nLINE -20,30 120,30 \"\"\\n-LAYER S 0 \"\"', { finish: 'cancel', fresh: true })")
  await page.getByTestId('m-fit').tap()
}

test.describe('Mobile view for the job site', () => {
  test.use(phone)
  test('opens by itself on a phone; Full editor and MOBILEVIEW switch and the choice is kept', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mobile-app')).toBeVisible()
    await expect(page.getByTestId('command-input')).toHaveCount(0)
    await expect(page.getByTestId('agent-tab')).toHaveCount(0)
    await page.getByTestId('m-menu').tap()
    await page.getByTestId('m-full-editor').tap()
    await expect(page.getByTestId('command-input')).toBeVisible()
    await expect(page.getByTestId('mobile-app')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('command-input')).toBeVisible()
    await expect(page.getByTestId('mobile-app')).toHaveCount(0)
    await st(page, "return s.runScript('MOBILEVIEW ON', { fresh: true })")
    await expect(page.getByTestId('mobile-app')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('mobile-app')).toBeVisible()
  })

  test('one finger orbits a 3D part, two fingers pinch, a double tap fits; a 2D drawing pans', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mobile-app')).toBeVisible()
    const cdp = await page.context().newCDPSession(page)
    await part(page)
    await expect(page.getByTestId('m-orbit')).toContainText('Orbit')
    const c0 = await camera(page)
    await drag(page, cdp, [180, 380], [260, 380])
    const c1 = await camera(page)
    expect(Math.abs(c1.az - c0.az)).toBeGreaterThan(0.3)
    // Pinza: separar los dedos acerca.
    await touch(cdp, 'touchStart', [[150, 400], [230, 400]])
    for (let i = 1; i <= 8; i++) {
      await touch(cdp, 'touchMove', [[150 - i * 6, 400], [230 + i * 6, 400]])
      await page.waitForTimeout(16)
    }
    await touch(cdp, 'touchEnd', [])
    const c2 = await camera(page)
    expect(c2.radius).toBeLessThan(c1.radius * 0.6)
    expect(c2.az).toBeCloseTo(c1.az, 5) // la pinza no orbita
    // Doble toque: vuelve a ver todo.
    await page.touchscreen.tap(200, 450)
    await page.waitForTimeout(80)
    await page.touchscreen.tap(200, 450)
    await expect.poll(async () => (await camera(page)).radius).toBeGreaterThan(c2.radius * 1.5)
    expect(await st<number>(page, 'return s.selection.length')).toBe(0) // los toques no seleccionan

    // En un dibujo 2D un dedo desplaza (la vista en planta no se pierde).
    await st(page, "return s.runScript('ERASE ALL \"\"\\nRECTANGLE 0,0 100,60', { finish: 'cancel', fresh: true })")
    await page.getByTestId('m-menu').tap()
    await page.getByTestId('m-full-editor').tap()
    await st(page, "return s.runScript('-VIEW TOP\\nMOBILEVIEW ON', { fresh: true })")
    await expect(page.getByTestId('m-orbit')).toContainText('Pan')
    const p0 = await camera(page)
    await drag(page, cdp, [180, 380], [260, 380])
    const p1 = await camera(page)
    expect(p1.el).toBeCloseTo(p0.el, 5)
    expect(p1.az).toBeCloseTo(p0.az, 5)
    // El botón cambia lo que hace un dedo. (Chrome descarta un toque pegado al final de un arrastre.)
    await page.waitForTimeout(500)
    await page.getByTestId('m-orbit').tap()
    await expect(page.getByTestId('m-orbit')).toContainText('Orbit')
  })

  test('Measure: drag the ring onto two corners with object snap and read the distance', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mobile-app')).toBeVisible()
    const cdp = await page.context().newCDPSession(page)
    await part(page)
    await page.getByTestId('m-views').tap()
    await page.getByTestId('m-view-TOP').tap()
    await page.getByTestId('m-fit').tap()
    await page.getByTestId('m-measure-btn').tap()
    await expect(page.getByTestId('m-measure-hint')).toContainText('Point 1 of 2')
    // La mira queda 72 px por encima del dedo; se apunta cerca de la esquina y el snap la lleva a la esquina.
    const a = await screenOf(page, { x: 0, y: 0, z: 20 })
    const b = await screenOf(page, { x: 100, y: 60, z: 20 })
    await touch(cdp, 'touchStart', [[a[0] + 30, a[1] + 100]])
    await touch(cdp, 'touchMove', [[a[0] + 5, a[1] + 76]])
    await expect(page.getByTestId('touch-aim')).toBeVisible()
    await touch(cdp, 'touchEnd', [])
    await expect(page.getByTestId('m-measure-hint')).toContainText('Point 2 of 2')
    await drag(page, cdp, [b[0] - 40, b[1] + 110], [b[0] - 4, b[1] + 76], 4)
    await expect(page.getByTestId('m-dist')).toHaveText('116.619')
    await expect(page.getByTestId('m-measure')).toContainText('ΔX 100')
    await expect(page.getByTestId('m-measure')).toContainText('ΔY 60')
    await expect(page.getByTestId('touch-aim')).toBeHidden()
    // El tramo medido queda dibujado mientras se ve la tarjeta.
    expect(await st<number>(page, 'return s.computePreview({ x: 0, y: 0, z: 0 }).length')).toBe(1)
    await page.getByTestId('m-measure-close').tap()
    await expect(page.getByTestId('m-measure')).toHaveCount(0)
    expect(await st<number>(page, 'return s.computePreview({ x: 0, y: 0, z: 0 }).length')).toBe(0)
    // Cancelar a mitad.
    await page.getByTestId('m-measure-btn').tap()
    await expect(page.getByTestId('m-measure-hint')).toBeVisible()
    await page.getByTestId('m-measure-cancel').tap()
    await expect(page.getByTestId('m-measure-hint')).toHaveCount(0)
    expect(await st<boolean>(page, 'return s.engine.busy')).toBe(false)
  })

  test('visual style, views, layers only on screen and layouts', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mobile-app')).toBeVisible()
    await part(page)
    await page.getByTestId('m-style').tap()
    await page.getByTestId('m-style-hidden').tap()
    expect(await st<string>(page, 'return s.visualStyle')).toBe('hidden')
    await page.getByTestId('m-views').tap()
    await page.getByTestId('m-view-NEISO').tap()
    const c = await camera(page)
    expect(c.el).toBeGreaterThan(0.3)
    // Capas: apagar en pantalla no toca el dibujo.
    await page.getByTestId('m-layers').tap()
    await page.getByTestId('m-layer-Ejes').tap()
    await expect(page.getByTestId('m-layer-Ejes')).toContainText('Off')
    expect(await st<boolean>(page, "return s.doc.layers.find((l) => l.name === 'Ejes').visible")).toBe(true)
    expect(await st<boolean>(page, "return s.activeViewport.provider().layers.find((l) => l.name === 'Ejes').visible")).toBe(false)
    await page.getByTestId('m-layer-Ejes').tap()
    expect(await st<boolean>(page, "return s.activeViewport.provider().layers.find((l) => l.name === 'Ejes').visible")).toBe(true)
    await page.locator('.m-sheet-backdrop').tap({ position: { x: 20, y: 20 } })
    // Layout: la hoja, sin botón de vistas ni de órbita.
    await page.getByTestId('m-space').selectOption({ label: 'Layout1' })
    await expect(page.getByTestId('layout-sheet')).toBeVisible()
    await expect(page.getByTestId('m-views')).toBeDisabled()
    await expect(page.getByTestId('m-orbit')).toHaveCount(0)
    await page.getByTestId('m-space').selectOption({ label: 'Model' })
    await expect(page.getByTestId('m-orbit')).toBeVisible()
  })

  test('opens a drawing from the device', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mobile-app')).toBeVisible()
    await st(page, "return s.runScript('CIRCLE 0,0 25\\nLINE 0,0 40,0 \"\"', { finish: 'cancel', fresh: true })")
    const data = await st<string>(page, 'return JSON.stringify(s.doc.toJSON())')
    await st(page, "return s.runScript('ERASE ALL \"\"', { finish: 'cancel', fresh: true })")
    await page.getByTestId('m-menu').tap()
    const chooser = page.waitForEvent('filechooser')
    await page.getByTestId('m-open').tap()
    await (await chooser).setFiles({ name: 'obra.cota', mimeType: 'application/json', buffer: Buffer.from(data) })
    await expect(page.getByTestId('m-name')).toHaveText('obra')
    expect(await st<string[]>(page, 'return s.doc.entities.map((e) => e.type)')).toEqual(['CIRCLE', 'LINE'])
  })
})

test.describe('Mobile view on a computer', () => {
  test('the editor stays; ?mobile=1 forces the phone view for this tab only', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await expect(page.getByTestId('mobile-app')).toHaveCount(0)
    await page.goto('/?mobile=1')
    await expect(page.getByTestId('mobile-app')).toBeVisible()
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })
})

test.describe('Touch in the full editor (tablet)', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { defaultBrowserType: _tabletBrowser, ...tablet } = devices['Galaxy Tab S4']
  test.use(tablet)
  test('a tablet keeps the editor; two fingers pinch and one finger still draws', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await expect(page.getByTestId('mobile-app')).toHaveCount(0)
    await st(page, "return s.runScript('CIRCLE 0,0 50\\nZOOM E', { finish: 'cancel', fresh: true })")
    const cdp = await page.context().newCDPSession(page)
    const box = (await page.locator('.viewport-pane canvas').first().boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const r0 = (await camera(page)).radius
    await touch(cdp, 'touchStart', [[cx - 40, cy], [cx + 40, cy]])
    for (let i = 1; i <= 8; i++) {
      await touch(cdp, 'touchMove', [[cx - 40 - i * 8, cy], [cx + 40 + i * 8, cy]])
      await page.waitForTimeout(16)
    }
    await touch(cdp, 'touchEnd', [])
    expect((await camera(page)).radius).toBeLessThan(r0 * 0.6)
    expect(await st<number>(page, 'return s.selection.length')).toBe(0)
    // Un dedo sigue siendo el botón izquierdo: dos toques dibujan una línea.
    await st(page, "s.submitCommand('LINE')")
    await page.touchscreen.tap(cx - 100, cy)
    await page.waitForTimeout(400)
    await page.touchscreen.tap(cx + 100, cy + 50)
    await st(page, "s.submitCommand('')")
    await expect.poll(() => st<number>(page, "return s.doc.entities.filter((e) => e.type === 'LINE').length")).toBe(1)
  })
})
