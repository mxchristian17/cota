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

/** Selecciona todo (pre-selección noun-verb). */
async function selectAll(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __cotaStore: { getState: () => { doc: { entities: { id: string }[] } }; setState: (p: object) => void }
    }
    w.__cotaStore.setState({ selection: w.__cotaStore.getState().doc.entities.map((e) => e.id) })
  })
}

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

const xs = (es: Ent[]): number[][] =>
  es.map((e) => [(e.props.start as number[])[0], (e.props.end as number[])[0]].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0])

test.describe('Cota: geometría elemental 2D', () => {
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

  test('TR con un círculo cortante recorta un arco y una polilínea', async ({ page }) => {
    await typeCmd(page, 'C', '#0,0', '20')
    await typeCmd(page, 'A', '#-30,0', '#0,10', '#30,0')
    await typeCmd(page, 'PL', '#-30,-10', '#30,-10', '')
    await typeCmd(page, 'TR', '', '#0,10', '#0,-10', '')
    expect(await ofType(page, 'CIRCLE')).toHaveLength(1)
    expect(await ofType(page, 'ARC')).toHaveLength(2)
    expect(await ofType(page, 'POLYLINE')).toHaveLength(2)
  })

  test('TR del tramo central deja dos líneas; con Edge=Extend corta contra una arista que no llega', async ({ page }) => {
    await typeCmd(page, 'L', '#-30,0', '#30,0', '')
    await typeCmd(page, 'L', '#-10,-10', '#-10,10', '')
    await typeCmd(page, 'L', '#10,-10', '#10,10', '')
    await typeCmd(page, 'TR', '', '#0,0', '')
    const h = (await ofType(page, 'LINE')).filter((e) => (e.props.start as number[])[1] === 0 && (e.props.end as number[])[1] === 0)
    expect(xs(h)).toEqual([
      [-30, -10],
      [10, 30],
    ])
    await selectAll(page)
    await typeCmd(page, 'ERASE')
    await typeCmd(page, 'L', '#-30,50', '#30,50', '')
    await typeCmd(page, 'L', '#0,55', '#0,70', '')
    await typeCmd(page, 'TR', '', 'E', 'E', '#20,50', '')
    const top = (await ofType(page, 'LINE')).filter((e) => (e.props.start as number[])[1] === 50)
    expect(xs(top)).toEqual([[-30, 0]])
  })

  test('shift-click: en TR alarga y en EX recorta', async ({ page }) => {
    await typeCmd(page, 'L', '#-30,0', '#0,0', '')
    await typeCmd(page, 'L', '#20,-10', '#20,10', '')
    await typeCmd(page, 'L', '#-30,50', '#30,50', '')
    await typeCmd(page, 'L', '#0,40', '#0,60', '')
    await typeCmd(page, 'TR', '')
    await clickWorld(page, -5, 0, true)
    await typeCmd(page, '')
    await typeCmd(page, 'EX', '')
    await clickWorld(page, 20, 50, true)
    await typeCmd(page, '')
    const lines = await ofType(page, 'LINE')
    const at = (y: number) => xs(lines.filter((e) => (e.props.start as number[])[1] === y && (e.props.end as number[])[1] === y))
    expect(at(0)[0][1]).toBeCloseTo(20, 6)
    expect(at(50)[0][1]).toBeCloseTo(0, 6)
  })

  test('O sobre una polilínea cerrada con arcos: paralela interior sin bucles; Multiple repite', async ({ page }) => {
    await typeCmd(page, 'PL', '#0,0', '#60,0', 'A', '#60,40', 'L', '#0,40', 'A', 'CL')
    await typeCmd(page, 'O', '5', '#30,0', 'M', '#30,20', '#30,20', '', '')
    const pls = await ofType(page, 'POLYLINE')
    expect(pls).toHaveLength(3)
    const inner = pls.map((e) => e.props as { vertices: number[][]; closed: boolean }).find((p) => p.vertices.every((v) => v[1] > 9))
    expect(inner?.closed).toBe(true)
    expect(inner?.vertices).toHaveLength(4)
    const ys = inner?.vertices.map((v) => v[1]) ?? []
    expect(Math.min(...ys)).toBeCloseTo(10, 6)
    expect(Math.max(...ys)).toBeCloseTo(30, 6)
  })

  test('J une líneas colineales con hueco y arcos del mismo círculo; cLose cierra el arco', async ({ page }) => {
    await typeCmd(page, 'L', '#0,0', '#10,0', '')
    await typeCmd(page, 'L', '#20,0', '#30,0', '')
    await selectAll(page)
    await typeCmd(page, 'J')
    expect(xs(await ofType(page, 'LINE'))).toEqual([[0, 30]])
    await selectAll(page)
    await typeCmd(page, 'ERASE')
    await typeCmd(page, 'ARC', '#10,0', 'C', '#0,0', 'A', '90')
    await typeCmd(page, 'ARC', '#-10,0', 'C', '#0,0', 'A', '60')
    await selectAll(page)
    await typeCmd(page, 'J')
    expect(await ofType(page, 'ARC')).toHaveLength(1)
    await selectAll(page)
    await typeCmd(page, 'J', 'L')
    expect(await ofType(page, 'ARC')).toHaveLength(0)
    expect(await ofType(page, 'CIRCLE')).toHaveLength(1)
  })

  test('BR con dos puntos sobre un círculo deja el arco complementario', async ({ page }) => {
    await typeCmd(page, 'C', '#0,0', '10')
    await typeCmd(page, 'BR', '#10,0', '#0,10')
    const [a] = await ofType(page, 'ARC')
    const p = a.props as { startAngle: number; endAngle: number; radius: number }
    expect(p.radius).toBeCloseTo(10, 6)
    expect(p.startAngle).toBeCloseTo(Math.PI / 2, 6)
    expect(p.endAngle).toBeCloseTo(0, 6)
  })

  test('LEN DElta alarga una línea y AL la alinea con dos pares', async ({ page }) => {
    await typeCmd(page, 'L', '#0,0', '#10,0', '')
    await typeCmd(page, 'LEN', 'DE', '5', '#9,0', '')
    expect(xs(await ofType(page, 'LINE'))).toEqual([[0, 15]])
    await selectAll(page)
    await typeCmd(page, 'AL', '#0,0', '#5,5', '#15,0', '#5,20', '')
    await typeCmd(page, 'N')
    const p = (await ofType(page, 'LINE'))[0].props as { start: number[]; end: number[] }
    expect(p.start[0]).toBeCloseTo(5, 6)
    expect(p.end[0]).toBeCloseTo(5, 6)
    expect(p.end[1]).toBeCloseTo(20, 6)
  })
})
