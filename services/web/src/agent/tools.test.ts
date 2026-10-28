import { describe, expect, it } from 'vitest'
import '../render/csg'
import { makeEngine } from '../test/engineHarness'
import { parseScript } from '../core/commands/script'
import { AGENT_TOOLS, runTool, type AgentHost } from './tools'
import { SYSTEM_PROMPT } from './systemPrompt'

function setup() {
  const h = makeEngine()
  const host: AgentHost = {
    doc: h.doc,
    runScript: (t) => h.engine.runScript(parseScript(t), { finish: 'cancel' }),
    select: (ids) => h.setSelection(ids),
    setProperties: (ids, p) => {
      for (const id of ids) {
        const e = h.doc.getEntity(id)
        if (e && p.layer) e.layer = h.doc.layers.find((l) => l.name === p.layer)!.id
        if (e && p.color) e.color = p.color
      }
      return ids.length
    },
    undo: () => {},
    commands: () => h.engine.getCommands(),
    ucsName: () => 'World',
  }
  return { h, host }
}

describe('Herramientas del agente', () => {
  it('el catálogo y el system prompt nombran las mismas herramientas', () => {
    for (const t of AGENT_TOOLS) expect(SYSTEM_PROMPT).toContain(`- ${t.name}(`)
  })

  it('run_commands informa lo creado con descripción paramétrica; un error dice qué entrada falló', async () => {
    const { host } = setup()
    const ok = await runTool(host, 'run_commands', { script: 'CIRCLE 30,30 10\nLINE 0,0 @50,0 ""' })
    expect(ok.text).toMatch(/^OK/)
    expect(ok.text).toContain('CIRCLE center 30,30,0 r 10')
    expect(ok.text).toContain('LINE 0,0,0 → 50,0,0')
    const bad = await runTool(host, 'run_commands', { script: 'CIRCLE 0,0 nope' })
    expect(bad.isError).toBe(true)
    expect(bad.text).toMatch(/^STOPPED at input 3/)
  })

  it('query_objects filtra por caja y tipo; describe_object da los parámetros; select fija la selección', async () => {
    const { h, host } = setup()
    await runTool(host, 'run_commands', { script: 'CIRCLE 0,0 5 CIRCLE 100,0 5 LINE 0,0 @10,0 ""' })
    const q = await runTool(host, 'query_objects', { box: { min: [-10, -10, -1], max: [20, 10, 1] }, types: ['CIRCLE'] })
    expect(q.text.split('\n')[0]).toBe('1 object(s):')
    const id = q.text.split('\n')[1].split(' | ')[0]
    expect((await runTool(host, 'describe_object', { ids: [id] })).text).toContain('"radius":5')
    await runTool(host, 'select', { ids: [id] })
    await runTool(host, 'run_commands', { script: 'MOVE 0,0 @0,20' })
    expect((h.doc.getEntity(id) as { props: { center: number[] } }).props.center).toEqual([0, 20, 0])
  })

  it('get_drawing resume el dibujo; read_doc da guías y listados de comandos por menú', async () => {
    const { host } = setup()
    await runTool(host, 'run_commands', { script: 'BOX 0,0,0 10,10,0 5' })
    const d = (await runTool(host, 'get_drawing', {})).text
    expect(d).toContain('Objects: SOLID3D 1')
    expect(d).toContain('Extents: 0,0,0 .. 10,10,5')
    expect((await runTool(host, 'read_doc', { id: 'draw-2d' })).text).toContain('# Drawing in 2D')
    expect((await runTool(host, 'read_doc', { id: 'commands/draw' })).text).toContain('CIRCLE')
    expect((await runTool(host, 'read_doc', { id: 'nada' })).isError).toBe(true)
  })
})
