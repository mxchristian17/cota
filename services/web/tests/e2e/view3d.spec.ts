import { test, expect, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
  }
}

/** Medidas del canvas cuando dejó de cambiar (la interfaz termina de acomodarse después del primer render). */
async function stableCanvasBox(page: Page) {
  const canvas = page.locator('canvas').first()
  let prev = await canvas.boundingBox()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100)
    const next = await canvas.boundingBox()
    if (prev && next && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height) return next
    prev = next
  }
  return prev
}

test.describe('Cota 3D: view cube + EXTRUDE', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // La paleta de Propiedades arranca minimizada: estas pruebas miran su contenido.
    await page.waitForFunction(() => !!(window as any).__cotaStore)
    await page.evaluate(() => (window as any).__cotaStore.getState().setPropsPalette({ minimized: false }))
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('view cube is visible with faces and projection toggle', async ({ page }) => {
    await expect(page.getByTestId('viewcube')).toBeVisible()
    await expect(page.getByTestId('viewcube-FRONT')).toBeVisible()
    await expect(page.getByTestId('proj-toggle')).toBeVisible()
  })

  test('las vistas conservan la proyección (CAD clásico); cada esquina es su isométrica y FRONT activa la UCS Front', async ({ page }) => {
    const proj = page.getByTestId('proj-toggle')
    const label = page.getByTestId('viewcube-label')
    await expect(proj).toHaveText('Ortho')
    await page.getByTestId('viewcube-iso-ISO').first().click() // esquina FRONT·RIGHT·TOP = SE (ISO)
    await expect(proj).toHaveText('Ortho')
    await expect(label).toHaveText('ISO')
    await proj.click()
    await expect(proj).toHaveText('Persp')
    await page.getByTestId('viewcube-FRONT').click()
    await expect(proj).toHaveText('Persp') // la perspectiva se conserva
    await expect(label).toHaveText('FRONT')
    // UCSORTHO: la cara FRONT activa la UCS Front (Z hacia el observador).
    const z = await page.evaluate(() => {
      const u = (window as unknown as { __cotaStore: { getState: () => { ucs: { x: number[]; y: number[] } } } }).__cotaStore.getState().ucs
      return [u.x, u.y]
    })
    expect(z).toEqual([[1, 0, 0], [0, 0, 1]])
    await page.getByTestId('viewcube-iso-NWISO').first().click() // esquina BACK·LEFT·TOP = NW
    await expect(label).toHaveText('NWISO')
  })

  test('projection toggle button flips ortho/persp', async ({ page }) => {
    const proj = page.getByTestId('proj-toggle')
    await expect(proj).toHaveText('Ortho')
    await proj.click()
    await expect(proj).toHaveText('Persp')
  })

  test('EXTRUDE a rectangle into a solid', async ({ page }) => {
    await typeCmd(page, 'RECTANGLE', '-20,-20', '#20,20')
    await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
    // seleccionar el rectángulo por su borde superior, con el canvas ya quieto
    const box = await stableCanvasBox(page)
    if (!box) throw new Error('no canvas')
    const s = box.height / 200
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 20 * s)
    await expect(page.getByTestId('properties')).toContainText('RECTANGLE')
    await typeCmd(page, 'EXTRUDE', '30') // pre-selección (noun-verb) + altura
    await expect(page.locator('.cmd-output')).toContainText('Extruded')
  })

  test('UNION of two extruded solids', async ({ page }) => {
    const box = await page.locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    const s = box.height / 200
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const dragWindow = async () => {
      await page.mouse.move(cx - 40 * s, cy - 35 * s)
      await page.mouse.down()
      await page.mouse.move(cx + 40 * s, cy + 35 * s, { steps: 8 })
      await page.mouse.up()
    }
    // dos rectángulos solapados
    await typeCmd(page, 'RECTANGLE', '-30,-25', '#5,25')
    await typeCmd(page, 'RECTANGLE', '-5,-25', '#30,25')
    // seleccionar ambos por ventana y extruir
    await dragWindow()
    await typeCmd(page, 'EXTRUDE', '20')
    await expect(page.locator('.cmd-output')).toContainText('Extruded 2')
    // seleccionar ambos sólidos por ventana y unir
    await dragWindow()
    await typeCmd(page, 'UNION')
    await expect(page.locator('.cmd-output')).toContainText('Union of 2 solids.')
  })

  test('VIEW command sets a named view (keeps the projection)', async ({ page }) => {
    await typeCmd(page, 'VIEW', 'Iso')
    await expect(page.getByTestId('viewcube-label')).toHaveText('ISO')
    await expect(page.getByTestId('proj-toggle')).toHaveText('Ortho')
  })
})

test.describe('Cota 3D: a typed point in "Select objects"', () => {
  test('picks the solid AT that point, not the one in front of it in the view (2020-profile frame, SWISO)', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    // Chasis de perfiles 20×20: base, parantes y marco superior (los largueros de arriba van entre las esquinas).
    const boxes = [
      ['0,0,0', '20,440,0', '20'],
      ['400,0,0', '420,440,0', '20'],
      ['20,0,0', '400,20,0', '20'],
      ['20,420,0', '400,440,0', '20'],
      ['0,0,20', '20,20,20', '420'],
      ['400,0,20', '420,20,20', '420'],
      ['0,420,20', '20,440,20', '420'],
      ['400,420,20', '420,440,20', '420'],
      ['0,20,440', '20,420,440', '20'],
      ['400,20,440', '420,420,440', '20'],
      ['0,0,440', '420,20,440', '20'],
      ['0,420,440', '420,440,440', '20'],
    ]
    for (const b of boxes) await typeCmd(page, 'BOX', ...b)
    const ids = (await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: Array<{ id: string; type: string; props: { origin: number[] } }> } } } }
      return w.__cotaStore.getState().doc.entities.filter((e) => e.type === 'SOLID3D').map((e) => e.id)
    })) as string[]
    expect(ids).toHaveLength(12)
    await typeCmd(page, 'VIEW', 'SWISO', 'UCS', 'W', 'ZOOM', 'E')
    // (3,100,20): cara superior del perfil base izquierdo (X 0–20, Y 0–440, Z 0–20); el travesaño de arriba, a 420 mm.
    await typeCmd(page, 'LIST', '3,100,20', '')
    await expect(page.locator('.cmd-output')).toContainText(`Handle = ${ids[0]}`)
    await expect(page.locator('.cmd-output')).not.toContainText(`Handle = ${ids[8]}`)
    await typeCmd(page, 'COPY', '3,100,20', '', '0,0,0', '0,0,100', '')
    const copy = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: Array<{ type: string; props: { origin: number[]; depth: number } }> } } } }
      const s = w.__cotaStore.getState().doc.entities.filter((e) => e.type === 'SOLID3D')
      return s.length === 13 ? { origin: s[12].props.origin, depth: s[12].props.depth } : null
    })
    expect(copy).toEqual({ origin: [0, 0, 100], depth: 440 })
    // En el aire, dentro del marco: nada.
    await typeCmd(page, 'LIST', '200,200,200')
    await expect(page.locator('.cmd-output')).toContainText('0 found: no object at that point.')
  })
})
