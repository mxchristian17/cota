import * as THREE from 'three'

const cache = new Map<number, THREE.Texture>()

/**
 * Textura de la marca de un POINT según PDMODE (CAD clásico): 0 punto, 1 nada, 2 +, 3 ×, 4 trazo vertical; +32
 * agrega un círculo y +64 un cuadrado. Blanca sobre transparente: el color lo da el material.
 */
export function pointMarkTexture(pdmode: number): THREE.Texture {
  const key = Math.trunc(pdmode)
  const hit = cache.get(key)
  if (hit) return hit
  const n = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = n
  const g = canvas.getContext('2d')
  const tex = new THREE.CanvasTexture(canvas)
  if (g) {
    g.strokeStyle = '#fff'
    g.fillStyle = '#fff'
    g.lineWidth = 5
    const c = n / 2
    const r = n / 2 - 4
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      g.beginPath()
      g.moveTo(x0, y0)
      g.lineTo(x1, y1)
      g.stroke()
    }
    const base = key & 31
    if (base === 0) g.fillRect(c - 5, c - 5, 10, 10)
    else if (base === 2) {
      line(c, 4, c, n - 4)
      line(4, c, n - 4, c)
    } else if (base === 3) {
      line(10, 10, n - 10, n - 10)
      line(n - 10, 10, 10, n - 10)
    } else if (base === 4) line(c, 4, c, c)
    if (key & 32) {
      g.beginPath()
      g.arc(c, c, r - 8, 0, Math.PI * 2)
      g.stroke()
    }
    if (key & 64) g.strokeRect(8, 8, n - 16, n - 16)
  }
  tex.needsUpdate = true
  cache.set(key, tex)
  return tex
}
