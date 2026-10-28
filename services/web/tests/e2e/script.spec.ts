import { expect, test, type Page } from '@playwright/test'

const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>
const count = (page: Page, t: string) => st<number>(page, `return s.doc.entities.filter((e) => e.type === '${t}').length`)
const B64 = (t: string) => Buffer.from(t, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

test.describe('Cota scripts (several commands as one operation)', () => {
  test('SCRIPT runs a batch as one undo step; pasting several inputs in the command line does the same', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    await input.fill('SCRIPT')
    await input.press('Enter')
    await expect(page.getByTestId('script-dialog')).toBeVisible()
    await page.getByTestId('script-text').fill('CIRCLE 50,50 20\nRECTANGLE 0,0 @100,60\nTEXT 10,70 5 0 "Two words" ""')
    await page.getByTestId('script-run').click()
    await expect(page.getByTestId('script-dialog')).toHaveCount(0)
    await expect.poll(() => count(page, 'TEXT')).toBe(1)
    expect([await count(page, 'CIRCLE'), await count(page, 'RECTANGLE') + (await count(page, 'POLYLINE'))]).toEqual([1, 1])
    expect(await st<string>(page, "return s.doc.entities.find((e) => e.type === 'TEXT').props.text")).toBe('Two words')
    // Un solo paso de deshacer para todo el lote.
    await input.fill('U')
    await input.press('Enter')
    await expect.poll(() => st<number>(page, 'return s.doc.entities.length')).toBe(0)
    // Pegado en la línea de comandos: corre como lote.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(() => navigator.clipboard.writeText('CIRCLE 0,0 5 CIRCLE 20,0 5'))
    await input.focus()
    await page.keyboard.press('Control+V')
    await expect.poll(() => count(page, 'CIRCLE')).toBe(2)
  })

  test('a shared link shows the script and only runs it when confirmed; an invalid input stops the batch', async ({ page }) => {
    await page.goto('/#script=' + B64('CIRCLE 0,0 10\nCIRCLE abc 3\nLINE 0,0 @10,0 ""'))
    await expect(page.getByTestId('script-shared')).toBeVisible()
    expect(await count(page, 'CIRCLE')).toBe(0) // nada corre solo
    await page.getByTestId('script-run').click()
    await expect(page.locator('.cmd-output')).toContainText('Script stopped at input 5 (abc).')
    expect([await count(page, 'CIRCLE'), await count(page, 'LINE')]).toEqual([1, 0])
    expect(await page.evaluate(() => window.location.hash)).toBe('')
  })

  test('DIVIDE uses the lines already selected instead of asking again', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    for (const x of ['LINE', '0,0', '@100,0', '', 'LINE', '0,20', '@100,0', '']) {
      await input.fill(x)
      await input.press('Enter')
    }
    await st(page, 's.selectAll()')
    for (const x of ['DIVIDE', '4']) {
      await input.fill(x)
      await input.press('Enter')
    }
    await expect.poll(() => count(page, 'POINT')).toBe(6)
    await expect(page.locator('.cmd-output')).not.toContainText('Select object to divide')
  })
})
