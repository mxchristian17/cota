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

const pts = (e: Ent): number[][] => [e.props.start as number[], e.props.end as number[]]
const near = (p: number[], x: number, y: number): boolean => Math.hypot(p[0] - x, p[1] - y) < 1e-6

test.describe('Cota: FILLET y CHAMFER 2D', () => {
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

  test('F con el radio por defecto agrega el arco y Ctrl+Z lo deshace de una vez', async ({ page }) => {
    await typeCmd(page, 'L', '#0,0', '#60,0', '')
    await typeCmd(page, 'L', '#0,0', '#0,60', '')
    await typeCmd(page, 'F', '#30,0', '#0,30')
    expect(await ofType(page, 'ARC')).toHaveLength(1)
    const lines = await ofType(page, 'LINE')
    expect(lines.some((l) => pts(l).some((p) => near(p, 10, 0)))).toBe(true)
    await page.getByTestId('command-input').press('Control+z')
    await expect.poll(async () => (await ofType(page, 'ARC')).length).toBe(0)
    expect((await ofType(page, 'LINE')).every((l) => pts(l).some((p) => near(p, 0, 0)))).toBe(true)
  })

  test('shift-select cierra la esquina con radio 0; paralelas llevan semicírculo', async ({ page }) => {
    await typeCmd(page, 'L', '#20,0', '#60,0', '')
    await typeCmd(page, 'L', '#0,20', '#0,60', '')
    await typeCmd(page, 'F', '#40,0')
    await clickWorld(page, 0, 40, true)
    expect((await ofType(page, 'LINE')).every((l) => pts(l).some((p) => near(p, 0, 0)))).toBe(true)
    await typeCmd(page, 'L', '#-60,-40', '#-20,-40', '')
    await typeCmd(page, 'L', '#-60,-60', '#-20,-60', '')
    await typeCmd(page, 'F', '#-40,-40', '#-40,-60')
    const [arc] = await ofType(page, 'ARC')
    expect(arc.props.radius).toBeCloseTo(10)
  })

  test('Polyline redondea el rectángulo; No trim + Multiple conserva las líneas', async ({ page }) => {
    await typeCmd(page, 'RECTANGLE', '#0,0', '#60,40')
    await typeCmd(page, 'F', 'P', '#30,0')
    await expect(page.locator('.cmd-output')).toContainText('4 lines were filleted')
    const [pl] = await ofType(page, 'POLYLINE')
    expect(pl.props.vertices).toHaveLength(8)
    await typeCmd(page, 'L', '#-80,-20', '#-20,-20', '')
    await typeCmd(page, 'L', '#-80,-20', '#-80,-80', '')
    await typeCmd(page, 'L', '#-20,-20', '#-20,-80', '')
    await typeCmd(page, 'F', 'T', 'N', 'M', '#-70,-20', '#-80,-50', '#-30,-20', '#-20,-50', '')
    expect(await ofType(page, 'ARC')).toHaveLength(2)
    expect((await ofType(page, 'LINE')).map((l) => pts(l)[0])).toEqual([[-80, -20, 0], [-80, -20, 0], [-20, -20, 0]])
  })

  test('CHAMFER por ángulo y radio persistido en Options', async ({ page }) => {
    await typeCmd(page, 'L', '#0,0', '#60,0', '')
    await typeCmd(page, 'L', '#0,0', '#0,60', '')
    await typeCmd(page, 'CHA', 'A', '10', '45', '#30,0', '#0,30')
    const lines = await ofType(page, 'LINE')
    expect(lines).toHaveLength(3)
    expect(lines.some((l) => pts(l).some((p) => near(p, 10, 0)) && pts(l).some((p) => near(p, 0, 10)))).toBe(true)
    await typeCmd(page, 'F', 'R', '7', '')
    await typeCmd(page, 'OPTIONS')
    await page.getByTestId('options-tab-editing').click()
    await expect(page.getByTestId('sysvar-FILLETRAD')).toHaveValue('7')
    await expect(page.getByTestId('sysvar-CHAMMODE')).toHaveValue('Angle')
  })
})
