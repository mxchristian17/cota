import { expect, test, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
  }
}

const store = (page: Page, js: string) =>
  page.evaluate((code) => {
    const key = Object.keys(window).find((k) => /^__\w+Store$/.test(k))!
    const st = (window as unknown as Record<string, { getState: () => Record<string, unknown> }>)[key]
    return new Function('s', code)(st.getState())
  }, js)

test.describe('Cota drawing views and error handling', () => {
  test('VIEWPROJ with preselected solids does not hang; VIEWBASE + VIEWPROJ work', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'CYLINDER', '#0,0,0', '10', '20')
    await typeCmd(page, 'BOX', '#30,-10,0', '#50,10,0', '20')
    // Cilindro y prisma preseleccionados en el modelo: antes VIEWPROJ quedaba en un bucle y colgaba la app.
    await store(page, 's.selectAll()')
    await typeCmd(page, 'VIEWPROJ')
    await expect(page.locator('.cmd-output')).toContainText('VIEWPROJ works on drawing views in a layout.')
    await typeCmd(page, 'VIEWBASE', '', '', '#100,150', '#250,150', '')
    await expect(page.locator('.cmd-output')).toContainText('Base view created with 1 projected view(s)')
    // En el layout, con las vistas preseleccionadas, sigue respondiendo.
    await store(page, 's.selectAll()')
    await typeCmd(page, 'VIEWPROJ', '#100,60', '')
    await expect(page.locator('.cmd-output')).toContainText('1 projected view(s) created.')
  })

  test('VIEWBASE documents a cube with every edge rounded', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'BOX', '#0,0', '#40,40', '40')
    const mids = ['#20,0,0', '#40,20,0', '#20,40,0', '#0,20,0', '#20,0,40', '#40,20,40', '#20,40,40', '#0,20,40', '#0,0,20', '#40,0,20', '#40,40,20', '#0,40,20']
    await typeCmd(page, 'FILLETEDGE', 'R', '6', ...mids, '')
    await expect(page.locator('.cmd-output')).toContainText('12 edge(s) selected for fillet.', { timeout: 30_000 })
    await typeCmd(page, '')
    await typeCmd(page, 'VIEWBASE', '', '', '#100,150', '')
    await expect(page.locator('.cmd-output')).toContainText('Base view created', { timeout: 30_000 })
  })

  test('an unexpected error shows a closable banner and the app keeps working', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await page.evaluate(() => setTimeout(() => { throw new Error('boom') }))
    await expect(page.getByTestId('error-banner')).toContainText('boom')
    await page.getByTestId('error-banner-close').click()
    await expect(page.getByTestId('error-banner')).toHaveCount(0)
    await typeCmd(page, 'LINE', '#0,0', '#10,0', '')
    await expect(page.locator('.cmd-output')).toContainText('Command: LINE')
  })
})
