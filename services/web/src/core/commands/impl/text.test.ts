import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../../test/engineHarness'
import type { TextProps } from '../../document/types'
import { textCorners, textTop } from '../../geom/text'
import { typeLabel } from '../../editing/props'
import { decodeTextCodes, encodeTextCodes } from '../../text/codes'

const texts = (h: ReturnType<typeof makeEngine>) => h.ofType('TEXT').map((e) => e.props as TextProps)

describe('TEXT y MTEXT del CAD clásico', () => {
  it('TEXT se apoya sobre su línea base: el punto queda abajo a la izquierda del texto', async () => {
    const h = makeEngine()
    await h.run('TEXT', '10,20', '2.5', '0', 'Cota', '')
    const [t] = texts(h)
    expect(t.kind).toBe('text')
    expect(t.position).toEqual([10, 20, 0])
    expect(textTop(t)[1]).toBeGreaterThan(20)
    const ys = textCorners(t).map((c) => c[1])
    expect(Math.max(...ys)).toBeGreaterThan(20 + 2)
    expect(Math.min(...ys)).toBeLessThan(20) // los descendentes, debajo de la línea base
  })

  it('cada Enter empieza otro renglón (otro texto, debajo); un renglón vacío termina', async () => {
    const h = makeEngine()
    await h.run('TEXT', '0,0', '2', '0', 'uno', 'dos', '')
    const [a, b] = texts(h)
    expect([a.text, b.text]).toEqual(['uno', 'dos'])
    expect(b.position[0]).toBeCloseTo(0, 9)
    expect(b.position[1]).toBeLessThan(-2)
    expect(h.engine.busy).toBe(false)
  })

  it('Justify Center o Right: el punto es el centro o el final de la línea base, y se recuerda', async () => {
    const h = makeEngine()
    await h.run('TEXT', 'J', 'C', '50,0', '2', '0', 'medio', '')
    await h.run('TEXT', '60,0', '2', '0', 'otro', '')
    await h.run('TEXT', 'J', 'R', '70,0', '2', '0', 'fin', '')
    expect(texts(h).map((t) => t.justify)).toEqual(['center', 'center', 'right'])
    const c = textCorners(texts(h)[0]).map((p) => p[0])
    expect((Math.min(...c) + Math.max(...c)) / 2).toBeCloseTo(50, 9)
    await h.run('TEXT', 'J', 'L', '0,0', '2', '0', 'x', '')
  })

  it('%%c, %%d y %%p se ven como Ø, ° y ±; MTEXT queda como MTEXT', async () => {
    const h = makeEngine()
    await h.run('TEXT', '0,0', '2', '0', '%%c20 %%p0.05 30%%d 100%%%', '')
    expect(texts(h)[0].text).toBe('Ø20 ±0.05 30° 100%')
    await h.run('MTEXT', '0,50', '2', '0', 'a %%C5', 'b', '')
    const m = h.ofType('TEXT')[1]
    expect((m.props as TextProps).text).toBe('a Ø5\nb')
    expect(typeLabel(m)).toBe('MTEXT')
    expect(typeLabel(h.ofType('TEXT')[0])).toBe('TEXT')
    expect(decodeTextCodes('%%065%%u')).toBe('A')
    expect(encodeTextCodes('Ø ± ° 5%')).toBe('%%c %%p %%d 5%%%')
  })
})
