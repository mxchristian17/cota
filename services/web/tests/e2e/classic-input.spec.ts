import { expect, test, type Page } from '@playwright/test'

/** Estado del store de la app (para leer el dibujo sin depender de píxeles). */
const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function open(page: Page) {
  await page.goto('/')
  const input = page.getByTestId('command-input')
  await expect(input).toBeVisible()
  const cmd = async (...s: string[]) => {
    for (const x of s) {
      await input.fill(x)
      await input.press('Enter')
    }
  }
  return { input, cmd }
}

test.describe('Cota: command line like classic CAD', () => {
  test('typed x,y is absolute (@ relative); F12 dynamic input makes it relative', async ({ page }) => {
    const { cmd } = await open(page)
    await cmd('LINE', '10,-10', '20,-10', '')
    expect(await st(page, "return s.doc.entities.at(-1).props.end")).toEqual([20, -10, 0])
    await cmd('LINE', '0,0', '@5,5', '')
    expect(await st(page, "return s.doc.entities.at(-1).props.end")).toEqual([5, 5, 0])
    await page.keyboard.press('F12')
    await expect(page.getByTestId('dyn-toggle')).toHaveAttribute('aria-pressed', 'true')
    await cmd('LINE', '10,0', '5,0', '')
    expect(await st(page, "return s.doc.entities.at(-1).props.end")).toEqual([15, 0, 0])
    await cmd('LINE', '0,0', '#3,4', '')
    expect(await st(page, "return s.doc.entities.at(-1).props.end")).toEqual([3, 4, 0])
    await page.getByTestId('dyn-toggle').click()
    await expect(page.getByTestId('dyn-toggle')).toHaveAttribute('aria-pressed', 'false')
  })

  test('Esc cancels the whole command: EXPORT does not export, -LAYER does not go back to its options', async ({ page }) => {
    const { input, cmd } = await open(page)
    let downloads = 0
    page.on('download', () => downloads++)
    await cmd('EXPORT')
    await input.press('Escape')
    await expect(page.getByText('*Cancel*')).toHaveCount(1)
    expect(await st(page, 'return s.engine.busy')).toBe(false)
    await cmd('-LAYER', 'M')
    await input.press('Escape')
    expect(await st(page, 'return s.engine.busy')).toBe(false)
    await page.waitForTimeout(300)
    expect(downloads).toBe(0)
  })

  test('a menu closes with Esc or when typing, and the keys go to the command line', async ({ page }) => {
    await open(page)
    await page.getByTestId('command-cat-Draw').click()
    await expect(page.getByTestId('command-dropdown-Draw')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('command-dropdown-Draw')).toHaveCount(0)
    await page.getByTestId('command-cat-Draw').click()
    await page.keyboard.type('line')
    await expect(page.getByTestId('command-dropdown-Draw')).toHaveCount(0)
    await expect(page.getByTestId('command-input')).toHaveValue('line')
    // Cerrar el panel de HATCH con Esc deja el foco en la línea de comandos.
    await page.getByTestId('command-input').fill('')
    await page.keyboard.type('HATCH')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('hatch-panel')).toBeVisible()
    await page.getByTestId('hatch-panel').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('hatch-panel')).toHaveCount(0)
    await expect(page.getByTestId('command-input')).toBeFocused()
  })

  test('TEXT sits on its baseline and shows %%c %%d %%p as Ø ° ±', async ({ page }) => {
    const { cmd } = await open(page)
    await cmd('TEXT', '0,0', '5', '0', '%%c20 %%p0.1 90%%d', '')
    const t = await st<{ text: string; kind: string; position: number[] }>(page, "return s.doc.entities.at(-1).props")
    expect(t).toMatchObject({ text: 'Ø20 ±0.1 90°', kind: 'text', position: [0, 0, 0] })
  })

  test('NEW asks to save unsaved changes and starts in plan view with the world UCS', async ({ page }) => {
    const { input, cmd } = await open(page)
    await cmd('NEW')
    await expect(page.getByText('Save changes to')).toHaveCount(0) // sin cambios no pregunta
    await cmd('LINE', '0,0', '@10,0', '', 'UCS', 'X', '90', 'NEW')
    await expect(page.getByText('Save changes to drawing1? [Yes/No] <Yes>:').first()).toBeVisible()
    await input.press('Escape')
    expect(await st(page, 'return s.doc.entities.length')).toBe(1) // Esc cancela NEW
    await cmd('NEW', 'N')
    expect(await st(page, 'return s.doc.entities.length')).toBe(0)
    expect(await st(page, 'return s.ucsName')).toBe('World')
    expect(await st(page, 'return s.activeViewport.isPlanView()')).toBe(true)
  })

  test('PLOT opens a dialog with a preview; Window and scale; Plot downloads the PDF', async ({ page }) => {
    const { cmd } = await open(page)
    await cmd('RECTANGLE', '0,0', '@200,100', 'CIRCLE', '100,50', '30', 'ZOOM', 'E', 'PLOT')
    await expect(page.getByTestId('plot-dialog')).toBeVisible()
    // La vista previa dibuja la hoja (no queda en blanco).
    const inked = await page.getByTestId('plot-preview').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i + 3] > 0) n++
      return n
    })
    expect(inked).toBeGreaterThan(50)
    await page.getByTestId('plot-portrait').check()
    await page.getByTestId('plot-fit').uncheck()
    await page.getByTestId('plot-scale').selectOption({ label: '1:2' })
    await expect(page.getByTestId('plot-caption')).toHaveText('Scale 1:2')
    await page.getByTestId('plot-area').selectOption('window')
    await expect(page.getByTestId('plot-dialog')).toHaveCount(0)
    await cmd('60,10', '140,90')
    await expect(page.getByTestId('plot-dialog')).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('plot-ok').click()])
    expect(download.suggestedFilename()).toBe('drawing1.pdf')
    const { readFileSync } = await import('node:fs')
    const pdf = readFileSync(await download.path(), 'latin1')
    expect(pdf).toContain('/MediaBox [0 0 595.28 841.89]') // A4 vertical
    expect(pdf).toMatch(/h\nW n\n/) // recortado a la ventana
    expect(await st(page, 'return s.engine.busy')).toBe(false)
  })

  test('grips: Space cycles STRETCH → MOVE → ROTATE; typed values apply to the selection', async ({ page }) => {
    const { cmd } = await open(page)
    await cmd('LINE', '0,0', '@40,0', '', 'ZOOM', 'C', '20,0', '80')
    const box = (await page.locator('canvas').first().boundingBox())!
    const scr = async (x: number, y: number) => {
      const p = await st<number[]>(page, `return s.activeViewport.project({ x: ${x}, y: ${y}, z: 0 })`)
      return [box.x + p[0], box.y + p[1]] as const
    }
    const [mx, my] = await scr(20, 0)
    await page.mouse.click(mx, my) // selecciona la línea: aparecen sus grips
    const [gx, gy] = await scr(40, 0)
    await page.mouse.click(gx, gy) // grip del extremo: STRETCH
    await expect(page.getByText('** STRETCH **')).toHaveCount(1)
    await page.keyboard.press('Space')
    await expect(page.getByText('** MOVE **')).toHaveCount(1)
    await cmd('@0,10')
    expect(await st(page, "const l = s.doc.entities[0].props; return [l.start, l.end]")).toEqual([[0, 10, 0], [40, 10, 0]])
    const [g2x, g2y] = await scr(0, 10)
    await page.mouse.click(g2x, g2y)
    await page.keyboard.press('Space')
    await page.keyboard.press('Space')
    await expect(page.getByText('** ROTATE **')).toHaveCount(1)
    await cmd('90')
    const [a, b] = await st<number[][]>(page, "const l = s.doc.entities[0].props; return [l.start, l.end]")
    expect(a[0]).toBeCloseTo(0, 6)
    expect(a[1]).toBeCloseTo(10, 6)
    expect(b[0]).toBeCloseTo(0, 6)
    expect(b[1]).toBeCloseTo(50, 6)
  })
})
