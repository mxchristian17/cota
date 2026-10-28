import { describe, expect, it } from 'vitest'
import { makeEngine } from '../../test/engineHarness'
import { parseScript, scriptFromHash, scriptLink } from './script'

describe('Multicomandos', () => {
  it('separa por espacios y renglones; "" es Enter y las comillas guardan espacios', () => {
    expect(parseScript('CIRCLE 50,50 20\nLINE 0,0 @100,0 ""\nTEXT 0,0 5 0 "Hola \\"mundo\\"" ""')).toEqual([
      'CIRCLE', '50,50', '20', 'LINE', '0,0', '@100,0', '', 'TEXT', '0,0', '5', '0', 'Hola "mundo"', '',
    ])
  })

  it('el enlace para compartir lleva el lote en el fragmento y vuelve igual (también con acentos)', () => {
    const t = 'TEXT 0,0 5 0 "Pieza ñandú Ø20" ""'
    const link = scriptLink(t, 'https://example.org/cota/#otra')
    expect(link.startsWith('https://example.org/cota/#script=')).toBe(true)
    expect(scriptFromHash(link.slice(link.indexOf('#')))).toBe(t)
    expect(scriptFromHash('#nada')).toBeNull()
  })

  it('corre varios comandos seguidos; una entrada inválida corta el lote y cancela el comando', async () => {
    const h = makeEngine()
    const ok = await h.engine.runScript(parseScript('CIRCLE 50,50 20 "" LINE 0,0 @100,0 @0,60 ""'), { finish: 'cancel' })
    expect(ok.ok).toBe(true)
    expect(h.ofType('CIRCLE')).toHaveLength(1)
    expect(h.ofType('LINE')).toHaveLength(2)
    const bad = await h.engine.runScript(parseScript('CIRCLE abc 10 LINE 0,0 @5,0 ""'), { finish: 'cancel' })
    expect(bad).toMatchObject({ ok: false, failedAt: 1 })
    expect(h.engine.isBusy()).toBe(false)
    expect(h.ofType('CIRCLE')).toHaveLength(1) // ni el círculo ni la línea del resto
    expect(h.ofType('LINE')).toHaveLength(2)
    const unknown = await h.engine.runScript(['FOO'], { finish: 'cancel' })
    expect(unknown).toMatchObject({ ok: false, failedAt: 0 })
  })

  it('un valor fuera de rango que el comando vuelve a pedir también corta; al final, cancel deja la línea de comandos libre', async () => {
    const h = makeEngine()
    h.add('LINE', { start: [0, 0, 0], end: [100, 0, 0] })
    const r = await h.engine.runScript(parseScript('POLYGON 1 0,0'), { finish: 'cancel' })
    expect(r.ok).toBe(false)
    const open = await h.engine.runScript(parseScript('LINE 0,0 @10,0'), { finish: 'cancel' })
    expect(open).toMatchObject({ ok: true, cancelledAt: 'Specify next point or [Close/Undo]: ' })
    expect(h.engine.isBusy()).toBe(false)
  })
})
