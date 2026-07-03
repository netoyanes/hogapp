import { useEffect, useState, useCallback, useRef } from 'react'
import { Filter, ArrowRightLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TaskCard } from '../components/ui/TaskCard'
import { CreateTaskModal } from '../components/ui/CreateTaskModal'
import { TaskDetailPanel } from '../components/ui/TaskDetailPanel'
import { EmptyState } from '../components/ui/EmptyState'
import { SegmentedControl, Sheet } from '../components/v2'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { useIsMobile } from '../hooks/useIsMobile'
import { changeTaskStatus } from '../lib/taskActions'
import type { Task, TaskStatus, TaskPriority, TaskType } from '../types'

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
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})
  const [followerMap, setFollowerMap] = useState<Record<string, Set<string>>>({})
  const [proofCounts, setProofCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('')
  const [filterType, setFilterType] = useState<TaskType | ''>('')
  const [filterBu, setFilterBu] = useState(defaultBuFilter ?? '')
  const [filterAssignee, setFilterAssignee] = useState(userId ?? '')
  const [showArchived, setShowArchived] = useState(false)
  // Mobile: active status segment + swipe-to-change-status target
  const [mobileStatus, setMobileStatus] = useState<TaskStatus>('OPEN')
  const [statusSheetTask, setStatusSheetTask] = useState<Task | null>(null)

  useEffect(() => {
    if (defaultBuFilter !== undefined) setFilterBu(defaultBuFilter)
  }, [defaultBuFilter])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])

  const load = useCallback(async () => {
    const [{ data: taskData }, { data: buses }, { data: profiles }, { data: followers }, { data: proofs }] = await Promise.all([
      supabase.from('tasks').select('*').eq('archived', showArchived).order('created_at', { ascending: false }),
      supabase.from('business_units').select('id, code, name'),
      supabase.from('profiles').select('id, full_name, email').not('full_name', 'is', null),
      supabase.from('task_followers').select('task_id, user_id'),
      supabase.from('task_proofs').select('task_id, archived'),
    ])
    setTasks(taskData ?? [])
    setBuList(buses ?? [])
    const bm: Record<string, string> = {}
    buses?.forEach((b) => { bm[b.id] = `${b.code}` })
    setBuMap(bm)
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

  // Keyboard shortcut C + command-palette "Crear tarea" action
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'c' || e.key === 'C') setShowCreate(true)
    }
    const openCreate = () => setShowCreate(true)
    window.addEventListener('keydown', handler)
    window.addEventListener('hog:create-task', openCreate)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('hog:create-task', openCreate)
    }
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

  const filtered = tasks.filter((t) => {
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterType && t.type !== filterType) return false
    if (filterBu && t.bu_id !== filterBu) return false
    if (filterAssignee) {
      const related =
        t.assigned_to === filterAssignee ||
        t.created_by === filterAssignee ||
        (followerMap[filterAssignee]?.has(t.id) ?? false)
      if (!related) return false
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

  const hasFilters = !!(filterBu || filterPriority || filterType || filterAssignee)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, padding: isMobile ? '12px 16px' : '14px 20px' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '17px' }}>Tareas</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              {filtered.length} tareas{!isMobile && <> · crea con <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>C</span></>}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{ background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, padding: '0 16px', minHeight: 'var(--touch-target)', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
          >
            + Crear tarea
          </button>
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
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as TaskType | '')} style={selectStyle}>
            <option value="">Tipo</option>
            {['MAINTENANCE', 'HARDWARE', 'REPORT', 'CONTENT', 'PROJECT'].map((t) => (
              <option key={t} value={t}>{t}</option>
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
            <button onClick={() => { setFilterBu(''); setFilterPriority(''); setFilterType(''); setFilterAssignee('') }}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
              Limpiar
            </button>
          )}
        </div>

        {/* Mobile: status segments pinned under the header */}
        {isMobile && (
          <div style={{ marginTop: '10px' }}>
            <SegmentedControl
              options={COLUMNS.map(c => ({ id: c.id, label: `${c.label.slice(0, 8)} ${filtered.filter(t => t.status === c.id).length}` }))}
              value={mobileStatus}
              onChange={(id) => setMobileStatus(id as TaskStatus)}
            />
          </div>
        )}
      </div>

      {/* Body */}
      {isMobile ? (
        /* ── Mobile: single-column list for the active status ── */
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', height: '72px' }} className="animate-pulse-green" />
            ))
          ) : (
            <>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '10px', fontFamily: 'var(--font-mono)', margin: '0 0 2px', textAlign: 'center' }}>
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
            description="Crea la primera con C o con el botón Crear tarea."
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
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-sm)' }}>
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
