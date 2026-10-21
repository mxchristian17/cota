import { test, expect } from '@playwright/test'

test.describe('Cota navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('Shift + middle drag orbits the view', async ({ page }) => {
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const probe = page.getByTestId('coords')

    // coordenada mundo bajo un punto fijo de pantalla (vista TOP inicial)
    await page.mouse.move(cx + 60, cy + 20)
    const before = await probe.textContent()

    // orbitar con Shift + botón central
    await page.keyboard.down('Shift')
    await page.mouse.move(cx, cy)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(cx + 120, cy + 70, { steps: 8 })
    await page.mouse.up({ button: 'middle' })
    await page.keyboard.up('Shift')

    // tras orbitar, la coordenada mundo bajo el mismo punto de pantalla cambia
    await page.mouse.move(cx + 60, cy + 20)
    const after = await probe.textContent()
    expect(after).not.toBe(before)
  })

  test('middle drag (no shift) pans without crashing', async ({ page }) => {
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(cx + 80, cy + 40, { steps: 6 })
    await page.mouse.up({ button: 'middle' })
    // la app sigue respondiendo
    const input = page.getByTestId('command-input')
    await input.fill('LINE')
    await input.press('Enter')
    await expect(page.locator('.cmd-prompt')).toContainText('first point')
  })
})

test.describe('ZOOM completo y vistas guardadas', () => {
  test('ZOOM Window/Center/Previous, vista guardada desde el menú Vista y zoom en tiempo real con su menú', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    const cmd = async (...steps: string[]) => {
      for (const s of steps) {
        await input.fill(s)
        await input.press('Enter')
        await page.waitForTimeout(60)
      }
    }
    const radius = () => page.evaluate(() => Math.round((window as any).__cotaStore.getState().activeViewport.getCamera().radius * 10) / 10)
    await cmd('RECTANGLE', '0,0', '@400,250', 'ZOOM', 'E')
    const r0 = await radius()
    await cmd('ZOOM', 'W', '#0,0', '#40,40', '-VIEW', 'S', 'Esquina')
    const r1 = await radius()
    await cmd('ZOOM', 'C', '#200,125', '30')
    expect(await radius()).toBeCloseTo(30, 5)
    await cmd('ZOOM', 'P')
    expect(await radius()).toBeCloseTo(r1, 5)
    await cmd('ZOOM', 'P')
    expect(await radius()).toBeCloseTo(r0, 5)
    await page.getByTestId('command-cat-View').click()
    await page.getByTestId('menu-view-Esquina').click()
    await expect.poll(radius).toBeCloseTo(r1, 5)
    // Tiempo real: clic derecho → menú; Exit sale.
    await cmd('ZOOM', '')
    const box = (await page.locator('canvas').first().boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
    await expect(page.getByTestId('realtime-menu')).toBeVisible()
    await page.getByTestId('realtime-extents').click()
    await expect.poll(radius).toBeCloseTo(r0, 5)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
    await page.getByTestId('realtime-exit').click()
    await expect(page.getByTestId('realtime-menu')).toHaveCount(0)
  })
})
