import { useState } from 'react'
import { VersionBadge } from '../components/ui/VersionBadge'

interface Props {
  onSignIn: (email: string, password: string) => Promise<{ error: unknown }>
}

export function Auth({ onSignIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await onSignIn(email, password)
    if (error) {
      setError(error instanceof Error ? error.message : 'Invalid credentials. Check your email and password.')
    }
    setLoading(false)
  }

  return (
    <div
      style={{ background: 'var(--bg-base)', minHeight: '100vh' }}
      className="flex items-center justify-center p-4"
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '380px',
        }}
        className="p-8"
      >
        {/* Wordmark */}
        <div className="flex items-center gap-3 mb-8">
          <div
            style={{ background: 'var(--accent)', borderRadius: '8px', width: '36px', height: '36px' }}
            className="flex items-center justify-center shrink-0"
          >
            <span style={{ color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '15px' }}>H</span>
          </div>
          <div>
            <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '15px' }}>
              HOG OPS
            </div>
            <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              Command Center
            </div>
          </div>
        </div>

        <h1 style={{ color: 'var(--text-primary)' }} className="text-xl font-semibold mb-1">
          Sign in
        </h1>
        <p style={{ color: 'var(--text-secondary)' }} className="text-sm mb-6">
          Use your HOG OPS credentials to access the platform.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                padding: '10px 12px',
                fontSize: '14px',
                fontFamily: 'var(--font-ui)',
                outline: 'none',
              }}
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
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                padding: '10px 12px',
                fontSize: '14px',
                fontFamily: 'var(--font-ui)',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
            />
          </div>

          {error && (
            <div
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#EF4444' }}
              className="px-3 py-2.5 text-sm"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? 'var(--accent-dim)' : 'var(--accent)',
              color: '#000',
              borderRadius: '8px',
              padding: '11px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              border: 'none',
              fontFamily: 'var(--font-ui)',
              marginTop: '2px',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <VersionBadge />
    </div>
  )
}
