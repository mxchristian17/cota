/**
 * ¿Hay servidor de Cota (cuentas, dibujos en la nube, IA, conversión DWG)? Una compilación sin servidor
 * (`VITE_CLOUD=off`, p. ej. la demo estática) oculta lo que lo necesita; dibujar, abrir y guardar archivos
 * del equipo funciona igual.
 */
export const CLOUD_ENABLED: boolean = (import.meta.env?.VITE_CLOUD as string | undefined) !== 'off'
