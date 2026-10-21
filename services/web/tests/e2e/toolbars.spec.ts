import { test, expect, type Page } from '@playwright/test'

/** Barras de herramientas clásicas y preferencias persistentes. */

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(40)
  }
}

const visibleToolbars = (page: Page) =>
  page.evaluate(() =>
    Object.entries((window as unknown as { __cotaStore: { getState: () => { toolbars: Record<string, { visible: boolean }> } } }).__cotaStore.getState().toolbars)
      .filter(([, t]) => t.visible)
      .map(([id]) => id),
  )

test.describe('Cota barras de herramientas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('por defecto sólo Dimension; Tools ▸ Toolbars muestra Draw y su botón dibuja', async ({ page }) => {
    expect(await visibleToolbars(page)).toEqual(['dimension'])
    await expect(page.locator('.toolbar')).toHaveCount(1)
    await page.getByTestId('command-cat-Tools').click()
    await expect(page.getByTestId('menu-toolbar-draw')).toContainText('Draw')
    await page.getByTestId('menu-toolbar-draw').click()
    const draw = page.getByTestId('toolbar-draw')
    await expect(draw).toHaveAttribute('data-dock', 'left')
    // Botón LINE: arranca el comando; otro botón cancela el anterior (^C^C) y arranca el suyo.
    await page.getByTestId('tb-draw-line').click()
    await expect(page.locator('.cmd-prompt')).toContainText('first point')
    await page.getByTestId('tb-draw-circle').click()
    await expect(page.locator('.cmd-prompt')).toContainText('center point')
    await page.keyboard.press('Escape')
    // Tooltip con el comando.
    await expect(page.getByTestId('tb-draw-rectangle')).toHaveAttribute('title', 'Rectangle (RECTANGLE)')
  })

  test('clic derecho: lista de barras con tildes, flotar y cerrar', async ({ page }) => {
    await page.getByTestId('toolbar-dimension').click({ button: 'right', position: { x: 5, y: 5 } })
    const menu = page.getByTestId('toolbar-menu')
    await expect(menu).toBeVisible()
    await expect(page.getByTestId('toolbar-menu-dimension')).toContainText('✓')
    await page.getByTestId('toolbar-menu-modify').click()
    await expect(page.getByTestId('toolbar-modify')).toHaveAttribute('data-dock', 'right')
    // Flotar Modify desde su propio menú y cerrarla con su ✕.
    await page.getByTestId('toolbar-modify').click({ button: 'right', position: { x: 5, y: 5 } })
    await page.getByTestId('toolbar-menu-float').click()
    await expect(page.getByTestId('toolbar-modify')).toHaveAttribute('data-dock', 'float')
    await expect(page.getByTestId('toolbar-modify-title')).toContainText('Modify')
    await page.getByTestId('toolbar-modify-close').click()
    await expect(page.getByTestId('toolbar-modify')).toHaveCount(0)
  })

  test('TOOLBAR: diálogo con la lista, Show all, Hide all y Reset', async ({ page }) => {
    await typeCmd(page, 'TOOLBAR')
    const dlg = page.getByTestId('toolbar-dialog')
    await expect(dlg).toBeVisible()
    await page.getByTestId('toolbar-check-zoom').check()
    await expect(page.getByTestId('toolbar-zoom')).toBeVisible()
    await page.getByTestId('toolbar-dialog-showall').click()
    await expect(page.locator('.toolbar')).toHaveCount(23)
    await page.getByTestId('toolbar-dialog-hideall').click()
    await expect(page.locator('.toolbar')).toHaveCount(0)
    await page.getByTestId('toolbar-dialog-reset').click()
    expect(await visibleToolbars(page)).toEqual(['dimension'])
    await page.getByTestId('toolbar-dialog-close').click()
    await expect(dlg).toHaveCount(0)
  })

  test('Esc cierra los cuadros de diálogo', async ({ page }) => {
    for (const [cmd, id] of [['TOOLBAR', 'toolbar-dialog'], ['LAYER', 'layer-dialog'], ['HELP', 'help-dialog']]) {
      await typeCmd(page, cmd)
      await expect(page.getByTestId(id)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId(id)).toHaveCount(0)
    }
  })

  test('-TOOLBAR acepta todas las barras, los bordes y ALL', async ({ page }) => {
    await typeCmd(page, '-TOOLBAR', 'Layers II', 'T')
    await expect(page.getByTestId('toolbar-layers2')).toHaveAttribute('data-dock', 'top')
    await typeCmd(page, '-TOOLBAR', 'object snap', 'B')
    await expect(page.getByTestId('toolbar-osnap')).toHaveAttribute('data-dock', 'bottom')
    await typeCmd(page, '-TOOLBAR', 'ALL', 'H')
    await expect(page.locator('.toolbar')).toHaveCount(0)
    await typeCmd(page, '-TOOLBAR', 'nada')
    await expect(page.locator('.cmd-output')).toContainText('Toolbar "nada" not found')
  })

  test('arrastrar una barra por el agarre la acopla en otro borde, junto a las que ya están', async ({ page }) => {
    await typeCmd(page, '-TOOLBAR', 'Standard', 'S', '-TOOLBAR', 'Zoom', 'S')
    const zoom = page.getByTestId('toolbar-zoom')
    await expect(zoom).toHaveAttribute('data-dock', 'right')
    const grip = (await page.getByTestId('toolbar-zoom-grip').boundingBox())!
    const std = (await page.getByTestId('toolbar-standard').boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    // Soltada sobre el borde superior, a la derecha de Standard.
    await page.mouse.move(std.x + std.width + 30, std.y + std.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(zoom).toHaveAttribute('data-dock', 'top')
    const order = await page.locator('.tb-dock-top > .toolbar').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id))
    expect(order).toEqual(['standard', 'zoom'])
  })

  test('los botones de referencia a objetos entran en el comando en curso', async ({ page }) => {
    await typeCmd(page, '-TOOLBAR', 'Object Snap', 'S', 'LINE')
    await page.getByTestId('tb-osnap-snapend').click()
    await expect(page.locator('.cmd-output')).toContainText('END')
    await expect(page.locator('.cmd-prompt')).toContainText('first point')
    await page.keyboard.press('Escape')
  })

  test('GRID: botón de la barra de estado, F7 y comando', async ({ page }) => {
    const grid = () => page.evaluate(() => (window as unknown as { __cotaStore: { getState: () => { viewports: Array<{ grid: { visible: boolean } }> } } }).__cotaStore.getState().viewports[0].grid.visible)
    expect(await grid()).toBe(true)
    await page.getByTestId('grid-toggle').click()
    await expect.poll(grid).toBe(false)
    await expect(page.getByTestId('grid-toggle')).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('F7')
    await expect.poll(grid).toBe(true)
    await typeCmd(page, 'GRID', 'OFF')
    await expect.poll(grid).toBe(false)
  })
})

test.describe('Cota preferencias persistentes', () => {
  test('sin cuenta, todo queda como estaba al recargar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, '-TOOLBAR', 'Draw', 'T', '-TOOLBAR', 'Modify', 'F', 'COMMANDLINEHIDE', 'UCSICON', 'OFF', 'ZOOMFACTOR', '80')
    await page.getByTestId('grid-toggle').click()
    await page.getByTestId('ortho-toggle').click()
    await page.reload()
    await expect(page.getByTestId('command-input')).toBeVisible()
    await expect(page.getByTestId('toolbar-draw')).toHaveAttribute('data-dock', 'top')
    await expect(page.getByTestId('toolbar-modify')).toHaveAttribute('data-dock', 'float')
    await expect(page.getByTestId('grid-toggle')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('ortho-toggle')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.commandline')).toHaveAttribute('data-compact', 'true')
    await typeCmd(page, 'ZOOMFACTOR')
    await expect(page.locator('.cmd-prompt')).toContainText('80')
  })

  test('con cuenta: gana la copia más reciente y los cambios se suben', async ({ page }) => {
    const puts: Array<Record<string, unknown>> = []
    await page.route('**/auth/login', (r) => r.fulfill({ json: { user: { id: 1, email: 'a@x.com' } } }))
    await page.route('**/auth/me', (r) => r.fulfill({ status: 401, json: { detail: 'Authentication required' } }))
    await page.route('**/documents', (r) => r.fulfill({ json: [] }))
    await page.route('**/config', async (r) => {
      if (r.request().method() === 'PUT') {
        puts.push((r.request().postDataJSON() as { data: Record<string, unknown> }).data)
        return r.fulfill({ json: { data: {} } })
      }
      // La cuenta tiene preferencias más nuevas que el navegador: la barra Zoom visible y la grilla apagada.
      return r.fulfill({ json: { data: { toolbars: { zoom: { visible: true, docked: true, side: 'right' } }, gridOn: false, savedAt: Date.now() + 60_000 } } })
    })
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, '-TOOLBAR', 'Draw', 'S') // preferencia local, más vieja que la de la cuenta
    await page.getByTestId('login-button').click()
    await page.getByTestId('login-email').fill('a@x.com')
    await page.getByTestId('login-password').fill('secret123')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('user-email')).toBeVisible()
    await expect(page.getByTestId('toolbar-zoom')).toBeVisible()
    await expect(page.getByTestId('toolbar-draw')).toHaveCount(0)
    await expect(page.getByTestId('grid-toggle')).toHaveAttribute('aria-pressed', 'false')
    // Un cambio con sesión se guarda también en la cuenta.
    await typeCmd(page, '-TOOLBAR', 'Text', 'S')
    await expect.poll(() => puts.some((d) => (d.toolbars as Record<string, { visible: boolean }> | undefined)?.text?.visible === true)).toBe(true)
  })
})
