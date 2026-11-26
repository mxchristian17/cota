import { describe, expect, it } from 'vitest'
import type { Entity } from '../document/types'
import { classifyPieces, isSmall, lodActive, lodKey, LOD_MIN_ENTITIES, sizeKey, sizeSignature } from './lod'

const box = (id: string, x = 0): Entity =>
  ({ id, type: 'SOLID3D', layer: '0', props: { op: 'BOX', origin: [x, 0, 0], width: 4, depth: 2, height: 2 } }) as Entity

describe('dibujo por tamaño en pantalla', () => {
  it('la firma de tamaño de una caja sale de sus hojas (sin CSG)', () => {
    const s = sizeSignature(box('a'))!
    expect(s.c).toEqual([2, 1, 1])
    expect(s.r).toBeCloseTo(Math.hypot(4, 2, 2) / 2, 12)
  })

  it('la guardada se usa si su clave coincide y se recalcula si la pieza cambió', () => {
    const e = box('a')
    ;(e as { size?: unknown }).size = { c: [9, 9, 9], r: 1, k: sizeKey(e) }
    expect(sizeSignature(e)!.c).toEqual([9, 9, 9]) // la del archivo (D3)
    ;(e.props as { origin: number[] }).origin = [10, 0, 0]
    expect(sizeSignature(e)!.c).toEqual([12, 1, 1]) // movida: la firma vieja ya no vale
  })

  it('sólo sólidos y mallas', () => {
    expect(sizeSignature({ id: 'l', type: 'LINE', layer: '0', props: { start: [0, 0, 0], end: [1, 0, 0] } } as Entity)).toBeNull()
  })

  it('histéresis: entra a punto por debajo de 3 px y vuelve por encima de 4 px', () => {
    expect(isSmall(2.9, 3, undefined)).toBe(true)
    expect(isSmall(3.5, 3, true)).toBe(true)
    expect(isSmall(3.5, 3, false)).toBe(false)
    expect(isSmall(4.1, 3, true)).toBe(false)
  })

  it('se activa con muchos objetos o sólidos costosos (D2), y RENDERMINPX = 0 lo apaga (D1)', () => {
    const many = Array.from({ length: LOD_MIN_ENTITIES + 1 }, (_, i) => box(`b${i}`, i * 5))
    expect(lodActive(many, 3)).toBe(true)
    expect(lodActive(many.slice(0, 10), 3)).toBe(false)
    const fillet = { id: 'f', type: 'SOLID3D', layer: '0', props: { op: 'UNION', operands: [box('x').props, box('y', 2).props] } } as Entity
    expect(lodActive([fillet], 3)).toBe(true)
    expect(lodActive(many, 0)).toBe(false)
  })

  it('cada pieza de un bloque tiene su clase aunque compartan el id de la inserción', () => {
    // Un ensamble insertado: todas sus piezas llevan el id de la inserción. Un tornillo chico no manda todo a puntos.
    const mesh = (size: number, x: number): Entity =>
      ({ id: 'ins', type: 'MESH3D', layer: '0', props: { vertices: [[x, 0, 0], [x + size, 0, 0], [x, size, 0]], faces: [[0, 1, 2]] } }) as Entity
    const big = mesh(400, 0)
    const screw = mesh(1, 500)
    const px = (s: { r: number }) => 2 * s.r // 1 unidad = 1 px
    const small = classifyPieces([big, screw], px, 3, new Map())
    expect(small.get(lodKey(screw))).toBe(true)
    expect(small.get(lodKey(big))).toBeUndefined()
    // Histéresis por pieza: entre 3 y 4 px cada una sigue como estaba (el tornillo punto, el resto completo).
    const band = classifyPieces([big, screw], () => 3.5, 3, small)
    expect([...band.keys()]).toEqual([lodKey(screw)])
  })
})
