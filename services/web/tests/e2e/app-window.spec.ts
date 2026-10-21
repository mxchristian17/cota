import { test, expect } from '@playwright/test'

/** App instalable y pantalla completa. */
test.describe('Cota como aplicación', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('el manifiesto la hace instalable: ventana propia e íconos', async ({ page }) => {
    const href = await page.locator('link[rel=manifest]').getAttribute('href')
    expect(href).toBe('manifest.webmanifest')
    const m = await page.evaluate(async (h) => (await fetch(h!)).json(), href)
    expect(m).toMatchObject({ name: 'Cota', display: 'standalone', start_url: './', scope: './' })
    const icons = m.icons as Array<{ src: string; sizes: string; purpose?: string }>
    expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const i of icons) expect(await page.evaluate(async (src) => (await fetch(src)).status, i.src)).toBe(200)
  })

  test('Install app aparece cuando el navegador ofrece instalarla y abre su diálogo', async ({ page }) => {
    await expect(page.getByTestId('install-app')).toHaveCount(0)
    await page.evaluate(() => {
      const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
      ev.prompt = async () => void ((window as unknown as { __prompted: boolean }).__prompted = true)
      ev.userChoice = Promise.resolve({ outcome: 'accepted' })
      window.dispatchEvent(ev)
    })
    await page.getByTestId('install-app').click()
    expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true)
    await expect(page.getByTestId('install-app')).toHaveCount(0)
  })

  test('FULLSCREEN: botón y comando; se recuerda y vuelve con el primer clic', async ({ page }) => {
    const fs = () => page.evaluate(() => !!document.fullscreenElement)
    await page.getByTestId('fullscreen-toggle').click()
    await expect.poll(fs).toBe(true)
    await expect(page.getByTestId('fullscreen-toggle')).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(page.getByTestId('command-input')).toBeVisible()
    expect(await fs()).toBe(false) // el navegador no deja entrar sin un gesto…
    await page.locator('canvas').first().click({ position: { x: 300, y: 200 } })
    await expect.poll(fs).toBe(true) // …y entra con el primer clic
    const input = page.getByTestId('command-input')
    await input.fill('FULLSCREEN')
    await input.press('Enter')
    await expect.poll(fs).toBe(false)
    await expect(page.getByTestId('fullscreen-toggle')).toHaveAttribute('aria-pressed', 'false')
  })
})
