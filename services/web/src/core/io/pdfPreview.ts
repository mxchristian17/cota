import type { PdfPage } from './pdf'

/**
 * Vista previa de una página del ploteo: interpreta el content stream que genera Cota (trazos, rellenos,
 * recortes y textos) sobre un canvas, sin pasar por el visor de PDF del navegador (que en algunos, como el de los
 * teléfonos, descargaría el archivo). Sólo entiende los operadores que escribe `pdf.ts`.
 */
type Tok = number | string | { name: string } | { str: string } | { arr: Tok[] }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  const stack: Tok[][] = [out]
  let i = 0
  const push = (t: Tok) => stack[stack.length - 1].push(t)
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      i++
    } else if (c === '(') {
      // Cadena con paréntesis balanceados y escapes `\(`, `\)`, `\\`.
      let depth = 1
      let s = ''
      i++
      while (i < src.length && depth > 0) {
        const d = src[i]
        if (d === '\\') {
          s += src[i + 1] ?? ''
          i += 2
          continue
        }
        if (d === '(') depth++
        else if (d === ')' && --depth === 0) break
        s += d
        i++
      }
      i++
      push({ str: s })
    } else if (c === '[') {
      const arr: Tok[] = []
      push({ arr })
      stack.push(arr)
      i++
    } else if (c === ']') {
      if (stack.length > 1) stack.pop()
      i++
    } else if (c === '/') {
      let j = i + 1
      while (j < src.length && !/[\s/[\]()]/.test(src[j])) j++
      push({ name: src.slice(i + 1, j) })
      i = j
    } else {
      let j = i
      while (j < src.length && !/[\s/[\]()]/.test(src[j])) j++
      const w = src.slice(i, j)
      const n = Number(w)
      push(w !== '' && Number.isFinite(n) ? n : w)
      i = j || i + 1
    }
  }
  return out
}

const rgb = (a: number[]) => `rgb(${a.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`

/**
 * Dibuja `page` en el canvas, ajustada al tamaño dado (CSS px) y centrada, con el papel en blanco y su sombra.
 * Devuelve la escala px/pt usada.
 */
export function drawPdfPage(canvas: HTMLCanvasElement, page: PdfPage, width: number, height: number): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const g = canvas.getContext('2d')
  if (!g) return 0
  const pad = 12
  const k = Math.min((width - 2 * pad) / page.w, (height - 2 * pad) / page.h)
  const ox = (width - page.w * k) / 2
  const oy = (height - page.h * k) / 2
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, width, height)
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(ox + 3, oy + 3, page.w * k, page.h * k)
  g.fillStyle = '#ffffff'
  g.fillRect(ox, oy, page.w * k, page.h * k)
  // Página: origen abajo a la izquierda, y hacia arriba (como el PDF).
  const base = new DOMMatrix([dpr * k, 0, 0, -dpr * k, dpr * ox, dpr * (oy + page.h * k)])
  g.setTransform(base)
  g.save()
  g.beginPath()
  g.rect(0, 0, page.w, page.h)
  g.clip()
  g.lineCap = 'butt'
  g.lineJoin = 'miter'
  g.strokeStyle = '#000'
  g.fillStyle = '#000'
  let path = new Path2D()
  let fontSize = 1
  let tm = new DOMMatrix()
  let pendingClip = false
  const ops: Tok[] = []
  const nums = () => ops.filter((t): t is number => typeof t === 'number')
  for (const t of tokenize(page.content)) {
    if (typeof t !== 'string') {
      ops.push(t)
      continue
    }
    const a = nums()
    switch (t) {
      case 'q':
        g.save()
        break
      case 'Q':
        g.restore()
        break
      case 'm':
        path.moveTo(a[0], a[1])
        break
      case 'l':
        path.lineTo(a[0], a[1])
        break
      case 'c':
        path.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5])
        break
      case 're':
        path.rect(a[0], a[1], a[2], a[3])
        break
      case 'h':
        path.closePath()
        break
      case 'S':
        g.stroke(path)
        path = new Path2D()
        break
      case 'f':
      case 'f*':
        g.fill(path, t === 'f*' ? 'evenodd' : 'nonzero')
        path = new Path2D()
        break
      case 'W':
        pendingClip = true
        break
      case 'n':
        if (pendingClip) g.clip(path)
        pendingClip = false
        path = new Path2D()
        break
      case 'RG':
        g.strokeStyle = rgb(a)
        break
      case 'rg':
        g.fillStyle = rgb(a)
        break
      case 'G':
        g.strokeStyle = rgb([a[0], a[0], a[0]])
        break
      case 'g':
        g.fillStyle = rgb([a[0], a[0], a[0]])
        break
      case 'w':
        // Las líneas finas se ven al menos de medio píxel (como el papel impreso, no desaparecen).
        g.lineWidth = Math.max(a[0], 0.5 / k)
        break
      case 'J':
        g.lineCap = (['butt', 'round', 'square'] as const)[a[0]] ?? 'butt'
        break
      case 'j':
        g.lineJoin = (['miter', 'round', 'bevel'] as const)[a[0]] ?? 'miter'
        break
      case 'd': {
        const arr = ops.find((o): o is { arr: Tok[] } => typeof o === 'object' && 'arr' in o)
        g.setLineDash(arr ? arr.arr.filter((v): v is number => typeof v === 'number') : [])
        break
      }
      case 'BT':
        tm = new DOMMatrix()
        break
      case 'Tf':
        fontSize = a[0] ?? 1
        break
      case 'Td':
        tm = tm.multiply(new DOMMatrix([1, 0, 0, 1, a[0], a[1]]))
        break
      case 'Tm':
        tm = new DOMMatrix([a[0], a[1], a[2], a[3], a[4], a[5]])
        break
      case 'Tj': {
        const s = ops.find((o): o is { str: string } => typeof o === 'object' && 'str' in o)
        if (!s) break
        g.save()
        // Texto: la matriz del texto con la y otra vez hacia abajo (si no, las letras saldrían espejadas).
        // Se dibuja con un cuerpo de 100 px escalado: con 1 px algunos navegadores redondean mal las letras.
        g.setTransform(base.multiply(tm).multiply(new DOMMatrix([fontSize / 100, 0, 0, -fontSize / 100, 0, 0])))
        g.font = '100px Helvetica, Arial, sans-serif'
        g.fillText(s.str, 0, 0)
        g.restore()
        break
      }
    }
    ops.length = 0
  }
  g.restore()
  return k
}
