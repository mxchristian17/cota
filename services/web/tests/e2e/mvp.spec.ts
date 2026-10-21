import { test, expect } from '@playwright/test'

test.describe('Cota MVP', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('draws a LINE via the command line', async ({ page }) => {
    const input = page.getByTestId('command-input')
    await input.fill('LINE')
    await input.press('Enter')
    await input.fill('0,0')
    await input.press('Enter')
    await input.fill('50,0')
    await input.press('Enter')
    await input.fill('50,50')
    await input.press('Enter')
    await input.press('Enter') // finish
    // el canvas WebGL debe existir y el comando haber terminado (prompt vuelve a Command:)
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
  })

  test('draws a CIRCLE via the command line', async ({ page }) => {
    const input = page.getByTestId('command-input')
    await input.fill('CIRCLE')
    await input.press('Enter')
    await input.fill('0,0')
    await input.press('Enter')
    await input.fill('25')
    await input.press('Enter')
    await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
  })

  test('opens HELP dialog and lists commands', async ({ page }) => {
    await page.getByTestId('help-button').click()
    const dialog = page.getByTestId('help-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('LINE')
    await expect(dialog).toContainText('CIRCLE')
    await expect(dialog).toContainText('HELP')
  })

  test('creates a new layer and sets it current', async ({ page }) => {
    // las capas se administran en el modal del comando LAYER.
    await page.getByTestId('command-input').fill('LAYER')
    await page.getByTestId('command-input').press('Enter')
    await expect(page.getByTestId('layer-dialog')).toBeVisible()
    await page.getByTestId('new-layer-input').fill('Walls')
    await page.getByTestId('add-layer').click()
    const layer = page.getByTestId('layer-Walls')
    await expect(layer).toBeVisible()
    await layer.click()
    await expect(layer).toContainText('●')
  })

  test('creates and deletes a layer', async ({ page }) => {
    await page.getByTestId('command-input').fill('LAYER')
    await page.getByTestId('command-input').press('Enter')
    await expect(page.getByTestId('layer-dialog')).toBeVisible()
    await page.getByTestId('new-layer-input').fill('Temp')
    await page.getByTestId('add-layer').click()
    await expect(page.getByTestId('layer-Temp')).toBeVisible()
    await page.getByTestId('delete-layer-Temp').click()
    await expect(page.getByTestId('layer-Temp')).toHaveCount(0)
  })

  test('shows live cursor coordinates in the status bar', async ({ page }) => {
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId('coords')).toContainText('X')
  })

  test('toggles ORTHO from the status bar and with F8', async ({ page }) => {
    const toggle = page.getByTestId('ortho-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('F8')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('keeps focus on the command line after clicking the viewport', async ({ page }) => {
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId('command-input')).toBeFocused()
  })
})
