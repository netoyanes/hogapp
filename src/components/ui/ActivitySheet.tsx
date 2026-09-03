// ─────────────────────────────────────────────────────────────────────────────
// SUBVENTANA DE ACTIVIDAD — se apila sobre la ventana del proyecto.
//
// Una actividad es algo que OCURRE en fecha y hora dentro de un proyecto (el
// taller de ostiones del sábado). Aquí vive todo lo suyo para documentar y
// planear: el detalle editable, sus tareas de preparación, sus gastos y sus
// adjuntos. Las tareas se abren encima (tercera capa) con el mismo mecanismo.
//
// ProjectFiles se exporta aparte: la ventana del proyecto lo usa para los
// documentos del proyecto entero (activity_id null).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, CalendarDays, CheckSquare, Banknote, Paperclip, Plus, Trash2, Upload, ExternalLink, Archive, MapPin, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../hooks/useActivityLog'
import { Sheet, showToast } from '../v2'
import { StatusRing, BlockedChip, DeadlineChip } from './ProjectChip'
import { FeedbackButton } from './FeedbackButton'
import { ACTIVITY_COLOR, CATEGORIAS } from '../../lib/projectKinds'
import { hoyISO, esBloqueada, UMBRALES } from '../../lib/projectHealth'

interface Act {
  id: string; event_id: string; title: string; date: string; start_time: string | null; end_time: string | null
  description: string | null; location: string | null; facilitator: string | null; responsible: string | null
  capacity: number | null; cost: number | null; status: string
}
interface T { id: string; title: string; status: string; due_date: string | null; assigned_to: string | null; deadline_type: string | null; blocked_reason?: string | null }
interface Gasto { id: string; concept: string; amount: number; qty: number; unit_cost: number | null; category: string; is_income: boolean; actual_amount: number | null }
interface Archivo { id: string; name: string; url: string; file_type: string | null; size_bytes: number | null; note: string | null; uploaded_by: string | null; created_at: string; archived: boolean }

const ACT_STATUS: Record<string, { label: string; color: string }> = {
  planeada:   { label: 'Planeada',   color: 'var(--text-tertiary)' },
  confirmada: { label: 'Confirmada', color: 'var(--accent)' },
  hecha:      { label: 'Hecha',      color: 'var(--status-healthy)' },
  cancelada:  { label: 'Cancelada',  color: 'var(--status-risk)' },
}
const mxn = (n: number) => `MX$${Number(n).toLocaleString('es-MX')}`
const initials = (n: string | null | undefined) => (n ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?'
const fmtDia = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })

const inp: React.CSSProperties = {
  width: '100%', minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const secHead = (icon: React.ReactNode, title: string, right?: React.ReactNode) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
    {icon}
    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flex: 1 }}>{title}</span>
    {right}
  </div>
)
const caja: React.CSSProperties = { background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }

export function ActivitySheet({ activityId, eventId, eventName, buId, canWrite, userId, people, isMobile, onOpenTask, onClose, onChanged }: {
  activityId: string
  eventId: string
  eventName: string
  buId: string
  canWrite: boolean
  userId?: string
  people: { id: string; full_name: string | null }[]
  isMobile: boolean
  onOpenTask?: (id: string) => void
  onClose: () => void
  onChanged?: () => void
}) {
  const [act, setAct] = useState<Act | null>(null)
  const [form, setForm] = useState<Partial<Act>>({})
  const [saving, setSaving] = useState(false)
  const [tasks, setTasks] = useState<T[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [gastosOk, setGastosOk] = useState(true)
  const [nt, setNt] = useState('')
  const [ng, setNg] = useState({ concept: '', qty: '1', unit: '', cat: 'materiales' })
  const hoy = hoyISO()

  const load = useCallback(async () => {
    const [{ data: a }, { data: t }, g] = await Promise.all([
      supabase.from('project_activities').select('*').eq('id', activityId).maybeSingle(),
      supabase.from('tasks').select('*').eq('activity_id', activityId).eq('archived', false).order('due_date', { nullsFirst: false }),
      supabase.from('project_budget_items').select('id, concept, amount, qty, unit_cost, category, is_income, actual_amount').eq('activity_id', activityId).order('created_at'),
    ])
    if (a) { setAct(a as Act); setForm(a as Act) }
    setTasks((t ?? []) as T[])
    if (g.error) setGastosOk(false); else { setGastosOk(true); setGastos((g.data ?? []) as Gasto[]) }
  }, [activityId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('hog:task-updated', load)
    return () => window.removeEventListener('hog:task-updated', load)
  }, [load])

  const set = <K extends keyof Act>(k: K, v: Act[K]) => setForm(f => ({ ...f, [k]: v }))

  async function guardar() {
    if (!act || !form.title?.trim() || !form.date) { showToast('La actividad necesita título y día.', 'error'); return }
    setSaving(true)
    const row = {
      title: form.title.trim(), date: form.date, start_time: form.start_time || null, end_time: form.end_time || null,
      description: form.description?.trim() || null, location: form.location?.trim() || null, facilitator: form.facilitator?.trim() || null,
      responsible: form.responsible || null, capacity: form.capacity != null && String(form.capacity) !== '' ? Number(form.capacity) : null,
      cost: form.cost != null && String(form.cost) !== '' ? Number(form.cost) : null, status: form.status ?? act.status,
    }
    const { data, error } = await supabase.from('project_activities').update(row).eq('id', act.id).select('id').maybeSingle()
    setSaving(false)
    if (error || !data) { showToast(`No se pudo guardar: ${error?.message ?? 'sin permiso'}`, 'error'); return }
    setAct({ ...act, ...row })
    logActivity('activity_updated', 'event', eventId, { actividad: row.title, event: eventName })
    showToast('Actividad guardada.', 'success')
    onChanged?.()
  }

  async function addTask() {
    if (!act || !nt.trim()) return
    const { error } = await supabase.from('tasks').insert({
      title: nt.trim(), event_id: eventId, activity_id: act.id, status: 'OPEN', priority: 'MEDIUM',
      due_date: act.date, deadline_type: 'HARD', client_impact: 'internal', proof_required: false,
      bu_id: buId, created_by: userId ?? null,
    })
    if (error) { showToast(`No se pudo crear: ${error.message}`, 'error'); return }
    setNt('')
    logActivity('task_created', 'event', eventId, { via: 'actividad', actividad: act.title, title: nt.trim() })
    await load()
    window.dispatchEvent(new CustomEvent('hog:task-updated'))
  }

  async function addGasto() {
    if (!act || !ng.concept.trim() || ng.unit === '') return
    const qty = Math.max(1, Number(ng.qty) || 1)
    const unit = Number(ng.unit)
    const { error } = await supabase.from('project_budget_items').insert({
      event_id: eventId, activity_id: act.id, concept: ng.concept.trim(), amount: unit * qty, qty, unit_cost: unit,
      category: ng.cat, is_income: false, created_by: userId ?? null,
    })
    if (error) { showToast(/activity_id/.test(error.message) ? 'Falta correr project_manager_v2.sql para ligar gastos a la actividad.' : `No se pudo agregar: ${error.message}`, 'error'); return }
    setNg({ concept: '', qty: '1', unit: '', cat: ng.cat })
    load()
    onChanged?.()
  }
  async function quitarGasto(id: string) {
    await supabase.from('project_budget_items').delete().eq('id', id)
    setGastos(g => g.filter(x => x.id !== id))
    onChanged?.()
  }

  const totalGastos = gastos.reduce((s, g) => s + g.amount, 0)
  const abiertas = tasks.filter(t => t.status !== 'APPROVED').length
  const dias = act ? Math.round((new Date(act.date + 'T00:00:00').getTime() - new Date(hoy + 'T00:00:00').getTime()) / 86400000) : null
  const caliente = dias != null && abiertas > 0 && dias >= 0 && dias <= UMBRALES.zonaCaliente && act?.status !== 'cancelada' && act?.status !== 'hecha'
  const st = ACT_STATUS[form.status ?? act?.status ?? 'planeada'] ?? ACT_STATUS.planeada

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={640} tall feedback={false}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Cabecera fija */}
        <div style={{ flexShrink: 0, padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 3, height: 22, borderRadius: 2, background: caliente ? 'var(--status-risk)' : ACTIVITY_COLOR, flexShrink: 0 }} />
            <CalendarDays size={14} style={{ color: caliente ? 'var(--status-risk)' : ACTIVITY_COLOR, flexShrink: 0 }} />
            <h2 style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 800, margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {act?.title ?? 'Actividad'}
            </h2>
            <FeedbackButton variant="inline" context={`Actividad: ${act?.title ?? ''} · ${eventName}`} />
            <button onClick={onClose} aria-label="Cerrar" style={{ width: 34, height: 34, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}><X size={16} /></button>
          </div>
          {act && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{eventName}</span>
              <span className="num" style={{ fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {fmtDia(act.date)}{act.start_time ? ` · ${act.start_time.slice(0, 5)}${act.end_time ? `–${act.end_time.slice(0, 5)}` : ''}` : ''}
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: st.color, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{st.label}</span>
              {dias != null && act.status !== 'hecha' && act.status !== 'cancelada' && (
                <span className="num" style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: caliente ? 'var(--status-risk)' : dias < 0 ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                  {dias >= 0 ? `D-${dias}` : `D+${-dias}`}
                </span>
              )}
              {caliente && <span className="num" style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--status-risk)', background: 'color-mix(in srgb, var(--status-risk) 14%, transparent)', padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>{abiertas} {abiertas === 1 ? 'tarea abierta' : 'tareas abiertas'}</span>}
              {totalGastos > 0 && <span className="num" style={{ marginLeft: 'auto', fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{mxn(totalGastos)}</span>}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 'var(--space-3)' }}>
            {/* ── Detalle ── */}
            <div style={caja}>
              {secHead(<CalendarDays size={13} style={{ color: ACTIVITY_COLOR }} />, 'Detalle')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={form.title ?? ''} onChange={e => set('title', e.target.value)} placeholder="Actividad" disabled={!canWrite} style={{ ...inp, fontWeight: 700 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 6 }}>
                  <div><label style={lbl}>Día</label><input type="date" value={form.date ?? ''} onChange={e => set('date', e.target.value)} className="num" disabled={!canWrite} style={inp} /></div>
                  <div><label style={lbl}>Inicio</label><input type="time" value={form.start_time ?? ''} onChange={e => set('start_time', e.target.value)} className="num" disabled={!canWrite} style={inp} /></div>
                  <div><label style={lbl}>Fin</label><input type="time" value={form.end_time ?? ''} onChange={e => set('end_time', e.target.value)} className="num" disabled={!canWrite} style={inp} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div><label style={lbl}><MapPin size={9} /> Lugar</label><input value={form.location ?? ''} onChange={e => set('location', e.target.value)} placeholder="Rooftop, terraza, sala…" disabled={!canWrite} style={inp} /></div>
                  <div><label style={lbl}>Quién la imparte</label><input value={form.facilitator ?? ''} onChange={e => set('facilitator', e.target.value)} placeholder="Chef, DJ, tallerista…" disabled={!canWrite} style={inp} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 6 }}>
                  <div>
                    <label style={lbl}><User size={9} /> Responsable</label>
                    <select value={form.responsible ?? ''} onChange={e => set('responsible', e.target.value || null)} disabled={!canWrite} style={{ ...inp, cursor: 'pointer' }}>
                      <option value="">Sin responsable</option>
                      {people.filter(p => (p.full_name ?? '').trim()).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Cupo</label><input type="number" inputMode="numeric" min={0} value={form.capacity ?? ''} onChange={e => set('capacity', e.target.value === '' ? null : Number(e.target.value))} className="num" disabled={!canWrite} style={inp} placeholder="—" /></div>
                  <div><label style={lbl}>Costo est.</label><input type="number" inputMode="numeric" min={0} value={form.cost ?? ''} onChange={e => set('cost', e.target.value === '' ? null : Number(e.target.value))} className="num" disabled={!canWrite} style={inp} placeholder="0" title="Costo estimado si aún no hay partidas" /></div>
                  <div>
                    <label style={lbl}>Estado</label>
                    <select value={form.status ?? act?.status ?? 'planeada'} onChange={e => set('status', e.target.value)} disabled={!canWrite} style={{ ...inp, cursor: 'pointer', color: st.color, fontWeight: 700 }}>
                      {Object.entries(ACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)} rows={3} disabled={!canWrite}
                  placeholder="Qué pasa, cómo se arma, qué hay que tener listo…" style={{ ...inp, minHeight: 70, padding: '9px 10px', resize: 'vertical' }} />
                {canWrite && (
                  <button onClick={guardar} disabled={saving}
                    style={{ minHeight: 40, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {saving ? 'Guardando…' : 'Guardar actividad'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Tareas de preparación ── */}
            <div style={caja}>
              {secHead(<CheckSquare size={13} style={{ color: 'var(--accent)' }} />, `Tareas de preparación${tasks.length ? ` · ${tasks.length - abiertas}/${tasks.length}` : ''}`)}
              {tasks.map(t => {
                const done = t.status === 'APPROVED'
                const bloq = esBloqueada(t)
                const asig = t.assigned_to ? people.find(p => p.id === t.assigned_to)?.full_name ?? null : null
                const vencida = !done && !!t.due_date && t.due_date < hoy
                return (
                  <div key={t.id} role="button" tabIndex={0} onClick={() => onOpenTask?.(t.id)} onKeyDown={e => { if (e.key === 'Enter') onOpenTask?.(t.id) }}
                    style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 9, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', minHeight: 40, cursor: 'pointer' }}>
                    <StatusRing status={t.status} blocked={bloq} />
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: done ? 500 : 600, color: done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>{t.title}</span>
                      {!done && t.deadline_type === 'HARD' && <DeadlineChip type="HARD" />}
                      {bloq && <BlockedChip reason={t.blocked_reason!} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.due_date && <span className="num" style={{ fontSize: 10.5, fontWeight: vencida ? 800 : 500, color: vencida ? 'var(--status-risk)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{new Date(t.due_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>}
                      {asig
                        ? <span title={asig} style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-overlay)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 8.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)' }}>{initials(asig)}</span>
                        : <span title="Sin responsable" style={{ width: 20, height: 20, borderRadius: '50%', border: `1px dashed ${done ? 'var(--border-strong)' : 'var(--status-risk)'}`, color: done ? 'var(--text-tertiary)' : 'var(--status-risk)', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)' }}>?</span>}
                    </div>
                  </div>
                )
              })}
              {tasks.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '0 0 6px' }}>Sin tareas de preparación. Nacen HARD con la fecha de la actividad: si se pasan, atoran el proyecto.</p>}
              {canWrite && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input value={nt} onChange={e => setNt(e.target.value)} placeholder={`Nueva tarea para ${act?.title ?? 'la actividad'}…`}
                    onKeyDown={e => { if (e.key === 'Enter') addTask() }} style={inp} />
                  <button onClick={addTask} disabled={!nt.trim()} style={{ minHeight: 40, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: nt.trim() ? 'var(--accent)' : 'var(--bg-base)', color: nt.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', fontWeight: 700, fontSize: 12, cursor: nt.trim() ? 'pointer' : 'not-allowed' }}>Agregar</button>
                </div>
              )}
            </div>

            {/* ── Gastos ligados ── */}
            <div style={caja}>
              {secHead(<Banknote size={13} style={{ color: 'var(--status-healthy)' }} />, 'Gastos de esta actividad',
                totalGastos > 0 ? <span className="num" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{mxn(totalGastos)}</span> : undefined)}
              {!gastosOk ? (
                <p style={{ fontSize: 12, color: 'var(--status-attention)', margin: 0 }}>Falta correr project_manager_v2.sql en Supabase para ligar gastos a la actividad.</p>
              ) : (
                <>
                  {gastos.map(g => {
                    const cat = CATEGORIAS.find(c => c.id === g.category)
                    return (
                      <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat?.color ?? 'var(--text-tertiary)', flexShrink: 0 }} title={cat?.label} />
                        {g.qty > 1 && <span className="num" style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{g.qty}×</span>}
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', minWidth: 0 }}>{g.concept}</span>
                        <span className="num" style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{mxn(g.amount)}</span>
                        {canWrite && <button onClick={() => quitarGasto(g.id)} aria-label="Quitar" style={{ width: 28, height: 28, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><Trash2 size={12} /></button>}
                      </div>
                    )
                  })}
                  {gastos.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '0 0 6px' }}>Sin partidas ligadas. Lo que agregues aquí también aparece en el presupuesto del proyecto, marcado con esta actividad.</p>}
                  {canWrite && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <input type="number" inputMode="numeric" min={1} value={ng.qty} onChange={e => setNg({ ...ng, qty: e.target.value })} className="num" style={{ ...inp, width: 52, textAlign: 'center' }} aria-label="Cantidad" />
                      <input value={ng.concept} onChange={e => setNg({ ...ng, concept: e.target.value })} placeholder="Mesas, ostiones, tallerista…" onKeyDown={e => { if (e.key === 'Enter') addGasto() }} style={{ ...inp, flex: 1, minWidth: 140 }} />
                      <select value={ng.cat} onChange={e => setNg({ ...ng, cat: e.target.value })} style={{ ...inp, width: 112, cursor: 'pointer' }} title="Tipo de gasto">
                        {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <input type="number" inputMode="numeric" min={0} value={ng.unit} onChange={e => setNg({ ...ng, unit: e.target.value })} placeholder="$ c/u" className="num" style={{ ...inp, width: 84 }} />
                      <button onClick={addGasto} disabled={!ng.concept.trim() || ng.unit === ''} aria-label="Agregar gasto"
                        style={{ minHeight: 40, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: ng.concept.trim() && ng.unit !== '' ? 'var(--accent)' : 'var(--bg-base)', color: ng.concept.trim() && ng.unit !== '' ? 'var(--on-accent)' : 'var(--text-tertiary)', cursor: 'pointer' }}><Plus size={14} /></button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Adjuntos ── */}
            <ProjectFiles eventId={eventId} activityId={activityId} canWrite={canWrite} userId={userId} people={people} />
          </div>
        </div>
      </div>
    </Sheet>
  )
}

// ── Documentos del proyecto o de una actividad ───────────────────────────────
// Planos, renders, contratos, fotos. Van al bucket 'proofs' (el mismo de las
// cotizaciones) bajo proyectos/<event>/ y se registran en project_files.
export function ProjectFiles({ eventId, activityId = null, canWrite, userId, people, title }: {
  eventId: string
  activityId?: string | null
  canWrite: boolean
  userId?: string
  people: { id: string; full_name: string | null }[]
  title?: string
}) {
  const [files, setFiles] = useState<Archivo[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [link, setLink] = useState('')
  const [drag, setDrag] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    let q = supabase.from('project_files').select('*').eq('event_id', eventId).eq('archived', false).order('created_at', { ascending: false })
    q = activityId ? q.eq('activity_id', activityId) : q.is('activity_id', null)
    const { data, error } = await q
    if (error) { setTableMissing(true); return }
    setTableMissing(false); setFiles((data ?? []) as Archivo[])
  }, [eventId, activityId])
  useEffect(() => { load() }, [load])

  async function registrar(row: { name: string; url: string; file_type: string | null; size_bytes: number | null }) {
    const { error } = await supabase.from('project_files').insert({ ...row, event_id: eventId, activity_id: activityId, uploaded_by: userId ?? null })
    if (error) { showToast(`No se pudo registrar: ${error.message}`, 'error'); return }
    logActivity('project_file_added', 'event', eventId, { name: row.name, actividad: activityId })
    load()
  }
  async function subir(list: FileList | File[]) {
    const arr = Array.from(list)
    if (!arr.length) return
    setSubiendo(true)
    for (const f of arr) {
      if (f.size > 25 * 1024 * 1024) { showToast(`${f.name}: más de 25 MB — súbelo a Drive y pega el link.`, 'error'); continue }
      const ext = f.name.split('.').pop()
      const path = `proyectos/${eventId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('proofs').upload(path, f, { contentType: f.type || 'application/octet-stream' })
      if (error) { showToast(`No se pudo subir ${f.name}: ${error.message}`, 'error'); continue }
      const { data: pub } = supabase.storage.from('proofs').getPublicUrl(path)
      await registrar({ name: f.name, url: pub.publicUrl, file_type: f.type || null, size_bytes: f.size })
    }
    setSubiendo(false)
  }
  async function pegarLink() {
    const u = link.trim()
    if (!/^https?:\/\//i.test(u)) { showToast('Pega un link completo (https://…).', 'error'); return }
    let name = u
    try { name = decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || new URL(u).hostname) } catch { /* se queda el url */ }
    await registrar({ name, url: u, file_type: 'link', size_bytes: null })
    setLink('')
  }
  async function archivar(id: string) {
    await supabase.from('project_files').update({ archived: true }).eq('id', id)
    setFiles(f => f.filter(x => x.id !== id))
  }

  const kb = (n: number | null) => n == null ? '' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
  const esImagen = (f: Archivo) => (f.file_type ?? '').startsWith('image/')
  const quien = (id: string | null) => id ? people.find(p => p.id === id)?.full_name?.split(' ')[0] ?? null : null

  return (
    <div style={caja}>
      {secHead(<Paperclip size={13} style={{ color: 'var(--accent)' }} />, `${title ?? (activityId ? 'Adjuntos de la actividad' : 'Documentos del proyecto')}${files.length ? ` · ${files.length}` : ''}`)}
      {tableMissing ? (
        <p style={{ fontSize: 12, color: 'var(--status-attention)', margin: 0 }}>Falta correr project_manager_v2.sql en Supabase para guardar documentos.</p>
      ) : (
        <>
          {files.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 8 }}>
              {files.map(f => (
                <div key={f.id} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <a href={f.url} target="_blank" rel="noreferrer" title={f.name} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                    {esImagen(f) ? (
                      <img src={f.url} alt={f.name} style={{ width: '100%', height: 84, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', gap: 6, fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                        {f.file_type === 'link' ? <ExternalLink size={14} /> : <Paperclip size={14} />}
                        {f.file_type === 'link' ? 'link' : (f.name.split('.').pop() ?? 'archivo').slice(0, 5)}
                      </div>
                    )}
                    <div style={{ padding: '6px 8px 2px' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(f.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}{quien(f.uploaded_by) ? ` · ${quien(f.uploaded_by)}` : ''}{f.size_bytes ? ` · ${kb(f.size_bytes)}` : ''}
                      </div>
                    </div>
                  </a>
                  {canWrite && (
                    <button onClick={() => archivar(f.id)} title="Quitar (se archiva, no se borra)" style={{ alignSelf: 'flex-end', border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px 6px 4px' }}><Archive size={11} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canWrite && (
            <>
              <input ref={ref} type="file" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) subir(e.target.files); e.target.value = '' }} />
              <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); subir(e.dataTransfer.files) }}
                onClick={() => ref.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') ref.current?.click() }}
                style={{ border: `1px dashed ${drag ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 'var(--radius-sm)', padding: '12px', textAlign: 'center', fontSize: 12, color: drag ? 'var(--accent)' : 'var(--text-tertiary)', cursor: 'pointer', background: drag ? 'var(--accent-bg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
                <Upload size={13} /> {subiendo ? 'Subiendo…' : 'Arrastra archivos o toca para elegir — planos, renders, contratos, fotos'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input value={link} onChange={e => setLink(e.target.value)} placeholder="…o pega un link (Drive, Figma, Canva)" onKeyDown={e => { if (e.key === 'Enter') pegarLink() }} style={{ ...inp, minHeight: 36, fontSize: 12 }} />
                <button onClick={pegarLink} disabled={!link.trim()} style={{ minHeight: 36, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', background: 'none', color: link.trim() ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: 12, fontWeight: 700, cursor: link.trim() ? 'pointer' : 'not-allowed' }}>Agregar</button>
              </div>
            </>
          )}
          {files.length === 0 && !canWrite && <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: 0 }}>Sin documentos.</p>}
        </>
      )}
    </div>
  )
}
