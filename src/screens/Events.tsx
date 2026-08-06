import { useEffect, useMemo, useState, useCallback } from 'react'
import { Plus, X, Search, Trash2, CheckSquare, ListPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../hooks/useActivityLog'
import { useIsMobile } from '../hooks/useIsMobile'
import { BUChip, Sheet, StatusBadgeV2, showToast, type StatusTone } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS — planeación de eventos multi-venue (estilo Asana):
// en escritorio es una TABLA agrupada por mes con sumas (presupuesto y
// asistencia); en teléfono, tarjetas. Cada evento captura descripción, fecha,
// tipo, cover, presupuesto, asistencia esperada, requerimientos, colaboradores
// y responsable — y sus tareas de ejecución se escriben por bullets y se pasan
// al Task Manager con un botón.
// ─────────────────────────────────────────────────────────────────────────────

type EventStatus = 'idea' | 'planning' | 'approved' | 'done' | 'cancelled'
type EventType = 'musica' | 'arte' | 'performance' | 'workshop' | 'comunidad' | 'comercial' | 'deporte' | 'privado' | 'otro'
type PlanKind = 'evento' | 'adecuacion' | 'remodelacion' | 'apertura' | 'mantenimiento' | 'otro'

interface EventPlan {
  id: string
  bu_id: string
  name: string
  description: string | null
  kind: PlanKind
  date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  event_type: EventType
  has_cover: boolean
  cover_price: number | null
  budget: number | null
  expected_attendance: number | null
  requirements: string | null
  collaborators: string | null
  responsible: string | null
  status: EventStatus
}
interface TaskLite { id: string; title: string; status: string }
interface Resource { id: string; name: string; qty: number; unit_cost: number | null; notes: string | null }
interface BudgetItem { id: string; concept: string; amount: number; is_income: boolean; deal_id: string | null }

// Disciplinas de proyecto (no-evento): adecuación, remodelación, apertura…
const KIND_META: Record<PlanKind, { label: string; color: string }> = {
  evento:        { label: 'Evento',        color: '#E8A33D' },
  adecuacion:    { label: 'Adecuación',    color: '#7FA3C2' },
  remodelacion:  { label: 'Remodelación',  color: '#D98C9F' },
  apertura:      { label: 'Apertura',      color: '#5FBF7A' },
  mantenimiento: { label: 'Mantenimiento', color: '#C9A76B' },
  otro:          { label: 'Proyecto',      color: '#9C9488' },
}

const TYPE_META: Record<EventType, { label: string; color: string }> = {
  musica:      { label: 'Música',      color: '#D98C9F' },
  arte:        { label: 'Arte',        color: '#E8A33D' },
  performance: { label: 'Performance', color: '#B08BC9' },
  workshop:    { label: 'Workshop',    color: '#7FA3C2' },
  comunidad:   { label: 'Comunidad',   color: '#DB9A6A' },
  comercial:   { label: 'Comercial',   color: '#8FBF9F' },
  deporte:     { label: 'Deporte',     color: '#5E9FB8' },
  privado:     { label: 'Privado',     color: '#C9A76B' },
  otro:        { label: 'Otro',        color: '#9C9488' },
}
const STATUS_META: Record<EventStatus, { label: string; tone: StatusTone }> = {
  idea:      { label: 'Idea',           tone: 'neutral' },
  planning:  { label: 'En planeación',  tone: 'accent' },
  approved:  { label: 'Aprobado',       tone: 'healthy' },
  done:      { label: 'Realizado',      tone: 'neutral' },
  cancelled: { label: 'Cancelado',      tone: 'risk' },
}
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
// Chips de día coloreados como la referencia — se distingue el día al vistazo
const DAY_COLORS = ['#5E9FB8', '#8FBF9F', '#D98C9F', '#DB9A6A', '#C9A76B', '#B08BC9', '#E8A33D']

const mxn = (n: number) => `MX$${Number(n).toLocaleString('es-MX')}`
// Bullets → títulos de tarea: quita viñetas (-, •, *) y líneas vacías
const parseBullets = (text: string) => text.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)

interface Props { userRole?: string; userId?: string; onOpenTask?: (id: string) => void }

export function Events({ userRole, userId, onOpenTask }: Props) {
  const isMobile = useIsMobile()
  const canWrite = ['MASTER', 'C_LEVEL', 'OPS_MANAGER', 'MARKETING', 'TEAM'].includes(userRole ?? '')
  const [rows, setRows] = useState<EventPlan[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [people, setPeople] = useState<{ id: string; full_name: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [buFilter, setBuFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'eventos' | 'proyectos'>('all')
  const [search, setSearch] = useState('')
  const [showPast, setShowPast] = useState(false)
  const [editing, setEditing] = useState<EventPlan | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const [{ data: ev }, { data: bus }, { data: ppl }] = await Promise.all([
      supabase.from('event_plans').select('*').order('date', { ascending: true, nullsFirst: false }),
      supabase.from('business_units').select('id, code, name').order('name'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ])
    setRows((ev ?? []) as EventPlan[])
    setBuList(bus ?? [])
    setPeople(ppl ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const buMap = useMemo(() => Object.fromEntries(buList.map(b => [b.id, b.code])), [buList])
  const nameOf = useCallback((id: string | null) => people.find(p => p.id === id)?.full_name ?? null, [people])

  const monthStart = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (buFilter && r.bu_id !== buFilter) return false
      if (kindFilter === 'eventos' && r.kind !== 'evento') return false
      if (kindFilter === 'proyectos' && r.kind === 'evento') return false
      // Un proyecto sigue vigente mientras su fecha FIN no haya pasado
      if (!showPast && (r.end_date ?? r.date) && (r.end_date ?? r.date)! < monthStart) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
        || (r.description ?? '').toLowerCase().includes(q)
        || (r.collaborators ?? '').toLowerCase().includes(q)
        || TYPE_META[r.event_type].label.toLowerCase().includes(q)
        || (buMap[r.bu_id] ?? '').toLowerCase().includes(q)
        || (nameOf(r.responsible) ?? '').toLowerCase().includes(q)
    })
  }, [rows, buFilter, kindFilter, search, showPast, monthStart, buMap, nameOf])

  // Agrupar por mes (los sin fecha, al final en "Sin fecha")
  const groups = useMemo(() => {
    const g: { key: string; label: string; items: EventPlan[] }[] = []
    const byKey: Record<string, EventPlan[]> = {}
    for (const r of filtered) {
      const key = r.date ? r.date.slice(0, 7) : 'zz-sin-fecha'
      ;(byKey[key] = byKey[key] ?? []).push(r)
    }
    for (const key of Object.keys(byKey).sort()) {
      const label = key === 'zz-sin-fecha'
        ? 'Sin fecha'
        : new Date(key + '-01T00:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
      g.push({ key, label, items: byKey[key] })
    }
    return g
  }, [filtered])

  const inp: React.CSSProperties = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', padding: '8px 10px', fontSize: 13, outline: 'none', minHeight: 42, boxSizing: 'border-box',
  }
  const th: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-base)', textAlign: 'left',
    fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
    fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', padding: '8px 10px',
    borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    padding: '9px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12.5,
    color: 'var(--text-secondary)', whiteSpace: 'nowrap', verticalAlign: 'middle',
  }

  const typePill = (t: EventType) => (
    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: TYPE_META[t].color, background: `color-mix(in srgb, ${TYPE_META[t].color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${TYPE_META[t].color} 40%, transparent)`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>{TYPE_META[t].label}</span>
  )
  // Eventos muestran su tipo (Música, Arte…); proyectos su disciplina
  const planPill = (ev: EventPlan) => ev.kind === 'evento'
    ? typePill(ev.event_type)
    : <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: KIND_META[ev.kind].color, background: `color-mix(in srgb, ${KIND_META[ev.kind].color} 14%, transparent)`, border: `1px solid ${KIND_META[ev.kind].color}`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>{KIND_META[ev.kind].label}</span>
  const fechaLabel = (ev: EventPlan) => {
    if (!ev.date) return '—'
    const f = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    return ev.end_date && ev.end_date !== ev.date ? `${f(ev.date)} – ${f(ev.end_date)}` : f(ev.date)
  }
  const dayChip = (d: Date) => (
    <span style={{ fontSize: 10, fontWeight: 700, color: '#0d0d0d', background: DAY_COLORS[d.getDay()], borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>{DAYS_ES[d.getDay()]}</span>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800, margin: 0, flex: isMobile ? '1 0 100%' : undefined }}>Proyectos</h1>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-elevated)', borderRadius: 999, padding: 2 }}>
            {([['all', 'Todos'], ['eventos', 'Eventos'], ['proyectos', 'Proyectos']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setKindFilter(id)}
                style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: kindFilter === id ? 'var(--accent)' : 'transparent', color: kindFilter === id ? 'var(--on-accent)' : 'var(--text-tertiary)' }}>
                {label}
              </button>
            ))}
          </div>
          <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
            style={{ ...inp, cursor: 'pointer', minHeight: 40 }}>
            <option value="">Todos los venues</option>
            {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
          <button onClick={() => setShowPast(p => !p)}
            style={{ minHeight: 40, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: showPast ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${showPast ? 'var(--accent)' : 'var(--border-default)'}`, color: showPast ? 'var(--accent)' : 'var(--text-secondary)' }}>
            Pasados
          </button>
          <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar evento…"
              style={{ ...inp, width: '100%', paddingLeft: 30, minHeight: 40 }} />
          </div>
          {canWrite && (
            <button onClick={() => setCreating(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
              <Plus size={14} /> {!isMobile && 'Evento'}
            </button>
          )}
        </div>
      </div>

      {/* Cuerpo: tabla (escritorio) / tarjetas (teléfono), agrupado por mes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 16px' : '0 0 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: isMobile ? 0 : 16 }}>
            {[64, 64, 64].map((h, i) => <div key={i} className="animate-pulse-green" style={{ height: h, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }} />)}
          </div>
        ) : groups.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
            {rows.length === 0 ? 'Sin eventos todavía — crea el primero con “+ Evento”.' : 'Sin resultados con estos filtros.'}
          </p>
        ) : !isMobile ? (
          /* ── Tabla estilo Asana con sumas por mes ── */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={th}>Fecha</th><th style={th}>Día</th><th style={{ ...th, minWidth: 220 }}>Evento</th>
                  <th style={th}>Tipo</th><th style={th}>Venue</th><th style={th}>Hora</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cover</th><th style={{ ...th, textAlign: 'right' }}>Presupuesto</th>
                  <th style={{ ...th, textAlign: 'right' }}>Asistencia</th><th style={th}>Colaboradores</th>
                  <th style={th}>Responsable</th><th style={th}>Estado</th>
                </tr>
              </thead>
              {groups.map(g => {
                const sumBudget = g.items.reduce((s, e) => s + (e.budget ?? 0), 0)
                const sumAtt = g.items.reduce((s, e) => s + (e.expected_attendance ?? 0), 0)
                return (
                  <tbody key={g.key}>
                    <tr>
                      <td colSpan={12} style={{ ...td, borderBottom: 'none', paddingTop: 18, fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
                        {g.label} · {g.items.length}
                      </td>
                    </tr>
                    {g.items.map(ev => {
                      const d = ev.date ? new Date(ev.date + 'T00:00:00') : null
                      const respName = nameOf(ev.responsible)
                      return (
                        <tr key={ev.id} onClick={() => setEditing(ev)} className="hover:bg-[var(--bg-surface)]"
                          style={{ cursor: 'pointer', opacity: ev.status === 'cancelled' ? 0.5 : 1 }}>
                          <td style={{ ...td, fontFamily: 'var(--font-mono)' }} className="num">{fechaLabel(ev)}</td>
                          <td style={td}>{d ? dayChip(d) : ''}</td>
                          <td style={{ ...td, whiteSpace: 'normal' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{ev.name}</span>
                            {ev.description && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{ev.description}</span>}
                          </td>
                          <td style={td}>{planPill(ev)}</td>
                          <td style={td}><BUChip code={buMap[ev.bu_id] ?? '?'} size="sm" /></td>
                          <td style={{ ...td, fontFamily: 'var(--font-mono)' }} className="num">
                            {ev.start_time ? `${ev.start_time}${ev.end_time ? `–${ev.end_time}` : ''}` : '—'}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }} className="num">
                            {ev.has_cover ? (ev.cover_price != null ? mxn(ev.cover_price) : 'Sí') : '—'}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }} className="num">
                            {ev.budget != null ? mxn(ev.budget) : '—'}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }} className="num">
                            {ev.expected_attendance ?? '—'}
                          </td>
                          <td style={{ ...td, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.collaborators ?? '—'}</td>
                          <td style={{ ...td, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{respName ?? '—'}</td>
                          <td style={td}><StatusBadgeV2 tone={STATUS_META[ev.status].tone} label={STATUS_META[ev.status].label} /></td>
                        </tr>
                      )
                    })}
                    {(sumBudget > 0 || sumAtt > 0) && (
                      <tr>
                        <td colSpan={7} style={{ ...td, textAlign: 'right', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Suma del mes</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }} className="num">{sumBudget > 0 ? mxn(sumBudget) : ''}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }} className="num">{sumAtt > 0 ? sumAtt : ''}</td>
                        <td colSpan={3} style={td} />
                      </tr>
                    )}
                  </tbody>
                )
              })}
            </table>
          </div>
        ) : (
          /* ── Teléfono: tarjetas compactas ── */
          groups.map(g => (
            <div key={g.key} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                {g.label} <span style={{ fontWeight: 400 }}>· {g.items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.items.map(ev => {
                  const d = ev.date ? new Date(ev.date + 'T00:00:00') : null
                  const respName = nameOf(ev.responsible)
                  return (
                    <button key={ev.id} onClick={() => setEditing(ev)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px', cursor: 'pointer', textAlign: 'left', minHeight: 60, opacity: ev.status === 'cancelled' ? 0.55 : 1 }}>
                      <div style={{ textAlign: 'center', flexShrink: 0, width: 40 }}>
                        {d ? (
                          <>
                            <div className="num" style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{d.getDate()}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{DAYS_ES[d.getDay()]}</div>
                          </>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{ev.name}</span>
                          <BUChip code={buMap[ev.bu_id] ?? '?'} size="sm" />
                          {planPill(ev)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {ev.start_time && <span className="num">{ev.start_time}{ev.end_time ? `–${ev.end_time}` : ''}</span>}
                          <span>{ev.has_cover ? `Cover ${ev.cover_price != null ? mxn(ev.cover_price) : ''}` : 'Sin cover'}</span>
                          {ev.budget != null && <span>Presup. {mxn(ev.budget)}</span>}
                          {ev.expected_attendance != null && <span>{ev.expected_attendance} asist.</span>}
                          {respName && <span>· {respName}</span>}
                        </div>
                      </div>
                      <StatusBadgeV2 tone={STATUS_META[ev.status].tone} label={STATUS_META[ev.status].label} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {(creating || editing) && (
        <EventSheet
          event={editing}
          buList={buList}
          people={people}
          canWrite={canWrite}
          userId={userId}
          userRole={userRole}
          isMobile={isMobile}
          onOpenTask={onOpenTask}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ── Recursos requeridos: 1 bartender, 2 meseros, 1 guardia, equipo… ──────────
function ResourcesSection({ eventId, canWrite }: { eventId: string; canWrite: boolean }) {
  const [items, setItems] = useState<Resource[]>([])
  const [nName, setNName] = useState('')
  const [nQty, setNQty] = useState('1')
  const [nCost, setNCost] = useState('')

  useEffect(() => {
    supabase.from('project_resources').select('id, name, qty, unit_cost, notes').eq('event_id', eventId).order('created_at')
      .then(({ data }) => setItems((data ?? []) as Resource[]))
  }, [eventId])

  async function add() {
    if (!nName.trim()) return
    const { data, error } = await supabase.from('project_resources').insert({
      event_id: eventId, name: nName.trim(), qty: Math.max(1, Number(nQty) || 1),
      unit_cost: nCost !== '' ? Number(nCost) : null,
    }).select('id, name, qty, unit_cost, notes').single()
    if (error || !data) { showToast(`No se pudo agregar: ${error?.message}`, 'error'); return }
    setItems(prev => [...prev, data as Resource])
    setNName(''); setNQty('1'); setNCost('')
  }
  async function remove(id: string) {
    await supabase.from('project_resources').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const total = items.reduce((s, i) => s + (i.unit_cost ?? 0) * i.qty, 0)
  const inp: React.CSSProperties = {
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none', minHeight: 40, boxSizing: 'border-box',
  }
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flex: 1 }}>Recursos requeridos{items.length ? ` (${items.length})` : ''}</span>
        {total > 0 && <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{mxn(total)}</span>}
      </div>
      {items.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <span className="num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)', width: 28, textAlign: 'center' }}>{i.qty}×</span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{i.name}</span>
          {i.unit_cost != null && <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{mxn(i.unit_cost)} c/u</span>}
          {canWrite && (
            <button onClick={() => remove(i.id)} aria-label="Quitar recurso" style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><Trash2 size={12} /></button>
          )}
        </div>
      ))}
      {canWrite && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input type="number" inputMode="numeric" min={1} value={nQty} onChange={e => setNQty(e.target.value)} className="num" style={{ ...inp, width: 52, textAlign: 'center' }} aria-label="Cantidad" />
          <input value={nName} onChange={e => setNName(e.target.value)} placeholder="Bartender, mesero, guardia, proyector…"
            onKeyDown={e => { if (e.key === 'Enter') add() }} style={{ ...inp, flex: 1 }} />
          <input type="number" inputMode="numeric" min={0} value={nCost} onChange={e => setNCost(e.target.value)} placeholder="$ c/u" className="num" style={{ ...inp, width: 76 }} aria-label="Costo unitario" />
          <button onClick={add} disabled={!nName.trim()}
            style={{ minHeight: 40, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: nName.trim() ? 'var(--accent)' : 'var(--bg-base)', color: nName.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', cursor: nName.trim() ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Presupuesto por partidas: gastos + patrocinios (ligados al CRM) ──────────
function BudgetSection({ event, buCode, canWrite, userId }: { event: EventPlan; buCode: string; canWrite: boolean; userId?: string }) {
  const [items, setItems] = useState<BudgetItem[]>([])
  const [nConcept, setNConcept] = useState('')
  const [nAmount, setNAmount] = useState('')
  const [nIncome, setNIncome] = useState(false)

  useEffect(() => {
    supabase.from('project_budget_items').select('id, concept, amount, is_income, deal_id').eq('event_id', event.id).order('created_at')
      .then(({ data }) => setItems((data ?? []) as BudgetItem[]))
  }, [event.id])

  async function add() {
    if (!nConcept.trim() || nAmount === '') return
    const { data, error } = await supabase.from('project_budget_items').insert({
      event_id: event.id, concept: nConcept.trim(), amount: Number(nAmount), is_income: nIncome,
    }).select('id, concept, amount, is_income, deal_id').single()
    if (error || !data) { showToast(`No se pudo agregar: ${error?.message}`, 'error'); return }
    setItems(prev => [...prev, data as BudgetItem])
    setNConcept(''); setNAmount(''); setNIncome(false)
  }
  async function remove(id: string) {
    await supabase.from('project_budget_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }
  // Patrocinio → deal en el CRM (pipeline comercial); ligado a la partida
  async function toDeal(item: BudgetItem) {
    if (item.deal_id) { window.dispatchEvent(new CustomEvent('hog:open-deal', { detail: item.deal_id })); return }
    const title = `Patrocinio — ${item.concept} · ${event.name}`
    const { data: deal, error } = await supabase.from('crm_deals').insert({
      title, deal_type: 'EVENT', stage: 'LEAD', probability: 50, value: item.amount || null,
      event_date: event.date, close_date: event.date, bu_id: event.bu_id,
      description: `Patrocinio del plan "${event.name}" (${buCode}) — creado desde Proyectos`,
      created_by: userId ?? null,
    }).select('id').single()
    if (error || !deal) { showToast(`No se pudo crear el deal: ${error?.message}`, 'error'); return }
    await supabase.from('project_budget_items').update({ deal_id: deal.id }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, deal_id: deal.id } : i))
    logActivity('deal_created', 'deal', deal.id, { title, via: 'proyecto', event: event.name })
    showToast('Deal de patrocinio creado en Comercial — ábrelo para ligar la marca.', 'success')
    window.dispatchEvent(new CustomEvent('hog:open-deal', { detail: deal.id }))
  }

  const gastos = items.filter(i => !i.is_income).reduce((s, i) => s + i.amount, 0)
  const ingresos = items.filter(i => i.is_income).reduce((s, i) => s + i.amount, 0)
  const inp: React.CSSProperties = {
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none', minHeight: 40, boxSizing: 'border-box',
  }
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flex: 1 }}>Presupuesto por partidas</span>
        {(gastos > 0 || ingresos > 0) && (
          <span className="num" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            Gastos {mxn(gastos)}{ingresos > 0 && <> · Patrocinios <span style={{ color: 'var(--status-healthy)' }}>{mxn(ingresos)}</span> · Neto {mxn(gastos - ingresos)}</>}
          </span>
        )}
      </div>
      {items.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{i.concept}</span>
          {i.is_income && (
            <button onClick={() => canWrite && toDeal(i)} title={i.deal_id ? 'Abrir deal en Comercial' : 'Crear deal de patrocinio en Comercial'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 30, padding: '0 8px', borderRadius: 999, border: `1px solid ${i.deal_id ? 'var(--status-healthy)' : 'var(--accent-border)'}`, background: 'none', color: i.deal_id ? 'var(--status-healthy)' : 'var(--accent)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              🤝 {i.deal_id ? 'Deal ligado' : 'Crear deal'}
            </button>
          )}
          <span className="num" style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: i.is_income ? 'var(--status-healthy)' : 'var(--text-secondary)' }}>
            {i.is_income ? '+' : '−'}{mxn(i.amount)}
          </span>
          {canWrite && (
            <button onClick={() => remove(i.id)} aria-label="Quitar partida" style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><Trash2 size={12} /></button>
          )}
        </div>
      ))}
      {canWrite && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <input value={nConcept} onChange={e => setNConcept(e.target.value)} placeholder="Sombreros, vasos especiales, patrocinio X…"
            onKeyDown={e => { if (e.key === 'Enter') add() }} style={{ ...inp, flex: 1, minWidth: 150 }} />
          <input type="number" inputMode="numeric" min={0} value={nAmount} onChange={e => setNAmount(e.target.value)} placeholder="$" className="num" style={{ ...inp, width: 88 }} />
          <button onClick={() => setNIncome(v => !v)} title="Gasto o patrocinio (ingreso)"
            style={{ minHeight: 40, padding: '0 10px', borderRadius: 999, border: `1px solid ${nIncome ? 'var(--status-healthy)' : 'var(--border-default)'}`, background: nIncome ? 'color-mix(in srgb, var(--status-healthy) 12%, transparent)' : 'none', color: nIncome ? 'var(--status-healthy)' : 'var(--text-tertiary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {nIncome ? 'Patrocinio' : 'Gasto'}
          </button>
          <button onClick={add} disabled={!nConcept.trim() || nAmount === ''}
            style={{ minHeight: 40, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: nConcept.trim() && nAmount !== '' ? 'var(--accent)' : 'var(--bg-base)', color: nConcept.trim() && nAmount !== '' ? 'var(--on-accent)' : 'var(--text-tertiary)', cursor: nConcept.trim() && nAmount !== '' ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sheet de crear/editar evento + tareas por bullets ────────────────────────
function EventSheet({ event, buList, people, canWrite, userId, userRole, isMobile, onOpenTask, onClose, onSaved }: {
  event: EventPlan | null
  buList: { id: string; code: string; name: string }[]
  people: { id: string; full_name: string | null }[]
  canWrite: boolean
  userId?: string
  userRole?: string
  isMobile: boolean
  onOpenTask?: (id: string) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(event?.name ?? '')
  const [buId, setBuId] = useState(event?.bu_id ?? (buList[0]?.id ?? ''))
  const [kind, setKind] = useState<PlanKind>(event?.kind ?? 'evento')
  const [endDate, setEndDate] = useState(event?.end_date ?? '')
  const [date, setDate] = useState(event?.date ?? '')
  const [startTime, setStartTime] = useState(event?.start_time ?? '')
  const [endTime, setEndTime] = useState(event?.end_time ?? '')
  const [type, setType] = useState<EventType>(event?.event_type ?? 'musica')
  const [description, setDescription] = useState(event?.description ?? '')
  const [hasCover, setHasCover] = useState(event?.has_cover ?? false)
  const [coverPrice, setCoverPrice] = useState(event?.cover_price != null ? String(event.cover_price) : '')
  const [budget, setBudget] = useState(event?.budget != null ? String(event.budget) : '')
  const [expectedAtt, setExpectedAtt] = useState(event?.expected_attendance != null ? String(event.expected_attendance) : '')
  const [requirements, setRequirements] = useState(event?.requirements ?? '')
  const [collaborators, setCollaborators] = useState(event?.collaborators ?? '')
  const [responsible, setResponsible] = useState(event?.responsible ?? '')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'idea')
  const [saving, setSaving] = useState(false)
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [bulkTasks, setBulkTasks] = useState('')
  const canDelete = ['MASTER', 'OPS_MANAGER'].includes(userRole ?? '')

  useEffect(() => {
    if (!event) return
    supabase.from('tasks').select('id, title, status').eq('event_id', event.id).order('created_at')
      .then(({ data }) => setTasks((data ?? []) as TaskLite[]))
  }, [event])

  // Bullets → tareas reales en el Task Manager, ligadas al evento
  async function pushBulkTasks(eventId: string, eventName: string, eventBu: string, eventDate: string | null): Promise<number> {
    const lines = parseBullets(bulkTasks)
    if (!lines.length) return 0
    const rows = lines.map(title => ({
      title, status: 'OPEN', priority: 'MEDIUM', deadline_type: 'SOFT',
      bu_id: eventBu, due_date: eventDate, event_id: eventId, created_by: userId ?? null,
    }))
    const { data, error } = await supabase.from('tasks').insert(rows).select('id, title, status')
    if (error || !data) { showToast(`No se pudieron crear las tareas: ${error?.message}`, 'error'); return 0 }
    logActivity('task_created', 'event', eventId, { via: 'event_bullets', event: eventName, tareas: lines.length })
    setTasks(prev => [...prev, ...(data as TaskLite[])])
    setBulkTasks('')
    return data.length
  }

  async function save() {
    if (!name.trim() || !buId) { showToast('Ponle nombre y venue al evento.', 'error'); return }
    setSaving(true)
    const row = {
      bu_id: buId, name: name.trim(), description: description.trim() || null,
      kind, end_date: endDate || null,
      date: date || null, start_time: startTime || null, end_time: endTime || null,
      event_type: type, has_cover: kind === 'evento' && hasCover,
      cover_price: kind === 'evento' && hasCover && coverPrice !== '' ? Number(coverPrice) : null,
      budget: budget !== '' ? Number(budget) : null,
      expected_attendance: expectedAtt !== '' ? Math.max(0, Number(expectedAtt)) : null,
      requirements: requirements.trim() || null,
      collaborators: collaborators.trim() || null,
      responsible: responsible || null, status,
    }
    if (event) {
      const { error } = await supabase.from('event_plans').update(row).eq('id', event.id)
      setSaving(false)
      if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
      logActivity('event_updated', 'event', event.id, { name: row.name })
    } else {
      const { data, error } = await supabase.from('event_plans').insert({ ...row, created_by: userId ?? null }).select('id').single()
      setSaving(false)
      if (error || !data) { showToast(`No se pudo crear: ${error?.message}`, 'error'); return }
      logActivity('event_created', 'event', data.id, { name: row.name })
      // Bullets escritos durante la creación → se pasan a Tareas de una vez
      const n = await pushBulkTasks(data.id, row.name, buId, row.date)
      if (n) showToast(`Evento creado con ${n} tareas en Tareas.`, 'success')
    }
    if (event) showToast('Evento guardado.', 'success')
    onSaved()
  }

  async function deleteEvent() {
    if (!event) return
    if (!window.confirm(`¿Eliminar "${event.name}"? Las tareas ligadas NO se borran, solo se desligan.`)) return
    await supabase.from('event_plans').delete().eq('id', event.id)
    logActivity('event_deleted', 'event', event.id, { name: event.name })
    onSaved()
  }

  const inp: React.CSSProperties = {
    width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
  const bulkPending = parseBullets(bulkTasks).length

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={520}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>{event ? 'Evento' : 'Nuevo evento'}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ¿Evento o proyecto? — cambia los campos relevantes */}
          <div>
            <label style={lbl}>¿Qué planeas?</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => canWrite && setKind('evento')}
                style={{ minHeight: 40, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: kind === 'evento' ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${kind === 'evento' ? 'var(--accent)' : 'var(--border-default)'}`, color: kind === 'evento' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                Evento
              </button>
              {(Object.keys(KIND_META) as PlanKind[]).filter(k => k !== 'evento').map(k => (
                <button key={k} onClick={() => canWrite && setKind(k)}
                  style={{ minHeight: 40, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: kind === k ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--border-default)'}`, color: kind === k ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={lbl}>Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'evento' ? 'Colombian Night, Art Talk…' : 'Remodelación terraza, Adecuación barra…'} style={inp} disabled={!canWrite} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Venue *</label>
              <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inp, cursor: 'pointer' }} disabled={!canWrite}>
                {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select>
            </div>
            {kind === 'evento' ? (
              <div>
                <label style={lbl}>Tipo</label>
                <select value={type} onChange={e => setType(e.target.value as EventType)} style={{ ...inp, cursor: 'pointer' }} disabled={!canWrite}>
                  {(Object.keys(TYPE_META) as EventType[]).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label style={lbl}>Fecha fin (estimada)</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="num" style={inp} disabled={!canWrite} />
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>{kind === 'evento' ? 'Fecha' : 'Fecha inicio'}</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="num" style={inp} disabled={!canWrite} />
            </div>
            <div>
              <label style={lbl}>Inicio</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inp} disabled={!canWrite} />
            </div>
            <div>
              <label style={lbl}>Fin</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inp} disabled={!canWrite} />
            </div>
          </div>

          <div>
            <label style={lbl}>Descripción / caption</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} disabled={!canWrite}
              placeholder="Concepto, line-up, copy del evento…" style={{ ...inp, minHeight: 60, padding: '10px 12px', resize: 'vertical' }} />
          </div>

          {kind === 'evento' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 44 }}>
                <input type="checkbox" checked={hasCover} onChange={e => setHasCover(e.target.checked)} disabled={!canWrite} style={{ accentColor: 'var(--accent)', width: 18, height: 18 }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Tiene cover</span>
              </label>
              {hasCover ? (
                <div>
                  <label style={lbl}>Precio cover</label>
                  <input type="number" inputMode="numeric" min={0} value={coverPrice} onChange={e => setCoverPrice(e.target.value)} className="num" style={inp} disabled={!canWrite} />
                </div>
              ) : <div />}
              <div>
                <label style={lbl}>Asistencia esperada</label>
                <input type="number" inputMode="numeric" min={0} value={expectedAtt} onChange={e => setExpectedAtt(e.target.value)} className="num" style={inp} disabled={!canWrite} placeholder="0" />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Presupuesto costos (MXN)</label>
              <input type="number" inputMode="numeric" min={0} value={budget} onChange={e => setBudget(e.target.value)} className="num" style={inp} disabled={!canWrite} placeholder="0" />
            </div>
            <div>
              <label style={lbl}>Responsable</label>
              <select value={responsible} onChange={e => setResponsible(e.target.value)} style={{ ...inp, cursor: 'pointer' }} disabled={!canWrite}>
                <option value="">Sin responsable</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? '—'}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Requerimientos</label>
              <textarea value={requirements} onChange={e => setRequirements(e.target.value)} rows={2} disabled={!canWrite}
                placeholder="dj setup, proyector, materiales…" style={{ ...inp, minHeight: 60, padding: '10px 12px', resize: 'vertical' }} />
            </div>
            <div>
              <label style={lbl}>Colaboradores / talento</label>
              <textarea value={collaborators} onChange={e => setCollaborators(e.target.value)} rows={2} disabled={!canWrite}
                placeholder="DJs, artistas, marcas invitadas…" style={{ ...inp, minHeight: 60, padding: '10px 12px', resize: 'vertical' }} />
            </div>
          </div>

          <div>
            <label style={lbl}>Estado</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(STATUS_META) as EventStatus[]).map(s => (
                <button key={s} onClick={() => canWrite && setStatus(s)}
                  style={{ minHeight: 38, padding: '0 12px', borderRadius: 999, cursor: canWrite ? 'pointer' : 'default', fontSize: 12, fontWeight: 600, background: status === s ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${status === s ? 'var(--accent)' : 'var(--border-default)'}`, color: status === s ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Recursos y presupuesto por partidas (requieren el plan guardado) */}
          {event ? (
            <>
              <ResourcesSection eventId={event.id} canWrite={canWrite} />
              <BudgetSection event={event} buCode={buList.find(b => b.id === event.bu_id)?.code ?? ''} canWrite={canWrite} userId={userId} />
            </>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
              💡 Al guardar podrás agregar <strong>recursos</strong> (bartenders, meseros, seguridad, equipo) y el <strong>presupuesto por partidas</strong> con patrocinios ligados al CRM.
            </p>
          )}

          {/* Tareas del evento — por bullets, con botón directo al Task Manager */}
          {canWrite && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <CheckSquare size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Tareas del evento{tasks.length ? ` (${tasks.length})` : ''}</span>
              </div>
              {tasks.map(t => (
                <button key={t.id} onClick={() => onOpenTask?.(t.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left', minHeight: 40, marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', textDecoration: ['DONE', 'ARCHIVED'].includes(t.status) ? 'line-through' : 'none', opacity: ['DONE', 'ARCHIVED'].includes(t.status) ? 0.6 : 1 }}>{t.title}</span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{t.status}</span>
                </button>
              ))}
              <textarea value={bulkTasks} onChange={e => setBulkTasks(e.target.value)} rows={4}
                placeholder={'Una tarea por línea (bullets):\n- Confirmar DJ y rider\n- Diseñar flyer\n- Brief a cocina'}
                style={{ ...inp, minHeight: 88, padding: '10px 12px', resize: 'vertical', fontSize: 13, marginBottom: 8 }} />
              {event ? (
                <button onClick={() => pushBulkTasks(event.id, event.name, event.bu_id, event.date)} disabled={bulkPending === 0}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 44, borderRadius: 999, border: 'none', background: bulkPending ? 'var(--accent)' : 'var(--bg-base)', color: bulkPending ? 'var(--on-accent)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: bulkPending ? 'pointer' : 'not-allowed' }}>
                  <ListPlus size={15} /> Pasar {bulkPending || ''} tarea{bulkPending === 1 ? '' : 's'} a Tareas
                </button>
              ) : (
                bulkPending > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                    {bulkPending} tarea{bulkPending === 1 ? '' : 's'} se crearán en Tareas al guardar el evento.
                  </p>
                )
              )}
            </div>
          )}

          {canWrite && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={saving}
                style={{ flex: 1, minHeight: 48, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Guardando…' : event ? 'Guardar cambios' : 'Crear evento'}
              </button>
              {event && canDelete && (
                <button onClick={deleteEvent} title="Eliminar evento"
                  style={{ minHeight: 48, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--status-risk)', cursor: 'pointer' }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
