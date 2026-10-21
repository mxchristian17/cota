import type { Vec3 } from '../math'

/** Malla con nombre para (de)serializar OBJ. */
export interface ObjMesh {
  name: string
  vertices: Vec3[]
  /** Caras por índices locales (0-based) a `vertices`. */
  faces: number[][]
}

/**
 * Serializa mallas a OBJ ASCII. Los índices OBJ son 1-based y globales, así que
 * se acumula un offset por malla (`o <name>` separa objetos).
 */
export function exportObj(meshes: ObjMesh[]): string {
  let out = '# Cota OBJ export\n'
  let base = 0
  for (const m of meshes) {
    out += `o ${m.name}\n`
    for (const v of m.vertices) out += `v ${v[0]} ${v[1]} ${v[2]}\n`
    for (const f of m.faces) out += 'f ' + f.map((i) => i + 1 + base).join(' ') + '\n'
    base += m.vertices.length
  }
  return out
}

interface RawMesh {
  name: string
  faces: number[][] // índices globales (0-based)
}

/**
 * Parsea OBJ ASCII a mallas. Los vértices son globales; cada `o`/`g` abre un objeto.
 * Las caras poligonales se triangulan por abanico. Ignora normales/UV (`v/vt/vn`).
 * Devuelve cada malla con vértices remapeados a índices locales.
 */
export function importObj(text: string): ObjMesh[] {
  const gverts: Vec3[] = []
  const raws: RawMesh[] = []
  let cur: RawMesh | null = null
  const ensure = (): RawMesh => {
    if (!cur) {
      cur = { name: `mesh${raws.length + 1}`, faces: [] }
      raws.push(cur)
    }
    return cur
  }

  for (const line of text.split(/\r?\n/)) {
    const s = line.trim()
    if (s === '' || s.startsWith('#')) continue
    const parts = s.split(/\s+/)
    const tag = parts[0]
    if (tag === 'v') {
      gverts.push([Number(parts[1]) || 0, Number(parts[2]) || 0, Number(parts[3]) || 0])
    } else if (tag === 'o' || tag === 'g') {
      cur = { name: parts.slice(1).join(' ') || `mesh${raws.length + 1}`, faces: [] }
      raws.push(cur)
    } else if (tag === 'f') {
      const idx = parts
        .slice(1)
        .map((tok) => {
          const n = parseInt(tok.split('/')[0], 10)
          return Number.isNaN(n) ? NaN : n < 0 ? gverts.length + n : n - 1 // → 0-based global
        })
        .filter((i) => Number.isInteger(i) && i >= 0 && i < gverts.length)
      const raw = ensure()
      for (let i = 1; i + 1 < idx.length; i++) raw.faces.push([idx[0], idx[i], idx[i + 1]])
    }
  }

  // Remapear índices globales → locales por malla.
  return raws
    .filter((r) => r.faces.length > 0)
    .map((r) => {
      const map = new Map<number, number>()
      const vertices: Vec3[] = []
      const faces = r.faces.map((f) =>
        f.map((gi) => {
          let li = map.get(gi)
          if (li === undefined) {
            li = vertices.length
            map.set(gi, li)
            vertices.push(gverts[gi])
          }
          return li
        }),
      )
      return { name: r.name, vertices, faces }
    })
}
