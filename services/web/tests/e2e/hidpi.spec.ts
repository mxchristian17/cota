import { test, expect } from '@playwright/test'

/** Pantallas de alta densidad (retina, escala 200 %): el dibujo ocupa su panel, no el doble. */
test.use({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 })

test('con devicePixelRatio 2 el canvas mide lo mismo que su panel y el buffer el doble', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
  const m = await page.evaluate(() => {
    const c = document.querySelector('.viewport canvas') as HTMLCanvasElement
    const host = c.parentElement as HTMLElement
    return { cw: c.clientWidth, ch: c.clientHeight, hw: host.clientWidth, hh: host.clientHeight, bw: c.width }
  })
  expect(m.cw).toBe(m.hw)
  expect(m.ch).toBe(m.hh)
  expect(m.bw).toBe(m.hw * 2)
})
