import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { DRAWING_EXT } from '../../src/core/io/paths'

/**
 * Sólidos de un DWG como sólidos exactos: al abrir el ejemplo público `__fixtures__/acadsharp/sample_AC1032.dwg` (un
 * cubo de 5 y otras dos piezas ACIS) se pregunta si se convierten todos o quedan como mallas; en modo mallas una pieza
 * se convierte al seleccionarla, y una pieza importada se resta y se empalma como cualquier sólido.
 */
const DWG = readFileSync(new URL('../../src/core/io/__fixtures__/acadsharp/sample_AC1032.dwg', import.meta.url))

const st = <T>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(30)
  }
}

async function openSample(page: Page) {
  await page.goto('/')
  const input = page.getByTestId('command-input')
  await expect(input).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await input.fill('OPEN')
  await page.keyboard.press('Enter')
  await (await chooser).setFiles({ name: 'muestra.dwg', mimeType: 'application/octet-stream', buffer: DWG })
}

/** El cubo de 5 importado (su id y la clave de su árbol en el núcleo). */
const CUBE = `const e = s.doc.entities.find((x) => x.type === 'SOLID3D' && x.props.op === 'BREP' && Math.abs(x.props.box[1][2] - x.props.box[0][2] - 5) < 1e-6 && Math.abs(x.props.box[1][0] - x.props.box[0][0] - 5) < 1e-6)
  return e ? { id: e.id, key: JSON.stringify(e.props) } : null`

const kernelOk = (page: Page, key: string) => page.evaluate((k) => (window as any).__cotaSolids.kernelResult(k)?.ok ?? null, key)

test.describe('sólidos de un DWG como sólidos exactos', () => {
  test('modo mallas: las piezas entran como sólidos importados y una se convierte al seleccionarla', async ({ page }) => {
    await openSample(page)
    const dialog = page.getByTestId('solid-import-dialog')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toContainText('3 3D solid(s)')
    await page.getByTestId('solid-import-remember').check()
    await page.getByTestId('solid-import-meshes').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.cmd-output')).toContainText('Imported solids open as meshes')
    const breps = await st<number>(page, `return s.doc.entities.filter((e) => e.type === 'SOLID3D' && e.props.op === 'BREP').length`)
    expect(breps).toBe(3)
    const cube = (await st<{ id: string; key: string } | null>(page, CUBE))!
    expect(cube).not.toBeNull()
    // Sin seleccionarla no va al núcleo exacto.
    await page.waitForTimeout(500)
    expect(await kernelOk(page, cube.key)).toBeNull()
    await page.evaluate((id) => (window as any).__cotaStore.setState({ selection: [id] }), cube.id)
    await expect.poll(() => kernelOk(page, cube.key), { timeout: 30_000 }).toBe(true)
    // «No volver a preguntar» quedó en SOLIDIMPORT.
    await typeCmd(page, 'SOLIDIMPORT')
    await expect.poll(() => st<string>(page, 'return s.prompt')).toContain('SOLIDIMPORT [0/1/2] <2>')
  })

  test('conversión completa; restar un cilindro a una pieza importada y empalmar una de sus aristas', async ({ page }) => {
    await openSample(page)
    await expect(page.getByTestId('solid-import-dialog')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('solid-import-convert').click()
    await expect(page.locator('.cmd-output')).toContainText(/\d of 3 imported piece\(s\) converted to exact solids/, { timeout: 60_000 })
    await expect(page.getByTestId('solid-convert-bar')).toHaveCount(0)
    const cube = (await st<{ id: string; key: string } | null>(page, CUBE))!
    expect(await kernelOk(page, cube.key)).toBe(true)
    // El cubo va de (15.2767, -223.3501, 0) a (20.2767, -218.3501, 5): un agujero de radio 1 en el centro.
    await typeCmd(page, 'CYLINDER', '#17.7767,-220.8501,-1', '1', '7')
    await typeCmd(page, 'SUBTRACT', '#16,-222,5', '', '#18.7767,-220.8501,-0.5', '')
    await expect(page.locator('.cmd-output')).toContainText('Subtracted 1 from 1.')
    await typeCmd(page, 'MASSPROP', '#16,-222,5', '')
    // 125 − π·1²·5
    await expect(page.locator('.cmd-output')).toContainText(/Volume:\s+109\.29/, { timeout: 30_000 })
    await typeCmd(page, 'FILLETEDGE', 'R', '0.5', '#17.7767,-223.3501,5', '')
    await expect(page.locator('.cmd-output')).toContainText('1 edge(s) selected for fillet.')
    await typeCmd(page, '')
    const op = await st<string>(page, `return s.doc.entities.find((e) => e.type === 'SOLID3D' && e.props.op !== 'BREP' && e.props.op !== 'CYLINDER')?.props.op`)
    expect(op).toBe('FILLETEDGE')
    await typeCmd(page, 'MASSPROP', '#16,-222,5', '')
    // Menos el empalme de la arista de 5: (1 − π/4)·0,5²·5 = 0,268
    await expect(page.locator('.cmd-output')).toContainText(/Volume:\s+109\.02/, { timeout: 30_000 })
  })
  test('guardar y volver a abrir: los modelos van en el archivo y la malla de cada pieza se arma aparte', async ({ page }) => {
    await openSample(page)
    await page.getByTestId('solid-import-meshes').click({ timeout: 30_000 })
    const saved = await st<string>(page, 'return JSON.stringify(s.doc.toFileJSON())')
    const data = JSON.parse(saved) as { breps?: Record<string, { fmt: string; data: string }>; entities: Array<{ type: string; props: { op?: string; ref?: string } }> }
    const refs = data.entities.filter((e) => e.type === 'SOLID3D' && e.props.op === 'BREP').map((e) => e.props.ref!)
    expect(refs).toHaveLength(3)
    expect(Object.keys(data.breps ?? {}).sort()).toEqual([...new Set(refs)].sort())
    // Otra sesión: el registro empieza vacío y lo que se dibuja de cada pieza se arma en el hilo aparte.
    await page.reload()
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    const chooser = page.waitForEvent('filechooser')
    await input.fill('OPEN')
    await page.keyboard.press('Enter')
    await (await chooser).setFiles({ name: `muestra${DRAWING_EXT}`, mimeType: 'application/json', buffer: Buffer.from(saved) })
    await expect(page.locator('.cmd-output')).toContainText('from the device', { timeout: 30_000 })
    await expect
      .poll(
        () =>
          page.evaluate(
            async ([rs, url]) => {
              // El módulo de la app tal como lo sirve el servidor de desarrollo (el mismo registro de la sesión).
              const m = (await import(/* @vite-ignore */ url)) as { brepDisplay: (r: string) => unknown }
              return rs.filter((r) => m.brepDisplay(r)).length
            },
            [refs, '/src/core/document/brepStore.ts'] as const,
          ),
        { timeout: 30_000 },
      )
      .toBe(3)
  })
})
