import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

/**
 * Topología exacta de las piezas importadas (con el DWG de ejemplo público `__fixtures__/acadsharp/sample_AC1032.dwg`,
 * que trae un cubo de 5 de (15.2767…, -223.3501…, 0) a (20.2767…, -218.3501…, 5)): snaps de su modelo aun sin
 * convertir, centro exacto de un agujero, masa con inercia, vistas sin trazos de más ni de menos y conversión sola
 * mientras el usuario no hace nada.
 */
const DWG = readFileSync(new URL('../../src/core/io/__fixtures__/acadsharp/sample_AC1032.dwg', import.meta.url))
const LO = [15.27672546982376, -223.35012266071593, 0]
const HI = [20.27672546982376, -218.35012266071593, 5]

const st = <T>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function cmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(40)
  }
}

const screen = (page: Page, p: number[]) =>
  page.evaluate((q) => {
    const s = (window as any).__cotaStore.getState()
    const r = s.activeViewport.renderer.domElement.getBoundingClientRect()
    const [x, y] = s.activeViewport.project({ x: q[0], y: q[1], z: q[2] })
    return [x + r.left, y + r.top] as [number, number]
  }, p)

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

/** Abre el ejemplo; `mode`: la respuesta del diálogo de sólidos. `idle`: SOLIDIDLE. */
async function openSample(page: Page, mode: 'meshes' | 'convert', idle = 0) {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
  await cmd(page, 'SOLIDIDLE', String(idle))
  const chooser = page.waitForEvent('filechooser')
  await cmd(page, 'OPEN')
  await (await chooser).setFiles({ name: 'muestra.dwg', mimeType: 'application/octet-stream', buffer: DWG })
  await page.getByTestId(mode === 'meshes' ? 'solid-import-meshes' : 'solid-import-convert').click({ timeout: 30_000 })
  if (mode === 'convert') await expect(page.locator('.cmd-output')).toContainText(/imported piece\(s\) converted/, { timeout: 60_000 })
  await cmd(page, 'ZOOM', 'W', `#${LO[0] - 2},${LO[1] - 2}`, `#${HI[0] + 2},${HI[1] + 2}`)
  await frames(page)
}

/** Clic con el cursor cerca de un punto del modelo (el snap lo toma). */
async function pickNear(page: Page, p: number[], dx = 3, dy = 2) {
  const [x, y] = await screen(page, p)
  await page.mouse.move(x + dx * 2, y + dy * 2)
  await page.mouse.move(x + dx, y + dy)
  await frames(page)
  await page.mouse.down()
  await page.mouse.up()
}

const lastLine = (page: Page) => st<{ start: number[]; end: number[] }>(page, `return s.doc.entities.filter((e) => e.type === 'LINE').at(-1).props`)

test.describe('topología exacta de las piezas importadas', () => {
  test('sin convertir: LINE desde la esquina del cubo importado toma el vértice exacto de su modelo', async ({ page }) => {
    await openSample(page, 'meshes')
    await cmd(page, 'LINE')
    await pickNear(page, [HI[0], HI[1], 5])
    await cmd(page, '@10,0,0', '')
    const { start } = await lastLine(page)
    expect(start[0]).toBe(HI[0])
    expect(start[1]).toBe(HI[1])
    expect([0, 5]).toContain(start[2]) // en planta, la de arriba o la de abajo
  })

  test('el centro de un agujero restado se engancha exacto, MASSPROP da la inercia y las vistas salen justas', async ({ page }) => {
    await openSample(page, 'convert')
    const c = [17.7767, -220.8501]
    await cmd(page, 'CYLINDER', `#${c[0]},${c[1]},-1`, '1', '7')
    await cmd(page, 'SUBTRACT', `#${LO[0] + 0.5},${LO[1] + 0.5},5`, '', `#${c[0] + 1},${c[1]},-0.5`, '')
    await expect(page.locator('.cmd-output')).toContainText('Subtracted 1 from 1.')
    // El resultado del núcleo (mientras tanto el sólido está en boceto y no da snaps).
    const key = await st<string>(page, `return JSON.stringify(s.doc.entities.find((e) => e.type === 'SOLID3D' && e.props.op === 'SUBTRACT').props)`)
    await expect.poll(() => page.evaluate((k) => (window as any).__cotaSolids.kernelResult(k)?.ok ?? null, key), { timeout: 30_000 }).toBe(true)
    await frames(page)
    // CEN (activo por defecto): el centro del círculo de la arista del agujero (el del núcleo, no un ajuste a la malla).
    await cmd(page, 'LINE')
    await pickNear(page, [c[0] + Math.SQRT1_2, c[1] + Math.SQRT1_2, 5], 1, 1)
    await cmd(page, '@10,0,0', '')
    const { start } = await lastLine(page)
    expect(start[0]).toBeCloseTo(c[0], 9)
    expect(start[1]).toBeCloseTo(c[1], 9)
    await cmd(page, 'ERASE', 'L', '')
    // MASSPROP con la masa exacta: volumen, centroide e inercia.
    await cmd(page, 'MASSPROP', `#${LO[0] + 0.5},${LO[1] + 0.5},5`, '')
    const out = page.locator('.cmd-output')
    await expect(out).toContainText(/Volume:\s+109\.29/, { timeout: 30_000 })
    await expect(out).toContainText('Moments of inertia')
    await expect(out).toContainText('Principal moments and X-Y-Z directions about centroid')
    // Vistas: de frente, el contorno (4 rectas) y el agujero oculto (2 rectas); de arriba, el contorno y un círculo.
    await cmd(page, 'VIEWBASE', `#${LO[0] + 0.5},${LO[1] + 0.5},5`, '')
    // Antes de proyectar espera el resultado fino de las piezas importadas: recién entonces pregunta el layout.
    await expect.poll(() => st<string>(page, 'return s.prompt'), { timeout: 60_000 }).toContain('layout name')
    await cmd(page, '', '#100,150', '#100,60', '')
    await expect(out).toContainText('Base view created', { timeout: 60_000 })
    const views = await st<Array<{ lines: number; hidden: number; circles: number }>>(
      page,
      `const hid = s.doc.layers.find((l) => l.name === 'MD_Hidden')?.id
       return s.doc.activeLayout.entities.filter((e) => e.type === 'INSERT' && e.props.name.startsWith('*VIEW')).map((v) => {
         const es = s.doc.getBlock(v.props.name).entities
         return { lines: es.filter((e) => e.type === 'LINE' && e.layer !== hid).length, hidden: es.filter((e) => e.type === 'LINE' && e.layer === hid).length, circles: es.filter((e) => e.type === 'CIRCLE').length }
       })`,
    )
    expect(views).toEqual([
      { lines: 4, hidden: 2, circles: 0 },
      { lines: 4, hidden: 0, circles: 1 },
    ])
  })

  test('mientras el usuario no hace nada, las piezas que quedaron como malla se convierten solas', async ({ page }) => {
    await openSample(page, 'meshes', 1)
    const keys = await st<string[]>(page, `return s.doc.entities.filter((e) => e.type === 'SOLID3D' && e.props.op === 'BREP').map((e) => JSON.stringify(e.props))`)
    expect(keys).toHaveLength(3)
    const done = () => page.evaluate((ks) => ks.filter((k) => (window as any).__cotaSolids.kernelResult(k)).length, keys)
    // Moviendo el cursor sin parar no arranca (el usuario está trabajando).
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(400 + (i % 2) * 20, 300)
      await page.waitForTimeout(250)
    }
    expect(await done()).toBe(0)
    // Quieto, se convierten.
    await expect.poll(done, { timeout: 30_000 }).toBe(3)
  })
})
