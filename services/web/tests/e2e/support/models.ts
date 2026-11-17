/**
 * Modelos 3D sintéticos para los e2e de OPEN/IMPORT (generados acá, sin archivos de terceros).
 */

type V3 = [number, number, number]

/**
 * STEP (AP214) de un prisma de `w`×`d`×`h` mm con una esquina en `at`: un sólido B-rep de 6 caras planas, como el
 * que exporta cualquier modelador.
 */
export function boxStep(w: number, d: number, h: number, at: V3 = [0, 0, 0], name = 'box'): string {
  const out: string[] = []
  let n = 100
  const add = (s: string): number => {
    out.push(`#${++n}=${s};`)
    return n
  }
  const f = (x: number): string => (Number.isInteger(x) ? `${x}.` : String(x))
  const pt = (p: V3) => add(`CARTESIAN_POINT('',(${p.map(f).join(',')}))`)
  const dir = (p: V3) => add(`DIRECTION('',(${p.map(f).join(',')}))`)
  const [x0, y0, z0] = at
  const P: V3[] = [
    [x0, y0, z0],
    [x0 + w, y0, z0],
    [x0 + w, y0 + d, z0],
    [x0, y0 + d, z0],
    [x0, y0, z0 + h],
    [x0 + w, y0, z0 + h],
    [x0 + w, y0 + d, z0 + h],
    [x0, y0 + d, z0 + h],
  ]
  const pts = P.map(pt)
  const verts = pts.map((p) => add(`VERTEX_POINT('',#${p})`))
  const E: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ]
  const edges = E.map(([a, b]) => {
    const v: V3 = [P[b][0] - P[a][0], P[b][1] - P[a][1], P[b][2] - P[a][2]]
    const len = Math.hypot(...v)
    const line = add(`LINE('',#${pts[a]},#${add(`VECTOR('',#${dir([v[0] / len, v[1] / len, v[2] / len])},${f(len)})`)})`)
    return add(`EDGE_CURVE('',#${verts[a]},#${verts[b]},#${line},.T.)`)
  })
  // Cada cara: lazo antihorario visto desde afuera (arista, sentido), su normal hacia afuera y un punto.
  const faces: Array<{ loop: Array<[number, boolean]>; normal: V3; ref: V3; at: number }> = [
    { loop: [[3, false], [2, false], [1, false], [0, false]], normal: [0, 0, -1], ref: [1, 0, 0], at: 0 },
    { loop: [[4, true], [5, true], [6, true], [7, true]], normal: [0, 0, 1], ref: [1, 0, 0], at: 4 },
    { loop: [[0, true], [9, true], [4, false], [8, false]], normal: [0, -1, 0], ref: [1, 0, 0], at: 0 },
    { loop: [[2, true], [11, true], [6, false], [10, false]], normal: [0, 1, 0], ref: [-1, 0, 0], at: 2 },
    { loop: [[3, true], [8, true], [7, false], [11, false]], normal: [-1, 0, 0], ref: [0, -1, 0], at: 3 },
    { loop: [[1, true], [10, true], [5, false], [9, false]], normal: [1, 0, 0], ref: [0, 1, 0], at: 1 },
  ]
  const faceIds = faces.map((fc) => {
    const oriented = fc.loop.map(([e, sense]) => add(`ORIENTED_EDGE('',*,*,#${edges[e]},${sense ? '.T.' : '.F.'})`))
    const loop = add(`EDGE_LOOP('',(${oriented.map((o) => `#${o}`).join(',')}))`)
    const bound = add(`FACE_OUTER_BOUND('',#${loop},.T.)`)
    const plane = add(`PLANE('',#${add(`AXIS2_PLACEMENT_3D('',#${pts[fc.at]},#${dir(fc.normal)},#${dir(fc.ref)})`)})`)
    return add(`ADVANCED_FACE('',(#${bound}),#${plane},.T.)`)
  })
  const shell = add(`CLOSED_SHELL('',(${faceIds.map((x) => `#${x}`).join(',')}))`)
  const brep = add(`MANIFOLD_SOLID_BREP('${name}',#${shell})`)
  const origin = add(`AXIS2_PLACEMENT_3D('',#${pt([0, 0, 0])},#${dir([0, 0, 1])},#${dir([1, 0, 0])})`)
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('Cota test model'),'2;1');",
    `FILE_NAME('${name}.step','2026-11-17T00:00:00',(''),(''),'','','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    "#1=APPLICATION_CONTEXT('automotive design');",
    "#2=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#1);",
    "#3=PRODUCT_CONTEXT('',#1,'mechanical');",
    `#4=PRODUCT('${name}','${name}','',(#3));`,
    "#5=PRODUCT_DEFINITION_FORMATION('','',#4);",
    "#6=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');",
    "#7=PRODUCT_DEFINITION('design','',#5,#6);",
    "#8=PRODUCT_DEFINITION_SHAPE('','',#7);",
    '#9=SHAPE_DEFINITION_REPRESENTATION(#8,#10);',
    `#10=ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${origin},#${brep}),#20);`,
    "#20=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#21))GLOBAL_UNIT_ASSIGNED_CONTEXT((#22,#23,#24))REPRESENTATION_CONTEXT('',''));",
    "#21=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#22,'distance_accuracy_value','');",
    '#22=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));',
    '#23=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));',
    '#24=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());',
    ...out,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}

/** STL ASCII de un prisma de `w`×`d`×`h` con una esquina en `at` (12 triángulos). */
export function boxStl(w: number, d: number, h: number, at: V3 = [0, 0, 0]): string {
  const [x0, y0, z0] = at
  const v = (i: number): V3 => [x0 + (i & 1 ? w : 0), y0 + (i & 2 ? d : 0), z0 + (i & 4 ? h : 0)]
  const quads = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ]
  const tri = (a: number, b: number, c: number) =>
    `facet normal 0 0 0\nouter loop\n${[a, b, c].map((i) => `vertex ${v(i).join(' ')}`).join('\n')}\nendloop\nendfacet`
  return `solid box\n${quads.map(([a, b, c, dd]) => `${tri(a, b, c)}\n${tri(a, c, dd)}`).join('\n')}\nendsolid box\n`
}
