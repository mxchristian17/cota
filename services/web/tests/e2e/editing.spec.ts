import { test, expect, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
  }
}

// Dibuja un rectángulo world (-30,-30)-(30,30) y hace click en el borde superior (world y=30).
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

async function drawAndClickRectEdge(page: Page) {
  await typeCmd(page, 'RECTANGLE', '-30,-30', '#30,30')
  // El clic va recién cuando el comando terminó y el canvas no se mueve más.
  await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
  const box = await stableCanvasBox(page)
  if (!box) throw new Error('no canvas')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const pxPerWorldY = box.height / 200 // frustumHalf=100 => extent vertical = 200
  await page.mouse.click(cx, cy - 30 * pxPerWorldY) // borde superior
}

test.describe('Cota editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // La paleta de Propiedades arranca minimizada: estas pruebas miran su contenido.
    await page.waitForFunction(() => !!(window as any).__cotaStore)
    await page.evaluate(() => (window as any).__cotaStore.getState().setPropsPalette({ minimized: false }))
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('draws PLINE / RECTANGLE / SPLINE and returns to Command prompt', async ({ page }) => {
    await typeCmd(page, 'PLINE', '0,0', '10,0', '10,10', 'Close')
    await typeCmd(page, 'RECTANGLE', '20,0', '40,15')
    await typeCmd(page, 'SPLINE', '0,20', '10,30', '20,20', '')
    await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
  })

  test('clicking an object selects it and shows its properties', async ({ page }) => {
    await drawAndClickRectEdge(page)
    await expect(page.getByTestId('properties')).toContainText('RECTANGLE')
  })

  test('ERASE removes the selected object', async ({ page }) => {
    await drawAndClickRectEdge(page)
    await expect(page.getByTestId('properties')).toContainText('RECTANGLE')
    await typeCmd(page, 'ERASE', '') // usa la selección actual, Enter confirma
    await expect(page.locator('.cmd-output')).toContainText('Erased')
  })

  test('direct distance entry: type a length in the cursor direction', async ({ page }) => {
    await typeCmd(page, 'LINE', '0,0')
    const box = await page.locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    // mueve el cursor a la derecha del centro para marcar dirección +X
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2)
    await typeCmd(page, '40', '')
    await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
  })

  test('window selection selects enclosed objects', async ({ page }) => {
    await typeCmd(page, 'RECTANGLE', '-40,-20', '#-10,10')
    await typeCmd(page, 'RECTANGLE', '10,-20', '#40,10')
    const box = await page.locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const s = box.height / 200 // px por unidad de mundo (vista ortográfica top)
    // ventana izquierda->derecha que encierra ambos rectángulos
    await page.mouse.move(cx - 55 * s, cy - 35 * s)
    await page.mouse.down()
    await page.mouse.move(cx + 55 * s, cy + 35 * s, { steps: 8 })
    await page.mouse.up()
    await expect(page.getByText('2 objects selected.')).toBeVisible()
  })

  test('UNDO and REDO report in the command line', async ({ page }) => {
    await typeCmd(page, 'LINE', '0,0', '50,0', '')
    await typeCmd(page, 'UNDO')
    await expect(page.locator('.cmd-output')).toContainText('Undo.')
    await typeCmd(page, 'REDO')
    await expect(page.locator('.cmd-output')).toContainText('Redo.')
  })

  test('EXTRUDE dos veces: el prompt ofrece la altura anterior y Enter la repite', async ({ page }) => {
    const solids = () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __cotaStore: { getState: () => { doc: { entities: { type: string; props: { height?: number } }[] } } }
        }
        return w.__cotaStore.getState().doc.entities.filter((e) => e.type === 'SOLID3D').map((e) => e.props.height)
      })
    await typeCmd(page, 'RECTANGLE', '0,0', '#10,10')
    await typeCmd(page, 'RECTANGLE', '20,0', '#30,10')
    // Vista TOP: el centro del canvas es el origen y el extent vertical es 200.
    const box = await page.locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    const s = box.height / 200
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await typeCmd(page, 'EXTRUDE')
    await page.mouse.click(cx + 5 * s, cy) // borde inferior y = 0 del primero (x = 5)
    await typeCmd(page, '', '25')
    await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
    await typeCmd(page, 'EXTRUDE')
    await page.mouse.click(cx + 25 * s, cy) // borde inferior del segundo (x = 25)
    await typeCmd(page, '')
    await expect(page.locator('.cmd-prompt')).toContainText('Specify height of extrusion or [Direction/Path/Taper angle] <25.0000>:')
    await typeCmd(page, '')
    await expect.poll(solids).toEqual([25, 25])
  })
})


test('ventana con dos clics (como el CAD clásico): un clic en vacío la abre y el siguiente la cierra', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
  await page.evaluate(() => (window as any)[Object.keys(window).find((k) => /^__\w+Store$/.test(k))!].getState().setPropsPalette({ minimized: false }))
  const input = page.getByTestId('command-input')
  for (const s of ['RECTANGLE', '-10,-10', '#10,10']) { await input.fill(s); await input.press('Enter') }
  await expect(page.locator('.cmd-prompt')).toHaveText('Command:')
  await page.waitForTimeout(400)
  const box = (await page.locator('canvas').first().boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const s = box.height / 200
  await page.mouse.click(cx - 40 * s, cy - 40 * s) // vacío: abre la ventana
  await page.mouse.click(cx + 40 * s, cy + 40 * s) // esquina opuesta: selecciona lo que encierra
  await expect(page.getByTestId('properties')).toContainText('RECTANGLE')
})
