/** Colores DXF: hex ↔ ACI (índice el CAD clásico) y truecolor de 24 bits. */

const ACI: Array<[number, string]> = [
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
