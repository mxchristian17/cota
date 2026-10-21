import type { DocumentModel } from '../document/DocumentModel'
import type { AttdefProps, BlockDef, Entity } from '../document/types'
import type { Vec3 } from '../math'
import { fieldCode } from '../fields/fields'

/** Nombre del bloque del rótulo predeterminado. Redefinirlo (BLOCK + ATTSYNC) cambia el diseño. */
export const IRAM_BLOCK = 'TITLE_BLOCK'
/** Tamaño del rótulo en mm del papel (punto base: esquina inferior derecha). */
export const IRAM_SIZE = { width: 175, height: 46 }

/**
 * Rótulo IRAM 4508 simplificado: empresa/obra, título, plano N°, dibujó, revisó y aprobó como
 * atributos; escala, fecha, archivo y hoja X de N como campos que se completan solos (D3).
 */
export function iramTitleBlock(): BlockDef {
  const W = IRAM_SIZE.width
  const H = IRAM_SIZE.height
  let n = 0
  const id = () => `rot${++n}`
  const line = (a: [number, number], b: [number, number]): Entity => ({
    id: id(),
    type: 'LINE',
    layer: '0',
    props: { start: [a[0], a[1], 0], end: [b[0], b[1], 0] },
  })
  const text = (x: number, y: number, t: string, h = 1.8): Entity => ({
    id: id(),
    type: 'TEXT',
    layer: '0',
    props: { position: [x, y, 0], text: t, height: h, rotation: 0, justify: 'left', normal: [0, 0, 1] },
  })
  const att = (x: number, y: number, tag: string, prompt: string, h = 2.5): Entity => {
    const props: AttdefProps = { position: [x, y, 0] as Vec3, height: h, rotation: 0, justify: 'left', normal: [0, 0, 1], tag, prompt, value: '' }
    return { id: id(), type: 'ATTDEF', layer: '0', props }
  }
  return {
    name: IRAM_BLOCK,
    entities: [
      { id: id(), type: 'RECTANGLE', layer: '0', props: { corner: [-W, 0, 0], width: W, height: H } },
      line([-W, 8], [0, 8]),
      line([-W, 18], [0, 18]),
      line([-W, 34], [0, 34]),
      line([-40, 8], [-40, H]),
      line([-130, 8], [-130, 18]),
      line([-85, 8], [-85, 18]),
      line([-60, 0], [-60, 8]),
      text(-173, 45, 'COMPANY / PROJECT'),
      att(-173, 41, 'COMPANY', 'Company / project', 3),
      text(-38, 45, 'SCALE'),
      text(-38, 41, fieldCode('ViewportScale'), 3),
      text(-173, 33, 'TITLE'),
      att(-173, 29, 'TITLE', 'Drawing title', 4),
      text(-38, 33, 'DATE'),
      text(-38, 29, fieldCode('SaveDate'), 3),
      text(-173, 17, 'DRAWN'),
      att(-173, 13.5, 'DRAWN', 'Drawn by'),
      text(-128, 17, 'CHECKED'),
      att(-128, 13.5, 'CHECKED', 'Checked by'),
      text(-83, 17, 'APPROVED'),
      att(-83, 13.5, 'APPROVED', 'Approved by'),
      text(-38, 17, 'DWG NO.'),
      att(-38, 13.5, 'DWG_NO', 'Drawing number'),
      text(-173, 6.5, `FILE: ${fieldCode('Filename')}`, 2),
      text(-58, 6.5, `SHEET ${fieldCode('SheetNumber')} OF ${fieldCode('SheetCount')}`, 2.5),
    ],
  }
}

/** Define el bloque del rótulo si el dibujo todavía no lo tiene (si ya existe, se respeta el del usuario). */
export function ensureIramBlock(doc: DocumentModel): void {
  if (!doc.getBlock(IRAM_BLOCK)) doc.setBlock(iramTitleBlock())
}
