import { describe, expect, it } from 'vitest'
import type { Entity, NoteProps } from '../document/types'
import { applyGrip, entityGrips } from '../editing/grips'
import { fitNoteText, mapNote, noteCloseHit, notePoint, sanitizeNote, unflipNote } from './note'

const base = (): NoteProps => ({ origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], size: [40, 20], text: 'Revisar el chaflán', color: 'yellow' })
const note = (p = base()): Entity => ({ id: 'n1', type: 'NOTE', layer: '0', props: p }) as Entity

describe('notas rápidas', () => {
  it('the text grows to fill the note and wraps when it is long', () => {
    const short = fitNoteText('Hola', [40, 20])
    const long = fitNoteText('Revisar el chaflán de esta pieza antes de mandarla a fabricar', [40, 20])
    expect(short.lines).toEqual(['Hola'])
    expect(long.lines.length).toBeGreaterThan(1)
    expect(short.em).toBeGreaterThan(long.em)
  })

  it('the bottom-right grip resizes it (top-left stays); the others draw a leader', () => {
    const e = note()
    const grips = entityGrips(e)
    const br = grips.find((g) => g.role.t === 'note-anchor' && g.role.index === 2)!
    applyGrip(e, br, [50, -10, 0])
    const p = (e as { props: NoteProps }).props
    expect(p.size).toEqual([50, 30])
    expect(notePoint(p, 0, 1)).toEqual([0, 20, 0])
    const mid = grips.find((g) => g.role.t === 'note-anchor' && g.role.index === 3)!
    applyGrip(e, mid, [80, 5, 0])
    applyGrip(e, mid, [90, 5, 0]) // el mismo nodo mueve la punta del leader que ya salía de ahí
    expect(p.leaders).toEqual([{ at: [1, 0.5], to: [90, 5, 0] }])
  })

  it('moves, rotates and mirrors with its leaders, and stays readable when mirrored', () => {
    const p = { ...base(), leaders: [{ at: [1, 0.5] as [number, number], to: [60, 10, 0] as [number, number, number] }] }
    const m = unflipNote(mapNote(p, (v) => [-v[0], v[1], v[2]]))
    expect(m.u.map((x) => x + 0)).toEqual([1, 0, 0]) // sigue leyéndose de izquierda a derecha
    expect(m.origin).toEqual([-40, 0, 0])
    expect(m.leaders?.[0]).toEqual({ at: [0, 0.5], to: [-60, 10, 0] })
  })

  it('the close cross is the top-right corner', () => {
    expect(noteCloseHit(base(), [39, 19, 0])).toBe(true)
    expect(noteCloseHit(base(), [20, 10, 0])).toBe(false)
  })

  it('a .cota note is validated: broken data is fixed or dropped', () => {
    expect(sanitizeNote({ ...base(), u: [2, 0, 0], color: 'red' })).toMatchObject({ u: [1, 0, 0], color: 'yellow' })
    expect(sanitizeNote({ ...base(), size: [0, 5] })).toBeNull()
    expect(sanitizeNote({ origin: [0, 0] })).toBeNull()
  })
})
