import { devices, expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * Interfaz y salida (tanda C de los ensayos del radiador y de la impresora 3D): exportar desde una hoja, el peso de las
 * vistas sombreadas, el PDF, los diálogos y los paneles en escritorio (1600×900) y en el celular.
 */
test.use({ viewport: { width: 1600, height: 900 } })

const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function cmd(page: Page, ...steps: string[]) {
  const i = page.getByTestId('command-input')
  for (const s of steps) {
    await i.fill(s)
    await i.press('Enter')
    await page.waitForTimeout(40)
  }
}

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
}

/** Una pieza con un agujero y su hoja: frente y una isométrica sombreada (proyectada en diagonal). */
async function partWithSheet(page: Page) {
  await st(page, "return s.runScript('BOX 0,0,0 80,50 20\\nCYLINDER 40,25,0 12 20\\nSUBTRACT ALL \"\"', { finish: 'cancel', fresh: true })")
  await cmd(page, 'VIEWBASE', '', '', '#100,150', '#250,60', '')
  await expect(page.locator('.cmd-output')).toContainText('Base view created with 1 projected view(s)', { timeout: 30_000 })
}

async function download(page: Page, ...steps: string[]) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), cmd(page, ...steps)])
  return { name: d.suggestedFilename(), text: readFileSync((await d.path())!, 'utf8') }
}

test.describe('Export from a sheet', () => {
  test('EXPORT OBJ from a sheet writes the 3D model (B23); DXF/DWG carry the sheet name and the shading is light (R35)', async ({ page }) => {
    await ready(page)
    await partWithSheet(page)
    expect(await st(page, 'return s.doc.activeLayout?.name')).toBe('Layout1')
    // OBJ: el modelo 3D aunque la pestaña activa sea la hoja (antes: «Nothing to export» y ninguna descarga).
    const obj = await download(page, 'EXPORT', 'OBJ')
    expect(obj.name).toBe('drawing1.obj')
    expect(obj.text.match(/^v /gm)!.length).toBeGreaterThan(8)
    expect(obj.text).toMatch(/^f /m)
    // DXF de la hoja: lleva el nombre de la hoja (exportar la siguiente no lo pisa).
    const dxf = await download(page, 'EXPORT', 'DXF')
    expect(dxf.name).toBe('drawing1-Layout1.dxf')
    // El sombreado de la isométrica: una zona por cara (no un SOLID por triángulo), en el plano y con 7 cifras.
    const shade = await st<{ tris: number }>(page, "const b = s.doc.blocks.find((b) => b.entities.some((e) => e.type === 'SHADE')); const e = b.entities.find((e) => e.type === 'SHADE'); return { tris: (e.props.index ? e.props.index.length / 3 : e.props.tris.length / 9) }")
    const fills = (dxf.text.match(/\n0\n(SOLID|HATCH)\n/g) ?? []).length
    expect(fills).toBeGreaterThan(0)
    expect(fills).toBeLessThan(shade.tris * 0.6)
    for (const ent of dxf.text.split('\n0\n').filter((x) => /^(SOLID|HATCH)\n/.test(x))) expect(ent).not.toMatch(/\n\d{2}\n-?\d+\.\d{9,}(\n|$)/)
  })

  test('the shaded view is saved compact: shared vertices, 7 digits (B24)', async ({ page }) => {
    await ready(page)
    await partWithSheet(page)
    const saved = await download(page, 'SAVEAS', 'pieza')
    expect(saved.name).toBe('pieza.cota')
    const data = JSON.parse(saved.text)
    const shade = data.blocks.flatMap((b: { entities: Array<{ type: string; props: { tris: number[]; index?: number[]; colors: number[] } }> }) => b.entities).find((e: { type: string }) => e.type === 'SHADE')
    expect(shade.props.index).toBeDefined()
    const tris = shade.props.index.length / 3
    // Antes: ~220 bytes por triángulo (sus tres vértices con 17 cifras cada número).
    expect(JSON.stringify(shade.props).length / tris).toBeLessThan(90)
    for (const x of shade.props.tris) expect(String(Math.abs(x)).replace('.', '').replace(/^0+/, '').length).toBeLessThanOrEqual(9)
  })
})

test.describe('Editors and logs', () => {
  test('the MTEXT editor opens inside the window even if its point is out of view (R21)', async ({ page }) => {
    await ready(page)
    await cmd(page, 'ZOOM', 'W', '#1000,1000', '#1100,1060')
    await cmd(page, 'MTEXT', '0,220', '4', '0')
    const editor = page.getByTestId('text-editor')
    await expect(editor).toBeVisible()
    const ok = page.getByTestId('text-editor-ok')
    const b = (await ok.boundingBox())!
    expect(b.y).toBeGreaterThanOrEqual(0)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.y + b.height).toBeLessThanOrEqual(900)
    expect(b.x + b.width).toBeLessThanOrEqual(1600)
    await expect(ok).toHaveAttribute('title', /Ctrl\+Enter/)
    await page.getByTestId('text-editor-area').pressSequentially('Nota')
    await ok.click()
    expect(await st(page, "return s.doc.entities.find((e) => e.type === 'TEXT')?.props.text")).toBe('Nota')
  })

  test('TRACEBACK names the file after the open drawing (R38)', async ({ page }) => {
    await ready(page)
    await cmd(page, 'LINE', '0,0', '10,10', '')
    await st(page, "s.setDocName('perf-test')")
    const log = await download(page, 'TRACEBACK', 'Lines', '50')
    expect(log.name).toMatch(/^traceback-perf-test-\d{14}\.txt$/)
    expect(log.text).toContain('perf-test')
  })
})

test.describe('Dialogs at 1600×900', () => {
  test('HELP fits its columns: the description is never cut on the right (R02, B18); it is a named modal dialog (R37)', async ({ page }) => {
    await ready(page)
    await cmd(page, 'HELP')
    const dialog = page.getByRole('dialog', { name: 'Available commands' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    const fit = await dialog.evaluate((m) => ({ scroll: m.scrollWidth, client: m.clientWidth, table: m.querySelector('table')!.getBoundingClientRect().right, box: m.getBoundingClientRect().right }))
    expect(fit.scroll).toBeLessThanOrEqual(fit.client)
    expect(fit.table).toBeLessThanOrEqual(fit.box)
  })

  test('PAGESETUP names each margin (R44)', async ({ page }) => {
    await ready(page)
    await page.getByTestId('tab-Layout1').click()
    await cmd(page, 'PAGESETUP')
    const dialog = page.getByRole('dialog', { name: /Page Setup/ })
    await expect(dialog.getByRole('group', { name: 'Margins (mm)' })).toBeVisible()
    for (const m of ['Top', 'Right', 'Bottom', 'Left']) await expect(dialog.getByLabel(m, { exact: true })).toBeVisible()
    await dialog.getByLabel('Left', { exact: true }).fill('12')
    await page.getByTestId('pagesetup-ok').click()
    expect((await st<number[]>(page, 'return s.doc.activeLayout.pageSetup.marginsMm'))[3]).toBe(12)
  })

  test('the PLOT preview keeps «Scale 1:1» off the sheet (B22)', async ({ page }) => {
    await ready(page)
    await page.getByTestId('tab-Layout1').click()
    await cmd(page, 'PLOT')
    const caption = page.getByTestId('plot-caption')
    await expect(caption).toContainText('Scale 1:1')
    const c = (await caption.boundingBox())!
    const sheet = (await page.getByTestId('plot-preview').boundingBox())!
    expect(c.y).toBeGreaterThanOrEqual(sheet.y + sheet.height - 0.5)
    await page.getByTestId('plot-cancel').click()
  })
})

test.describe('Agent panel', () => {
  test('without a key the message stays written and the key field gets the focus; the notice does not point to an icon (R29)', async ({ page }) => {
    await ready(page)
    await cmd(page, 'AGENT')
    await expect(page.getByTestId('agent-panel')).toBeVisible()
    await page.getByTestId('agent-settings-btn').click() // ajustes cerrados a mano
    await page.getByTestId('agent-input').fill('a 100x60 plate')
    await page.getByTestId('agent-send').click()
    await expect(page.getByTestId('agent-feed')).toContainText('Add your API key in the field above')
    await expect(page.getByTestId('agent-feed')).not.toContainText('⚙')
    await expect(page.getByTestId('agent-input')).toHaveValue('a 100x60 plate')
    await expect(page.getByTestId('agent-key')).toBeFocused()
  })

  test('with the agent panel open the status bar ends in view, even with many sheets (R30)', async ({ page }) => {
    await ready(page)
    for (const n of ['00-CONJUNTO', '01-ELEMENTO', '02-SOPORTES', '03-TAPONES']) await cmd(page, 'LAYOUT', 'New', n)
    await cmd(page, 'AGENT')
    await expect(page.getByTestId('agent-panel')).toBeVisible()
    const fit = await page.locator('.statusbar').evaluate((sb) => {
      const last = sb.lastElementChild!.getBoundingClientRect()
      return { scroll: sb.scrollWidth, client: sb.clientWidth, last: last.right, bar: sb.getBoundingClientRect().right }
    })
    expect(fit.scroll).toBeLessThanOrEqual(fit.client)
    expect(fit.last).toBeLessThanOrEqual(fit.bar)
    await expect(page.locator('.statusbar').getByText('LWT', { exact: true })).toBeInViewport()
  })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _phoneBrowser, ...pixel } = devices['Pixel 5']

test.describe('Full editor on a phone (390×844)', () => {
  test.use({ ...pixel, viewport: { width: 390, height: 844 } })

  test('the view cube is folded into a button and the drawing name fits (R31)', async ({ page }) => {
    await page.goto('/?mobile=0')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await st(page, "s.setDocName('radiador-conjunto')")
    // El cubo: plegado en un botón con la vista (antes ocupaba un cuarto del dibujo).
    const cube = (await page.getByTestId('viewcube').boundingBox())!
    const view = (await page.locator('.app .center > .viewport').boundingBox())!
    expect((cube.width * cube.height) / (view.width * view.height)).toBeLessThan(0.05)
    const chip = page.getByTestId('viewnet-expand')
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await chip.tap()
    await expect(page.getByTestId('viewcube-TOP')).toBeVisible()
    await page.getByTestId('viewcube-TOP').tap()
    await expect(page.getByTestId('viewnet-expand')).toContainText('TOP')
    // El nombre del dibujo se ve entero.
    const name = page.getByTestId('doc-name')
    await expect(name).toHaveValue('radiador-conjunto')
    expect(await name.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await expect(page.getByTestId('autosave-toggle')).toHaveAccessibleName('Autosave off')
  })
})
