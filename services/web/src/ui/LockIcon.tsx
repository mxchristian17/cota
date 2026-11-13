/**
 * Candado de una capa, que se distingue a simple vista: bloqueada, cerrado y relleno en ámbar; desbloqueada, abierto
 * (el arco levantado, suelto de un lado) y sólo en contorno gris. Los emoji 🔒 y 🔓 casi no se diferenciaban.
 */
export function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    <svg className="lock-icon is-locked" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M5 7.5V5a3 3 0 0 1 6 0v2.5" fill="none" stroke="#e8a317" strokeWidth="1.8" />
      <rect x="2.5" y="7" width="11" height="8" rx="1.6" fill="#e8a317" />
      <rect x="7.2" y="9.3" width="1.6" height="3.2" rx="0.8" fill="#3d2c00" />
    </svg>
  ) : (
    <svg className="lock-icon is-unlocked" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M11 8V4.6a3 3 0 0 0-6 0v0.9" fill="none" stroke="#9a9a9a" strokeWidth="1.5" />
      <rect x="2.75" y="8" width="10.5" height="7" rx="1.5" fill="none" stroke="#9a9a9a" strokeWidth="1.3" />
    </svg>
  )
}
