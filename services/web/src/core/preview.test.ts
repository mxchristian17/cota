import { describe, it, expect } from 'vitest'
import { PREVIEW_COLORS, constrainOrtho, pickPreviewColor } from './preview'
import { pt } from './math'

describe('constrainOrtho', () => {
  it('fuerza el eje horizontal cuando |dx| >= |dy|', () => {
    expect(constrainOrtho(pt(0, 0), pt(10, 3))).toEqual(pt(10, 0))
  })

  it('fuerza el eje vertical cuando |dy| > |dx|', () => {
    expect(constrainOrtho(pt(0, 0), pt(3, 10))).toEqual(pt(0, 10))
  })

  it('preserva la Z de la base cuando el eje dominante es X/Y', () => {
    expect(constrainOrtho(pt(1, 1, 5), pt(9, 2, 5))).toEqual(pt(9, 1, 5))
  })

  it('permite el eje vertical (Z) cuando |dz| domina (ORTHO 3D)', () => {
    expect(constrainOrtho(pt(0, 0, 0), pt(2, 1, 50))).toEqual(pt(0, 0, 50))
    // dz apenas mayor que dx/dy → sigue eligiendo Z
    expect(constrainOrtho(pt(0, 0, 10), pt(3, 3, 40))).toEqual(pt(0, 0, 40))
  })
})

describe('pickPreviewColor', () => {
  it('usa el amarillo del CAD clásico cuando contrasta con la capa y el fondo', () => {
    expect(pickPreviewColor('#ffffff', '#1e1e1e')).toBe(PREVIEW_COLORS[0])
    expect(pickPreviewColor('#ff0000', '#1e1e1e')).toBe(PREVIEW_COLORS[0])
  })

  it('cambia de color si la capa actual es del mismo amarillo', () => {
    expect(pickPreviewColor('#ffcc00', '#1e1e1e')).not.toBe(PREVIEW_COLORS[0])
    expect(pickPreviewColor('#ffcc00', '#1e1e1e')).toBe(PREVIEW_COLORS[1])
  })

  it('cambia de color si el fondo del tema es ese amarillo', () => {
    expect(pickPreviewColor('#ffffff', '#ffcc00')).not.toBe(PREVIEW_COLORS[0])
  })

  it('evita también el alterno cuando capa y fondo cubren los dos primeros', () => {
    // capa cian + fondo amarillo → ninguno de los dos primeros sirve
    expect(pickPreviewColor('#00ffff', '#ffcc00')).toBe(PREVIEW_COLORS[2])
  })

  it('acepta números y hex de 3 dígitos', () => {
    expect(pickPreviewColor(0xffcc00, '#1e1e1e')).toBe(PREVIEW_COLORS[1])
    expect(pickPreviewColor('#fff', '#111')).toBe(PREVIEW_COLORS[0])
  })
})
