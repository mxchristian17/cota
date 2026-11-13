/**
 * Caché persistente de los resultados del núcleo de sólidos exacto (IndexedDB): reabrir un dibujo o recargar la página
 * no vuelve a calcular sus sólidos (ni baja el módulo, si están todos). La clave es el SHA-256 del árbol del sólido
 * junto con la versión del módulo y la de Cota: cualquier cambio en el núcleo o en cómo se le arma el árbol invalida
 * lo guardado. Se guardan como mucho `MAX_ENTRIES` resultados; al pasarse se borran los más viejos.
 *
 * Sin IndexedDB o sin `crypto.subtle` (página sin HTTPS, modo privado) no hay caché: todo se calcula como antes.
 */
import type { OcctMesh, OcctStats } from '../core/occt/occtEval'
import { ABOUT } from '../core/about'

/** Lo que se guarda: el resultado del núcleo (sus fallas también, salvo las de tiempo, que pueden ser circunstanciales). */
export type StoredResult = { ok: true; mesh: OcctMesh; stats: OcctStats & { initMs: number } } | { ok: false; op: string; message: string; size?: number }

const DB_NAME = 'cota-kernel'
const STORE = 'results'
export const MAX_ENTRIES = 4000
const PREFIX = `${typeof __OCCT_VERSION__ === 'string' ? __OCCT_VERSION__ : '0'}|${ABOUT.version}|`

let dbp: Promise<IDBDatabase | null> | null = null

/** ¿Hay dónde guardar? */
export function persistentCacheAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle
}

function db(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE)
        s.createIndex('t', 't')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

/** Clave guardada de un árbol (`JSON.stringify(props)`). */
export async function storedKey(key: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PREFIX + key)))
  let s = ''
  for (const b of d) s += b.toString(16).padStart(2, '0')
  return s
}

/** Resultados guardados de esos árboles (los que estén). */
export async function loadResults(keys: string[]): Promise<Map<string, StoredResult>> {
  const out = new Map<string, StoredResult>()
  const d = await db()
  if (!d || !keys.length) return out
  const hashed = await Promise.all(keys.map(storedKey))
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readonly')
      const s = tx.objectStore(STORE)
      hashed.forEach((h, i) => {
        const req = s.get(h)
        req.onsuccess = () => {
          const v = req.result as { r?: StoredResult } | undefined
          if (v?.r) out.set(keys[i], v.r)
        }
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
  return out
}

let pending: Array<{ key: string; r: StoredResult }> = []
let flush: ReturnType<typeof setTimeout> | null = null
let writes = 0

/** Guarda un resultado (agrupados: una transacción cada ~0,5 s). */
export function saveResult(key: string, r: StoredResult): void {
  pending.push({ key, r })
  flush ??= setTimeout(() => void writePending(), 500)
}

async function writePending(): Promise<void> {
  flush = null
  const batch = pending
  pending = []
  const d = await db()
  if (!d || !batch.length) return
  const hashed = await Promise.all(batch.map((b) => storedKey(b.key)))
  const t = Date.now()
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite')
      const s = tx.objectStore(STORE)
      batch.forEach((b, i) => s.put({ r: b.r, t }, hashed[i]))
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve() // sin lugar (cuota llena): se sigue sin guardar
    } catch {
      resolve()
    }
  })
  writes += batch.length
  if (writes >= 200) {
    writes = 0
    await prune(d)
  }
}

/** Si hay más de `MAX_ENTRIES`, borra los más viejos hasta quedar en el 90 %. */
async function prune(d: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite')
      const s = tx.objectStore(STORE)
      const count = s.count()
      count.onsuccess = () => {
        let extra = count.result - Math.floor(MAX_ENTRIES * 0.9)
        if (count.result <= MAX_ENTRIES || extra <= 0) return
        const cur = s.index('t').openCursor()
        cur.onsuccess = () => {
          const c = cur.result
          if (!c || extra-- <= 0) return
          c.delete()
          c.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}
