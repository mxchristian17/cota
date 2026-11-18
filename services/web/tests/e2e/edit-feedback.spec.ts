import { expect, test, type Page } from '@playwright/test'

/**
 * Lo que se ve y se tipea al editar: MATCHPROP pinta con el color de la capa nueva (R23) y la barra espaciadora
 * confirma las opciones de -LAYER (B13).
 */

const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function cmd(page: Page, ...steps: string[]) {
  const i = page.getByTestId('command-input')
  for (const s of steps) {
    await i.fill(s)
    await i.press('Enter')
  }
}

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
}

/** Color [r, g, b] del píxel de pantalla que muestra el punto del modelo `p`. */
async function pixelAt(page: Page, p: [number, number, number]): Promise<number[]> {
  const at = await page.evaluate((q) => {
    const s = (window as any).__cotaStore.getState()
    const vp = s.activeViewport ?? s.viewports[0]
    const px = vp.project({ x: q[0], y: q[1], z: q[2] })
    const r = (vp.container ?? vp.canvas).getBoundingClientRect()
    return [Math.round(r.x + px[0]), Math.round(r.y + px[1])]
  }, p)
  const png = await page.screenshot({ clip: { x: at[0], y: at[1] - 1, width: 1, height: 3 } })
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const g = c.getContext('2d')!
    g.drawImage(bmp, 0, 0)
    // La más saturada de las tres filas (la línea puede caer en la de arriba o la de abajo).
    const rows = [0, 1, 2].map((y) => [...g.getImageData(0, y, 1, 1).data.slice(0, 3)])
    return rows.sort((a, b) => b[0] - b[1] - (a[0] - a[1]))[0]
  }, png.toString('base64'))
}

test('MATCHPROP: la línea pasa a la capa ROJO y se dibuja roja (R23)', async ({ page }) => {
  await ready(page)
  await cmd(page, '-LAYER', 'N', 'ROJO', 'C', '1', 'ROJO', '', '-LAYER', 'S', 'ROJO', '')
  await cmd(page, 'CIRCLE', '#700,20', '10')
  await cmd(page, '-LAYER', 'S', '0', '')
  await cmd(page, 'LINE', '#680,60', '#740,60', '')
  await cmd(page, 'ZOOM', 'W', '#670,0', '#750,70')
  await expect.poll(() => st(page, 'return s.doc.entities.length')).toBe(2)
  const white = await pixelAt(page, [710, 60, 0])
  expect(white[1]).toBeGreaterThan(120) // blanca o gris: tiene verde
  await cmd(page, 'MATCHPROP', '#710,20', '#700,60', '')
  await expect(page.locator('.cmd-output')).toContainText('1 object(s) changed.')
  await expect.poll(async () => {
    const [r, g] = await pixelAt(page, [710, 60, 0])
    return r > 150 && g < 80
  }).toBe(true)
})

test('-LAYER: la barra espaciadora confirma la opción (B13)', async ({ page }) => {
  await ready(page)
  const input = page.getByTestId('command-input')
  await input.fill('-LAYER')
  await input.press('Enter')
  await input.pressSequentially('M ')
  await expect(page.locator('.cmd-prompt')).toContainText('Enter name for new layer')
  await input.pressSequentially('PIEZA')
  await input.press('Enter')
  await input.press('Enter')
  await expect.poll(() => st(page, 'return s.layerSvc.get(s.currentLayerId)?.name')).toBe('PIEZA')
})
