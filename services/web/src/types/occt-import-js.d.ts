declare module 'occt-import-js' {
  interface OcctMesh {
    name?: string
    attributes: { position: { array: number[] } }
    index: { array: number[] }
  }
  interface OcctResult {
    success: boolean
    meshes: OcctMesh[]
  }
  interface Occt {
    ReadStepFile(content: Uint8Array, params: unknown): OcctResult
    ReadIgesFile(content: Uint8Array, params: unknown): OcctResult
  }
  const factory: (opts?: { locateFile?: (path: string) => string }) => Promise<Occt>
  export default factory
}
