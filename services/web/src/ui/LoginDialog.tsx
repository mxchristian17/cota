import { useState } from 'react'
import { useStore } from '../store/store'

export function LoginDialog() {
  const open = useStore((s) => s.loginOpen)
  const close = useStore((s) => s.closeLogin)
  const login = useStore((s) => s.login)
  const authError = useStore((s) => s.authError)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(false)

  if (!open) return null

  const submit = () => {
    if (email && password) void login(email, password, register)
  }

  return (
    <div className="modal-backdrop" onClick={close} data-testid="login-dialog">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{register ? 'Create account' : 'Sign in'}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="form">
          <label>
            Email
            <input
              className="field"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email"
            />
          </label>
          <label>
            Password
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              data-testid="login-password"
            />
          </label>
          {authError && <div className="form-error">{authError}</div>}
          <button className="btn" onClick={submit} data-testid="login-submit">
            {register ? 'Register & sign in' : 'Sign in'}
          </button>
          <button className="link-btn" onClick={() => setRegister(!register)}>
            {register ? 'Already have an account? Sign in' : 'Need an account? Register'}
          </button>
        </div>
      </div>
    </div>
  )
}
