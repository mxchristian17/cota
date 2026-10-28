import { expect, test, type Page } from '@playwright/test'

const st = <T,>(page: Page, js: string) => page.evaluate((c) => new Function('s', c)((window as any).__cotaStore.getState()), js) as Promise<T>

/** Proveedor simulado (API de Anthropic): respuestas guionadas, nunca una key ni un servicio real. */
async function fakeProvider(page: Page, replies: unknown[]) {
  const bodies: string[] = []
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    bodies.push(route.request().postData() ?? '')
    const body = replies.shift() ?? { content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 10, output_tokens: 2 } }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
  return bodies
}

const plate = {
  content: [
    { type: 'text', text: 'I will draw the plate and a hole.' },
    { type: 'tool_use', id: 't1', name: 'run_commands', input: { script: 'RECTANGLE 0,0 @100,60\nCIRCLE 50,30 4' } },
  ],
  usage: { input_tokens: 4000, output_tokens: 60 },
}

test.describe('Cota agent panel (browser mode, own API key)', () => {
  test('first key asks once whether to remember it; asks before running; the conversation survives a reload', async ({ page }) => {
    const bodies = await fakeProvider(page, [
      plate,
      { content: [{ type: 'text', text: 'Plate 100×60 with a Ø8 hole in the middle.' }], usage: { input_tokens: 4300, output_tokens: 20 } },
    ])
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    await expect(page.getByTestId('agent-panel')).toBeVisible() // abierto desde la primera visita
    await expect(page.getByTestId('agent-panel')).toBeVisible()
    await page.getByTestId('agent-key').fill('sk-test-not-a-real-key')
    await page.getByTestId('agent-save').click()
    await expect(page.getByTestId('agent-key-decision')).toBeVisible()
    await page.getByTestId('agent-key-session').click()
    await expect(page.getByTestId('agent-settings')).toHaveCount(0)
    await page.getByTestId('agent-input').fill('A 100x60 plate with a hole of 8 mm in the middle')
    await page.getByTestId('agent-send').click()
    // Modo preguntar (por defecto): el lote se muestra y corre al aprobarlo.
    await expect(page.getByTestId('agent-approve')).toContainText('CIRCLE 50,30 4')
    expect(await st<number>(page, 'return s.doc.entities.length')).toBe(0)
    await page.getByTestId('agent-accept').click()
    await expect(page.getByTestId('agent-feed')).toContainText('Plate 100×60 with a Ø8 hole in the middle.')
    expect(await st<number>(page, "return s.doc.entities.filter((e) => e.type === 'CIRCLE').length")).toBe(1)
    // El modelo recibió las herramientas, el resultado del lote y la key sólo en la cabecera.
    expect(JSON.parse(bodies[0]).tools.map((t: { name: string }) => t.name)).toContain('run_commands')
    expect(bodies[1]).toContain('CIRCLE center 50,30,0 r 4')
    await expect(page.getByTestId('agent-meter')).toContainText('Context 2%')
    // Recargar: la conversación sigue (IndexedDB); la key de "sólo esta sesión" no, y la decisión no se vuelve a preguntar.
    await page.reload()
    await expect(input).toBeVisible()
    await expect(page.getByTestId('agent-panel')).toBeVisible() // abierto desde la primera visita
    await expect(page.getByTestId('agent-feed')).toContainText('Plate 100×60 with a Ø8 hole in the middle.')
    await expect(page.getByTestId('agent-settings')).toBeVisible()
    await page.getByTestId('agent-key').fill('sk-test-2')
    await page.getByTestId('agent-save').click()
    await expect(page.getByTestId('agent-key-decision')).toHaveCount(0)
    await expect(page.getByTestId('agent-settings')).toHaveCount(0)
  })

  test('rejected script does not run; automatic mode runs it; COMPACT summarizes the conversation', async ({ page }) => {
    await fakeProvider(page, [
      plate,
      { content: [{ type: 'text', text: 'Ok, tell me what to change.' }], usage: { input_tokens: 10, output_tokens: 2 } },
      plate,
      { content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 10, output_tokens: 2 } },
      { content: [{ type: 'text', text: 'Summary: plate and hole built.' }], usage: { input_tokens: 10, output_tokens: 2 } },
    ])
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    await expect(page.getByTestId('agent-panel')).toBeVisible() // abierto desde la primera visita
    await page.getByTestId('agent-key').fill('sk-test')
    await page.getByTestId('agent-save').click()
    await page.getByTestId('agent-key-remember').click()
    await page.getByTestId('agent-input').fill('plate')
    await page.getByTestId('agent-send').click()
    await page.getByTestId('agent-reject').click()
    await expect(page.getByTestId('agent-feed')).toContainText('Ok, tell me what to change.')
    expect(await st<number>(page, 'return s.doc.entities.length')).toBe(0)
    await page.getByTestId('agent-mode').selectOption('auto')
    await page.getByTestId('agent-input').fill('plate, go ahead')
    await page.getByTestId('agent-send').click()
    await expect(page.getByTestId('agent-feed')).toContainText('Done.')
    expect(await st<number>(page, "return s.doc.entities.filter((e) => e.type === 'CIRCLE').length")).toBe(1)
    // Un solo paso de deshacer para el lote del agente.
    await input.fill('U')
    await input.press('Enter')
    await expect.poll(() => st<number>(page, 'return s.doc.entities.length')).toBe(0)
    await input.fill('COMPACT')
    await input.press('Enter')
    await expect(page.getByTestId('agent-feed')).toContainText('Summary: plate and hole built.')
  })

  test('with the server (Docker): the model is called by the backend with the saved key; conversations are stored there', async ({ page }) => {
    const steps: Array<{ messages: unknown[]; tools: Array<{ name: string }> }> = []
    const saved: Record<string, { title: string }> = {}
    await page.route('**/api/auth/me', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, email: 'demo@example.com' }) }))
    await page.route('**/api/config', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) }))
    await page.route('**/api/ai/config', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'anthropic', api_base: null, model: 'claude', has_key: true }) }))
    await page.route('**/api/agent/conversations', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.entries(saved).map(([id, c]) => ({ id, ...c, updated_at: new Date().toISOString() }))) }))
    await page.route('**/api/agent/conversations/*', async (r) => {
      saved[decodeURIComponent(r.request().url().split('/').pop()!)] = JSON.parse(r.request().postData() ?? '{}')
      await r.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"x"}' })
    })
    await page.route('**/api/agent/step', async (r) => {
      steps.push(JSON.parse(r.request().postData() ?? '{}'))
      const first = steps.length === 1
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(first ? { text: 'Drawing.', tool_calls: [{ id: 't1', name: 'run_commands', args: { script: 'CIRCLE 0,0 12' } }], usage: { input: 3000, output: 20 } } : { text: 'Circle done.', tool_calls: [], usage: { input: 3100, output: 5 } }),
      })
    })
    let direct = 0
    await page.route('https://api.anthropic.com/**', (r) => {
      direct++
      return r.abort()
    })
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    await expect(page.getByTestId('agent-panel')).toBeVisible() // abierto desde la primera visita
    await expect(page.getByTestId('agent-settings')).toHaveCount(0) // la key ya está en el servidor
    await page.getByTestId('agent-mode').selectOption('auto')
    await page.getByTestId('agent-input').fill('a circle of radius 12')
    await page.getByTestId('agent-send').click()
    await expect(page.getByTestId('agent-feed')).toContainText('Circle done.')
    expect(await st<number>(page, "return s.doc.entities.filter((e) => e.type === 'CIRCLE').length")).toBe(1)
    expect(steps[0].tools.map((t) => t.name)).toContain('query_objects')
    expect(JSON.stringify(steps[1].messages)).toContain('CIRCLE center 0,0,0 r 12')
    expect(direct).toBe(0) // el navegador no llamó al proveedor
    await expect.poll(() => Object.values(saved).map((c) => c.title)).toEqual(['a circle of radius 12'])
  })

  test('opens on the first visit; closed it leaves an Agents tab, which Options can hide; all of it is remembered', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('command-input')
    await expect(input).toBeVisible()
    await expect(page.getByTestId('agent-panel')).toBeVisible()
    await page.getByTestId('agent-close').click()
    await expect(page.getByTestId('agent-panel')).toHaveCount(0)
    await expect(page.getByTestId('agent-tab')).toHaveText('Agents')
    await page.reload()
    await expect(input).toBeVisible()
    await expect(page.getByTestId('agent-panel')).toHaveCount(0) // sigue cerrado
    await page.getByTestId('agent-tab').click()
    await expect(page.getByTestId('agent-panel')).toBeVisible()
    await input.fill('AGENT') // el comando también lo alterna
    await input.press('Enter')
    await expect(page.getByTestId('agent-tab')).toBeVisible()
    await input.fill('OPTIONS')
    await input.press('Enter')
    await page.getByTestId('options-tab-user').click()
    await page.getByTestId('options-agent-tab').uncheck()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('agent-tab')).toHaveCount(0)
    await page.reload()
    await expect(input).toBeVisible()
    await expect(page.getByTestId('agent-tab')).toHaveCount(0)
    expect(await st<boolean>(page, 'return s.agentTab')).toBe(false)
  })
})
