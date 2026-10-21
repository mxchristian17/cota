import { test, expect, type Page } from '@playwright/test'

/**
 * El selector de carpetas del sistema abre un diálogo nativo que no se puede automatizar, así que se
 * inyecta un `showDirectoryPicker` que devuelve un sistema de archivos en memoria con la misma forma
 * que la File System Access API. Todo el resto del flujo es el real.
 */
const INSTALL_MEMFS = () => {
  interface MemFile {
    kind: 'file'
    name: string
    contents: string
    getFile(): Promise<{ text(): Promise<string>; lastModified: number }>
    createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>
    queryPermission(): Promise<string>
    requestPermission(): Promise<string>
  }
  interface MemDir {
    kind: 'directory'
    name: string
    entries: Map<string, MemDir | MemFile>
    getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<MemDir>
    getFileHandle(n: string, o?: { create?: boolean }): Promise<MemFile>
    values(): AsyncGenerator<MemDir | MemFile>
    queryPermission(): Promise<string>
    requestPermission(): Promise<string>
  }

  const makeFile = (name: string, contents = ''): MemFile => {
    const file: MemFile = {
      kind: 'file',
      name,
      contents,
      getFile: async () => ({ text: async () => file.contents, lastModified: Date.now() }),
      createWritable: async () => ({
        write: async (d: string) => {
          file.contents = d
        },
        close: async () => {},
      }),
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
    }
    return file
  }

  const makeDir = (name: string): MemDir => {
    const dir: MemDir = {
      kind: 'directory',
      name,
      entries: new Map(),
      getDirectoryHandle: async (n, o) => {
        const found = dir.entries.get(n)
        if (found && found.kind === 'directory') return found
        if (!o?.create) throw new Error('no dir')
        const created = makeDir(n)
        dir.entries.set(n, created)
        return created
      },
      getFileHandle: async (n, o) => {
        const found = dir.entries.get(n)
        if (found && found.kind === 'file') return found
        if (!o?.create) throw new Error('no file')
        const created = makeFile(n)
        dir.entries.set(n, created)
        return created
      },
      values: async function* () {
        for (const entry of dir.entries.values()) yield entry
      },
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
    }
    return dir
  }

  const root = makeDir('obra-2026')
  const w = window as unknown as { __memfs: MemDir; showDirectoryPicker: () => Promise<MemDir> }
  w.__memfs = root
  w.showDirectoryPicker = async () => root
}

async function typeCmd(page: Page, ...steps: string[]) {
  const input = page.getByTestId('command-input')
  for (const s of steps) {
    await input.fill(s)
    await input.press('Enter')
    await page.waitForTimeout(40)
  }
}

/** Lee el contenido de un archivo del FS simulado (por ruta relativa). */
function readMem(page: Page, path: string) {
  return page.evaluate(async (p) => {
    const parts = p.split('/')
    const fileName = parts.pop() as string
    let dir = (window as unknown as { __memfs: { entries: Map<string, unknown> } }).__memfs
    for (const part of parts) {
      const next = (dir.entries as Map<string, typeof dir>).get(part)
      if (!next) return null
      dir = next
    }
    const file = (dir.entries as Map<string, { contents?: string }>).get(fileName)
    return file?.contents ?? null
  }, path)
}

test.describe('Cota carpeta local del sistema', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INSTALL_MEMFS)
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
  })

  test('OPENFOLDER elige la carpeta y SAVE escribe un .cota real', async ({ page }) => {
    await expect(page.getByTestId('workspace-button')).toContainText('Cloud')
    await typeCmd(page, 'OPENFOLDER')
    await expect(page.getByTestId('workspace-button')).toContainText('obra-2026')

    await typeCmd(page, 'LINE', '0,0', '#50,0', '')
    await typeCmd(page, 'SAVE', '') // Enter confirma el nombre por defecto (drawing1)
    await expect(page.locator('.cmd-output')).toContainText('Saved "drawing1.cota"')

    const contents = await readMem(page, 'drawing1.cota')
    expect(contents).not.toBeNull()
    const data = JSON.parse(contents as string)
    expect(data.entities).toHaveLength(1)
    expect(data.entities[0].type).toBe('LINE')
  })

  test('guarda en subcarpetas según la ruta del dibujo y sobrescribe el mismo archivo', async ({ page }) => {
    await typeCmd(page, 'OPENFOLDER')
    await typeCmd(page, 'CIRCLE', '0,0', '10')
    await page.getByTestId('doc-name').fill('proyecto/planos/pieza')
    await typeCmd(page, 'SAVE', '')
    await expect(page.locator('.cmd-output')).toContainText('proyecto/planos/pieza.cota')
    expect(await readMem(page, 'proyecto/planos/pieza.cota')).not.toBeNull()

    // Un segundo SAVE sobrescribe el mismo archivo (sin crear otro)
    await typeCmd(page, 'CIRCLE', '40,0', '5')
    await typeCmd(page, 'SAVE', '')
    const data = JSON.parse((await readMem(page, 'proyecto/planos/pieza.cota')) as string)
    expect(data.entities).toHaveLength(2)
  })

  test('OPEN lista los archivos de la carpeta y los vuelve a abrir', async ({ page }) => {
    await typeCmd(page, 'OPENFOLDER')
    await typeCmd(page, 'RECTANGLE', '-20,-10', '#20,10')
    await page.getByTestId('doc-name').fill('planta')
    await typeCmd(page, 'SAVE', '')

    await typeCmd(page, 'NEW')
    const empty = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: unknown[] } } } }
      return w.__cotaStore.getState().doc.entities.length
    })
    expect(empty).toBe(0)

    await typeCmd(page, 'OPEN')
    await expect(page.getByTestId('open-dialog')).toContainText('obra-2026')
    await page.getByTestId('local-planta').click()
    await expect(page.locator('.cmd-output')).toContainText('Opened "planta.cota"')
    const restored = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: { type: string }[] } } } }
      return w.__cotaStore.getState().doc.entities.map((e) => e.type)
    })
    expect(restored).toEqual(['RECTANGLE'])
  })

  test('el indicador de "sin guardar" se apaga al guardar en la carpeta local', async ({ page }) => {
    await typeCmd(page, 'OPENFOLDER')
    await typeCmd(page, 'CIRCLE', '0,0', '10')
    const marker = page.locator('header .muted[title]').first()
    await expect(marker).toHaveAttribute('title', 'Unsaved')
    await typeCmd(page, 'SAVE', '')
    await expect(marker).toHaveAttribute('title', 'Saved')
  })

  test('CLOUD desconecta la carpeta y vuelve al modo cuenta', async ({ page }) => {
    await typeCmd(page, 'OPENFOLDER')
    await expect(page.getByTestId('workspace-button')).toContainText('obra-2026')
    await typeCmd(page, 'CLOUD')
    await expect(page.getByTestId('workspace-button')).toContainText('Cloud')
    await expect(page.locator('.cmd-output')).toContainText('Working in the cloud')
  })

  test('sin soporte del navegador se informa y se sigue en la nube', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
    })
    await page.reload()
    await typeCmd(page, 'OPENFOLDER')
    await expect(page.locator('.cmd-output')).toContainText('cannot open system folders')
    await expect(page.getByTestId('workspace-button')).toContainText('Cloud')
  })

  test('guarda la capa actual y los estados de las capas; al reabrir se restauran', async ({ page }) => {
    await typeCmd(page, 'OPENFOLDER')
    const muros = await page.evaluate(() => {
      type L = { id: string; name: string }
      const w = window as unknown as {
        __cotaStore: {
          getState: () => {
            doc: { layers: L[] }
            createLayer: (n: string) => void
            toggleLayerVisible: (id: string) => void
            toggleLayerLock: (id: string) => void
            setLayerColor: (id: string, c: string) => void
            setLayerLineWeight: (id: string, w: number) => void
            setLayerPrintable: (id: string, p: boolean) => void
            setCurrentLayer: (id: string) => void
          }
        }
      }
      const st = () => w.__cotaStore.getState()
      st().createLayer('Muros')
      st().createLayer('Cotas')
      const id = (n: string) => st().doc.layers.find((l) => l.name === n)!.id
      st().toggleLayerLock(id('Muros'))
      st().setLayerColor(id('Muros'), '#ff8800')
      st().setLayerLineWeight(id('Muros'), 0.5)
      st().toggleLayerVisible(id('Cotas'))
      st().setLayerPrintable(id('Cotas'), false)
      st().setCurrentLayer(id('Muros'))
      return id('Muros')
    })
    await page.getByTestId('doc-name').fill('capas')
    await typeCmd(page, 'SAVE', '')
    expect(JSON.parse((await readMem(page, 'capas.cota')) as string).currentLayer).toBe(muros)

    await typeCmd(page, 'NEW')
    await expect(page.getByTestId('layer-select')).toHaveValue('0')
    await typeCmd(page, 'OPEN')
    await page.getByTestId('local-capas').click()
    await expect(page.getByTestId('layer-select')).toHaveValue(muros)
    const layers = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { layers: Record<string, unknown>[] } } } }
      return w.__cotaStore.getState().doc.layers
    })
    expect(layers.find((l) => l.name === 'Muros')).toMatchObject({ locked: true, color: '#ff8800', lineWeight: 0.5, visible: true })
    expect(layers.find((l) => l.name === 'Cotas')).toMatchObject({ visible: false, printable: false })
  })

  test('OPEN ▸ Open from device… abre un .cota suelto como dibujo sin ruta', async ({ page }) => {
    await typeCmd(page, 'OPENFOLDER')
    await typeCmd(page, 'CIRCLE', '0,0', '10')
    await page.getByTestId('doc-name').fill('pieza')
    await typeCmd(page, 'SAVE', '')
    const contents = (await readMem(page, 'pieza.cota')) as string
    await typeCmd(page, 'NEW')
    await typeCmd(page, 'OPEN')
    const chooser = page.waitForEvent('filechooser')
    await page.getByTestId('open-from-device').click()
    await (await chooser).setFiles({ name: 'externo.cota', mimeType: 'application/json', buffer: Buffer.from(contents) })
    await expect(page.locator('.cmd-output')).toContainText('Opened "externo.cota" from the device.')
    await expect(page.getByTestId('open-dialog')).toHaveCount(0)
    const st = await page.evaluate(() => {
      const w = window as unknown as {
        __cotaStore: { getState: () => { docName: string; fsFilePath: string | null; doc: { entities: { type: string }[] } } }
      }
      const s = w.__cotaStore.getState()
      return { name: s.docName, path: s.fsFilePath, types: s.doc.entities.map((e) => e.type) }
    })
    expect(st).toEqual({ name: 'externo', path: null, types: ['CIRCLE'] })
    // Sin ruta: SAVE crea un archivo nuevo en la carpeta de trabajo, no pisa el original.
    await typeCmd(page, 'SAVE', '')
    expect(await readMem(page, 'externo.cota')).not.toBeNull()
  })
})

test.describe('Cota OPEN desde el dispositivo sin carpeta ni sesión', () => {
  test('OPEN va directo al selector del sistema e IMPORT también acepta .cota', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    const data = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { toJSON: () => unknown } } } }
      return JSON.stringify(w.__cotaStore.getState().doc.toJSON())
    })
    const cota = JSON.parse(data)
    cota.entities = [{ id: 'e1', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [30, 0, 0] } }]
    const buffer = Buffer.from(JSON.stringify(cota))
    let chooser = page.waitForEvent('filechooser')
    await typeCmd(page, 'OPEN')
    await (await chooser).setFiles({ name: 'suelto.cota', mimeType: 'application/json', buffer })
    await expect(page.locator('.cmd-output')).toContainText('Opened "suelto.cota" from the device.')

    await typeCmd(page, 'NEW')
    chooser = page.waitForEvent('filechooser')
    await typeCmd(page, 'IMPORT')
    const fc = await chooser
    expect(await fc.element().getAttribute('accept')).toContain('.cota')
    await fc.setFiles({ name: 'otro.cota', mimeType: 'application/json', buffer })
    await expect(page.locator('.cmd-output')).toContainText('Opened "otro.cota" from the device.')
    const types = await page.evaluate(() => {
      const w = window as unknown as { __cotaStore: { getState: () => { doc: { entities: { type: string }[] } } } }
      return w.__cotaStore.getState().doc.entities.map((e) => e.type)
    })
    expect(types).toEqual(['LINE'])
  })
})

