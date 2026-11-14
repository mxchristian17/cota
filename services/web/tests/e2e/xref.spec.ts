import { expect, test } from '@playwright/test'

type P = Array<[number, string | number]>
const dxf = (pairs: P) => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n'
const file = (blocks: P, ents: P) => dxf([[0, 'SECTION'], [2, 'BLOCKS'], ...blocks, [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'], ...ents, [0, 'ENDSEC'], [0, 'EOF']])

// Un plano con una referencia externa «Base» (guardada en otra computadora) insertada dos veces, y el archivo de esa referencia.
const HOST = file(
  [[0, 'BLOCK'], [8, '0'], [2, 'Base'], [70, 4], [10, 0], [20, 0], [30, 0], [1, 'C:\\proyectos\\planta\\base.dxf'], [0, 'ENDBLK']],
  [
    [0, 'INSERT'], [8, '0'], [2, 'Base'], [10, 0], [20, 0], [30, 0],
    [0, 'INSERT'], [8, '0'], [2, 'Base'], [10, 100], [20, 0], [30, 0],
  ],
)
const BASE = file([], [
  [0, 'LINE'], [8, 'Muros'], [10, 0], [20, 0], [30, 0], [11, 50], [21, 0], [31, 0],
  [0, 'CIRCLE'], [8, 'Muros'], [10, 25], [20, 25], [30, 0], [40, 10],
])

const st = <T,>(page: import('@playwright/test').Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

test.describe('Referencias externas al abrir un DWG/DXF', () => {
  test('antes de terminar de abrir, un diálogo deja elegir el archivo de cada referencia que falta', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    let chooser = page.waitForEvent('filechooser')
    await input.fill('OPEN')
    await page.keyboard.press('Enter')
    await (await chooser).setFiles({ name: 'planta.dxf', mimeType: 'application/dxf', buffer: Buffer.from(HOST) })

    const dialog = page.getByTestId('xref-dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('xref-row-Base')).toContainText('C:\\proyectos\\planta\\base.dxf')
    await expect(page.getByTestId('xref-row-Base')).toContainText('Not found')
    // Todavía no se abrió: el dibujo sigue vacío.
    expect(await st<number>(page, 'return s.doc.entities.length')).toBe(0)

    chooser = page.waitForEvent('filechooser')
    await page.getByTestId('xref-browse-Base').click()
    await (await chooser).setFiles({ name: 'base.dxf', mimeType: 'application/dxf', buffer: Buffer.from(BASE) })
    await expect(page.getByTestId('xref-row-Base')).toContainText('Loaded: base.dxf')
    await page.getByTestId('xref-open').click()
    await expect(dialog).toHaveCount(0)

    await expect(page.locator('.cmd-output')).toContainText('1 external reference(s) loaded')
    const info = await st<{ inserts: number; parts: number; layer: boolean; path: string }>(
      page,
      `const b = s.doc.getBlock('Base'); return { inserts: s.doc.entities.filter(e => e.type === 'INSERT').length, parts: b.entities.length, layer: s.doc.layers.some(l => l.name === 'Base|Muros'), path: b.xref.path }`,
    )
    expect(info).toEqual({ inserts: 2, parts: 2, layer: true, path: 'C:\\proyectos\\planta\\base.dxf' })
  })

  test('sin elegirlas, el plano se abre igual y las referencias quedan vacías', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    const chooser = page.waitForEvent('filechooser')
    await input.fill('OPEN')
    await page.keyboard.press('Enter')
    await (await chooser).setFiles({ name: 'planta.dxf', mimeType: 'application/dxf', buffer: Buffer.from(HOST) })
    await expect(page.getByTestId('xref-open')).toHaveText('Open without them', { timeout: 20_000 })
    await page.getByTestId('xref-open').click()
    await expect(page.locator('.cmd-output')).toContainText('0 external reference(s) loaded; 1 not found (shown empty)')
    expect(await st<number>(page, 'return s.doc.entities.filter(e => e.type === "INSERT").length')).toBe(2)
  })
})
