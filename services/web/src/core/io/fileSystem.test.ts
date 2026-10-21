import { describe, it, expect } from 'vitest'
import { MemDir } from './memfs'
import { ensurePermission, fileHandleAt, listDrawings, permissionState, readTextFile, writeDrawing, writeTextFile } from './fileSystem'
import { drawingFileName, folderSegments, isDrawingFile, joinPath, sanitizeSegment, splitDrawingPath, stripExtension } from './paths'

describe('paths', () => {
  it('parte carpeta/sub/nombre y quita la extensión', () => {
    expect(splitDrawingPath('proyecto/planos/pieza.cota')).toEqual({ folder: 'proyecto/planos', name: 'pieza' })
    expect(splitDrawingPath('pieza')).toEqual({ folder: '', name: 'pieza' })
    expect(splitDrawingPath('/a//b/ c .dxf')).toEqual({ folder: 'a/b', name: 'c' })
  })

  it('conserva espacios y guiones, descarta caracteres inválidos', () => {
    expect(sanitizeSegment('Plano 01 - rev:B?')).toBe('Plano 01 - revB')
    expect(sanitizeSegment('   ')).toBe('')
  })

  it('arma el nombre de archivo con extensión', () => {
    expect(drawingFileName('pieza')).toBe('pieza.cota')
    expect(drawingFileName('pieza.cota')).toBe('pieza.cota')
    expect(drawingFileName('pieza', '.dxf')).toBe('pieza.dxf')
    expect(drawingFileName('')).toBe('drawing1.cota')
  })

  it('normaliza segmentos de carpeta y rutas', () => {
    expect(folderSegments('a//b/')).toEqual(['a', 'b'])
    expect(joinPath('', 'x.cota')).toBe('x.cota')
    expect(joinPath('a/b', 'x.cota')).toBe('a/b/x.cota')
    expect(stripExtension('plano.v2.cota')).toBe('plano.v2')
  })

  it('los dibujos .ccad de antes del nombre Cota se reconocen y se abren', () => {
    expect(isDrawingFile('viejo.CCAD')).toBe(true)
    expect(isDrawingFile('nuevo.cota')).toBe(true)
    expect(isDrawingFile('vista.dxf')).toBe(false)
    expect(splitDrawingPath('obra/viejo.ccad')).toEqual({ folder: 'obra', name: 'viejo' })
  })
})

describe('fileSystem sobre un FS en memoria', () => {
  const workspace = () => {
    const dir = new MemDir()
    dir.seed('pieza.cota', '{"a":1}')
    dir.seed('proyecto/planos/corte.cota', '{"b":2}')
    dir.seed('proyecto/planos/vista.dxf', '0\nSECTION')
    dir.seed('proyecto/viejo.ccad', '{"c":3}')
    dir.seed('notas.txt', 'no es un dibujo')
    dir.seed('.oculta/x.cota', 'ignorada')
    return dir
  }

  it('lista los dibujos de la carpeta y sus subcarpetas, ignorando otros archivos', async () => {
    const found = await listDrawings(workspace())
    expect(found.map((f) => f.path)).toEqual([
      'pieza.cota',
      'proyecto/planos/corte.cota',
      'proyecto/planos/vista.dxf',
      'proyecto/viejo.ccad',
    ])
    expect(found[1]).toMatchObject({ folder: 'proyecto/planos', name: 'corte', ext: '.cota' })
  })

  it('lee y escribe archivos existentes', async () => {
    const dir = workspace()
    const handle = await fileHandleAt(dir, '', 'pieza.cota')
    expect(handle).not.toBeNull()
    expect(await readTextFile(handle!)).toBe('{"a":1}')
    await writeTextFile(handle!, '{"a":2}')
    expect(await readTextFile(handle!)).toBe('{"a":2}')
  })

  it('no crea archivos ni carpetas si no se pide explícitamente', async () => {
    const dir = workspace()
    expect(await fileHandleAt(dir, '', 'inexistente.cota')).toBeNull()
    expect(await fileHandleAt(dir, 'sin/carpeta', 'x.cota')).toBeNull()
  })

  it('writeDrawing crea las subcarpetas necesarias y devuelve la ruta', async () => {
    const dir = workspace()
    const res = await writeDrawing(dir, 'obra/norte', 'planta baja', '{"nuevo":true}')
    expect(res?.path).toBe('obra/norte/planta baja.cota')
    const again = await fileHandleAt(dir, 'obra/norte', 'planta baja.cota')
    expect(await readTextFile(again!)).toBe('{"nuevo":true}')
    // y aparece en el listado
    expect((await listDrawings(dir)).some((f) => f.path === 'obra/norte/planta baja.cota')).toBe(true)
  })

  it('sobrescribe el mismo archivo en guardados sucesivos', async () => {
    const dir = workspace()
    await writeDrawing(dir, '', 'pieza', '{"v":1}')
    await writeDrawing(dir, '', 'pieza', '{"v":2}')
    const handle = await fileHandleAt(dir, '', 'pieza.cota')
    expect(await readTextFile(handle!)).toBe('{"v":2}')
    expect((await listDrawings(dir)).filter((f) => f.path === 'pieza.cota')).toHaveLength(1)
  })

  it('permisos: informa el estado y los solicita cuando hace falta', async () => {
    const dir = workspace()
    dir.permission = 'prompt'
    expect(await permissionState(dir)).toBe('prompt')
    expect(await ensurePermission(dir)).toBe(true)
    expect(await permissionState(dir)).toBe('granted')
  })
})
