import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  const onSubmit = async (event) => {
    event.preventDefault()
    const cleaned = email.trim().toLowerCase()
    if (!cleaned || !password) return

    setStatus('loading')
    setMessage('')

    try {
      const { data, error } = await supabase.functions.invoke('community-login', {
        body: { email: cleaned, password },
      })

      if (error) {
        setStatus('error')
        setMessage(error.message || 'Login failed')
        return
      }

      if (data?.error) {
        setStatus('error')
        setMessage(data.error)
        return
      }

      if (!data?.access_token || !data?.refresh_token) {
        setStatus('error')
        setMessage('Login failed: no session returned')
        return
      }

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })

      if (sessionErr) {
        setStatus('error')
        setMessage(sessionErr.message)
        return
      }

      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Login failed')
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">Prospera</p>
        <h1>Slack archive</h1>
        <p className="login-copy">
          Enter your email and the community password. Access is limited to approved members.
        </p>

        <form className="login-form" onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            disabled={status === 'loading'}
          />

          <label htmlFor="password">Community password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Community password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            disabled={status === 'loading'}
          />

          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {status === 'error' && <p className="login-error">{message}</p>}
      </div>
    </div>
  )
}
