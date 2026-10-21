import { test, expect, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(30)
  }
}

/** Selecciona todas las entidades del documento (pre-selección noun-verb). */
async function selectAll(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: { id: string }[] } }; setState: (p: object) => void } }
    w.__cotaStore.setState({ selection: w.__cotaStore.getState().doc.entities.map((e) => e.id) })
  })
}

/** Props de la entidad `i` del documento. */
function entityProps(page: Page, i = 0) {
  return page.evaluate((idx) => {
    const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: { type: string; props: Record<string, unknown> }[] } } } }
    const e = w.__cotaStore.getState().doc.entities[idx]
    return e ? { type: e.type, props: e.props } : null
  }, i)
}

test.describe('Cota modificación: ROTATE / MIRROR / STRETCH', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('ROTATE gira la selección alrededor del punto base', async ({ page }) => {
    await typeCmd(page, 'LINE', '0,0', '#10,0', '')
    await selectAll(page)
    await typeCmd(page, 'ROTATE', '0,0', '90')
    await expect(page.locator('.cmd-output')).toContainText('Rotated 1 object(s) 90°')
    const e = await entityProps(page)
    const p = e!.props as { start: number[]; end: number[] }
    expect(p.end[0]).toBeCloseTo(0, 6)
    expect(p.end[1]).toBeCloseTo(10, 6)
  })

  test('ROTATE con Copy conserva el original', async ({ page }) => {
    await typeCmd(page, 'LINE', '0,0', '#10,0', '')
    await selectAll(page)
    await typeCmd(page, 'ROTATE', '0,0', 'Copy', '90')
    await expect(page.locator('.cmd-output')).toContainText('(copy)')
    const count = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: unknown[] } } } }
      return w.__cotaStore.getState().doc.entities.length
    })
    expect(count).toBe(2)
  })

  test('MIRROR refleja la selección y puede borrar el origen', async ({ page }) => {
    await typeCmd(page, 'LINE', '2,0', '#10,0', '')
    await selectAll(page)
    // Eje vertical por x = 0; 'N' conserva los objetos origen.
    await typeCmd(page, 'MIRROR', '0,0', '#0,10', 'N')
    await expect(page.locator('.cmd-output')).toContainText('Mirrored 1 object(s)')
    const copy = await entityProps(page, 1)
    const p = copy!.props as { start: number[]; end: number[] }
    expect(p.start[0]).toBeCloseTo(-2, 6)
    expect(p.end[0]).toBeCloseTo(-10, 6)

    // Ahora con Yes: el original desaparece (sigue habiendo 2 entidades, no 3)
    await selectAll(page)
    await typeCmd(page, 'MIRROR', '0,0', '#0,10', 'Y')
    await expect(page.locator('.cmd-output')).toContainText('(source erased)')
    const count = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: unknown[] } } } }
      return w.__cotaStore.getState().doc.entities.length
    })
    expect(count).toBe(2)
  })

  test('STRETCH mueve sólo los vértices dentro de la ventana de cruce', async ({ page }) => {
    await typeCmd(page, 'LINE', '0,0', '#10,0', '')
    // Ventana de cruce sobre el extremo derecho, luego desplazamiento (0,5)
    await typeCmd(page, 'STRETCH', '8,-2', '#12,2', '#0,0', '@0,5')
    await expect(page.locator('.cmd-output')).toContainText('Stretched 1 object(s)')
    const e = await entityProps(page)
    const p = e!.props as { start: number[]; end: number[] }
    expect(p.start).toEqual([0, 0, 0])
    expect(p.end[0]).toBeCloseTo(10, 6)
    expect(p.end[1]).toBeCloseTo(5, 6)
  })

  test('OTRACK: F11 alterna el modo y pausar sobre un punto lo adquiere', async ({ page }) => {
    const otrack = page.getByTestId('otrack-toggle')
    await expect(otrack).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('F11')
    await expect(otrack).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('F11')
    await expect(otrack).toHaveAttribute('aria-pressed', 'true')

    // Dibuja una línea y, con un prompt de punto activo, pausa sobre su endpoint.
    await typeCmd(page, 'LINE', '-40,-20', '#40,-20', '')
    await typeCmd(page, 'LINE') // deja un prompt de punto activo (habilita snap + tracking)
    const box = await page.locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    const s = box.height / 200
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx + 40 * s, cy + 20 * s, { steps: 6 }) // endpoint (40,-20)
    await page.mouse.move(cx + 40 * s, cy + 20 * s) // quieto: se adquiere tras ~600 ms
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const w = window as unknown as { __cotaStore: { getState: () => { viewports: { tracked: unknown[] }[] } } }
            return w.__cotaStore.getState().viewports[0]?.tracked.length ?? 0
          }),
        { timeout: 4000 },
      )
      .toBe(1)
    await page.getByTestId('command-input').press('Escape')
  })
})
