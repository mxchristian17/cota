import { test, expect, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(30)
  }
}

type Ent = { type: string; props: Record<string, unknown> }
type Edge = { at: number[]; base?: number[] }

/** Entidades del documento (tipo + props). */
function entities(page: Page): Promise<Ent[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __cotaStore: { getState: () => { doc: { entities: { type: string; props: Record<string, unknown> }[] } } }
    }
    return w.__cotaStore.getState().doc.entities.map((e) => ({ type: e.type, props: e.props }))
  })
}

const ofType = async (page: Page, type: string): Promise<Ent[]> => (await entities(page)).filter((e) => e.type === type)

/** Click en coordenadas de mundo de la vista TOP inicial (extent vertical = 200), con Shift opcional. */
async function clickWorld(page: Page, x: number, y: number, shift = false) {
  const box = await page.locator('canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  const s = box.height / 200
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.click(box.x + box.width / 2 + x * s, box.y + box.height / 2 - y * s)
  if (shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(30)
}

const solid = async (page: Page): Promise<Record<string, unknown>> => (await ofType(page, 'SOLID3D'))[0].props
const edgesOf = (p: Record<string, unknown>): Edge[] => p.edges as Edge[]

test.describe('Cota: FILLETEDGE y CHAMFEREDGE 3D', () => {
  const errors: string[] = []

  test.beforeEach(async ({ page }) => {
    errors.length = 0
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      // Sin backend en e2e, las llamadas a la API fallan (500): no son errores de la UI.
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text())
    })
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  test('arista vertical de una caja con radio 5; Ctrl+Z vuelve a la caja en un paso', async ({ page }) => {
    await typeCmd(page, 'BOX', '#0,0', '#40,30', '20')
    await typeCmd(page, 'FILLETEDGE', 'R', '5', '#40,30,10', '')
    await expect(page.locator('.cmd-output')).toContainText('1 edge(s) selected for fillet.')
    await typeCmd(page, '')
    const p = await solid(page)
    expect(p.op).toBe('FILLETEDGE')
    expect(p.radius).toBe(5)
    expect((p.solid as Record<string, unknown>).op).toBe('BOX')
    expect(edgesOf(p)[0].at).toEqual([40, 30, 10])
    await page.getByTestId('command-input').press('Control+z')
    await expect.poll(async () => (await solid(page)).op).toBe('BOX')
  })

  test('chaflán 5/2 del borde superior de un cilindro picado con el mouse', async ({ page }) => {
    await typeCmd(page, 'CYLINDER', '#0,0', '20', '30')
    await typeCmd(page, 'CHAMFEREDGE', 'D', '5', '2')
    await clickWorld(page, 20, 0)
    await typeCmd(page, '', '')
    const p = await solid(page)
    expect(p.op).toBe('CHAMFEREDGE')
    expect([p.d1, p.d2]).toEqual([5, 2])
    const [e] = edgesOf(p)
    expect(e.at[2]).toBeCloseTo(30) // borde superior (el más cercano a la cámara)
    expect(e.base?.[2]).toBeCloseTo(30) // Distance1 sobre la tapa, que mira al observador
  })

  test('Loop sobre la cara superior de la caja redondea sus 4 aristas', async ({ page }) => {
    await typeCmd(page, 'BOX', '#0,0', '#40,30', '20')
    await typeCmd(page, 'FILLETEDGE', 'R', '2', 'L')
    await clickWorld(page, 20, 0)
    await typeCmd(page, '', '')
    await expect(page.locator('.cmd-output')).toContainText('4 edge(s) selected for fillet.')
    await typeCmd(page, '')
    const p = await solid(page)
    expect(edgesOf(p).map((e) => e.at[2])).toEqual([20, 20, 20, 20])
  })
})
