import { useEffect, useState } from 'react'
import { X, Lock, Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { notifySlack, taskCreatedMessage, taskAssignedMessage, notifyUserDM, taskLink } from '../../hooks/useSlack'
import { useIsMobile } from '../../hooks/useIsMobile'
import { logActivity } from '../../hooks/useActivityLog'
import { notifyAdminsAndAssignee, sendTaskAssignmentEmail } from '../../lib/notifications'
import type { TaskType, TaskPriority, DeadlineType } from '../../types'

interface Props {
  onClose: () => void
  onCreated: () => void
  defaultBuId?: string
  userRole?: string
}

export function CreateTaskModal({ onClose, onCreated, defaultBuId, userRole }: Props) {
  const canReassign = userRole === 'MASTER' || userRole === 'C_LEVEL'
  const isMobile = useIsMobile()
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
  const [isPrivate, setIsPrivate] = useState(false)
  const [followers, setFollowers] = useState<string[]>([])
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null; type: string; priority: string; deadline_type: string; proof_required: boolean; estimated_hours: number | null; bu_id: string | null }[]>([])
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
      const [{ data: profiles }, { data: buses }, { data: { user } }, { data: tpls }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email').not('full_name', 'is', null),
        supabase.from('business_units').select('id, code, name').order('name'),
        supabase.auth.getUser(),
        supabase.from('task_templates').select('*').order('name'),
      ])
      setTeamMembers(profiles ?? [])
      setBuList(buses ?? [])
      setTemplates(tpls ?? [])
      if (!defaultBuId && buses && buses.length > 0) setBuId(buses[0].id)
      if (!canReassign && user?.id) setAssignedTo(user.id)
    }
    load()
  }, [defaultBuId, canReassign])

  function applyTemplate(templateId: string) {
    const t = templates.find(t => t.id === templateId)
    if (!t) return
    setTitle(t.name)
    setDescription(t.description ?? '')
    setType(t.type as TaskType)
    setPriority(t.priority as TaskPriority)
    setDeadlineType(t.deadline_type as DeadlineType)
    setProofRequired(t.proof_required)
    setEstimatedHours(t.estimated_hours ? String(t.estimated_hours) : '')
    if (t.bu_id) setBuId(t.bu_id)
    setAdvanced(true)
  }

  async function handleSave() {
    if (!title.trim()) { setError('El título es obligatorio.'); return }
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: newTask, error } = await supabase.from('tasks').insert({
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
      is_private: isPrivate,
    }).select('id').single()
    setSaving(false)
    if (error) { setError(error.message); return }

    // Insert followers
    if (newTask && followers.length > 0) {
      await supabase.from('task_followers').insert(
        followers.map(uid => ({ task_id: newTask.id, user_id: uid }))
      )
    }

    // Slack notifications
    const buName = buList.find(b => b.id === buId)
    const assigneeName = teamMembers.find(m => m.id === assignedTo)?.full_name ?? undefined
    notifySlack(taskCreatedMessage(title.trim(), buName ? `${buName.code} · ${buName.name}` : 'No BU', priority, assigneeName ?? undefined))
    if (assignedTo && assigneeName) {
      notifyUserDM(assignedTo, taskAssignedMessage(title.trim(), assigneeName, newTask ? taskLink(newTask.id) : undefined))
    }

    logActivity('task_created', 'task', newTask?.id, { title: title.trim(), bu: buName ? `${buName.code} · ${buName.name}` : null, priority })
    notifyAdminsAndAssignee('New task created', title.trim(), 'task_created', newTask?.id, assignedTo || undefined)
    if (assignedTo && newTask) sendTaskAssignmentEmail(newTask.id, assignedTo)
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
        style={isMobile
          ? { background: 'var(--bg-surface)', width: '100%', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }
          : { background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '15px' }}>Crear tarea</h2>
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>ESC para cerrar</span>
            <button onClick={onClose} style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '5px', borderRadius: '6px', cursor: 'pointer' }}>
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Template picker */}
          {templates.length > 0 && (
            <div>
              {label('Usar plantilla (opcional)')}
              <select
                defaultValue=""
                onChange={e => { if (e.target.value) applyTemplate(e.target.value) }}
                style={selectStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
              >
                <option value="">— Empezar desde cero —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            {label('Título *')}
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="¿Qué hay que hacer?"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
            />
          </div>

          {/* Privacy toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: isPrivate ? 'rgba(239,68,68,0.08)' : 'var(--bg-elevated)',
                border: `1px solid ${isPrivate ? 'rgba(239,68,68,0.25)' : 'var(--border-default)'}`,
                color: isPrivate ? '#EF4444' : 'var(--text-secondary)',
                borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', flexShrink: 0,
              }}
            >
              {isPrivate ? <Lock size={11} /> : <Globe size={11} />}
              {isPrivate ? 'Privada' : 'Pública'}
            </button>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
              {isPrivate ? 'Solo asignado y seguidores la ven' : 'Visible para todo el equipo'}
            </span>
          </div>

          {/* BU + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              {label('Unidad de negocio')}
              <select value={buId} onChange={(e) => setBuId(e.target.value)} style={selectStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
              >
                <option value="">— Ninguna —</option>
                {buList.map((bu) => (
                  <option key={bu.id} value={bu.id}>{bu.code} · {bu.name}</option>
                ))}
              </select>
            </div>
            <div>
              {label('Tipo')}
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
              {label('Prioridad')}
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} style={selectStyle}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
              >
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Media</option>
                <option value="LOW">Baja</option>
              </select>
            </div>
            {canReassign ? (
              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                  Asignar a <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>C-LEVEL</span>
                </label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={selectStyle}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                >
                  <option value="">— Sin asignar —</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Asignada a</label>
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
            {advanced ? '▾' : '▸'} Opciones avanzadas
          </button>

          {advanced && (
            <>
              <div>
                {label('Descripción / instrucciones')}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contexto adicional…"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  {label('Fecha límite')}
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
                <div>
                  {label('Tipo de deadline')}
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
                  {label('Horas estimadas')}
                  <input type="number" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} placeholder="2.5" min="0" step="0.5" style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    <input type="checkbox" checked={proofRequired} onChange={(e) => setProofRequired(e.target.checked)} style={{ accentColor: 'var(--accent)', width: '15px', height: '15px' }} />
                    Requiere evidencia
                  </label>
                </div>
              </div>

              {/* Related people */}
              <div>
                {label('Personas relacionadas')}
                {followers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {followers.map(fId => {
                      const m = teamMembers.find(tm => tm.id === fId)
                      return (
                        <span key={fId} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '20px', padding: '3px 6px 3px 10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {m?.full_name ?? m?.email}
                          <button type="button" onClick={() => setFollowers(p => p.filter(id => id !== fId))} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '15px', padding: '0 3px', lineHeight: 1 }}>×</button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <select
                  onChange={(e) => { if (e.target.value) { setFollowers(p => [...p, e.target.value]); (e.target as HTMLSelectElement).value = '' } }}
                  defaultValue=""
                  style={selectStyle}
                >
                  <option value="">Agregar persona…</option>
                  {teamMembers
                    .filter(m => !followers.includes(m.id) && m.id !== assignedTo)
                    .map(m => <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>)}
                </select>
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
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !title.trim()} style={{ flex: 2, background: title.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: title.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: title.trim() ? 'pointer' : 'not-allowed' }}>
              {saving ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

