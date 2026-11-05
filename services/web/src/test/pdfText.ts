import { unzlibSync } from 'fflate'

/** Texto de un PDF con sus contenidos (Flate) descomprimidos, para buscar operadores en los tests. */
export function pdfText(bytes: Uint8Array): string {
  const latin1 = (b: Uint8Array) => {
    let s = ''
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192))
    return s
  }
  const raw = latin1(bytes)
  return raw.replace(/\/Filter \/FlateDecode >>\nstream\n([\s\S]*?)\nendstream/g, (_, data: string) => {
    const b = Uint8Array.from(data, (c) => c.charCodeAt(0))
    return `>>\nstream\n${latin1(unzlibSync(b))}\nendstream`
  })
}
