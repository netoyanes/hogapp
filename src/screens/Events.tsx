import { useEffect, useMemo, useState, useCallback } from 'react'
import { Plus, X, Search, Trash2, CheckSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../hooks/useActivityLog'
import { useIsMobile } from '../hooks/useIsMobile'
import { Avatar } from '../components/ui/Avatar'
import { BUChip, Sheet, StatusBadgeV2, showToast, type StatusTone } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS — planeación de eventos multi-venue (estilo Asana):
// lista agrupada por mes con descripción, fecha, tipo, cover, presupuesto y
// responsable; cada evento liga tareas de ejecución del Task Manager.
// ─────────────────────────────────────────────────────────────────────────────

type EventStatus = 'idea' | 'planning' | 'approved' | 'done' | 'cancelled'
type EventType = 'musica' | 'arte' | 'performance' | 'workshop' | 'comunidad' | 'comercial' | 'deporte' | 'privado' | 'otro'

interface EventPlan {
  id: string
  bu_id: string
  name: string
  description: string | null
  date: string | null
  start_time: string | null
  end_time: string | null
  event_type: EventType
  has_cover: boolean
  cover_price: number | null
  budget: number | null
  responsible: string | null
  status: EventStatus
}
interface TaskLite { id: string; title: string; status: string }

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

const mxn = (n: number) => `MX$${Number(n).toLocaleString('es-MX')}`

interface Props { userRole?: string; userId?: string; onOpenTask?: (id: string) => void }

export function Events({ userRole, userId, onOpenTask }: Props) {
  const isMobile = useIsMobile()
  const canWrite = ['MASTER', 'C_LEVEL', 'OPS_MANAGER', 'MARKETING', 'TEAM'].includes(userRole ?? '')
  const [rows, setRows] = useState<EventPlan[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [people, setPeople] = useState<{ id: string; full_name: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [buFilter, setBuFilter] = useState('')
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
      if (!showPast && r.date && r.date < monthStart) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
        || (r.description ?? '').toLowerCase().includes(q)
        || TYPE_META[r.event_type].label.toLowerCase().includes(q)
        || (buMap[r.bu_id] ?? '').toLowerCase().includes(q)
        || (nameOf(r.responsible) ?? '').toLowerCase().includes(q)
    })
  }, [rows, buFilter, search, showPast, monthStart, buMap, nameOf])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800, margin: 0, flex: isMobile ? '1 0 100%' : undefined }}>Eventos</h1>
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

      {/* Lista agrupada por mes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[64, 64, 64].map((h, i) => <div key={i} className="animate-pulse-green" style={{ height: h, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }} />)}
          </div>
        ) : groups.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
            {rows.length === 0 ? 'Sin eventos todavía — crea el primero con “+ Evento”.' : 'Sin resultados con estos filtros.'}
          </p>
        ) : groups.map(g => (
          <div key={g.key} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', margin: '0 0 8px' }}>
              {g.label} <span style={{ fontWeight: 400 }}>· {g.items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.items.map(ev => {
                const t = TYPE_META[ev.event_type]
                const st = STATUS_META[ev.status]
                const respName = nameOf(ev.responsible)
                const d = ev.date ? new Date(ev.date + 'T00:00:00') : null
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
                        <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color: t.color, background: `color-mix(in srgb, ${t.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 40%, transparent)`, borderRadius: 4, padding: '1px 6px' }}>{t.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {ev.start_time && <span className="num">{ev.start_time}{ev.end_time ? `–${ev.end_time}` : ''}</span>}
                        <span>{ev.has_cover ? `Cover ${ev.cover_price != null ? mxn(ev.cover_price) : ''}` : 'Sin cover'}</span>
                        {ev.budget != null && <span>Presupuesto {mxn(ev.budget)}</span>}
                        {respName && <span>· {respName}</span>}
                      </div>
                    </div>
                    {!isMobile && respName && <Avatar name={respName} size={26} />}
                    <StatusBadgeV2 tone={st.tone} label={st.label} />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
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

// ── Sheet de crear/editar evento + tareas ligadas ────────────────────────────
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
  const [date, setDate] = useState(event?.date ?? '')
  const [startTime, setStartTime] = useState(event?.start_time ?? '')
  const [endTime, setEndTime] = useState(event?.end_time ?? '')
  const [type, setType] = useState<EventType>(event?.event_type ?? 'musica')
  const [description, setDescription] = useState(event?.description ?? '')
  const [hasCover, setHasCover] = useState(event?.has_cover ?? false)
  const [coverPrice, setCoverPrice] = useState(event?.cover_price != null ? String(event.cover_price) : '')
  const [budget, setBudget] = useState(event?.budget != null ? String(event.budget) : '')
  const [responsible, setResponsible] = useState(event?.responsible ?? '')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'idea')
  const [saving, setSaving] = useState(false)
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [newTask, setNewTask] = useState('')
  const canDelete = ['MASTER', 'OPS_MANAGER'].includes(userRole ?? '')

  useEffect(() => {
    if (!event) return
    supabase.from('tasks').select('id, title, status').eq('event_id', event.id).order('created_at')
      .then(({ data }) => setTasks((data ?? []) as TaskLite[]))
  }, [event])

  async function save() {
    if (!name.trim() || !buId) { showToast('Ponle nombre y venue al evento.', 'error'); return }
    setSaving(true)
    const row = {
      bu_id: buId, name: name.trim(), description: description.trim() || null,
      date: date || null, start_time: startTime || null, end_time: endTime || null,
      event_type: type, has_cover: hasCover,
      cover_price: hasCover && coverPrice !== '' ? Number(coverPrice) : null,
      budget: budget !== '' ? Number(budget) : null,
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
    }
    showToast(event ? 'Evento guardado.' : 'Evento creado.', 'success')
    onSaved()
  }

  async function deleteEvent() {
    if (!event) return
    if (!window.confirm(`¿Eliminar "${event.name}"? Las tareas ligadas NO se borran, solo se desligan.`)) return
    await supabase.from('event_plans').delete().eq('id', event.id)
    logActivity('event_deleted', 'event', event.id, { name: event.name })
    onSaved()
  }

  // Tarea rápida ligada al evento: cae al Task Manager con venue y fecha límite
  async function addTask() {
    if (!event || !newTask.trim()) return
    const { data, error } = await supabase.from('tasks').insert({
      title: newTask.trim(), status: 'OPEN', priority: 'MEDIUM', deadline_type: 'SOFT',
      bu_id: event.bu_id, due_date: event.date, event_id: event.id, created_by: userId ?? null,
    }).select('id, title, status').single()
    if (error || !data) { showToast(`No se pudo crear la tarea: ${error?.message}`, 'error'); return }
    logActivity('task_created', 'task', data.id, { title: newTask.trim(), via: 'event', event: event.name })
    setTasks(prev => [...prev, data as TaskLite])
    setNewTask('')
  }

  const inp: React.CSSProperties = {
    width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={480}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>{event ? 'Evento' : 'Nuevo evento'}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Colombian Night, Art Talk…" style={inp} disabled={!canWrite} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Venue *</label>
              <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inp, cursor: 'pointer' }} disabled={!canWrite}>
                {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value as EventType)} style={{ ...inp, cursor: 'pointer' }} disabled={!canWrite}>
                {(Object.keys(TYPE_META) as EventType[]).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Fecha</label>
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
            <label style={lbl}>Descripción</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} disabled={!canWrite}
              placeholder="Concepto, line-up, requerimientos…" style={{ ...inp, minHeight: 72, padding: '10px 12px', resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={hasCover} onChange={e => setHasCover(e.target.checked)} disabled={!canWrite} style={{ accentColor: 'var(--accent)', width: 18, height: 18 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Tiene cover</span>
            </label>
            {hasCover && (
              <div>
                <label style={lbl}>Precio cover (MXN)</label>
                <input type="number" inputMode="numeric" min={0} value={coverPrice} onChange={e => setCoverPrice(e.target.value)} className="num" style={inp} disabled={!canWrite} />
              </div>
            )}
          </div>

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

          {/* Tareas del evento — la planeación baja al Task Manager */}
          {event && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <CheckSquare size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Tareas del evento ({tasks.length})</span>
              </div>
              {tasks.map(t => (
                <button key={t.id} onClick={() => onOpenTask?.(t.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left', minHeight: 40, marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', textDecoration: ['DONE', 'ARCHIVED'].includes(t.status) ? 'line-through' : 'none', opacity: ['DONE', 'ARCHIVED'].includes(t.status) ? 0.6 : 1 }}>{t.title}</span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{t.status}</span>
                </button>
              ))}
              {canWrite && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Nueva tarea del evento…"
                    onKeyDown={e => { if (e.key === 'Enter') addTask() }}
                    style={{ ...inp, minHeight: 40, flex: 1 }} />
                  <button onClick={addTask} disabled={!newTask.trim()}
                    style={{ minHeight: 40, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: newTask.trim() ? 'var(--accent)' : 'var(--bg-base)', color: newTask.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', cursor: newTask.trim() ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
                    <Plus size={14} />
                  </button>
                </div>
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
