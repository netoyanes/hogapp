import { useEffect, useState } from 'react'
import { UserPlus, Copy, Check, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../hooks/useActivityLog'

type Role = 'C_LEVEL' | 'OPS_MANAGER' | 'MARKETING' | 'TEAM'

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'C_LEVEL',     label: 'C-Level',      description: 'Full marketing dashboard + tasks' },
  { value: 'OPS_MANAGER', label: 'Ops Manager',  description: 'Assigned BUs + task management' },
  { value: 'MARKETING',   label: 'Marketing',    description: 'Content and campaign access' },
  { value: 'TEAM',        label: 'Team',         description: 'Assigned tasks only' },
]

const ROLE_COLORS: Record<Role, string> = {
  C_LEVEL:     '#22C55E',
  OPS_MANAGER: '#EAB308',
  MARKETING:   '#3B82F6',
  TEAM:        '#888888',
}

interface Invitation {
  id: string
  email: string
  role: string
  used: boolean
  created_at: string
}

export function InviteUsers() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('TEAM')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => { loadInvitations() }, [])

  async function loadInvitations() {
    const { data } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false })
    setInvitations(data ?? [])
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    // Insert invitation record (for role assignment on signup)
    const { error: insertError } = await supabase.from('invitations').insert({
      email: email.trim().toLowerCase(),
      role,
      invited_by: user?.id,
    })

    if (insertError) {
      setError(insertError.message.includes('duplicate') ? 'This email already has a pending invite.' : insertError.message)
      setSending(false)
      return
    }

    // Send invitation email via Edge Function
    const { data: fnData, error: fnError } = await supabase.functions.invoke('hyper-responder', {
      body: { email: email.trim().toLowerCase(), role, appUrl: window.location.origin },
    })

    if (fnError || fnData?.error) {
      const msg = fnData?.error ?? fnError?.message ?? 'Unknown error'
      setError(`Invite saved but email failed: ${msg}. You can copy the link manually.`)
    }

    logActivity('user_invited', 'invitation', undefined, { email: email.trim().toLowerCase(), role })
    setSending(false)
    setSent(true)
    setEmail('')
    await loadInvitations()
    setTimeout(() => setSent(false), 2000)
  }

  async function revokeInvite(id: string) {
    setDeletingId(id)
    await supabase.from('invitations').delete().eq('id', id)
    await loadInvitations()
    setDeletingId(null)
  }

  function copyLink(email: string) {
    const link = `${window.location.origin}?invite=${encodeURIComponent(email)}`
    navigator.clipboard.writeText(link)
    setCopiedId(email)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const inputStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    padding: '9px 12px',
    fontSize: '14px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    width: '100%',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '16px 24px', flexShrink: 0 }}>
        <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '18px' }}>Invite Users</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Add team members with pre-assigned roles</p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Invite form */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
            <div className="flex items-center gap-2 mb-4">
              <UserPlus size={15} style={{ color: 'var(--accent)' }} />
              <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>New Invitation</h3>
            </div>

            <form onSubmit={handleInvite} className="flex flex-col gap-4">
              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>

              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '8px' }}>Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      style={{
                        background: role === opt.value ? `${ROLE_COLORS[opt.value]}15` : 'var(--bg-elevated)',
                        border: `1px solid ${role === opt.value ? ROLE_COLORS[opt.value] : 'var(--border-default)'}`,
                        borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{ color: role === opt.value ? ROLE_COLORS[opt.value] : 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
                        {opt.label}
                      </div>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '2px' }}>
                        {opt.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '7px', color: '#EF4444', padding: '8px 12px', fontSize: '13px' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={sending || !email.trim()}
                style={{ background: sent ? '#16A34A' : email.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: email.trim() ? '#000' : 'var(--text-tertiary)', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: email.trim() ? 'pointer' : 'not-allowed' }}
              >
                {sent ? '✓ Invitation sent!' : sending ? 'Sending…' : 'Send Invitation'}
              </button>
            </form>

            <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '12px', lineHeight: '1.5' }}>
              The person will receive an email with a link to access HOG OPS. They'll complete setup and get their assigned role automatically.
            </p>
          </div>

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>
                Invitations <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>({invitations.length})</span>
              </h3>
              <div className="flex flex-col gap-2">
                {invitations.map((inv) => (
                  <div key={inv.id} style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>{inv.email}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span style={{ color: ROLE_COLORS[inv.role as Role] ?? 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                          {inv.role}
                        </span>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                          {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <span style={{
                      background: inv.used ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                      color: inv.used ? '#22C55E' : '#EAB308',
                      fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: '4px',
                    }}>
                      {inv.used ? 'Joined' : 'Pending'}
                    </span>
                    {!inv.used && (
                      <button
                        onClick={() => copyLink(inv.email)}
                        style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                        title="Copy signup link"
                      >
                        {copiedId === inv.email ? <Check size={11} style={{ color: 'var(--accent)' }} /> : <Copy size={11} />}
                        {copiedId === inv.email ? 'Copied' : 'Link'}
                      </button>
                    )}
                    <button
                      onClick={() => revokeInvite(inv.id)}
                      disabled={deletingId === inv.id}
                      style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '4px 6px', color: deletingId === inv.id ? 'var(--text-tertiary)' : '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: deletingId === inv.id ? 0.5 : 1 }}
                      title="Revoke invitation"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
