/**
 * Estadísticas de visitas, opcionales y sólo para la demo pública, con Umami (open source, sin cookies). Se activan
 * si el build recibe `VITE_ANALYTICS_UMAMI` (el id del sitio en Umami); en el repo oficial sale de una variable de
 * GitHub Actions, nunca del código. Un build propio o local no manda nada a nadie.
 *
 * No se carga ningún script de terceros: este módulo manda dos avisos por visita a la API de Umami
 * (`VITE_ANALYTICS_UMAMI_HOST`, por defecto la nube de Umami; puede ser una instalación propia):
 * - al abrir la página: la visita, con la página, el sitio de procedencia (y las etiquetas UTM del enlace), el tamaño
 *   de pantalla y el idioma;
 * - al salir o pasar a otra pestaña: `leave`, para que Umami calcule cuánto duró la visita.
 * Nunca el dibujo, los comandos ni nada que se escriba. Sin cookies ni almacenamiento: Umami agrupa la visita con
 * un identificador que rota cada día y no se puede vincular con una persona. Se respeta "Do Not Track".
 */
const UMAMI_CLOUD = 'https://gateway.umami.is'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Env = { VITE_ANALYTICS_UMAMI?: string; VITE_ANALYTICS_UMAMI_HOST?: string }

export function startAnalytics(env: Env = import.meta.env as Env): void {
  if (typeof window === 'undefined' || navigator.doNotTrack === '1') return
  const website = env.VITE_ANALYTICS_UMAMI?.trim()
  if (!website || !UUID.test(website)) return
  const host = (env.VITE_ANALYTICS_UMAMI_HOST?.trim() || UMAMI_CLOUD).replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(host)) return

  const send = (name?: string) => {
    const payload = {
      website,
      hostname: location.hostname,
      url: location.pathname + location.search,
      referrer: document.referrer,
      title: document.title,
      screen: `${screen.width}x${screen.height}`,
      language: navigator.language,
      ...(name ? { name } : {}),
    }
    // `keepalive`: el aviso de salida llega aunque la pestaña se esté cerrando. Sin credenciales (nunca cookies).
    fetch(`${host}/api/send`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'event', payload }),
    }).catch(() => {})
  }

  send()
  // Al salir (o al ocultarse la pestaña) se marca el fin de la visita; a lo sumo un aviso por minuto.
  let last = 0
  const leave = () => {
    const now = Date.now()
    if (now - last < 60_000) return
    last = now
    send('leave')
  }
  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leave()
  })
}
