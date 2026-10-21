import { test, expect, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
  }
}

const dims = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: { id: string; type: string; props: { styleName?: string; style: { DIMTXT: number }; overrides?: object } }[] } } } }
    return w.__cotaStore.getState().doc.entities.filter((e) => e.type === 'DIMENSION').map((e) => ({ id: e.id, style: e.props.styleName, txt: e.props.style.DIMTXT, ov: e.props.overrides ?? null }))
  })

test.describe('DIMSTYLE y paleta de cotas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // La paleta de Propiedades arranca minimizada: estas pruebas miran su contenido.
    await page.waitForFunction(() => !!(window as any).__cotaStore)
    await page.evaluate(() => (window as any).__cotaStore.getState().setPropsPalette({ minimized: false }))
    // El combo de estilos está en la barra horizontal (vertical, a la izquierda, no entra).
    await page.evaluate(() => (window as any).__cotaStore.getState().setToolbar('dimension', { side: 'top' }))
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('Modify del estilo actualiza todas sus cotas (criterio 1) y New + Set Current crea otro', async ({ page }) => {
    await typeCmd(page, 'DIMLINEAR', '#0,0', '#40,0', '#20,10')
    await typeCmd(page, 'DIMLINEAR', '#0,0', '#0,30', '#-10,15')
    await typeCmd(page, 'DIMSTYLE')
    const dialog = page.getByTestId('dimstyle-dialog')
    await expect(dialog).toContainText('Current dimension style: IRAM 4513')
    await expect(page.getByTestId('dimstyle-list-preview')).toBeVisible()
    await page.getByTestId('dimstyle-modify').click()
    await page.getByTestId('dimstyle-tab-Text').click()
    await page.getByTestId('dimvar-DIMTXT').fill('5')
    await expect(page.getByTestId('dimstyle-preview')).toBeVisible()
    await page.getByTestId('dimstyle-ok').click()
    await expect.poll(async () => (await dims(page)).map((d) => d.txt)).toEqual([5, 5])

    await page.getByTestId('dimstyle-new').click()
    await page.getByTestId('dimstyle-new-name').fill('Arquitectura')
    await page.getByTestId('dimstyle-new-continue').click()
    await page.getByTestId('dimstyle-tab-Symbols and Arrows').click()
    await page.getByTestId('dimvar-DIMBLK1').selectOption('_ARCHTICK')
    await page.getByTestId('dimstyle-ok').click()
    await page.getByTestId('dimstyle-item-Arquitectura').click()
    await page.getByTestId('dimstyle-setcurrent').click()
    await expect(dialog).toContainText('Current dimension style: Arquitectura')
    await page.getByLabel('Close').first().click()
    await expect(page.getByTestId('dim-style-select')).toHaveValue('Arquitectura')
    await typeCmd(page, 'DIMLINEAR', '#0,50', '#40,50', '#20,60')
    expect((await dims(page))[2].style).toBe('Arquitectura')
  })

  test('paleta: override en una cota marcado y aplicado sólo a ella', async ({ page }) => {
    await typeCmd(page, 'DIMLINEAR', '#0,0', '#40,0', '#20,10')
    await typeCmd(page, 'DIMLINEAR', '#0,20', '#40,20', '#20,30')
    const [a] = await dims(page)
    await page.evaluate((id) => (window as unknown as { __cotaStore: { setState: (p: object) => void } }).__cotaStore.setState({ selection: [id] }), a.id)
    await expect(page.getByTestId('prop-dimstyle')).toHaveValue('IRAM 4513')
    await page.getByTestId('dimvar-DIMTXT').fill('7')
    await page.getByTestId('dimvar-DIMTXT').press('Enter')
    await expect.poll(async () => (await dims(page)).map((d) => d.txt)).toEqual([7, 2.5])
    expect((await dims(page))[0].ov).toEqual({ DIMTXT: 7 })
  })

  test('menú contextual de cotas: Flip Arrow, Precision, Move text alone; paleta Associative (E8)', async ({ page }) => {
    await typeCmd(page, 'LINE', '#0,0', '#40,0', '')
    await typeCmd(page, 'DIMLINEAR', '')
    const box = (await page.locator('canvas').boundingBox())!
    const [cx, cy, sc] = [box.x + box.width / 2, box.y + box.height / 2, box.height / 200]
    const at = (x: number, y: number): [number, number] => [cx + x * sc, cy - y * sc]
    await page.mouse.move(...at(25, 3))
    await page.mouse.move(...at(25, 0))
    await page.mouse.click(...at(25, 0))
    await typeCmd(page, '#20,10')
    const [d] = await dims(page)
    await page.evaluate((id) => (window as unknown as { __cotaStore: { setState: (p: object) => void } }).__cotaStore.setState({ selection: [id] }), d.id)
    await expect(page.getByTestId('prop-dimassoc')).toHaveText('Yes')

    const props = () =>
      page.evaluate(() => {
        const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: { type: string; props: { flip?: boolean[]; overrides?: object; textAt?: number[] } }[] } } } }
        return w.__cotaStore.getState().doc.entities.find((e) => e.type === 'DIMENSION')!.props
      })
    // Clic derecho (sin arrastre) cerca de la flecha derecha → Flip Arrow invierte esa.
    await page.mouse.click(...at(39, 10), { button: 'right' })
    await expect(page.getByTestId('dim-menu')).toBeVisible()
    await page.getByTestId('dim-menu-flip').click()
    await expect(page.getByTestId('dim-menu')).toBeHidden()
    expect((await props()).flip).toEqual([false, true])

    await page.mouse.click(...at(20, 20), { button: 'right' })
    await page.getByTestId('dim-menu-precision').hover()
    await page.getByTestId('dim-menu-prec-3').click()
    expect((await props()).overrides).toEqual({ DIMDEC: 3 })

    await page.mouse.click(...at(20, 20), { button: 'right' })
    await page.getByTestId('dim-menu-textpos').hover()
    await page.getByTestId('dim-menu-move-alone').click()
    await typeCmd(page, '#30,25')
    const p = await props()
    expect(p.textAt).toEqual([30, 25, 0])
    expect(p.overrides).toEqual({ DIMDEC: 3, DIMTMOVE: 2 })
  })
})
