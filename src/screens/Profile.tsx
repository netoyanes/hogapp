import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, Save, Clock, DollarSign, Trophy, Activity, Eye, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getViewAsRole, setViewAsRole } from '../lib/viewAs'
import { pinToPassword, isValidPin } from '../lib/hohAuth'
import type { Profile as ProfileType, UserRole } from '../types'

const WEEKLY_GOAL = 40

function money(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

// Personal productivity — same metrics as the admin Analytics, but scoped to the current user
// so everyone can see their own hours (credited from approved tasks).
function MyProductivity({ userId }: { userId: string }) {
  const [weekHours, setWeekHours] = useState(0)
  const [totalHours, setTotalHours] = useState(0)
  const [approvedCount, setApprovedCount] = useState(0)
  const [missingHours, setMissingHours] = useState(0)
  const [brought, setBrought] = useState(0)
  const [closed, setClosed] = useState(0)
  const [actions, setActions] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const [{ data: tasks }, { data: deals }, { count: actionCount }] = await Promise.all([
      supabase.from('tasks').select('status, estimated_hours, updated_at').eq('assigned_to', userId),
      supabase.from('crm_deals').select('created_by, closed_by, value, stage'),
      supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ])
    let wh = 0, th = 0, ac = 0, miss = 0
    for (const t of tasks ?? []) {
      if (t.status !== 'APPROVED') continue
      ac += 1
      const h = t.estimated_hours ?? 0
      if (!h) miss += 1
      th += h
      if (t.updated_at && new Date(t.updated_at) >= weekAgo) wh += h
    }
    setWeekHours(wh); setTotalHours(th); setApprovedCount(ac); setMissingHours(miss)
    let br = 0, cl = 0
    for (const d of deals ?? []) {
      if (d.created_by === userId) br += d.value ?? 0
      if (d.stage === 'WON' && d.closed_by === userId) cl += d.value ?? 0
    }
    setBrought(br); setClosed(cl)
    setActions(actionCount ?? 0)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const goalPct = Math.min(100, Math.round((weekHours / WEEKLY_GOAL) * 100))
  const barColor = goalPct >= 100 ? '#22C55E' : goalPct >= 50 ? 'var(--accent)' : '#EAB308'

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
      <div className="flex items-center gap-2 mb-4">
        <Clock size={15} style={{ color: 'var(--accent)' }} />
        <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Mi productividad</h3>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Cargando…</p>
      ) : (
        <>
          {/* Weekly hours */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Horas esta semana</span>
              <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: barColor }}>{weekHours}h / {WEEKLY_GOAL}h</span>
            </div>
            <div style={{ height: '10px', background: 'var(--bg-base)', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${goalPct}%`, background: barColor, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
              {totalHours}h totales acumuladas · {approvedCount} tareas aprobadas
            </p>
          </div>

          {/* Metric tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {[
              { icon: DollarSign, color: 'var(--accent)', label: 'Traído', value: money(brought) },
              { icon: Trophy, color: '#22C55E', label: 'Cerrado', value: money(closed) },
              { icon: Activity, color: '#A855F7', label: 'Acciones', value: String(actions) },
            ].map(t => {
              const Icon = t.icon
              return (
                <div key={t.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <Icon size={11} style={{ color: t.color }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{t.label}</span>
                  </div>
                  <div style={{ color: t.color, fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, lineHeight: 1 }}>{t.value}</div>
                </div>
              )
            })}
          </div>

          {missingHours > 0 && (
            <p style={{ fontSize: '11px', color: '#EAB308', marginTop: '12px', lineHeight: 1.5 }}>
              ⚠️ {missingHours} de tus tareas aprobadas no tienen horas estimadas — no suman a tu total. Ponles “Est. hours” al crearlas o editarlas para que cuenten.
            </p>
          )}
          <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '10px', lineHeight: 1.5, fontStyle: 'italic' }}>
            Las horas se acreditan de las horas estimadas de tus tareas una vez que se aprueban.
          </p>
        </>
      )}
    </div>
  )
}

interface Props {
  profile: ProfileType
  onUpdated: () => void
}

const PREVIEW_ROLES: { id: UserRole; label: string; color: string; desc: string }[] = [
  { id: 'MASTER',         label: 'Master',         color: '#FF6B35', desc: 'Acceso total (tu vista real)' },
  { id: 'C_LEVEL',        label: 'C-Level',        color: '#22C55E', desc: 'Dashboard + analítica, sin admin' },
  { id: 'OPS_MANAGER',    label: 'Ops Manager',    color: '#EAB308', desc: 'Tareas, CRM, objetivos de equipo' },
  { id: 'MARKETING',      label: 'Marketing',      color: '#3B82F6', desc: 'Contenido, campañas y Concierge' },
  { id: 'TEAM',           label: 'Team',           color: '#888888', desc: 'Solo sus tareas y venue clients' },
  { id: 'HEART_OF_HOUSE', label: 'Heart of House', color: '#A78BFA', desc: 'Solo La Casa: mi turno y reportar' },
  { id: 'DEV',            label: 'Dev · Auditoría', color: '#06B6D4', desc: 'Todo en solo lectura + Tareas' },
]

// MASTER-only: preview the app as another role to test what each access level sees.
function RolePreviewCard() {
  const active = getViewAsRole()
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
      <div className="flex items-center gap-2 mb-2">
        <Eye size={15} style={{ color: '#F59E0B' }} />
        <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Vista previa por rol</h3>
        {active && (
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', background: '#F59E0B20', color: '#F59E0B', border: '1px solid #F59E0B50', borderRadius: '4px', padding: '1px 6px' }}>
            ACTIVA: {active}
          </span>
        )}
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '14px', lineHeight: 1.5 }}>
        Prueba la app como la vería cada nivel de acceso. La navegación y los permisos cambian; tu cuenta sigue siendo Master.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
        {PREVIEW_ROLES.map(r => {
          const isActive = active === r.id || (!active && r.id === 'MASTER')
          return (
            <button
              key={r.id}
              onClick={() => setViewAsRole(r.id === 'MASTER' ? null : r.id)}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                background: isActive ? `${r.color}15` : 'var(--bg-elevated)',
                border: `1px solid ${isActive ? r.color : 'var(--border-default)'}`,
              }}
            >
              <div style={{ color: r.color, fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {r.label} {isActive && '✓'}
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '10px', marginTop: '2px', lineHeight: 1.4 }}>{r.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Profile({ profile, onUpdated }: Props) {
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [address, setAddress] = useState(profile.address ?? '')
  const [birthDate, setBirthDate] = useState(profile.birth_date ?? '')
  const [slackWebhook, setSlackWebhook] = useState('')
  const [slackUserId, setSlackUserId] = useState(profile.slack_user_id ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [testingSlack, setTestingSlack] = useState(false)
  const [slackStatus, setSlackStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)
  // Cambio de PIN propio (Heart of House)
  const [newPin, setNewPin] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinMsg, setPinMsg] = useState<string | null>(null)

  async function changeMyPin() {
    if (!isValidPin(newPin)) { setPinMsg('El PIN debe ser de 4 a 6 dígitos.'); return }
    setPinSaving(true); setPinMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pinToPassword(newPin) })
    setPinSaving(false)
    if (error) { setPinMsg('No se pudo cambiar el PIN. Intenta de nuevo.'); return }
    setNewPin(''); setPinMsg('¡PIN actualizado! Úsalo la próxima vez que entres.')
    setTimeout(() => setPinMsg(null), 4000)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setUploadError(null)
    const ext = file.name.split('.').pop()
    const path = `${profile.id}.${ext}`
    // Delete old file first so upsert works regardless of policy setup
    await supabase.storage.from('avatars').remove([path])
    const { error } = await supabase.storage.from('avatars').upload(path, file)
    if (error) {
      setUploadError(error.message)
      setUploadingAvatar(false)
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    // Cache-bust so browser loads the new image even if URL is the same
    const freshUrl = `${data.publicUrl}?t=${Date.now()}`
    setAvatarUrl(freshUrl)
    await supabase.from('profiles').update({ avatar_url: freshUrl }).eq('id', profile.id)
    setUploadingAvatar(false)
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('profiles').update({
      full_name: fullName || null,
      last_name: lastName || null,
      address: address || null,
      birth_date: birthDate || null,
      slack_user_id: slackUserId.trim() || null,
    }).eq('id', profile.id)

    // Save Slack webhook to both localStorage and app_settings
    if (slackWebhook) {
      localStorage.setItem('hog_slack_webhook', slackWebhook)
      await supabase.from('app_settings').upsert({ key: 'slack_webhook', value: slackWebhook }, { onConflict: 'key' })
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onUpdated()
  }

  async function testSlack() {
    const url = slackWebhook || localStorage.getItem('hog_slack_webhook') || ''
    if (!url) return
    if (!url.startsWith('https://hooks.slack.com/')) {
      setSlackStatus('error')
      return
    }
    setTestingSlack(true)
    setSlackStatus('idle')
    try {
      // no-cors: browser blocks reading response but message still delivers
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '✅ HOG APP — Slack integration is working!' }),
      })
      setSlackStatus('ok')
    } catch {
      setSlackStatus('error')
    }
    setTestingSlack(false)
  }

  // Load saved webhook on mount
  useState(() => {
    const saved = localStorage.getItem('hog_slack_webhook')
    if (saved) setSlackWebhook(saved)
  })

  const ROLE_COLORS: Record<string, string> = {
    MASTER: '#22C55E',
    C_LEVEL: '#22C55E',
    OPS_MANAGER: '#EAB308',
    MARKETING: '#3B82F6',
    TEAM: '#888888',
    HEART_OF_HOUSE: '#A78BFA',
    DEV: '#06B6D4',
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

  const label = (text: string) => (
    <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>{text}</label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '16px 24px', flexShrink: 0 }}>
        <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '18px' }}>Perfil</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Tu cuenta e integraciones</p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Avatar */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Photo</h3>
            <div className="flex items-center gap-5">
              <div style={{ position: 'relative', width: '72px', height: '72px', flexShrink: 0 }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-default)' }} />
                ) : (
                  <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '2px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '24px', fontWeight: 700 }}>
                      {(fullName || profile.email || '?')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingAvatar}
                  style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--accent)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Camera size={12} color="#000" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
              </div>
              <div>
                <p style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>{fullName || '—'} {lastName}</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{profile.email}</p>
                <span style={{ color: ROLE_COLORS[profile.role ?? 'TEAM'], fontFamily: 'var(--font-mono)', fontSize: '11px', background: `${ROLE_COLORS[profile.role ?? 'TEAM']}18`, padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                  {profile.role}
                </span>
              </div>
            </div>
            {uploadingAvatar && <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '10px' }}>Uploading…</p>}
            {uploadError && <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '10px' }}>Upload failed: {uploadError}</p>}
          </div>

          {/* Mi PIN — solo cuentas de piso (Heart of House) */}
          {profile.role === 'HEART_OF_HOUSE' && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={15} style={{ color: '#A78BFA' }} />
                <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Mi PIN</h3>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '14px', lineHeight: 1.5 }}>
                Cambia tu PIN por uno que solo tú sepas. Es con el que entras a la app.
              </p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Nuevo PIN (4–6 dígitos)</label>
                  <input value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    type="password" inputMode="numeric" placeholder="••••"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', padding: '10px 12px', fontSize: '16px', letterSpacing: '0.2em', textAlign: 'center', outline: 'none', width: '100%' }} />
                </div>
                <button onClick={() => void changeMyPin()} disabled={pinSaving || !isValidPin(newPin)}
                  style={{ background: isValidPin(newPin) ? '#A78BFA' : 'var(--bg-elevated)', color: isValidPin(newPin) ? '#000' : 'var(--text-tertiary)', border: 'none', borderRadius: '8px', padding: '11px 18px', fontSize: '13px', fontWeight: 700, cursor: isValidPin(newPin) ? 'pointer' : 'not-allowed' }}>
                  {pinSaving ? '…' : 'Cambiar PIN'}
                </button>
              </div>
              {pinMsg && <p style={{ color: pinMsg.startsWith('¡') ? '#22C55E' : '#EF4444', fontSize: '12px', marginTop: '10px' }}>{pinMsg}</p>}
            </div>
          )}

          {/* Role preview — MASTER only, uses the real role so it stays visible while simulating */}
          {profile.role === 'MASTER' && <RolePreviewCard />}

          {/* My Productivity — no aplica para HoH (su trabajo vive en La Casa, no en Tareas) */}
          {profile.role !== 'HEART_OF_HOUSE' && <MyProductivity userId={profile.id} />}

          {/* Personal info */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Personal Info</h3>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  {label('First name')}
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
                <div>
                  {label('Last name')}
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  {label('Birth date')}
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
                <div>
                  {label('Address')}
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City, State" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Slack — no aplica para HoH (no usan Slack) */}
          {profile.role !== 'HEART_OF_HOUSE' && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '20px' }}>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: '16px' }}>💬</span>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Slack Integration</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '14px', lineHeight: '1.5' }}>
              Connect a Slack Incoming Webhook to receive task notifications in your channel.
            </p>
            <div className="flex flex-col gap-4">
              <div>
                {label('Channel Webhook URL (admin)')}
                <input
                  value={slackWebhook}
                  onChange={(e) => setSlackWebhook(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                />
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={testSlack}
                    disabled={testingSlack || !slackWebhook}
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: slackWebhook ? 'var(--text-secondary)' : 'var(--text-tertiary)', borderRadius: '7px', padding: '8px 14px', fontSize: '12px', cursor: slackWebhook ? 'pointer' : 'not-allowed' }}
                  >
                    {testingSlack ? 'Sending…' : 'Test connection'}
                  </button>
                  {slackStatus === 'ok' && <span style={{ color: '#22C55E', fontSize: '12px' }}>✓ Message sent!</span>}
                  {slackStatus === 'error' && <span style={{ color: '#EF4444', fontSize: '12px' }}>✗ Failed — check the URL</span>}
                </div>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', lineHeight: '1.5', marginTop: '8px' }}>
                  Slack → Your workspace → Apps → Incoming Webhooks. All notifications go to this channel.
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                {label('Your Slack Member ID')}
                <input
                  value={slackUserId}
                  onChange={(e) => setSlackUserId(e.target.value)}
                  placeholder="U07ABC1234"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                />
                <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', lineHeight: '1.5', marginTop: '6px' }}>
                  Used to @mention you in notifications. Find it in Slack: click your avatar → <strong>View Profile</strong> → <strong>⋯ More</strong> → <strong>Copy member ID</strong>.
                </p>
              </div>
            </div>
          </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: saved ? '#16A34A' : 'var(--accent)', color: '#000', borderRadius: '9px', padding: '12px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Save size={15} />
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
