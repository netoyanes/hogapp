import { useEffect, useState, useCallback, useRef } from 'react'
import { Filter, ArrowRightLeft, LayoutGrid, List, ChevronDown, ChevronRight, Paperclip, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TaskCard } from '../components/ui/TaskCard'
import { CreateTaskModal } from '../components/ui/CreateTaskModal'
import { TaskDetailPanel } from '../components/ui/TaskDetailPanel'
import { EmptyState } from '../components/ui/EmptyState'
import { SegmentedControl, Sheet } from '../components/v2'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { useIsMobile } from '../hooks/useIsMobile'
import { changeTaskStatus } from '../lib/taskActions'
import { logActivity } from '../hooks/useActivityLog'
import type { Task, TaskStatus, TaskPriority, TaskArea } from '../types'
import { TASK_AREA_LABELS, TASK_AREA_GROUPS } from '../lib/taskAreas'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'OPEN', label: 'Abiertas' },
  { id: 'IN_PROGRESS', label: 'En curso' },
  { id: 'PROOF_SUBMITTED', label: 'Evidencia' },
  { id: 'APPROVED', label: 'Aprobadas' },
  { id: 'REVISION', label: 'Revisión' },
]

const STATUS_COLORS: Record<TaskStatus, string> = {
  OPEN: 'var(--status-none)',
  IN_PROGRESS: 'var(--accent)',
  PROOF_SUBMITTED: 'var(--status-attention)',
  APPROVED: 'var(--status-healthy)',
  REVISION: 'var(--status-risk)',
}

interface Props {
  userRole?: string
  defaultBuFilter?: string
  userId?: string
}

export function TaskBoard({ userRole, defaultBuFilter, userId }: Props) {
  const isMobile = useIsMobile()
  const [tasks, setTasks] = useState<Task[]>([])
  const [buMap, setBuMap] = useState<Record<string, string>>({})
  const [buNameMap, setBuNameMap] = useState<Record<string, string>>({})
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})
  const [followerMap, setFollowerMap] = useState<Record<string, Set<string>>>({})
  const [proofCounts, setProofCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('')
  const [filterArea, setFilterArea] = useState<TaskArea | ''>('')
  const [filterBu, setFilterBu] = useState(defaultBuFilter ?? '')
  const [filterAssignee, setFilterAssignee] = useState(userId ?? '')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // Mobile: active status segment + swipe-to-change-status target
  const [mobileStatus, setMobileStatus] = useState<TaskStatus>('OPEN')
  const [statusSheetTask, setStatusSheetTask] = useState<Task | null>(null)
  // Vista Kanban ↔ Lista agrupada — cada quien elige y queda como su default
  const [view, setViewState] = useState<'kanban' | 'list'>(() =>
    localStorage.getItem('hog_tasks_view') === 'list' ? 'list' : 'kanban')
  const setView = (v: 'kanban' | 'list') => { setViewState(v); localStorage.setItem('hog_tasks_view', v) }

  useEffect(() => {
    if (defaultBuFilter !== undefined) setFilterBu(defaultBuFilter)
  }, [defaultBuFilter])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])

  const load = useCallback(async () => {
    const [{ data: taskData }, { data: buses }, { data: profiles }, { data: followers }, { data: proofs }] = await Promise.all([
      supabase.from('tasks').select('*').eq('archived', showArchived).order('created_at', { ascending: false }),
      supabase.from('business_units').select('id, code, name').order('name'),
      supabase.from('profiles').select('id, full_name, email').not('full_name', 'is', null),
      supabase.from('task_followers').select('task_id, user_id'),
      supabase.from('task_proofs').select('task_id, archived'),
    ])
    setTasks(taskData ?? [])
    setBuList(buses ?? [])
    const bm: Record<string, string> = {}
    buses?.forEach((b) => { bm[b.id] = `${b.code}` })
    setBuMap(bm)
    const bnm: Record<string, string> = {}
    buses?.forEach((b) => { bnm[b.id] = `${b.code} ${b.name}` })
    setBuNameMap(bnm)
    const pm: Record<string, string> = {}
    profiles?.forEach((p) => { pm[p.id] = p.full_name ?? p.email ?? 'Unknown' })
    setProfileMap(pm)
    const fm: Record<string, Set<string>> = {}
    followers?.forEach((f) => {
      if (!fm[f.user_id]) fm[f.user_id] = new Set()
      fm[f.user_id].add(f.task_id)
    })
    setFollowerMap(fm)
    const pc: Record<string, number> = {}
    proofs?.forEach((p) => { if (!p.archived) pc[p.task_id] = (pc[p.task_id] ?? 0) + 1 })
    setProofCounts(pc)
    setLoading(false)
  }, [showArchived])

  useEffect(() => {
    load()
  }, [load])

  // "Crear tarea" desde la command-palette (el atajo de tecla C se quitó
  // porque chocaba con copiar/pegar).
  useEffect(() => {
    const openCreate = () => setShowCreate(true)
    window.addEventListener('hog:create-task', openCreate)
    return () => window.removeEventListener('hog:create-task', openCreate)
  }, [])

  // Real-time + auto-refresh fallback
  useEffect(() => {
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_followers' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])
  useAutoRefresh(load)

  // Búsqueda por palabra clave: matchea contra CUALQUIER parámetro de la
  // tarea — título, descripción, área, venue (código y nombre), responsable,
  // quién la creó, estatus y prioridad. Soporta varias palabras (todas deben
  // aparecer en algún campo).
  const PRIORITY_ES: Record<string, string> = { HIGH: 'alta high', MEDIUM: 'media medium', LOW: 'baja low' }
  const STATUS_ES: Record<string, string> = { OPEN: 'abierta open', IN_PROGRESS: 'en curso progreso', PROOF_SUBMITTED: 'evidencia proof', APPROVED: 'aprobada approved', REVISION: 'revisión revision' }
  function haystack(t: Task): string {
    return [
      t.title, t.description ?? '',
      t.area ? TASK_AREA_LABELS[t.area] : '',
      t.bu_id ? buNameMap[t.bu_id] ?? '' : '',
      t.assigned_to ? profileMap[t.assigned_to] ?? '' : '',
      t.created_by ? profileMap[t.created_by] ?? '' : '',
      STATUS_ES[t.status] ?? '', PRIORITY_ES[t.priority] ?? '',
      t.due_date ?? '',
    ].join(' ').toLowerCase()
  }
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)

  const filtered = tasks.filter((t) => {
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterArea && t.area !== filterArea) return false
    if (filterBu && t.bu_id !== filterBu) return false
    if (filterAssignee) {
      const related =
        t.assigned_to === filterAssignee ||
        t.created_by === filterAssignee ||
        (followerMap[filterAssignee]?.has(t.id) ?? false)
      if (!related) return false
    }
    if (terms.length) {
      const h = haystack(t)
      if (!terms.every(term => h.includes(term))) return false
    }
    return true
  })

  async function moveTask(task: Task, status: TaskStatus) {
    setStatusSheetTask(null)
    // Optimistic update, then full side effects via the shared action
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t))
    await changeTaskStatus(task, status, task.bu_id ? buMap[task.bu_id] : undefined)
    load()
  }

  // Alta rápida desde la vista Lista: solo título + estatus del grupo; el
  // detalle (área, venue, horas) se completa después en el panel.
  async function quickAdd(status: TaskStatus, title: string) {
    const { data, error } = await supabase.from('tasks').insert({
      title: title.trim(), status, priority: 'MEDIUM', deadline_type: 'SOFT', created_by: userId ?? null,
    }).select('id').single()
    if (error || !data) return false
    logActivity('task_created', 'task', data.id, { title: title.trim(), via: 'quick_add' })
    load()
    return true
  }

  const selectStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    minHeight: '32px',
  }

  const hasFilters = !!(filterBu || filterPriority || filterArea || filterAssignee || search)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, padding: isMobile ? '12px 16px' : '14px 20px' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '17px' }}>Tareas</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              {filtered.length} tareas
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Conmutador Kanban ↔ Lista (preferencia guardada por usuario) */}
            <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <button onClick={() => setView('kanban')} title="Vista Kanban"
                style={{ background: view === 'kanban' ? 'var(--accent-bg)' : 'transparent', color: view === 'kanban' ? 'var(--accent)' : 'var(--text-tertiary)', border: 'none', padding: '0 10px', minHeight: 'var(--touch-target)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <LayoutGrid size={15} />
              </button>
              <button onClick={() => setView('list')} title="Vista Lista"
                style={{ background: view === 'list' ? 'var(--accent-bg)' : 'transparent', color: view === 'list' ? 'var(--accent)' : 'var(--text-tertiary)', border: 'none', padding: '0 10px', minHeight: 'var(--touch-target)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <List size={15} />
              </button>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{ background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, padding: '0 16px', minHeight: 'var(--touch-target)', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              + Crear tarea
            </button>
          </div>
        </div>

        {/* Búsqueda por palabra clave — matchea cualquier parámetro de la tarea */}
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tareas — título, venue, persona, área, estatus…"
            style={{
              width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 32px',
              fontSize: '13px', outline: 'none', minHeight: '38px', boxSizing: 'border-box',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
          />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '4px' }}>×</button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2" style={{ overflowX: 'auto', paddingBottom: '2px' }}>
          <Filter size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <select value={filterBu} onChange={(e) => setFilterBu(e.target.value)} style={selectStyle}>
            <option value="">Todas las BUs</option>
            {buList.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as TaskPriority | '')} style={selectStyle}>
            <option value="">Prioridad</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Media</option>
            <option value="LOW">Baja</option>
          </select>
          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value as TaskArea | '')} style={selectStyle}>
            <option value="">Área</option>
            {TASK_AREA_GROUPS.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map(a => <option key={a} value={a}>{TASK_AREA_LABELS[a]}</option>)}
              </optgroup>
            ))}
          </select>
          <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} style={selectStyle}>
            <option value="">Todo el equipo</option>
            {Object.entries(profileMap).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowArchived((v) => !v)}
            style={{
              background: showArchived ? 'var(--accent-bg)' : 'var(--bg-elevated)',
              border: `1px solid ${showArchived ? 'var(--accent-border)' : 'var(--border-default)'}`,
              color: showArchived ? 'var(--accent)' : 'var(--text-tertiary)',
              borderRadius: 'var(--radius-sm)', padding: '6px 9px', fontSize: '12px', cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: '4px', minHeight: '32px',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Archivadas {showArchived && `· ${tasks.length}`}
          </button>
          {hasFilters && (
            <button onClick={() => { setFilterBu(''); setFilterPriority(''); setFilterArea(''); setFilterAssignee(''); setSearch('') }}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
              Limpiar
            </button>
          )}
        </div>

        {/* Mobile: status segments pinned under the header — scrollable bar
            with per-phase color so progression reads at a glance */}
        {isMobile && view === 'kanban' && (
          <div style={{ marginTop: '10px' }}>
            <SegmentedControl
              scrollable
              options={COLUMNS.map(c => ({
                id: c.id,
                label: `${c.label} ${filtered.filter(t => t.status === c.id).length}`,
                color: STATUS_COLORS[c.id],
              }))}
              value={mobileStatus}
              onChange={(id) => setMobileStatus(id as TaskStatus)}
            />
          </div>
        )}
      </div>

      {/* Body */}
      {view === 'list' ? (
        <TaskListView
          tasks={filtered} loading={loading} isMobile={isMobile}
          buMap={buMap} profileMap={profileMap} proofCounts={proofCounts}
          onOpen={id => setSelectedTaskId(id)} onQuickAdd={quickAdd}
        />
      ) : isMobile ? (
        /* ── Mobile: single-column list for the active status ── */
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', height: '72px', flexShrink: 0 }} className="animate-pulse-green" />
            ))
          ) : (
            <>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '10px', fontFamily: 'var(--font-mono)', margin: '0 0 2px', textAlign: 'center', flexShrink: 0 }}>
                Desliza → para cambiar estado · ← para abrir
              </p>
              {filtered.filter(t => t.status === mobileStatus).length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', paddingTop: '40px' }}>
                  Nada en "{COLUMNS.find(c => c.id === mobileStatus)?.label}".
                </div>
              )}
              {filtered.filter(t => t.status === mobileStatus).map((task) => (
                <SwipeableRow
                  key={task.id}
                  onSwipeRight={() => setStatusSheetTask(task)}
                  onSwipeLeft={() => setSelectedTaskId(task.id)}
                >
                  <TaskCard
                    task={task}
                    buName={task.bu_id ? buMap[task.bu_id] : undefined}
                    assigneeName={task.assigned_to ? profileMap[task.assigned_to] : undefined}
                    proofCount={proofCounts[task.id] ?? 0}
                    onClick={() => setSelectedTaskId(task.id)}
                  />
                </SwipeableRow>
              ))}
            </>
          )}
        </div>
      ) : (
        /* ── Desktop: 5-column kanban ── */
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: '12px', padding: '16px 20px' }}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ flex: '0 0 240px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', height: '200px' }} className="animate-pulse-green" />
            ))
          ) : (
            COLUMNS.map((col) => {
              const colTasks = filtered.filter((t) => t.status === col.id)
              return (
                <div key={col.id} style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="flex items-center gap-2 px-1 mb-1">
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLORS[col.id], flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>{col.label}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginLeft: 'auto' }}>
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2" style={{ flex: 1, minHeight: '60px' }}>
                    {colTasks.length === 0 ? (
                      <div style={{ border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>Vacío</span>
                      </div>
                    ) : (
                      colTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          buName={task.bu_id ? buMap[task.bu_id] : undefined}
                          assigneeName={task.assigned_to ? profileMap[task.assigned_to] : undefined}
                          proofCount={proofCounts[task.id] ?? 0}
                          onClick={() => setSelectedTaskId(task.id)}
                        />
                      ))
                    )}
                  </div>

                  {col.id === 'OPEN' && userRole === 'MASTER' && (
                    <button
                      onClick={() => setShowCreate(true)}
                      style={{ background: 'none', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-tertiary)', padding: '8px', fontSize: '12px', cursor: 'pointer', marginTop: '4px' }}
                    >
                      + Agregar tarea
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {tasks.length === 0 && !loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <EmptyState
            icon="🗂️"
            title="Aún no hay tareas"
            description="Crea la primera con el botón Crear tarea."
          />
        </div>
      )}

      {/* Mobile swipe-right target: choose the new status */}
      <Sheet open={!!statusSheetTask} onClose={() => setStatusSheetTask(null)} isMobile={isMobile}>
        {statusSheetTask && (
          <div style={{ padding: '0 var(--space-4) var(--space-6)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 'var(--space-2) 0 var(--space-1)' }}>
              <ArrowRightLeft size={14} style={{ color: 'var(--accent)' }} />
              <h2 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-size-md)', fontWeight: 700, margin: 0 }}>Mover a…</h2>
            </div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-size-xs)', margin: '0 0 var(--space-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {statusSheetTask.title}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {COLUMNS.filter(c => c.id !== statusSheetTask.status).map(c => (
                <button
                  key={c.id}
                  onClick={() => moveTask(statusSheetTask, c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--touch-target)',
                    padding: '0 var(--space-3)', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 'var(--text-size-sm)',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[c.id], flexShrink: 0 }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      {showCreate && (
        <CreateTaskModal onClose={() => setShowCreate(false)} onCreated={load} userRole={userRole} />
      )}

      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          userRole={userRole}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={load}
          onOpenTask={(id) => setSelectedTaskId(id)}
        />
      )}
    </div>
  )
}

// ── Swipeable row (mobile) — right reveals status change, left opens detail ──
function SwipeableRow({ children, onSwipeRight, onSwipeLeft }: {
  children: React.ReactNode
  onSwipeRight: () => void
  onSwipeLeft: () => void
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiping = useRef(false)

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}>
      {/* Reveal hints under the card */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, opacity: dx > 24 ? 1 : 0 }}>Mover →</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, opacity: dx < -24 ? 1 : 0 }}>← Abrir</span>
      </div>
      <div
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform 0.18s ease' : 'none' }}
        onTouchStart={(e) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; swiping.current = false }}
        onTouchMove={(e) => {
          if (!start.current) return
          const ddx = e.touches[0].clientX - start.current.x
          const ddy = e.touches[0].clientY - start.current.y
          // Only claim clearly-horizontal gestures so vertical scroll stays natural
          if (!swiping.current && Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.5) swiping.current = true
          if (swiping.current) setDx(Math.max(-96, Math.min(96, ddx)))
        }}
        onTouchEnd={() => {
          if (dx > 64) onSwipeRight()
          else if (dx < -64) onSwipeLeft()
          setDx(0)
          start.current = null
          swiping.current = false
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista LISTA — grupos colapsables por estatus (estilo tabla), ordenados por
// fecha límite, con alta rápida por grupo. Misma data y filtros que el kanban.
// ─────────────────────────────────────────────────────────────────────────────
function TaskListView({ tasks, loading, isMobile, buMap, profileMap, proofCounts, onOpen, onQuickAdd }: {
  tasks: Task[]
  loading: boolean
  isMobile: boolean
  buMap: Record<string, string>
  profileMap: Record<string, string>
  proofCounts: Record<string, number>
  onOpen: (id: string) => void
  onQuickAdd: (status: TaskStatus, title: string) => Promise<boolean>
}) {
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingIn, setSavingIn] = useState<TaskStatus | null>(null)

  const toggle = (id: TaskStatus) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  async function submitDraft(status: TaskStatus) {
    const title = (drafts[status] ?? '').trim()
    if (!title || savingIn) return
    setSavingIn(status)
    const ok = await onQuickAdd(status, title)
    setSavingIn(null)
    if (ok) setDrafts(prev => ({ ...prev, [status]: '' }))
  }

  const fmtDue = (d: string | null) => {
    if (!d) return null
    const date = new Date(d + 'T00:00:00')
    const overdue = date.getTime() < new Date(new Date().toDateString()).getTime()
    return {
      label: date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }),
      overdue,
    }
  }
  const byDue = (a: Task, b: Task) => {
    if (!a.due_date && !b.due_date) return a.created_at.localeCompare(b.created_at)
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date.localeCompare(b.due_date)
  }

  if (loading) {
    return (
      <div style={{ flex: 1, padding: isMobile ? '12px 16px' : '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', height: '48px' }} className="animate-pulse-green" />
        ))}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 12px 60px' : '16px 20px 60px' }}>
      {COLUMNS.map(col => {
        const rows = tasks.filter(t => t.status === col.id).sort(byDue)
        const isCollapsed = collapsed.has(col.id)
        const c = STATUS_COLORS[col.id]
        return (
          <div key={col.id} style={{ marginBottom: '18px' }}>
            {/* Header del grupo — pill de color + contador + colapsar */}
            <button onClick={() => toggle(col.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', width: '100%', textAlign: 'left' }}>
              {isCollapsed ? <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} />}
              <span style={{
                background: `color-mix(in srgb, ${c} 16%, transparent)`,
                border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
                color: c, borderRadius: '6px', padding: '2px 10px',
                fontSize: '12px', fontWeight: 700,
              }}>{col.label}</span>
              <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{rows.length}</span>
            </button>

            {!isCollapsed && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '4px' }}>
                {rows.map(t => {
                  const due = fmtDue(t.due_date)
                  const assignee = t.assigned_to ? profileMap[t.assigned_to] : null
                  return (
                    <button key={t.id} onClick={() => onOpen(t.id)}
                      style={{
                        display: isMobile ? 'flex' : 'grid',
                        gridTemplateColumns: isMobile ? undefined : 'minmax(0,1fr) 150px 90px 190px 110px',
                        flexDirection: isMobile ? 'column' : undefined,
                        alignItems: isMobile ? 'flex-start' : 'center',
                        gap: isMobile ? '3px' : '10px',
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        background: 'none', border: 'none',
                        borderBottom: '1px solid var(--border-subtle)',
                        padding: isMobile ? '10px 4px' : '9px 4px',
                        minHeight: '44px',
                      }}
                      className="hover:bg-[var(--bg-elevated)]"
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, width: isMobile ? '100%' : undefined }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: t.priority === 'HIGH' ? 'var(--status-risk)' : t.priority === 'MEDIUM' ? 'var(--status-attention)' : 'var(--status-none)' }} />
                        <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        {(proofCounts[t.id] ?? 0) > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--text-tertiary)', fontSize: '10px', flexShrink: 0 }}>
                            <Paperclip size={10} />{proofCounts[t.id]}
                          </span>
                        )}
                      </span>
                      {isMobile ? (
                        <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-tertiary)', paddingLeft: '15px' }}>
                          {assignee && <span>{assignee.split(' ')[0]}</span>}
                          {due && <span style={{ color: due.overdue ? 'var(--status-risk)' : undefined, fontWeight: due.overdue ? 700 : undefined }}>{due.label}</span>}
                          {t.area && <span>{TASK_AREA_LABELS[t.area]}</span>}
                          {t.bu_id && buMap[t.bu_id] && <span style={{ fontFamily: 'var(--font-mono)' }}>{buMap[t.bu_id]}</span>}
                        </span>
                      ) : (
                        <>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {assignee ?? <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                          </span>
                          <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: due?.overdue ? 'var(--status-risk)' : 'var(--text-secondary)', fontWeight: due?.overdue ? 700 : 400 }}>
                            {due?.label ?? '—'}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.area ? TASK_AREA_LABELS[t.area] : '—'}
                          </span>
                          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.bu_id && buMap[t.bu_id] ? buMap[t.bu_id] : '—'}
                          </span>
                        </>
                      )}
                    </button>
                  )
                })}

                {/* Alta rápida en el grupo — Enter crea con este estatus */}
                <input
                  value={drafts[col.id] ?? ''}
                  onChange={e => setDrafts(prev => ({ ...prev, [col.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') void submitDraft(col.id) }}
                  placeholder={savingIn === col.id ? 'Creando…' : 'Agregar tarea…'}
                  disabled={savingIn === col.id}
                  style={{
                    width: '100%', background: 'none', border: 'none', outline: 'none',
                    color: 'var(--text-secondary)', fontSize: '13px', padding: '10px 4px 10px 19px',
                    minHeight: '40px',
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
