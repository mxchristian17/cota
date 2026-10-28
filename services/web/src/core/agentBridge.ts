/**
 * Puente entre los comandos (núcleo, sin UI) y el panel del agente: AGENT y COMPACT llaman acá y el panel, al
 * cargarse, registra quién atiende. Evita que el núcleo importe la interfaz.
 */
export type AgentAction = 'toggle' | 'compact'
let handler: ((a: AgentAction) => boolean) | null = null

export const agentBridge = {
  set(h: ((a: AgentAction) => boolean) | null): void {
    handler = h
  },
  /** false si no hay panel (p. ej. en los tests del motor). */
  call(a: AgentAction): boolean {
    return handler ? handler(a) : false
  },
}
