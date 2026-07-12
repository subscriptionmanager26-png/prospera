import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPanel() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  const onSubmit = async (event) => {
    event.preventDefault()
    const cleaned = email.trim().toLowerCase()
    if (!cleaned) return

    setStatus('loading')
    setMessage('')

    const redirectTo = `${window.location.origin}/`
    const { error } = await supabase.auth.signInWithOtp({
      email: cleaned,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    })

    if (error) {
      setStatus('error')
      setMessage(error.message)
      return
    }

    setStatus('sent')
    setMessage(`Check ${cleaned} for a magic link. Only whitelisted emails can open the archive.`)
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">Prospera</p>
        <h1>Slack archive</h1>
        <p className="login-copy">
          Sign in with your email. Access is limited to approved members.
        </p>

        {status === 'sent' ? (
          <div className="login-success">{message}</div>
        ) : (
          <form className="login-form" onSubmit={onSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={status === 'loading'}
            />
            <button type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        {status === 'error' && <p className="login-error">{message}</p>}
      </div>
    </div>
  )
}
