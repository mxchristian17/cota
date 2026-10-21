import { describe, it, expect } from 'vitest'
import { canAutosave, type AutosaveState } from './autosave'

const base: AutosaveState = { token: null, fsFolderName: null, fsPending: false, fsFilePath: null }

describe('canAutosave', () => {
  it('no autoguarda sin sesión ni carpeta', () => {
    expect(canAutosave(base)).toBe(false)
  })

  it('autoguarda con sesión en la nube', () => {
    expect(canAutosave({ ...base, token: 'session' })).toBe(true)
  })

  it('autoguarda sobre el archivo local ya abierto', () => {
    expect(canAutosave({ ...base, fsFolderName: 'obra', fsFilePath: 'planta.cota' })).toBe(true)
  })

  it('no crea solo un dibujo local que nunca se guardó', () => {
    expect(canAutosave({ ...base, fsFolderName: 'obra', fsFilePath: null })).toBe(false)
  })

  it('no autoguarda mientras falta reconectar el permiso de la carpeta', () => {
    expect(canAutosave({ ...base, fsFolderName: 'obra', fsFilePath: 'planta.cota', fsPending: true })).toBe(false)
  })
})
