import * as THREE from 'three'

/**
 * Orden de dibujo en pantalla, como el CAD clásico: lo que va después en la lista se dibuja encima. Cada vértice lleva
 * el rango de su objeto (`drawRank`) y el shader lo acerca a la cámara en proporción: entre cosas en el mismo plano
 * gana la de rango mayor, sin importar en qué lote (draw call) vaya. Vale sólo mirando en planta: en una vista 3D el
 * adelanto de los últimos de una lista larga (centímetros) hacía ver una pieza o una línea a través de otra que está
 * adelante, así que ahí manda la profundidad real (`rankScale` en 0), como en los estilos 3D del CAD clásico.
 */
export const RANK_ATTR = 'drawRank'

/** Factor del adelanto, común a todos los materiales: 1 en planta, 0 en vistas 3D (lo fija el viewport al dibujar). */
export const rankScale = { value: 1 }

/** Paso de profundidad por rango (z del clip): dos unidades de un buffer de profundidad de 24 bits. */
const STEP = 2.5e-7
/** Separación máxima entre el primero y el último (dibujos enormes: el paso se achica). */
const MAX_SPREAD = 0.01

/** Paso por rango para `n` objetos. */
export const rankStep = (n: number): number => Math.min(STEP, MAX_SPREAD / Math.max(1, n))

/**
 * Material que respeta el rango de dibujo: resta `rango · paso` a la profundidad. `instanced`: las líneas anchas
 * (LineMaterial), con el rango por tramo.
 */
export function ranked<M extends THREE.Material>(m: M, step: number, instanced = false): M {
  // Se encadena con el shader propio del material (p. ej. el desvanecido de una imagen), una sola vez por material.
  const ud = m.userData as { rankStep?: number; rankBase?: M['onBeforeCompile']; rankKey?: () => string }
  if (ud.rankStep === step) return m
  ud.rankBase ??= m.onBeforeCompile
  ud.rankKey ??= m.customProgramCacheKey
  const base = ud.rankBase
  const baseKey = ud.rankKey
  const attr = instanced ? 'instanceRank' : RANK_ATTR
  const k = step.toExponential(6)
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r)
    sh.uniforms.rankScale = rankScale
    const shift = `\n  gl_Position.z -= ${attr} * ${k} * rankScale * gl_Position.w;`
    sh.vertexShader = `attribute float ${attr};\nuniform float rankScale;\n` + (instanced ? sh.vertexShader.replace('gl_Position = clip;', 'gl_Position = clip;' + shift) : sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + shift))
  }
  m.customProgramCacheKey = () => `${baseKey.call(m)}|rank|${instanced}|${k}`
  ud.rankStep = step
  m.needsUpdate = true
  return m
}

/** Rango por vértice de un lote a partir de sus `ranges` (vértice inicial → objeto). */
export function rankArray(count: number, ranges: { s: number; id: string }[], rankOf: (id: string) => number): Float32Array {
  const out = new Float32Array(count)
  for (let i = 0; i < ranges.length; i++) {
    const from = ranges[i].s
    const to = i + 1 < ranges.length ? ranges[i + 1].s : count
    out.fill(rankOf(ranges[i].id), Math.max(0, from), Math.min(count, to))
  }
  return out
}
