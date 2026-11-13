import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { SolidProps } from '../core/document/types'

/** Núcleo exacto de mentira: disponible, sin resultados hasta que el test los pone. */
const kernel = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  requested: [] as string[],
  listeners: [] as Array<(keys: string[]) => void>,
}))
vi.mock('./occtKernel', () => ({
  kernelAvailable: () => true,
  kernelResult: (key: string) => kernel.results.get(key),
  requestKernel: (key: string) => void kernel.requested.push(key),
  onKernelResults: (fn: (keys: string[]) => void) => {
    kernel.listeners.push(fn)
    return () => {}
  },
}))

const { displaySolidEdges, displaySolidGeometry, displaySolidTopology, onSolidsChanged, solidGeometry } = await import('./csg')
const { solidPending } = await import('../core/editing/topology')
const { sysvars } = await import('../core/commands/sysvars')

const box = (x: number): SolidProps => ({ op: 'BOX', origin: [x, 0, 0], width: 10, depth: 6, height: 4 })
const cyl = (x: number): SolidProps => ({ op: 'CYLINDER', base: [x + 5, 3, -1], radius: 1, height: 6, segments: 24 })
const plate = (x: number): SolidProps => ({
  op: 'FILLETEDGE',
  solid: { op: 'SUBTRACT', operands: [box(x), cyl(x)] },
  edges: [{ at: [x, 0, 2] }],
  radius: 1,
})

function bbox(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox()
  return g.boundingBox as THREE.Box3
}

describe('dibujo de sólidos mientras el núcleo exacto calcula', () => {
  beforeEach(() => {
    sysvars.SOLIDKERNEL = 'OCCT'
    kernel.results.clear()
    kernel.requested.length = 0
  })

  it('muestra un boceto (la pieza sin agujero ni empalmes) sin calcular la malla, y pide el resultado exacto', () => {
    const p = plate(0)
    const g = displaySolidGeometry(p)
    expect(g.userData.rough).toBe(true)
    expect(kernel.requested).toEqual([JSON.stringify(p)])
    // El boceto es la caja entera: mismas medidas que el sólido terminado.
    const b = bbox(g)
    expect(b.min.toArray()).toEqual([0, 0, 0])
    expect(b.max.toArray()).toEqual([10, 6, 4])
    expect(g.getAttribute('normal')).toBeTruthy()
    // Aristas del boceto: las 12 de la caja.
    expect(displaySolidEdges(p).length).toBe(12 * 6)
    expect(solidPending(p)).toBe(true)
    // Para elegirlo con el cursor, la topología del boceto.
    expect(displaySolidTopology(p)?.verts.length).toBeGreaterThan(0)
  })

  it('una unión junta sus operandos; una resta muestra el primero', () => {
    const u: SolidProps = { op: 'UNION', operands: [box(0), box(20)] }
    expect(bbox(displaySolidGeometry(u)).max.x).toBe(30)
    const s: SolidProps = { op: 'SUBTRACT', operands: [box(40), box(45)] }
    const b = bbox(displaySolidGeometry(s))
    expect([b.min.x, b.max.x]).toEqual([40, 50])
  })

  it('las hojas que la malla resuelve igual no esperan al núcleo', () => {
    const g = displaySolidGeometry(box(60))
    expect(g.userData.rough).toBeUndefined()
    expect(kernel.requested).toEqual([])
    expect(solidPending(box(60))).toBe(false)
  })

  it('con el núcleo de malla (SOLIDKERNEL = MESH) no hay boceto', () => {
    sysvars.SOLIDKERNEL = 'MESH'
    const g = displaySolidGeometry(plate(80))
    expect(g.userData.rough).toBeUndefined()
    expect(kernel.requested).toEqual([])
  })

  it('si el núcleo falla, avisa para redibujar y queda la malla con el empalme', () => {
    const p = plate(100)
    expect(displaySolidGeometry(p).userData.rough).toBe(true)
    let redraws = 0
    onSolidsChanged(() => redraws++)
    kernel.results.set(JSON.stringify(p), { ok: false, op: 'FILLETEDGE', message: 'too large', size: 1 })
    for (const fn of kernel.listeners) fn([JSON.stringify(p)])
    expect(redraws).toBe(1)
    const g = displaySolidGeometry(p)
    expect(g.userData.rough).toBeUndefined()
    expect(g).toBe(solidGeometry(p)) // la malla de respaldo, la misma que usan medir y exportar
    expect(solidPending(p)).toBe(false)
  })

  it('al empalmar un sólido ya calculado, el boceto es ese sólido tal cual', () => {
    const child = plate(120)
    // El hijo ya tiene su malla (p. ej. la pidieron los snaps): el boceto la reutiliza.
    const ready = solidGeometry(child)
    const p: SolidProps = { op: 'CHAMFEREDGE', solid: child, edges: [{ at: [130, 3, 4], base: [129, 3, 4] }], d1: 0.5, d2: 0.5 }
    const g = displaySolidGeometry(p)
    expect(g.userData.rough).toBe(true)
    expect(bbox(g).equals(bbox(ready))).toBe(true)
  })
})
