import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { boxStep, boxStl } from './support/models'

/**
 * Traer componentes 3D a un ensamble abierto: IMPORT de STEP/STL (B04), copiar y pegar bloques entre dibujos con sus
 * definiciones (B27) y entre pestañas del navegador (B05). Los modelos son sintéticos (ver `support/models`).
 */

const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function cmd(page: Page, ...steps: string[]) {
  const i = page.getByTestId('command-input')
  for (const s of steps) {
    await i.fill(s)
    await i.press('Enter')
  }
}

const out = (page: Page) => page.locator('.cmd-output')
const prompt = (page: Page) => page.locator('.cmd-prompt')

/** Un comando que abre el selector de archivos del sistema, y el archivo elegido. */
async function choose(page: Page, command: string, name: string, text: string) {
  const chooser = page.waitForEvent('filechooser')
  await cmd(page, command)
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) })
}

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
}

/** Un `.cota` de ensamble: una línea (el bastidor) en su capa. */
async function assemblyFile(page: Page): Promise<string> {
  return st<string>(
    page,
    `const d = s.doc.toJSON()
     d.layers.push({ id: 'L1', name: 'Frame', color: '#00ff00', lineWeight: 0.25, lineType: 'CONTINUOUS', locked: false, visible: true, printable: true })
     d.entities = [{ id: 'e1', type: 'LINE', layer: 'L1', props: { start: [0, 0, 0], end: [400, 0, 0] } }]
     return JSON.stringify(d)`,
  )
}

test.describe('IMPORT de modelos 3D al dibujo abierto (B04)', () => {
  test('IMPORT acepta STEP y STL: como objetos en sus coordenadas, o como bloque para insertarlo varias veces', async ({ page }) => {
    await ready(page)
    await cmd(page, 'LINE', '#0,0', '#400,0', '')
    const fc = page.waitForEvent('filechooser')
    await cmd(page, 'IMPORT')
    const accept = await (await fc).element().getAttribute('accept')
    for (const ext of ['.step', '.stp', '.iges', '.igs', '.stl', '.obj', '.dxf', '.dwg']) expect(accept).toContain(ext)
    await (await fc).setFiles({ name: 'LM8UU.step', mimeType: 'application/octet-stream', buffer: Buffer.from(boxStep(24, 15, 15, [100, 0, 0], 'LM8UU')) })
    await expect(prompt(page)).toHaveText('Import "LM8UU.step" as [Objects/Block] <Objects>:', { timeout: 30_000 })
    await cmd(page, '')
    await expect(out(page)).toContainText('Imported 1 mesh(es) from STEP.')
    expect(await st(page, 'return s.doc.entities.map((e) => e.type)')).toEqual(['LINE', 'MESH3D'])
    // Mismo lector que OPEN: el cuerpo queda donde está en el archivo.
    const box = await st<number[]>(page, `const v = s.doc.entities[1].props.vertices; return [0, 1, 2].flatMap((k) => [Math.min(...v.map((p) => p[k])), Math.max(...v.map((p) => p[k]))])`)
    expect(box.map((x) => Math.round(x * 1000) / 1000)).toEqual([100, 124, 0, 15, 0, 15])

    // STL como bloque con nombre; INSERT lo repite.
    await choose(page, 'IMPORT', 'LM8uu.stl', boxStl(24, 15, 15))
    await expect(prompt(page)).toHaveText('Import "LM8uu.stl" as [Objects/Block] <Objects>:')
    await cmd(page, 'B', 'LM8UU')
    await expect(out(page)).toContainText('Block "LM8UU" defined with 1 mesh(es) from STL and inserted at 0,0,0. Use INSERT LM8UU to place more.')
    await cmd(page, 'INSERT', 'LM8UU', '#200,0,0', '1', '0')
    await expect(out(page)).toContainText('Inserted "LM8UU".')
    expect(await st(page, `return s.doc.entities.filter((e) => e.type === 'INSERT').map((e) => e.props.position)`)).toEqual([
      [0, 0, 0],
      [200, 0, 0],
    ])
    // Un paso de deshacer por comando: el INSERT y después el IMPORT entero (con su definición).
    await cmd(page, 'U')
    expect(await st(page, `return s.doc.entities.map((e) => e.type)`)).toEqual(['LINE', 'MESH3D', 'INSERT'])
    await cmd(page, 'U')
    expect(await st(page, `return [s.doc.entities.map((e) => e.type), s.doc.blocks.length]`)).toEqual([['LINE', 'MESH3D'], 0])
  })

  test('un archivo que no es un modelo válido avisa y la línea de comandos sigue libre', async ({ page }) => {
    await ready(page)
    await choose(page, 'IMPORT', 'roto.step', 'not a step file')
    await expect(out(page)).toContainText('"roto.step" could not be read (The STEP file could not be read.)', { timeout: 30_000 })
    await choose(page, 'IMPORT', 'notas.txt', 'hola')
    await expect(out(page)).toContainText('"notas.txt" cannot be imported: use a .dxf, .dwg, .obj, .stl, .step or .iges file.')
    await cmd(page, 'LINE', '#0,0', '#5,5', '')
    expect(await st(page, 'return s.doc.entities.map((e) => e.type)')).toEqual(['LINE'])
  })
})

test.describe('Copiar y pegar bloques entre dibujos (B27)', () => {
  test('el flujo del ensamble: BLOCK, COPYBASE, OPEN, PASTECLIP, INSERT, SAVE y OPEN conservan el bloque', async ({ page }) => {
    await ready(page)
    const assembly = await assemblyFile(page)
    await choose(page, 'OPEN', 'NEMA17.step', boxStep(42, 42, 40, [-21, -21, 0], 'NEMA17'))
    await expect(out(page)).toContainText('Opened "NEMA17.step" from the device (1 mesh(es)).', { timeout: 30_000 })
    await cmd(page, 'BLOCK', 'ALL', '', 'NEMA17', '0,0,0')
    await expect(out(page)).toContainText('Block "NEMA17" defined (1 object(s)).')
    await cmd(page, 'COPYBASE', 'ALL', '', '0,0,0')
    await expect(out(page)).toContainText('1 object(s) copied to the clipboard.')
    await choose(page, 'OPEN', 'ensamble.cota', assembly)
    await expect(out(page)).toContainText('Opened "ensamble.cota" from the device.')
    await cmd(page, 'PASTECLIP', '1000,1000,0')
    await expect(out(page)).toContainText('1 block definition(s) added: NEMA17.')
    await cmd(page, 'INSERT', 'NEMA17', '1100,1000,0', '1', '0')
    await cmd(page, 'INSERT', 'NEMA17', '1200,1000,0', '1', '0')
    await expect(out(page)).toContainText('Inserted "NEMA17".')

    const input = page.getByTestId('command-input')
    await input.fill('SAVE')
    await input.press('Enter')
    const download = page.waitForEvent('download')
    await input.fill('ensamble')
    await input.press('Enter')
    const saved = readFileSync(await (await download).path(), 'utf8')
    const data = JSON.parse(saved) as { blocks?: Array<{ name: string; entities: unknown[] }>; entities: Array<{ type: string }> }
    expect(data.blocks?.map((b) => [b.name, b.entities.length])).toEqual([['NEMA17', 1]])
    expect(data.entities.filter((e) => e.type === 'INSERT')).toHaveLength(3)

    await choose(page, 'OPEN', 'ensamble.cota', saved)
    await expect(out(page)).toContainText('Opened "ensamble.cota" from the device.')
    await expect(out(page)).not.toContainText('Warning:')
    expect(await st(page, `return [s.doc.blocks.map((b) => b.name), s.doc.entities.filter((e) => e.type === 'INSERT').length]`)).toEqual([['NEMA17'], 3])
  })

  test('INSERT de un bloque que no existe avisa y no crea nada; un .cota con inserciones huérfanas avisa al abrirlo', async ({ page }) => {
    await ready(page)
    await cmd(page, 'INSERT', 'NEMA17', '100,0,0', '1', '0')
    await expect(out(page)).toContainText('Block "NEMA17" not found: the drawing has no blocks.')
    expect(await st(page, `return s.doc.entities.length`)).toBe(0)
    // Lo que guardaba 2.46.0 al pegar sin la definición.
    const broken = await st<string>(
      page,
      `const d = s.doc.toJSON(); d.entities = [1, 2].map((i) => ({ id: 'e' + i, type: 'INSERT', layer: '0', props: { name: 'LM8UU', position: [i * 50, 0, 0], scale: [1, 1, 1], rotation: 0 } })); return JSON.stringify(d)`,
    )
    await choose(page, 'OPEN', 'viejo.cota', broken)
    await expect(out(page)).toContainText('Warning: 2 block reference(s) use blocks this drawing does not define (LM8UU): they draw nothing.')
  })
})

test.describe('Copiar en una pestaña del navegador y pegar en otra (B05)', () => {
  test('COPYBASE en una pestaña, PASTECLIP y Ctrl+V en otra; también en una pestaña abierta después', async ({ context }) => {
    const a = await context.newPage()
    const b = await context.newPage()
    await ready(a)
    await ready(b)
    await choose(a, 'OPEN', 'ensamble.cota', await assemblyFile(a))
    await expect(out(a)).toContainText('Opened "ensamble.cota" from the device.')

    // Pestaña B: abre el componente y lo copia.
    await b.bringToFront()
    await choose(b, 'OPEN', 'LM8UU.step', boxStep(24, 15, 15, [0, 0, 0], 'LM8UU'))
    await expect(out(b)).toContainText('Opened "LM8UU.step" from the device (1 mesh(es)).', { timeout: 30_000 })
    await cmd(b, 'BLOCK', 'ALL', '', 'LM8UU', '0,0,0')
    await cmd(b, 'COPYBASE', 'ALL', '', '0,0,0')
    await expect(out(b)).toContainText('1 object(s) copied to the clipboard.')

    // Pestaña A: Ctrl+V pega lo copiado en B (con su bloque), y PASTECLIP también.
    await a.bringToFront()
    await a.getByTestId('command-input').focus()
    await a.keyboard.press('Control+V')
    await expect(prompt(a)).toHaveText('Specify insertion point:')
    await cmd(a, '50,50,0')
    await expect(out(a)).toContainText('1 block definition(s) added: LM8UU.')
    await expect(out(a)).toContainText('1 object(s) pasted.')
    await cmd(a, 'PASTECLIP', '100,50,0')
    await expect(out(a)).not.toContainText('The clipboard is empty.')
    await expect
      .poll(() => st(a, `return [s.doc.getBlock('LM8UU')?.entities.length, s.doc.entities.filter((e) => e.type === 'INSERT').map((e) => e.props.position)]`))
      .toEqual([
        1,
        [
          [50, 50, 0],
          [100, 50, 0],
        ],
      ])

    // Una pestaña nueva también encuentra la copia; y copiar en A gana sobre lo de B.
    const c = await context.newPage()
    await ready(c)
    await cmd(c, 'PASTEORIG')
    await expect(out(c)).toContainText('1 object(s) pasted.')
    expect(await st(c, `return s.doc.blocks.map((b) => b.name)`)).toEqual(['LM8UU'])
    await a.bringToFront()
    await cmd(a, 'COPYCLIP', 'ALL', '')
    await expect(out(a)).toContainText('3 object(s) copied to the clipboard.')
    await b.bringToFront()
    await cmd(b, 'PASTEORIG')
    await expect(out(b)).toContainText('3 object(s) pasted.')
    expect(await st(b, `return s.doc.layers.map((l) => l.name)`)).toContain('Frame')
  })
})
