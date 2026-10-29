import { describe, expect, it } from 'vitest'
import config from '../vite.config'

describe('build de producción', () => {
  it('conserva los nombres de clases (acad-ts los usa para leer y escribir DWG; minificados fallaba con "Rt is not a DXF subclass")', () => {
    const c = config as unknown as { build: { rolldownOptions: { output: { keepNames: boolean } } }; worker: { rolldownOptions: { output: { keepNames: boolean } } } }
    expect(c.build.rolldownOptions.output.keepNames).toBe(true)
    expect(c.worker.rolldownOptions.output.keepNames).toBe(true)
  })
})
