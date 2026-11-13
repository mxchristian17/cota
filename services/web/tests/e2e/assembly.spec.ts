import { test, expect, type Page } from '@playwright/test'

/**
 * Ensamble 3D grande (sintético): un bloque de cuatro piezas (mallas) insertado 1300 veces, más de 5000 objetos al
 * dibujar. Elegir, soltar, orbitar y editar no rehacen lo que no cambió: las mallas de mundo de las inserciones quietas
 * son las mismas listas, los programas de shader no se recompilan y los snaps sobre las mallas siguen exactos.
 */

const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

async function cmd(page: Page, ...steps: string[]) {
  const i = page.getByTestId('command-input')
  for (const s of steps) {
    await i.fill(s)
    await i.press('Enter')
    await page.waitForTimeout(40)
  }
}

const screen = (page: Page, p: number[]) =>
  page.evaluate((q) => {
    const s = (window as any).__cotaStore.getState()
    const r = s.activeViewport.renderer.domElement.getBoundingClientRect()
    const [x, y] = s.activeViewport.project({ x: q[0], y: q[1], z: q[2] })
    return [x + r.left, y + r.top] as [number, number]
  }, p)

/** Dos cuadros dibujados: lo pedido ya está en pantalla. */
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

/** Los programas de shader vivos (cada uno nuevo lleva otro id: uno recompilado también). */
const PROGRAMS = 'return s.activeViewport.renderer.info.programs.map((p) => p.id).sort((a, b) => a - b).join()'

test.describe('ensamble 3D grande', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await st(
      page,
      `const box = (x, y, z, w) => ({ type: 'MESH3D', layer: '0', props: {
         vertices: [[x, y, z], [x + w, y, z], [x + w, y + w, z], [x, y + w, z], [x, y, z + w], [x + w, y, z + w], [x + w, y + w, z + w], [x, y + w, z + w]],
         faces: [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]] } })
       s.doc.setBlock({ name: 'PIEZA', entities: [box(0, 0, 0, 4), box(5, 0, 0, 3), box(0, 5, 0, 2), box(5, 5, 1, 3)].map((e, i) => ({ id: 'p' + i, ...e })) })
       for (let i = 0; i < 1300; i++)
         s.doc.addEntity({ type: 'INSERT', layer: '0', props: { name: 'PIEZA', position: [(i % 40) * 12, Math.floor(i / 40) * 12, 0], scale: [1, 1, 1], rotation: 0 } })
       s.doc.touch()
       s.setVisualStyle('shaded')
       s.activeViewport.setView('SWISO')
       s.activeViewport.zoomCenter({ x: 20, y: 20, z: 0 }, 60)`,
    )
    await expect.poll(() => st<number>(page, 'return s.activeViewport.expanded?.length ?? 0')).toBe(5200)
    await frames(page)
  })

  test('elegir y soltar resaltan encima sin rehacer los lotes ni recompilar shaders', async ({ page }) => {
    const id = await st<string>(page, 'return s.doc.entities[41].id') // inserción en (12, 12)
    const at = await screen(page, [12 + 2, 12 + 2, 4])
    const click = async () => {
      await page.mouse.move(at[0] + 2, at[1] + 1)
      await page.mouse.move(at[0], at[1])
      await page.mouse.down()
      await page.mouse.up()
      await frames(page)
    }
    const batches = await st<number>(page, 'window.__batches = s.activeViewport.entityGroup.children[0]; return s.activeViewport.entityGroup.children.length')
    await click()
    expect(await st<string[]>(page, 'return s.selection')).toEqual([id])
    expect(await st<number>(page, 'return s.activeViewport.selOverlay.children.length')).toBe(4) // sus cuatro piezas, resaltadas
    await page.keyboard.press('Escape')
    await frames(page)
    expect(await st<string[]>(page, 'return s.selection')).toEqual([])
    expect(await st<number>(page, 'return s.activeViewport.selOverlay.children.length')).toBe(0)
    // Los lotes son los mismos objetos (no se rehicieron).
    expect(await st<boolean>(page, `return s.activeViewport.entityGroup.children.length === ${batches} && s.activeViewport.entityGroup.children[0] === window.__batches`)).toBe(true)
    // Otra vuelta: el resaltado usa los mismos programas de shader (ninguno recompilado); y al orbitar con la pieza
    // elegida (los grips se rehacen en cada cuadro), tampoco.
    await click()
    const programs = await st<string>(page, PROGRAMS)
    await page.keyboard.press('Escape')
    await frames(page)
    await click()
    expect(await st<string>(page, PROGRAMS)).toBe(programs)
    await page.mouse.move(640, 400)
    await page.mouse.down({ button: 'right' })
    for (let k = 1; k <= 8; k++) {
      await page.mouse.move(640 + k * 8, 400 + k * 3)
      await frames(page)
    }
    await page.mouse.up({ button: 'right' })
    await frames(page)
    expect(await st<string[]>(page, 'return s.selection')).toEqual([id])
    expect(await st<string>(page, PROGRAMS)).toBe(programs)
  })

  test('borrar y deshacer reusan las mallas de las inserciones que no cambiaron', async ({ page }) => {
    // Listas de vértices de mundo de la inserción 0 (sus cuatro piezas) antes de editar.
    const keep = `const id = s.doc.entities[0].id; return s.activeViewport.expanded.filter((e) => e.id === id).map((e) => e.props.vertices)`
    await st(page, `window.__before = (() => { ${keep} })()`)
    await page.evaluate(() => (window as any).__cotaStore.setState({ selection: [(window as any).__cotaStore.getState().doc.entities[700].id] }))
    await cmd(page, 'ERASE')
    await expect.poll(() => st<number>(page, 'return s.activeViewport.expanded.length')).toBe(5196)
    await cmd(page, 'U')
    await expect.poll(() => st<number>(page, 'return s.activeViewport.expanded.length')).toBe(5200)
    expect(await st<boolean>(page, `const now = (() => { ${keep} })(); return now.length === 4 && now.every((v, i) => v === window.__before[i])`)).toBe(true)
  })

  test('LINE desde el vértice de una pieza: el snap da el punto exacto', async ({ page }) => {
    await cmd(page, 'LINE')
    const v = [12 + 5 + 3, 12, 0] // esquina de la segunda pieza de la inserción en (12, 12)
    const [x, y] = await screen(page, v)
    await page.mouse.move(x + 6, y + 4)
    await page.mouse.move(x + 3, y + 2)
    await frames(page)
    await page.mouse.down()
    await page.mouse.up()
    await cmd(page, '@10,0,0', '')
    const line = await st<{ start: number[]; end: number[] }>(page, `return s.doc.entities.filter((e) => e.type === 'LINE').at(-1).props`)
    expect(line.start).toEqual(v)
    expect(line.end).toEqual([v[0] + 10, v[1], v[2]])
  })
})
