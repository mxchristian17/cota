/** Colores DXF: hex ↔ ACI (índice el CAD clásico) y truecolor de 24 bits. */

const BASE: Array<[number, string]> = [
  [1, '#ff0000'],
  [2, '#ffff00'],
  [3, '#00ff00'],
  [4, '#00ffff'],
  [5, '#0000ff'],
  [6, '#ff00ff'],
  [7, '#ffffff'],
  [8, '#808080'],
  [9, '#c0c0c0'],
]

/**
 * Tabla ACI completa (1–255) del CAD clásico: 10–249 son 24 tonos cada 15° con cinco brillos (255, 204, 153, 127,
 * 76); los pares a saturación plena y los impares a media. 250–255 son grises.
 */
const ACI: Array<[number, string]> = (() => {
  const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  const out: Array<[number, string]> = [...BASE]
  const levels = [255, 204, 153, 127, 76]
  for (let i = 10; i <= 249; i++) {
    const h = (Math.floor(i / 10) - 1) * 15
    const j = i % 10
    const v = levels[Math.floor(j / 2)]
    const lo = j % 2 ? Math.floor(v / 2) : 0
    // HSV con el mínimo `lo` y el máximo `v`: el canal intermedio sube o baja con el tono dentro de su sector.
    const sector = Math.floor(h / 60)
    const f = (h % 60) / 60
    const up = Math.floor(lo + (v - lo) * f)
    const down = Math.floor(lo + (v - lo) * (1 - f))
    const rgb: Array<[number, number, number]> = [[v, up, lo], [down, v, lo], [lo, v, up], [lo, down, v], [up, lo, v], [v, lo, down]]
    out.push([i, hex(...rgb[sector])])
  }
  for (const [i, g] of [[250, 0x33], [251, 0x50], [252, 0x69], [253, 0x82], [254, 0xbe], [255, 0xff]] as const) out.push([i, hex(g, g, g)])
  return out
})()

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function hexToAci(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  let best = 7
  let bestD = Infinity
  for (const [aci, ah] of ACI) {
    const [ar, ag, ab] = hexToRgb(ah)
    const d = (r - ar) ** 2 + (g - ag) ** 2 + (b - ab) ** 2
    if (d < bestD) {
      bestD = d
      best = aci
    }
  }
  return best
}

export function aciToHex(aci: number): string {
  return ACI.find(([a]) => a === aci)?.[1] ?? '#ffffff'
}

export function hexToTruecolor(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return (r << 16) | (g << 8) | b
}

export function truecolorToHex(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0')
}
