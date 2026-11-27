import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { OcctKernel } from 'occt-wasm'

/**
 * STEP exacto: un ensamble (armado acá con el núcleo: una caja repetida y un eje, con nombres y un color) se abre con
 * su árbol (un bloque por pieza) y sus piezas exactas, sin el diálogo de conversión; una pieza explotada se edita con
 * el núcleo (una resta) y EXPORT STEP la vuelve a escribir exacta.
 */
const st = <T>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function cmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(40)
  }
}

const out = (page: Page) => page.locator('.cmd-output')

let step = ''
test.beforeAll(async () => {
  const k = await OcctKernel.init()
  const doc = k.createXCAFDocument()
  const root = doc.addShape(k.makeCompound([]), { name: 'Maquina' })
  const caja = k.makeBox(10, 20, 30)
  doc.addChild(root, caja, { name: 'Caja', color: [1, 0, 0] })
  doc.addChild(root, caja, { name: 'Caja', location: { tx: 100 } })
  doc.addChild(root, k.makeCylinder(3, 40), { name: 'Eje', location: { tx: 50, ty: 10 } })
  step = doc.exportSTEP()
  doc.close()
})

async function openFile(page: Page, name: string, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser')
  await cmd(page, 'OPEN')
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer })
}

test('OPEN de un STEP: bloques con sus nombres y piezas exactas; una resta y EXPORT STEP la guardan exacta', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
  await cmd(page, 'SOLIDIDLE', '0')
  await openFile(page, 'maquina.step', Buffer.from(step))
  await expect(out(page)).toContainText('Opened "maquina.step" from the device (3 exact solid(s), with 2 block(s) for its parts and assemblies).', { timeout: 60_000 })
  // Sin diálogo de conversión: el núcleo lee las piezas directo.
  await expect(page.getByTestId('solid-import-convert')).toHaveCount(0)
  expect(await st(page, `return [s.doc.entities.map((e) => e.props.name).sort(), s.doc.blocks.map((b) => b.name).sort()]`)).toEqual([
    ['Caja', 'Caja', 'Eje'],
    ['Caja', 'Eje'],
  ])
  // El color de la pieza va en la inserción o en su sólido.
  expect(
    await st<number>(
      page,
      `return s.doc.entities.filter((e) => e.color === '#ff0000').length + s.doc.blocks.flatMap((b) => b.entities).filter((e) => e.color === '#ff0000').length`,
    ),
  ).toBe(1)

  // La caja del origen, explotada, es una pieza suelta: se le resta un cilindro.
  await cmd(page, 'EXPLODE', '#1,1,30', '')
  expect(await st<number>(page, `return s.doc.entities.filter((e) => e.type === 'SOLID3D' && e.props.op === 'BREP').length`)).toBe(1)
  await cmd(page, 'CYLINDER', '#5,10,-1', '2', '40')
  await cmd(page, 'SUBTRACT', '#1,1,30', '', '#7,10,-0.5', '')
  await expect(out(page)).toContainText('Subtracted 1 from 1.')
  await cmd(page, 'MASSPROP', '#1,1,30', '')
  const volume = (6000 - Math.PI * 4 * 30).toFixed(4) // exacto: 5623.0089
  await expect(out(page)).toContainText(new RegExp(`Volume:\\s+${volume.replace('.', '\\.')}`), { timeout: 30_000 })

  // EXPORT STEP: las tres piezas, exactas, con sus nombres.
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await cmd(page, 'EXPORT', 'STEP')
  const file = readFileSync((await (await download).path())!)
  await expect(out(page)).toContainText('<Exported "maquina.step">3 solid(s) written as exact STEP solids.')
  expect(file.toString('latin1')).toContain("PRODUCT('Caja'")

  await openFile(page, 'guardado.step', file)
  await expect(page.locator('.cmd-prompt')).toHaveText('Save changes to maquina.step? [Yes/No] <Yes>:')
  await cmd(page, 'N')
  await expect(out(page)).toContainText('Opened "guardado.step" from the device (3 exact solid(s), with 3 block(s) for its parts and assemblies).', { timeout: 60_000 })
  expect(await st(page, `return s.doc.blocks.map((b) => b.name).sort()`)).toEqual(['Caja', 'Eje', 'Solid 1'])
  await cmd(page, 'EXPLODE', '#1,1,30', '')
  await cmd(page, 'MASSPROP', '#1,1,30', '')
  await expect(out(page).locator('text=/Volume:/').last()).toContainText(volume, { timeout: 30_000 })

  // Guardado (como lo serializa SAVE) y vuelto a abrir: las piezas del STEP, sin lo que se dibujaba de la lectura, las
  // muestra el núcleo.
  const saved = await st<string>(page, 'return JSON.stringify(s.doc.toFileJSON())')
  expect(Object.values(JSON.parse(saved).breps).map((b: any) => b.fmt)).toEqual(['brep', 'brep', 'brep'])
  await openFile(page, 'maquina.cota', Buffer.from(saved))
  await expect(page.locator('.cmd-prompt')).toHaveText('Save changes to guardado.step? [Yes/No] <Yes>:')
  await cmd(page, 'N')
  await expect(out(page)).toContainText('Opened "maquina.cota" from the device.', { timeout: 30_000 })
  await expect(page.getByTestId('solid-import-convert')).toHaveCount(0)
  await cmd(page, 'MASSPROP', '#1,1,30', '')
  await expect(out(page).locator('text=/Volume:/').last()).toContainText(volume, { timeout: 30_000 })
})

test('IMPORT de un STEP: como objetos en la capa actual (con sus bloques) o todo en un bloque', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
  await cmd(page, '-LAYER', 'M', 'Piezas', '')
  const pick = async () => {
    const chooser = page.waitForEvent('filechooser')
    await cmd(page, 'IMPORT')
    await (await chooser).setFiles({ name: 'maquina.step', mimeType: 'application/octet-stream', buffer: Buffer.from(step) })
    await expect(page.locator('.cmd-prompt')).toHaveText('Import "maquina.step" as [Objects/Block] <Objects>:', { timeout: 60_000 })
  }
  await pick()
  await cmd(page, '')
  await expect(out(page)).toContainText('Imported 3 exact solid(s), with 2 block(s) for its parts and assemblies from STEP.')
  expect(await st(page, `const l = s.doc.layers.find((x) => x.name === 'Piezas').id; return s.doc.entities.map((e) => [e.type, e.layer === l])`)).toEqual([
    ['INSERT', true],
    ['INSERT', true],
    ['INSERT', true],
  ])
  await pick()
  await cmd(page, 'B', 'MAQ')
  await expect(out(page)).toContainText('from STEP in block "MAQ", inserted at 0,0,0.')
  expect(await st(page, `return [s.doc.blocks.map((b) => b.name).sort(), s.doc.getBlock('MAQ').entities.length, s.doc.entities.length]`)).toEqual([
    ['Caja', 'Caja (2)', 'Eje', 'Eje (2)', 'MAQ'],
    3,
    4,
  ])
})
