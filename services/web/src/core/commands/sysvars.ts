import type { ProjMode } from '../editing/trim'
import { resetMemory } from './memory'

/**
 * Variables de sistema de los comandos de edición, con los nombres y valores por defecto del
 * CAD clásico. Persisten mientras dure la sesión (no se guardan en el dibujo); las de FILLET/CHAMFER además
 * se guardan en la configuración del usuario, como en el CAD clásico. `resetSysvars` es para tests.
 */
export interface Sysvars {
  /** EDGEMODE: 0 = aristas tal cual, 1 = prolongadas. */
  EDGEMODE: 0 | 1
  PROJMODE: ProjMode
  /** OFFSETDIST: última distancia de OFFSET; -1 = Through. */
  OFFSETDIST: number
  OFFSETERASE: 0 | 1
  /** Capa del resultado de OFFSET: la del origen o la actual. */
  OFFSETLAYER: 'Source' | 'Current'
  /** OFFSETGAPTYPE: 0 = esquina extendida, 1 = redondeada, 2 = chaflán. */
  OFFSETGAPTYPE: 0 | 1 | 2
  LENGTHENMODE: 'DElta' | 'Percent' | 'Total' | 'DYnamic'
  LENGTHENDELTA: number
  /** Delta angular en grados (LENGTHEN DElta → Angle); null = delta por longitud. */
  LENGTHENDELTAANGLE: number | null
  LENGTHENPERCENT: number
  LENGTHENTOTAL: number
  /** Ángulo total en grados (LENGTHEN Total → Angle); null = total por longitud. */
  LENGTHENTOTALANGLE: number | null
  /** Radio de FILLET. */
  FILLETRAD: number
  /** CHAMFER ▸ Distance: distancias sobre el primer y el segundo objeto. */
  CHAMFERA: number
  CHAMFERB: number
  /** CHAMFER ▸ Angle: longitud sobre el primer objeto y ángulo (grados) desde él. */
  CHAMFERC: number
  CHAMFERD: number
  CHAMMODE: 'Distance' | 'Angle'
  /** TRIMMODE de FILLET/CHAMFER: 1 = recorta/alarga los objetos, 0 = los deja intactos. */
  TRIMMODE: 0 | 1
  /** ATTDIA: 1 = INSERT pide los atributos en un diálogo; 0 = por línea de comandos. */
  ATTDIA: 0 | 1
  /** ATTREQ: 1 = INSERT pide los valores; 0 = usa los valores por defecto. */
  ATTREQ: 0 | 1
  /** UCSORTHO: 1 = las vistas ortogonales (VIEW y caras del cubo de vistas) activan su UCS ortogonal. */
  UCSORTHO: 0 | 1
  /** UCSFOLLOW: 1 = cada cambio de UCS lleva a la vista en planta de la UCS nueva. */
  UCSFOLLOW: 0 | 1
  /** UCSICON: bit 1 = visible, bit 2 = en el origen de la UCS (si entra en pantalla). */
  UCSICON: 0 | 1 | 2 | 3
  /** UCSDETECT: 1 = UCS dinámica (DUCS, F6) sobre caras planas de sólidos durante los comandos. */
  UCSDETECT: 0 | 1
  /** PEDITACCEPT: 1 = PEDIT convierte líneas y arcos en polilíneas sin preguntar. */
  PEDITACCEPT: 0 | 1
  /** SPLINETYPE: 5 = B-spline cuadrática, 6 = cúbica (PEDIT ▸ Spline). */
  SPLINETYPE: 5 | 6
  /** SPLINESEGS: tramos por vano de una polilínea ajustada con Spline. */
  SPLINESEGS: number
  /** PLINEWID: ancho por defecto de los tramos de PLINE. */
  PLINEWID: number
  /** ZOOMFACTOR: cuánto acerca cada paso de la rueda (3–100; 60 = ×1,1). */
  ZOOMFACTOR: number
  /** RENDERMINPX: piezas más chicas que esto en pantalla se dibujan como un punto; 0 = nunca. */
  RENDERMINPX: number
  /** ZOOMWHEEL: 0 = rueda hacia adelante acerca (CAD clásico), 1 = al revés. */
  ZOOMWHEEL: 0 | 1
  /** UCSVIEW: 1 = las vistas guardadas guardan también la UCS. */
  UCSVIEW: 0 | 1
  /** Estilo de los POINT (CAD clásico): 0 punto, 1 nada, 2 +, 3 ×, 4 trazo; +32 círculo, +64 cuadrado. */
  PDMODE: number
  /** Tamaño de los POINT: 0 = 5 % del alto de la vista, < 0 = % de la vista, > 0 = unidades de dibujo. */
  PDSIZE: number
}

const DEFAULTS: Sysvars = {
  EDGEMODE: 0,
  PROJMODE: 'Ucs',
  OFFSETDIST: 1,
  OFFSETERASE: 0,
  OFFSETLAYER: 'Source',
  OFFSETGAPTYPE: 0,
  LENGTHENMODE: 'Total',
  LENGTHENDELTA: 0,
  LENGTHENDELTAANGLE: null,
  LENGTHENPERCENT: 100,
  LENGTHENTOTAL: 1,
  LENGTHENTOTALANGLE: null,
  FILLETRAD: 10,
  CHAMFERA: 10,
  CHAMFERB: 10,
  CHAMFERC: 10,
  CHAMFERD: 45,
  CHAMMODE: 'Distance',
  TRIMMODE: 1,
  ATTDIA: 1,
  ATTREQ: 1,
  UCSORTHO: 1,
  UCSFOLLOW: 0,
  UCSICON: 3,
  UCSDETECT: 1,
  PEDITACCEPT: 0,
  SPLINETYPE: 6,
  SPLINESEGS: 8,
  PLINEWID: 0,
  ZOOMFACTOR: 60,
  RENDERMINPX: 3,
  ZOOMWHEEL: 0,
  UCSVIEW: 1,
  PDMODE: 0,
  PDSIZE: 0,
}

export const sysvars: Sysvars = { ...DEFAULTS }

export function resetSysvars(): void {
  Object.assign(sysvars, DEFAULTS)
  resetMemory() // valores recordados de los prompts
}

/**
 * Variables que se guardan en las preferencias del usuario: las de FILLET/CHAMFER y las de
 * interfaz, visualización y edición que el CAD clásico guarda en el perfil del usuario.
 */
export const PERSISTED_SYSVARS = [
  'FILLETRAD', 'CHAMFERA', 'CHAMFERB', 'CHAMFERC', 'CHAMFERD', 'CHAMMODE', 'TRIMMODE',
  'UCSICON', 'ZOOMFACTOR', 'ZOOMWHEEL', 'RENDERMINPX', 'UCSORTHO', 'UCSFOLLOW', 'UCSDETECT', 'UCSVIEW',
  'ATTDIA', 'ATTREQ', 'PEDITACCEPT', 'OFFSETGAPTYPE', 'EDGEMODE', 'PROJMODE', 'PDMODE', 'PDSIZE',
] as const

export type PersistedSysvars = Pick<Sysvars, (typeof PERSISTED_SYSVARS)[number]>

export function persistedSysvars(): PersistedSysvars {
  return Object.fromEntries(PERSISTED_SYSVARS.map((k) => [k, sysvars[k]])) as unknown as PersistedSysvars
}

const nonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Aplica valores persistidos (o del diálogo OPTIONS), ignorando los inválidos. */
export function applySysvars(data: Record<string, unknown>): void {
  for (const k of ['FILLETRAD', 'CHAMFERA', 'CHAMFERB', 'CHAMFERC'] as const) {
    if (nonNegative(data[k])) sysvars[k] = data[k]
  }
  const d = data.CHAMFERD
  if (typeof d === 'number' && d >= 0 && d < 180) sysvars.CHAMFERD = d
  if (data.CHAMMODE === 'Distance' || data.CHAMMODE === 'Angle') sysvars.CHAMMODE = data.CHAMMODE
  if (data.TRIMMODE === 0 || data.TRIMMODE === 1) sysvars.TRIMMODE = data.TRIMMODE
  const bit = (v: unknown): v is 0 | 1 => v === 0 || v === 1
  for (const k of ['ZOOMWHEEL', 'UCSORTHO', 'UCSFOLLOW', 'UCSDETECT', 'UCSVIEW', 'ATTDIA', 'ATTREQ', 'PEDITACCEPT', 'EDGEMODE'] as const) {
    const v = data[k]
    if (bit(v)) sysvars[k] = v
  }
  const icon = data.UCSICON
  if (icon === 0 || icon === 1 || icon === 2 || icon === 3) sysvars.UCSICON = icon
  const gap = data.OFFSETGAPTYPE
  if (gap === 0 || gap === 1 || gap === 2) sysvars.OFFSETGAPTYPE = gap
  const zf = data.ZOOMFACTOR
  if (typeof zf === 'number' && zf >= 3 && zf <= 100) sysvars.ZOOMFACTOR = zf
  if (nonNegative(data.RENDERMINPX)) sysvars.RENDERMINPX = data.RENDERMINPX
  if (data.PROJMODE === 'None' || data.PROJMODE === 'Ucs' || data.PROJMODE === 'View') sysvars.PROJMODE = data.PROJMODE
  const pd = data.PDMODE
  if (typeof pd === 'number' && Number.isInteger(pd) && (pd & 31) <= 4 && (pd & ~(31 | 32 | 64)) === 0) sysvars.PDMODE = pd
  if (typeof data.PDSIZE === 'number' && Number.isFinite(data.PDSIZE)) sysvars.PDSIZE = data.PDSIZE
}
