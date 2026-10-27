import { expect, test } from '@playwright/test'

test.describe('Cota OPEN without a usable working folder', () => {
  test('a remembered folder that needs permission again: OPEN asks for it and explains, never "Request failed"', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    // Pestaña nueva con una carpeta recordada: el navegador la deja en "preguntar" hasta un gesto del usuario.
    await page.evaluate(() => (window as unknown as { __cotaStore: { setState: (s: object) => void } }).__cotaStore.setState({ fsPending: true, fsFolderName: 'Planos' }))
    await input.fill('OPEN')
    await input.press('Enter')
    await expect(page.getByTestId('open-no-folder')).toContainText('permission again to use the folder "Planos"')
    await expect(page.getByTestId('open-reconnect')).toContainText('Planos')
    await expect(page.getByTestId('open-from-device')).toBeVisible()
    await expect(page.getByText('Request failed')).toHaveCount(0)
  })
})
