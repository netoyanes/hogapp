import { useEffect, useState } from 'react'
import { UserPlus, Copy, Check, Trash2, Users, ShieldCheck, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../hooks/useActivityLog'
import { BUChip } from '../components/v2'
import type { UserRole } from '../types'
type InviteRole = 'C_LEVEL' | 'OPS_MANAGER' | 'MARKETING' | 'TEAM'

const INVITE_ROLE_OPTIONS: { value: InviteRole; label: string; description: string }[] = [
  { value: 'C_LEVEL',     label: 'C-Level',      description: 'Full marketing dashboard + tasks' },
  { value: 'OPS_MANAGER', label: 'Ops Manager',  description: 'Assigned BUs + task management' },
  { value: 'MARKETING',   label: 'Marketing',    description: 'Content and campaign access' },
  { value: 'TEAM',        label: 'Team',         description: 'Assigned tasks only' },
]

const ALL_ROLES: { value: UserRole; label: string }[] = [
  { value: 'MASTER',      label: 'Master' },
  { value: 'C_LEVEL',     label: 'C-Level' },
  { value: 'OPS_MANAGER', label: 'Ops Manager' },
  { value: 'MARKETING',   label: 'Marketing' },
  { value: 'TEAM',        label: 'Team' },
]

const ROLE_COLORS: Record<string, string> = {
  MASTER:      '#FF6B35',
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

interface Member {
  id: string
  full_name: string | null
  last_name: string | null
  email: string | null
  role: UserRole | null
  slack_user_id: string | null
  created_at: string
}

export function InviteUsers() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('TEAM')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [members, setMembers] = useState<Member[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null)
  const [slackIds, setSlackIds] = useState<Record<string, string>>({})
  const [savedSlackIds, setSavedSlackIds] = useState<Record<string, string>>({})
  const [savingSlackId, setSavingSlackId] = useState<string | null>(null)
  const [savedConfirm, setSavedConfirm] = useState<string | null>(null)
  // Asignación de venues (controla el alcance de Reservas/visitas para Ops y Team)
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [userVenues, setUserVenues] = useState<Record<string, string[]>>({})

  useEffect(() => {
    loadAll()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
  }, [])

  async function loadAll() {
    const [{ data: inv }, { data: mem }, { data: buses }, { data: uv }] = await Promise.all([
      supabase.from('invitations').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, last_name, email, role, slack_user_id, created_at').order('created_at', { ascending: true }),
      supabase.from('business_units').select('id, code, name').order('code'),
      supabase.from('user_venues').select('user_id, bu_id'),
    ])
    setBuList(buses ?? [])
    const vm: Record<string, string[]> = {}
    for (const r of uv ?? []) { (vm[r.user_id] = vm[r.user_id] ?? []).push(r.bu_id) }
    setUserVenues(vm)
    setInvitations(inv ?? [])
    if (mem) {
      setMembers(mem)
      const ids: Record<string, string> = {}
      for (const m of mem) ids[m.id] = m.slack_user_id ?? ''
      setSlackIds(ids)
      setSavedSlackIds(ids)
    }
  }

  async function saveSlackId(userId: string) {
    const value = (slackIds[userId] ?? '').trim()
    setSavingSlackId(userId)
    const { error } = await supabase
      .from('profiles')
      .update({ slack_user_id: value || null })
      .eq('id', userId)
    setSavingSlackId(null)
    if (!error) {
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, slack_user_id: value || null } : m))
      setSavedSlackIds(prev => ({ ...prev, [userId]: value }))
      setSavedConfirm(userId)
      setTimeout(() => setSavedConfirm(c => c === userId ? null : c), 2500)
    } else {
      setMemberError(`Could not save Slack ID: ${error.message}`)
    }
  }

  async function addVenue(userId: string, buId: string, memberName: string) {
    setUserVenues(prev => ({ ...prev, [userId]: [...(prev[userId] ?? []), buId] }))
    const { error } = await supabase.from('user_venues').insert({ user_id: userId, bu_id: buId })
    if (error) {
      setMemberError(`No se pudo asignar el venue: ${error.message}`)
      await loadAll()
      return
    }
    const code = buList.find(b => b.id === buId)?.code
    logActivity('venue_assigned', 'user', userId, { member: memberName, bu: code })
  }

  async function removeVenue(userId: string, buId: string, memberName: string) {
    setUserVenues(prev => ({ ...prev, [userId]: (prev[userId] ?? []).filter(id => id !== buId) }))
    const { error } = await supabase.from('user_venues').delete().eq('user_id', userId).eq('bu_id', buId)
    if (error) {
      setMemberError(`No se pudo quitar el venue: ${error.message}`)
      await loadAll()
      return
    }
    const code = buList.find(b => b.id === buId)?.code
    logActivity('venue_unassigned', 'user', userId, { member: memberName, bu: code })
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

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

    const { data: fnData, error: fnError } = await supabase.functions.invoke('send-invite', {
      body: { email: email.trim().toLowerCase(), role, appUrl: window.location.origin },
    })

    if (fnError) {
      let msg = fnError.message
      try {
        const body = await (fnError as unknown as { context: Response }).context?.json?.()
        if (body?.error) msg = body.error
      } catch { /* ignore */ }
      setError(`Invite saved but email failed: ${msg}. Copy the link from the list below.`)
    } else if (fnData?.alreadyRegistered) {
      setError('This email is already registered — they can sign in directly.')
    } else if (!fnData?.emailSent) {
      setError('Invite saved. Email could not be sent — copy the link from the list below.')
    }

    logActivity('user_invited', 'invitation', undefined, { email: email.trim().toLowerCase(), role })
    setSending(false)
    setSent(true)
    setEmail('')
    await loadAll()
    setTimeout(() => setSent(false), 2000)
  }

  async function revokeInvite(id: string) {
    setDeletingId(id)
    await supabase.from('invitations').delete().eq('id', id)
    await loadAll()
    setDeletingId(null)
  }

  async function updateRole(userId: string, newRole: UserRole) {
    setSavingRoleId(userId)
    setMemberError(null)
    setMemberSuccess(null)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (error) {
      setMemberError(`Could not update role: ${error.message}`)
    } else {
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m))
      setMemberSuccess('Role updated.')
      setTimeout(() => setMemberSuccess(null), 2500)
    }
    setSavingRoleId(null)
  }

  async function removeMember(userId: string) {
    setRemovingId(userId)
    setMemberError(null)
    setMemberSuccess(null)
    const { error } = await supabase.functions.invoke('admin-remove-user', { body: { userId } })
    if (error) {
      let msg = error.message
      try {
        const body = await (error as unknown as { context: Response }).context?.json?.()
        if (body?.error) msg = body.error
      } catch { /* ignore */ }
      setMemberError(`Could not remove user: ${msg}`)
      setConfirmRemove(null)
      setRemovingId(null)
      return
    }
    setMembers(prev => prev.filter(m => m.id !== userId))
    setConfirmRemove(null)
    setRemovingId(null)
    setMemberSuccess('User removed.')
    setTimeout(() => setMemberSuccess(null), 2500)
  }

  function copyLink(email: string) {
    const link = `${window.location.origin}?invite=${encodeURIComponent(email)}`
    navigator.clipboard.writeText(link)
    setCopiedId(email)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function initials(m: Member) {
    const name = [m.full_name, m.last_name].filter(Boolean).join(' ')
    if (name) return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
    return (m.email?.[0] ?? '?').toUpperCase()
  }

  function displayName(m: Member) {
    return [m.full_name, m.last_name].filter(Boolean).join(' ') || m.email || 'Unknown'
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

  const pendingInvites = invitations.filter(i => !i.used)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '16px 24px', flexShrink: 0 }}>
        <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '18px' }}>Usuarios</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Gestiona accesos y roles del equipo</p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '720px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* ── Team Members ── */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={14} style={{ color: 'var(--accent)' }} />
              <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>
                Team Members
              </h3>
              <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginLeft: '4px' }}>
                {members.length}
              </span>
            </div>

            {memberError && (
              <div style={{ margin: '0', padding: '10px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', fontSize: '12px' }}>
                {memberError}
              </div>
            )}
            {memberSuccess && (
              <div style={{ margin: '0', padding: '10px 20px', background: 'rgba(34,197,94,0.08)', borderBottom: '1px solid rgba(34,197,94,0.2)', color: '#22C55E', fontSize: '12px' }}>
                {memberSuccess}
              </div>
            )}

            {members.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                No members yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {members.map((m, i) => {
                  const isMe = m.id === currentUserId
                  const isMaster = m.role === 'MASTER'
                  const color = ROLE_COLORS[m.role ?? ''] ?? '#888'
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 20px',
                        borderBottom: i < members.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                        background: isMe ? 'var(--accent-bg)' : 'transparent',
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                        background: `${color}20`, border: `1px solid ${color}50`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
                          {initials(m)}
                        </span>
                      </div>

                      {/* Name + email + Slack ID */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName(m)}
                          </span>
                          {isMe && (
                            <span style={{ fontSize: '10px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>you</span>
                          )}
                          {isMaster && (
                            <ShieldCheck size={11} style={{ color: ROLE_COLORS.MASTER, flexShrink: 0 }} />
                          )}
                        </div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.email}
                        </div>
                        {(() => {
                          const current = slackIds[m.id] ?? ''
                          const saved = savedSlackIds[m.id] ?? ''
                          const isDirty = current.trim() !== saved.trim()
                          const isSaving = savingSlackId === m.id
                          const isConfirmed = savedConfirm === m.id
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                              <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>SLACK</span>
                              <input
                                value={current}
                                onChange={e => setSlackIds(prev => ({ ...prev, [m.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveSlackId(m.id) }}
                                placeholder="U07ABC1234"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  borderBottom: `1px solid ${saved ? '#22C55E60' : isDirty ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                                  color: current ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-mono)',
                                  outline: 'none',
                                  width: '100px',
                                  padding: '1px 2px',
                                  opacity: isSaving ? 0.5 : 1,
                                }}
                              />
                              {isSaving ? (
                                <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>saving…</span>
                              ) : isConfirmed ? (
                                <span style={{ fontSize: '9px', color: '#22C55E', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  <Check size={10} /> saved
                                </span>
                              ) : isDirty ? (
                                <button
                                  onClick={() => saveSlackId(m.id)}
                                  style={{ background: 'var(--accent)', border: 'none', borderRadius: '4px', color: '#000', fontSize: '9px', fontWeight: 700, padding: '2px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
                                >
                                  <Save size={9} /> Save
                                </button>
                              ) : saved ? (
                                <span style={{ fontSize: '9px', color: '#22C55E50', fontFamily: 'var(--font-mono)' }}>✓</span>
                              ) : null}
                            </div>
                          )
                        })()}

                        {/* Venues asignados — controla el alcance de Reservas/visitas (Ops/Team).
                            Sin asignación = acceso a todos los venues (bootstrap). */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '5px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>VENUES</span>
                          {(userVenues[m.id] ?? []).length === 0 ? (
                            <span title="Sin asignación específica: este usuario ve todos los venues" style={{ fontSize: '9px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontStyle: 'italic' }}>
                              todos
                            </span>
                          ) : (
                            (userVenues[m.id] ?? []).map(buId => {
                              const bu = buList.find(b => b.id === buId)
                              if (!bu) return null
                              return (
                                <span key={buId} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                  <BUChip code={bu.code} size="sm" />
                                  <button
                                    onClick={() => removeVenue(m.id, buId, displayName(m))}
                                    title={`Quitar ${bu.code}`}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '11px', padding: '0 2px', lineHeight: 1 }}
                                  >
                                    ×
                                  </button>
                                </span>
                              )
                            })
                          )}
                          <select
                            value=""
                            onChange={e => { if (e.target.value) { addVenue(m.id, e.target.value, displayName(m)); (e.target as HTMLSelectElement).value = '' } }}
                            style={{ background: 'transparent', border: '1px dashed var(--border-default)', borderRadius: '4px', color: 'var(--text-tertiary)', fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 4px', outline: 'none', cursor: 'pointer', maxWidth: '90px' }}
                          >
                            <option value="">+ venue</option>
                            {buList
                              .filter(b => !(userVenues[m.id] ?? []).includes(b.id))
                              .map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Joined */}
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)', flexShrink: 0, display: 'none' }}
                        className="sm:inline">
                        {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </span>

                      {/* Role selector */}
                      <select
                        value={m.role ?? ''}
                        disabled={savingRoleId === m.id || isMe}
                        onChange={(e) => updateRole(m.id, e.target.value as UserRole)}
                        style={{
                          background: `${color}15`,
                          border: `1px solid ${color}50`,
                          borderRadius: '6px',
                          color,
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          outline: 'none',
                          cursor: isMe ? 'not-allowed' : 'pointer',
                          flexShrink: 0,
                          opacity: savingRoleId === m.id ? 0.5 : 1,
                        }}
                      >
                        {ALL_ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>

                      {/* Remove */}
                      {!isMe && (
                        confirmRemove === m.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                            <span style={{ fontSize: '11px', color: '#EF4444' }}>Remove?</span>
                            <button
                              onClick={() => removeMember(m.id)}
                              disabled={removingId === m.id}
                              style={{ background: '#EF4444', border: 'none', borderRadius: '5px', color: '#fff', fontSize: '11px', padding: '3px 8px', cursor: 'pointer', opacity: removingId === m.id ? 0.5 : 1 }}
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '5px', color: 'var(--text-tertiary)', fontSize: '11px', padding: '3px 8px', cursor: 'pointer' }}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemove(m.id)}
                            style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '5px 6px', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            title="Remove access"
                          >
                            <Trash2 size={12} />
                          </button>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Invite Form ── */}
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
                  {INVITE_ROLE_OPTIONS.map((opt) => (
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
          </div>

          {/* ── Pending Invitations ── */}
          {pendingInvites.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>
                Pending Invitations <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>({pendingInvites.length})</span>
              </h3>
              <div className="flex flex-col gap-2">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>{inv.email}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span style={{ color: ROLE_COLORS[inv.role] ?? 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                          {inv.role}
                        </span>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                          {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => copyLink(inv.email)}
                      style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                      title="Copy signup link"
                    >
                      {copiedId === inv.email ? <Check size={11} style={{ color: 'var(--accent)' }} /> : <Copy size={11} />}
                      {copiedId === inv.email ? 'Copied' : 'Link'}
                    </button>
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
