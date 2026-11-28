// Cuadro de bicicleta de ruta talle 56, acero (TIG), freno de llanta, eje 130 QR, caja BSA 68, dirección 1-1/8" recta.
// Unidades mm. Ejes: X hacia adelante, Z hacia arriba, Y a la izquierda (el lado de la transmisión es −Y). Origen: centro
// de la caja pedalera. Escribe cuadro-ruta-56.step (ensamble con nombres y colores) y cuadro-ruta-56-geometria.json (los
// puntos de la geometría, para acotar los planos), junto a este archivo.
// Uso, desde la raíz del repositorio (con `npm ci` hecho en services/web): node examples/cuadro-ruta-56.mjs
import { writeFileSync } from 'node:fs'
const { OcctKernel } = await import(new URL('../services/web/node_modules/occt-wasm/dist/index.js', import.meta.url).href)
const here = (name) => new URL(name, import.meta.url)
const k = await OcctKernel.init()

// ── Vectores ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const V = (p) => ({ x: p[0], y: p[1], z: p[2] })
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a) => Math.hypot(...a)
const unit = (a) => mul(a, 1 / len(a))
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

/** Matriz 3×4 (filas) de un marco: columnas ex, ey, ez y origen o. */
const frame = (o, ex, ey, ez) => [ex[0], ey[0], ez[0], o[0], ex[1], ey[1], ez[1], o[1], ex[2], ey[2], ez[2], o[2]]
/** Marco con Z en `ez` y X lo más cerca posible de `hint`. */
function axisFrame(o, ez, hint = [0, 0, 1]) {
  ez = unit(ez)
  let ex = sub(hint, mul(ez, dot(hint, ez)))
  if (len(ex) < 1e-6) ex = sub([1, 0, 0], mul(ez, ez[0]))
  ex = unit(ex)
  return frame(o, ex, cross(ez, ex), ez)
}
const place = (s, m) => k.transform(s, m)
/** El sólido de una forma más cercano a un punto (lo que queda entre dos tubos al ingletear un puente). */
const nearest = (s, p) => {
  const list = k.getSubShapes(s, 'solid')
  const d = (x) => {
    const c = k.getCenterOfMass(x)
    return Math.hypot(c.x - p[0], c.y - p[1], c.z - p[2])
  }
  return list.reduce((best, x) => (d(x) < d(best) ? x : best))
}
const solid = (s) => {
  const list = k.getSubShapes(s, 'solid')
  if (list.length !== 1) throw new Error(`se esperaba un sólido, hay ${list.length}`)
  return list[0]
}

/** Cilindro macizo Ø`d` de `a` a `b`, alargado `ext` de cada lado. */
function rod(a, b, d, ext = 0) {
  const u = unit(sub(b, a))
  return place(k.makeCylinder(d / 2, len(sub(b, a)) + 2 * ext), axisFrame(sub(a, mul(u, ext)), u))
}
/** Tubo Ø`od` × `wall` de `a` a `b`. */
const tube = (a, b, od, wall, ext = 0) => k.cut(rod(a, b, od, ext), rod(a, b, od - 2 * wall, ext + 1))
/** Cono macizo de `a` (Ø d1) a `b` (Ø d2), alargado `ext` de cada lado con la misma conicidad. */
function cone(a, b, d1, d2, ext = 0) {
  const u = unit(sub(b, a))
  const L = len(sub(b, a))
  const slope = (d2 - d1) / 2 / L
  const r1 = d1 / 2 - slope * ext
  const r2 = d2 / 2 + slope * ext
  return place(k.makeCone(r1, r2, L + 2 * ext), axisFrame(sub(a, mul(u, ext)), u))
}
const conicTube = (a, b, d1, d2, wall, ext = 0) => k.cut(cone(a, b, d1, d2, ext), cone(a, b, d1 - 2 * wall, d2 - 2 * wall, ext + 1))

// ── Geometría (talle 56) ─────────────────────────────────────────────────────────────────────────────────────────────
const G = {
  seatAngle: 73.5,
  headAngle: 73,
  seatTubeCT: 560, // centro de la caja → extremo superior del tubo de asiento
  stack: 565,
  reach: 385,
  headTube: 150,
  chainstay: 405,
  bbDrop: 70,
  rearSpacing: 130, // OLD, eje QR
  bbWidth: 68, // BSA
}
const O = [0, 0, 0]
const R = [-Math.sqrt(G.chainstay ** 2 - G.bbDrop ** 2), 0, G.bbDrop] // eje trasero
const s = [-Math.cos(rad(G.seatAngle)), 0, Math.sin(rad(G.seatAngle))] // eje del tubo de asiento (hacia arriba)
const ST_TOP = mul(s, G.seatTubeCT)
const HT_TOP = [G.reach, 0, G.stack]
const h = [Math.cos(rad(G.headAngle)), 0, -Math.sin(rad(G.headAngle))] // eje de dirección, hacia abajo
const HT_BOT = add(HT_TOP, mul(h, G.headTube))
const TT_A = mul(s, 520) // eje del superior en el de asiento
const TT_B = add(HT_TOP, mul(h, 30)) // y en el de dirección
const DT_B = sub(HT_BOT, mul(h, 28)) // eje del inferior en el de dirección

// Envolventes macizas para ingletear (lo que un tubo no puede invadir).
const bbOuter = rod([0, -G.bbWidth / 2, 0], [0, G.bbWidth / 2, 0], 40)
const htOuter = rod(HT_TOP, HT_BOT, 36, 60)
const stOuter = rod(O, ST_TOP, 28.6, 60)

// ── Triángulo delantero ──────────────────────────────────────────────────────────────────────────────────────────────
// Caja BSA 68: Ø40, interior al diámetro menor de la rosca 1,370"×24 (Ø33,6); agujero M5 abajo (guía de cables).
let caja = k.cut(rod([0, -34, 0], [0, 34, 0], 40), rod([0, -35, 0], [0, 35, 0], 33.6))
caja = k.cut(caja, rod([0, 0, -25], [0, 0, -15], 4.2))
// Dirección 1-1/8" recta: Ø36, interior Ø33,8, alojamientos de cazoletas Ø33,95 × 12 en los dos extremos.
let direccion = tube(HT_TOP, HT_BOT, 36, 1.1)
direccion = k.cut(direccion, rod(sub(HT_TOP, mul(h, 1)), add(HT_TOP, mul(h, 12)), 33.95))
direccion = k.cut(direccion, rod(sub(HT_BOT, mul(h, 12)), add(HT_BOT, mul(h, 1)), 33.95))
// Asiento Ø28,6 × 0,7 (interior 27,2: poste de sillín 27,2), ranura de 1,6 × 16 atrás con agujero de alivio Ø3.
let asiento = k.cut(tube(O, ST_TOP, 28.6, 0.7), bbOuter)
const back = [-s[2], 0, s[0]] // perpendicular al tubo de asiento, hacia atrás
{
  const slotTop = add(ST_TOP, mul(s, 2))
  const slotBot = mul(s, G.seatTubeCT - 16)
  const ranura = place(k.makeBox(1.6, 20, 16 + 2), frame(add(slotBot, [0, -0.8, 0]), [0, 1, 0], back, s))
  asiento = k.cut(asiento, ranura)
  asiento = k.cut(asiento, rod(slotBot, add(slotBot, mul(back, 20)), 3))
  void slotTop
}
// Superior Ø31,8 × 0,7 e inferior Ø34,9 × 0,8, ingleteados.
const superior = k.cut(k.cut(tube(TT_A, TT_B, 31.8, 0.7), stOuter), htOuter)
let inferior = k.cut(k.cut(k.cut(tube(O, DT_B, 34.9, 0.8), bbOuter), htOuter), stOuter)

// ── Triángulo trasero ────────────────────────────────────────────────────────────────────────────────────────────────
const plateIn = G.rearSpacing / 2 // cara interior de la puntera
const plateT = 5
const plateMid = plateIn + plateT / 2
const toBB = unit([O[0] - R[0], O[2] - R[2]]) // en XZ, del eje a la caja
const ssTop = mul(s, 500)
const toST = unit([ssTop[0] - R[0], ssTop[2] - R[2]])
const at2 = (dir, d) => [R[0] + dir[0] * d, 0, R[2] + dir[1] * d]

/** Puntera vertical de 5 mm (cara interior en |y| = 65): contorno de arcos y tangentes, ranura del eje y, a la derecha, patilla M10×1. */
function puntera(side) {
  const y0 = side > 0 ? plateIn : -plateIn - plateT
  const c = [
    { c: [0, 0], r: 13 }, // alrededor del eje
    { c: [toBB[0] * 45, toBB[1] * 45], r: 7 }, // lengüeta de la vaina
    { c: [toST[0] * 40, toST[1] * 40], r: 5.5 }, // lengüeta del tirante
  ]
  const hanger = [24 * Math.cos(rad(245)), 24 * Math.sin(rad(245))]
  if (side < 0) c.push({ c: hanger, r: 9.5 })
  const outline = hullOfCircles(c)
  const P = (q) => V([R[0] + q[0], y0, R[2] + q[1]])
  const edges = []
  for (const seg of outline) edges.push(seg.kind === 'line' ? k.makeLineEdge(P(seg.a), P(seg.b)) : k.makeArcEdge(P(seg.a), P(seg.m), P(seg.b)))
  let plate = k.extrude(k.makeFace(k.makeWire(edges)), 0, plateT, 0)
  // Ranura del eje Ø10,1, abierta hacia abajo y 20° hacia adelante.
  const ez = [Math.sin(rad(20)), 0, -Math.cos(rad(20))]
  const ey = [0, 1, 0]
  const ex = cross(ey, ez)
  const slot = place(k.makeBox(10.1, plateT + 2, 30), frame(add([R[0], y0 - 1, R[2]], mul(ex, -5.05)), ex, ey, ez))
  plate = k.cut(plate, k.fuse(rod([R[0], y0 - 1, R[2]], [R[0], y0 + plateT + 1, R[2]], 10.1), slot))
  if (side < 0) plate = k.cut(plate, rod([R[0] + hanger[0], y0 - 1, R[2] + hanger[1]], [R[0] + hanger[0], y0 + plateT + 1, R[2] + hanger[1]], 9)) // M10×1: broca 9
  return solid(plate)
}

/** Envolvente convexa de circunferencias en 2D: tramos rectos tangentes y arcos, en sentido antihorario. */
function hullOfCircles(circles) {
  // Qué circunferencias quedan en la envolvente y en qué orden: por una muestra fina.
  const pts = []
  circles.forEach((ci, i) => {
    for (let a = 0; a < 360; a += 2) pts.push({ p: [ci.c[0] + ci.r * Math.cos(rad(a)), ci.c[1] + ci.r * Math.sin(rad(a))], i })
  })
  pts.sort((p, q) => p.p[0] - q.p[0] || p.p[1] - q.p[1])
  const crossZ = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && crossZ(lower.at(-2).p, lower.at(-1).p, p.p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && crossZ(upper.at(-2).p, upper.at(-1).p, p.p) <= 0) upper.pop()
    upper.push(p)
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  const order = []
  for (const p of hull) if (order.at(-1) !== p.i) order.push(p.i)
  if (order.length > 1 && order[0] === order.at(-1)) order.pop()
  // Tangente exterior (la envolvente queda a la derecha del avance antihorario… a la izquierda del interior).
  const tangent = (A, B) => {
    const d = [B.c[0] - A.c[0], B.c[1] - A.c[1]]
    const L = Math.hypot(...d)
    const phi = Math.atan2(d[1], d[0]) - Math.acos((A.r - B.r) / L)
    const n = [Math.cos(phi), Math.sin(phi)]
    return [
      [A.c[0] + A.r * n[0], A.c[1] + A.r * n[1]],
      [B.c[0] + B.r * n[0], B.c[1] + B.r * n[1]],
    ]
  }
  const tans = order.map((i, j) => tangent(circles[i], circles[order[(j + 1) % order.length]]))
  const segs = []
  order.forEach((i, j) => {
    const C = circles[i]
    const from = tans[(j - 1 + order.length) % order.length][1]
    const to = tans[j][0]
    let a0 = Math.atan2(from[1] - C.c[1], from[0] - C.c[0])
    let a1 = Math.atan2(to[1] - C.c[1], to[0] - C.c[0])
    while (a1 <= a0) a1 += 2 * Math.PI
    const am = (a0 + a1) / 2
    segs.push({ kind: 'arc', a: from, m: [C.c[0] + C.r * Math.cos(am), C.c[1] + C.r * Math.sin(am)], b: to })
    segs.push({ kind: 'line', a: tans[j][0], b: tans[j][1] })
  })
  return segs
}

const punteraIzq = puntera(1)
const punteraDer = puntera(-1)

/** Vaina: oval 14 × 24 en la caja a redonda Ø16 en la puntera (como las ovales-redondas de catálogo), pared 0,8. */
function vaina(side) {
  const a = [0, side * 16, 0]
  const b = [R[0] + toBB[0] * 28, side * plateMid, R[2] + toBB[1] * 28]
  const u = unit(sub(b, a))
  const L = len(sub(b, a))
  const m = axisFrame(a, u, [0, 0, 1])
  const section = (z, major, minor) =>
    major === minor
      ? k.makeWire([k.makeCircleEdge(V([0, 0, z]), V([0, 0, 1]), major)])
      : k.makeWire([k.makeEllipseEdge(V([0, 0, z]), V([0, 0, 1]), major, minor)])
  // Secciones a lo largo: el oval se redondea en los primeros 160 mm (a lo largo de toda, lineal en los semiejes).
  const semi = (t) => [12 + (8 - 12) * Math.min(1, t / 160), 7 + (8 - 7) * Math.min(1, t / 160)]
  const outerAt = (t) => section(t, ...semi(t))
  const innerAt = (t) => section(t, ...semi(Math.max(0, Math.min(L, t))).map((v) => v - 0.8))
  const outer = place(k.loft([outerAt(-6), outerAt(160), outerAt(L)], true, false), m)
  // El extremo de la puntera, tapado: los últimos 3 mm macizos (la lengüeta entra en su ranura).
  const inner = place(k.loft([innerAt(-7), innerAt(160), innerAt(L - 3)], true, false), m)
  return { shape: k.cut(outer, inner), outer, a, b }
}
/** Tirante: cónico Ø16 → Ø12,7, pared 0,7. */
function tirante(side) {
  const a = [ssTop[0], side * 8, ssTop[2]]
  const b = [R[0] + toST[0] * 22, side * plateMid, R[2] + toST[1] * 22]
  // Hueco hasta 3 mm antes del extremo de la puntera (tapado).
  const u = unit(sub(b, a))
  const L = len(sub(b, a))
  const bIn = add(a, mul(u, L - 3))
  const dIn = 16 + ((12.7 - 16) * (L - 3)) / L
  const hollow = k.cut(cone(a, b, 16, 12.7, 2), cone(sub(a, mul(u, 3)), bIn, 16 - 1.4 + (0.0), dIn - 1.4, 0))
  return { shape: hollow, outer: cone(a, b, 16, 12.7, 2), a, b }
}
const vI = vaina(1)
const vD = vaina(-1)
const tI = tirante(1)
const tD = tirante(-1)
const vainaIzq = solid(k.cut(k.cut(vI.shape, bbOuter), punteraIzq))
const vainaDer = solid(k.cut(k.cut(vD.shape, bbOuter), punteraDer))
const tiranteIzq = solid(k.cut(k.cut(tI.shape, stOuter), punteraIzq))
const tiranteDer = solid(k.cut(k.cut(tD.shape, stOuter), punteraDer))

// Puente de freno Ø12,7 × 0,9: agujero del perno Ø6 a 347 mm del eje (pinzas de alcance corto, 39–49 mm).
const B = at2(toST, 347)
const tBolt = [toST[1], 0, -toST[0]] // perpendicular al radio, hacia adelante
let puenteFreno = nearest(k.cut(k.cut(tube(add(B, [0, -40, 0]), add(B, [0, 40, 0]), 12.7, 0.9), tI.outer), tD.outer), B)
puenteFreno = solid(k.cut(puenteFreno, rod(sub(B, mul(tBolt, 10)), add(B, mul(tBolt, 10)), 6)))
// Puente de vainas Ø16 × 0,9, delante de la cubierta (a 52 mm de la caja a lo largo de las vainas).
const C = [-toBB[0] * 52, 0, -toBB[1] * 52]
const puenteVainas = nearest(k.cut(k.cut(tube(add(C, [0, -40, 0]), add(C, [0, 40, 0]), 16, 0.9), vI.outer), vD.outer), C)

// ── Soldados: tacos M5 y topes de funda (un modelo cada uno, ubicado varias veces) ──────────────────────────────────
// Taco de portabidón: Ø8 × 5,1 (pasa la pared y asoma 3,5), rosca M5 (broca 4,2). Origen en la superficie del tubo, Z hacia afuera.
const taco = k.cut(place(k.makeCylinder(4, 5.1), frame([0, 0, -1.6], [1, 0, 0], [0, 1, 0], [0, 0, 1])), place(k.makeCylinder(2.1, 8), frame([0, 0, -3], [1, 0, 0], [0, 1, 0], [0, 0, 1])))
/** Tope de funda sobre un tubo de radio `r`: cuerpo 12 × 8 × 9, alojamiento de la funda Ø5,2 × 8 y paso del cable Ø2. X a lo largo del tubo, Z hacia afuera. */
function tope(r) {
  let b = place(k.makeBox(12, 8, 11), frame([-6, -4, -2], [1, 0, 0], [0, 1, 0], [0, 0, 1]))
  b = k.cut(b, place(k.makeCylinder(r, 40), frame([-20, 0, -r], [0, 1, 0], [0, 0, 1], [1, 0, 0])))
  b = k.cut(b, place(k.makeCylinder(2.6, 8), frame([-2, 0, 5], [0, 1, 0], [0, 0, 1], [1, 0, 0])))
  b = k.cut(b, place(k.makeCylinder(1, 20), frame([-10, 0, 5], [0, 1, 0], [0, 0, 1], [1, 0, 0])))
  // Aristas de arriba chaflanadas 0,8 mm (pieza mecanizada).
  b = solid(b)
  try {
    const top = k.getSubShapes(b, 'edge').filter((e) => {
      const bb = k.getBoundingBox(e)
      return bb.zmin > 8.9 && bb.zmax < 9.1
    })
    b = k.chamfer(b, top, 0.8)
  } catch (err) {
    console.log('chaflán del tope:', err.message)
  }
  return solid(b)
}
const topeInferior = tope(34.9 / 2)
const topeSuperior = tope(31.8 / 2)

/** Ubicación (rx, ry, rz y traslación: R = Rz·Ry·Rx, como XCAF) de un marco. */
function location(m) {
  const R3 = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ]
  const ry = Math.asin(-R3[2][0])
  return { rx: Math.atan2(R3[2][1], R3[2][2]), ry, rz: Math.atan2(R3[1][0], R3[0][0]), tx: m[3], ty: m[7], tz: m[11] }
}
/** Marco en la superficie de un tubo (eje `a`→`b`, radio `r`) a la distancia `t` de `a`, mirando hacia `n` (unitaria, ⟂ al eje). */
const onTube = (a, b, r, t, n) => {
  const u = unit(sub(b, a))
  return frame(add(add(a, mul(u, t)), mul(n, r)), u, cross(n, u), n)
}
const dtU = unit(sub(DT_B, O))
const dtUp = [-dtU[2], 0, dtU[0]] // cara de arriba del inferior
const stFront = [s[2], 0, -s[0]] // cara de adelante del de asiento
const ttU = unit(sub(TT_B, TT_A))
const ttUp = [-ttU[2], 0, ttU[0]]
const tacos = [onTube(O, DT_B, 34.9 / 2, 330, dtUp), onTube(O, DT_B, 34.9 / 2, 394, dtUp), onTube(O, ST_TOP, 28.6 / 2, 200, stFront), onTube(O, ST_TOP, 28.6 / 2, 264, stFront)]
// Agujeros Ø8 de los tacos en los tubos.
for (const [i, m] of tacos.entries()) {
  const p = [m[3], m[7], m[11]]
  const n = [m[2], m[6], m[10]]
  const hole = rod(sub(p, mul(n, 3)), add(p, mul(n, 1)), 8)
  if (i < 2) inferior = k.cut(inferior, hole)
  else asiento = k.cut(asiento, hole)
}
const dtLen = len(DT_B)
const topesInf = [onTube(O, DT_B, 34.9 / 2, dtLen - 95, [0, 1, 0]), onTube(O, DT_B, 34.9 / 2, dtLen - 95, [0, -1, 0])]
const ttLen = len(sub(TT_B, TT_A))
// En el superior: el de adelante recibe la funda desde la palanca (alojamiento hacia adelante); el de atrás, hacia atrás.
const topesSup = [onTube(TT_A, TT_B, 31.8 / 2, ttLen - 60, ttUp), (() => {
  const m = onTube(TT_A, TT_B, 31.8 / 2, 45, ttUp)
  // Girado 180° alrededor de la normal: X y Y invertidas.
  return [-m[0], -m[1], m[2], m[3], -m[4], -m[5], m[6], m[7], -m[8], -m[9], m[10], m[11]]
})()]

// Abrazadera de sillín (aluminio, aparte): anillo Ø28,6/Ø34 × 14, corte de 2 mm atrás, orejas con perno M5.
let abrazadera = k.cut(rod(mul(s, G.seatTubeCT - 14), ST_TOP, 34), rod(mul(s, G.seatTubeCT - 15), add(ST_TOP, mul(s, 1)), 28.6))
{
  const mid = mul(s, G.seatTubeCT - 7)
  const oreja = place(k.makeBox(14, 12, 10), frame(add(add(mid, mul(back, 13)), add(mul(s, -5), [0, 6, 0])), back, [0, -1, 0], s))
  abrazadera = k.fuse(abrazadera, k.cut(oreja, rod(mul(s, G.seatTubeCT - 15), add(ST_TOP, mul(s, 1)), 28.6)))
  abrazadera = k.cut(abrazadera, place(k.makeBox(30, 2, 20), frame(add(add(mid, mul(back, 10)), add(mul(s, -10), [0, 1, 0])), back, [0, -1, 0], s)))
  abrazadera = k.cut(abrazadera, rod(add(add(mid, mul(back, 21)), [0, -10, 0]), add(add(mid, mul(back, 21)), [0, 10, 0]), 5.2))
}
abrazadera = solid(abrazadera)

// ── Controles ────────────────────────────────────────────────────────────────────────────────────────────────────────
const placed = (shape, m) => place(shape, m)
const parts = {
  'Tubo de dirección': solid(direccion),
  'Tubo superior': solid(superior),
  'Tubo inferior': solid(inferior),
  'Tubo de asiento': solid(asiento),
  'Caja pedalera BSA': solid(caja),
  'Vaina izquierda': vainaIzq,
  'Vaina derecha': vainaDer,
  'Tirante izquierdo': tiranteIzq,
  'Tirante derecho': tiranteDer,
  'Puente de freno': puenteFreno,
  'Puente de vainas': puenteVainas,
  'Puntera izquierda': punteraIzq,
  'Puntera derecha': punteraDer,
  'Abrazadera de sillín': abrazadera,
}
const world = { ...parts }
tacos.forEach((m, i) => (world[`Taco M5 ${i + 1}`] = placed(taco, m)))
topesInf.forEach((m, i) => (world[`Tope inferior ${i + 1}`] = placed(topeInferior, m)))
topesSup.forEach((m, i) => (world[`Tope superior ${i + 1}`] = placed(topeSuperior, m)))
const DENS = { acero: 7.85e-3, aluminio: 2.7e-3 } // g/mm³
let mass = 0
for (const [n, p] of Object.entries(world)) {
  const v = k.getVolume(p)
  mass += v * (n.startsWith('Abrazadera') ? DENS.aluminio : DENS.acero)
  if (!k.isValid(p) || !(v > 0)) console.log('INVÁLIDA', n)
}
console.log('piezas', Object.keys(world).length, 'masa', (mass / 1000).toFixed(3), 'kg')
const names = Object.keys(world)
let bad = 0
for (let i = 0; i < names.length; i++)
  for (let j = i + 1; j < names.length; j++) {
    let v = 0
    try {
      v = k.getVolume(k.intersect(world[names[i]], world[names[j]]))
    } catch {}
    if (v > 1e-3) {
      bad++
      console.log('INTERFERENCIA', names[i], '×', names[j], v.toFixed(3), 'mm³')
    }
  }
console.log('interferencias', bad)

// ── STEP (ensamble con nombres y colores) ────────────────────────────────────────────────────────────────────────────
const doc = k.createXCAFDocument()
const addPart = (parent, shape, name, color, loc) => {
  const c = doc.addChild(parent, shape, { name, color, ...(loc ? { location: loc } : {}) })
  doc.setName(doc.getReferredLabel(c), name.replace(/ \d+$/, ''))
  return c
}
const addSub = (parent, name) => {
  const c = doc.addChild(parent, k.makeCompound([]), { name })
  const d = doc.getReferredLabel(c)
  doc.setName(d, name)
  return d
}
const PINTURA = [0.72, 0.11, 0.11]
const LATON = [0.78, 0.62, 0.3]
const NEGRO = [0.12, 0.12, 0.13]
const root = doc.addShape(k.makeCompound([]), { name: 'Cuadro ruta 56 acero' })
const del = addSub(root, 'Triángulo delantero')
for (const n of ['Tubo de dirección', 'Tubo superior', 'Tubo inferior', 'Tubo de asiento', 'Caja pedalera BSA']) addPart(del, parts[n], n, PINTURA)
const tras = addSub(root, 'Triángulo trasero')
for (const n of ['Vaina izquierda', 'Vaina derecha', 'Tirante izquierdo', 'Tirante derecho', 'Puente de freno', 'Puente de vainas', 'Puntera izquierda', 'Puntera derecha']) addPart(tras, parts[n], n, PINTURA)
const sold = addSub(root, 'Soldados')
tacos.forEach((m, i) => addPart(sold, taco, `Taco M5 ${i + 1}`, LATON, location(m)))
topesInf.forEach((m, i) => addPart(sold, topeInferior, `Tope de funda inferior ${i + 1}`, PINTURA, location(m)))
topesSup.forEach((m, i) => addPart(sold, topeSuperior, `Tope de funda superior ${i + 1}`, PINTURA, location(m)))
addPart(root, parts['Abrazadera de sillín'], 'Abrazadera de sillín', NEGRO)
const step = doc.exportSTEP({ unit: 'mm', schema: 'AP214' })
writeFileSync(here('cuadro-ruta-56.step'), step)

// Lo que miden los planos.
const ett = TT_B[0] + (TT_B[2] - 0) * 0 // se calcula abajo
const zTT = TT_B[2]
const stAtZ = mul(s, zTT / s[2]) // donde el eje del de asiento cruza la altura del superior en la dirección
const geo = {
  G,
  R,
  ST_TOP,
  HT_TOP,
  HT_BOT,
  TT_A,
  TT_B,
  DT_B,
  B,
  C,
  effectiveTopTube: TT_B[0] - stAtZ[0],
  wheelbaseNote: 'Con horquilla de 370 mm eje–corona y 45 mm de avance',
  massKg: mass / 1000,
  tubes: {
    'Tubo superior': { od: 31.8, wall: 0.7, length: len(sub(TT_B, TT_A)) },
    'Tubo inferior': { od: 34.9, wall: 0.8, length: len(DT_B) },
    'Tubo de asiento': { od: 28.6, wall: 0.7, length: G.seatTubeCT },
    'Tubo de dirección': { od: 36, wall: 1.1, length: G.headTube },
  },
}
void ett
writeFileSync(here('cuadro-ruta-56-geometria.json'), JSON.stringify(geo, null, 1))
console.log('STEP', step.length, 'ETT', geo.effectiveTopTube.toFixed(1))
