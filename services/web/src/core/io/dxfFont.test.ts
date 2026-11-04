import { describe, expect, it } from 'vitest'
import { fontLook, mtextLead, mtextRuns } from './dxfFont'

describe('fuentes de los textos de DXF/DWG', () => {
  it('archivos y familias: Arial, su negrita, su angosta; las SHX son de un trazo', () => {
    expect(fontLook('arial.ttf')).toEqual({ font: 'Arial', narrow: 1 })
    expect(fontLook('arialbd.ttf')).toEqual({ font: 'Arial', narrow: 1, bold: true })
    expect(fontLook('ARIALN.TTF')).toEqual({ font: 'Arial', narrow: 0.82 })
    expect(fontLook('Arial Narrow')).toEqual({ font: 'Arial', narrow: 0.82 })
    expect(fontLook('times.ttf').font).toBe('Times New Roman')
    expect(fontLook('calibri.ttf')).toEqual({ font: 'Calibri', narrow: 1 }) // termina en "i" y no es itálica
    expect(fontLook('simplex.shx')).toEqual({ narrow: 1, shx: true })
    expect(fontLook('SIMPLEX')).toEqual({ narrow: 1, shx: true })
    expect(fontLook('txt')).toEqual({ narrow: 1, shx: true })
    expect(fontLook(undefined)).toEqual({ narrow: 1 })
  })

  it('formato del comienzo de un MTEXT: fuente, negrita, alto relativo o absoluto y ancho', () => {
    expect(mtextLead('{\\fArial Narrow|b1|i0|c0|p34;\\H0.75x;\\W0.9;Texto \\fArial|b0;resto}')).toEqual({ font: 'Arial Narrow', bold: true, heightScale: 0.75, width: 0.9 })
    expect(mtextLead('\\pxt0;{\\H2.5;\\C7;Hola}')).toEqual({ height: 2.5 })
    expect(mtextLead('Hola \\fArial;mundo')).toEqual({}) // lo que viene después del primer carácter no vale para todo
  })

  it('tramos de un MTEXT: negrita y alto dentro del texto, grupos {…} que vuelven al formato de afuera', () => {
    const runs = mtextRuns('{\\fArial|b1;Obra\\fArial|b0;: \\H0.5x;\\C1;título}\\Pfin', 4)
    expect(runs.map((r) => [r.s, !!r.bold, r.height, r.color])).toEqual([
      ['Obra', true, 4, undefined],
      [': ', false, 4, undefined],
      ['título', false, 2, 1],
      ['\nfin', false, 4, undefined],
    ])
  })
})
