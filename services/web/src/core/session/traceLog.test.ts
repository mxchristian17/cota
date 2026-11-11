import { describe, it, expect } from 'vitest'
import { TraceLog, formatTrace, traceArg } from './traceLog'

/** Registro con reloj y dibujo simulados: el dibujo es el número de acciones hechas hasta la instantánea. */
function makeLog() {
  let t = 1_000_000
  let doc = 0
  const log = new TraceLog(() => ({ actions: doc }), () => t)
  const act = (name: string, dt = 1000) => {
    t += dt
    log.record(name, [name])
    doc++
  }
  return { log, act, advance: (dt: number) => (t += dt) }
}

describe('TraceLog', () => {
  it('the last n lines start at the newest snapshot before them, so the replay is exact', () => {
    const { log, act } = makeLog()
    for (let i = 0; i < 400; i++) act(`a${i}`)
    const w = log.window('Lines', 10)!
    // Instantáneas cada 150 eventos: en 0, 150 y 300; las últimas 10 líneas (390–399) arrancan en la de 300.
    expect(w.doc).toEqual({ actions: 300 })
    expect(w.events[0].a).toBe('a300')
    expect(w.events).toHaveLength(100)
    expect(w.fromCheckpoint).toBe(90)
  })

  it('an open/new marks a fresh snapshot for what follows; by minutes, a long pause also takes one', () => {
    const { log, act, advance } = makeLog()
    act('openDeviceFile')
    log.markCheckpoint()
    act('submitCommand')
    act('viewportClick')
    const w = log.window('Lines', 1)!
    expect(w.events.map((e) => e.a)).toEqual(['submitCommand', 'viewportClick'])
    expect(w.doc).toEqual({ actions: 1 }) // el dibujo ya abierto
    expect(w.fromCheckpoint).toBe(1)
    advance(10 * 60_000)
    act('cancel')
    const m = log.window('Minutes', 1)!
    expect(m.events.map((e) => e.a)).toEqual(['cancel'])
    expect(m.doc).toEqual({ actions: 3 })
  })

  it('arguments are kept serializable and small', () => {
    expect(traceArg({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 })
    expect(traceArg(() => 1)).toBe('[fn]')
    expect(traceArg(new Float32Array(3))).toBe('[binary]')
    expect(traceArg(new Map())).toBe('[Map]')
    const { log } = makeLog()
    log.record('big', ['x'.repeat(10_000)])
    expect(log.window('Lines', 1)!.events[0].args).toEqual(['[too large]'])
  })

  it('actions nested in another action (or asked by a command) are not recorded', () => {
    const { log } = makeLog()
    expect(log.recording).toBe(true)
    log.nested(() => expect(log.recording).toBe(false))
    expect(log.recording).toBe(true)
  })

  it('formats events one per line, then the drawing', () => {
    const { log, act } = makeLog()
    act('submitCommand')
    const text = formatTrace(log.window('Lines', 5)!, { cota: '9.9.9' })
    expect(text).toContain('# cota: 9.9.9')
    expect(text).toMatch(/\n\d\d:\d\d:\d\d\.\d{3} submitCommand \["submitCommand"\]\n/)
    expect(text.trim().endsWith('{"actions":0}')).toBe(true)
  })
})
