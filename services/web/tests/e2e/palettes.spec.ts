import { test, expect, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(30)
  }
}

test.describe('Cota paletas: LAYER modal + Properties', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('LA abre el administrador de capas y permite crear, renombrar y fijar la capa', async ({ page }) => {
    await typeCmd(page, 'LA')
    const dialog = page.getByTestId('layer-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Layer Properties Manager')

    await page.getByTestId('new-layer-input').fill('Muros')
    await page.getByTestId('add-layer').click()
    await expect(page.getByTestId('layer-Muros')).toBeVisible()

    // Renombrar: Enter fija el nombre nuevo
    const nameInput = page.getByTestId('layer-name-Muros')
    await nameInput.fill('Tabiques')
    await nameInput.press('Enter')
    await expect(page.getByTestId('layer-Tabiques')).toBeVisible()

    // Fijar como capa actual
    await page.getByTestId('layer-Tabiques').click()
    await expect(page.getByTestId('layer-Tabiques')).toContainText('●')

    // Plot (printable) se puede apagar desde la tabla
    const plot = page.getByTestId('layer-plot-Tabiques')
    await expect(plot).toBeChecked()
    await plot.uncheck()
    const printable = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { layers: { name: string; printable: boolean }[] } } } }
      return w.__cotaStore.getState().doc.layers.find((l) => l.name === 'Tabiques')?.printable
    })
    expect(printable).toBe(false)
  })

  test('el filtro de la tabla deja sólo las capas que coinciden', async ({ page }) => {
    await typeCmd(page, 'LAYER')
    await page.getByTestId('new-layer-input').fill('Ejes')
    await page.getByTestId('add-layer').click()
    await expect(page.getByTestId('layer-table').locator('tbody tr')).toHaveCount(2) // "0" + Ejes
    await page.getByTestId('layer-filter').fill('eje')
    await expect(page.getByTestId('layer-table').locator('tbody tr')).toHaveCount(1)
  })

  test('el combo de capa de la barra de estado cambia la capa actual', async ({ page }) => {
    await typeCmd(page, 'LAYER')
    await page.getByTestId('new-layer-input').fill('Cotas')
    await page.getByTestId('add-layer').click()
    await page.getByTestId('layer-dialog').locator('.modal-actions .btn').click()

    const select = page.getByTestId('layer-select')
    await select.selectOption({ label: 'Cotas' })
    const current = await page.evaluate(() => {
      const w = window as unknown as {
        __cotaStore: { getState: () => { currentLayerId: string; doc: { layers: { id: string; name: string }[] } } }
      }
      const s = w.__cotaStore.getState()
      return s.doc.layers.find((l) => l.id === s.currentLayerId)?.name
    })
    expect(current).toBe('Cotas')
  })

  test('la paleta de Propiedades se arrastra, se acopla a la derecha y se minimiza', async ({ page }) => {
    // Con el panel del agente cerrado el borde derecho es el del dibujo (la prueba suelta la paleta en x = 1200).
    await page.getByTestId('agent-close').click()
    const palette = page.getByTestId('properties-palette')
    await expect(palette).toHaveAttribute('data-dock', 'left')

    // Arrastra la barra de título hasta el borde derecho → se acopla a la derecha
    const title = page.getByTestId('palette-title')
    const box = await title.boundingBox()
    if (!box) throw new Error('sin paleta')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(1200, 300, { steps: 10 })
    await expect(page.getByTestId('dock-hint')).toBeVisible()
    await page.mouse.up()
    await expect(palette).toHaveAttribute('data-dock', 'right')

    // Arranca minimizada (sólo la barra de título); se restaura y se vuelve a minimizar.
    await expect(page.getByTestId('properties-palette')).toHaveClass(/palette-minimized/)
    await page.getByTestId('palette-minimize').click()
    await expect(page.getByTestId('properties-palette')).not.toHaveClass(/palette-minimized/)
    await page.getByTestId('palette-minimize').click()
    await expect(page.getByTestId('properties-palette')).toHaveClass(/palette-minimized/)
  })

  test('se suelta en el medio y queda flotante', async ({ page }) => {
    const title = page.getByTestId('palette-title')
    const box = await title.boundingBox()
    if (!box) throw new Error('sin paleta')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(600, 380, { steps: 10 })
    await page.mouse.up()
    await expect(page.getByTestId('properties-palette')).toHaveAttribute('data-dock', 'float')
    await expect(page.getByTestId('properties-palette')).toHaveClass(/palette-floating/)
  })

  test('el estado de la paleta se restaura con la sesión del usuario', async ({ page }) => {
    // Sesión válida + config persistida con la paleta acoplada a la derecha y minimizada.
    await page.route('**/auth/me', (route) =>
      route.fulfill({
        json: { id: 1, email: 'a@x.com' },
      }),
    )
    await page.route('**/config', (route) =>
      route.fulfill({ json: { data: { propsPalette: { open: true, minimized: true, dock: 'right', x: 300, y: 200, width: 320 } } } }),
    )
    await page.reload()
    const palette = page.getByTestId('properties-palette')
    await expect(palette).toHaveAttribute('data-dock', 'right')
    await expect(palette).toHaveClass(/palette-minimized/)
  })

  test('cerrar la paleta y reabrirla con PR y con doble clic sobre una entidad', async ({ page }) => {
    await page.getByTestId('palette-close').click()
    await expect(page.getByTestId('properties-palette')).toHaveCount(0)

    await typeCmd(page, 'PR')
    await expect(page.getByTestId('properties-palette')).toBeVisible()

    // Cerrar de nuevo y reabrir con doble clic sobre una entidad (que además la selecciona)
    await page.getByTestId('palette-close').click()
    await typeCmd(page, 'CIRCLE', '0,0', '30')
    const canvas = await page.locator('canvas').boundingBox()
    if (!canvas) throw new Error('no canvas')
    const s = canvas.height / 200
    await page.mouse.dblclick(canvas.x + canvas.width / 2 + 30 * s, canvas.y + canvas.height / 2)
    await expect(page.getByTestId('properties-palette')).toBeVisible()
    await expect(page.getByTestId('properties')).toContainText('CIRCLE')
  })

  test('orden de capas: ▲▼ y arrastre; el clic sobre líneas superpuestas elige la capa de arriba', async ({ page }) => {
    const selectedLayer = () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __cotaStore: { getState: () => { selection: string[]; doc: { getEntity: (id: string) => { layer: string } | undefined; layers: { id: string; name: string }[] } } }
        }
        const s = w.__cotaStore.getState()
        const e = s.selection.length === 1 ? s.doc.getEntity(s.selection[0]) : undefined
        return s.doc.layers.find((l) => l.id === e?.layer)?.name ?? null
      })
    const layerNames = () =>
      page.evaluate(() => {
        const w = window as unknown as { __cotaStore: { getState: () => { doc: { layers: { name: string }[] } } } }
        return w.__cotaStore.getState().doc.layers.map((l) => l.name)
      })
    await typeCmd(page, 'LA')
    for (const n of ['Abajo', 'Arriba']) {
      await page.getByTestId('new-layer-input').fill(n)
      await page.getByTestId('add-layer').click()
    }
    // La misma línea en las dos capas (Abajo primero en la lista → se dibuja encima).
    for (const n of ['Abajo', 'Arriba']) {
      await page.getByTestId(`layer-${n}`).click()
      await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })
      await typeCmd(page, 'LINE', '#-50,0', '#50,0', '')
      await typeCmd(page, 'LA')
    }
    await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })
    const box = await page.locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    const click = async () => {
      await page.getByTestId('command-input').press('Escape')
      await page.mouse.click(box.x + box.width / 2 + 20, box.y + box.height / 2)
    }
    await click()
    await expect.poll(selectedLayer).toBe('Abajo')

    // ▲ dos veces: Arriba pasa a la primera fila → ahora gana el clic.
    await typeCmd(page, 'LA')
    await page.getByTestId('layer-up-Arriba').click()
    await page.getByTestId('layer-up-Arriba').click()
    expect(await layerNames()).toEqual(['Arriba', '0', 'Abajo'])
    await expect(page.getByTestId('layer-up-Arriba')).toBeDisabled()
    // Arrastre: Abajo a la primera fila.
    await page.getByTestId('layer-drag-Abajo').dragTo(page.getByTestId('layer-row-Arriba'))
    expect(await layerNames()).toEqual(['Abajo', 'Arriba', '0'])
    await page.getByTestId('layer-down-Abajo').click()
    expect(await layerNames()).toEqual(['Arriba', 'Abajo', '0'])
    await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })
    await click()
    await expect.poll(selectedLayer).toBe('Arriba')
    // Un Ctrl+Z deshace el último movimiento.
    await typeCmd(page, 'UNDO')
    expect(await layerNames()).toEqual(['Abajo', 'Arriba', '0'])
  })

  test('Freeze: la capa congelada se ve en grises pero no se selecciona; la actual no se congela', async ({ page }) => {
    const selection = () =>
      page.evaluate(() => (window as unknown as { __cotaStore: { getState: () => { selection: string[] } } }).__cotaStore.getState().selection.length)
    await typeCmd(page, 'LA')
    await page.getByTestId('new-layer-input').fill('Hielo')
    await page.getByTestId('add-layer').click()
    await page.getByTestId('layer-Hielo').click()
    await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })
    await typeCmd(page, 'LINE', '#-50,0', '#50,0', '')
    await typeCmd(page, 'LA')
    // La capa actual (Hielo) no se puede congelar.
    await expect(page.getByTestId('layer-freeze-Hielo')).toBeDisabled()
    await page.getByTestId('layer-0').click()
    await page.getByTestId('layer-freeze-Hielo').click()
    await expect(page.getByTestId('layer-freeze-Hielo')).toHaveText('❄')
    await expect(page.getByTestId('layer-freeze-0')).toBeDisabled()
    await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } })
    const box = await page.locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.click(box.x + box.width / 2 + 20, box.y + box.height / 2)
    expect(await selection()).toBe(0)
    // Hacer actual la congelada se rechaza.
    await typeCmd(page, '-LAYER', 'S', 'Hielo', '')
    await expect(page.locator('.cmd-output')).toContainText('Cannot set frozen layer "Hielo" current.')
    // Descongelada vuelve a seleccionarse.
    await typeCmd(page, 'LAYTHW')
    await page.mouse.click(box.x + box.width / 2 + 20, box.y + box.height / 2)
    await expect.poll(selection).toBe(1)
  })
})

test.describe('Cota barra única y barra Dimension', () => {
  test('los menús están en la barra superior; la barra Dimension flota, se cierra, vuelve desde Tools y se acopla', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await expect(page.locator('header.topbar [data-testid=command-bar]')).toHaveCount(1)
    const tb = page.getByTestId('toolbar-dimension')
    // Por defecto acoplada a la izquierda, vertical.
    await expect(tb).toHaveAttribute('data-dock', 'left')
    // Desanclar arrastrando el agarre.
    const grip = (await page.getByTestId('toolbar-dimension-grip').boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + 260, grip.y + 260, { steps: 6 })
    await page.mouse.up()
    await expect(tb).toHaveAttribute('data-dock', 'float')
    // Cerrar y volver a mostrar desde Tools ▸ Toolbars ▸ Dimension (flotante, donde estaba).
    await page.getByTestId('toolbar-dimension-close').click()
    await expect(tb).toHaveCount(0)
    await page.getByTestId('command-cat-Tools').click()
    await page.getByTestId('menu-toolbar-dimension').click()
    await expect(tb).toHaveAttribute('data-dock', 'float')
    // Doble clic en el título: acoplada otra vez; -TOOLBAR la oculta y la muestra.
    await page.getByTestId('toolbar-dimension-title').dblclick()
    await expect(tb).toHaveAttribute('data-dock', 'left')
    // -TOOLBAR la acopla a cualquier borde, como el CAD clásico.
    await typeCmd(page, '-TOOLBAR', 'Dimension', 'T')
    await expect(tb).toHaveAttribute('data-dock', 'top')
    await typeCmd(page, '-TOOLBAR', 'Dimension', 'H')
    await expect(tb).toHaveCount(0)
    await typeCmd(page, '-TOOLBAR', 'Dimension', 'S')
    await expect(tb).toHaveCount(1)
  })
})
