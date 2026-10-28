import { expect, test } from '@playwright/test'

test.describe('Cota POINT and DIVIDE', () => {
  test('DIVIDE places visible, selectable points that give NODE snaps', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    const cmd = async (...s: string[]) => { for (const x of s) { await input.fill(x); await input.press('Enter') } }
    await cmd('LINE', '#0,0', '#100,0', '', 'ZOOM', 'C', '#50,0', '60', 'PDMODE', '3', 'DIVIDE')
    const box = (await page.locator('canvas').first().boundingBox())!
    const st = (js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js)
    const scr = async (x: number, y: number) => {
      const p = (await st(`return s.activeViewport.project({ x: ${x}, y: ${y}, z: 0 })`)) as number[]
      return [box.x + p[0], box.y + p[1]]
    }
    const [lx, ly] = await scr(10, 0)
    await page.mouse.click(lx, ly)
    await cmd('5')
    expect(await st("return s.doc.entities.filter((e) => e.type === 'POINT').length")).toBe(4)
    // Un clic sobre un punto lo selecciona.
    const [px, py] = await scr(40, 0)
    await st('s.clearSelection()')
    await page.mouse.click(px, py)
    expect(await st("return s.selection.map((id) => s.doc.getEntity(id).type)")).toContain('POINT')
    await page.keyboard.press('Escape')
    // NODE (anulación tecleada; como en el CAD clásico no está entre los snaps permanentes por defecto).
    await cmd('LINE', 'NOD')
    await page.mouse.move(px + 4, py + 9)
    await page.mouse.click(px + 4, py + 9)
    await cmd('#60,40', '')
    const l = (await st("const ls = s.doc.entities.filter((e) => e.type === 'LINE'); return ls[ls.length - 1].props.start")) as number[]
    expect(l[0]).toBeCloseTo(40, 6)
    expect(l[1]).toBeCloseTo(0, 6)
  })
})
