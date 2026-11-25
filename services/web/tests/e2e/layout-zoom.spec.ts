import { test, expect, type Page } from '@playwright/test'

/**
 * Mucho zoom en un layout: la hoja, su área imprimible, los viewports y sus canvas no pasan del tamaño del área
 * de dibujo (antes medían millones de px y el navegador del teléfono se cerraba), los textos no crecen sin límite y el
 * viewport recortado sigue dibujando el modelo en su lugar.
 */
const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(30)
  }
}

/** Lado mayor (px) de lo que pinta el layout, del canvas de cada viewport y del texto más grande, y el área de dibujo. */
const sizes = (page: Page) =>
  page.evaluate(() => {
    const view = document.querySelector('[data-testid="layout-view"]')!.getBoundingClientRect()
    const els = [...document.querySelectorAll('.layout-sheet, .layout-printable, .layout-vp-host')].map((e) => e.getBoundingClientRect())
    const canvases = [...document.querySelectorAll('.layout-vp-host canvas')] as HTMLCanvasElement[]
    const fonts = [...document.querySelectorAll('[data-testid="layout-view"] div')]
      .map((d) => parseFloat((d as HTMLElement).style.fontSize))
      .filter((f) => f > 0)
    return {
      view: [view.width, view.height],
      box: Math.max(0, ...els.map((r) => Math.max(r.width, r.height))),
      canvas: Math.max(0, ...canvases.map((c) => Math.max(c.width, c.height) / devicePixelRatio)),
      font: Math.max(0, ...fonts),
    }
  })

test.describe('Layout con mucho zoom', () => {
  let errors: string[] = []
  test.afterEach(() => expect(errors).toEqual([]))

  test.beforeEach(async ({ page }) => {
    errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    // Modelo de 4000 × 3000 con un círculo y un texto en el centro.
    await typeCmd(page, 'LINE', '0,0', '@4000,0', '@0,3000', '@-4000,0', 'C', 'CIRCLE', '2000,1500', '800', 'TEXT', '1900,1450', '100', '0', 'CENTRO', '')
    // TrueType (como los textos de un DXF con fuentes de Windows): se dibuja como texto de la página, no con trazos.
    expect(await st<number>(page, `const t = s.doc.modelEntities.filter((e) => e.type === 'TEXT'); for (const e of t) { e.props.font = 'Arial'; e.props.stroke = false } s.doc.touch(); return t.length`)).toBe(1)
    await page.getByTestId('tab-Layout1').click()
    await expect(page.getByTestId('layout-sheet')).toBeVisible()
  })

  test('zoom del papel hasta el tope: nada pasa del área de dibujo y el viewport recortado muestra el modelo en su lugar', async ({ page }) => {
    const vp = await st<{ id: string; center: number[]; target: number[]; scale: number }>(
      page,
      `const v = s.doc.layoutEntities(s.doc.activeTab).find((e) => e.type === 'VIEWPORT'); return { id: v.id, center: v.props.center, target: v.props.target, scale: v.props.scale }`,
    )
    // Punto del papel donde cae un punto del modelo (vista en planta).
    const paperOf = (mx: number, my: number) => [vp.center[0] + (mx - vp.target[0]) * vp.scale, vp.center[1] + (my - vp.target[1]) * vp.scale]
    // El borde derecho del círculo en el centro de la pantalla, con 2 mm de papel a la vista: el viewport se sale por
    // los cuatro lados y queda recortado.
    const [px, py] = paperOf(2800, 1500)
    await st(page, `s.activeViewport.setCamera({ target: [${px}, ${py}, 0], az: -Math.PI / 2, el: Math.PI / 2, radius: 2 })`)
    await page.waitForTimeout(600)
    let m = await sizes(page)
    const limit = Math.max(...m.view) + 2 * 32 + 2
    expect(m.box).toBeLessThanOrEqual(limit)
    expect(m.canvas).toBeLessThanOrEqual(limit)
    // El círculo pasa por el centro de la vista: ahí hay trazo (oscuro sobre el papel blanco).
    const view = (await page.getByTestId('layout-view').boundingBox())!
    const shot = await page.screenshot({ clip: { x: view.x + view.width / 2 - 6, y: view.y + view.height / 2 - 6, width: 12, height: 12 } })
    expect(await darkPixels(page, shot)).toBeGreaterThan(0)

    // Hasta el tope del zoom del papel: sigue acotado (antes, letras de ~900.000 px y cuadros de 2 s).
    await st(page, `s.activeViewport.setCamera({ target: [${px}, ${py}, 0], az: -Math.PI / 2, el: Math.PI / 2, radius: 1e-4 })`)
    await page.waitForTimeout(600)
    m = await sizes(page)
    expect(m.box).toBeLessThanOrEqual(limit)
    expect(m.canvas).toBeLessThanOrEqual(limit)
    expect(m.font).toBeLessThanOrEqual(2 * Math.max(...m.view) + 1)
  })

  test('en MSPACE, mucho zoom del modelo por el viewport: los textos no crecen sin límite', async ({ page }) => {
    const id = await st<string>(page, `return s.doc.layoutEntities(s.doc.activeTab).find((e) => e.type === 'VIEWPORT').id`)
    await st(page, `s.setMsViewport('${id}')`)
    await page.waitForTimeout(300)
    // Cerca de donde se ancla la etiqueta del texto (su esquina de arriba a la izquierda): ahí la letra queda en pantalla
    // y antes crecía sin límite.
    const [ax, ay] = await st<number[]>(page, `const p = s.activeViewport.textLabels[0].pos; return [p.x, p.y]`)
    for (const r of [50, 1, 0.01]) {
      await st(page, `const v = s.activeViewport; v.setCamera({ ...v.getCamera(), target: [${ax + 0.002}, ${ay - 0.002}, 0], radius: ${r} })`)
      await page.waitForTimeout(400)
      const m = await sizes(page)
      expect(m.font).toBeLessThanOrEqual(2 * Math.max(...m.view) + 1)
      expect(m.canvas).toBeLessThanOrEqual(Math.max(...m.view) + 2 * 32 + 2)
    }
  })
})

/** Cantidad de píxeles oscuros de una captura PNG (se decodifica en la página). */
async function darkPixels(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 300) n++
    return n
  }, png.toString('base64'))
}
