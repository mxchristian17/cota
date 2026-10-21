import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { CameraController } from './CameraController'

describe('CameraController.fitBounds', () => {
  it('centra el objetivo y encuadra la caja en la vista TOP (todas las esquinas visibles)', () => {
    const c = new CameraController()
    c.setSize(800, 600)
    c.setView('TOP') // ortográfica mirando -Z

    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 40, 0))
    c.fitBounds(box)

    expect(c.target.x).toBeCloseTo(50, 6)
    expect(c.target.y).toBeCloseTo(20, 6)

    for (const corner of [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(100, 0, 0),
      new THREE.Vector3(100, 40, 0),
      new THREE.Vector3(0, 40, 0),
    ]) {
      const px = c.project(corner)
      expect(px).not.toBeNull()
      expect(px![0]).toBeGreaterThanOrEqual(0)
      expect(px![0]).toBeLessThanOrEqual(800)
      expect(px![1]).toBeGreaterThanOrEqual(0)
      expect(px![1]).toBeLessThanOrEqual(600)
    }
  })

  it('no altera la cámara con una caja vacía', () => {
    const c = new CameraController()
    c.setSize(800, 600)
    const r0 = c.radius
    c.fitBounds(new THREE.Box3())
    expect(c.radius).toBe(r0)
  })
})

describe('ZOOM Window/Extents en paralela (revisión 2026-10-13)', () => {
  it('encuadra la extensión proyectada de la caja, no su esfera envolvente', () => {
    const c = new CameraController()
    c.setSize(800, 400)
    c.setView('TOP')
    c.fitBounds(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(200, 50, 0)), 1)
    // Ancho 200 en una pantalla 2:1 → alto visible 100 (la esfera daría ≈ 206).
    expect(c.radius).toBeCloseTo(100, 6)
  })
})

