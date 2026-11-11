#!/usr/bin/env node
/* global window, setTimeout, process, console */
/**
 * Repite un archivo de TRACEBACK de Cota en el servidor de desarrollo, para reproducir un fallo.
 * El store sólo se expone en modo desarrollo (`npm run dev`), así que no corre contra el sitio publicado.
 *
 * Uso:
 *   node tools/replay-traceback.mjs traceback.txt [--url http://localhost:5173] [--headed] [--shot final.png] [--json out.json]
 *
 * Abre el dibujo de la instantánea y llama cada acción del store con sus argumentos, en orden.
 * `view` restaura la cámara; `selection` y `error` son informativos y se comparan o se muestran.
 * Al final imprime las diferencias de selección y, con `--json`, guarda el dibujo resultante.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

/** Eventos y dibujo de un texto de TRACEBACK. */
export function parseTrace(text) {
  const lines = text.split('\n')
  const ev = lines.indexOf('== EVENTS (UTC time, action, arguments) ==')
  const dr = lines.indexOf('== DRAWING (JSON) ==')
  if (ev < 0 || dr < 0) throw new Error('Not a Cota TRACEBACK file.')
  const events = []
  for (const line of lines.slice(ev + 1, dr)) {
    const m = /^(\S+) (\S+) (.*)$/.exec(line)
    if (m) events.push({ time: m[1], a: m[2], args: JSON.parse(m[3]) })
  }
  return { events, doc: JSON.parse(lines[dr + 1]) }
}

/** Repite los eventos en la página (ya cargada, con `window.__cotaStore`). Devuelve el dibujo final y avisos. */
export async function replayInPage(page, trace, pauseMs = 40) {
  return page.evaluate(
    async ({ doc, events, pauseMs }) => {
      const store = window.__cotaStore
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      const notes = []
      store.getState().doc.load(doc)
      store.getState().redraw()
      await wait(300)
      for (const e of events) {
        const s = store.getState()
        if (e.a === 'selection') {
          const now = [...s.selection].sort().join(',')
          if (now !== [...e.args[0]].sort().join(',')) notes.push(`${e.time} selection differs: expected ${e.args[0].length}, got ${s.selection.length}`)
          continue
        }
        if (e.a === 'error') continue
        if (e.a === 'view') {
          s.activeViewport?.restoreView(e.args[1])
          continue
        }
        const fn = s[e.a]
        if (typeof fn !== 'function') {
          notes.push(`${e.time} unknown action ${e.a}`)
          continue
        }
        try {
          const r = fn(...e.args)
          if (r && typeof r.then === 'function') await r
        } catch (err) {
          notes.push(`${e.time} ${e.a} threw: ${err}`)
        }
        await wait(pauseMs)
      }
      await wait(300)
      return { doc: store.getState().doc.toJSON(), notes }
    },
    { ...trace, pauseMs },
  )
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error('Usage: node tools/replay-traceback.mjs traceback.txt [--url URL] [--headed] [--shot file.png] [--json out.json]')
    process.exit(2)
  }
  const opt = (k) => {
    const i = args.indexOf(k)
    return i >= 0 ? args[i + 1] : undefined
  }
  const trace = parseTrace(readFileSync(file, 'utf8'))
  const browser = await chromium.launch({ headless: !args.includes('--headed'), args: ['--use-gl=angle', '--use-angle=swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  page.on('console', (m) => m.type() === 'error' && console.log('[page error]', m.text()))
  await page.goto(opt('--url') ?? 'http://localhost:5173/')
  await page.waitForFunction(() => window.__cotaStore)
  const { doc, notes } = await replayInPage(page, trace)
  console.log(`Replayed ${trace.events.length} event(s).`)
  for (const n of notes) console.log(n)
  if (opt('--shot')) await page.screenshot({ path: opt('--shot') })
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(doc))
  if (!args.includes('--headed')) await browser.close()
}
