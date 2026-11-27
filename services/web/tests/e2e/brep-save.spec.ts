import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

/**
 * Guardar sólidos en DWG/DXF como sólidos ACIS y volver a abrirlos (con el DWG de ejemplo público
 * `__fixtures__/acadsharp/sample_AC1032.dwg`, que trae un cubo de 5 de (15.2767…, -223.3501…, 0) a (20.2767…, -218.3501…, 5)):
 * el cubo con un agujero (calculado por el núcleo) vuelve con su volumen, como sólido y no como caras sueltas.
 */
const DWG = readFileSync(new URL('../../src/core/io/__fixtures__/acadsharp/sample_AC1032.dwg', import.meta.url))
const LO = [15.27672546982376, -223.35012266071593, 0]
const C = [17.7767, -220.8501]

const st = <T>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function cmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(40)
  }
}

/** Abre un DWG/DXF y convierte sus sólidos (diálogo de sólidos: «convertir todos»). */
async function open(page: Page, name: string, buffer: Buffer) {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
  await cmd(page, 'SOLIDIDLE', '0')
  const chooser = page.waitForEvent('filechooser')
  await cmd(page, 'OPEN')
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer })
  await page.getByTestId('solid-import-convert').click({ timeout: 30_000 })
  await expect(page.locator('.cmd-output')).toContainText(/imported piece\(s\) converted/, { timeout: 60_000 })
}

/** EXPORT en un formato: el archivo que se descarga. */
async function exportAs(page: Page, format: 'DWG' | 'DXF'): Promise<Buffer> {
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await cmd(page, 'EXPORT', format)
  const d = await download
  return readFileSync((await d.path())!)
}

/** Sólidos del dibujo: cuántos son piezas con modelo ACIS (hoja BREP) y cuántas mallas (caras sueltas). */
const counts = (page: Page) =>
  st<{ breps: number; meshes: number }>(
    page,
    `const es = s.doc.entities; return { breps: es.filter((e) => e.type === 'SOLID3D' && e.props.op === 'BREP').length, meshes: es.filter((e) => e.type === 'MESH3D').length }`,
  )

test.describe('guardar sólidos en DWG/DXF', () => {
  for (const format of ['DWG', 'DXF'] as const)
    test(`${format}: el cubo con un agujero vuelve como sólido, con su volumen`, async ({ page }) => {
      await open(page, 'muestra.dwg', DWG)
      await cmd(page, 'CYLINDER', `#${C[0]},${C[1]},-1`, '1', '7')
      await cmd(page, 'SUBTRACT', `#${LO[0] + 0.5},${LO[1] + 0.5},5`, '', `#${C[0] + 1},${C[1]},-0.5`, '')
      await expect(page.locator('.cmd-output')).toContainText('Subtracted 1 from 1.')
      const file = await exportAs(page, format)
      await expect(page.locator('.cmd-output')).toContainText('3 solid(s) written as ACIS solids.')
      // Otra sesión: abrir lo guardado.
      await open(page, `guardado.${format.toLowerCase()}`, file)
      expect((await counts(page)).breps).toBe(3)
      await cmd(page, 'MASSPROP', `#${LO[0] + 0.5},${LO[1] + 0.5},5`, '')
      await expect(page.locator('.cmd-output')).toContainText(/Volume:\s+109\.29/, { timeout: 30_000 })
    })

  test('SOLIDEXPORT 0: los sólidos van como sus caras, como antes', async ({ page }) => {
    await open(page, 'muestra.dwg', DWG)
    await cmd(page, 'SOLIDEXPORT', '0')
    const file = await exportAs(page, 'DWG')
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    const chooser = page.waitForEvent('filechooser')
    await cmd(page, 'OPEN')
    await (await chooser).setFiles({ name: 'caras.dwg', mimeType: 'application/octet-stream', buffer: file })
    await expect(page.locator('.cmd-output')).toContainText('Opened "caras.dwg"', { timeout: 30_000 })
    // Ningún sólido: sus caras, como mallas.
    expect(await st<number>(page, `return s.doc.entities.filter((e) => e.type === 'SOLID3D').length`)).toBe(0)
    expect((await counts(page)).meshes).toBeGreaterThan(0)
  })
})
