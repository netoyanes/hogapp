import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { notifySlack, taskCreatedMessage } from '../../hooks/useSlack'
import type { TaskType, TaskPriority, DeadlineType } from '../../types'

interface Props {
  onClose: () => void
  onCreated: () => void
  defaultBuId?: string
  userRole?: string
}

export function CreateTaskModal({ onClose, onCreated, defaultBuId, userRole }: Props) {
  const canReassign = userRole === 'MASTER' || userRole === 'C_LEVEL'
  const [title, setTitle] = useState('')
  const [buId, setBuId] = useState(defaultBuId ?? '')
  const [type, setType] = useState<TaskType>('MAINTENANCE')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [assignedTo, setAssignedTo] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [deadlineType, setDeadlineType] = useState<DeadlineType>('SOFT')
  const [proofRequired, setProofRequired] = useState(false)
  const [estimatedHours, setEstimatedHours] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    async function load() {
      const [{ data: profiles }, { data: buses }, { data: { user } }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email'),
        supabase.from('business_units').select('id, code, name').order('name'),
        supabase.auth.getUser(),
      ])
      setTeamMembers(profiles ?? [])
      setBuList(buses ?? [])
      if (!defaultBuId && buses && buses.length > 0) setBuId(buses[0].id)
      // Non C-Level users are always assigned to themselves
      if (!canReassign && user?.id) setAssignedTo(user.id)
    }
    load()
  }, [defaultBuId, canReassign])

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      description: description || null,
      type,
      bu_id: buId || null,
      priority,
      status: 'OPEN',
      assigned_to: assignedTo || null,
      created_by: user?.id ?? null,
      due_date: dueDate || null,
      deadline_type: deadlineType,
      proof_required: proofRequired,
      estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }

    // Slack notification
    const buName = buList.find(b => b.id === buId)
    const assigneeName = teamMembers.find(m => m.id === assignedTo)?.full_name ?? undefined
    notifySlack(taskCreatedMessage(title.trim(), buName ? `${buName.code} · ${buName.name}` : 'No BU', priority, assigneeName ?? undefined))

    onCreated()
    onClose()
  }

  const inputStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '7px',
    color: 'var(--text-primary)',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    width: '100%',
  }

  const selectStyle = { ...inputStyle, cursor: 'pointer' }

  const label = (text: string) => (
    <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>{text}</label>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '15px' }}>Create Task</h2>
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>ESC to close</span>
            <button onClick={onClose} style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '5px', borderRadius: '6px', cursor: 'pointer' }}>
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Title */}
          <div>
            {label('Title *')}
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
            />
          </div>

          {/* BU + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              {label('Business Unit')}
              <select value={buId} onChange={(e) => setBuId(e.target.value)} style={selectStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
              >
                <option value="">— None —</option>
                {buList.map((bu) => (
                  <option key={bu.id} value={bu.id}>{bu.code} · {bu.name}</option>
                ))}
              </select>
            </div>
            <div>
              {label('Type')}
              <select value={type} onChange={(e) => setType(e.target.value as TaskType)} style={selectStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
              >
                {['MAINTENANCE', 'HARDWARE', 'REPORT', 'CONTENT', 'PROJECT'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority + Assigned to */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              {label('Priority')}
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} style={selectStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
              >
                <option value="HIGH">🔴 HIGH</option>
                <option value="MEDIUM">🟡 MEDIUM</option>
                <option value="LOW">🟢 LOW</option>
              </select>
            </div>
            {canReassign ? (
              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                  Assign to <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>C-LEVEL</span>
                </label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={selectStyle}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                >
                  <option value="">— Unassigned —</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Assigned to</label>
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>👤</span>
                  {teamMembers.find(m => m.id === assignedTo)?.full_name ?? teamMembers.find(m => m.id === assignedTo)?.email ?? 'You'}
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginLeft: 'auto' }}>auto</span>
                </div>
              </div>
            )}
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setAdvanced(!advanced)}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '12px', cursor: 'pointer', textAlign: 'left', padding: 0 }}
          >
            {advanced ? '▾' : '▸'} Advanced options
          </button>

          {advanced && (
            <>
              <div>
                {label('Description / Instructions')}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional context..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  {label('Due Date')}
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
                <div>
                  {label('Deadline Type')}
                  <select value={deadlineType} onChange={(e) => setDeadlineType(e.target.value as DeadlineType)} style={selectStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  >
                    <option value="SOFT">SOFT</option>
                    <option value="HARD">HARD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  {label('Estimated Hours')}
                  <input type="number" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} placeholder="2.5" min="0" step="0.5" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    <input type="checkbox" checked={proofRequired} onChange={(e) => setProofRequired(e.target.checked)} style={{ accentColor: 'var(--accent)', width: '15px', height: '15px' }} />
                    Proof required
                  </label>
                </div>
              </div>
            </>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '7px', color: '#EF4444', padding: '8px 12px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '10px', fontSize: '13px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !title.trim()} style={{ flex: 2, background: title.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: title.trim() ? '#000' : 'var(--text-tertiary)', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: title.trim() ? 'pointer' : 'not-allowed' }}>
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

