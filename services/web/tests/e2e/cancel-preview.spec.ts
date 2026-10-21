import { test, expect } from '@playwright/test'
test('Esc a mitad de LINE no deja el trazo provisorio', async ({ page }) => {
  await page.goto('/')
  const input = page.getByTestId('command-input')
  await expect(input).toBeVisible()
  await input.fill('LINE'); await input.press('Enter')
  const box = (await page.locator('canvas').first().boundingBox())!
  await page.mouse.click(box.x + 200, box.y + 200)
  await page.mouse.move(box.x + 350, box.y + 260, { steps: 5 })
  await page.waitForTimeout(150)
  const before = await page.evaluate(() => (window as any).__cotaStore.getState().viewports[0].previewGroup.children.length)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => (window as any).__cotaStore.getState().viewports[0].previewGroup.children.length)
  console.log('preview antes/después del Esc:', before, after)
  expect(after).toBe(0)
})
