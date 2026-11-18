import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Accesibilidad de los diálogos (R37): cada `.modal` es un diálogo modal con nombre (su título). */
describe('diálogos accesibles', () => {
  const dir = join(__dirname)
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'))
  const modals = files.flatMap((f) => {
    const src = readFileSync(join(dir, f), 'utf8')
    return [...src.matchAll(/<div className="modal(?: [^"]*)?"[^>]*>/g)].map((m) => ({ f, tag: m[0], src }))
  })
  it('hay diálogos para revisar', () => expect(modals.length).toBeGreaterThan(15))
  it.each(modals.map((m) => [m.f, m.tag, m.src]))('%s: role="dialog", aria-modal y un título que lo nombra', (_f, tag, src) => {
    expect(tag).toContain('role="dialog"')
    expect(tag).toContain('aria-modal="true"')
    const id = /aria-labelledby="([^"]+)"/.exec(tag)?.[1]
    expect(id).toBeTruthy()
    expect(src).toContain(`id="${id}"`)
  })
})
