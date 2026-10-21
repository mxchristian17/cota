import { test, expect } from '@playwright/test'

// La capa actual viaja con el dibujo (CLAYER): carpeta local (OPFS del navegador), SAVE,
// otra capa y OPEN del .cota.
test('CLAYER: SAVE y OPEN con carpeta local conservan la capa actual', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('carpeta', { create: true })
  })
  await page.goto('/')
  const input = page.getByTestId('command-input')
  await expect(input).toBeVisible()
  const cmd = async (...ts: string[]) => {
    for (const t of ts) {
      await input.fill(t)
      await input.press('Enter')
      await page.waitForTimeout(120)
    }
  }
  const current = () =>
    page.evaluate(() => {
      const s = (window as unknown as { __cotaStore: { getState: () => { layerSvc: { get: (id: string) => { name: string } | undefined }; currentLayerId: string } } }).__cotaStore.getState()
      return s.layerSvc.get(s.currentLayerId)?.name
    })
  await cmd('OPENFOLDER')
  await expect(page.locator('.cmd-output')).toContainText('Working folder')
  await cmd('-LAYER', 'M', 'EJES', '')
  await cmd('LINE', '0,0', '#10,0', '')
  await cmd('SAVE', 'prueba')
  await expect(page.locator('.cmd-output')).toContainText('Saved "prueba.cota"')
  await cmd('-LAYER', 'S', '0', '')
  expect(await current()).toBe('0')
  await cmd('OPEN')
  await page.getByTestId('local-prueba').click()
  await expect(page.locator('.cmd-output')).toContainText('Opened "prueba.cota"')
  expect(await current()).toBe('EJES')
})
