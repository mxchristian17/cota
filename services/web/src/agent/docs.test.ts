import { describe, expect, it } from 'vitest'
import '../render/csg'
import { makeEngine } from '../test/engineHarness'
import { parseScript } from '../core/commands/script'
import { GUIDES } from './docs'
import { box3 } from './describe'

/** Líneas de ejemplo de una guía: las que empiezan con dos espacios y un comando. */
const examples = (md: string) => md.split('\n').filter((l) => /^ {2}[A-Z-]/.test(l)).map((l) => l.trim())

/** Lo que tiene que haber al final de cada guía (para que un ejemplo que no hace nada no pase). */
const RESULT: Record<string, Array<[string, number]>> = {
  'draw-2d': [['CIRCLE', 2], ['ARC', 2], ['ELLIPSE', 1], ['SPLINE', 1], ['POINT', 1]],
  'modify-2d': [['ARC', 1], ['CIRCLE', 14]],
  annotate: [['TEXT', 1], ['DIMENSION', 5], ['HATCH', 1]],
  properties: [],
  'solids-3d': [['SOLID3D', 8]],
  'blocks-groups': [['INSERT', 2]],
}

describe('Guías del agente: cada ejemplo corre tal cual', () => {
  for (const [id, md] of Object.entries(GUIDES)) {
    const ex = examples(md)
    if (!ex.length) continue
    it(id, async () => {
      const h = makeEngine()
      for (const line of ex) {
        const r = await h.engine.runScript(parseScript(line), { finish: 'cancel' })
        expect({ line, ok: r.ok, error: r.error, cancelledAt: r.cancelledAt, tail: r.ok && !r.cancelledAt ? [] : r.transcript.slice(-4) }).toEqual({ line, ok: true, error: undefined, cancelledAt: undefined, tail: [] })
      }
      for (const [type, n] of RESULT[id] ?? []) expect([type, h.doc.entities.filter((e) => e.type === type).length]).toEqual([type, n])
      if (id === 'annotate') expect(h.doc.entities.some((e) => e.type === 'ARC' && e.props.thread)).toBe(true)
      if (id === 'blocks-groups') expect(h.doc.groups).toHaveLength(1)
      if (id === 'solids-3d') {
        // La pieza torneada del ejemplo: Ø100 × 77 de alto, alrededor del eje Z del mundo.
        const rev = h.doc.entities.filter((e) => e.type === 'SOLID3D' && e.props.op === 'REVOLVE').at(-1)!
        const [lo, hi] = box3(rev)
        expect([lo, hi].flat().map((v) => Math.round(v))).toEqual([-50, -50, 0, 50, 50, 77])
      }
    })
  }
})
