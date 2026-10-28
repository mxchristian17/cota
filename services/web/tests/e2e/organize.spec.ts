import { expect, test, type Page } from '@playwright/test'

const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

test.describe('Cota QSELECT, groups and object isolation', () => {
  test('QSELECT picks circles smaller than a radius; ISOLATEOBJECTS hides the rest until UNISOLATEOBJECTS', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    const cmd = async (...s: string[]) => {
      for (const x of s) {
        await input.fill(x)
        await input.press('Enter')
      }
    }
    await cmd('CIRCLE', '0,0', '5', 'CIRCLE', '20,0', '8', 'CIRCLE', '40,0', '3', 'LINE', '0,-20', '@50,0', '', 'QSELECT')
    await expect(page.getByTestId('qselect-dialog')).toBeVisible()
    await page.getByTestId('qselect-type').selectOption('CIRCLE')
    await page.getByTestId('qselect-prop').selectOption('radius')
    await page.getByTestId('qselect-op').selectOption('<')
    await page.getByTestId('qselect-value').fill('6')
    await expect(page.getByTestId('qselect-count')).toHaveText('2 object(s)')
    await page.getByTestId('qselect-ok').click()
    await expect(page.getByTestId('qselect-dialog')).toHaveCount(0)
    expect(await st(page, "return s.selection.map((id) => s.doc.getEntity(id).props.radius).sort()")).toEqual([3, 5])
    await cmd('ISOLATEOBJECTS')
    await expect(page.getByText('2 object(s) isolated.')).toHaveCount(1)
    await cmd('SELECTALL')
    expect(await st<number>(page, 'return s.selection.length')).toBe(2) // lo oculto no se selecciona
    await page.keyboard.press('Escape')
    await cmd('UNISOLATEOBJECTS', 'SELECTALL')
    expect(await st<number>(page, 'return s.selection.length')).toBe(4)
  })
})
