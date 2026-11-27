import type { Vec3 } from '../core/math'

/** Malla lista para la placa de video: vértices con su normal y triángulos por índice. */
export interface MeshRender {
  pos: Float32Array
  nor: Float32Array
  idx: Uint32Array
}

/**
 * Triángulos indexados con normales por vértice: dentro de una superficie suave (las caras se tocan a menos de
 * `creaseDeg`) la normal se promedia y la pieza se ve redonda; donde hay un quiebre el vértice se duplica y la arista
 * queda viva. Ocupa la mitad que repetir los tres vértices de cada triángulo, que es lo que pesa en los modelos 3D
 * grandes (un ensamble de mil piezas no entraba en la memoria de un teléfono). Las posiciones salen relativas a `origin`.
 */
export function meshRender(vertices: ArrayLike<Vec3>, faces: ArrayLike<ArrayLike<number>>, creaseDeg = 30, origin: Vec3 = [0, 0, 0]): MeshRender {
  const nv = vertices.length
  const P = new Float64Array(nv * 3)
  for (let i = 0; i < nv; i++) {
    const v = vertices[i]
    P[i * 3] = v[0]
    P[i * 3 + 1] = v[1]
    P[i * 3 + 2] = v[2]
  }
  let nt = 0
  for (let f = 0; f < faces.length; f++) if (faces[f].length >= 3) nt += faces[f].length - 2
  const tri = new Uint32Array(nt * 3)
  let w = 0
  for (let f = 0; f < faces.length; f++) {
    const q = faces[f]
    for (let i = 1; i + 1 < q.length; i++) {
      tri[w++] = q[0]
      tri[w++] = q[i]
      tri[w++] = q[i + 1]
    }
  }
  return meshRenderFlat(P, tri, creaseDeg, origin)
}

/** Lo mismo, de vértices seguidos (x, y, z) y triángulos por índice (los de un sólido importado o del núcleo). */
export function meshRenderFlat(P: ArrayLike<number>, tri: Uint32Array, creaseDeg = 30, origin: Vec3 = [0, 0, 0]): MeshRender {
  const nv = Math.floor(P.length / 3)
  const nt = Math.floor(tri.length / 3)
  // Normal de cada triángulo: con área (para promediar) y unitaria (para comparar).
  const area = new Float64Array(nt * 3)
  const unit = new Float32Array(nt * 3)
  for (let t = 0; t < nt; t++) {
    const ia = tri[t * 3], ib = tri[t * 3 + 1], ic = tri[t * 3 + 2]
    if (ia >= nv || ib >= nv || ic >= nv) continue
    const ax = P[ia * 3], ay = P[ia * 3 + 1], az = P[ia * 3 + 2]
    const ux = P[ib * 3] - ax, uy = P[ib * 3 + 1] - ay, uz = P[ib * 3 + 2] - az
    const vx = P[ic * 3] - ax, vy = P[ic * 3 + 1] - ay, vz = P[ic * 3 + 2] - az
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx
    area[t * 3] = x
    area[t * 3 + 1] = y
    area[t * 3 + 2] = z
    const l = Math.hypot(x, y, z)
    if (l > 0) {
      unit[t * 3] = x / l
      unit[t * 3 + 1] = y / l
      unit[t * 3 + 2] = z / l
    }
  }
  // Triángulos de cada vértice (lista compacta).
  const start = new Uint32Array(nv + 1)
  for (let k = 0; k < tri.length; k++) if (tri[k] < nv) start[tri[k] + 1]++
  for (let v = 0; v < nv; v++) start[v + 1] += start[v]
  const fill = start.slice(0, nv)
  const corners = new Uint32Array(tri.length)
  for (let k = 0; k < tri.length; k++) if (tri[k] < nv) corners[fill[tri[k]]++] = k
  // Cada vértice se reparte en grupos de triángulos de normal parecida: un vértice nuevo por grupo.
  const cos = Math.cos((creaseDeg * Math.PI) / 180)
  const out = new Uint32Array(tri.length)
  const pos: number[] = []
  const nor: number[] = []
  const seed: number[] = []
  const sum: number[] = []
  let n = 0
  for (let v = 0; v < nv; v++) {
    if (start[v] === start[v + 1]) continue
    seed.length = 0
    sum.length = 0
    for (let j = start[v]; j < start[v + 1]; j++) {
      const k = corners[j]
      const t = (k / 3) | 0
      const ux = unit[t * 3], uy = unit[t * 3 + 1], uz = unit[t * 3 + 2]
      let g = -1
      const flat = ux === 0 && uy === 0 && uz === 0
      for (let i = 0; i < seed.length; i += 3) {
        if (flat || seed[i] * ux + seed[i + 1] * uy + seed[i + 2] * uz >= cos) {
          g = i / 3
          break
        }
      }
      if (g < 0) {
        g = seed.length / 3
        seed.push(ux, uy, uz)
        sum.push(0, 0, 0)
      }
      sum[g * 3] += area[t * 3]
      sum[g * 3 + 1] += area[t * 3 + 1]
      sum[g * 3 + 2] += area[t * 3 + 2]
      out[k] = n + g
    }
    for (let i = 0; i < sum.length; i += 3) {
      const l = Math.hypot(sum[i], sum[i + 1], sum[i + 2]) || 1
      pos.push(P[v * 3] - origin[0], P[v * 3 + 1] - origin[1], P[v * 3 + 2] - origin[2])
      nor.push(sum[i] / l, sum[i + 1] / l, sum[i + 2] / l)
    }
    n += sum.length / 3
  }
  return { pos: Float32Array.from(pos), nor: Float32Array.from(nor), idx: out }
}
