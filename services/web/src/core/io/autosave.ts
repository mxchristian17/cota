/**
 * Condición de autoguardado (+ ).
 *
 * Se guarda sola la sesión en la nube, o el **archivo ya abierto** de la carpeta local. Un dibujo
 * local que nunca se guardó no se crea solo: hace falta un `SAVE` explícito que le dé nombre y
 * ubicación. Puro para poder testearlo sin temporizadores.
 */
export interface AutosaveState {
  /** Sesión iniciada contra el backend. */
  token: string | null
  /** Carpeta de trabajo local elegida (o null si se trabaja en la nube). */
  fsFolderName: string | null
  /** La carpeta está recordada pero el navegador todavía no devolvió el permiso. */
  fsPending: boolean
  /** Archivo abierto dentro de la carpeta local. */
  fsFilePath: string | null
}

export function canAutosave(s: AutosaveState): boolean {
  const localReady = s.fsFolderName !== null && !s.fsPending && s.fsFilePath !== null
  return localReady || s.token !== null
}
