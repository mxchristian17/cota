import { test, expect, type Page } from '@playwright/test'

// Mockea el backend (interceptando fetch) para validar el flujo de auth/persistencia
// del frontend sin depender de un servidor real.
async function mockApi(page: Page) {
  await page.route('**/auth/login', (route) =>
    route.fulfill({ json: { user: { id: 1, email: 'a@x.com' } } }),
  )
  await page.route('**/auth/register', (route) =>
    route.fulfill({ status: 201, json: { id: 1, email: 'a@x.com' } }),
  )
  await page.route('**/auth/me', (route) => route.fulfill({ status: 401, json: { detail: 'Authentication required' } }))
  await page.route('**/config', (route) => route.fulfill({ json: { data: {} } }))
  await page.route('**/documents/**', (route) =>
    route.fulfill({
      json: {
        id: 'doc1',
        name: 'drawing1',
        data: { schemaVersion: 1, layers: [], ucs: [], entities: [], meta: {} },
        created_at: '2026-07-25T00:00:00Z',
        updated_at: '2026-07-25T00:00:00Z',
      },
    }),
  )
  await page.route('**/documents', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, json: { id: 'doc1', name: 'drawing1', data: {}, created_at: 'x', updated_at: 'x' } })
    }
    return route.fulfill({ json: [{ id: 'doc1', name: 'drawing1', updated_at: '2026-07-25T00:00:00Z' }] })
  })
}

test.describe('Cota auth + persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
    await mockApi(page)
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('login flow updates the top bar', async ({ page }) => {
    await page.getByTestId('login-button').click()
    await expect(page.getByTestId('login-dialog')).toBeVisible()
    await page.getByTestId('login-email').fill('a@x.com')
    await page.getByTestId('login-password').fill('secret123')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('user-email')).toHaveText('a@x.com')
    await expect(page.getByTestId('logout-button')).toBeVisible()
  })

  test('SAVE via command line after login', async ({ page }) => {
    await page.getByTestId('login-button').click()
    await page.getByTestId('login-email').fill('a@x.com')
    await page.getByTestId('login-password').fill('secret123')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('user-email')).toBeVisible()

    const input = page.getByTestId('command-input')
    await input.fill('SAVE')
    await input.press('Enter')
    // SAVE pregunta el nombre del dibujo (default = el actual): Enter lo confirma.
    await expect(page.locator('.cmd-prompt')).toContainText('Save drawing as')
    await input.press('Enter')
    await expect(page.locator('.cmd-output')).toContainText('Saved')
  })

  test('OPEN dialog lists documents after login', async ({ page }) => {
    await page.getByTestId('login-button').click()
    await page.getByTestId('login-email').fill('a@x.com')
    await page.getByTestId('login-password').fill('secret123')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('user-email')).toBeVisible()

    const input = page.getByTestId('command-input')
    await input.fill('OPEN')
    await input.press('Enter')
    await expect(page.getByTestId('open-dialog')).toBeVisible()
    await expect(page.getByTestId('open-dialog')).toContainText('drawing1')
  })

  test('SAVE without an account or folder downloads the .cota file', async ({ page }) => {
    const input = page.getByTestId('command-input')
    await input.fill('SAVE')
    await input.press('Enter')
    const download = page.waitForEvent('download')
    await input.fill('mi-plano')
    await input.press('Enter')
    expect((await download).suggestedFilename()).toBe('mi-plano.cota')
  })
})
