/**
 * Estadísticas de visitas, opcionales y sólo para la demo pública: se activan si el build recibe una de estas
 * variables (en el repo oficial, desde las variables de GitHub Actions; nunca escritas en el código). Un build propio
 * o local no manda nada a nadie.
 *
 * - `VITE_ANALYTICS_GOATCOUNTER`: endpoint de GoatCounter (`https://<código>.goatcounter.com/count`). Sin cookies ni
 *   scripts de terceros: una sola petición por visita, así que no hace falta pedir consentimiento.
 * - `VITE_ANALYTICS_GA4`: id de medición de Google Analytics 4 (`G-…`). Nada de Google se carga hasta que la persona
 *   acepta el aviso (se recuerda su respuesta); si lo rechaza, no se carga nunca.
 *
 * Sólo se cuenta la visita (página, sitio de procedencia, tamaño de pantalla e idioma): nunca el dibujo, los
 * comandos ni nada que se escriba.
 */
const CONSENT_KEY = 'cota.analyticsConsent'

type Env = { VITE_ANALYTICS_GOATCOUNTER?: string; VITE_ANALYTICS_GA4?: string }

export function startAnalytics(env: Env = import.meta.env as Env): void {
  if (typeof window === 'undefined' || navigator.doNotTrack === '1') return
  const gc = env.VITE_ANALYTICS_GOATCOUNTER?.trim()
  if (gc && /^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/i.test(gc)) countWithGoatCounter(gc)
  const ga = env.VITE_ANALYTICS_GA4?.trim()
  if (ga && /^G-[A-Z0-9]{4,20}$/.test(ga)) startGoogleAnalytics(ga)
}

function countWithGoatCounter(endpoint: string): void {
  const q = new URLSearchParams({
    p: location.pathname,
    t: document.title,
    r: document.referrer,
    s: `${screen.width},${screen.height},${window.devicePixelRatio || 1}`,
    rnd: Math.random().toString(36).slice(2),
  })
  // Un pixel: no carga código de terceros en la página.
  new Image().src = `${endpoint}?${q.toString()}`
}

function readConsent(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY)
  } catch {
    return null
  }
}

function saveConsent(v: 'yes' | 'no'): void {
  try {
    localStorage.setItem(CONSENT_KEY, v)
  } catch {
    // Sin almacenamiento: se vuelve a preguntar en la próxima visita.
  }
}

type Gtag = (...args: unknown[]) => void

function startGoogleAnalytics(id: string): void {
  const consent = readConsent()
  if (consent === 'no') return
  if (consent === 'yes') return loadGoogleAnalytics(id)
  // Hasta que la persona acepta no se carga nada de Google (ni cookies ni peticiones).
  askConsent((ok) => {
    saveConsent(ok ? 'yes' : 'no')
    if (ok) loadGoogleAnalytics(id)
  })
}

function loadGoogleAnalytics(id: string): void {
  const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag }
  w.dataLayer = w.dataLayer || []
  // gtag necesita el objeto `arguments`, no un array.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments)
  }
  w.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
  w.gtag('js', new Date())
  w.gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(s)
}

/** Aviso chico, abajo a la izquierda: aceptar o no las estadísticas anónimas. */
function askConsent(done: (ok: boolean) => void): void {
  const box = document.createElement('div')
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-label', 'Usage statistics')
  box.dataset.testid = 'analytics-consent'
  box.style.cssText =
    'position:fixed;left:16px;bottom:16px;z-index:10000;max-width:360px;padding:12px 14px;border-radius:8px;' +
    'background:#2d2d30;color:#e8e8e8;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4)'
  const text = document.createElement('div')
  text.textContent = 'Cota can count visits with Google Analytics to see how the project is used. No drawings or commands are sent.'
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px'
  const button = (label: string, ok: boolean, primary: boolean) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.dataset.testid = ok ? 'analytics-allow' : 'analytics-deny'
    b.style.cssText = `padding:4px 12px;border-radius:4px;border:1px solid #0e639c;cursor:pointer;background:${primary ? '#0e639c' : 'transparent'};color:#fff`
    b.onclick = () => {
      box.remove()
      done(ok)
    }
    return b
  }
  row.append(button('No thanks', false, false), button('Allow', true, true))
  box.append(text, row)
  document.body.appendChild(box)
}
