/**
 * Caché que desaloja lo menos usado (LRU). Los cachés de sólidos se vaciaban enteros al pasar un tope chico (50): con
 * un modelo de 96 sólidos, cada recorrida de todos ellos (snaps, contornos, selección) recalculaba mallas y topologías
 * desde cero, más de un segundo por vez. Con LRU, lo que se sigue usando queda y sólo sale lo que hace rato no se pide.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>()

  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }

  set(key: K, value: V): void {
    this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}
