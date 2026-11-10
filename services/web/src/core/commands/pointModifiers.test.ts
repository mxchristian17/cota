import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import type { LineProps } from '../document/types'

describe('modificadores de punto', () => {
  it('M2P: el medio entre dos puntos responde el prompt; FROM: base + desplazamiento', async () => {
    const h = makeEngine()
    await h.run('LINE', 'm2p', '#0,0', '#10,4', 'from', '#100,100', '@5,-5', '')
    const l = h.ofType('LINE')[0].props as LineProps
    expect(l.start).toEqual([5, 2, 0])
    expect(l.end).toEqual([105, 95, 0])
  })
})
