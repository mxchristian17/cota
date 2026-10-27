import { createRoot } from 'react-dom/client'
import App from './App'
import { installGlobalErrorHandlers } from './core/errors'
import { ErrorBanner, ErrorGuard } from './ui/ErrorBanner'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')
installGlobalErrorHandlers()
createRoot(container).render(
  <>
    <ErrorGuard>
      <App />
    </ErrorGuard>
    <ErrorBanner />
  </>,
)

// App instalable: el service worker guarda la app en el equipo para abrirla sin conexión. Sólo en el
// build (en desarrollo serviría archivos viejos).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
