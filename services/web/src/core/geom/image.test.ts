import { describe, expect, it } from 'vitest'
import type { ImageProps } from '../document/types'
import { imageClip, imagePoint, imageRing, imageUv, mapImage } from './image'

const img: ImageProps = { origin: [100, 200, 0], u: [0.5, 0, 0], v: [0, 0.5, 0], size: [40, 20], file: 'C:\\planos\\mapa.png' }

describe('imágenes raster', () => {
  it('el marco va de la esquina por los vectores de un píxel; la fila 0 de la imagen está arriba', () => {
    expect(imageRing(img)).toEqual([[100, 210, 0], [120, 210, 0], [120, 200, 0], [100, 200, 0], [100, 210, 0]])
    // El centro del primer píxel (arriba a la izquierda) y su coordenada de textura.
    expect(imagePoint(img, 0, 0)).toEqual([100.25, 209.75, 0])
    expect(imageUv(img, -0.5, -0.5)).toEqual([0, 1])
    expect(imageUv(img, 39.5, 19.5)).toEqual([1, 0])
  })

  it('un recorte de dos puntos es un rectángulo en píxeles', () => {
    expect(imageClip({ ...img, clip: [[9.5, 4.5], [29.5, 14.5]] })).toEqual([[9.5, 4.5], [29.5, 4.5], [29.5, 14.5], [9.5, 14.5]])
    expect(imageRing({ ...img, clip: [[9.5, 4.5], [29.5, 14.5]] }).slice(0, 2)).toEqual([[105, 207.5, 0], [115, 207.5, 0]])
  })

  it('mover, girar y escalar transforman la esquina y los lados; los píxeles y el archivo siguen', () => {
    const withData = { ...img, data: 'data:image/png;base64,AAAA' }
    const turned = mapImage(withData, ([x, y, z]) => [-(y - 200) * 2 + 100, (x - 100) * 2 + 200, z])
    expect(turned.u.map((c) => +c.toFixed(9))).toEqual([0, 1, 0])
    expect(turned.v.map((c) => +c.toFixed(9))).toEqual([-1, 0, 0])
    expect(turned.data).toBe(withData.data)
    expect(turned.file).toBe(img.file)
    // En coordenadas georreferenciadas no pierde precisión (se transforman los lados enteros).
    const far = { ...img, origin: [6452349.5, 5797391.5, 0] as [number, number, number], u: [0.08516666666666667, 0, 0] as [number, number, number] }
    const moved = mapImage(far, ([x, y, z]) => [x + 0.001, y, z])
    expect(moved.u[0]).toBeCloseTo(far.u[0], 9)
  })
})
