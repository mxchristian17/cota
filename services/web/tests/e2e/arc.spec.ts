import { test, expect, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(30)
  }
}

/** Entidades del documento (tipo + props). */
function entities(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __cotaStore: { getState: () => { doc: { entities: { type: string; props: Record<string, unknown> }[] } } }
    }
    return w.__cotaStore.getState().doc.entities.map((e) => ({ type: e.type, props: e.props }))
  })
}

/** Selecciona todo (pre-selección noun-verb). */
async function selectAll(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __cotaStore: { getState: () => { doc: { entities: { id: string }[] } }; setState: (p: object) => void }
    }
    w.__cotaStore.setState({ selection: w.__cotaStore.getState().doc.entities.map((e) => e.id) })
  })
}

const TAU = Math.PI * 2
const sweep = (p: { startAngle: number; endAngle: number }): number => {
  const d = ((p.endAngle - p.startAngle) % TAU + TAU) % TAU
  return d < 1e-12 ? TAU : d
}

test.describe('Cota: entidad ARC', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // La paleta de Propiedades arranca minimizada: estas pruebas miran su contenido.
    await page.waitForFunction(() => !!(window as any).__cotaStore)
    await page.evaluate(() => (window as any).__cotaStore.getState().setPropsPalette({ minimized: false }))
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('ARC de 3 puntos crea un arco que pasa por el punto intermedio', async ({ page }) => {
    await typeCmd(page, 'A', '#0,0', '#5,5', '#10,0')
    const es = await entities(page)
    expect(es).toHaveLength(1)
    expect(es[0].type).toBe('ARC')
    const p = es[0].props as { center: number[]; radius: number; normal: number[]; startAngle: number; endAngle: number }
    expect(p.center[0]).toBeCloseTo(5, 6)
    expect(p.radius).toBeCloseTo(5, 6)
    expect(p.normal[2]).toBeCloseTo(-1, 6) // horario ⇒ normal invertida (como el CAD clásico)
    expect(sweep(p)).toBeCloseTo(Math.PI, 6)
  })

  test('ARC Start/Center/Angle con ángulo negativo dibuja en sentido horario', async ({ page }) => {
    await typeCmd(page, 'ARC', '#10,0', 'C', '#0,0', 'A', '-90')
    const p = (await entities(page))[0].props as { normal: number[]; startAngle: number; endAngle: number }
    expect(p.normal[2]).toBeCloseTo(-1, 6)
    expect(sweep(p)).toBeCloseTo(Math.PI / 2, 6)
  })

  test('un barrido de 360° se guarda como círculo', async ({ page }) => {
    await typeCmd(page, 'ARC', '#10,0', 'C', '#0,0', 'A', '360')
    const es = await entities(page)
    expect(es).toHaveLength(1)
    expect(es[0].type).toBe('CIRCLE')
    await expect(page.locator('.cmd-output')).toContainText('a circle was created instead')
  })

  test('Enter continúa el arco tangente a la última línea', async ({ page }) => {
    await typeCmd(page, 'LINE', '#0,0', '#10,0', '')
    await typeCmd(page, 'ARC', '', '#15,5')
    const es = await entities(page)
    expect(es).toHaveLength(2)
    expect(es[1].type).toBe('ARC')
  })

  test('el arco se puede mover y rotar con los comandos de edición', async ({ page }) => {
    await typeCmd(page, 'ARC', '#10,0', 'C', '#0,0', '#0,10')
    await selectAll(page)
    await typeCmd(page, 'MOVE', '#0,0', '#5,0')
    let p = (await entities(page))[0].props as { center: number[] }
    expect(p.center[0]).toBeCloseTo(5, 6)

    await selectAll(page)
    await typeCmd(page, 'ROTATE', '#5,0', '90')
    await expect(page.locator('.cmd-output')).toContainText('Rotated 1 object(s) 90°')
    p = (await entities(page))[0].props as { center: number[] }
    expect(p.center[1]).toBeCloseTo(0, 6)
  })

  test('la paleta de Propiedades muestra los campos del arco', async ({ page }) => {
    await typeCmd(page, 'ARC', '#10,0', 'C', '#0,0', '#0,10')
    await selectAll(page)
    const props = page.getByTestId('properties')
    await expect(props).toContainText('ARC')
    await expect(props).toContainText('Radius')
    await expect(props).toContainText('Total angle')
    await expect(props).toContainText('Arc length')
  })

  test('PLINE con un tramo de arco guarda el bulge y se dibuja curvo', async ({ page }) => {
    await typeCmd(page, 'PL', '#0,0', '#10,0', 'A', '#10,10', '')
    const es = await entities(page)
    expect(es).toHaveLength(1)
    expect(es[0].type).toBe('POLYLINE')
    const p = es[0].props as { vertices: number[][]; bulges?: number[] }
    expect(p.vertices).toHaveLength(3)
    expect(p.bulges?.[1]).toBeCloseTo(1, 6) // media vuelta tangente a +X
  })

  test('ELLIPSE Arc recorta la elipse', async ({ page }) => {
    await typeCmd(page, 'ELLIPSE', 'A', '#-10,0', '#10,0', '5', '0', '90')
    const es = await entities(page)
    expect(es).toHaveLength(1)
    const p = es[0].props as { startParam?: number; endParam?: number }
    expect(p.startParam).toBeCloseTo(0, 6)
    expect(p.endParam).toBeCloseTo(Math.PI / 2, 6)
  })
})
