import * as THREE from 'three'
import { ISO_AZ, type CameraMode, type ViewName } from '../core/view'

const ISO_EL = Math.atan(1 / Math.SQRT2) // ~35.264°
const EL_LIMIT = 1.5533 // ~89° (evita el gimbal lock del top/bottom exacto)

/**
 * Controla dos cámaras (ortográfica y perspectiva) sobre un objetivo orbitable,
 * con vistas estándar (TOP/BOTTOM/FRONT/BACK/LEFT/RIGHT/ISO).
 */
export class CameraController {
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -100000, 100000)
  readonly persp = new THREE.PerspectiveCamera(50, 1, 0.1, 1_000_000)
  mode: CameraMode = 'ortho'
  readonly target = new THREE.Vector3(0, 0, 0)
  radius = 200
  /** Rango del zoom (alto visible). Los viewports de layout lo amplían: escalas 1:5000 o 100:1. */
  minRadius = 1
  maxRadius = 500_000
  az = -Math.PI / 2
  el = Math.PI / 2
  private width = 1
  private height = 1

  get camera(): THREE.Camera {
    return this.mode === 'ortho' ? this.ortho : this.persp
  }

  private get orthoHeight(): number {
    return this.radius
  }

  worldPerPx(): number {
    if (this.mode === 'ortho') return this.orthoHeight / this.height
    return (2 * this.radius * Math.tan(((this.persp.fov * Math.PI) / 180) / 2)) / this.height
  }

  /** Mundo por píxel a la profundidad de `p` (en perspectiva lo lejano se ve más chico). */
  worldPerPxAt(p: { x: number; y: number; z: number }): number {
    if (this.mode === 'ortho') return this.worldPerPx()
    const cam = this.persp
    const dir = new THREE.Vector3()
    cam.getWorldDirection(dir)
    const d = Math.max(1e-6, new THREE.Vector3(p.x, p.y, p.z).sub(cam.position).dot(dir))
    return (2 * d * Math.tan(((cam.fov * Math.PI) / 180) / 2)) / this.height
  }

  setSize(w: number, h: number): void {
    this.width = Math.max(1, w)
    this.height = Math.max(1, h)
    this.update()
  }

  get pxWidth(): number {
    return this.width
  }
  get pxHeight(): number {
    return this.height
  }

  /** Proyecta un punto de mundo a píxeles del canvas (origen arriba-izquierda). null si queda detrás. */
  project(v: THREE.Vector3): [number, number] | null {
    const ndc = v.clone().project(this.camera)
    if (ndc.z > 1) return null // detrás de la cámara / más allá del far
    return [(ndc.x * 0.5 + 0.5) * this.width, (-ndc.y * 0.5 + 0.5) * this.height]
  }

  /** Encuadra una caja 3D en la vista actual (extents/window), independiente de la orientación. */
  fitBounds(box: THREE.Box3, pad = 1.2): void {
    if (box.isEmpty()) return
    const center = new THREE.Vector3()
    box.getCenter(center)
    this.target.copy(center)
    const size = new THREE.Vector3()
    box.getSize(size)
    const sphere = Math.max(size.length() / 2, 1) // radio de esfera envolvente
    const aspect = this.width / this.height
    if (this.mode === 'persp') {
      const halfFov = ((this.persp.fov * Math.PI) / 180) / 2
      const distV = (sphere * pad) / Math.tan(halfFov)
      const distH = (sphere * pad) / (Math.tan(halfFov) * aspect)
      this.radius = Math.min(this.maxRadius, Math.max(this.minRadius, distV, distH))
    } else {
      // Paralela: la extensión de la caja **proyectada en pantalla** (como ZOOM Extents/Window del
      // CAD clásico), no la esfera envolvente, que dejaba el dibujo chico y la ventana mal encuadrada.
      this.update()
      this.camera.updateMatrixWorld(true)
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1)
      let [w, h] = [0, 0]
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) {
            const d = new THREE.Vector3(x, y, z).sub(center)
            w = Math.max(w, Math.abs(d.dot(right)) * 2)
            h = Math.max(h, Math.abs(d.dot(up)) * 2)
          }
      const fit = Math.max(h, w / aspect, 1e-6) * pad
      this.radius = Math.min(this.maxRadius, Math.max(this.minRadius, fit))
    }
    this.update()
  }

  /** "Arriba" fijado por una vista en planta de una UCS (PLAN); lo borra cualquier otra vista u órbita. */
  private upOverride: THREE.Vector3 | null = null

  /** "Arriba" fijado (PLAN) o null: se guarda con la vista (ZOOM Previous, vistas guardadas). */
  get fixedUp(): [number, number, number] | null {
    return this.upOverride ? [this.upOverride.x, this.upOverride.y, this.upOverride.z] : null
  }

  set fixedUp(v: [number, number, number] | null) {
    this.upOverride = v ? new THREE.Vector3(...v) : null
  }

  /** Alto visible (unidades de mundo) en el plano del objetivo. */
  get viewHeight(): number {
    return this.mode === 'ortho' ? this.orthoHeight : 2 * this.radius * Math.tan(((this.persp.fov * Math.PI) / 180) / 2)
  }

  /** Fija el alto visible (en perspectiva, la distancia que lo da). */
  set viewHeight(h: number) {
    const r = this.mode === 'ortho' ? h : h / (2 * Math.tan(((this.persp.fov * Math.PI) / 180) / 2))
    this.radius = Math.min(this.maxRadius, Math.max(this.minRadius, r))
    this.update()
  }

  /** Vista en planta de una UCS: mira a lo largo de −Z de la UCS con su Y hacia arriba. */
  setPlan(z: [number, number, number], y: [number, number, number]): void {
    this.az = Math.atan2(z[1], z[0])
    this.el = Math.asin(Math.max(-1, Math.min(1, z[2])))
    // Con la Z casi vertical el acimut no está definido: se toma el de la Y (así coincide con TOP).
    if (Math.abs(z[2]) > 1 - 1e-9) this.az = Math.atan2(-y[1], -y[0])
    this.upOverride = new THREE.Vector3(...y)
    this.update()
  }

  /** "Arriba" de la pantalla: Z; en planta, +Y (TOP) o −Y (BOTTOM: la X queda a la derecha, como el CAD clásico). */
  private upVector(): THREE.Vector3 {
    if (this.upOverride) return this.upOverride.clone()
    if (Math.abs(this.el) <= EL_LIMIT) return new THREE.Vector3(0, 0, 1)
    return new THREE.Vector3(0, this.el > 0 ? 1 : -1, 0)
  }

  /** Vista estándar. Conserva la proyección actual (paralela o perspectiva), como el CAD clásico (D5). */
  setView(name: ViewName): CameraMode {
    this.upOverride = null
    switch (name) {
      case 'TOP':
        this.az = -Math.PI / 2
        this.el = Math.PI / 2
        break
      case 'BOTTOM':
        this.az = -Math.PI / 2
        this.el = -Math.PI / 2
        break
      case 'FRONT':
        this.az = -Math.PI / 2
        this.el = 0
        break
      case 'BACK':
        this.az = Math.PI / 2
        this.el = 0
        break
      case 'RIGHT':
        this.az = 0
        this.el = 0
        break
      case 'LEFT':
        this.az = Math.PI
        this.el = 0
        break
      case 'ISO':
      case 'SWISO':
      case 'NEISO':
      case 'NWISO':
        this.az = ISO_AZ[name]!
        this.el = ISO_EL
        break
    }
    this.update()
    return this.mode
  }

  /** Mira desde un azimut y una elevación cualquiera (aristas y esquinas del cubo desplegado). */
  setAngles(az: number, el: number): void {
    this.upOverride = null
    this.az = az
    this.el = el
    this.update()
  }

  setMode(m: CameraMode): void {
    this.mode = m
    this.update()
  }

  orbit(dxPx: number, dyPx: number): void {
    this.upOverride = null
    this.az -= dxPx * 0.01
    this.el = Math.max(-EL_LIMIT, Math.min(EL_LIMIT, this.el + dyPx * 0.01))
    this.update()
  }

  pan(dxPx: number, dyPx: number): void {
    const wpp = this.worldPerPx()
    const e = this.camera.matrixWorld.elements
    const right = new THREE.Vector3(e[0], e[1], e[2])
    const up = new THREE.Vector3(e[4], e[5], e[6])
    this.target.addScaledVector(right, -dxPx * wpp)
    this.target.addScaledVector(up, dyPx * wpp)
    this.update()
  }

  zoom(factor: number): void {
    this.radius = Math.min(this.maxRadius, Math.max(this.minRadius, this.radius * factor))
    this.update()
  }

  /** Dirección de vista (del target hacia dónde mira la cámara), normalizada. */
  viewDirection(): THREE.Vector3 {
    return this.target.clone().sub(this.eye()).normalize()
  }

  private eye(): THREE.Vector3 {
    const ce = Math.cos(this.el)
    const se = Math.sin(this.el)
    const ca = Math.cos(this.az)
    const sa = Math.sin(this.az)
    const dir = new THREE.Vector3(ce * ca, ce * sa, se)
    return this.target.clone().addScaledVector(dir, this.radius)
  }

  update(): void {
    const aspect = this.width / this.height
    const eye = this.eye()
    const up = this.upVector()

    this.persp.aspect = aspect
    this.persp.position.copy(eye)
    this.persp.up.copy(up)
    this.persp.lookAt(this.target)
    this.persp.updateProjectionMatrix()

    const halfH = this.orthoHeight / 2
    const halfW = halfH * aspect
    // Profundidad suficiente para que el objetivo quede dentro del frustum aun con zoom muy alejado.
    const depth = Math.max(100_000, this.radius * 4)
    this.ortho.near = -depth
    this.ortho.far = depth
    this.ortho.left = -halfW
    this.ortho.right = halfW
    this.ortho.top = halfH
    this.ortho.bottom = -halfH
    this.ortho.position.copy(eye)
    this.ortho.up.copy(up)
    this.ortho.lookAt(this.target)
    this.ortho.updateProjectionMatrix()
  }

  rayFromNdc(nx: number, ny: number): THREE.Ray {
    const rc = new THREE.Raycaster()
    rc.setFromCamera(new THREE.Vector2(nx, ny), this.camera)
    return rc.ray
  }
}
