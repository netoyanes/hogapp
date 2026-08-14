import { Fragment, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Plus, X, Search, CheckSquare, ListPlus, ChevronLeft, ChevronRight, ClipboardList, Save, Clock, CalendarDays, UserPlus, MessageCircle, Trash2, Copy, Archive, ArchiveRestore, Pencil, Link2, Unlink, Paperclip, Settings, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../hooks/useActivityLog'
import { notifySlack, notifyUserDM } from '../hooks/useSlack'
import { useIsMobile } from '../hooks/useIsMobile'
import { EntityChat } from '../components/ui/EntityChat'
import { useContextMenu, type CtxItem } from '../components/ui/ContextMenu'
import { phaseOf, FunnelBar, PhaseLegend } from '../components/ui/TaskPhase'
import { BUChip, Sheet, StatusBadgeV2, showToast, type StatusTone } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS — planeación de eventos multi-venue (estilo Asana):
// en escritorio es una TABLA agrupada por mes con sumas (presupuesto y
// asistencia); en teléfono, tarjetas. Cada evento captura descripción, fecha,
// tipo, cover, presupuesto, asistencia esperada, requerimientos, colaboradores
// y responsable — y sus tareas de ejecución se escriben por bullets y se pasan
// al Task Manager con un botón.
// ─────────────────────────────────────────────────────────────────────────────

type EventStatus = 'idea' | 'planning' | 'review' | 'approved' | 'done' | 'cancelled'
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
  actual_attendance: number | null
  requirements: string | null
  collaborators: string | null
  responsible: string | null
  status: EventStatus
  requisition_task_id: string | null
  archived?: boolean | null
}
interface TaskLite {
  id: string; title: string; status: string
  assigned_to?: string | null; due_date?: string | null; estimated_hours?: number | null
}
interface PlanTask { id: string; title: string; status: string; due_date: string | null; assigned_to?: string | null }
interface BudgetItem {
  id: string; concept: string; amount: number; actual_amount: number | null
  is_income: boolean; deal_id: string | null
  category: string; area: string | null; qty: number; unit_cost: number | null
  quote_url: string | null; quote_type: string | null; responsible: string | null
}
// Tipo de gasto — permite leer el presupuesto por naturaleza (cuánto es gente,
// cuánto es mobiliario) y no solo como una lista plana de conceptos.
const CATEGORIAS: { id: string; label: string; color: string }[] = [
  { id: 'personal',   label: 'Personal',    color: '#A855F7' },
  { id: 'mobiliario', label: 'Mobiliario',  color: '#E8A33D' },
  { id: 'materiales', label: 'Materiales',  color: '#06B6D4' },
  { id: 'equipo',     label: 'Equipo',      color: '#3B82F6' },
  { id: 'servicios',  label: 'Servicios',   color: '#5FBF7A' },
  { id: 'marketing',  label: 'Marketing',   color: '#EC4899' },
  { id: 'operacion',  label: 'Operación',   color: '#F97316' },
  { id: 'otro',       label: 'Otro',        color: '#8A8A8A' },
]
interface Approval { id: string; action: 'submitted' | 'approved' | 'returned'; comment: string | null; actor: string | null; created_at: string }
interface Template {
  id: string; name: string; kind: PlanKind; event_type: EventType
  resources: { name: string; qty: number; unit_cost: number | null }[]
  budget_items: { concept: string; amount: number; is_income: boolean }[]
  task_bullets: string | null
}

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
  review:    { label: 'En aprobación',  tone: 'attention' },
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

// Archivar el proyecto arrastra sus tareas: dejarlas sueltas las convertía en
// pendientes fantasma en el board y en Mi Resumen de quien las tuviera.
// Se marca cuáles se archivaron POR el proyecto (archived_with_event) para que
// al restaurar no revivan las que ya estaban archivadas por su cuenta.
// Se usa desde los dos lados: el clic derecho en la lista y el botón dentro de
// la ventana del proyecto.
async function archivarPlanConTareas(eventId: string, arch: boolean): Promise<{ error?: string; tareasError?: string; nTareas: number }> {
  const { error } = await supabase.from('event_plans').update({ archived: arch }).eq('id', eventId)
  if (error) return { error: error.message, nTareas: 0 }

  const q = arch
    ? supabase.from('tasks').update({ archived: true, archived_with_event: eventId }).eq('event_id', eventId).eq('archived', false)
    : supabase.from('tasks').update({ archived: false, archived_with_event: null }).eq('archived_with_event', eventId)
  const { data, error: tErr } = await q.select('id')
  if (tErr) return { tareasError: tErr.message, nTareas: 0 }
  return { nTareas: data?.length ?? 0 }
}
// "Archivado con 5 tareas" — el conteo importa: dice cuánto trabajo se llevó
const sufijoTareas = (n: number) => n > 0 ? ` con ${n} ${n === 1 ? 'tarea' : 'tareas'}` : ''

// ── Pills compartidas por las vistas Tabla / Board / Calendario ──────────────
const typePill = (t: EventType) => (
  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: TYPE_META[t].color, background: `color-mix(in srgb, ${TYPE_META[t].color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${TYPE_META[t].color} 40%, transparent)`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>{TYPE_META[t].label}</span>
)
const planPill = (ev: EventPlan) => ev.kind === 'evento'
  ? typePill(ev.event_type)
  : <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: KIND_META[ev.kind].color, background: `color-mix(in srgb, ${KIND_META[ev.kind].color} 14%, transparent)`, border: `1px solid ${KIND_META[ev.kind].color}`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>{KIND_META[ev.kind].label}</span>
const planColor = (ev: EventPlan) => ev.kind === 'evento' ? TYPE_META[ev.event_type].color : KIND_META[ev.kind].color
const dayChip = (d: Date) => (
  <span style={{ fontSize: 10, fontWeight: 700, color: '#0d0d0d', background: DAY_COLORS[d.getDay()], borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>{DAYS_ES[d.getDay()]}</span>
)
// Iniciales para los círculos de asignado/relacionados en la lista de tareas
const initialsOf = (name: string | null | undefined) =>
  (name ?? '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

const fechaLabel = (ev: EventPlan) => {
  if (!ev.date) return '—'
  const f = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  return ev.end_date && ev.end_date !== ev.date ? `${f(ev.date)} – ${f(ev.end_date)}` : f(ev.date)
}

interface Props { userRole?: string; userId?: string; caps?: Set<string>; onOpenTask?: (id: string) => void }

export function Events({ userRole, userId, caps, onOpenTask }: Props) {
  const isMobile = useIsMobile()
  const canWrite = ['MASTER', 'C_LEVEL', 'OPS_MANAGER', 'MARKETING', 'TEAM'].includes(userRole ?? '')
  // Aprobador (Gerente de Eficiencia): función 'aprobador' en Usuarios, o Master
  const canApprove = userRole === 'MASTER' || (caps?.has('aprobador') ?? false)
  const [rows, setRows] = useState<EventPlan[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [people, setPeople] = useState<{ id: string; full_name: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [buFilter, setBuFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'eventos' | 'proyectos'>('all')
  const [search, setSearch] = useState('')
  const [showPast, setShowPast] = useState(false)
  // Nada se elimina: se archiva. Este toggle muestra SOLO lo archivado.
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<EventPlan | null>(null)
  const [creating, setCreating] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  // Vistas del planeador: tabla, board, timeline, calendario y (aprobadores) su cabina
  const [view, setView] = useState<'table' | 'board' | 'timeline' | 'calendar' | 'approvals'>(() =>
    (localStorage.getItem('hog_projects_view') as 'table' | 'board' | 'timeline' | 'calendar' | 'approvals') || 'table')
  useEffect(() => { localStorage.setItem('hog_projects_view', view) }, [view])
  const [templates, setTemplates] = useState<Template[]>([])
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // Avance por plan: tareas ligadas hechas / totales
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({})
  // Tareas por plan (título + fecha límite) — hitos sobre la barra del Timeline
  const [planTasks, setPlanTasks] = useState<Record<string, PlanTask[]>>({})

  const load = useCallback(async () => {
    const [{ data: ev }, { data: bus }, { data: ppl }, { data: tk }, { data: tpl }] = await Promise.all([
      supabase.from('event_plans').select('*').order('date', { ascending: true, nullsFirst: false }),
      supabase.from('business_units').select('id, code, name').order('name'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('tasks').select('id, event_id, status, title, due_date, assigned_to').not('event_id', 'is', null),
      supabase.from('project_templates').select('*').order('name'),
    ])
    setTemplates((tpl ?? []) as Template[])
    setRows((ev ?? []) as EventPlan[])
    setBuList(bus ?? [])
    setPeople(ppl ?? [])
    const pm: Record<string, { done: number; total: number }> = {}
    const tm: Record<string, PlanTask[]> = {}
    for (const t of (tk ?? []) as ({ event_id: string } & PlanTask)[]) {
      const p = (pm[t.event_id] = pm[t.event_id] ?? { done: 0, total: 0 })
      p.total++
      if (t.status === 'APPROVED') p.done++ // estado terminal real de tasks
      ;(tm[t.event_id] = tm[t.event_id] ?? []).push({ id: t.id, title: t.title, status: t.status, due_date: t.due_date, assigned_to: t.assigned_to })
    }
    setProgress(pm)
    setPlanTasks(tm)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  // Cambios guardados en la subventana de tarea → avance e hitos al día
  useEffect(() => {
    window.addEventListener('hog:task-updated', load)
    return () => window.removeEventListener('hog:task-updated', load)
  }, [load])

  // Deep-link: abrir un proyecto pedido desde Mi Resumen o la campana
  useEffect(() => {
    if (loading) return
    const pending = localStorage.getItem('hog_pending_project')
    if (!pending) return
    localStorage.removeItem('hog_pending_project')
    const r = rows.find(x => x.id === pending)
    if (r) setEditing(r)
    // Avisa que la ventana del proyecto ya está montada: un deep-link con
    // tarea la abre justo después, para que quede apilada encima.
    window.dispatchEvent(new CustomEvent('hog:project-opened', { detail: pending }))
  }, [loading, rows])

  const buMap = useMemo(() => Object.fromEntries(buList.map(b => [b.id, b.code])), [buList])
  const nameOf = useCallback((id: string | null) => people.find(p => p.id === id)?.full_name ?? null, [people])

  const monthStart = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  // Base: filtros de venue/tipo/búsqueda (SIN filtro de pasado — el
  // calendario navega cualquier mes); tabla y board aplican el pasado aparte
  const filteredBase = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if ((r.archived ?? false) !== showArchived) return false
      if (buFilter && r.bu_id !== buFilter) return false
      if (kindFilter === 'eventos' && r.kind !== 'evento') return false
      if (kindFilter === 'proyectos' && r.kind === 'evento') return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
        || (r.description ?? '').toLowerCase().includes(q)
        || (r.collaborators ?? '').toLowerCase().includes(q)
        || TYPE_META[r.event_type].label.toLowerCase().includes(q)
        || (buMap[r.bu_id] ?? '').toLowerCase().includes(q)
        || (nameOf(r.responsible) ?? '').toLowerCase().includes(q)
    })
  }, [rows, buFilter, kindFilter, search, buMap, nameOf, showArchived])

  const filtered = useMemo(() =>
    // Un proyecto sigue vigente mientras su fecha FIN no haya pasado
    filteredBase.filter(r => showPast || !(r.end_date ?? r.date) || (r.end_date ?? r.date)! >= monthStart),
    [filteredBase, showPast, monthStart])

  // Board: mover de estado con las flechas — entrar a 'approved' es EXCLUSIVO
  // del aprobador; el resto del equipo llega hasta 'review' (En aprobación)
  const BOARD_ORDER: EventStatus[] = ['idea', 'planning', 'review', 'approved', 'done']
  async function moveTo(ev: EventPlan, next: EventStatus) {
    if (next === ev.status) return
    if (next === 'approved' && !canApprove) {
      showToast('Solo el Aprobador (o Master) puede aprobar — envíalo a aprobación y él decide.', 'error')
      return
    }
    setRows(rs => rs.map(r => r.id === ev.id ? { ...r, status: next } : r))
    const { error } = await supabase.from('event_plans').update({ status: next }).eq('id', ev.id)
    if (error) { showToast(`No se pudo mover: ${error.message}`, 'error'); load() }
  }
  async function moveStatus(ev: EventPlan, dir: -1 | 1) {
    const i = BOARD_ORDER.indexOf(ev.status)
    const next = BOARD_ORDER[i + dir]
    if (i === -1 || !next) return
    moveTo(ev, next)
  }

  // Click derecho: Editar · Duplicar · Archivar (nada se elimina)
  const { openMenu, menuElement } = useContextMenu()
  async function duplicatePlan(ev: EventPlan) {
    const { error } = await supabase.from('event_plans').insert({
      bu_id: ev.bu_id, name: `${ev.name} (copia)`, description: ev.description, kind: ev.kind,
      date: ev.date, end_date: ev.end_date, start_time: ev.start_time, end_time: ev.end_time,
      event_type: ev.event_type, has_cover: ev.has_cover, cover_price: ev.cover_price,
      budget: ev.budget, expected_attendance: ev.expected_attendance, requirements: ev.requirements,
      collaborators: ev.collaborators, responsible: ev.responsible, status: 'idea', created_by: userId ?? null,
    })
    if (error) showToast(`No se pudo duplicar: ${error.message}`, 'error')
    else { showToast('Duplicado — quedó en Idea.', 'success'); load() }
  }
  async function archivePlan(ev: EventPlan, arch: boolean) {
    const r = await archivarPlanConTareas(ev.id, arch)
    if (r.error) { showToast(`No se pudo ${arch ? 'archivar' : 'restaurar'}: ${r.error}`, 'error'); return }
    if (r.tareasError) showToast(`Proyecto ${arch ? 'archivado' : 'restaurado'}, pero sus tareas no: ${r.tareasError}`, 'error')
    else showToast(arch
      ? `Archivado${sufijoTareas(r.nTareas)} — lo encuentras con el filtro Archivados.`
      : `Restaurado${sufijoTareas(r.nTareas)}.`, 'success')

    logActivity(arch ? 'event_archived' : 'event_restored', 'event', ev.id, { name: ev.name, tareas: r.nTareas })
    load()
    window.dispatchEvent(new CustomEvent('hog:task-updated'))
  }
  const planMenu = (ev: EventPlan): CtxItem[] => [
    { label: 'Editar', icon: <Pencil size={13} />, onClick: () => setEditing(ev) },
    { label: 'Duplicar', icon: <Copy size={13} />, onClick: () => duplicatePlan(ev) },
    (ev.archived ?? false)
      ? { label: 'Restaurar', icon: <ArchiveRestore size={13} />, onClick: () => archivePlan(ev, false) }
      : { label: 'Archivar', icon: <Archive size={13} />, danger: true, onClick: () => archivePlan(ev, true) },
  ]
  const ctxProps = (ev: EventPlan) => canWrite ? { onContextMenu: (e: React.MouseEvent) => openMenu(e, planMenu(ev)) } : {}

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
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-elevated)', borderRadius: 999, padding: 2 }}>
            {([['table', isMobile ? 'Lista' : 'Tabla'], ['board', 'Board'], ['timeline', 'Timeline'], ['calendar', 'Calendario'],
               ...(canApprove ? [['approvals', 'Aprobación'] as const] : [])] as const).map(([id, label]) => (
              <button key={id} onClick={() => setView(id as typeof view)}
                style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: view === id ? 'var(--accent)' : 'transparent', color: view === id ? 'var(--on-accent)' : 'var(--text-tertiary)' }}>
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
          <button onClick={() => setShowArchived(a => !a)} title="Ver lo archivado — nada se elimina"
            style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: 40, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: showArchived ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${showArchived ? 'var(--accent)' : 'var(--border-default)'}`, color: showArchived ? 'var(--accent)' : 'var(--text-secondary)' }}>
            <Archive size={12} /> {showArchived ? 'Archivados' : !isMobile ? 'Archivados' : ''}
          </button>
          {userRole === 'MASTER' && (
            <button onClick={() => setConfigOpen(true)} title="Configurar quién aprueba los presupuestos"
              style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: 40, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
              <Settings size={12} /> {!isMobile && 'Aprobadores'}
            </button>
          )}
          <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar evento…"
              style={{ ...inp, width: '100%', paddingLeft: 30, minHeight: 40 }} />
          </div>
          {canWrite && (
            <button onClick={() => setCreating(true)} title="Agregar evento o proyecto" aria-label="Agregar"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 999, cursor: 'pointer', flexShrink: 0 }}>
              <Plus size={16} />
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
        ) : view === 'approvals' && canApprove ? (
          <div style={{ padding: isMobile ? 0 : 16 }}>
            <ApprovalsDashboard rows={rows} buMap={buMap} nameOf={nameOf} onOpen={ev => setEditing(ev)} />
          </div>
        ) : view === 'calendar' ? (
          <div style={{ padding: isMobile ? 0 : 16 }}>
            <CalendarView rows={filteredBase} month={calMonth} onMonth={setCalMonth} onOpen={ev => setEditing(ev)} isMobile={isMobile} buMap={buMap} />
          </div>
        ) : view === 'timeline' ? (
          <div style={{ padding: isMobile ? '0' : 16 }}>
            <TimelineView rows={filteredBase} buMap={buMap} progress={progress} planTasks={planTasks} onOpen={ev => setEditing(ev)} onOpenTask={onOpenTask} isMobile={isMobile} />
          </div>
        ) : view === 'board' ? (
          <div style={{ padding: isMobile ? 0 : 16 }}>
            {filtered.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>Sin planes con estos filtros.</p>
            ) : (
              <BoardView rows={filtered} buMap={buMap} progress={progress} canWrite={canWrite} isMobile={isMobile} onOpen={ev => setEditing(ev)} onMove={moveStatus} onMoveTo={moveTo} onCtx={(e, ev) => canWrite && openMenu(e, planMenu(ev))} />
            )}
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
                  {/* Estado y Avance junto al nombre — lo importante sin scroll */}
                  <th style={th}>Fecha</th><th style={th}>Día</th><th style={{ ...th, minWidth: 220 }}>Evento</th>
                  <th style={th}>Estado</th><th style={th}>Avance</th>
                  <th style={th}>Tipo</th><th style={th}>Venue</th><th style={th}>Hora</th>
                  <th style={{ ...th, textAlign: 'right' }}>Presupuesto</th><th style={{ ...th, textAlign: 'right' }}>Cover</th>
                  <th style={{ ...th, textAlign: 'right' }}>Asistencia</th>
                  <th style={th}>Responsable</th><th style={th}>Colaboradores</th>
                </tr>
              </thead>
              {groups.map(g => {
                const sumBudget = g.items.reduce((s, e) => s + (e.budget ?? 0), 0)
                const sumAtt = g.items.reduce((s, e) => s + (e.expected_attendance ?? 0), 0)
                return (
                  <tbody key={g.key}>
                    <tr>
                      <td colSpan={13} style={{ ...td, borderBottom: 'none', paddingTop: 18, fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
                        {g.label} · {g.items.length}
                      </td>
                    </tr>
                    {g.items.map(ev => {
                      const d = ev.date ? new Date(ev.date + 'T00:00:00') : null
                      const respName = nameOf(ev.responsible)
                      return (
                        <tr key={ev.id} onClick={() => setEditing(ev)} {...ctxProps(ev)} className="hover:bg-[var(--bg-surface)]"
                          style={{ cursor: 'pointer', opacity: ev.status === 'cancelled' ? 0.5 : 1 }}>
                          <td style={{ ...td, fontFamily: 'var(--font-mono)' }} className="num">{fechaLabel(ev)}</td>
                          <td style={td}>{d ? dayChip(d) : ''}</td>
                          <td style={{ ...td, whiteSpace: 'normal' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{ev.name}</span>
                            {ev.description && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{ev.description}</span>}
                          </td>
                          <td style={td}><StatusBadgeV2 tone={STATUS_META[ev.status].tone} label={STATUS_META[ev.status].label} /></td>
                          <td style={td}>
                            {progress[ev.id] ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 44, height: 5, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden', display: 'inline-block' }}>
                                  <span style={{ display: 'block', height: '100%', width: `${Math.round((progress[ev.id].done / progress[ev.id].total) * 100)}%`, background: progress[ev.id].done === progress[ev.id].total ? 'var(--status-healthy)' : 'var(--accent)' }} />
                                </span>
                                <span className="num" style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{progress[ev.id].done}/{progress[ev.id].total}</span>
                              </span>
                            ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                          </td>
                          <td style={td}>{planPill(ev)}</td>
                          <td style={td}><BUChip code={buMap[ev.bu_id] ?? '?'} size="sm" /></td>
                          <td style={{ ...td, fontFamily: 'var(--font-mono)' }} className="num">
                            {ev.start_time ? `${ev.start_time}${ev.end_time ? `–${ev.end_time}` : ''}` : '—'}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }} className="num">
                            {ev.budget != null ? mxn(ev.budget) : '—'}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }} className="num">
                            {ev.has_cover ? (ev.cover_price != null ? mxn(ev.cover_price) : 'Sí') : '—'}
                          </td>
                          <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }} className="num">
                            {ev.expected_attendance ?? '—'}
                          </td>
                          <td style={{ ...td, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{respName ?? '—'}</td>
                          <td style={{ ...td, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.collaborators ?? '—'}</td>
                        </tr>
                      )
                    })}
                    {(sumBudget > 0 || sumAtt > 0) && (
                      <tr>
                        <td colSpan={8} style={{ ...td, textAlign: 'right', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Suma del mes</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }} className="num">{sumBudget > 0 ? mxn(sumBudget) : ''}</td>
                        <td style={td} />
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }} className="num">{sumAtt > 0 ? sumAtt : ''}</td>
                        <td colSpan={2} style={td} />
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
                    <button key={ev.id} onClick={() => setEditing(ev)} {...ctxProps(ev)}
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
                          {progress[ev.id] && <span className="num">{progress[ev.id].done}/{progress[ev.id].total} tareas</span>}
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

      {menuElement}
      {(creating || editing) && (
        <EventSheet
          event={editing}
          templates={templates}
          buList={buList}
          people={people}
          canWrite={canWrite}
          canApprove={canApprove}
          userId={userId}
          userRole={userRole}
          isMobile={isMobile}
          onOpenTask={onOpenTask}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); load() }}
        />
      )}
      {configOpen && <ApproversConfigSheet people={people} userId={userId} isMobile={isMobile} onClose={() => setConfigOpen(false)} />}
    </div>
  )
}

// ── Quién aprueba los presupuestos ──────────────────────────────────────────
// Solo Master. Otorga o retira la función 'aprobador' — la misma que ya lee
// canApprove, así que a quien se le marca aquí le aparece la pestaña de
// Aprobación y le llega la notificación al enviar un presupuesto.
function ApproversConfigSheet({ people, userId, isMobile, onClose }: {
  people: { id: string; full_name: string | null }[]; userId?: string; isMobile: boolean; onClose: () => void
}) {
  const [aprobadores, setAprobadores] = useState<string[]>([])
  const [masters, setMasters] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('user_capabilities').select('user_id').eq('capability', 'aprobador'),
      supabase.from('profiles').select('id').eq('role', 'MASTER'),
    ]).then(([a, m]) => {
      setAprobadores((a.data ?? []).map(r => r.user_id as string))
      setMasters((m.data ?? []).map(r => r.id as string))
      setCargando(false)
    })
  }, [])

  async function toggle(uid: string) {
    const on = aprobadores.includes(uid)
    setAprobadores(prev => on ? prev.filter(x => x !== uid) : [...prev, uid])
    const { error } = on
      ? await supabase.from('user_capabilities').delete().eq('user_id', uid).eq('capability', 'aprobador')
      : await supabase.from('user_capabilities').insert({ user_id: uid, capability: 'aprobador', granted_by: userId ?? null })
    if (error) {
      setAprobadores(prev => on ? [...prev, uid] : prev.filter(x => x !== uid))
      showToast(`No se pudo guardar: ${error.message}`, 'error'); return
    }
    logActivity(on ? 'capability_revoked' : 'capability_granted', 'user', uid, {
      member: people.find(p => p.id === uid)?.full_name ?? '—', capability: 'aprobador',
    })
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={440}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-3) 0' }}>
          <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0, flex: 1 }}>Quién aprueba los presupuestos</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.55 }}>
          A quien marques aquí le aparece la pestaña de Aprobación y le llega el aviso cuando alguien manda un presupuesto a revisión.
        </p>
        {cargando ? (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Cargando…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {people.map(p => {
              const esMaster = masters.includes(p.id)
              const on = esMaster || aprobadores.includes(p.id)
              return (
                <button key={p.id} onClick={() => !esMaster && toggle(p.id)} disabled={esMaster}
                  title={esMaster ? 'El Master siempre puede aprobar' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 46, background: 'var(--bg-elevated)', border: `1px solid ${on ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-sm)', padding: '8px 12px', cursor: esMaster ? 'default' : 'pointer', textAlign: 'left', opacity: esMaster ? 0.75 : 1 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, background: on ? 'var(--accent)' : 'transparent', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800 }}>
                    {on ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.full_name ?? '—'}</span>
                  {esMaster && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>MASTER · siempre</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ── Board por estado: Idea → En planeación → Aprobado → Realizado ────────────
function BoardView({ rows, buMap, progress, canWrite, isMobile, onOpen, onMove, onMoveTo, onCtx }: {
  rows: EventPlan[]
  buMap: Record<string, string>
  progress: Record<string, { done: number; total: number }>
  canWrite: boolean
  isMobile: boolean
  onOpen: (ev: EventPlan) => void
  onMove: (ev: EventPlan, dir: -1 | 1) => void
  onMoveTo: (ev: EventPlan, status: EventStatus) => void
  onCtx?: (e: React.MouseEvent, ev: EventPlan) => void
}) {
  const cols: EventStatus[] = ['idea', 'planning', 'review', 'approved', 'done', 'cancelled']
  const movable: EventStatus[] = ['idea', 'planning', 'review', 'approved', 'done']
  // Drag & drop (escritorio): arrastra la tarjeta a la fase; la columna se ilumina
  const dragEv = useRef<EventPlan | null>(null)
  const [overCol, setOverCol] = useState<EventStatus | null>(null)
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 8 }}>
      {cols.map(st => {
        const items = rows.filter(r => r.status === st)
        if (st === 'cancelled' && items.length === 0) return null
        const droppable = canWrite && movable.includes(st)
        return (
          <div key={st}
            onDragOver={droppable ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overCol !== st) setOverCol(st) } : undefined}
            onDragLeave={droppable ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(c => c === st ? null : c) } : undefined}
            onDrop={droppable ? e => {
              e.preventDefault(); setOverCol(null)
              const ev = dragEv.current; dragEv.current = null
              if (ev && ev.status !== st) onMoveTo(ev, st)
            } : undefined}
            style={{ flex: '0 0 250px', background: overCol === st ? 'var(--accent-bg)' : 'var(--bg-surface)', border: `1px solid ${overCol === st ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', padding: 10, transition: 'background .12s, border-color .12s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <StatusBadgeV2 tone={STATUS_META[st].tone} label={STATUS_META[st].label} />
              <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(ev => {
                const i = movable.indexOf(ev.status)
                return (
                  <div key={ev.id} draggable={canWrite}
                    onDragStart={e => { dragEv.current = ev; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ev.id) }}
                    onDragEnd={() => { dragEv.current = null; setOverCol(null) }}
                    onContextMenu={onCtx ? e => onCtx(e, ev) : undefined}
                    style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', borderLeft: `3px solid ${planColor(ev)}`, cursor: canWrite ? 'grab' : undefined }}>
                    <button onClick={() => onOpen(ev)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{ev.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <BUChip code={buMap[ev.bu_id] ?? '?'} size="sm" />
                        {planPill(ev)}
                        <span className="num" style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{fechaLabel(ev)}</span>
                      </div>
                      {progress[ev.id] && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-base)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${Math.round((progress[ev.id].done / progress[ev.id].total) * 100)}%`, background: progress[ev.id].done === progress[ev.id].total ? 'var(--status-healthy)' : 'var(--accent)' }} />
                          </span>
                          <span className="num" style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{progress[ev.id].done}/{progress[ev.id].total}</span>
                        </div>
                      )}
                    </button>
                    {/* Flechas solo en móvil — en escritorio la fase se cambia arrastrando */}
                    {canWrite && i !== -1 && isMobile && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <button onClick={() => onMove(ev, -1)} disabled={i === 0} aria-label="Estado anterior"
                          style={{ flex: 1, minHeight: 30, border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'none', color: i === 0 ? 'var(--border-subtle)' : 'var(--text-tertiary)', cursor: i === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ChevronLeft size={13} />
                        </button>
                        <button onClick={() => onMove(ev, 1)} disabled={i === movable.length - 1} aria-label="Siguiente estado"
                          style={{ flex: 1, minHeight: 30, border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'none', color: i === movable.length - 1 ? 'var(--border-subtle)' : 'var(--text-tertiary)', cursor: i === movable.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              {items.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', margin: '12px 0' }}>—</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Calendario mensual: los planes del mes en cuadrícula ─────────────────────
function CalendarView({ rows, month, onMonth, onOpen, isMobile, buMap }: {
  rows: EventPlan[]
  month: string
  onMonth: (m: string) => void
  onOpen: (ev: EventPlan) => void
  isMobile: boolean
  buMap: Record<string, string>
}) {
  const first = new Date(month + '-01T00:00:00')
  const label = first.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const startDow = first.getDay()
  const isoOf = (day: number) => `${month}-${String(day).padStart(2, '0')}`
  const now = new Date()
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  // Los proyectos multi-día aparecen en cada día de su rango
  const eventsOn = (d: string) => rows.filter(r => r.date && (r.end_date ? r.date <= d && d <= r.end_date : r.date === d))
  const shift = (n: number) => {
    const d = new Date(first); d.setMonth(d.getMonth() + n)
    onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const maxChips = isMobile ? 2 : 3
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button onClick={() => shift(-1)} aria-label="Mes anterior" style={{ width: 40, height: 40, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={15} /></button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{label}</span>
        <button onClick={() => shift(1)} aria-label="Mes siguiente" style={{ width: 40, height: 40, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={15} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {DAYS_ES.map(d => (
          <div key={d} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: '4px 0' }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />
          const dISO = isoOf(day)
          const evs = eventsOn(dISO)
          const isToday = dISO === todayISO
          // Multi-día estilo Google Calendar: el nombre solo el PRIMER día del
          // rango (o al arrancar la semana); los demás días, banda de color
          const dow = new Date(dISO + 'T00:00:00').getDay()
          const starts = evs.filter(ev => ev.date === dISO || dow === 0)
          const conts = evs.filter(ev => !(ev.date === dISO || dow === 0))
          return (
            <div key={dISO} style={{ minHeight: isMobile ? 62 : 88, background: 'var(--bg-surface)', border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: 6, padding: 3, overflow: 'hidden' }}>
              <div className="num" style={{ fontSize: 10, fontWeight: isToday ? 800 : 400, color: isToday ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', padding: '0 2px' }}>{day}</div>
              {conts.map(ev => (
                <button key={`c${ev.id}`} onClick={() => onOpen(ev)} title={`${ev.name} · ${buMap[ev.bu_id] ?? ''} (continúa)`} aria-label={ev.name}
                  style={{ display: 'block', width: '100%', height: 7, marginTop: 3, borderRadius: 3, border: 'none', cursor: 'pointer', background: `color-mix(in srgb, ${planColor(ev)} 45%, transparent)`, padding: 0 }} />
              ))}
              {starts.slice(0, maxChips).map(ev => (
                <button key={ev.id} onClick={() => onOpen(ev)} title={`${ev.name} · ${buMap[ev.bu_id] ?? ''}`}
                  style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 2, padding: '2px 4px', borderRadius: 4, border: 'none', cursor: 'pointer', background: `color-mix(in srgb, ${planColor(ev)} 18%, transparent)`, borderLeft: `2px solid ${planColor(ev)}`, color: 'var(--text-primary)', fontSize: isMobile ? 8.5 : 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.name}
                </button>
              ))}
              {starts.length > maxChips && (
                <div style={{ fontSize: 8.5, color: 'var(--text-tertiary)', padding: '1px 4px' }}>+{starts.length - maxChips} más</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Timeline (Gantt): una barra por proyecto sobre una ventana de semanas, con
// hitos de tareas (rombos por fecha límite), avance dentro de la barra y la
// línea de HOY — el "general" para medir tiempos de un vistazo ────────────────
function TimelineView({ rows, buMap, progress, planTasks, onOpen, onOpenTask, isMobile }: {
  rows: EventPlan[]
  buMap: Record<string, string>
  progress: Record<string, { done: number; total: number }>
  planTasks: Record<string, PlanTask[]>
  onOpen: (ev: EventPlan) => void
  onOpenTask?: (id: string) => void
  isMobile: boolean
}) {
  // Proyectos desplegados: al abrirlos, cada tarea baja como su propia fila
  // del timeline — se ve QUÉ tiene el proyecto y CÓMO va, no solo el avance.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) => setExpanded(p => {
    const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n
  })
  const DAY = 86400000
  const toD = (s: string) => new Date(s + 'T00:00:00')
  const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const WEEKS = isMobile ? 5 : 9
  const totalDays = WEEKS * 7
  // Ventana: arranca el lunes de la semana pasada; ‹ › mueve de 2 en 2 semanas
  const [start, setStart] = useState(() => {
    const m = new Date(); m.setDate(m.getDate() - ((m.getDay() + 6) % 7) - 7); return isoOf(m)
  })
  const startD = toD(start)
  const endISO = isoOf(new Date(startD.getTime() + (totalDays - 1) * DAY))
  const todayISO = isoOf(new Date())
  const shift = (n: number) => { const d = toD(start); d.setDate(d.getDate() + n * 14); setStart(isoOf(d)) }
  const goToday = () => { const m = new Date(); m.setDate(m.getDate() - ((m.getDay() + 6) % 7) - 7); setStart(isoOf(m)) }
  // % horizontal dentro de la ventana (centro del día para hitos y HOY)
  const pctOf = (dISO: string, center = false) =>
    (((toD(dISO).getTime() - startD.getTime()) / DAY + (center ? 0.5 : 0)) / totalDays) * 100

  // Solo planes con fecha cuyo rango toca la ventana, ordenados por inicio
  const items = rows
    .filter(r => r.date && r.status !== 'cancelled' && r.date <= endISO && (r.end_date ?? r.date)! >= start)
    .sort((a, b) => a.date!.localeCompare(b.date!))

  const fmt = (dISO: string) => toD(dISO).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  const labelW = isMobile ? 118 : 220
  const rowH = isMobile ? 56 : 58
  const activos = items.filter(r => r.date! <= todayISO && (r.end_date ?? r.date)! >= todayISO).length

  return (
    <div>
      {/* Navegación de ventana + resumen general */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => shift(-1)} aria-label="Semanas anteriores" style={{ width: 40, height: 40, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={15} /></button>
        <button onClick={goToday} style={{ minHeight: 40, padding: '0 12px', border: '1px solid var(--border-default)', borderRadius: 999, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Hoy</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }} className="num">
          {fmt(start)} – {fmt(endISO)}
          <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 8 }}>{items.length} en ventana · {activos} en curso</span>
        </span>
        <button onClick={() => shift(1)} aria-label="Semanas siguientes" style={{ width: 40, height: 40, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={15} /></button>
      </div>

      {items.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>Sin proyectos en estas semanas — navega con ‹ › o pulsa Hoy.</p>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {/* Encabezado de semanas */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)' }}>
            <div style={{ width: labelW, flexShrink: 0, padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>Proyecto</div>
            <div style={{ flex: 1, display: 'flex' }}>
              {Array.from({ length: WEEKS }, (_, w) => {
                const ws = new Date(startD.getTime() + w * 7 * DAY)
                return (
                  <div key={w} className="num" style={{ flex: 1, padding: '6px 4px', fontSize: 9.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', borderLeft: '1px solid var(--border-subtle)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    {ws.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Cuerpo: overlay de rejilla + línea HOY, y una fila por plan */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: labelW, right: 0, top: 0, bottom: 0, pointerEvents: 'none' }}>
              {/* Fin de semana sombreado — se lee el ritmo de semanas al vistazo */}
              {Array.from({ length: WEEKS }, (_, w) => (
                <div key={`we${w}`} style={{ position: 'absolute', left: `${((w * 7 + 5) / totalDays) * 100}%`, width: `${(2 / totalDays) * 100}%`, top: 0, bottom: 0, background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)' }} />
              ))}
              {Array.from({ length: WEEKS }, (_, w) => (
                <div key={w} style={{ position: 'absolute', left: `${(w / WEEKS) * 100}%`, top: 0, bottom: 0, width: 1, background: 'var(--border-subtle)' }} />
              ))}
              {todayISO >= start && todayISO <= endISO && (
                <div style={{ position: 'absolute', left: `${pctOf(todayISO, true)}%`, top: 0, bottom: 0, width: 2, background: 'var(--status-risk)', zIndex: 3 }}>
                  <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 8.5, fontWeight: 800, color: 'var(--status-risk)', fontFamily: 'var(--font-mono)', background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: 3, border: '1px solid var(--status-risk)' }}>HOY</span>
                </div>
              )}
            </div>

            {items.map(ev => {
              const s = ev.date!
              const e = ev.end_date ?? ev.date!
              const leftPct = Math.max(0, pctOf(s))
              const rightPct = Math.min(100, pctOf(e) + 100 / totalDays)
              const widthPct = Math.max(rightPct - leftPct, isMobile ? 4 : 2.5)
              const durDays = Math.round((toD(e).getTime() - toD(s).getTime()) / DAY) + 1
              const pg = progress[ev.id]
              const color = planColor(ev)
              // Tiempo restante: el dato clave para "medir tiempos"
              const resta = e >= todayISO && s <= todayISO
                ? `quedan ${Math.round((toD(e).getTime() - toD(todayISO).getTime()) / DAY)} d`
                : s > todayISO ? `inicia en ${Math.round((toD(s).getTime() - toD(todayISO).getTime()) / DAY)} d` : 'terminó'
              // Hitos agrupados por fecha: un rombo por día (con contador si
              // caen varios), verde solo cuando TODOS los de ese día están aprobados
              const hitosByDate = new Map<string, PlanTask[]>()
              for (const t of planTasks[ev.id] ?? []) {
                if (t.due_date && t.due_date >= start && t.due_date <= endISO) {
                  const arr = hitosByDate.get(t.due_date) ?? []
                  arr.push(t); hitosByDate.set(t.due_date, arr)
                }
              }
              const tareas = planTasks[ev.id] ?? []
              const isOpen = expanded.has(ev.id)
              return (
                <Fragment key={ev.id}>
                <div className="hover:bg-[var(--bg-base)]" style={{ display: 'flex', minHeight: rowH, borderBottom: '1px solid var(--border-subtle)', alignItems: 'stretch' }}>
                  <div style={{ width: labelW, flexShrink: 0, display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
                    {tareas.length > 0 && (
                      <button onClick={() => toggleExpand(ev.id)} aria-expanded={isOpen}
                        title={isOpen ? 'Ocultar tareas' : `Ver sus ${tareas.length} tareas en el timeline`}
                        style={{ width: 20, flexShrink: 0, border: 'none', background: 'none', color: isOpen ? 'var(--accent)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        <ChevronRight size={13} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                      </button>
                    )}
                    <button onClick={() => onOpen(ev)} style={{ flex: 1, minWidth: 0, padding: tareas.length ? '6px 8px 6px 2px' : '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', overflow: 'hidden' }}>
                      <div style={{ fontSize: isMobile ? 11 : 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                        <BUChip code={buMap[ev.bu_id] ?? '?'} size="sm" />
                        <span className="num" style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{durDays} d · {resta}</span>
                      </div>
                    </button>
                  </div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <button onClick={() => onOpen(ev)} title={`${ev.name} · ${fechaLabel(ev)}${pg ? ` · ${pg.done}/${pg.total} tareas` : ''}`}
                      style={{ position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`, top: '50%', transform: 'translateY(-50%)', height: isMobile ? 22 : 24, borderRadius: 6, border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 22%, transparent)`, cursor: 'pointer', overflow: 'hidden', padding: 0, zIndex: 1, display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
                      {pg && pg.total > 0 && (
                        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round((pg.done / pg.total) * 100)}%`, background: `color-mix(in srgb, ${color} 55%, transparent)` }} />
                      )}
                      {!isMobile && widthPct > 10 && (
                        <span className="num" style={{ position: 'relative', fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', padding: '0 8px', whiteSpace: 'nowrap' }}>
                          {pg && pg.total > 0 ? `${pg.done}/${pg.total} tareas` : `${durDays} d`}
                        </span>
                      )}
                    </button>
                    {/* Etiqueta al lado de barras cortas (proyectos de 1-3 días) */}
                    {!isMobile && widthPct <= 10 && (
                      <span className="num" style={{ position: 'absolute', left: `calc(${leftPct + widthPct}% + 6px)`, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{durDays} d</span>
                    )}
                    {/* Hitos SOBRE la barra: un rombo por fecha, con contador si son varios */}
                    {[...hitosByDate.entries()].map(([d2, ts]) => {
                      const allDone = ts.every(t => t.status === 'APPROVED')
                      return (
                        <span key={d2} title={`${d2.slice(5)} · ${ts.map(t => t.title).join(' · ')}`}
                          style={{ position: 'absolute', left: `calc(${pctOf(d2, true)}% - 4.5px)`, top: `calc(50% - ${isMobile ? 20 : 22}px)`, zIndex: 2 }}>
                          <span style={{ display: 'block', width: 9, height: 9, transform: 'rotate(45deg)', background: allDone ? 'var(--status-healthy)' : '#E8A33D', border: '1.5px solid var(--bg-surface)', borderRadius: 1.5 }} />
                          {ts.length > 1 && (
                            <span className="num" style={{ position: 'absolute', top: -9, left: 3, fontSize: 8, fontWeight: 800, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{ts.length}</span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                </div>

                {/* Timeline POR TAREAS: cada tarea, su fase y su fecha */}
                {isOpen && tareas.map(t => {
                  const ph = phaseOf(t.status)
                  const enVentana = !!t.due_date && t.due_date >= start && t.due_date <= endISO
                  const vencida = !!t.due_date && t.due_date < todayISO && t.status !== 'APPROVED'
                  return (
                    <div key={t.id} style={{ display: 'flex', minHeight: 32, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-base)', alignItems: 'stretch' }}>
                      <button onClick={() => onOpenTask?.(t.id)} title={`${t.title} · ${ph.label}${t.due_date ? ` · vence ${t.due_date.slice(5)}` : ' · sin fecha'}`}
                        style={{ width: labelW, flexShrink: 0, padding: '4px 8px 4px 26px', background: 'none', border: 'none', textAlign: 'left', overflow: 'hidden', cursor: onOpenTask ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ph.color, flexShrink: 0 }} />
                        <span style={{ fontSize: isMobile ? 10 : 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      </button>
                      <div style={{ flex: 1, position: 'relative' }}>
                        {enVentana ? (
                          <button onClick={() => onOpenTask?.(t.id)} title={`${t.title} · ${ph.label} · vence ${t.due_date!.slice(5)}`}
                            style={{ position: 'absolute', left: `calc(${pctOf(t.due_date!, true)}% - 7px)`, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: '50%', background: ph.color, border: `1.5px solid ${vencida ? 'var(--status-risk)' : 'var(--bg-surface)'}`, cursor: onOpenTask ? 'pointer' : 'default', padding: 0, zIndex: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                        ) : t.due_date ? (
                          // Fuera de la ventana: flecha al borde por donde queda
                          <span className="num" title={`Vence ${t.due_date}`} style={{ position: 'absolute', [t.due_date < start ? 'left' : 'right']: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: ph.color, fontFamily: 'var(--font-mono)', opacity: 0.75 }}>
                            {t.due_date < start ? '‹' : '›'} {t.due_date.slice(5)}
                          </span>
                        ) : (
                          <span className="num" style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>sin fecha</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                </Fragment>
              )
            })}
          </div>
        </div>
      )}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <PhaseLegend />
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0 }}>
          ◆ hitos sobre la barra del proyecto · la línea roja es hoy · abre ▸ para ver sus tareas en el timeline (el punto marca su fecha límite, con borde rojo si va tarde).
        </p>
      </div>
    </div>
  )
}

// ── Cabina del Aprobador: pendientes de decisión + cortes con sobregiro ──────
function ApprovalsDashboard({ rows, buMap, nameOf, onOpen }: {
  rows: EventPlan[]
  buMap: Record<string, string>
  nameOf: (id: string | null) => string | null
  onOpen: (ev: EventPlan) => void
}) {
  interface Agg { gastos: number; ingresos: number; recursos: number; real: number; presupConReal: number }
  const [aggs, setAggs] = useState<Record<string, Agg>>({})
  const todayISO = new Date().toISOString().slice(0, 10)

  const pending = useMemo(() => rows.filter(r => r.status === 'review'), [rows])
  const finished = useMemo(() => rows.filter(r => r.status === 'done' || ((r.end_date ?? r.date) && (r.end_date ?? r.date)! < todayISO && !['cancelled'].includes(r.status))), [rows, todayISO])

  useEffect(() => {
    const ids = [...new Set([...pending, ...finished].map(r => r.id))]
    if (!ids.length) { setAggs({}); return }
    Promise.all([
      supabase.from('project_budget_items').select('event_id, amount, actual_amount, is_income').in('event_id', ids),
      supabase.from('project_resources').select('event_id, qty, unit_cost').in('event_id', ids),
    ]).then(([{ data: bud }, { data: res }]) => {
      const m: Record<string, Agg> = {}
      const get = (id: string) => (m[id] = m[id] ?? { gastos: 0, ingresos: 0, recursos: 0, real: 0, presupConReal: 0 })
      for (const b of (bud ?? []) as { event_id: string; amount: number; actual_amount: number | null; is_income: boolean }[]) {
        const a = get(b.event_id)
        if (b.is_income) a.ingresos += b.amount
        else {
          a.gastos += b.amount
          if (b.actual_amount != null) { a.real += b.actual_amount; a.presupConReal += b.amount }
        }
      }
      for (const r of (res ?? []) as { event_id: string; qty: number; unit_cost: number | null }[]) {
        get(r.event_id).recursos += (r.unit_cost ?? 0) * r.qty
      }
      setAggs(m)
    })
  }, [pending, finished])

  const sobregiros = finished
    .map(r => ({ r, a: aggs[r.id] }))
    .filter(x => x.a && x.a.presupConReal > 0 && x.a.real > x.a.presupConReal)
    .sort((x, y) => (y.a.real - y.a.presupConReal) - (x.a.real - x.a.presupConReal))
  const porAprobar = pending.reduce((s, r) => { const a = aggs[r.id]; return s + (a ? a.gastos + a.recursos - a.ingresos : 0) }, 0)
  const deltaTotal = sobregiros.reduce((s, x) => s + (x.a.real - x.a.presupConReal), 0)

  const kpi = (label: string, value: string, color?: string) => (
    <div style={{ flex: '1 1 120px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div className="num" style={{ fontSize: 18, fontWeight: 800, color: color ?? 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {kpi('Pendientes', String(pending.length), pending.length ? 'var(--status-attention)' : undefined)}
        {kpi('Neto por aprobar', mxn(porAprobar))}
        {kpi('Cortes con sobregiro', String(sobregiros.length), sobregiros.length ? 'var(--status-risk)' : 'var(--status-healthy)')}
        {kpi('Δ sobregiro total', sobregiros.length ? `+${mxn(deltaTotal)}` : '—', sobregiros.length ? 'var(--status-risk)' : undefined)}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
          ⏳ Pendientes de tu decisión · {pending.length}
        </div>
        {pending.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Nada por aprobar — bandeja limpia ✅</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map(r => {
              const a = aggs[r.id]
              return (
                <button key={r.id} onClick={() => onOpen(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid color-mix(in srgb, var(--status-attention) 40%, transparent)', borderRadius: 'var(--radius-md)', padding: '10px 12px', cursor: 'pointer', textAlign: 'left', minHeight: 58 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{r.name}</span>
                      <BUChip code={buMap[r.bu_id] ?? '?'} size="sm" />
                      {planPill(r)}
                    </div>
                    <div className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                      {fechaLabel(r)} · {nameOf(r.responsible) ?? 'sin responsable'}
                      {a && <> · Gastos {mxn(a.gastos + a.recursos)}{a.ingresos > 0 && <> · Patroc. {mxn(a.ingresos)}</>} · <strong style={{ color: 'var(--text-primary)' }}>Neto {mxn(a.gastos + a.recursos - a.ingresos)}</strong></>}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Revisar →</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
          🔴 Cortes con sobregiro · {sobregiros.length}
        </div>
        {sobregiros.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Ningún plan terminado se pasó del presupuesto capturado.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sobregiros.map(({ r, a }) => (
              <button key={r.id} onClick={() => onOpen(r)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid color-mix(in srgb, var(--status-risk) 40%, transparent)', borderRadius: 'var(--radius-md)', padding: '10px 12px', cursor: 'pointer', textAlign: 'left', minHeight: 54 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{r.name}</span>
                    <BUChip code={buMap[r.bu_id] ?? '?'} size="sm" />
                  </div>
                  <div className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    Presupuestado {mxn(a.presupConReal)} · Real {mxn(a.real)}
                  </div>
                </div>
                <span className="num" style={{ fontSize: 14, fontWeight: 800, color: 'var(--status-risk)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                  +{mxn(a.real - a.presupConReal)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Aprobación (Gerente de Eficiencia): enviar → revisar → aprobar/regresar ──
function ApprovalSection({ event, buCode, canWrite, canApprove, userId, people, status, totales, nPartidas, onStatus }: {
  event: EventPlan
  buCode: string
  canWrite: boolean
  canApprove: boolean
  userId?: string
  people: { id: string; full_name: string | null }[]
  status: EventStatus
  // Los totales llegan del presupuesto de abajo, no de una consulta propia:
  // antes esta sección los leía UNA vez al abrir y se quedaba con la cifra
  // vieja — agregabas una partida y arriba seguía diciendo otro número. Se
  // enviaba a aprobar un monto que no era el del presupuesto.
  totales: { gastos: number; ingresos: number } | null
  nPartidas: number
  onStatus: (s: EventStatus) => void
}) {
  const [history, setHistory] = useState<Approval[]>([])
  const [aprobadores, setAprobadores] = useState<string[]>([])
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const nameOf = (id: string | null) => people.find(p => p.id === id)?.full_name ?? '—'
  const fin = totales ? { gastos: totales.gastos, patroc: totales.ingresos, neto: totales.gastos - totales.ingresos } : null

  useEffect(() => {
    supabase.from('project_approvals').select('*').eq('event_id', event.id).order('created_at')
      .then(({ data }) => setHistory((data ?? []) as Approval[]))
  }, [event.id])

  // Quién va a recibirlo — se muestra ANTES de enviar: mandar un presupuesto
  // sin saber a quién le llega es mandarlo al vacío.
  useEffect(() => {
    Promise.all([
      supabase.from('user_capabilities').select('user_id').eq('capability', 'aprobador'),
      supabase.from('profiles').select('id').eq('role', 'MASTER'),
    ]).then(([{ data: apr }, { data: masters }]) => {
      const ids = new Set<string>([...(apr ?? []).map(a => a.user_id), ...(masters ?? []).map(m => m.id)])
      setAprobadores([...ids])
    })
  }, [])

  // Planner → Aprobador: cambia a 'review' y notifica (campana + Slack DM)
  async function submitForApproval() {
    // Un presupuesto vacío no es una decisión que alguien pueda tomar
    if (!nPartidas) { showToast('Agrega al menos una partida al presupuesto antes de enviarlo.', 'error'); return }
    setBusy(true)
    const { error } = await supabase.from('event_plans').update({ status: 'review' }).eq('id', event.id)
    if (error) { showToast(`No se pudo enviar: ${error.message}`, 'error'); setBusy(false); return }
    const { data: row } = await supabase.from('project_approvals').insert({
      event_id: event.id, action: 'submitted', actor: userId ?? null,
    }).select('*').single()
    if (row) setHistory(h => [...h, row as Approval])
    onStatus('review')
    const ids = new Set(aprobadores)
    if (userId) ids.delete(userId)
    if (ids.size) {
      await supabase.from('notifications').insert([...ids].map(uid => ({
        user_id: uid, title: 'Aprobación pendiente', body: `${event.name} (${buCode}) — presupuesto por revisar`,
        type: 'approval_requested', entity_id: event.id,
      })))
      const f = fin ?? { gastos: 0, patroc: 0, neto: 0 }
      const msg = `🧮 *Aprobación pendiente* — ${event.name} (${buCode})\nGastos ${mxn(f.gastos)} · Patrocinios ${mxn(f.patroc)} · *Neto ${mxn(f.neto)}* · ${nPartidas} partidas\n👉 HOG APP → Proyectos`
      ;[...ids].forEach(uid => notifyUserDM(uid, msg))
    }
    logActivity('event_updated', 'event', event.id, { name: event.name, via: 'enviado_a_aprobacion', neto: fin?.neto })
    showToast(ids.size
      ? `Enviado a aprobación — se notificó a ${ids.size} ${ids.size === 1 ? 'aprobador' : 'aprobadores'}.`
      : 'Enviado a aprobación — ojo: no hay nadie configurado como aprobador.', ids.size ? 'success' : 'error')
    setBusy(false)
  }

  // Aprobador: aprueba o regresa a planeación con feedback obligatorio
  async function decide(action: 'approved' | 'returned') {
    if (action === 'returned' && !feedback.trim()) { showToast('Escribe el feedback para regresarlo.', 'error'); return }
    setBusy(true)
    const nextStatus: EventStatus = action === 'approved' ? 'approved' : 'planning'
    const { error } = await supabase.from('event_plans').update({ status: nextStatus }).eq('id', event.id)
    if (error) { showToast(`No se pudo: ${error.message}`, 'error'); setBusy(false); return }
    const { data: row } = await supabase.from('project_approvals').insert({
      event_id: event.id, action, comment: feedback.trim() || null, actor: userId ?? null,
    }).select('*').single()
    if (row) setHistory(h => [...h, row as Approval])
    onStatus(nextStatus)
    const submitter = [...history].reverse().find(h => h.action === 'submitted')?.actor ?? null
    const ids = new Set<string>([event.responsible, submitter].filter(Boolean) as string[])
    if (userId) ids.delete(userId)
    const label = action === 'approved' ? '✅ Plan aprobado' : '↩️ Plan regresado con feedback'
    if (ids.size) {
      await supabase.from('notifications').insert([...ids].map(uid => ({
        user_id: uid, title: action === 'approved' ? 'Plan aprobado' : 'Plan regresado con feedback',
        body: `${event.name}${feedback.trim() ? ` — "${feedback.trim()}"` : ''}`,
        type: `plan_${action}`, entity_id: event.id,
      })))
      ;[...ids].forEach(uid => notifyUserDM(uid, `${label} — ${event.name} (${buCode})${feedback.trim() ? `\n💬 ${feedback.trim()}` : ''}`))
    }
    logActivity('event_updated', 'event', event.id, { name: event.name, via: action === 'approved' ? 'aprobado' : 'regresado_con_feedback', feedback: feedback.trim() || undefined })
    showToast(action === 'approved' ? 'Plan aprobado ✅' : 'Regresado a planeación con tu feedback.', 'success')
    setFeedback(''); setBusy(false)
  }

  const lastApproved = [...history].reverse().find(h => h.action === 'approved')
  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
  const ACTION_META = {
    submitted: { icon: '📤', label: 'Enviado a aprobación' },
    approved:  { icon: '✅', label: 'Aprobado' },
    returned:  { icon: '↩️', label: 'Regresado con feedback' },
  } as const

  // El flujo, dibujado: sin esto el botón "enviar" es un salto al vacío —
  // nadie sabe qué pasa después ni de quién depende que avance.
  const PASOS = [
    { key: 'plan',   label: 'Armas presupuesto' },
    { key: 'envio',  label: 'Envías' },
    { key: 'decide', label: 'Aprobador decide' },
    { key: 'listo',  label: 'Aprobado' },
  ] as const
  const pasoActual = status === 'approved' || status === 'done' ? 3 : status === 'review' ? 2 : nPartidas > 0 ? 1 : 0
  const nombresAprob = aprobadores.filter(id => id !== userId).map(id => nameOf(id)).filter(n => n !== '—')
  const sinPartidas = nPartidas === 0
  const enFlujo = ['idea', 'planning'].includes(status) && canWrite

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12, border: status === 'review' ? '1px solid color-mix(in srgb, var(--status-attention) 45%, transparent)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flex: 1 }}>Aprobación</span>
        {fin && (fin.gastos > 0 || fin.patroc > 0) && (
          <span className="num" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            Gastos {mxn(fin.gastos)} · Patrocinios <span style={{ color: 'var(--status-healthy)' }}>{mxn(fin.patroc)}</span> · Neto <strong style={{ color: 'var(--text-primary)' }}>{mxn(fin.neto)}</strong>
          </span>
        )}
      </div>

      {/* Riel del flujo — dónde va y qué falta */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
        {PASOS.map((p, i) => {
          const hecho = i < pasoActual
          const activo = i === pasoActual
          const color = hecho ? 'var(--status-healthy)' : activo ? 'var(--accent)' : 'var(--border-strong)'
          return (
            <div key={p.key} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <div style={{ flex: 1, height: 2, background: i === 0 ? 'transparent' : (hecho || activo ? 'var(--status-healthy)' : 'var(--border-subtle)') }} />
                <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `2px solid ${color}`, background: hecho ? 'var(--status-healthy)' : activo ? 'var(--accent-bg)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#04210f' }}>
                  {hecho ? '✓' : ''}
                </span>
                <div style={{ flex: 1, height: 2, background: i === PASOS.length - 1 ? 'transparent' : (hecho ? 'var(--status-healthy)' : 'var(--border-subtle)') }} />
              </div>
              <span style={{ fontSize: 9.5, textAlign: 'center', lineHeight: 1.25, color: activo ? 'var(--text-primary)' : hecho ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontWeight: activo ? 800 : 600 }}>
                {p.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Estado actual del flujo */}
      {enFlujo && (
        <>
          <button onClick={submitForApproval} disabled={busy || sinPartidas}
            title={sinPartidas ? 'Primero captura el presupuesto abajo' : `Se envía a ${nombresAprob.join(', ') || 'los aprobadores'}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 46, borderRadius: 999, border: `1px solid ${sinPartidas ? 'var(--border-default)' : 'var(--accent-border)'}`, background: sinPartidas ? 'transparent' : 'var(--accent-bg)', color: sinPartidas ? 'var(--text-tertiary)' : 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: sinPartidas ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            📤 Enviar presupuesto a aprobación
            {!sinPartidas && fin && <span className="num" style={{ fontFamily: 'var(--font-mono)', fontWeight: 800 }}>· {mxn(fin.neto)}</span>}
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '7px 0 0', lineHeight: 1.45 }}>
            {sinPartidas
              ? 'Captura primero las partidas del presupuesto (abajo). Sin números no hay nada que aprobar.'
              : <>Se congela el plan, pasa a <strong style={{ color: 'var(--status-attention)' }}>En aprobación</strong> y le llega
                  campana + Slack a {nombresAprob.length
                    ? <strong style={{ color: 'var(--text-secondary)' }}>{nombresAprob.slice(0, 3).join(', ')}{nombresAprob.length > 3 ? ` y ${nombresAprob.length - 3} más` : ''}</strong>
                    : <strong style={{ color: 'var(--status-risk)' }}>nadie — no hay aprobadores configurados</strong>}.
                  Si lo regresan con feedback, vuelve a Planeación y lo reenvías.</>}
          </p>
        </>
      )}
      {status === 'review' && !canApprove && (
        <p style={{ fontSize: 12, color: 'var(--status-attention)', fontWeight: 700, margin: 0 }}>
          ⏳ En aprobación — esperando a {nombresAprob.slice(0, 2).join(', ') || 'el Aprobador'}. El plan se congela hasta su decisión.
        </p>
      )}
      {status === 'review' && canApprove && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2}
            placeholder="Feedback (obligatorio si lo regresas): ajustar partidas, negociar patrocinio, recortar staff…"
            style={{ ...inp, minHeight: 56, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => decide('approved')} disabled={busy}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, borderRadius: 999, border: 'none', background: 'var(--status-healthy)', color: '#04210f', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              ✅ Aprobar
            </button>
            <button onClick={() => decide('returned')} disabled={busy}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, borderRadius: 999, border: '1px solid color-mix(in srgb, var(--status-attention) 45%, transparent)', background: 'color-mix(in srgb, var(--status-attention) 12%, transparent)', color: 'var(--status-attention)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              ↩ Regresar con feedback
            </button>
          </div>
        </div>
      )}
      {status === 'approved' && lastApproved && (
        <p style={{ fontSize: 12, color: 'var(--status-healthy)', fontWeight: 700, margin: 0 }}>
          ✅ Aprobado por {nameOf(lastApproved.actor)} · {new Date(lastApproved.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* Historial auditable */}
      {history.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
          {history.map(h => (
            <div key={h.id} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12 }}>
              <span>{ACTION_META[h.action].icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ACTION_META[h.action].label}</span>
                <span style={{ color: 'var(--text-tertiary)' }}> · {nameOf(h.actor)} · {new Date(h.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {h.comment && <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>💬 {h.comment}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Programa del evento: qué SUCEDE cada día, con horario ────────────────────
// Distinto de las tareas: una tarea se completa (trabajo previo), una actividad
// ocurre (yoga el miércoles 10:30–12:00). Se agrupa por día para leerse como el
// itinerario que se le entrega al equipo y al asistente.
interface ProgramActivity {
  id: string; date: string; start_time: string | null; end_time: string | null
  title: string; location: string | null; facilitator: string | null
  capacity: number | null; cost: number | null; status: string; description: string | null
}
const ACT_STATUS: Record<string, { label: string; color: string }> = {
  planeada:   { label: 'Planeada',   color: '#8A8A8A' },
  confirmada: { label: 'Confirmada', color: '#3B82F6' },
  hecha:      { label: 'Hecha',      color: '#22C55E' },
  cancelada:  { label: 'Cancelada',  color: '#EF4444' },
}
const diaLargo = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })

function ProgramSection({ eventId, defaultDate, canWrite, userId, onOpenTask }: {
  eventId: string; defaultDate: string | null; canWrite: boolean; userId?: string
  onOpenTask?: (id: string) => void
}) {
  const [items, setItems] = useState<ProgramActivity[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [n, setN] = useState({ date: defaultDate ?? '', ini: '', fin: '', title: '', location: '', facilitator: '' })
  const [taskCounts, setTaskCounts] = useState<Record<string, { total: number; hechas: number }>>({})

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('project_activities')
      .select('id, date, start_time, end_time, title, location, facilitator, capacity, cost, status, description')
      .eq('event_id', eventId).order('date').order('start_time', { nullsFirst: true }).order('sort')
    if (error) { setTableMissing(true); return }
    const rows = (data ?? []) as ProgramActivity[]
    setItems(rows)
    if (rows.length) {
      const { data: tk } = await supabase.from('tasks').select('activity_id, status')
        .in('activity_id', rows.map(r => r.id))
      const c: Record<string, { total: number; hechas: number }> = {}
      for (const t of tk ?? []) {
        const k = t.activity_id as string
        c[k] = c[k] ?? { total: 0, hechas: 0 }
        c[k].total++
        if (t.status === 'APPROVED') c[k].hechas++
      }
      setTaskCounts(c)
    }
  }, [eventId])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!n.title.trim() || !n.date) return
    const { error } = await supabase.from('project_activities').insert({
      event_id: eventId, date: n.date, start_time: n.ini || null, end_time: n.fin || null,
      title: n.title.trim(), location: n.location.trim() || null,
      facilitator: n.facilitator.trim() || null, created_by: userId ?? null,
    })
    if (error) { showToast(`No se pudo agregar: ${error.message}`, 'error'); return }
    setN({ date: n.date, ini: '', fin: '', title: '', location: '', facilitator: '' })
    load()
  }
  async function setStatus(id: string, status: string) {
    await supabase.from('project_activities').update({ status }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }
  async function remove(id: string) {
    await supabase.from('project_activities').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }
  // Tarea de preparación colgada de la actividad: se gestiona individual sin
  // sacarla del conjunto del evento.
  async function addPrepTask(a: ProgramActivity) {
    const titulo = prompt(`Tarea de preparación para "${a.title}":`)
    if (!titulo?.trim()) return
    const { data, error } = await supabase.from('tasks').insert({
      title: titulo.trim(), event_id: eventId, activity_id: a.id, status: 'OPEN',
      due_date: a.date, deadline_type: 'HARD', client_impact: 'internal',
      created_by: userId ?? null, priority: 'MEDIUM', proof_required: false,
    }).select('id').single()
    if (error) { showToast(`No se pudo crear: ${error.message}`, 'error'); return }
    showToast('Tarea creada y ligada a la actividad.', 'success')
    load()
    if (data) onOpenTask?.(data.id)
  }

  const porDia = useMemo(() => {
    const m = new Map<string, ProgramActivity[]>()
    for (const a of items) { const arr = m.get(a.date) ?? []; arr.push(a); m.set(a.date, arr) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const inp: React.CSSProperties = {
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', padding: '0 9px', fontSize: 12.5, outline: 'none', minHeight: 38, boxSizing: 'border-box',
  }

  if (tableMissing) return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--status-attention)', margin: 0 }}>Falta correr el SQL del programa (project_program.sql) en Supabase para activar esta sección.</p>
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <CalendarDays size={13} style={{ color: '#E8A33D' }} />
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flex: 1 }}>
          Programa{items.length ? ` (${items.length} ${items.length === 1 ? 'actividad' : 'actividades'} · ${porDia.length} ${porDia.length === 1 ? 'día' : 'días'})` : ''}
        </span>
        {canWrite && (
          <button onClick={() => setAdding(v => !v)}
            style={{ minHeight: 32, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-default)', background: adding ? 'var(--accent-bg)' : 'transparent', color: adding ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Plus size={12} /> Actividad
          </button>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
          Sin programa aún. Aquí va lo que sucede durante el evento —con día y horario—, no el trabajo previo (eso son las tareas).
        </p>
      )}

      {porDia.map(([dia, acts]) => (
        <div key={dia} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 5px' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{diaLargo(dia)}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{acts.length}</span>
          </div>
          {acts.map(a => {
            const st = ACT_STATUS[a.status] ?? ACT_STATUS.planeada
            const tc = taskCounts[a.id]
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="num" style={{ width: 78, flexShrink: 0, fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', paddingTop: 2 }}>
                  {a.start_time ? `${a.start_time.slice(0, 5)}${a.end_time ? `–${a.end_time.slice(0, 5)}` : ''}` : 'sin hora'}
                </span>
                <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: st.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textDecoration: a.status === 'cancelada' ? 'line-through' : 'none', opacity: a.status === 'cancelada' ? 0.6 : 1 }}>{a.title}</div>
                  {(a.location || a.facilitator || tc) && (
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {a.location && <span>📍 {a.location}</span>}
                      {a.facilitator && <span>· {a.facilitator}</span>}
                      {tc && <span className="num" style={{ color: tc.hechas === tc.total ? 'var(--status-healthy)' : 'var(--text-tertiary)' }}>· {tc.hechas}/{tc.total} tareas</span>}
                    </div>
                  )}
                </div>
                {canWrite && (
                  <>
                    <select value={a.status} onChange={e => setStatus(a.id, e.target.value)} aria-label="Estado"
                      style={{ background: 'none', border: 'none', color: st.color, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer', outline: 'none', flexShrink: 0 }}>
                      {Object.entries(ACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => addPrepTask(a)} title="Agregar tarea de preparación para esta actividad"
                      style={{ width: 28, height: 28, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }}><ListPlus size={12} /></button>
                    <button onClick={() => remove(a.id)} aria-label="Quitar actividad"
                      style={{ width: 28, height: 28, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }}><Trash2 size={12} /></button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {canWrite && adding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" value={n.date} onChange={e => setN({ ...n, date: e.target.value })} className="num" style={{ ...inp, flex: 1 }} aria-label="Día" />
            <input type="time" value={n.ini} onChange={e => setN({ ...n, ini: e.target.value })} className="num" style={{ ...inp, width: 96 }} aria-label="Inicio" />
            <input type="time" value={n.fin} onChange={e => setN({ ...n, fin: e.target.value })} className="num" style={{ ...inp, width: 96 }} aria-label="Fin" />
          </div>
          <input value={n.title} onChange={e => setN({ ...n, title: e.target.value })} placeholder="Actividad — ej. Taller de ostiones"
            onKeyDown={e => { if (e.key === 'Enter') add() }} style={inp} />
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={n.location} onChange={e => setN({ ...n, location: e.target.value })} placeholder="Lugar" style={{ ...inp, flex: 1 }} />
            <input value={n.facilitator} onChange={e => setN({ ...n, facilitator: e.target.value })} placeholder="Quién la imparte" style={{ ...inp, flex: 1 }} />
            <button onClick={add} disabled={!n.title.trim() || !n.date}
              style={{ minHeight: 38, padding: '0 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: n.title.trim() && n.date ? 'var(--accent)' : 'var(--bg-base)', color: n.title.trim() && n.date ? 'var(--on-accent)' : 'var(--text-tertiary)', cursor: n.title.trim() && n.date ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 12 }}>
              Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PRESUPUESTO DEL PROYECTO — una sola lista para todo lo que cuesta ────────
// Un bartender y una maceta son partidas de gasto por igual: se capturan con
// tipo, zona, cantidad y costo unitario, y cada una puede traer su cotización
// (imagen o PDF) y su responsable. Los patrocinios entran como ingreso.
const SEL: React.CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)', padding: '0 8px', fontSize: 12, outline: 'none', minHeight: 40, cursor: 'pointer', boxSizing: 'border-box',
}

function BudgetSection({ event, buCode, canWrite, userId, people, showCorte = false, onTotals }: {
  event: EventPlan; buCode: string; canWrite: boolean; userId?: string
  people: { id: string; full_name: string | null }[]; showCorte?: boolean
  // La sección de Aprobación de arriba lee de aquí; así el monto que se aprueba
  // es exactamente el que se ve en la lista, siempre.
  onTotals?: (t: { gastos: number; ingresos: number; n: number }) => void
}) {
  const [items, setItems] = useState<BudgetItem[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [nConcept, setNConcept] = useState('')
  const [nAmount, setNAmount] = useState('')
  const [nIncome, setNIncome] = useState(false)
  const [nCat, setNCat] = useState('materiales')
  const [nArea, setNArea] = useState('')
  const [nQty, setNQty] = useState('1')
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const quoteRef = useRef<HTMLInputElement>(null)
  const [quoteFor, setQuoteFor] = useState<string | null>(null)

  const load = useCallback(() => {
    supabase.from('project_budget_items')
      .select('id, concept, amount, actual_amount, is_income, deal_id, category, area, qty, unit_cost, quote_url, quote_type, responsible')
      .eq('event_id', event.id).order('category').order('created_at')
      .then(({ data, error }) => {
        if (error) { setTableMissing(true); return }
        setTableMissing(false); setItems((data ?? []) as BudgetItem[])
      })
  }, [event.id])
  useEffect(() => { load() }, [load])

  // Cotización: imagen o PDF al bucket 'proofs', ligada a la partida
  async function subirCotizacion(file: File) {
    const itemId = quoteFor
    if (!itemId) return
    setSubiendo(itemId)
    const ext = file.name.split('.').pop()
    const path = `cotizaciones/${event.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (upErr) { setSubiendo(null); showToast(`No se pudo subir: ${upErr.message}`, 'error'); return }
    const { data: pub } = supabase.storage.from('proofs').getPublicUrl(path)
    const { error } = await supabase.from('project_budget_items')
      .update({ quote_url: pub.publicUrl, quote_type: file.type }).eq('id', itemId)
    setSubiendo(null); setQuoteFor(null)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, quote_url: pub.publicUrl, quote_type: file.type } : i))
    showToast('Cotización adjuntada.', 'success')
  }

  async function setCampo(id: string, patch: Partial<BudgetItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    const { error } = await supabase.from('project_budget_items').update(patch).eq('id', id)
    if (error) showToast(`No se pudo guardar: ${error.message}`, 'error')
  }

  // Corte: capturar el monto REAL de una partida (Δ contra presupuesto)
  async function setActual(item: BudgetItem, raw: string) {
    const v = raw === '' ? null : Math.max(0, Number(raw))
    if (v === item.actual_amount) return
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, actual_amount: v } : i))
    const { error } = await supabase.from('project_budget_items').update({ actual_amount: v }).eq('id', item.id)
    if (error) showToast(`No se pudo guardar el real: ${error.message}`, 'error')
  }

  // El monto se calcula cantidad × unitario; así "2 bartenders a $1,800" y
  // "renta de sonido $35,000" conviven en la misma lista sin cuentas aparte.
  async function add() {
    if (!nConcept.trim() || nAmount === '') return
    const qty = Math.max(1, Number(nQty) || 1)
    const unit = Number(nAmount)
    const { error } = await supabase.from('project_budget_items').insert({
      event_id: event.id, concept: nConcept.trim(), amount: unit * qty, is_income: nIncome,
      category: nIncome ? 'otro' : nCat, area: nArea.trim() || null,
      qty, unit_cost: unit, created_by: userId ?? null,
    })
    if (error) { showToast(`No se pudo agregar: ${error.message}`, 'error'); return }
    setNConcept(''); setNAmount(''); setNIncome(false); setNQty('1')
    load()
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
  useEffect(() => { onTotals?.({ gastos, ingresos, n: items.length }) }, [gastos, ingresos, items.length, onTotals])
  // Corte: totales reales (solo partidas con real capturado) y Δ vs presupuesto
  const conReal = items.filter(i => !i.is_income && i.actual_amount != null)
  const realGastos = conReal.reduce((s, i) => s + (i.actual_amount ?? 0), 0)
  const presupDeConReal = conReal.reduce((s, i) => s + i.amount, 0)
  const delta = realGastos - presupDeConReal
  const inp: React.CSSProperties = {
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none', minHeight: 40, boxSizing: 'border-box',
  }
  // Agrupado por tipo de gasto: se lee de qué está hecho el presupuesto
  const porCategoria = useMemo(() => {
    const m = new Map<string, BudgetItem[]>()
    for (const i of items.filter(x => !x.is_income)) {
      const arr = m.get(i.category) ?? []; arr.push(i); m.set(i.category, arr)
    }
    return CATEGORIAS.filter(c => m.has(c.id)).map(c => ({ cat: c, rows: m.get(c.id)! }))
  }, [items])
  const patrocinios = items.filter(i => i.is_income)

  if (tableMissing) return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--status-attention)', margin: 0 }}>Falta correr el SQL del presupuesto unificado (project_budget_v2.sql) en Supabase.</p>
    </div>
  )

  const fila = (i: BudgetItem) => (
    <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
      {i.qty > 1 && <span className="num" style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{i.qty}×</span>}
      <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: 'var(--text-primary)' }}>
        {i.concept}
        {i.area && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>· {i.area}</span>}
        {i.unit_cost != null && i.qty > 1 && <span className="num" style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>({mxn(i.unit_cost)} c/u)</span>}
      </span>

      {/* Responsable de la partida */}
      {canWrite ? (
        <select value={i.responsible ?? ''} onChange={e => setCampo(i.id, { responsible: e.target.value || null })}
          title="Responsable de esta partida"
          style={{ ...SEL, minHeight: 30, fontSize: 10.5, maxWidth: 110, color: i.responsible ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
          <option value="">sin dueño</option>
          {people.filter(p => (p.full_name ?? '').trim()).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      ) : i.responsible && (
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{people.find(p => p.id === i.responsible)?.full_name}</span>
      )}

      {/* Cotización */}
      {i.quote_url ? (
        <a href={i.quote_url} target="_blank" rel="noreferrer" title="Ver cotización"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--status-healthy)', border: '1px solid color-mix(in srgb, var(--status-healthy) 40%, transparent)', borderRadius: 999, padding: '3px 8px', textDecoration: 'none', flexShrink: 0 }}>
          <Paperclip size={10} /> cotización
        </a>
      ) : canWrite && (
        <button onClick={() => { setQuoteFor(i.id); quoteRef.current?.click() }} title="Adjuntar cotización (imagen o PDF)"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-tertiary)', border: '1px dashed var(--border-default)', borderRadius: 999, padding: '3px 8px', background: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <Paperclip size={10} /> {subiendo === i.id ? 'subiendo…' : 'cotización'}
        </button>
      )}

      {i.is_income && (
        <button onClick={() => canWrite && toDeal(i)} title={i.deal_id ? 'Abrir deal en Comercial' : 'Crear deal de patrocinio en Comercial'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 28, padding: '0 8px', borderRadius: 999, border: `1px solid ${i.deal_id ? 'var(--status-healthy)' : 'var(--accent-border)'}`, background: 'none', color: i.deal_id ? 'var(--status-healthy)' : 'var(--accent)', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
          🤝 {i.deal_id ? 'Deal ligado' : 'Crear deal'}
        </button>
      )}
      <span className="num" style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', color: i.is_income ? 'var(--status-healthy)' : 'var(--text-secondary)', flexShrink: 0 }}>
        {i.is_income ? '+' : '−'}{mxn(i.amount)}
      </span>
      {showCorte && (
        <input type="number" inputMode="numeric" min={0} defaultValue={i.actual_amount ?? ''} placeholder="real $"
          disabled={!canWrite} onBlur={e => setActual(i, e.target.value)} className="num"
          title="Monto real gastado/recibido (corte)"
          style={{ width: 78, minHeight: 32, background: 'var(--bg-base)', border: `1px solid ${i.actual_amount != null ? (i.is_income ? 'var(--status-healthy)' : i.actual_amount > i.amount ? 'var(--status-risk)' : 'var(--status-healthy)') : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-mono)', flexShrink: 0 }} />
      )}
      {canWrite && (
        <button onClick={() => remove(i.id)} aria-label="Quitar partida" style={{ width: 30, height: 30, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }}><Trash2 size={12} /></button>
      )}
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <input ref={quoteRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) subirCotizacion(f); e.target.value = '' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flex: 1 }}>Presupuesto del proyecto</span>
        {(gastos > 0 || ingresos > 0) && (
          <span className="num" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            Gastos {mxn(gastos)}{ingresos > 0 && <> · Patrocinios <span style={{ color: 'var(--status-healthy)' }}>{mxn(ingresos)}</span> · Neto {mxn(gastos - ingresos)}</>}
            {showCorte && conReal.length > 0 && (
              <> · Real {mxn(realGastos)} · <span style={{ color: delta <= 0 ? 'var(--status-healthy)' : 'var(--status-risk)', fontWeight: 700 }}>Δ {delta > 0 ? '+' : ''}{mxn(delta)}</span></>
            )}
          </span>
        )}
      </div>

      {items.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>
          Sin partidas aún. Aquí va TODO lo que cuesta el proyecto — desde 2 bartenders hasta 8 macetas —, con su tipo, su cotización y su responsable.
        </p>
      )}

      {porCategoria.map(({ cat, rows }) => {
        const sub = rows.reduce((s, r) => s + r.amount, 0)
        return (
          <div key={cat.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 2px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{cat.label}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              <span className="num" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{mxn(sub)}</span>
            </div>
            {rows.map(fila)}
          </div>
        )
      })}

      {patrocinios.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 2px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-healthy)', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--status-healthy)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>Patrocinios / ingresos</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span className="num" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--status-healthy)' }}>{mxn(ingresos)}</span>
          </div>
          {patrocinios.map(fila)}
        </div>
      )}

      {canWrite && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
          <input type="number" inputMode="numeric" min={1} value={nQty} onChange={e => setNQty(e.target.value)}
            className="num" style={{ ...inp, width: 52, textAlign: 'center' }} aria-label="Cantidad" title="Cantidad" />
          <input value={nConcept} onChange={e => setNConcept(e.target.value)} placeholder="Bartender, maceta, proyector, renta de sonido…"
            onKeyDown={e => { if (e.key === 'Enter') add() }} style={{ ...inp, flex: 1, minWidth: 160 }} />
          {!nIncome && (
            <select value={nCat} onChange={e => setNCat(e.target.value)} style={{ ...SEL, width: 118 }} title="Tipo de gasto">
              {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}
          <input value={nArea} onChange={e => setNArea(e.target.value)} placeholder="Zona" title="Zona o área (bar, cocina, terraza…)"
            style={{ ...inp, width: 90 }} />
          <input type="number" inputMode="numeric" min={0} value={nAmount} onChange={e => setNAmount(e.target.value)}
            placeholder="$ c/u" className="num" style={{ ...inp, width: 88 }} title="Costo unitario" />
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
function EventSheet({ event, templates, buList, people, canWrite, canApprove, userId, userRole, isMobile, onOpenTask, onClose, onSaved }: {
  event: EventPlan | null
  templates: Template[]
  buList: { id: string; code: string; name: string }[]
  people: { id: string; full_name: string | null }[]
  canWrite: boolean
  canApprove: boolean
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
  const [actualAtt, setActualAtt] = useState(event?.actual_attendance != null ? String(event.actual_attendance) : '')
  const [requirements, setRequirements] = useState(event?.requirements ?? '')
  const [collaborators, setCollaborators] = useState(event?.collaborators ?? '')
  const [responsible, setResponsible] = useState(event?.responsible ?? '')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'idea')
  const [saving, setSaving] = useState(false)
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [related, setRelated] = useState<string[]>([])
  const [relQ, setRelQ] = useState('')
  // Los totales viven aquí para que Aprobación y Presupuesto muestren SIEMPRE
  // la misma cifra — antes cada uno consultaba por su cuenta y se desfasaban
  const [totales, setTotales] = useState<{ gastos: number; ingresos: number; n: number } | null>(null)
  // El chat se abre y cierra como en Airtable, y la elección se recuerda:
  // quien trabaja solo no quiere una columna vacía comiéndose la pantalla.
  const [chatOpen, setChatOpen] = useState(() => localStorage.getItem('hog_project_chat') !== '0')
  function toggleChat() {
    setChatOpen(v => { localStorage.setItem('hog_project_chat', v ? '0' : '1'); return !v })
  }
  async function copiarLink() {
    if (!event) return
    const url = `${window.location.origin}${window.location.pathname}?project=${event.id}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('Link del proyecto copiado — quien lo abra aterriza aquí.', 'success')
      logActivity('event_shared', 'event', event.id, { name: event.name })
    } catch { showToast('No se pudo copiar el link.', 'error') }
  }
  const [taskFollowers, setTaskFollowers] = useState<Record<string, string[]>>({})
  const [bulkTasks, setBulkTasks] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [reqTaskId, setReqTaskId] = useState(event?.requisition_task_id ?? null)
  const canDelete = ['MASTER', 'OPS_MANAGER'].includes(userRole ?? '')
  const buCode = buList.find(b => b.id === (event?.bu_id ?? buId))?.code ?? ''
  // La ventana crece con la pantalla: en un monitor grande el proyecto tiene
  // presupuesto, programa y tareas — apretarlo a 520px lo vuelve un túnel.
  const anchoBase = typeof window !== 'undefined' && window.innerWidth >= 1500 ? 860
    : typeof window !== 'undefined' && window.innerWidth >= 1200 ? 720 : 560
  // El chat como COLUMNA (no al fondo del scroll) solo cabe si hay pantalla:
  // apretado bajo 720px le robaría ancho al formulario, que es el trabajo real
  const chatEnColumna = !!event && chatOpen && !isMobile && anchoBase >= 720
  const anchoVentana = chatEnColumna ? anchoBase + 330 : anchoBase
  // Corte post-evento: se abre cuando el plan terminó (Realizado o fecha pasada)
  const todayISO = new Date().toISOString().slice(0, 10)
  const showCorte = !!event && (status === 'done' || !!((event.end_date ?? event.date) && (event.end_date ?? event.date)! < todayISO))

  // Plantilla elegida en modo creación: pre-carga tipo y bullets; recursos y
  // presupuesto se insertan al guardar (necesitan el id del plan)
  function applyTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find(x => x.id === id)
    if (!t) return
    setKind(t.kind)
    setType(t.event_type)
    if (t.task_bullets) setBulkTasks(t.task_bullets)
  }

  // Guardar el plan actual (recursos + partidas + tareas) como plantilla
  async function saveAsTemplate() {
    if (!event) return
    const tname = window.prompt('Nombre de la plantilla:', `${kind === 'evento' ? TYPE_META[type].label : KIND_META[kind].label} — ${name}`)
    if (!tname?.trim()) return
    const [{ data: res }, { data: bud }, { data: tks }] = await Promise.all([
      supabase.from('project_resources').select('name, qty, unit_cost').eq('event_id', event.id),
      supabase.from('project_budget_items').select('concept, amount, is_income').eq('event_id', event.id),
      supabase.from('tasks').select('title').eq('event_id', event.id),
    ])
    const { error } = await supabase.from('project_templates').insert({
      name: tname.trim(), kind, event_type: type,
      resources: res ?? [], budget_items: bud ?? [],
      task_bullets: (tks ?? []).map(t => `- ${t.title}`).join('\n') || null,
      created_by: userId ?? null,
    })
    if (error) { showToast(`No se pudo guardar la plantilla: ${error.message}`, 'error'); return }
    showToast(`Plantilla "${tname.trim()}" guardada — disponible al crear planes nuevos.`, 'success')
  }

  // Requisición operativa: los recursos del plan llegan al gerente del venue
  // como tarea de alta prioridad en el Task Manager (+ aviso a Slack)
  async function sendRequisition() {
    if (!event) return
    if (reqTaskId) { onOpenTask?.(reqTaskId); return }
    const [{ data: res }, { data: bud }] = await Promise.all([
      supabase.from('project_resources').select('name, qty, unit_cost').eq('event_id', event.id),
      supabase.from('project_budget_items').select('concept, amount, is_income').eq('event_id', event.id),
    ])
    if (!(res ?? []).length) { showToast('Agrega primero los recursos requeridos.', 'error'); return }
    const gastos = (bud ?? []).filter(b => !b.is_income).reduce((s, b) => s + b.amount, 0)
    const desc = [
      `Requisición de recursos — ${event.name} (${buCode})`,
      event.date ? `Fecha: ${event.date}${event.end_date ? ` → ${event.end_date}` : ''}${startTime ? ` · ${startTime}` : ''}` : '',
      '',
      'RECURSOS REQUERIDOS:',
      ...(res ?? []).map(r => `- ${r.qty}× ${r.name}${r.unit_cost != null ? ` (${mxn(r.unit_cost)} c/u)` : ''}`),
      gastos > 0 ? `\nPresupuesto de gastos del plan: ${mxn(gastos)}` : '',
      '',
      'Confirmar plantilla del turno e insumos/inventario necesarios.',
    ].filter(Boolean).join('\n')
    const { data: task, error } = await supabase.from('tasks').insert({
      title: `Requisición — ${event.name}${event.date ? ` (${event.date})` : ''}`,
      description: desc, status: 'OPEN', priority: 'HIGH', deadline_type: 'HARD',
      bu_id: event.bu_id, due_date: event.date, event_id: event.id,
      area: 'piso', client_impact: 'internal', created_by: userId ?? null,
    }).select('id, title, status, assigned_to, due_date, estimated_hours').single()
    if (error || !task) { showToast(`No se pudo crear la requisición: ${error?.message}`, 'error'); return }
    await supabase.from('event_plans').update({ requisition_task_id: task.id }).eq('id', event.id)
    setReqTaskId(task.id)
    setTasks(prev => [...prev, task as TaskLite])
    logActivity('task_created', 'task', task.id, { title: task.title, via: 'requisicion', event: event.name })
    notifySlack(`📋 *Requisición de recursos* — ${event.name} (${buCode})${event.date ? ` · ${event.date}` : ''}\n${(res ?? []).slice(0, 6).map(r => `• ${r.qty}× ${r.name}`).join('\n')}${(res ?? []).length > 6 ? `\n…y ${(res ?? []).length - 6} más` : ''}`)
    showToast('Requisición enviada al Task Manager del venue.', 'success')
  }

  const loadTasks = useCallback(async () => {
    if (!event) return
    const { data } = await supabase.from('tasks').select('id, title, status, assigned_to, due_date, estimated_hours').eq('event_id', event.id).order('created_at')
    const ts = (data ?? []) as TaskLite[]
    setTasks(ts)
    if (!ts.length) return
    // Relacionados (seguidores) de cada tarea — para los círculos apilados
    const { data: fl } = await supabase.from('task_followers').select('task_id, user_id').in('task_id', ts.map(t => t.id))
    const m: Record<string, string[]> = {}
    for (const f of (fl ?? []) as { task_id: string; user_id: string }[]) (m[f.task_id] = m[f.task_id] ?? []).push(f.user_id)
    setTaskFollowers(m)
  }, [event])
  useEffect(() => { loadTasks() }, [loadTasks])
  // Al guardar algo en la subventana de tarea, esta lista se refresca sola
  useEffect(() => {
    window.addEventListener('hog:task-updated', loadTasks)
    return () => window.removeEventListener('hog:task-updated', loadTasks)
  }, [loadTasks])

  // Relacionados del equipo — se guardan al instante, sin esperar a Guardar
  useEffect(() => {
    if (!event) return
    supabase.from('project_collaborators').select('user_id').eq('event_id', event.id)
      .then(({ data }) => setRelated((data ?? []).map(r => r.user_id as string)))
  }, [event])
  async function toggleRelated(uid: string) {
    if (!event) return
    const on = related.includes(uid)
    setRelated(prev => on ? prev.filter(x => x !== uid) : [...prev, uid])
    const { error } = on
      ? await supabase.from('project_collaborators').delete().eq('event_id', event.id).eq('user_id', uid)
      : await supabase.from('project_collaborators').insert({ event_id: event.id, user_id: uid })
    if (error) {
      setRelated(prev => on ? [...prev, uid] : prev.filter(x => x !== uid))
      showToast(`No se pudo guardar: ${error.message}`, 'error')
    }
  }

  // Vincular tareas EXISTENTES del Task Manager al proyecto (y desvincular)
  const [linkQ, setLinkQ] = useState('')
  const [linkResults, setLinkResults] = useState<{ id: string; title: string; status: string }[]>([])
  useEffect(() => {
    if (!event || linkQ.trim().length < 2) { setLinkResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('tasks')
        .select('id, title, status')
        .is('event_id', null).eq('archived', false)
        .ilike('title', `%${linkQ.trim()}%`)
        .order('created_at', { ascending: false }).limit(8)
      setLinkResults((data ?? []) as { id: string; title: string; status: string }[])
    }, 250)
    return () => clearTimeout(t)
  }, [linkQ, event])

  async function linkTask(taskId: string) {
    if (!event) return
    const { error } = await supabase.from('tasks').update({ event_id: event.id }).eq('id', taskId)
    if (error) { showToast(`No se pudo vincular: ${error.message}`, 'error'); return }
    logActivity('task_linked', 'event', event.id, { task: taskId, event: event.name })
    showToast('Tarea vinculada al proyecto.', 'success')
    setLinkQ(''); setLinkResults([])
    loadTasks()
  }

  async function unlinkTask(taskId: string) {
    const { error } = await supabase.from('tasks').update({ event_id: null }).eq('id', taskId)
    if (error) { showToast(`No se pudo desvincular: ${error.message}`, 'error'); return }
    showToast('Tarea desvinculada — sigue viva en Tareas.', 'success')
    loadTasks()
  }

  // Bullets → tareas reales en el Task Manager, ligadas al evento
  async function pushBulkTasks(eventId: string, eventName: string, eventBu: string, eventDate: string | null): Promise<number> {
    const lines = parseBullets(bulkTasks)
    if (!lines.length) return 0
    const rows = lines.map(title => ({
      title, status: 'OPEN', priority: 'MEDIUM', deadline_type: 'SOFT',
      bu_id: eventBu, due_date: eventDate, event_id: eventId, created_by: userId ?? null,
    }))
    const { data, error } = await supabase.from('tasks').insert(rows).select('id, title, status, assigned_to, due_date, estimated_hours')
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
      actual_attendance: actualAtt !== '' ? Math.max(0, Number(actualAtt)) : null,
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
      // Plantilla elegida → pre-cargar sus recursos y partidas de presupuesto
      const tpl = templates.find(t => t.id === templateId)
      if (tpl) {
        if (tpl.resources?.length) {
          await supabase.from('project_resources').insert(tpl.resources.map(r => ({
            event_id: data.id, name: r.name, qty: r.qty || 1, unit_cost: r.unit_cost ?? null,
          })))
        }
        if (tpl.budget_items?.length) {
          await supabase.from('project_budget_items').insert(tpl.budget_items.map(b => ({
            event_id: data.id, concept: b.concept, amount: b.amount || 0, is_income: !!b.is_income,
          })))
        }
      }
      if (n || tpl) showToast(`Plan creado${tpl ? ` con la plantilla "${tpl.name}"` : ''}${n ? ` y ${n} tareas` : ''}.`, 'success')
    }
    if (event) showToast('Evento guardado.', 'success')
    onSaved()
  }

  // Nada se elimina: se archiva y se puede ver/restaurar con el filtro Archivados.
  // Las tareas del proyecto se van con él — se avisa cuántas antes de confirmar.
  async function archiveEvent() {
    if (!event) return
    const conTareas = tasks.length ? ` Sus ${tasks.length} ${tasks.length === 1 ? 'tarea se archiva' : 'tareas se archivan'} con él.` : ''
    if (!window.confirm(`¿Archivar "${event.name}"?${conTareas} No se borra nada — lo encuentras con el filtro Archivados y lo puedes restaurar.`)) return
    const r = await archivarPlanConTareas(event.id, true)
    if (r.error) { showToast(`No se pudo archivar: ${r.error}`, 'error'); return }
    if (r.tareasError) showToast(`Proyecto archivado, pero sus tareas no: ${r.tareasError}`, 'error')
    else showToast(`Archivado${sufijoTareas(r.nTareas)}.`, 'success')
    logActivity('event_archived', 'event', event.id, { name: event.name, tareas: r.nTareas })
    window.dispatchEvent(new CustomEvent('hog:task-updated'))
    onSaved()
  }

  const inp: React.CSSProperties = {
    width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
  const bulkPending = parseBullets(bulkTasks).length

  return (
    // Ancho según pantalla: en monitores grandes el proyecto merece espacio —
    // capturar presupuesto y programa en una columna de 520px era estrangularlo.
    <Sheet open onClose={onClose} isMobile={isMobile} width={anchoVentana} tall={!!event}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Barra de estado FIJA: al volver de una distracción se sabe de
            inmediato en qué proyecto se está trabajando, quién responde y
            en qué fase va — sin tener que scrollear hacia arriba. */}
        <div style={{ flexShrink: 0, padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {event && <BUChip code={buCode} size="sm" />}
            <h2 style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 800, margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {event ? (name || event.name) : 'Nuevo proyecto'}
            </h2>
            {/* Compartir y chat viven en el marco, no dentro del scroll: son
                acciones sobre la ventana entera, disponibles siempre */}
            {event && (
              <>
                <button onClick={copiarLink} title="Copiar link del proyecto — quien lo abra aterriza aquí"
                  style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Link2 size={15} />
                </button>
                <button onClick={toggleChat} title={chatOpen ? 'Ocultar conversación' : 'Mostrar conversación'}
                  style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: chatOpen ? 'var(--accent-bg)' : 'none', color: chatOpen ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageCircle size={15} />
                </button>
                <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', flexShrink: 0 }} />
              </>
            )}
            <button onClick={onClose} aria-label="Cerrar" style={{ width: 34, height: 34, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}><X size={16} /></button>
          </div>
          {event && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
              <StatusBadgeV2 tone={STATUS_META[status]?.tone ?? 'neutral'} label={STATUS_META[status]?.label ?? status} />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <UserPlus size={10} /> {people.find(p => p.id === responsible)?.full_name ?? 'sin responsable'}
              </span>
              {(date || endDate) && (
                <span className="num" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {date ? new Date(date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'}
                  {endDate && endDate !== date ? ` – ${new Date(endDate + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : ''}
                </span>
              )}
              {tasks.length > 0 && (
                <span className="num" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                  {tasks.filter(t => t.status === 'APPROVED').length}/{tasks.length} tareas
                </span>
              )}
            </div>
          )}
        </div>

      {/* Cuerpo en dos columnas: el trabajo a la izquierda, la conversación
          fija a la derecha. Antes el chat vivía al final del scroll — para
          escribirle a alguien había que recorrer todo el proyecto, y mientras
          escribías perdías de vista lo que estabas comentando. */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 'var(--space-3)' }}>
          {/* Plantilla (solo al crear): pre-carga recursos, partidas y tareas */}
          {!event && templates.length > 0 && (
            <div>
              <label style={lbl}>Usar plantilla (opcional)</label>
              <select value={templateId} onChange={e => applyTemplate(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">Desde cero</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

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
                {/* Los perfiles sin nombre salían como "—": imposible elegir a
                    quién estás nombrando responsable de un presupuesto */}
                {people.filter(p => (p.full_name ?? '').trim() || p.id === responsible)
                  .map(p => <option key={p.id} value={p.id}>{p.full_name || 'Sin nombre'}</option>)}
              </select>
            </div>
          </div>

          {/* Relacionados: el equipo interno involucrado, además del responsable.
              Distinto de "colaboradores / talento", que es gente externa.
              Antes se listaba a TODO el directorio como chips — un muro de 25
              botones donde los seleccionados se perdían entre los demás. Ahora
              arriba van los elegidos y abajo se busca por nombre; la gente sin
              nombre capturado (chips "—") ya no aparece: no se puede elegir a
              alguien que no se puede identificar. */}
          {event && (() => {
            const elegibles = people.filter(p => p.id !== responsible && (p.full_name ?? '').trim())
            const q = relQ.trim().toLowerCase()
            const sugeridos = elegibles
              .filter(p => !related.includes(p.id))
              .filter(p => !q || (p.full_name ?? '').toLowerCase().includes(q))
            const chip = (p: { id: string; full_name: string | null }, on: boolean) => (
              <button key={p.id} onClick={() => canWrite && toggleRelated(p.id)} disabled={!canWrite}
                title={on ? 'Quitar del equipo' : 'Agregar al equipo'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: on ? '0 8px 0 4px' : '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: canWrite ? 'pointer' : 'default', background: on ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${on ? 'var(--accent-border)' : 'var(--border-default)'}`, color: on ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {on && <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', fontSize: 8.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initialsOf(p.full_name)}</span>}
                {p.full_name}
                {on && <X size={11} style={{ opacity: 0.7 }} />}
              </button>
            )
            return (
              <div>
                <label style={lbl}>Relacionados del equipo {related.length > 0 && `· ${related.length}`}</label>
                {related.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {related.map(id => elegibles.find(p => p.id === id)).filter(Boolean).map(p => chip(p!, true))}
                  </div>
                )}
                {canWrite && (
                  <>
                    <input value={relQ} onChange={e => setRelQ(e.target.value)}
                      placeholder={related.length ? 'Agregar a alguien más — busca por nombre…' : 'Busca por nombre para sumar a alguien…'}
                      style={{ ...inp, minHeight: 40, fontSize: 12.5 }} />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {/* Sin búsqueda se muestran unos cuantos, no el directorio entero */}
                      {sugeridos.slice(0, q ? 12 : 6).map(p => chip(p, false))}
                      {!q && sugeridos.length > 6 && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                          y {sugeridos.length - 6} más — búscalos por nombre
                        </span>
                      )}
                      {q && sugeridos.length === 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', alignSelf: 'center' }}>Nadie con ese nombre.</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })()}

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
              {(Object.keys(STATUS_META) as EventStatus[]).map(s => {
                // 'En aprobación' y 'Aprobado' se manejan por el flujo de
                // aprobación — solo el Aprobador puede fijarlos a mano
                const locked = !canApprove && ['review', 'approved'].includes(s) && status !== s
                return (
                  <button key={s} onClick={() => canWrite && !locked && setStatus(s)}
                    title={locked ? 'Se asigna vía el flujo de aprobación' : undefined}
                    style={{ minHeight: 38, padding: '0 12px', borderRadius: 999, cursor: canWrite && !locked ? 'pointer' : 'default', fontSize: 12, fontWeight: 600, opacity: locked ? 0.45 : 1, background: status === s ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${status === s ? 'var(--accent)' : 'var(--border-default)'}`, color: status === s ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    {STATUS_META[s].label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Flujo de aprobación (Gerente de Eficiencia) */}
          {event && (
            <ApprovalSection event={event} buCode={buCode} canWrite={canWrite} canApprove={canApprove}
              userId={userId} people={people} status={status}
              totales={totales} nPartidas={totales?.n ?? 0} onStatus={setStatus} />
          )}

          {/* Recursos y presupuesto por partidas (requieren el plan guardado) */}
          {event ? (
            <>
              {/* Corte post-evento: real vs presupuesto (aparece al terminar) */}
              {showCorte && (
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12, border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                  <label style={{ ...lbl, marginBottom: 8 }}>📊 Corte post-evento</label>
                  {kind === 'evento' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={lbl}>Asistencia esperada</label>
                        <div className="num" style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 14, color: 'var(--text-secondary)', background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)' }}>{expectedAtt || '—'}</div>
                      </div>
                      <div>
                        <label style={lbl}>Asistencia real</label>
                        <input type="number" inputMode="numeric" min={0} value={actualAtt} onChange={e => setActualAtt(e.target.value)} className="num" style={inp} disabled={!canWrite} placeholder="0" />
                      </div>
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                    Captura los montos reales por partida abajo (campo "real $") — el Δ contra presupuesto se calcula solo. Guarda para registrar la asistencia real.
                  </p>
                </div>
              )}
              <ProgramSection eventId={event.id} defaultDate={event.date} canWrite={canWrite} userId={userId} onOpenTask={onOpenTask} />
              <BudgetSection event={event} buCode={buCode} canWrite={canWrite} userId={userId} people={people} showCorte={showCorte} onTotals={setTotales} />
              {canWrite && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* Secundario a propósito: la acción principal del proyecto es
                      enviar a aprobación (arriba). La requisición es otra cosa
                      —le pasa la lista al gerente del venue como tarea— y en
                      acento competía con ella como si fueran alternativas. */}
                  <button onClick={sendRequisition} title="Crea una tarea en el Task Manager del venue con la lista de recursos, para que el gerente la ejecute"
                    style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: 999, border: `1px solid ${reqTaskId ? 'var(--status-healthy)' : 'var(--border-default)'}`, background: reqTaskId ? 'color-mix(in srgb, var(--status-healthy) 10%, transparent)' : 'none', color: reqTaskId ? 'var(--status-healthy)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <ClipboardList size={15} /> {reqTaskId ? 'Requisición enviada — ver tarea' : 'Enviar requisición al gerente'}
                  </button>
                  <button onClick={saveAsTemplate}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <Save size={14} /> Guardar como plantilla
                  </button>
                </div>
              )}
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
              {tasks.map(t => {
                const done = t.status === 'APPROVED'
                const asigName = t.assigned_to ? (people.find(p => p.id === t.assigned_to)?.full_name ?? null) : null
                const rel = (taskFollowers[t.id] ?? []).filter(uid => uid !== t.assigned_to)
                const relNames = rel.map(uid => people.find(p => p.id === uid)?.full_name ?? '¿?')
                const n = new Date()
                const hoy = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
                const dueDays = t.due_date ? Math.round((new Date(t.due_date + 'T00:00:00').getTime() - new Date(hoy + 'T00:00:00').getTime()) / 86400000) : null
                // Semáforo del deadline: rojo vencida · ámbar ≤2 días · gris con margen
                const dueColor = done || dueDays === null ? 'var(--text-tertiary)'
                  : dueDays < 0 ? 'var(--status-risk)' : dueDays <= 2 ? '#E8A33D' : 'var(--text-tertiary)'
                const dueLabel = t.due_date ? new Date(t.due_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null
                const ph = phaseOf(t.status)
                return (
                  <button key={t.id} onClick={() => onOpenTask?.(t.id)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 5, width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${ph.color}`, borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left', minHeight: 44, marginBottom: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{t.title}</span>
                      <FunnelBar status={t.status} />
                      {event && (
                        <span role="button" title="Desvincular del proyecto (la tarea sigue viva en Tareas)"
                          onClick={e => { e.stopPropagation(); unlinkTask(t.id) }}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }}>
                          <Unlink size={11} />
                        </span>
                      )}
                    </span>
                    {/* Iconografía: asignado · relacionados · estimado · deadline */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {asigName ? (
                        <span title={`Asignada a ${asigName}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 8, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initialsOf(asigName)}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asigName}</span>
                        </span>
                      ) : (
                        <span title="Sin asignar" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1px dashed var(--border-strong)', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><UserPlus size={9} /></span>
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Sin asignar</span>
                        </span>
                      )}
                      {relNames.length > 0 && (
                        <span title={`Relacionados: ${relNames.join(', ')}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {relNames.slice(0, 3).map((nm, i) => (
                            <span key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', fontSize: 7.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: i === 0 ? 0 : -5, flexShrink: 0 }}>{initialsOf(nm)}</span>
                          ))}
                          {relNames.length > 3 && <span className="num" style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 3, fontFamily: 'var(--font-mono)' }}>+{relNames.length - 3}</span>}
                        </span>
                      )}
                      {t.estimated_hours != null && (
                        <span title={`Tiempo estimado: ${t.estimated_hours} h`} className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          <Clock size={10} /> {t.estimated_hours}h
                        </span>
                      )}
                      {dueLabel && (
                        <span title={dueDays! < 0 && !done ? `Deadline vencido (${dueLabel})` : `Deadline: ${dueLabel}`} className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: dueColor, fontWeight: dueDays! < 0 && !done ? 800 : 600, fontFamily: 'var(--font-mono)' }}>
                          <CalendarDays size={10} /> {dueLabel}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
              {/* Vincular una tarea que YA existe en el Task Manager */}
              {event && (
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Link2 size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input value={linkQ} onChange={e => setLinkQ(e.target.value)}
                    placeholder="Vincular tarea existente — busca por título…"
                    style={{ ...inp, minHeight: 40, fontSize: 12, paddingLeft: 30 }} />
                  {linkResults.length > 0 && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'hidden', zIndex: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                      {linkResults.map(r => (
                        <button key={r.id} onMouseDown={e => { e.preventDefault(); linkTask(r.id) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 40, padding: '0 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                          <Link2 size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{r.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {linkQ.trim().length >= 2 && linkResults.length === 0 && (
                    <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Sin tareas sueltas con ese título (solo se listan las que no pertenecen a otro proyecto).</p>
                  )}
                </div>
              )}
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

          {/* Chat inline solo cuando NO cabe como columna (móvil o ventana
              angosta): la conversación no puede desaparecer por falta de ancho */}
          {event && chatOpen && !chatEnColumna && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <MessageCircle size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Conversación</span>
              </div>
              <EntityChat scope="event" entityId={event.id} entityLabel={event.name} notifyUserIds={[event.responsible]} />
            </div>
          )}

          {canWrite && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={saving}
                style={{ flex: 1, minHeight: 48, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Guardando…' : event ? 'Guardar cambios' : 'Crear evento'}
              </button>
              {event && canDelete && (
                <button onClick={archiveEvent} title="Archivar (nada se elimina)"
                  style={{ minHeight: 48, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--status-risk)', cursor: 'pointer' }}>
                  <Archive size={15} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

        {/* Riel de conversación — fijo mientras el proyecto se scrollea al lado */}
        {chatEnColumna && event && (
          <aside style={{ width: 330, flexShrink: 0, borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <MessageCircle size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flex: 1 }}>Conversación</span>
              <button onClick={toggleChat} aria-label="Ocultar conversación"
                style={{ width: 26, height: 26, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={13} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 12px 12px' }}>
              <EntityChat scope="event" entityId={event.id} entityLabel={event.name} notifyUserIds={[event.responsible]} fill />
            </div>
          </aside>
        )}
      </div>
      </div>
    </Sheet>
  )
}
