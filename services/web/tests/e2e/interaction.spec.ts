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

test.describe('Cota: interacción de CAD clásica', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // La paleta de Propiedades arranca minimizada: estas pruebas miran su contenido.
    await page.waitForFunction(() => !!(window as any).__cotaStore)
    await page.evaluate(() => (window as any).__cotaStore.getState().setPropsPalette({ minimized: false }))
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('los clicks acumulan la selección y Shift la resta', async ({ page }) => {
    await typeCmd(page, 'RECTANGLE', '-40,-20', '#-10,10')
    await typeCmd(page, 'RECTANGLE', '10,-20', '#40,10')
    const { cx, cy, s } = await canvasRef(page)
    // click en el borde superior de cada rectángulo (world y = 10)
    await page.mouse.click(cx - 25 * s, cy - 10 * s)
    await expect(page.getByTestId('properties')).toContainText('RECTANGLE')
    await page.mouse.click(cx + 25 * s, cy - 10 * s)
    await expect(page.getByText('2 objects selected.')).toBeVisible()
    // Shift + click sobre el segundo → vuelve a quedar uno solo
    await page.keyboard.down('Shift')
    await page.mouse.click(cx + 25 * s, cy - 10 * s)
    await page.keyboard.up('Shift')
    await expect(page.getByTestId('properties')).toContainText('RECTANGLE')
    // ESC limpia todo
    await page.getByTestId('command-input').press('Escape')
    await expect(page.getByText('No selection.')).toBeVisible()
  })

  test('la barra espaciadora confirma el comando como Enter', async ({ page }) => {
    const input = page.getByTestId('command-input')
    await input.fill('l')
    await input.press(' ')
    await expect(page.locator('.cmd-prompt')).toHaveText('Specify first point:')
    await input.press('Escape')
    await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
  })

  test('el prefijo _ de las macros se ignora', async ({ page }) => {
    await typeCmd(page, '_circle', '0,0', '10')
    await expect(page.locator('.cmd-output')).not.toContainText('Unknown command')
    const radius = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore?: { getState: () => { doc: { entities: { type: string; props: Record<string, unknown> }[] } } } }
      const e = w.__cotaStore?.getState().doc.entities[0]
      return e?.type === 'CIRCLE' ? (e.props as { radius: number }).radius : null
    })
    expect(radius).toBe(10)
  })

  test('autocompletado: lista de comandos y Tab completa', async ({ page }) => {
    const input = page.getByTestId('command-input')
    await input.fill('cir')
    await expect(page.getByTestId('cmd-suggest')).toContainText('CIRCLE')
    await input.press('Tab')
    await expect(input).toHaveValue('CIRCLE')
    await input.press('Escape')
  })

  test('Ctrl+Z y Ctrl+Y funcionan con el foco en la línea de comandos', async ({ page }) => {
    await typeCmd(page, 'LINE', '0,0', '50,0', '')
    const input = page.getByTestId('command-input')
    await input.press('Control+z')
    await expect(page.locator('.cmd-output')).toContainText('Undo.')
    await input.press('Control+y')
    await expect(page.locator('.cmd-output')).toContainText('Redo.')
  })

  test('Enter fija el valor editado en el panel de propiedades', async ({ page }) => {
    await typeCmd(page, 'CIRCLE', '0,0', '20')
    const { cx, cy, s } = await canvasRef(page)
    await page.mouse.click(cx + 20 * s, cy) // borde derecho del círculo
    await expect(page.getByTestId('properties')).toContainText('CIRCLE')
    const radius = page
      .getByTestId('properties')
      .locator('label.prop-row', { has: page.getByText('Radius', { exact: true }) })
      .locator('input[type=number]')
    await radius.fill('35')
    await radius.press('Enter')
    const value = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore?: { getState: () => { doc: { entities: { type: string; props: Record<string, unknown> }[] } } } }
      const e = w.__cotaStore?.getState().doc.entities[0]
      return (e?.props as { radius?: number }).radius ?? null
    })
    expect(value).toBe(35)
  })

  test('elegir una capa con objetos seleccionados los mueve a esa capa', async ({ page }) => {
    await typeCmd(page, 'RECTANGLE', '-30,-20', '#30,20')
    const { cx, cy, s } = await canvasRef(page)
    // Con la máquina cargada el primer clic puede llegar antes de que el canvas termine de dibujar: se reintenta.
    await expect(async () => {
      await page.mouse.click(cx, cy - 20 * s) // borde superior
      await expect(page.getByTestId('properties')).toContainText('RECTANGLE', { timeout: 1500 })
    }).toPass({ timeout: 15_000 })
    // crea la capa "Muros" en el modal de capas y la fija con el objeto seleccionado
    await typeCmd(page, 'LAYER')
    await expect(page.getByTestId('layer-dialog')).toBeVisible()
    await page.getByTestId('new-layer-input').fill('Muros')
    await page.getByTestId('add-layer').click()
    await page.getByTestId('layer-Muros').click()
    await page.getByTestId('layer-dialog').locator('.modal-actions .btn').click()
    await expect(page.locator('.cmd-output')).toContainText('moved to layer "Muros"')
    const state = await page.evaluate(() => {
      const w = window as unknown as {
        __cotaStore?: { getState: () => { doc: { entities: { layer: string }[]; layers: { id: string; name: string }[] }; currentLayerId: string } }
      }
      const s2 = w.__cotaStore!.getState()
      const layer = s2.doc.layers.find((l) => l.id === s2.doc.entities[0].layer)
      const current = s2.doc.layers.find((l) => l.id === s2.currentLayerId)
      return { entityLayer: layer?.name, currentLayer: current?.name }
    })
    expect(state.entityLayer).toBe('Muros')
    expect(state.currentLayer).not.toBe('Muros') // la capa actual NO cambia (CAD clásico)
  })

  test('el preview de PLINE muestra los tramos ya fijados', async ({ page }) => {
    await typeCmd(page, 'PLINE', '0,0', '30,0')
    const shapes = await page.evaluate(() => {
      const w = window as unknown as {
        __cotaStore?: { getState: () => { computePreview: (c: { x: number; y: number; z: number }) => unknown[] } }
      }
      return w.__cotaStore!.getState().computePreview({ x: 30, y: 30, z: 0 })
    })
    expect(shapes).toHaveLength(1)
    expect(shapes[0]).toMatchObject({ kind: 'polyline' })
    expect((shapes[0] as { points: unknown[] }).points).toHaveLength(3)
    await page.getByTestId('command-input').press('Escape')
  })
})
