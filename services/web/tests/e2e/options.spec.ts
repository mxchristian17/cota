import { expect, test } from '@playwright/test'

test.describe('Cota OPTIONS', () => {
  test('tabs group the settings, changes apply at once and the last tab is remembered', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    await input.fill('OPTIONS')
    await input.press('Enter')
    for (const t of ['display', 'files', 'drafting', 'editing', 'user']) await expect(page.getByTestId(`options-tab-${t}`)).toBeVisible()
    await expect(page.getByTestId('theme-dark')).toBeVisible() // Display por defecto
    await page.getByTestId('sysvar-ZOOMFACTOR').fill('35')
    await page.getByTestId('options-tab-editing').click()
    await page.getByTestId('sysvar-PROJMODE').selectOption('View')
    await page.getByTestId('sysvar-EDGEMODE').check()
    await page.screenshot({ path: '/tmp/claude-1000/-home-christian-Desktop-Christian-repositorios-ccad/c39e7fe9-05f2-44f5-899d-488f3aef36c1/scratchpad/options.png' })
    await page.getByTestId('options-dialog').click({ position: { x: 5, y: 5 } }) // clic afuera: cierra
    await expect(page.getByTestId('options-dialog')).toHaveCount(0)
    await input.fill('ZOOMFACTOR')
    await input.press('Enter')
    await expect(page.locator('.cmd-prompt')).toContainText('35') // el valor actual en el prompt de la variable
    await input.press('Escape')
    await input.fill('OPTIONS')
    await input.press('Enter')
    await expect(page.getByTestId('sysvar-PROJMODE')).toHaveValue('View') // vuelve a la última pestaña
    await expect(page.getByTestId('sysvar-EDGEMODE')).toBeChecked()
  })
})
