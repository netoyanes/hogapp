import { useEffect, useState, useCallback } from 'react'
import { Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TaskCard } from '../components/ui/TaskCard'
import { CreateTaskModal } from '../components/ui/CreateTaskModal'
import { TaskDetailPanel } from '../components/ui/TaskDetailPanel'
import { EmptyState } from '../components/ui/EmptyState'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import type { Task, TaskStatus, TaskPriority, TaskType } from '../types'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'OPEN', label: 'Open' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'PROOF_SUBMITTED', label: 'Proof Submitted' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REVISION', label: 'Revision' },
]

const STATUS_COLORS: Record<TaskStatus, string> = {
  OPEN: '#555555',
  IN_PROGRESS: '#22C55E',
  PROOF_SUBMITTED: '#EAB308',
  APPROVED: '#22C55E',
  REVISION: '#EF4444',
}

interface Props {
  userRole?: string
  defaultBuFilter?: string
  userId?: string
}

export function TaskBoard({ userRole, defaultBuFilter, userId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [buMap, setBuMap] = useState<Record<string, string>>({})
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('')
  const [filterType, setFilterType] = useState<TaskType | ''>('')
  const [filterBu, setFilterBu] = useState(defaultBuFilter ?? '')
  const [filterAssignee, setFilterAssignee] = useState(userId ?? '')
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (defaultBuFilter !== undefined) setFilterBu(defaultBuFilter)
  }, [defaultBuFilter])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])

  const load = useCallback(async () => {
    const [{ data: taskData }, { data: buses }, { data: profiles }] = await Promise.all([
      supabase.from('tasks').select('*').eq('archived', showArchived).order('created_at', { ascending: false }),
      supabase.from('business_units').select('id, code, name'),
      supabase.from('profiles').select('id, full_name, email'),
    ])
    setTasks(taskData ?? [])
    setBuList(buses ?? [])
    const bm: Record<string, string> = {}
    buses?.forEach((b) => { bm[b.id] = `${b.code}` })
    setBuMap(bm)
    const pm: Record<string, string> = {}
    profiles?.forEach((p) => { pm[p.id] = p.full_name ?? p.email ?? 'Unknown' })
    setProfileMap(pm)
    setLoading(false)
  }, [showArchived])

  useEffect(() => {
    load()
  }, [load])

  // Keyboard shortcut C
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'c' || e.key === 'C') setShowCreate(true)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Real-time + auto-refresh fallback
  useEffect(() => {
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])
  useAutoRefresh(load)

  const filtered = tasks.filter((t) => {
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterType && t.type !== filterType) return false
    if (filterBu && t.bu_id !== filterBu) return false
    if (filterAssignee && t.assigned_to !== filterAssignee) return false
    return true
  })

  const selectStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, padding: '14px 20px' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '17px' }}>Task Board</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{filtered.length} tasks · press <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>C</span> to create</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{ background: 'var(--accent)', color: '#000', borderRadius: '7px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            + New Task
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2" style={{ overflowX: 'auto', paddingBottom: '2px' }}>
          <Filter size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <select value={filterBu} onChange={(e) => setFilterBu(e.target.value)} style={selectStyle}>
            <option value="">All BUs</option>
            {buList.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as TaskPriority | '')} style={selectStyle}>
            <option value="">All priorities</option>
            <option value="HIGH">🔴 High</option>
            <option value="MEDIUM">🟡 Medium</option>
            <option value="LOW">🟢 Low</option>
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as TaskType | '')} style={selectStyle}>
            <option value="">All types</option>
            {['MAINTENANCE', 'HARDWARE', 'REPORT', 'CONTENT', 'PROJECT'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} style={selectStyle}>
            <option value="">All users</option>
            {Object.entries(profileMap).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowArchived((v) => !v)}
            style={{
              background: showArchived ? '#78350f20' : 'var(--bg-elevated)',
              border: `1px solid ${showArchived ? '#d9770640' : 'var(--border-default)'}`,
              color: showArchived ? '#d97706' : 'var(--text-tertiary)',
              borderRadius: '6px', padding: '5px 9px', fontSize: '12px', cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: '4px',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Archived {showArchived && `· ${tasks.length}`}
          </button>
          {(filterBu || filterPriority || filterType || filterAssignee) && (
            <button onClick={() => { setFilterBu(''); setFilterPriority(''); setFilterType(''); setFilterAssignee('') }}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Kanban columns */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: '12px', padding: '16px 20px' }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ flex: '0 0 240px', background: 'var(--bg-surface)', borderRadius: '8px', height: '200px' }} className="animate-pulse-green" />
          ))
        ) : (
          COLUMNS.map((col) => {
            const colTasks = filtered.filter((t) => t.status === col.id)
            return (
              <div key={col.id} style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Column header */}
                <div className="flex items-center gap-2 px-1 mb-1">
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLORS[col.id], flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>{col.label}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px', marginLeft: 'auto' }}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2" style={{ flex: 1, minHeight: '60px' }}>
                  {colTasks.length === 0 ? (
                    <div style={{ border: '1px dashed var(--border-subtle)', borderRadius: '8px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>Empty</span>
                    </div>
                  ) : (
                    colTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        buName={task.bu_id ? buMap[task.bu_id] : undefined}
                        assigneeName={task.assigned_to ? profileMap[task.assigned_to] : undefined}
                        onClick={() => setSelectedTaskId(task.id)}
                      />
                    ))
                  )}
                </div>

                {/* Add in this column */}
                {col.id === 'OPEN' && userRole === 'MASTER' && (
                  <button
                    onClick={() => setShowCreate(true)}
                    style={{ background: 'none', border: '1px dashed var(--border-default)', borderRadius: '7px', color: 'var(--text-tertiary)', padding: '8px', fontSize: '12px', cursor: 'pointer', marginTop: '4px' }}
                  >
                    + Add task
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {tasks.length === 0 && !loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <EmptyState
            icon="🗂️"
            title="No tasks yet"
            description="Press C to create your first task."
          />
        </div>
      )}

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
