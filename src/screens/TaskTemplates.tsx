import { useEffect, useState } from 'react'
import { Edit2, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { TaskArea, ClientImpact, TaskPriority, DeadlineType } from '../types'
import { TASK_AREA_LABELS, TASK_AREA_GROUPS, CLIENT_IMPACT_LABELS } from '../lib/taskAreas'

interface Template {
  id: string
  name: string
  description: string | null
  area: TaskArea | null
  client_impact: ClientImpact | null
  priority: TaskPriority
  deadline_type: DeadlineType
  proof_required: boolean
  estimated_hours: number | null
  bu_id: string | null
  created_at: string
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  HIGH: '#EF4444',
  MEDIUM: '#EAB308',
  LOW: '#22C55E',
}

interface Props {
  userRole?: string
}

export function TaskTemplates({ userRole }: Props) {
  const canManage = userRole === 'MASTER' || userRole === 'C_LEVEL'
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [area, setArea] = useState<TaskArea>('mantenimiento')
  const [clientImpact, setClientImpact] = useState<ClientImpact>('internal')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [deadlineType, setDeadlineType] = useState<DeadlineType>('SOFT')
  const [proofRequired, setProofRequired] = useState(false)
  const [estimatedHours, setEstimatedHours] = useState('')
  const [buId, setBuId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: tpls }, { data: buses }] = await Promise.all([
      supabase.from('task_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('business_units').select('id, code, name').order('name'),
    ])
    setTemplates((tpls ?? []) as Template[])
    setBuList(buses ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setName(''); setDescription(''); setArea('mantenimiento'); setClientImpact('internal'); setPriority('MEDIUM')
    setDeadlineType('SOFT'); setProofRequired(false); setEstimatedHours(''); setBuId('')
    setShowForm(true)
  }

  function openEdit(t: Template) {
    setEditing(t)
    setName(t.name); setDescription(t.description ?? ''); setArea(t.area ?? 'mantenimiento'); setClientImpact(t.client_impact ?? 'internal')
    setPriority(t.priority); setDeadlineType(t.deadline_type); setProofRequired(t.proof_required)
    setEstimatedHours(t.estimated_hours ? String(t.estimated_hours) : ''); setBuId(t.bu_id ?? '')
    setShowForm(true)
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      description: description || null,
      area,
      client_impact: clientImpact,
      priority,
      deadline_type: deadlineType,
      proof_required: proofRequired,
      estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
      bu_id: buId || null,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      await supabase.from('task_templates').update(payload).eq('id', editing.id)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('task_templates').insert({ ...payload, created_by: user?.id })
    }
    setSaving(false)
    setShowForm(false)
    load()
  }

  async function deleteTemplate(id: string) {
    setDeleting(id)
    await supabase.from('task_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
    setDeleting(null)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, padding: '14px 20px' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '17px' }}>Task Templates</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              {templates.length} template{templates.length !== 1 ? 's' : ''} · reusable task blueprints
            </p>
          </div>
          {canManage && (
            <button
              onClick={openCreate}
              style={{ background: 'var(--accent)', color: '#000', borderRadius: '7px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
            >
              + New Template
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: 'var(--bg-surface)', borderRadius: '10px', height: '140px' }} className="animate-pulse-green" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '8px' }}>
            <span style={{ fontSize: '32px' }}>📋</span>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No templates yet</p>
            {canManage && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', textAlign: 'center', maxWidth: '280px' }}>
                Create reusable blueprints — when making a task, pick a template to pre-fill the form
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => {
              const bu = buList.find(b => b.id === t.bu_id)
              return (
                <div
                  key={t.id}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}
                  className="hover:border-[var(--border-strong)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, lineHeight: '1.3' }}>{t.name}</h3>
                    {canManage && (
                      <div className="flex gap-1" style={{ flexShrink: 0 }}>
                        <button
                          onClick={() => openEdit(t)}
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '5px', padding: '5px', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                          title="Edit"
                        >
                          <Edit2 size={11} />
                        </button>
                        <button
                          onClick={() => deleteTemplate(t.id)}
                          disabled={deleting === t.id}
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '5px', padding: '5px', cursor: 'pointer', color: deleting === t.id ? 'var(--text-tertiary)' : '#EF4444' }}
                          title="Delete"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </div>

                  {t.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.5' }}>{t.description}</p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: 'auto' }}>
                    <span style={{ background: `${PRIORITY_COLORS[t.priority]}18`, border: `1px solid ${PRIORITY_COLORS[t.priority]}40`, color: PRIORITY_COLORS[t.priority], borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {t.priority}
                    </span>
                    <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                      {t.area ? TASK_AREA_LABELS[t.area] : '—'}
                    </span>
                    {t.client_impact === 'client_facing' && (
                      <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--accent)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                        {CLIENT_IMPACT_LABELS.client_facing}
                      </span>
                    )}
                    {bu && (
                      <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                        {bu.code}
                      </span>
                    )}
                    {t.estimated_hours && (
                      <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px' }}>
                        {t.estimated_hours}h
                      </span>
                    )}
                    {t.proof_required && (
                      <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px' }}>
                        📎 proof
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '15px' }}>
                {editing ? 'Edit Template' : 'New Template'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '5px', borderRadius: '6px', cursor: 'pointer' }}>
                <X size={13} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Template name *</label>
                <input
                  autoFocus value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Monthly Marketing Report"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>

              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Description / Instructions</label>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  rows={2} placeholder="Default instructions for this task type..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Área</label>
                  <select value={area} onChange={e => setArea(e.target.value as TaskArea)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {TASK_AREA_GROUPS.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map(a => <option key={a} value={a}>{TASK_AREA_LABELS[a]}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="HIGH">🔴 HIGH</option>
                    <option value="MEDIUM">🟡 MEDIUM</option>
                    <option value="LOW">🟢 LOW</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Impacto en cliente</label>
                <select value={clientImpact} onChange={e => setClientImpact(e.target.value as ClientImpact)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {(Object.keys(CLIENT_IMPACT_LABELS) as ClientImpact[]).map(k => <option key={k} value={k}>{CLIENT_IMPACT_LABELS[k]}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Deadline type</label>
                  <select value={deadlineType} onChange={e => setDeadlineType(e.target.value as DeadlineType)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="SOFT">SOFT</option>
                    <option value="HARD">HARD</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Est. hours</label>
                  <input
                    type="number" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)}
                    placeholder="2.5" min="0" step="0.5" style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
              </div>

              <div>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Default BU (optional)</label>
                <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">— None —</option>
                  {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                <input type="checkbox" checked={proofRequired} onChange={e => setProofRequired(e.target.checked)} style={{ accentColor: 'var(--accent)', width: '15px', height: '15px' }} />
                Proof required by default
              </label>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowForm(false)} style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '10px', fontSize: '13px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || !name.trim()}
                  style={{ flex: 2, background: name.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: name.trim() ? '#000' : 'var(--text-tertiary)', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: name.trim() ? 'pointer' : 'not-allowed' }}
                >
                  {saving ? 'Saving…' : editing ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
