import { test, expect, type Page } from '@playwright/test'

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(30)
  }
}

type VpProps = { scale: number; target: number[]; locked: boolean }
type Snapshot = { tab: string; ms: string | null; model: number; paper: number; vps: { id: string; props: VpProps }[] }

/** Estado del documento relevante para el layout (pestaña, MSPACE, entidades y viewports). */
async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    type E = { id: string; type: string; props: VpProps }
    type VpProps = { scale: number; target: number[]; locked: boolean }
    const w = window as unknown as {
      __cotaStore: {
        getState: () => {
          doc: {
            activeTab: string
            msViewportId: string | null
            modelEntities: E[]
            layoutEntities: (id: string) => E[]
          }
        }
      }
    }
    const d = w.__cotaStore.getState().doc
    const paper = d.activeTab === 'MODEL' ? [] : d.layoutEntities(d.activeTab)
    return {
      tab: d.activeTab,
      ms: d.msViewportId,
      model: d.modelEntities.length,
      paper: paper.length,
      vps: paper.filter((e) => e.type === 'VIEWPORT').map((e) => ({ id: e.id, props: structuredClone(e.props) })),
    }
  })
}

async function box(page: Page, testId: string) {
  const b = await page.getByTestId(testId).boundingBox()
  if (!b) throw new Error(`sin caja: ${testId}`)
  return b
}

test.describe('Cota Layout: hoja y viewports flotantes', () => {
  let errors: string[] = []
  test.afterEach(() => expect(errors).toEqual([]))

  test.beforeEach(async ({ page }) => {
    errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    // El 401 de la sesión anónima (backend sin login) no es un error de la app.
    page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    // Modelo de 4000 × 3000 con un círculo en el centro (coordenadas relativas tras el 1er punto).
    await typeCmd(page, 'LINE', '0,0', '4000,0', '0,3000', '-4000,0', 'C', 'CIRCLE', '2000,1500', '800')
    await page.getByTestId('tab-Layout1').click()
    await expect(page.getByTestId('layout-sheet')).toBeVisible()
  })

  test('cota en el papel con snap sobre el modelo del viewport: mide el modelo (trans-espacial)', async ({ page }) => {
    const { vps } = await snap(page)
    const vp = await page.evaluate((id) => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { getEntity: (id: string) => { props: { center: number[]; width: number; height: number; target: number[]; scale: number } } } } } }
      return w.__cotaStore.getState().doc.getEntity(id).props
    }, vps[0].id)
    const host = await box(page, `layout-vp-${vps[0].id}`)
    const ppm = host.width / vp.width
    // Modelo → papel (vista en planta, unidades mm) → pantalla.
    const screen = (mx: number, my: number): [number, number] => {
      const X = vp.center[0] + (mx - vp.target[0]) * vp.scale
      const Y = vp.center[1] + (my - vp.target[1]) * vp.scale
      return [host.x + (X - (vp.center[0] - vp.width / 2)) * ppm, host.y + (vp.center[1] + vp.height / 2 - Y) * ppm]
    }
    await typeCmd(page, 'DIMLINEAR')
    for (const [mx, my] of [[0, 0], [4000, 0]]) {
      const [x, y] = screen(mx, my)
      await page.mouse.move(x + 4, y - 4)
      await page.mouse.move(x + 1, y - 1)
      await page.mouse.click(x + 1, y - 1)
    }
    const [lx, ly] = screen(2000, -400)
    await page.mouse.click(lx, ly)
    const d = await page.evaluate(() => {
      type D = { type: string; props: { points: number[][]; transScale?: number; assoc?: ({ vp?: string } | null)[] } }
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { activeTab: string; layoutEntities: (id: string) => D[] } } } }
      const doc = w.__cotaStore.getState().doc
      return doc.layoutEntities(doc.activeTab).find((e) => e.type === 'DIMENSION')!.props
    })
    expect(d.assoc?.every((r) => r?.vp === vps[0].id)).toBe(true)
    const paperLen = Math.hypot(d.points[1][0] - d.points[0][0], d.points[1][1] - d.points[0][1])
    expect(paperLen * (d.transScale ?? 1)).toBeCloseTo(4000, 3)
  })

  test('Layout1 muestra la hoja y un viewport a extensiones; el pan/zoom del papel no cambia su escala', async ({ page }) => {
    const s = await snap(page)
    expect(s.tab).toBe('L1')
    expect(s.vps).toHaveLength(1)
    const vp = s.vps[0]
    expect(vp.props.target[0]).toBeCloseTo(2000, 3)
    expect(vp.props.target[1]).toBeCloseTo(1500, 3)
    await expect(page.getByTestId(`layout-vp-${vp.id}`)).toBeVisible()

    const before = await box(page, 'layout-sheet')
    const host = await box(page, `layout-vp-${vp.id}`)
    await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2)
    await page.mouse.wheel(0, -300)
    await expect.poll(async () => (await box(page, 'layout-sheet')).width).toBeGreaterThan(before.width * 1.05)
    expect((await snap(page)).vps[0].props.scale).toBeCloseTo(vp.props.scale, 9)
  })

  test('doble clic entra a MSPACE: LINE dibuja en el modelo y la rueda cambia la escala; afuera vuelve a PSPACE', async ({ page }) => {
    const { vps } = await snap(page)
    const id = vps[0].id
    const host = await box(page, `layout-vp-${id}`)
    await page.mouse.dblclick(host.x + host.width * 0.2, host.y + host.height * 0.2)
    await expect(page.getByTestId(`layout-vp-${id}`)).toHaveClass(/active/)
    expect((await snap(page)).ms).toBe(id)

    await typeCmd(page, 'LINE')
    await page.mouse.click(host.x + host.width * 0.3, host.y + host.height * 0.6)
    await page.mouse.click(host.x + host.width * 0.7, host.y + host.height * 0.4)
    await typeCmd(page, '')
    const s = await snap(page)
    expect(s.model).toBe(3)
    expect(s.paper).toBe(3) // marco + rótulo + viewport

    const scale = s.vps[0].props.scale
    await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2)
    await page.mouse.wheel(0, -300)
    await expect.poll(async () => (await snap(page)).vps[0].props.scale).toBeGreaterThan(scale * 1.05)

    // Doble clic fuera de la hoja → papel.
    const view = await box(page, 'layout-view')
    await page.mouse.dblclick(view.x + 8, view.y + 8)
    await expect.poll(async () => (await snap(page)).ms).toBeNull()
    await expect(page.getByTestId(`layout-vp-${id}`)).not.toHaveClass(/active/)
  })

  test('con Display locked la rueda en MSPACE mueve el papel y no la escala', async ({ page }) => {
    const id = (await snap(page)).vps[0].id
    await page.evaluate((vpId) => {
      const w = window as unknown as {
        __cotaStore: { getState: () => { doc: { getEntity: (id: string) => { props: { locked: boolean } } }; viewportViewChanged: () => void } }
      }
      const st = w.__cotaStore.getState()
      st.doc.getEntity(vpId).props.locked = true
      st.viewportViewChanged()
    }, id)
    const host = await box(page, `layout-vp-${id}`)
    await page.mouse.dblclick(host.x + host.width * 0.2, host.y + host.height * 0.2)
    await expect(page.getByTestId(`layout-vp-${id}`)).toHaveClass(/active/)
    const scale = (await snap(page)).vps[0].props.scale
    const sheet = await box(page, 'layout-sheet')
    await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2)
    await page.mouse.wheel(0, -300)
    await expect.poll(async () => (await box(page, 'layout-sheet')).width).toBeGreaterThan(sheet.width * 1.05)
    expect((await snap(page)).vps[0].props.scale).toBeCloseTo(scale, 9)
  })

  test('MV con dos clics crea un viewport vivo; VPORTS 4 suma cuatro con vistas distintas', async ({ page }) => {
    const sheet = await box(page, 'layout-sheet')
    await typeCmd(page, 'MV')
    await page.mouse.click(sheet.x + sheet.width * 0.1, sheet.y + sheet.height * 0.1)
    await page.mouse.click(sheet.x + sheet.width * 0.3, sheet.y + sheet.height * 0.3)
    await expect.poll(async () => (await snap(page)).vps.length).toBe(2)
    const created = (await snap(page)).vps[1]
    const host = await box(page, `layout-vp-${created.id}`)
    expect(host.width).toBeGreaterThan(sheet.width * 0.18)
    expect(host.width).toBeLessThan(sheet.width * 0.22)

    await typeCmd(page, 'VPORTS', '4', '')
    await expect.poll(async () => (await snap(page)).vps.length).toBe(6)
    await expect(page.locator('.layout-vp-host')).toHaveCount(6)
  })

  test('barra de estado: MODEL/PAPER, escala y candado del viewport; Ctrl+R cicla viewports', async ({ page }) => {
    const toggle = page.getByTestId('space-toggle')
    await expect(toggle).toHaveText('PAPER')
    await expect(page.getByTestId('vp-scale')).toHaveCount(0) // en el papel sin selección no hay escala
    await toggle.click()
    await expect(toggle).toHaveText('MODEL')
    const [vp] = (await snap(page)).vps
    await expect(page.getByTestId(`layout-vp-${vp.id}`)).toHaveClass(/active/)

    await page.getByTestId('vp-scale').selectOption('1:50')
    await expect.poll(async () => (await snap(page)).vps[0].props.scale).toBeCloseTo(0.02, 9)
    await page.getByTestId('vp-lock').click()
    await expect.poll(async () => (await snap(page)).vps[0].props.locked).toBe(true)

    await typeCmd(page, 'VS', 'H')
    const style = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { msViewportId: string; getEntity: (id: string) => { props: { visualStyle: string } } } } } }
      const d = w.__cotaStore.getState().doc
      return d.getEntity(d.msViewportId).props.visualStyle
    })
    expect(style).toBe('hidden')

    await typeCmd(page, 'PS', 'MV', '#10,10', '60,60', 'MS')
    const ids = (await snap(page)).vps.map((v) => v.id)
    expect((await snap(page)).ms).toBe(ids[0])
    await page.keyboard.press('Control+r')
    await expect.poll(async () => (await snap(page)).ms).toBe(ids[1])
    await page.keyboard.press('Control+r')
    await expect.poll(async () => (await snap(page)).ms).toBe(ids[0])
    await toggle.click()
    await expect(toggle).toHaveText('PAPER')
  })

  test('VPMAX ocupa el área de dibujo y VPMIN restaura la vista del viewport', async ({ page }) => {
    const [vp] = (await snap(page)).vps
    await typeCmd(page, 'VPMAX')
    const host = page.getByTestId(`layout-vp-${vp.id}`)
    await expect(host).toHaveClass(/maximized/)
    const view = await box(page, 'layout-view')
    const max = await box(page, `layout-vp-${vp.id}`)
    expect(max.width).toBeCloseTo(view.width, 0)
    // Navegar maximizado no cambia la escala guardada.
    await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2)
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(100)
    expect((await snap(page)).vps[0].props.scale).toBeCloseTo(vp.props.scale, 9)
    await page.getByTestId('vpmin').click()
    await expect(host).not.toHaveClass(/maximized/)
    expect((await snap(page)).ms).toBeNull()
  })

  test('PLOT en el layout descarga la hoja A3 1:1 con el viewport recortado', async ({ page }) => {
    await typeCmd(page, 'PS')
    const [download] = await Promise.all([page.waitForEvent('download'), typeCmd(page, 'PLOT')])
    expect(download.suggestedFilename()).toBe('drawing1-Layout1.pdf')
    const path = await download.path()
    const { readFileSync } = await import('node:fs')
    const pdf = readFileSync(path, 'latin1')
    expect(pdf).toContain('/MediaBox [0 0 1190.551 841.89]') // 420 × 297 mm
    expect(pdf).toMatch(/h\nW n\n/) // recorte del viewport
    expect(pdf).toContain('0 0 0 RG') // color 7 en negro

    // PUBLISH: un PDF con una página por layout (criterio 10).
    await typeCmd(page, 'LO', 'N', 'Cortes')
    const [pub] = await Promise.all([page.waitForEvent('download'), typeCmd(page, 'PUBLISH', '')])
    expect(pub.suggestedFilename()).toBe('drawing1.pdf')
    const multi = readFileSync(await pub.path(), 'latin1')
    expect(multi).toContain('/Count 2')
    expect(multi).toContain('SHEET 2 OF 2') // el rótulo de Cortes evalúa su número de hoja
  })

  test('VPCLIP recorta el viewport en pantalla; VP Freeze en el Layer Manager congela la capa sólo en ese viewport', async ({ page }) => {
    const [vp] = (await snap(page)).vps
    await typeCmd(page, 'VPCLIP')
    const host = await box(page, `layout-vp-${vp.id}`)
    await page.mouse.click(host.x + host.width / 2, host.y + host.height / 2)
    await typeCmd(page, 'P', '#20,20', '#200,20', '#110,250', '')
    await expect(page.getByTestId(`layout-vp-${vp.id}`)).toHaveAttribute('style', /clip-path: polygon/)
    expect((await snap(page)).vps[0].props).toMatchObject({ width: 180, height: 230 })

    await typeCmd(page, 'MV', '#250,20', '#400,150', 'LAYER')
    await page.getByTestId('new-layer-input').fill('Ejes')
    await page.getByTestId('add-layer').click()
    await expect(page.getByTestId('layer-vpfreeze-Ejes')).toHaveCount(0) // en el papel no hay viewport actual
    await page.keyboard.press('Escape')
    await typeCmd(page, 'MS', 'LAYER')
    await page.getByTestId('layer-vpfreeze-Ejes').check()
    const frozen = (await snap(page)).vps.map((v) => (v.props as unknown as { frozenLayers: string[] }).frozenLayers.length)
    expect(frozen).toEqual([1, 0])
  })

  test('rótulo IRAM: doble clic abre el editor de atributos; DWGPROPS alimenta los campos', async ({ page }) => {
    const sheet = await box(page, 'layout-sheet')
    // Doble clic sobre el rótulo (abajo a la derecha): el texto "TITLE" está en (244, 37) mm del papel.
    const pxPerMm = sheet.width / 420
    await page.mouse.dblclick(sheet.x + 244 * pxPerMm, sheet.y + sheet.height - 37 * pxPerMm)
    await expect(page.getByTestId('att-dialog')).toBeVisible()
    await page.getByTestId('att-value-TITLE').fill('Planta baja')
    await page.getByTestId('att-ok').click()
    await expect(page.getByTestId('att-dialog')).toHaveCount(0)
    await expect(page.getByTestId('layout-view')).toContainText('Planta baja')
    await expect(page.getByTestId('layout-view')).toContainText('SHEET 1 OF 1')

    await typeCmd(page, 'DWGPROPS')
    await page.getByTestId('dwgprops-title').fill('Casa Orengia')
    await page.getByTestId('dwgprops-ok').click()
    await typeCmd(page, 'FIELD', 'Title', '#20,280', '5', '0')
    await expect(page.getByTestId('layout-view')).toContainText('Casa Orengia')
  })

  test('PAGESETUP cambia el papel sin mover entidades', async ({ page }) => {
    const before = await box(page, 'layout-sheet')
    await typeCmd(page, 'PAGESETUP')
    await page.getByTestId('pagesetup-paper').selectOption('A4')
    await page.getByTestId('pagesetup-orientation').selectOption('portrait')
    await page.getByTestId('pagesetup-ok').click()
    await expect.poll(async () => {
      const b = await box(page, 'layout-sheet')
      return Math.round((b.width / b.height) * 100) / 100
    }).toBe(Math.round((210 / 297) * 100) / 100)
    expect(before.width / before.height).toBeCloseTo(420 / 297, 2)
    const vp = (await snap(page)).vps[0].props as unknown as { center: number[] }
    expect(vp.center).toEqual([210, 171.5, 0]) // la hoja cambió, el viewport no se movió
  })

  test('guardar como plantilla, crear desde plantilla y plantilla predeterminada para "+" (criterios 8 y 14)', async ({ page }) => {
    // Rótulo propio: se completa el título y se guarda Layout1 como plantilla (biblioteca del navegador).
    await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { activeLayout: { entities: { type: string; props: { attributes?: { tag: string; value: string }[] } }[] } } } } }
      const ins = w.__cotaStore.getState().doc.activeLayout.entities.find((e) => e.type === 'INSERT')!
      ins.props.attributes!.find((a) => a.tag === 'COMPANY')!.value = 'Estudio propio'
    })
    await page.getByTestId('tab-Layout1').click({ button: 'right' })
    await page.getByTestId('layout-save-template').click()
    await page.getByTestId('template-name').fill('Mi hoja')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('template-ok').click()])
    expect(download.suggestedFilename()).toBe('Mi hoja.cotat')

    await page.getByTestId('tab-Layout1').click({ button: 'right' })
    await page.getByTestId('layout-from-template').click()
    await page.getByTestId('template-Mi hoja').check()
    await page.getByTestId('template-ok').click()
    await expect(page.getByTestId('tab-Mi hoja')).toBeVisible()

    // Plantilla predeterminada: A4 vertical incluida → el "+" nace en A4 con rótulo.
    await typeCmd(page, 'OPTIONS')
    await page.getByTestId('options-tab-files').click()
    await page.getByTestId('default-template').selectOption('builtin:A4P')
    await page.keyboard.press('Escape') // Esc cierra el diálogo
    await expect(page.getByTestId('options-dialog')).toHaveCount(0)
    await page.getByTestId('tab-add').click()
    await page.getByTestId('tab-Layout3').click() // Layout1, Mi hoja, Layout3
    const sheet = await box(page, 'layout-sheet')
    expect(sheet.width / sheet.height).toBeCloseTo(210 / 297, 2)
    const types = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { activeLayout: { entities: { type: string }[] } } } } }
      return w.__cotaStore.getState().doc.activeLayout.entities.map((e) => e.type)
    })
    expect(types).toEqual(['RECTANGLE', 'INSERT', 'VIEWPORT'])

    // La plantilla guardada como predeterminada: NEW → Layout1 nace con ese rótulo.
    await typeCmd(page, 'OPTIONS')
    await page.getByTestId('options-tab-files').click()
    await page.getByTestId('default-template').selectOption('library:Mi hoja')
    await page.getByTestId('options-dialog').click({ position: { x: 5, y: 5 } })
    await page.evaluate(() => (window as unknown as { __cotaStore: { getState: () => { newDocument: () => void } } }).__cotaStore.getState().newDocument())
    await page.getByTestId('tab-Layout1').click()
    await expect(page.getByTestId('layout-view')).toContainText('Estudio propio')
  })

  test('volver a Model conserva la vista del panel', async ({ page }) => {
    await page.getByTestId('tab-Model').click()
    await expect(page.getByTestId('layout-view')).toHaveCount(0)
    const pane = page.getByTestId('viewport-pane-1-0')
    const b = await pane.boundingBox()
    if (!b) throw new Error('sin panel')
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.wheel(0, -500)
    await page.waitForTimeout(100)
    const cam = () =>
      page.evaluate(() => {
        const w = window as unknown as { __cotaStore: { getState: () => { activeViewport: { getCamera: () => { radius: number } } } } }
        return w.__cotaStore.getState().activeViewport.getCamera().radius
      })
    const radius = await cam()
    await page.getByTestId('tab-Layout1').click()
    await expect(page.getByTestId('layout-sheet')).toBeVisible()
    await page.getByTestId('tab-Model').click()
    await expect(pane).toBeVisible()
    expect(await cam()).toBeCloseTo(radius, 6)
  })
})
