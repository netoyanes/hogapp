import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { APP_VERSION } from '../config/version'
import { AppLogoBadge } from '../components/ui/AppLogo'
import { TENANT } from '../config/tenant'
import { usernameToEmail, pinToPassword, normalizeUsername, isValidUsername, isValidPin } from '../lib/hohAuth'

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
  const [authKind, setAuthKind] = useState<'email' | 'piso'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Login de piso (Heart of House): usuario + PIN → email sintético + password.
  async function handlePisoSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSuccess(null)
    const u = normalizeUsername(username)
    if (!isValidUsername(u)) { setError('El usuario debe tener al menos 8 letras o números.'); return }
    if (!isValidPin(pin)) { setError('El PIN debe ser de 4 a 6 dígitos.'); return }
    setLoading(true)
    const { error } = await onSignIn(usernameToEmail(u), pinToPassword(pin))
    if (error) setError('Usuario o PIN incorrectos. Verifica con tu supervisor.')
    setLoading(false)
  }

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
      // Verificar invitación ANTES de crear la cuenta. Corre como anon (aún no
      // hay sesión), así que no puede leer `invitations` directo por RLS — usa
      // el RPC security definer has_invitation.
      const { data: invited, error: rpcError } = await supabase
        .rpc('has_invitation', { p_email: email.trim() })
      if (rpcError || !invited) {
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
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }} className="flex flex-col items-center justify-center p-4">
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '14px', width: '100%', maxWidth: '380px' }}
        className="p-8"
      >
        {/* Wordmark */}
        <div className="flex items-center gap-3 mb-8">
          <AppLogoBadge size={36} radius={8} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '15px' }}>{TENANT.appName}</div>
            <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{TENANT.appSubtitle}</div>
          </div>
        </div>

        {/* Selector de tipo de acceso */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '4px', marginBottom: '18px' }}>
          {([['email', 'Correo'], ['piso', 'HoH']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => { setAuthKind(k); setError(null); setSuccess(null) }}
              style={{
                flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-ui)',
                background: authKind === k ? 'var(--accent)' : 'transparent',
                color: authKind === k ? 'var(--on-accent)' : 'var(--text-secondary)',
              }}>
              {label}
            </button>
          ))}
        </div>

        <h1 style={{ color: 'var(--text-primary)' }} className="text-xl font-semibold mb-1">
          {authKind === 'piso' ? 'Entrar con tu usuario' : mode === 'login' ? 'Sign in' : 'Create account'}
        </h1>
        <p style={{ color: 'var(--text-secondary)' }} className="text-sm mb-6">
          {authKind === 'piso' ? 'Tu usuario y tu PIN (te los da tu supervisor).' : mode === 'login' ? 'Use your HOG APP credentials.' : 'Set up your HOG APP account.'}
        </p>

        {authKind === 'piso' && (
          <form onSubmit={handlePisoSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Usuario</label>
              <input
                value={username}
                onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                placeholder="tuusuario"
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                required
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>PIN</label>
              <input
                type="password" inputMode="numeric" pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
                required
                style={{ ...inputStyle, letterSpacing: '0.3em', fontSize: '18px', textAlign: 'center' }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
              />
            </div>
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#EF4444' }} className="px-3 py-2.5 text-sm">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{ background: loading ? 'var(--accent-dim)' : 'var(--accent)', color: 'var(--on-accent)', borderRadius: '8px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', border: 'none', fontFamily: 'var(--font-ui)' }}>
              {loading ? '…' : 'Entrar'}
            </button>
          </form>
        )}

        {authKind === 'email' && (
        <>
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
            style={{ background: loading ? 'var(--accent-dim)' : 'var(--accent)', color: 'var(--on-accent)', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', border: 'none', fontFamily: 'var(--font-ui)' }}
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
        </>
        )}
      </div>

      <p style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginTop: '20px', textAlign: 'center' }}>
        v{APP_VERSION}
      </p>
    </div>
  )
}
