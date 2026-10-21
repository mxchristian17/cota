import { test, expect, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
  }
}

/** Centro del canvas y escala px→mundo de la vista TOP ortográfica (extent vertical = 200). */
async function canvasRef(page: Page) {
  const box = await page.locator('canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, s: box.height / 200 }
}

async function lastEntity(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __cotaStore: { getState: () => { doc: { entities: { type: string; props: Record<string, unknown> }[] } } }
    }
    const list = w.__cotaStore.getState().doc.entities
    return list[list.length - 1]
  })
}

test.describe('Cota snap/UCS + UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('toggles SNAP (button + F9) and ESNAP (button + F3)', async ({ page }) => {
    const snap = page.getByTestId('snap-toggle')
    await expect(snap).toHaveAttribute('aria-pressed', 'false')
    await snap.click()
    await expect(snap).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('F9')
    await expect(snap).toHaveAttribute('aria-pressed', 'false')

    const esnap = page.getByTestId('esnap-toggle')
    await expect(esnap).toHaveAttribute('aria-pressed', 'true') // on por defecto
    await page.keyboard.press('F3')
    await expect(esnap).toHaveAttribute('aria-pressed', 'false')
  })

  test('UCS command updates and the UCS button resets to World', async ({ page }) => {
    const input = page.getByTestId('command-input')
    await input.fill('UCS')
    await input.press('Enter')
    await input.fill('10,10') // nuevo origen
    await input.press('Enter')
    await input.press('Enter') // <Accept>: sin rotación
    const ucsToggle = page.getByTestId('ucs-toggle')
    await expect(ucsToggle).toHaveClass(/on/) // UCS distinta de la universal
    await expect(page.getByTestId('viewcube-ucs').first()).toHaveValue('Unnamed')
    await ucsToggle.click()
    await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
    await expect(ucsToggle).not.toHaveClass(/on/)
    await expect(page.getByTestId('viewcube-ucs').first()).toHaveValue('WCS')
  })

  test('toggles the Properties palette', async ({ page }) => {
    // El botón ☰ muestra/oculta la paleta de Propiedades. Arranca colapsada (franja): el primer clic la
    // despliega, el segundo la cierra y el tercero la vuelve a mostrar desplegada.
    const palette = page.getByTestId('properties-palette')
    await expect(palette).toHaveClass(/palette-collapsed/)
    await page.getByTestId('toggle-sidebar').click()
    await expect(palette).toBeVisible()
    await expect(palette).not.toHaveClass(/palette-collapsed/)
    await page.getByTestId('toggle-sidebar').click()
    await expect(palette).toHaveCount(0)
    await page.getByTestId('toggle-sidebar').click()
    await expect(palette).not.toHaveClass(/palette-collapsed/)
  })

  test('resizes the command output by dragging the handle', async ({ page }) => {
    const output = page.locator('.cmd-output')
    const before = await output.boundingBox()
    const handle = page.getByTestId('cmd-resizer')
    const hb = await handle.boundingBox()
    if (!before || !hb) throw new Error('no boxes')
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2, hb.y - 80) // arrastrar hacia arriba
    await page.mouse.up()
    const after = await output.boundingBox()
    expect(after!.height).toBeGreaterThan(before!.height + 30)
  })

  test('menú OSNAP de la barra de estado: modos, Select/Clear all y Settings', async ({ page }) => {
    await page.getByTestId('osnap-menu-toggle').click()
    const menu = page.getByTestId('osnap-menu')
    await expect(menu).toBeVisible()
    const per = page.getByTestId('osnap-menu-perpendicular')
    await expect(per).toHaveAttribute('aria-checked', 'false')
    await per.click()
    await expect(per).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('osnap-menu-geometricCenter')).toHaveAttribute('aria-checked', 'false')
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    // Clic derecho sobre OSNAP abre el mismo menú; Settings… abre el diálogo con lo tildado.
    await page.getByTestId('esnap-toggle').click({ button: 'right' })
    await expect(menu).toBeVisible()
    await page.getByTestId('osnap-menu-none').click()
    await expect(page.getByTestId('osnap-menu-endpoint')).toHaveAttribute('aria-checked', 'false')
    await page.getByTestId('osnap-menu-all').click()
    await expect(page.getByTestId('osnap-menu-node')).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('osnap-menu-settings').click()
    await expect(page.getByTestId('osnap-dialog')).toBeVisible()
    await expect(page.getByTestId('osnap-perpendicular')).toBeChecked()
  })

  test('PER tildado en la barra funciona como running osnap sobre un rectángulo con CEN activo', async ({ page }) => {
    await page.getByTestId('osnap-menu-toggle').click()
    await page.getByTestId('osnap-menu-perpendicular').click()
    await page.keyboard.press('Escape')
    await typeCmd(page, 'RECTANGLE', '-40,-20', '#40,10')
    await typeCmd(page, 'LINE', '#-10,-60')
    const { cx, cy, s } = await canvasRef(page)
    // Cursor sobre el borde inferior (y = −20), lejos del pie de la perpendicular y del punto medio.
    await page.mouse.move(cx + 20 * s, cy + 15 * s)
    await page.mouse.move(cx + 25 * s, cy + 20 * s)
    await page.mouse.click(cx + 25 * s, cy + 20 * s)
    await page.getByTestId('command-input').press('Escape')
    const line = await lastEntity(page)
    expect(line.type).toBe('LINE')
    const end = line.props.end as number[]
    expect(end[0]).toBeCloseTo(-10, 6)
    expect(end[1]).toBeCloseTo(-20, 6)
  })

  test('TAN al iniciar una línea: tangente diferida resuelta con el segundo punto', async ({ page }) => {
    await page.getByTestId('osnap-menu-toggle').click()
    await page.getByTestId('osnap-menu-tangent').click()
    await page.keyboard.press('Escape')
    await typeCmd(page, 'CIRCLE', '0,0', '20')
    await typeCmd(page, 'LINE')
    const { cx, cy, s } = await canvasRef(page)
    // Clic sobre el borde a 120° (lejos de los cuadrantes): todavía no hay punto anterior.
    const [px, py] = [20 * Math.cos((2 * Math.PI) / 3), 20 * Math.sin((2 * Math.PI) / 3)]
    await page.mouse.move(cx + px * s + 3, cy - py * s - 3)
    await page.mouse.move(cx + px * s, cy - py * s)
    await page.mouse.click(cx + px * s, cy - py * s)
    await typeCmd(page, '#60,0', '')
    const line = await lastEntity(page)
    expect(line.type).toBe('LINE')
    const a = line.props.start as number[]
    const b = line.props.end as number[]
    expect(b[0]).toBeCloseTo(60, 6)
    // Tangente: el radio al punto de contacto es perpendicular a la línea.
    expect(a[0] * (b[0] - a[0]) + a[1] * (b[1] - a[1])).toBeCloseTo(0, 4)
    expect(Math.hypot(a[0], a[1])).toBeCloseTo(20, 6)
    expect(a[1]).toBeGreaterThan(0) // la tangente de arriba (del lado del clic)
  })

  test('las capas apagadas o congeladas no dan snaps', async ({ page }) => {
    await typeCmd(page, '-LAYER', 'M', 'Oculta', '', 'LINE', '#0,0', '#40,0', '', '-LAYER', 'S', '0', '')
    const { cx, cy, s } = await canvasRef(page)
    const startOfNewLine = async () => {
      await typeCmd(page, 'LINE')
      await page.mouse.move(cx + 40 * s + 6, cy - 3)
      await page.mouse.move(cx + 40 * s + 3, cy - 3)
      await page.mouse.click(cx + 40 * s + 3, cy - 3)
      await typeCmd(page, '#60,20', '')
      return (await lastEntity(page)).props.start as number[]
    }
    expect((await startOfNewLine())[0]).toBeCloseTo(40, 6) // visible: ENDpoint
    for (const opt of ['OFF', 'F']) {
      await typeCmd(page, 'U', '-LAYER', opt, 'Oculta', '')
      expect((await startOfNewLine())[0]).not.toBeCloseTo(40, 3)
      await typeCmd(page, 'U', '-LAYER', 'ON', 'Oculta', 'T', 'Oculta', '')
    }
  })
})
