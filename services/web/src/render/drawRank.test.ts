import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { rankArray, rankScale, rankStep, ranked } from './drawRank'

/** Shader de vértices de un material tras `onBeforeCompile`, como lo armaría el renderer. */
function compiled(m: THREE.Material): { vertexShader: string; uniforms: Record<string, THREE.IUniform> } {
  const sh = { vertexShader: '#include <project_vertex>\n', fragmentShader: '', uniforms: {} as Record<string, THREE.IUniform> }
  m.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
  return sh
}

describe('orden de dibujo (drawRank)', () => {
  it('el adelanto pasa por el factor común rankScale (1 en planta, 0 en vistas 3D)', () => {
    const sh = compiled(ranked(new THREE.MeshBasicMaterial(), rankStep(10)))
    expect(sh.vertexShader).toContain('uniform float rankScale;')
    expect(sh.vertexShader).toMatch(/gl_Position\.z -= drawRank \* [0-9.e+-]+ \* rankScale \* gl_Position\.w;/)
    // Todos los materiales comparten el mismo objeto: el viewport lo cambia una vez por cuadro.
    expect(sh.uniforms.rankScale).toBe(rankScale)
    expect(compiled(ranked(new THREE.LineBasicMaterial(), rankStep(10))).uniforms.rankScale).toBe(rankScale)
  })

  it('el paso se achica en dibujos enormes y el rango se reparte por tramo', () => {
    expect(rankStep(1)).toBeCloseTo(2.5e-7)
    expect(rankStep(50000) * 50000).toBeCloseTo(0.01)
    expect([...rankArray(5, [{ s: 0, id: 'a' }, { s: 2, id: 'b' }], (id) => (id === 'a' ? 3 : 7))]).toEqual([3, 3, 7, 7, 7])
  })
})
