import { expect, test, type Page } from '@playwright/test'

const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function setup(page: Page) {
  await page.goto('/')
  const input = page.getByTestId('command-input')
  await expect(input).toBeVisible()
  const cmd = async (...s: string[]) => {
    for (const x of s) {
      await input.fill(x)
      await input.press('Enter')
      await page.waitForTimeout(30)
    }
  }
  const box = (await page.locator('canvas').first().boundingBox())!
  /** Clic en un punto de mundo de la vista activa. */
  const click = async (x: number, y: number, z = 0) => {
    const r = await st<number[]>(page, `return s.activeViewport.project({ x: ${x}, y: ${y}, z: ${z} })`)
    await page.mouse.move(box.x + r[0], box.y + r[1])
    await page.mouse.click(box.x + r[0], box.y + r[1])
    await page.waitForTimeout(40)
  }
  return { cmd, click }
}

test.describe('Cota THREAD', () => {
  test('a circle gets the ISO 3/4 thin arc, the nearest thread and a leader whose text can be overridden', async ({ page }) => {
    const { cmd, click } = await setup(page)
    await cmd('CIRCLE', '0,0', '10', 'ZOOM', 'E', 'ZOOM', '0.5x', 'THREAD')
    await click(10, 0)
    await click(3, 3) // adentro: eje
    await expect(page.locator('.cmd-output')).toContainText('Nearest standard threads for Ø20')
    await cmd('', '')
    await click(18, 14)
    const arc = await st<{ radius: number; thread: { designation: string } }>(page, "return s.doc.entities.find((e) => e.type === 'ARC').props")
    expect(arc.thread.designation).toBe('M20')
    expect(arc.radius).toBeCloseTo(10 - (20 - 16.933) / 2, 2)
    expect(await st<string>(page, "return s.doc.entities.find((e) => e.type === 'DIMENSION').props.textOverride")).toBe('M20')
    // Otra vez sobre la rosca: ya está acotada, no agrega nada.
    await cmd('THREAD')
    await click(-arc.radius, 0)
    await expect(page.locator('.cmd-output')).toContainText('Thread M20 is already dimensioned.')
    expect(await st<number>(page, "return s.doc.entities.filter((e) => e.type === 'DIMENSION').length")).toBe(1)
    // El texto por defecto se sobrescribe en Propiedades.
    await click(12.95, 10.07) // sobre la línea de referencia
    expect(await st<string[]>(page, 'return s.selection.map((id) => s.doc.getEntity(id).type)')).toEqual(['DIMENSION'])
    await cmd('PR')
    const ov = page.getByTestId('prop-textoverride')
    await ov.fill('M20-6g')
    await ov.press('Enter')
    expect(await st<string>(page, "return s.doc.entities.find((e) => e.type === 'DIMENSION').props.textOverride")).toBe('M20-6g')
  })

  test('a cylindrical face of a solid gets the thread texture (shaft by context) and the drawing view shows it', async ({ page }) => {
    const { cmd, click } = await setup(page)
    await cmd('CYLINDER', '0,0,0', '10', '40', '-VIEW', 'FRONT', 'ZOOM', 'E', 'THREAD')
    await click(0, -10, 20)
    await expect(page.locator('.cmd-output')).toContainText('Cylindrical face Ø20')
    await expect(page.locator('.cmd-output')).toContainText('(shaft)')
    await cmd('', 'No')
    const th = await st<Array<{ info: { designation: string; internal: boolean } }>>(page, "return s.doc.entities.find((e) => e.type === 'SOLID3D').props.threads")
    expect(th.map((t) => [t.info.designation, t.info.internal])).toEqual([['M20', false]])
    // Vistas de dibujo: de costado, las líneas finas del fondo; de frente al eje, el arco de 3/4 con su designativo.
    await cmd('UCS', 'W', 'VIEWBASE', '', '', '100,150', '100,60', '')
    await expect(page.locator('.cmd-output')).toContainText('Base view created with 1 projected view(s)')
    const views = await st<Array<{ out: number[]; thin: string[] }>>(page, "return s.doc.entities.filter((e) => e.type === 'INSERT' && e.props.view).map((e) => ({ out: e.props.view.basis.out, thin: s.doc.blocks.find((b) => b.name === e.props.name).entities.filter((x) => x.lineWeight === 0.18).map((x) => x.type + (x.props.thread ? ' ' + x.props.thread.designation : '')) }))")
    expect(views.map((v) => v.thin)).toEqual([['LINE', 'LINE'], ['ARC M20']])
    // THREAD sobre el arco de la vista: agrega la cota en la hoja (una sola vez).
    const pt = await st<number[]>(page, "const v = s.doc.entities.filter((e) => e.type === 'INSERT' && e.props.view)[1]; const a = s.doc.blocks.find((b) => b.name === v.props.name).entities.find((x) => x.props.thread); const k = v.props.scale[0]; return [v.props.position[0] + (a.props.center[0] - a.props.radius) * k, v.props.position[1] + a.props.center[1] * k]")
    await cmd('ZOOM', 'W', `${pt[0] - 40},${pt[1] - 40}`, `${pt[0] + 40},${pt[1] + 40}`, 'THREAD')
    await click(pt[0], pt[1])
    await cmd('Yes')
    await click(pt[0] - 10, pt[1] + 15)
    await cmd('THREAD')
    await click(pt[0], pt[1])
    await expect(page.locator('.cmd-output')).toContainText('Thread M20 is already dimensioned.')
    expect(await st<string[]>(page, "return s.doc.entities.filter((e) => e.type === 'DIMENSION').map((e) => e.props.textOverride)")).toEqual(['M20'])
  })
})
