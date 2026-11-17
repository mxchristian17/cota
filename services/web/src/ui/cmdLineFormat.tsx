import type { ReactNode } from 'react'

/**
 * Lectura por partes de la línea de comandos (sólo presentación; el texto queda idéntico): `Command: LINE` con el
 * nombre resaltado, las opciones `[A/B/C]` en tinta, el valor por defecto `<…>` atenuado, la respuesta tipeada después
 * del último «: » en texto pleno y los avisos de error en rojo.
 */
const ERROR = /^(\*[^*]+\*$|Invalid |Unknown command|Error|Cannot |Object selected is not)/

/** Opciones `[…]` y valor por defecto `<…>` dentro de un pedido. */
export function formatPrompt(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\[[^\]]*\]|<[^>]*>)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <span key={k++} className={m[0].startsWith('[') ? 'cl-opts' : 'cl-def'}>
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function formatCmdLine(line: string): ReactNode {
  if (ERROR.test(line)) return <span className="cl-err">{line}</span>
  const cmd = /^(Command:\s)(\S.*)$/.exec(line)
  if (cmd) {
    return (
      <>
        <span className="cl-cmd">{cmd[1]}</span>
        <span className="cl-name">{cmd[2]}</span>
      </>
    )
  }
  // Pedido con respuesta: lo que sigue al último «: » es lo que se tipeó.
  const cut = line.lastIndexOf(': ')
  if (cut > 0 && /[[<]|^(Specify|Select|Enter|Pick|Choose)/.test(line.slice(0, cut))) {
    return (
      <>
        {formatPrompt(line.slice(0, cut + 2))}
        <span className="cl-answer">{line.slice(cut + 2)}</span>
      </>
    )
  }
  return /[[<]/.test(line) ? <>{formatPrompt(line)}</> : line
}
