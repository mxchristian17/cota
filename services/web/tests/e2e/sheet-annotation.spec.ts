import { expect, test, type Page } from '@playwright/test'

/** Planos y anotación (R08, R15, R20 de la prueba del radiador): como usuario, por la línea de comandos. */

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
  }
}

const store = (page: Page, js: string) =>
  page.evaluate((code) => {
    const key = Object.keys(window).find((k) => /^__\w+Store$/.test(k))!
    const st = (window as unknown as Record<string, { getState: () => Record<string, unknown> }>)[key]
    return new Function('s', code)(st.getState())
  }, js)

/** Placa 100 × 60 × 20 con un agujero y sus vistas a 1:2 (base en 120,200; planta debajo; lateral a la derecha). */
async function sheetWithViews(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
  await typeCmd(page, 'BOX', '#0,0,0', '@100,60', '20')
  await typeCmd(page, 'CYLINDER', '#50,30,-1', '10', '22')
  await typeCmd(page, 'SUBTRACT', '#1,1,20', '', '#50,40,20', '')
  await expect(page.locator('.cmd-output')).toContainText('Subtracted 1 from 1.')
  await typeCmd(page, 'VIEWBASE', '', 'Layout1', 'S', '1:2', '#120,200', '#120,120', '#230,200', '')
  await expect(page.locator('.cmd-output')).toContainText('Base view created with 2 projected view(s)', { timeout: 30_000 })
}

/** Posición y extensión (mín. x, mín. y del bloque) de cada vista de la hoja. */
const viewSpots = (page: Page) =>
  store(
    page,
    `const d = s.doc; return JSON.stringify(d.layouts[0].entities.filter((e) => e.type === 'INSERT' && e.props.view).map((v) => {
      const ls = d.getBlock(v.props.name).entities.filter((e) => e.type === 'LINE')
      return [v.props.position[0], v.props.position[1], Math.min(...ls.flatMap((e) => [e.props.start[0], e.props.end[0]])), Math.min(...ls.flatMap((e) => [e.props.start[1], e.props.end[1]]))]
    }))`,
  )

test.describe('Sheets and annotation', () => {
  test('R20: drawing views keep their place when the model grows; only their content changes', async ({ page }) => {
    test.setTimeout(90_000)
    await sheetWithViews(page)
    const before = JSON.parse((await viewSpots(page)) as string) as number[][]
    await store(page, `s.setActiveTab('MODEL')`)
    await typeCmd(page, 'COPY', '#1,1,20', '', '#0,0,0', '#2000,0,0', '')
    await expect(page.locator('.cmd-output')).toContainText('Copied 1 object(s)')
    await store(page, `s.setActiveTab(s.doc.layouts[0].id)`)
    await expect.poll(async () => JSON.parse((await viewSpots(page)) as string) as number[][]).toEqual(before)
    // La vista se actualizó (ahora llega hasta la copia), pero la pieza original no se movió en la hoja.
    const right = await store(page, `const d = s.doc; const v = d.layouts[0].entities.find((e) => e.type === 'INSERT' && e.props.view); return Math.max(...d.getBlock(v.props.name).entities.filter((e) => e.type === 'LINE').flatMap((e) => [e.props.start[0], e.props.end[0]]))`)
    expect(right).toBeGreaterThan(2000)
  })

  test('R15: a dimension drawn by hand on a 1:2 view measures the part', async ({ page }) => {
    test.setTimeout(90_000)
    await sheetWithViews(page)
    // Lado izquierdo de la vista frontal: 10 mm de hoja = 20 de pieza.
    await typeCmd(page, 'DIMLINEAR', '#95,195', '#95,205', 'V', '#80,200')
    await expect(page.locator('.cmd-output')).toContainText('Dimension text = 20')
    await expect(page.locator('.cmd-output')).not.toContainText('Dimension text = 10')
  })

  test('R08: a block attribute stays where it was defined when the base point is not 0,0', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await typeCmd(page, 'CIRCLE', '#300,300', '5')
    // Preset: el valor por defecto (7) entra sin preguntar.
    await typeCmd(page, 'ATTDEF', 'P', '', 'NUM', 'Item', '7', 'J', 'MC', '#300,300', '3', '0')
    await typeCmd(page, 'BLOCK', 'C', '#294,294', '#306,306', '', 'B1', '#300,300')
    await expect(page.locator('.cmd-output')).toContainText('Block "B1" defined (2 object(s)).')
    await typeCmd(page, 'INSERT', 'B1', '#400,300', '1', '', '0')
    const pos = await store(
      page,
      `const d = s.doc; const ins = d.entities.filter((e) => e.type === 'INSERT' && e.props.name === 'B1').at(-1)
       const def = d.getBlock('B1').entities.find((e) => e.type === 'ATTDEF')
       return [ins.props.position[0] + def.props.position[0], ins.props.position[1] + def.props.position[1]]`,
    )
    // Centrado en el círculo de la inserción (la línea base, medio alto más abajo), no al doble de la coordenada.
    expect((pos as number[])[0]).toBeCloseTo(400, 6)
    expect((pos as number[])[1]).toBeCloseTo(298.5, 6)
  })
})
