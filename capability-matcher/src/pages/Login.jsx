import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        throw signInError
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, employee_id, role, first_name, last_name')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileError) {
        throw profileError
      }

      if (!profileData) {
        throw new Error('No profile was found for this account.')
      }

      setEmail('')
      setPassword('')
      onLoginSuccess(profileData)
    } catch (err) {
      setError(err?.message || 'Unable to log in right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page" style={{ minHeight: 'calc(100vh - 88px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <h1 className="page-title">Sign in</h1>
        <p className="page-sub">Access the Deloitte capability matching workspace</p>

        {error ? (
          <div className="error" style={{ padding: '12px 0', textAlign: 'left', color: '#e05252' }} role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label htmlFor="email" style={{ fontSize: 12, fontWeight: 600, color: '#c8c8c8' }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            autoComplete="email"
            required
            style={{
              background: '#0a0a0a',
              color: '#f0f0f0',
              border: '1px solid #2a2a2a',
              borderRadius: 7,
              padding: '10px 12px',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          />

          <label htmlFor="password" style={{ fontSize: 12, fontWeight: 600, color: '#c8c8c8' }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
            style={{
              background: '#0a0a0a',
              color: '#f0f0f0',
              border: '1px solid #2a2a2a',
              borderRadius: 7,
              padding: '10px 12px',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          />

          <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: 6 }}>
            {isSubmitting ? 'Signing in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
