/**
 * Selector de archivos del sistema. El `<input>` queda dentro de la página y referenciado mientras el selector está
 * abierto: suelto, el navegador lo puede descartar y la elección se pierde (en teléfonos había que abrir dos veces).
 */
let live: HTMLInputElement | null = null

export function chooseFiles(accept: string, onPick: (files: File[]) => void, multiple = false): void {
  live?.remove()
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.multiple = multiple
  input.tabIndex = -1
  input.setAttribute('aria-hidden', 'true')
  input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0'
  const done = () => {
    input.remove()
    if (live === input) live = null
  }
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])]
    done()
    if (files.length) onPick(files)
  })
  input.addEventListener('cancel', done)
  document.body.appendChild(input)
  live = input
  input.click()
}

/** Un archivo, o null si se cancela (donde el navegador avisa la cancelación). */
export function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    chooseFiles(accept, (f) => resolve(f[0] ?? null))
    live?.addEventListener('cancel', () => resolve(null))
  })
}
