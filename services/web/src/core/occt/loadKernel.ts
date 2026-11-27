/// <reference lib="webworker" />
import { OcctKernel } from 'occt-wasm'

/**
 * El núcleo exacto (OpenCascade) en un hilo: el módulo LGPL (`occt-wasm.js` + `occt-wasm.wasm`) se carga por URL desde
 * `occt/<versión>/` recién con el primer pedido, una vez por hilo.
 */
let kernel: Promise<OcctKernel> | null = null
export let kernelInitMs = 0

export function loadKernel(): Promise<OcctKernel> {
  kernel ??= (async () => {
    const t0 = performance.now()
    const base = new URL(`${import.meta.env.BASE_URL}occt/${__OCCT_VERSION__}/`, self.location.href).href
    const glue = (await import(/* @vite-ignore */ `${base}occt-wasm.js`)) as { default: (o: Record<string, unknown>) => Promise<unknown> }
    const k = await OcctKernel.init({ createModule: glue.default, wasm: `${base}occt-wasm.wasm` })
    kernelInitMs = performance.now() - t0
    return k
  })()
  return kernel
}
