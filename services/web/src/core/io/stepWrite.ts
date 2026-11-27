import type { LengthUnit, OcctKernel } from 'occt-wasm'
import type { BrepSource, SolidProps } from '../document/types'
import { brepOfSolid } from '../occt/occtEval'

/** Un sólido del dibujo para el STEP: su árbol (en el mundo), un nombre y su color (0–1). */
export interface StepSolid {
  props: SolidProps
  name: string
  color?: [number, number, number]
}

/**
 * STEP (AP214) de unos sólidos con sus formas exactas: cada uno una pieza con su nombre y su color, en su lugar (sin
 * ensamble). `mmPerUnit`: milímetros por unidad del dibujo (el núcleo trabaja en mm; el archivo sale en `unit`). Los
 * que el núcleo no puede armar quedan fuera y se cuentan.
 */
export function writeStepExact(
  k: OcctKernel,
  solids: StepSolid[],
  opts: { models?: Record<string, BrepSource>; unit?: LengthUnit; mmPerUnit?: number } = {},
): { step: string; written: number; failed: number } {
  // Primero los textos BREP (cada armado libera las formas anteriores del núcleo), después el documento.
  const shapes: Array<{ brep: string; s: StepSolid }> = []
  let failed = 0
  for (const s of solids) {
    try {
      shapes.push({ brep: brepOfSolid(k, s.props, { models: opts.models }).brep, s })
    } catch {
      failed++
    }
  }
  const f = opts.mmPerUnit ?? 1
  const doc = k.createXCAFDocument()
  try {
    for (const { brep, s } of shapes) {
      let shape = k.fromBREP(brep)
      if (f !== 1) shape = k.transform(shape, [f, 0, 0, 0, 0, f, 0, 0, 0, 0, f, 0])
      doc.addShape(shape, { name: s.name, ...(s.color ? { color: s.color } : {}) })
    }
    return { step: doc.exportSTEP({ unit: opts.unit ?? 'mm', schema: 'AP214' }), written: shapes.length, failed }
  } finally {
    doc.close()
  }
}
