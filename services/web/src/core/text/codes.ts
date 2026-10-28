/**
 * Códigos de control del texto del CAD clásico: `%%c` Ø, `%%d` °, `%%p` ±, `%%%` %, `%%nnn` el carácter nnn.
 * Se convierten al teclear o importar el texto (así se ven en pantalla, en el PDF y en las cotas) y vuelven a
 * los códigos al exportar a DXF, que es como los guarda el CAD clásico. `%%u`/`%%o` (subrayado, sobrerrayado)
 * no se dibujan: se quitan.
 */
const DECODE: Record<string, string> = { c: 'Ø', d: '°', p: '±', '%': '%', u: '', o: '' }

export function decodeTextCodes(s: string): string {
  return s.replace(/%%(\d{3}|[cdpuo%])/gi, (_, k: string) => (/\d/.test(k) ? String.fromCharCode(Number(k)) : DECODE[k.toLowerCase()]))
}

export function encodeTextCodes(s: string): string {
  return s.replace(/%/g, '%%%').replace(/[Ø⌀∅]/g, '%%c').replace(/°/g, '%%d').replace(/±/g, '%%p')
}
