import type { ClipData } from '../editing/clipData'

/**
 * Portapapeles de objetos compartido por las pestañas y ventanas de Cota del mismo navegador y sitio: la última copia
 * se guarda en IndexedDB (los datos, que en un ensamble 3D pesan varios MB, y aparte su id y su hora) y un
 * BroadcastChannel avisa a las pestañas abiertas que hay una nueva. Así se copia en una pestaña y se pega en otra,
 * como entre dos dibujos abiertos del CAD clásico. Sin IndexedDB (tests, navegadores que lo bloquean) no comparte nada:
 * cada pestaña sigue con su portapapeles.
 */

/** Id y hora de una copia (para saber cuál es la más nueva sin leer sus datos). */
export interface ClipMeta {
  id: string
  at: number
}

/** Dónde se guarda la última copia de todas las pestañas. */
export interface ClipStore {
  put(clip: ClipData): Promise<void>
  meta(): Promise<ClipMeta | null>
  get(): Promise<ClipData | null>
}

const DB_NAME = 'cota-clipboard'
const STORE = 'clip'
const CHANNEL = 'cota-clipboard'

const done = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

/** La copia en IndexedDB: claves `data` (la copia) y `meta` (su id y su hora). */
function indexedDbStore(idb: IDBFactory): ClipStore {
  let db: Promise<IDBDatabase> | null = null
  const open = (): Promise<IDBDatabase> => {
    db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }).catch((err: unknown) => {
      db = null // se reintenta la próxima vez
      throw err
    })
    return db
  }
  const read = async <T>(key: string): Promise<T | null> => {
    const tx = (await open()).transaction(STORE, 'readonly')
    return ((await done(tx.objectStore(STORE).get(key))) as T | undefined) ?? null
  }
  return {
    async put(clip) {
      const tx = (await open()).transaction(STORE, 'readwrite')
      const st = tx.objectStore(STORE)
      st.put(clip, 'data')
      st.put({ id: clip.id, at: clip.at } satisfies ClipMeta, 'meta')
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('The copy could not be stored.'))
      })
    },
    meta: () => read<ClipMeta>('meta'),
    get: () => read<ClipData>('data'),
  }
}

let store: ClipStore | null = typeof indexedDB === 'undefined' ? null : indexedDbStore(indexedDB)
let channel: BroadcastChannel | null = null
const listeners = new Set<(m: ClipMeta) => void>()

function openChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel
  channel = new BroadcastChannel(CHANNEL)
  ;(channel as { unref?: () => void }).unref?.() // en Node (tests) no retiene el proceso
  channel.onmessage = (ev: MessageEvent<unknown>) => {
    const m = ev.data as Partial<ClipMeta> | null
    if (typeof m?.id === 'string' && typeof m.at === 'number') for (const fn of listeners) fn({ id: m.id, at: m.at })
  }
  return channel
}

/**
 * Guarda la copia para las demás pestañas y les avisa. false si no se pudo (sin espacio, bloqueado…); null si este
 * navegador no comparte (sin IndexedDB).
 */
export async function shareClip(clip: ClipData): Promise<boolean | null> {
  if (!store) return null
  try {
    await store.put(clip)
  } catch {
    return false
  }
  openChannel()?.postMessage({ id: clip.id, at: clip.at } satisfies ClipMeta)
  return true
}

/** Id y hora de la última copia guardada por cualquier pestaña (null si no hay o no se puede leer). */
export async function sharedClipMeta(): Promise<ClipMeta | null> {
  try {
    return (await store?.meta()) ?? null
  } catch {
    return null
  }
}

/** La última copia guardada por cualquier pestaña. */
export async function loadSharedClip(): Promise<ClipData | null> {
  try {
    return (await store?.get()) ?? null
  } catch {
    return null
  }
}

/** Avisa cada copia nueva hecha en otra pestaña abierta. Devuelve cómo dejar de escuchar. */
export function onSharedClip(fn: (m: ClipMeta) => void): () => void {
  listeners.add(fn)
  if (store) openChannel()
  return () => listeners.delete(fn)
}

/** Sólo para los tests: otro almacén (p. ej. uno en memoria compartido por dos "pestañas"); null deja de compartir. */
export function setClipStore(s: ClipStore | null): void {
  store = s
  if (s && listeners.size) openChannel()
}

/** Sólo para los tests: un almacén en memoria (copia los datos como IndexedDB). */
export function memoryClipStore(): ClipStore {
  let data: ClipData | null = null
  return {
    put: async (clip) => {
      data = structuredClone(clip)
    },
    meta: async () => (data ? { id: data.id, at: data.at } : null),
    get: async () => (data ? structuredClone(data) : null),
  }
}
