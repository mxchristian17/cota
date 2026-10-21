import { dimDisplay } from '../core/dimension/dimGeometry'
import type { DimVars } from '../core/dimension/style'
import type { DimensionProps } from '../core/document/types'
import type { Vec3 } from '../core/math'

/** Cotas de muestra (como la vista previa de DIMSTYLE del CAD clásico), escaladas al alto de texto del estilo. */
function samples(s: DimVars): { dims: DimensionProps[]; outline: Vec3[][] } {
  const u = Math.max(s.DIMTXT, 0.5) * 4 // unidad de la muestra: proporcional al texto
  const mk = (dimType: DimensionProps['dimType'], points: Vec3[], textPos: Vec3): DimensionProps => ({ dimType, points, textPos, style: s })
  const circle: Vec3[] = Array.from({ length: 49 }, (_, i) => [u * 9 + u * 1.6 * Math.cos((i / 48) * Math.PI * 2), u * 2 + u * 1.6 * Math.sin((i / 48) * Math.PI * 2), 0])
  return {
    dims: [
      mk('LINEAR', [[0, 0, 0], [u * 5, 0, 0]], [u * 2.5, -u * 1.5, 0]),
      mk('LINEAR', [[u * 5, 0, 0], [u * 5, u * 4, 0]], [u * 6.5, u * 2, 0]),
      mk('ANGULAR', [[0, u * 4, 0], [u * 4, u * 4, 0], [u * 2.5, u * 6.5, 0]], [u * 2.2, u * 5.6, 0]),
      mk('RADIUS', [[u * 9, u * 2, 0], [u * 10.6, u * 2, 0]], [u * 11.5, u * 4.5, 0]),
    ],
    outline: [
      [[0, 0, 0], [u * 5, 0, 0], [u * 5, u * 4, 0], [0, u * 4, 0], [0, 0, 0]],
      [[0, u * 4, 0], [u * 2.5, u * 6.5, 0]],
      circle,
    ],
  }
}

/** Vista previa SVG de un estilo de cota. */
export function DimPreview({ vars, testId }: { vars: DimVars; testId?: string }) {
  const { dims, outline } = samples({ ...vars, ANNOTATIVE: false, DIMSCALE: 1 })
  const lines: string[] = []
  const fills: string[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const P = (p: Vec3) => {
    minX = Math.min(minX, p[0])
    minY = Math.min(minY, p[1])
    maxX = Math.max(maxX, p[0])
    maxY = Math.max(maxY, p[1])
    return `${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`
  }
  const objLines = outline.map((poly) => 'M' + poly.map(P).join('L')).join(' ')
  for (const d of dims) {
    const g = dimDisplay(d)
    for (const [a, b] of g.lines) lines.push(`M${P(a)}L${P(b)}`)
    for (const st of g.textStrokes) lines.push('M' + st.map(P).join('L'))
    for (const f of g.fills) fills.push('M' + f.map(P).join('L') + 'Z')
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.06
  const w = maxX - minX + 2 * pad
  const h = maxY - minY + 2 * pad
  const sw = Math.max(w, h) / 400
  return (
    <svg className="dim-preview" viewBox={`${minX - pad} ${-maxY - pad} ${w} ${h}`} data-testid={testId}>
      <path d={objLines} fill="none" stroke="var(--muted)" strokeWidth={sw * 1.5} />
      <path d={lines.join(' ')} fill="none" stroke="var(--text)" strokeWidth={sw} />
      <path d={fills.join(' ')} fill="var(--text)" stroke="none" />
    </svg>
  )
}
