import { test, expect, type Page } from '@playwright/test'

/** Cubo desplegado en Monge: caras, aristas, esquinas, punto de la cámara e ISO-E / ISO-A. */

const center = async (page: Page, id: string) => {
  const b = (await page.getByTestId(id).first().boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test.describe('Cubo desplegado en Monge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('ISO-E por defecto: la planta debajo del alzado; caras, aristas y esquinas cambian la vista', async ({ page }) => {
    const label = page.getByTestId('viewcube-label')
    await expect(page.getByTestId('viewnet-std')).toHaveText('ISO-E')
    const front = await center(page, 'viewcube-FRONT')
    expect((await center(page, 'viewcube-TOP')).y).toBeGreaterThan(front.y)
    expect((await center(page, 'viewcube-LEFT')).x).toBeGreaterThan(front.x)
    // Cara: el punto de la cámara queda en su centro.
    await page.getByTestId('viewcube-FRONT').click()
    await expect(label).toHaveText('FRONT')
    const cam = await center(page, 'viewcube-camera')
    expect(Math.abs(cam.x - front.x)).toBeLessThan(2)
    expect(Math.abs(cam.y - front.y)).toBeLessThan(2)
    // Arista: vista a 45° entre las dos caras; el punto queda sobre la arista, entre FRONT y TOP.
    await page.getByTestId('viewcube-edge-TOP·FRONT').first().click()
    await expect(label).toHaveText('TOP·FRONT')
    const top = await center(page, 'viewcube-TOP')
    const onEdge = await center(page, 'viewcube-camera')
    expect(Math.abs(onEdge.y - (front.y + top.y) / 2)).toBeLessThan(2)
    // Esquina superior: isométrica estándar.
    await page.getByTestId('viewcube-iso-NWISO').first().click()
    await expect(label).toHaveText('NWISO')
  })

  test('el punto de la cámara se mueve al orbitar', async ({ page }) => {
    await page.getByTestId('viewcube-FRONT').click()
    const before = await center(page, 'viewcube-camera')
    const c = (await page.locator('.viewport canvas').first().boundingBox())!
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(c.x + c.width / 2 + 50, c.y + c.height / 2 + 40, { steps: 6 })
    await page.mouse.up({ button: 'right' })
    await expect.poll(async () => Math.hypot((await center(page, 'viewcube-camera')).x - before.x, (await center(page, 'viewcube-camera')).y - before.y)).toBeGreaterThan(3)
    await expect(page.getByTestId('viewcube-label')).toHaveText('—')
  })

  test('ISO-A pone la planta arriba y se recuerda al recargar', async ({ page }) => {
    await page.getByTestId('viewnet-std').click()
    await expect(page.getByTestId('viewnet-std')).toHaveText('ISO-A')
    expect((await center(page, 'viewcube-TOP')).y).toBeLessThan((await center(page, 'viewcube-FRONT')).y)
    await page.reload()
    await expect(page.getByTestId('command-input')).toBeVisible()
    await expect(page.getByTestId('viewnet-std')).toHaveText('ISO-A')
  })
})
