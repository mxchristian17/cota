import { expect, test, type Page } from '@playwright/test'
import { boxStep } from './support/models'

/**
 * Cambios sin guardar: OPEN, soltar un archivo y cerrar la pestaña preguntan antes de descartarlos (R28), y abrir un
 * STEP y copiarlo no cuenta como un cambio (B26). Los archivos son sintéticos.
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

async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('command-input')).toBeVisible()
}

/** Un `.cota` con un círculo, armado desde el dibujo vacío de la página. */
const circleFile = (page: Page) =>
  st<string>(page, `const d = s.doc.toJSON(); d.entities = [{ id: 'c1', type: 'CIRCLE', layer: '0', props: { center: [0, 0, 0], radius: 5 } }]; return JSON.stringify(d)`)

async function openChosen(page: Page, name: string, text: string) {
  const chooser = page.waitForEvent('filechooser')
  await cmd(page, 'OPEN')
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(text) })
}

const types = (page: Page) => st<string[]>(page, 'return s.doc.entities.map((e) => e.type)')

test.describe('Cambios sin guardar (R28)', () => {
  test('OPEN pregunta si guardar: Esc conserva el dibujo, No lo descarta y Yes lo guarda antes de abrir', async ({ page }) => {
    await ready(page)
    const file = await circleFile(page)
    await cmd(page, 'LINE', '#0,0', '#40,0', '')
    await expect.poll(() => types(page)).toEqual(['LINE'])

    // Esc: no abre nada y el dibujo sigue con sus cambios.
    await openChosen(page, 'circulo.cota', file)
    await expect(prompt(page)).toHaveText('Save changes to drawing1? [Yes/No] <Yes>:')
    await page.getByTestId('command-input').press('Escape')
    await expect(out(page)).toContainText('Open cancelled: the drawing was kept.')
    expect(await types(page)).toEqual(['LINE'])
    expect(await st(page, 'return s.isDirty()')).toBe(true)

    // No: abre el elegido sin guardar.
    await openChosen(page, 'circulo.cota', file)
    await expect(prompt(page)).toHaveText('Save changes to drawing1? [Yes/No] <Yes>:')
    await cmd(page, 'N')
    await expect(out(page)).toContainText('Opened "circulo.cota" from the device.')
    expect(await types(page)).toEqual(['CIRCLE'])

    // Yes (Enter): descarga el dibujo con el cambio y después abre el otro.
    await cmd(page, 'LINE', '#0,0', '#40,0', '')
    await openChosen(page, 'otro.cota', file)
    await expect(prompt(page)).toHaveText('Save changes to circulo? [Yes/No] <Yes>:')
    const download = page.waitForEvent('download')
    await cmd(page, '')
    expect((await download).suggestedFilename()).toBe('circulo.cota')
    await expect(out(page)).toContainText('Opened "otro.cota" from the device.')
    expect(await types(page)).toEqual(['CIRCLE'])
    expect(await st(page, 'return s.isDirty()')).toBe(false)
  })

  test('soltar un dibujo sobre Cota también pregunta; sin cambios, OPEN no pregunta', async ({ page }) => {
    await ready(page)
    const file = await circleFile(page)
    await openChosen(page, 'limpio.cota', file)
    await expect(out(page)).toContainText('Opened "limpio.cota" from the device.')
    await expect(prompt(page)).not.toContainText('Save changes')

    await cmd(page, 'LINE', '#0,0', '#40,0', '')
    await page.evaluate((text) => {
      const dt = new DataTransfer()
      dt.items.add(new File([text], 'soltado.cota'))
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    }, file)
    await expect(prompt(page)).toHaveText('Save changes to limpio? [Yes/No] <Yes>:')
    await cmd(page, 'No')
    await expect(out(page)).toContainText('Opened "soltado.cota" from the device.')
  })

  test('cerrar la pestaña con cambios sin guardar pide confirmar al navegador; NEW pregunta', async ({ page }) => {
    await ready(page)
    await cmd(page, 'LINE', '#0,0', '#40,0', '')
    await expect.poll(() => st(page, 'return s.isDirty()')).toBe(true)
    await cmd(page, 'NEW')
    await expect(prompt(page)).toHaveText('Save changes to drawing1? [Yes/No] <Yes>:')
    await page.getByTestId('command-input').press('Escape')
    expect(await types(page)).toEqual(['LINE'])
    // El navegador muestra su diálogo «¿Salir del sitio?» (beforeunload).
    const dialog = page.waitForEvent('dialog')
    await page.close({ runBeforeUnload: true })
    const d = await dialog
    expect(d.type()).toBe('beforeunload')
    await d.dismiss()
  })
})

test.describe('Abrir un STEP y copiarlo no es un cambio (B26)', () => {
  test('COPYBASE en un STEP recién abierto: NEW y OPEN no preguntan si guardar', async ({ page }) => {
    await ready(page)
    // Coordenadas con decimales: la malla trae ruido de punto flotante (lo que limpiaba el primer comando).
    await openChosen(page, 'LM8UU.step', boxStep(24.3, 15.1, 15.7, [0.1, 0.2, 0.3], 'LM8UU'))
    await expect(out(page)).toContainText('Opened "LM8UU.step" from the device (1 mesh(es)).', { timeout: 30_000 })
    await cmd(page, 'COPYBASE', 'ALL', '', '0,0,0')
    await expect(out(page)).toContainText('1 object(s) copied to the clipboard.')
    expect(await st(page, 'return s.isDirty()')).toBe(false)
    await cmd(page, 'NEW')
    await expect(out(page)).toContainText('New drawing.')
    await expect(prompt(page)).not.toContainText('Save changes')
  })
})
