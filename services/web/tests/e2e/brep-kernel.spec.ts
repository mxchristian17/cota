import { readFileSync } from 'node:fs'
import { DwgReader, ModelerGeometry } from '@node-projects/acad-ts'
import { test, expect, type Page } from '@playwright/test'

/**
 * Sólidos importados como sólidos exactos (hoja BREP): el modelo ACIS de un 3DSOLID de un ejemplo público
 * (`__fixtures__/acadsharp/sample_AC1032.dwg`, un cubo de 5) viaja con el pedido al Worker del núcleo exacto, que lo
 * traduce y lo lee con OpenCascade en el navegador.
 */
function sampleSolid(): { b64: string; box: number[][] } {
  const b = readFileSync(new URL('../../src/core/io/__fixtures__/acadsharp/sample_AC1032.dwg', import.meta.url))
  const doc = DwgReader.readFromStream(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, null)
  for (const br of doc.blockRecords ?? [])
    for (const e of br.entities)
      if (e instanceof ModelerGeometry && e.constructor.name === 'Solid3D' && e.acisData?.length) {
        const data = e.acisData as unknown as Uint8Array
        // Su caja (la del cubo de 5 en z ∈ [0, 5]).
        return { b64: Buffer.from(data).toString('base64'), box: [[15.27672546982376, -223.35012266071593, 0], [20.27672546982376, -218.35012266071593, 5]] }
      }
  throw new Error('sin sólido en el ejemplo')
}

async function store<T>(page: Page, body: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    ([b, a]) => {
      const s = (window as unknown as { __cotaStore: { getState: () => unknown } }).__cotaStore.getState()
      return new Function('s', 'arg', b as string)(s, a) as T
    },
    [body, arg] as const,
  )
}

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(30)
  }
}

const ADD = `
  const bin = atob(arg.b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ref = s.doc.addBrep(bytes, 'sab')
  const e = s.doc.addEntity({ type: 'SOLID3D', layer: s.doc.firstLayerId, props: { op: 'BREP', ref, box: arg.box, ...(arg.m ? { m: arg.m } : {}) } })
  s.doc.touch()
  return e.id`

test.describe('sólidos importados exactos (hoja BREP)', () => {
  test('el núcleo exacto lee el modelo en el navegador: MASSPROP da el volumen del cubo', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    const sample = sampleSolid()
    await store(page, ADD, sample)
    await typeCmd(page, 'ZOOM', 'E', 'MASSPROP', 'ALL', '')
    await expect(page.locator('.cmd-output')).toContainText(/Volume:\s+125(\.0+)?\b/, { timeout: 30_000 })
  })

  test('el Worker recibe y traduce el modelo: una escala distinta por eje se avisa (y queda la malla)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    // Esta comprobación del núcleo va después de leer el modelo: el aviso confirma que el modelo llegó y se leyó.
    const id = await store<string>(page, ADD, { ...sampleSolid(), m: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] })
    await typeCmd(page, 'ZOOM', 'E')
    // Sola, una pieza importada va al núcleo al seleccionarla (modo mallas).
    await page.evaluate((x) => (window as unknown as { __cotaStore: { setState: (p: object) => void } }).__cotaStore.setState({ selection: [x] }), id)
    await expect(page.locator('.cmd-output')).toContainText('Imported solid: an imported solid cannot be scaled differently on each axis', { timeout: 30_000 })
  })
})
