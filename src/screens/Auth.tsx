import { useState } from 'react'
import { VersionBadge } from '../components/ui/VersionBadge'
import { supabase } from '../lib/supabase'

interface Props {
  onSignIn: (email: string, password: string) => Promise<{ error: unknown }>
  accessDenied?: boolean
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export function Auth({ onSignIn, accessDenied }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleGoogle() {
    setGoogleLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'signup') {
      // Verify invitation before creating account
      const { data: invite } = await supabase
        .from('invitations')
        .select('id')
        .ilike('email', email.trim())
        .maybeSingle()
      if (!invite) {
        setError('You need an invitation to create an account. Contact your administrator.')
        setLoading(false)
        return
      }
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setSuccess('Account created! You can now sign in.')
        setMode('login')
      }
      setLoading(false)
      return
    }

    const { error } = await onSignIn(email, password)
    if (error) {
      setError(error instanceof Error ? error.message : 'Invalid credentials. Check your email and password.')
    }
    setLoading(false)
  }

  const inputStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    padding: '10px 12px',
    fontSize: '14px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    width: '100%',
  }

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }} className="flex items-center justify-center p-4">
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '14px', width: '100%', maxWidth: '380px' }}
        className="p-8"
      >
        {/* Wordmark */}
        <div className="flex items-center gap-3 mb-8">
          <div style={{ background: 'var(--accent)', borderRadius: '8px', width: '36px', height: '36px' }} className="flex items-center justify-center shrink-0">
            <span style={{ color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '15px' }}>H</span>
          </div>
          <div>
            <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '15px' }}>HOG OPS</div>
            <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>Command Center</div>
          </div>
        </div>

        <h1 style={{ color: 'var(--text-primary)' }} className="text-xl font-semibold mb-1">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h1>
        <p style={{ color: 'var(--text-secondary)' }} className="text-sm mb-6">
          {mode === 'login' ? 'Use your HOG OPS credentials.' : 'Set up your HOG OPS account.'}
        </p>

        {accessDenied && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ color: '#EF4444', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Access denied</p>
            <p style={{ color: '#EF4444', fontSize: '12px', opacity: 0.85 }}>
              Your account is not on the invite list. Ask your administrator to send you an invitation.
            </p>
          </div>
        )}

        {/* Google button */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '10px', fontSize: '14px', color: 'var(--text-primary)', cursor: googleLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontFamily: 'var(--font-ui)', fontWeight: 500, marginBottom: '16px' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
        >
          <GoogleIcon />
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
          <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#EF4444' }} className="px-3 py-2.5 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', color: '#22C55E' }} className="px-3 py-2.5 text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ background: loading ? 'var(--accent-dim)' : 'var(--accent)', color: '#000', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', border: 'none', fontFamily: 'var(--font-ui)' }}
          >
            {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setSuccess(null) }}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
          >
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <span style={{ color: 'var(--accent)' }}>{mode === 'login' ? 'Create one' : 'Sign in'}</span>
          </button>
        </form>
      </div>

      <VersionBadge />
    </div>
  )
}
