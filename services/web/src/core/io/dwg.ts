import type { DxfImportResult } from './dxf'
import { unpackMeshes } from './meshTransfer'
import { registerBreps } from '../document/brepStore'
import type { BrepModel } from '../document/types'

/**
 * DWG en el navegador, sin servidor: acad-ts (MIT, port a TypeScript de ACadSharp) lee el archivo y lo escribe como
 * DXF, que entra por el importador de siempre (capas, tipos de línea, cotas y bloques expandidos). La librería
 * pesa: se carga recién al abrir el primer .dwg.
 */
export async function dwgToDxfText(data: ArrayBuffer): Promise<string> {
  const { convertDwgToDxf } = await import('./dwgConvert')
  return convertDwgToDxf(data)
}

/** Tope para leer un DWG o DXF en el navegador: un plano grande en un teléfono tarda decenas de segundos, no minutos. */
export const CAD_TIMEOUT_MS = 180_000

/** El archivo no terminó de leerse a tiempo (muy grande, o el teléfono se quedó sin memoria). */
export class CadTimeoutError extends Error {
  constructor(ms: number) {
    super(`it took longer than ${Math.round(ms / 60_000)} min to read in the browser (too large for this device?)`)
    this.name = 'CadTimeoutError'
  }
}

/** Lectura en el hilo principal: sin Worker (tests) o si el hilo no arranca. */
async function importCadHere(kind: 'dwg' | 'dxf', data: ArrayBuffer, light?: boolean): Promise<DxfImportResult> {
  const { readCad } = await import('./cadRead')
  const result = readCad(kind, data, light)
  unpackMeshes(result)
  return result
}

/**
 * DWG o DXF → dibujo interpretado, en un hilo aparte (Web Worker): la pantalla sigue respondiendo, el hilo principal
 * no carga el texto DXF y, si tarda más que `timeoutMs` (un hilo que se quedó sin memoria muere sin avisar), se corta
 * con un mensaje en vez de quedar leyendo para siempre. Sin Worker o si el hilo no arranca (sin conexión con una
 * versión vieja en caché), se lee en el hilo principal.
 */
/** Lecturas de DWG/DXF en curso (mientras tanto, nada se calcula en los ratos libres). */
let reading = 0
export const cadReadsInFlight = (): number => reading

export function importCadInWorker(kind: 'dwg' | 'dxf', data: ArrayBuffer, opts: { timeoutMs?: number; light?: boolean } = {}): Promise<DxfImportResult> {
  reading++
  return readInWorker(kind, data, opts).finally(() => reading--)
}

function readInWorker(kind: 'dwg' | 'dxf', data: ArrayBuffer, opts: { timeoutMs?: number; light?: boolean }): Promise<DxfImportResult> {
  const { timeoutMs = CAD_TIMEOUT_MS, light } = opts
  if (typeof Worker === 'undefined') return importCadHere(kind, data, light)
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./cadWorker.ts', import.meta.url), { type: 'module' })
    } catch {
      importCadHere(kind, data, light).then(resolve, reject)
      return
    }
    let answered = false
    const done = () => {
      clearTimeout(timer)
      worker.terminate()
    }
    const timer = setTimeout(() => {
      done()
      reject(new CadTimeoutError(timeoutMs))
    }, timeoutMs)
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: DxfImportResult; error?: string } | { models: Record<string, BrepModel> }>) => {
      if ('models' in e.data) {
        // Los modelos de los sólidos, comprimidos (ver `cadWorker`): reemplazan a sus bytes en el registro.
        registerBreps(e.data.models)
        worker.terminate()
        return
      }
      answered = true
      clearTimeout(timer)
      if (e.data.ok && e.data.result?.breps) {
        // El lector sigue un rato: comprime los modelos. Si no termina, se comprimen al guardar.
        setTimeout(() => worker.terminate(), timeoutMs)
      } else worker.terminate()
      if (e.data.ok && e.data.result) {
        // Las mallas vuelven a listas de vértices y caras.
        unpackMeshes(e.data.result)
        resolve(e.data.result)
      }
      else reject(new Error(e.data.error ?? 'the file could not be read'))
    }
    worker.onerror = (e) => {
      e.preventDefault()
      done()
      // El hilo no llegó a responder (no cargó): se intenta en el hilo principal.
      if (!answered) importCadHere(kind, data, light).then(resolve, reject)
      else reject(new Error(e.message || 'the reader stopped'))
    }
    worker.postMessage({ kind, data, light }) // se copia: el original sigue disponible para el conversor del servidor
  })
}

/** El archivo empieza con la versión del formato (`AC1015` = 2000 … `AC1032` = 2018+). */
export function dwgVersion(data: ArrayBuffer): string | null {
  const head = new TextDecoder('ascii').decode(new Uint8Array(data, 0, Math.min(6, data.byteLength)))
  return /^AC\d{4}$/.test(head) ? head : null
}

/**
 * DXF → DWG en el navegador: el DXF que ya exporta Cota se lee con acad-ts y se escribe como DWG 2018 (AC1032), el
 * formato que abren los programas actuales.
 */
export async function dxfTextToDwg(dxf: string, sab?: ReadonlyMap<string, Uint8Array>): Promise<ArrayBuffer> {
  const { ACadVersion, Color, DwgObjectWriter, DwgWriter, DxfReader, ModelerGeometry, RasterImage, XY } = await import('@node-projects/acad-ts')
  const doc = DxfReader.readFromStream(new TextEncoder().encode(dxf))
  // Sólidos ACIS: el DXF los trae con una marca (`cota-solid n`) en lugar del SAT; acá va su SAB, que el DWG 2018
  // guarda en su sección de datos del modelador.
  if (sab?.size)
    for (const br of doc.blockRecords ?? [])
      for (const e of br.entities) {
        if (!(e instanceof ModelerGeometry)) continue
        const m = /^cota-solid (\S+)/.exec(e.getAcisText()?.trim() ?? '')
        const bytes = m && sab.get(m[1])
        if (bytes) e.acisData = bytes
      }
  doc.header!.version = ACadVersion.AC1032
  // acad-ts 3.6 escribe el color verdadero como R-G-B y el formato (y su propio lector) lo esperan B-G-R: se invierte
  // antes de escribir para que el DWG salga con los colores correctos.
  type Colored = { color: InstanceType<typeof Color> }
  const fix = (o: Colored) => {
    const c = o.color
    if (c?.isTrueColor) o.color = Color.fromTrueColor((c.b << 16) | (c.g << 8) | c.r)
  }
  for (const l of doc.layers ?? []) fix(l as unknown as Colored)
  for (const br of doc.blockRecords ?? []) for (const e of br.entities) fix(e as unknown as Colored)
  // Una imagen sin recorte: acad-ts escribe igual el rectángulo de recorte (vacío, fallaba el DWG entero); va el de la
  // imagen completa, con el recorte apagado.
  for (const br of doc.blockRecords ?? [])
    for (const e of br.entities)
      if (e instanceof RasterImage && e.clipBoundaryVertices.length < 2) e.clipBoundaryVertices = [new XY(-0.5, -0.5), new XY(e.size.x - 0.5, e.size.y - 0.5)]
  // Las tablas que el DWG exige (estilo de texto y de cota Standard…) aunque el DXF no las traiga.
  doc.createDefaults()
  const bytes = withLinearLookups(DwgObjectWriter, () => DwgWriter.writeToBuffer(doc))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Lista de las entidades de un bloque: `find` sigue desde donde encontró la anterior (se buscan en orden, por handle). */
class InOrder<T> extends Array<T> {
  cursor = 0
  find(pred: (v: T, i: number, a: T[]) => unknown): T | undefined {
    // Sin repetidos (handles): el único que cumple es el mismo que encontraría `find` desde el principio.
    const n = this.length
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n
      if (pred(this[i], i, this)) {
        this.cursor = i + 1
        return this[i]
      }
    }
    return undefined
  }
}

/**
 * Escribe el DWG con búsquedas lineales: acad-ts busca cada entidad del espacio modelo recorriendo la lista entera
 * (`find` e `includes` dentro de un recorrido de la misma lista), cuadrático: con un ensamble de miles de sólidos y
 * decenas de miles de objetos tardaba más de dos minutos. Mientras escribe (es sincrónico), las listas de entidades
 * buscan desde la última encontrada y `includes` de las listas largas usa un conjunto; después todo vuelve a ser como era.
 */
function withLinearLookups<R>(writer: { prototype: object }, write: () => R): R {
  const proto = writer.prototype as { _getCompatibleEntities?: (entities: Iterable<unknown>) => unknown[] }
  const own = proto._getCompatibleEntities
  const includes = Array.prototype.includes
  const sets = new WeakMap<unknown[], { n: number; set: Set<unknown> }>()
  if (own)
    proto._getCompatibleEntities = function (this: unknown, entities: Iterable<unknown>) {
      return InOrder.from(own.call(this, entities))
    }
  Array.prototype.includes = function (this: unknown[], x: unknown, from?: number): boolean {
    if (this.length < 256 || from !== undefined || (typeof x !== 'number' && typeof x !== 'bigint' && typeof x !== 'string')) return includes.call(this, x, from)
    let c = sets.get(this)
    if (!c || c.n !== this.length) sets.set(this, (c = { n: this.length, set: new Set(this) }))
    return c.set.has(x)
  }
  try {
    return write()
  } finally {
    Array.prototype.includes = includes
    if (own) proto._getCompatibleEntities = own
  }
}

/**
 * Mensaje útil cuando falla el DWG en el navegador: si el módulo no se pudo cargar (sin conexión, una versión vieja
 * en caché), se dice cómo resolverlo; si no, el motivo del lector o escritor.
 */
export function dwgErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/dynamically imported module|Importing a module script failed|Failed to fetch|error loading/i.test(msg)) {
    return 'the DWG converter could not be loaded. Check the connection and reload the page (Ctrl+F5), then try again.'
  }
  return msg
}
