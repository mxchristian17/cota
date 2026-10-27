/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endpoint de GoatCounter de la demo pública (`https://<código>.goatcounter.com/count`). */
  readonly VITE_ANALYTICS_GOATCOUNTER?: string
  /** Id de medición de Google Analytics 4 de la demo pública (`G-…`). */
  readonly VITE_ANALYTICS_GA4?: string
}
