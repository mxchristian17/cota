import type { FsDirHandle, FsFileHandle } from './fileSystem'

/**
 * Sistema de archivos en memoria que implementa la misma forma que la File System Access API
 *. Se usa en los tests unitarios y en los e2e (inyectado como `showDirectoryPicker`), para
 * poder ejercitar todo el flujo sin el diálogo nativo del navegador.
 */
export class MemFile implements FsFileHandle {
  readonly kind = 'file' as const
  lastModified = Date.now()
  constructor(
    public name: string,
    public contents = '',
  ) {}

  async getFile() {
    const contents = this.contents
    const lastModified = this.lastModified
    return { text: async () => contents, lastModified }
  }

  async createWritable() {
    return {
      write: async (data: string) => {
        this.contents = data
      },
      close: async () => {
        this.lastModified = Date.now()
      },
    }
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted'
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted'
  }
}

export class MemDir implements FsDirHandle {
  readonly kind = 'directory' as const
  readonly entries = new Map<string, MemDir | MemFile>()
  /** Permiso simulado; los tests pueden ponerlo en 'prompt' para ejercitar la reconexión. */
  permission: PermissionState = 'granted'

  constructor(public name = 'workspace') {}

  async getDirectoryHandle(name: string, opts: { create?: boolean } = {}): Promise<FsDirHandle> {
    const found = this.entries.get(name)
    if (found instanceof MemDir) return found
    if (found) throw new Error(`"${name}" is a file`)
    if (!opts.create) throw new Error(`No such directory: ${name}`)
    const dir = new MemDir(name)
    this.entries.set(name, dir)
    return dir
  }

  async getFileHandle(name: string, opts: { create?: boolean } = {}): Promise<FsFileHandle> {
    const found = this.entries.get(name)
    if (found instanceof MemFile) return found
    if (found) throw new Error(`"${name}" is a directory`)
    if (!opts.create) throw new Error(`No such file: ${name}`)
    const file = new MemFile(name)
    this.entries.set(name, file)
    return file
  }

  async removeEntry(name: string): Promise<void> {
    this.entries.delete(name)
  }

  async *values(): AsyncIterable<FsDirHandle | FsFileHandle> {
    for (const entry of this.entries.values()) yield entry
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission
  }

  async requestPermission(): Promise<PermissionState> {
    this.permission = 'granted'
    return this.permission
  }

  /** Helper de tests: crea `carpeta/sub/archivo` con contenido. */
  seed(path: string, contents = ''): MemFile {
    const parts = path.split('/')
    const fileName = parts.pop() as string
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let dir: MemDir = this
    for (const p of parts) {
      const next = dir.entries.get(p)
      if (next instanceof MemDir) dir = next
      else {
        const created = new MemDir(p)
        dir.entries.set(p, created)
        dir = created
      }
    }
    const file = new MemFile(fileName, contents)
    dir.entries.set(fileName, file)
    return file
  }
}
