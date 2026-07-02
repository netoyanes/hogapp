import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Clock, DollarSign, Trophy, Users, Contact2, Hammer, Activity as ActivityIcon } from 'lucide-react'
import { Avatar } from './Avatar'
import { CHANGELOG } from '../../config/version'

const WEEKLY_GOAL = 40 // hours

interface Member { id: string; name: string; role: string | null }

interface Row {
  id: string
  name: string
  role: string | null
  weekHours: number
  totalHours: number
  actions: number
  broughtValue: number
  broughtCount: number
  closedValue: number
  closedCount: number
}

function money(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

// Rough build-effort estimate ("horas nalga"): a base for ideation/design/setup
// plus an average per shipped changelog item across every version.
const BUILD_BULLETS = CHANGELOG.reduce((s, v) => s + v.changes.length, 0)
const BUILD_HOURS = Math.round(60 + BUILD_BULLETS * 3.5)

export function TeamAnalytics() {
  const [rows, setRows] = useState<Row[]>([])
  const [contactsCount, setContactsCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [pipelineValue, setPipelineValue] = useState(0)
  const [wonValue, setWonValue] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const [{ data: members }, { data: tasks }, { data: deals }, { data: logs }, { count: cCount }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role').not('full_name', 'is', null),
      supabase.from('tasks').select('assigned_to, status, estimated_hours, updated_at'),
      supabase.from('crm_deals').select('created_by, closed_by, value, stage'),
      supabase.from('activity_log').select('user_id'),
      supabase.from('crm_contacts').select('id', { count: 'exact', head: true }),
    ])

    const list: Member[] = (members ?? []).map(m => ({ id: m.id, name: m.full_name ?? m.email ?? 'Unknown', role: m.role }))
    setTeamCount(list.length)
    setContactsCount(cCount ?? 0)

    // Deal totals
    let pipeline = 0, won = 0
    for (const d of deals ?? []) {
      pipeline += d.value ?? 0
      if (d.stage === 'WON') won += d.value ?? 0
    }
    setPipelineValue(pipeline)
    setWonValue(won)

    // Per-user aggregation
    const map: Record<string, Row> = {}
    for (const m of list) {
      map[m.id] = { id: m.id, name: m.name, role: m.role, weekHours: 0, totalHours: 0, actions: 0, broughtValue: 0, broughtCount: 0, closedValue: 0, closedCount: 0 }
    }
    for (const t of tasks ?? []) {
      if (t.status !== 'APPROVED' || !t.assigned_to || !map[t.assigned_to]) continue
      const h = t.estimated_hours ?? 0
      map[t.assigned_to].totalHours += h
      if (t.updated_at && new Date(t.updated_at) >= weekAgo) map[t.assigned_to].weekHours += h
    }
    for (const d of deals ?? []) {
      if (d.created_by && map[d.created_by]) { map[d.created_by].broughtValue += d.value ?? 0; map[d.created_by].broughtCount += 1 }
      if (d.stage === 'WON' && d.closed_by && map[d.closed_by]) { map[d.closed_by].closedValue += d.value ?? 0; map[d.closed_by].closedCount += 1 }
    }
    for (const l of logs ?? []) {
      if (l.user_id && map[l.user_id]) map[l.user_id].actions += 1
    }

    setRows(Object.values(map).sort((a, b) => b.weekHours - a.weekHours || b.actions - a.actions))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const tiles = [
    { label: 'Directory contacts', value: String(contactsCount), icon: Contact2, color: '#0EA5E9' },
    { label: 'HOG team',           value: String(teamCount),     icon: Users,    color: '#A855F7' },
    { label: 'Pipeline value',     value: money(pipelineValue),  icon: DollarSign, color: 'var(--accent)' },
    { label: 'Won value',          value: money(wonValue),       icon: Trophy,   color: '#22C55E' },
    { label: 'Build hours',        value: `~${BUILD_HOURS}h`,    icon: Hammer,   color: '#F59E0B', hint: `Estimación "horas nalga": base 60h + ${BUILD_BULLETS} features × 3.5h` },
  ]

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
        {tiles.map(t => {
          const Icon = t.icon
          return (
            <div key={t.label} title={t.hint} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Icon size={13} style={{ color: t.color }} />
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.label}</span>
              </div>
              <div style={{ color: t.color, fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>{t.value}</div>
            </div>
          )
        })}
      </div>

      {/* Per-user productivity */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <ActivityIcon size={13} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', fontWeight: 600 }}>PRODUCTIVITY BY USER</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '20px', textAlign: 'center' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rows.map(r => {
              const goalPct = Math.min(100, Math.round((r.weekHours / WEEKLY_GOAL) * 100))
              const barColor = goalPct >= 100 ? '#22C55E' : goalPct >= 50 ? 'var(--accent)' : '#EAB308'
              return (
                <div key={r.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar name={r.name} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{r.role ?? '—'}</div>
                    </div>
                    {/* metrics */}
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Metric icon={DollarSign} color="var(--accent)" label="brought" value={`${money(r.broughtValue)}`} sub={`${r.broughtCount} deals`} />
                      <Metric icon={Trophy} color="#22C55E" label="closed" value={`${money(r.closedValue)}`} sub={`${r.closedCount} won`} />
                      <Metric icon={ActivityIcon} color="#A855F7" label="actions" value={String(r.actions)} />
                    </div>
                  </div>
                  {/* weekly hours bar */}
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        <Clock size={10} /> Horas esta semana
                      </span>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: barColor }}>{r.weekHours}h / {WEEKLY_GOAL}h · {r.totalHours}h total</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-base)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${goalPct}%`, background: barColor }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '10px', fontStyle: 'italic' }}>
          Horas calculadas automáticamente de las horas estimadas de las tareas aprobadas. Mete y aprueba tareas para reflejar tu carga real.
        </p>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, color, label, value, sub }: { icon: React.ElementType; color: string; label: string; value: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end' }}>
        <Icon size={11} style={{ color }} />
        <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</span>
      </div>
      <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{sub ?? label}</div>
    </div>
  )
}
