import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ABOUT, aboutLine } from './about'
import { makeEngine } from '../test/engineHarness'

describe('ABOUT', () => {
  it('takes the version from package.json and credits the author', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'))
    expect(ABOUT.version).toBe(pkg.version)
    expect(aboutLine()).toContain('Christian Orengia')
  })

  it('prints the credits', async () => {
    const h = makeEngine()
    await h.run('ABOUT')
    expect(h.prints.join('\n')).toContain(`Cota ${ABOUT.version}`)
  })
})
