import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CameraController } from './CameraController'

/** Con recorte, cada punto cae en el canvas donde caía en la vista entera, menos el desplazamiento. */
describe('CameraController con recorte de vista', () => {
  const setup = (mode: 'ortho' | 'persp', w: number, h: number) => {
    const c = new CameraController()
    c.setMode(mode)
    c.target.set(1000, 2000, 0)
    c.radius = 400
    c.setSize(w, h)
    return c
  }

  for (const mode of ['ortho', 'persp'] as const) {
    it(`${mode}: proyección, mundo por px y rayo coinciden con la vista entera`, () => {
      const [W, H] = [25986, 15275]
      const full = setup(mode, W, H)
      const [ox, oy, w, h] = [12610.4, 7426.8, 1146, 675]
      const part = setup(mode, w, h)
      part.frame = { fullWidth: W, fullHeight: H, offsetX: ox, offsetY: oy }
      part.update()
      expect(part.worldPerPx()).toBeCloseTo(full.worldPerPx(), 9)
      for (const p of [new THREE.Vector3(1000, 2000, 0), new THREE.Vector3(1003.1, 2001.7, 0), new THREE.Vector3(990, 2010, 5)]) {
        const a = full.project(p)!
        const b = part.project(p)!
        expect(b[0]).toBeCloseTo(a[0] - ox, 3)
        expect(b[1]).toBeCloseTo(a[1] - oy, 3)
      }
      // El rayo del centro del canvas pasa por el punto de la vista entera en ese píxel.
      const ray = part.rayFromNdc(0, 0)
      const fullNdc: [number, number] = [((ox + w / 2) / W) * 2 - 1, -(((oy + h / 2) / H) * 2 - 1)]
      const ref = full.rayFromNdc(...fullNdc)
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
      const q1 = ray.intersectPlane(plane, new THREE.Vector3())!
      const q2 = ref.intersectPlane(plane, new THREE.Vector3())!
      expect(q1.distanceTo(q2)).toBeLessThan(1e-6 * 400)
    })
  }

  it('sin recorte vuelve a la vista entera', () => {
    const c = setup('ortho', 800, 600)
    const before = c.project(new THREE.Vector3(1010, 2005, 0))!
    c.frame = { fullWidth: 2000, fullHeight: 1500, offsetX: 300, offsetY: 200 }
    c.update()
    c.frame = null
    c.update()
    expect(c.project(new THREE.Vector3(1010, 2005, 0))).toEqual(before)
  })
})
