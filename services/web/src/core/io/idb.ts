/**
 * Mini-almacén en IndexedDB, sin dependencias.
 *
 * Los `FileSystemDirectoryHandle` sólo se pueden recordar entre sesiones guardándolos en IndexedDB
 * (localStorage no los admite: no son JSON). Se usa un único store clave→valor.
 */
const DB_NAME = 'cota'
const STORE = 'handles'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDb()
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null // modo privado o IndexedDB bloqueado: se sigue sin recordar la carpeta
  }
}

export function idbGet<T>(key: string): Promise<T | null> {
  return withStore<T>('readonly', (store) => store.get(key))
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await withStore('readwrite', (store) => store.put(value, key))
}

export async function idbDelete(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key))
}
