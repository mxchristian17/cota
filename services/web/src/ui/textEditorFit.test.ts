import { describe, expect, it } from 'vitest'
import { fitInView } from './fitInView'

describe('editor de MTEXT dentro de la ventana (R21)', () => {
  const W = { left: 0, top: 0, right: 1600, bottom: 900 }
  it('un editor arriba de la ventana baja hasta quedar entero, con margen', () => {
    expect(fitInView({ left: 300, top: -422, right: 760, bottom: -340 }, W)).toEqual([0, 430])
  })
  it('a la derecha o abajo, vuelve hacia adentro', () => {
    expect(fitInView({ left: 1500, top: 850, right: 1900, bottom: 950 }, W)).toEqual([-308, -58])
  })
  it('dentro de la ventana no se mueve; si no entra, manda la esquina de arriba a la izquierda (la barra con OK)', () => {
    expect(fitInView({ left: 10, top: 10, right: 500, bottom: 300 }, W)).toEqual([0, 0])
    expect(fitInView({ left: 100, top: 100, right: 2000, bottom: 1200 }, W)).toEqual([-92, -92])
  })
})

describe('editor de MTEXT dentro de la zona del dibujo', () => {
  it('no baja hasta la línea de comandos: se queda arriba del borde inferior del dibujo', () => {
    expect(fitInView({ left: 300, top: 760, right: 700, bottom: 820 }, { left: 30, top: 40, right: 1560, bottom: 770 })).toEqual([0, -58])
  })
})
