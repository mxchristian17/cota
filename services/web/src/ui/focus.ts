/** Devuelve el foco a la línea de comandos (tras clicks en el viewport, toggles, etc.). */
export function focusCommandLine(): void {
  const el = document.querySelector<HTMLInputElement>('[data-testid="command-input"]')
  el?.focus()
}
