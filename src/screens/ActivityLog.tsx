import { useEffect, useState } from 'react'
import { CheckSquare, ArrowRight, Paperclip, MessageSquare, UserPlus, Activity, Archive, BarChart3, List, AlertTriangle as AlertTriangleIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { APP_VERSION } from '../config/version'
import { ChangelogModal } from '../components/ui/ChangelogModal'
import { TeamAnalytics } from '../components/ui/TeamAnalytics'

type LogEntry = {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
  profiles: { full_name: string | null; email: string | null } | null
}

const ACTION_CONFIG: Record<string, { color: string; icon: React.ElementType; label: (d: Record<string, unknown> | null) => string }> = {
  task_created:   { color: '#22C55E', icon: CheckSquare,   label: (d) => `created task "${d?.title}"` },
  task_edited:    { color: '#7FA3C2', icon: CheckSquare,   label: (d) => `editó "${d?.title}" — ${d?.cambios}` },
  assignee_changed: { color: '#A855F7', icon: UserPlus,    label: (d) => `reasignó "${d?.title}": ${d?.from ?? '—'} → ${d?.to ?? '—'}` },
  status_changed: { color: '#3B82F6', icon: ArrowRight,    label: (d) => `moved "${d?.title}" to ${d?.to}` },
  proof_uploaded: { color: '#EAB308', icon: Paperclip,     label: (d) => `uploaded proof for "${d?.title}"` },
  comment_posted: { color: '#6B7280', icon: MessageSquare, label: (d) => `commented on "${d?.title}"` },
  user_invited:   { color: '#A855F7', icon: UserPlus,      label: (d) => `invited ${d?.email} as ${d?.role}` },
  hoh_created:    { color: '#A78BFA', icon: UserPlus,      label: (d) => `creó acceso de piso "${d?.full_name}" (@${d?.username})` },
  hoh_pin_reset:  { color: '#A78BFA', icon: UserPlus,      label: (d) => `reinició el PIN de @${d?.username}` },
  proof_archived: { color: '#EF4444', icon: Archive,       label: (d) => `archived a proof for "${d?.title}"` },
  link_added:     { color: '#06B6D4', icon: Paperclip,     label: (d) => `agregó un link a "${d?.title}"` },
  guest_created:    { color: '#5FBF7A', icon: UserPlus, label: (d) => `registró al cliente "${d?.name}"${d?.bu ? ` en ${d.bu}` : ''}` },
  guest_updated:    { color: '#7FA3C2', icon: UserPlus, label: (d) => `editó al cliente "${d?.name}"` },
  guest_archived:   { color: '#EAB308', icon: Archive,  label: (d) => `archivó al cliente "${d?.name}"` },
  guest_restored:   { color: '#5FBF7A', icon: Archive,  label: (d) => `restauró al cliente "${d?.name}"` },
  guest_anonymized: { color: '#E5533C', icon: Archive,  label: (d) => `anonimizó al cliente "${d?.name}"` },
  guest_deleted:    { color: '#E5533C', icon: Archive,  label: (d) => `eliminó al cliente "${d?.name}"` },
  reservation_created: { color: '#5FBF7A', icon: CheckSquare, label: (d) => `creó reserva de ${d?.guest} en ${d?.bu} (${d?.date} · ${d?.pax} pax)` },
  reservation_status:  { color: '#7FA3C2', icon: ArrowRight,  label: (d) => `movió la reserva de ${d?.guest} en ${d?.bu} a ${d?.to}` },
  venue_assigned:   { color: '#5FBF7A', icon: UserPlus, label: (d) => `asignó ${d?.bu} a ${d?.member}` },
  venue_unassigned: { color: '#EAB308', icon: UserPlus, label: (d) => `quitó ${d?.bu} a ${d?.member}` },
  reservation_overbooked: { color: '#FACC15', icon: AlertTriangleIcon, label: (d) => `autorizó SOBRECUPO para ${d?.guest} en ${d?.bu} (${d?.slot} · ${d?.pax} pax)` },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-MX', { month: 'long', day: 'numeric', year: 'numeric' })
}

function userName(e: LogEntry) {
  // Acciones del bot (sin user_id) declaran su actor en details.actor → "Concierge HOG"
  const actor = typeof e.details?.actor === 'string' ? e.details.actor : null
  return e.profiles?.full_name ?? e.profiles?.email ?? actor ?? 'Unknown'
}

function userInitials(e: LogEntry) {
  const name = e.profiles?.full_name ?? (typeof e.details?.actor === 'string' ? e.details.actor : null)
  const email = e.profiles?.email
  if (name) return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
  return (email?.[0] ?? '?').toUpperCase()
}

export function ActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [tab, setTab] = useState<'timeline' | 'analytics'>('timeline')

  async function load() {
    const { data } = await supabase
      .from('activity_log')
      .select('*, profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(300)
    setEntries((data as LogEntry[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('activity-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Stats
  const todayStr = new Date().toDateString()
  const todayEntries = entries.filter((e) => new Date(e.created_at).toDateString() === todayStr)
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const weekEntries = entries.filter((e) => new Date(e.created_at) >= weekAgo)

  const todayCounts: Record<string, { name: string; count: number }> = {}
  todayEntries.forEach((e) => {
    if (!e.user_id) return
    const name = userName(e)
    if (!todayCounts[e.user_id]) todayCounts[e.user_id] = { name, count: 0 }
    todayCounts[e.user_id].count++
  })
  const mostActive = Object.values(todayCounts).sort((a, b) => b.count - a.count)[0]

  // Group entries by day
  const grouped: { label: string; entries: LogEntry[] }[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    const label = dayLabel(e.created_at)
    if (!seen.has(label)) {
      seen.add(label)
      grouped.push({ label, entries: [] })
    }
    grouped[grouped.length - 1].entries.push(e)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '17px' }}>Actividad</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Todas las acciones de la plataforma · en vivo</p>
          </div>
          <Activity size={18} style={{ color: 'var(--text-tertiary)' }} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {([['timeline', 'Cronología', List], ['analytics', 'Analítica', BarChart3]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '7px', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600,
                background: tab === id ? 'var(--accent-bg)' : 'transparent',
                border: `1px solid ${tab === id ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                color: tab === id ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* KPI strip (timeline only) */}
        {tab === 'timeline' && (
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '2px' }}>
          {[
            { label: 'Hoy',       value: String(todayEntries.length),  color: 'var(--accent)' },
            { label: 'Semana',   value: String(weekEntries.length),   color: 'var(--text-primary)' },
            { label: 'Total',       value: String(entries.length),       color: 'var(--text-primary)' },
            { label: 'Más activo', value: mostActive ? `${mostActive.name.split(' ')[0]} ×${mostActive.count}` : '—', color: '#A855F7' },
          ].map((s) => (
            <div key={s.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '8px 12px', flexShrink: 0, minWidth: '80px' }}>
              <div style={{ color: s.color, fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '10px', marginTop: '3px' }}>{s.label}</div>
            </div>
          ))}
        </div>
        )}
      </div>

      {tab === 'analytics' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <TeamAnalytics />
        </div>
      ) : (
      /* Timeline */
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: '48px', background: 'var(--bg-surface)', borderRadius: '8px' }} className="animate-pulse-green" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', flexDirection: 'column', gap: '10px' }}>
            <Activity size={28} style={{ color: 'var(--text-tertiary)' }} />
            <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', textAlign: 'center', maxWidth: '280px' }}>
              No activity yet. Actions will appear here as the team uses the platform.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {grouped.map((group) => (
              <div key={group.label}>
                {/* Day header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {group.label.toUpperCase()}
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {group.entries.length} acción{group.entries.length !== 1 ? 'es' : ''}
                  </span>
                </div>

                {/* Entries */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {group.entries.map((entry) => {
                    const cfg = ACTION_CONFIG[entry.action] ?? { color: '#6B7280', icon: Activity, label: () => entry.action }
                    const Icon = cfg.icon
                    return (
                      <div
                        key={entry.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}
                      >
                        {/* Action icon */}
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: `${cfg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={13} style={{ color: cfg.color }} />
                        </div>

                        {/* User initials */}
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            {userInitials(entry)}
                          </span>
                        </div>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
                            {userName(entry)}
                          </span>
                          {' '}
                          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {cfg.label(entry.details)}
                          </span>
                        </div>

                        {/* Time */}
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          {timeAgo(entry.created_at)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Version badge */}
        <div style={{ marginTop: '40px', paddingBottom: '8px', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setChangelogOpen(true)}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '4px 10px', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent-border)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
          >
            v{APP_VERSION}
          </button>
        </div>
      </div>
      )}

      {changelogOpen && <ChangelogModal onClose={() => setChangelogOpen(false)} />}
    </div>
  )
}
