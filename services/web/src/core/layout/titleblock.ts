import type { DocumentModel } from '../document/DocumentModel'
import type { AttdefProps, BlockDef, Entity } from '../document/types'
import type { Vec3 } from '../math'
import { fieldCode } from '../fields/fields'

/** Nombre del bloque del rótulo predeterminado. Redefinirlo (BLOCK + ATTSYNC) cambia el diseño. */
export const IRAM_BLOCK = 'TITLE_BLOCK'
/** Tamaño del rótulo en mm del papel (punto base: esquina inferior derecha). */
export const IRAM_SIZE = { width: 175, height: 46 }

/** Ancho útil de cada celda del rótulo (del texto al borde siguiente, con 1 mm de aire). */
const CELL = { wide: 132, right: 37, small: 43, file: 112, sheet: 57 }

/**
 * Rótulo IRAM 4508 simplificado: empresa/obra, título, plano N°, dibujó, revisó y aprobó como
 * atributos; escala, fecha, archivo y hoja X de N como campos que se completan solos (D3). Título, dibujó y empresa
 * arrancan con los campos de DWGPROPS (Title, Author y la propiedad personalizada Company): se completan solos y se
 * pueden reemplazar con ATTEDIT (B08). Cada texto lleva el ancho de su celda: uno largo se comprime y no pisa la
 * vecina (R10).
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
  const text = (x: number, y: number, t: string, h = 1.8, fitWidth?: number): Entity => ({
    id: id(),
    type: 'TEXT',
    layer: '0',
    props: { position: [x, y, 0], text: t, height: h, rotation: 0, justify: 'left', normal: [0, 0, 1], ...(fitWidth ? { fitWidth } : {}) },
  })
  const att = (x: number, y: number, tag: string, prompt: string, h: number, fitWidth: number, value = ''): Entity => {
    const props: AttdefProps = { position: [x, y, 0] as Vec3, height: h, rotation: 0, justify: 'left', normal: [0, 0, 1], tag, prompt, value, fitWidth }
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
      att(-173, 41, 'COMPANY', 'Company / project', 3, CELL.wide, fieldCode('CustomDP.Company')),
      text(-38, 45, 'SCALE'),
      text(-38, 41, fieldCode('ViewportScale'), 3, CELL.right),
      text(-173, 33, 'TITLE'),
      att(-173, 29, 'TITLE', 'Drawing title', 4, CELL.wide, fieldCode('Title')),
      text(-38, 33, 'DATE'),
      text(-38, 29, fieldCode('SaveDate'), 3, CELL.right),
      text(-173, 17, 'DRAWN'),
      att(-173, 13.5, 'DRAWN', 'Drawn by', 2.5, CELL.small, fieldCode('Author')),
      text(-128, 17, 'CHECKED'),
      att(-128, 13.5, 'CHECKED', 'Checked by', 2.5, CELL.small),
      text(-83, 17, 'APPROVED'),
      att(-83, 13.5, 'APPROVED', 'Approved by', 2.5, CELL.small),
      text(-38, 17, 'DWG NO.'),
      att(-38, 13.5, 'DWG_NO', 'Drawing number', 2.5, CELL.right),
      text(-173, 6.5, `FILE: ${fieldCode('Filename')}`, 2, CELL.file),
      text(-58, 6.5, `SHEET ${fieldCode('SheetNumber')} OF ${fieldCode('SheetCount')}`, 2.5, CELL.sheet),
    ],
  }
}

/**
 * Define el bloque del rótulo si el dibujo todavía no lo tiene. Si ya existe se respeta el del usuario, salvo que sea
 * el predeterminado de una versión anterior (mismos textos y atributos, sin campos ni celdas): ése se actualiza.
 */
export function ensureIramBlock(doc: DocumentModel): void {
  const cur = doc.getBlock(IRAM_BLOCK)
  if (!cur || isOldDefault(cur)) doc.setBlock(iramTitleBlock())
}

/** ¿Es el rótulo predeterminado de antes (sin `fitWidth` y con los atributos vacíos)? */
function isOldDefault(b: BlockDef): boolean {
  const now = iramTitleBlock().entities
  if (b.entities.length !== now.length) return false
  return b.entities.every((e, i) => {
    const n = now[i]
    if (e.type !== n.type) return false
    if (e.type === 'ATTDEF' && n.type === 'ATTDEF') return e.props.tag === n.props.tag && e.props.value === '' && !e.props.fitWidth
    if (e.type === 'TEXT' && n.type === 'TEXT') return e.props.text === n.props.text && !e.props.fitWidth
    return true
  })
}
