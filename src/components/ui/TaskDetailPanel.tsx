import { useEffect, useRef, useState } from 'react'
import { X, Calendar, Clock, User, Building2, CheckCircle2, Paperclip, Upload, Archive, ArchiveRestore, Lock, Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { notifySlack, statusChangedMessage, proofUploadedMessage } from '../../hooks/useSlack'
import { logActivity } from '../../hooks/useActivityLog'
import { notifyAdminsAndAssignee } from '../../lib/notifications'
import { useIsMobile } from '../../hooks/useIsMobile'
import { PriorityDot } from './PriorityDot'
import { StatusBadge } from './StatusBadge'
import type { Task, TaskStatus, TaskPriority } from '../../types'

interface Props {
  taskId: string
  onClose: () => void
  onUpdated: () => void
  userRole?: string
}

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'PROOF_SUBMITTED', 'APPROVED', 'REVISION']
const STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PROOF_SUBMITTED: 'Proof Submitted',
  APPROVED: 'Approved',
  REVISION: 'Revision',
}

export function TaskDetailPanel({ taskId, onClose, onUpdated, userRole: _userRole }: Props) {
  const isMobile = useIsMobile()
  const [task, setTask] = useState<Task | null>(null)
  const [buName, setBuName] = useState('')
  const [, setAssigneeName] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([])
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [saving, setSaving] = useState(false)
  const [comments, setComments] = useState<{ id: string; content: string; created_at: string; author: string }[]>([])
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [proofs, setProofs] = useState<{ id: string; file_url: string; file_type: string; created_at: string }[]>([])
  const [uploadingProof, setUploadingProof] = useState(false)
  const [followers, setFollowers] = useState<{ userId: string; name: string }[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [previewProof, setPreviewProof] = useState<{ url: string; type: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from('tasks').select('*').eq('id', taskId).single()
      if (!t) return
      setTask(t)
      setTitle(t.title)
      setDescription(t.description ?? '')
      setDueDate(t.due_date ?? '')
      setPriority(t.priority)
      setAssignedTo(t.assigned_to ?? '')

      if (t.bu_id) {
        const { data: bu } = await supabase.from('business_units').select('code, name').eq('id', t.bu_id).single()
        if (bu) setBuName(`${bu.code} · ${bu.name}`)
      }
      if (t.assigned_to) {
        const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', t.assigned_to).single()
        if (p) setAssigneeName(p.full_name ?? p.email ?? '')
      }

      const { data: members } = await supabase.from('profiles').select('id, full_name, email')
      setTeamMembers(members ?? [])

      // Load followers
      const { data: followerRows } = await supabase
        .from('task_followers').select('user_id').eq('task_id', taskId)
      if (followerRows && followerRows.length > 0) {
        setFollowers(followerRows.map(f => ({
          userId: f.user_id,
          name: (members ?? []).find(m => m.id === f.user_id)?.full_name
            ?? (members ?? []).find(m => m.id === f.user_id)?.email
            ?? 'Unknown',
        })))
      }

      // Load comments
      const { data: c } = await supabase
        .from('task_comments')
        .select('id, content, created_at, author_id')
        .eq('task_id', taskId)
        .order('created_at')
      if (c) {
        const withAuthors = await Promise.all(c.map(async (cm) => {
          const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', cm.author_id).single()
          return { id: cm.id, content: cm.content, created_at: cm.created_at, author: p?.full_name ?? p?.email ?? 'Unknown' }
        }))
        setComments(withAuthors)
      }

      // Load proofs
      const { data: pr } = await supabase
        .from('task_proofs')
        .select('id, file_url, file_type, created_at')
        .eq('task_id', taskId)
        .order('created_at')
      setProofs(pr ?? [])
    }
    load()
  }, [taskId])

  async function changeStatus(status: TaskStatus) {
    const prev = task?.status ?? 'OPEN'
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (status === 'APPROVED') update.priority = 'LOW'
    await supabase.from('tasks').update(update).eq('id', taskId)
    setTask((t) => t ? { ...t, status, ...(status === 'APPROVED' ? { priority: 'LOW' } : {}) } : t)
    setPriority(status === 'APPROVED' ? 'LOW' : priority)
    notifySlack(statusChangedMessage(task?.title ?? '', prev, status, buName || 'HOG OPS'))
    logActivity('status_changed', 'task', taskId, { title: task?.title ?? '', from: prev, to: status })
    notifyAdminsAndAssignee(`Status → ${status}`, task?.title ?? '', 'status_changed', taskId, task?.assigned_to ?? undefined)
    onUpdated()
  }

  async function uploadProof(file: File) {
    setUploadingProof(true)
    const ext = file.name.split('.').pop()
    const path = `proofs/${taskId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('proofs').upload(path, file, { upsert: false })
    if (error) { setUploadingProof(false); return }
    const { data: urlData } = supabase.storage.from('proofs').getPublicUrl(path)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: pRow } = await supabase.from('profiles').select('full_name, email').eq('id', user?.id ?? '').single()
    const uploaderName = pRow?.full_name ?? pRow?.email ?? 'Someone'
    await supabase.from('task_proofs').insert({
      task_id: taskId,
      file_url: urlData.publicUrl,
      file_type: file.type,
      uploaded_by: user?.id,
    })
    // Auto-set status to PROOF_SUBMITTED
    await changeStatus('PROOF_SUBMITTED')
    setProofs((prev) => [...prev, { id: Date.now().toString(), file_url: urlData.publicUrl, file_type: file.type, created_at: new Date().toISOString() }])
    notifySlack(proofUploadedMessage(task?.title ?? '', buName || 'HOG OPS', uploaderName))
    logActivity('proof_uploaded', 'task', taskId, { title: task?.title ?? '' })
    notifyAdminsAndAssignee('Proof uploaded', task?.title ?? '', 'proof_uploaded', taskId, task?.assigned_to ?? undefined)
    setUploadingProof(false)
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadProof(file)
  }

  async function saveEdits() {
    setSaving(true)
    await supabase.from('tasks').update({
      title,
      description: description || null,
      due_date: dueDate || null,
      priority,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId)
    setTask((prev) => prev ? { ...prev, title, description, due_date: dueDate, priority } : prev)
    setSaving(false)
    setEditing(false)
    onUpdated()
  }

  async function postComment() {
    if (!newComment.trim()) return
    setPostingComment(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('task_comments').insert({
      task_id: taskId,
      author_id: user?.id,
      content: newComment.trim(),
    })
    const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', user?.id ?? '').single()
    setComments((prev) => [...prev, {
      id: Date.now().toString(),
      content: newComment.trim(),
      created_at: new Date().toISOString(),
      author: p?.full_name ?? p?.email ?? 'You',
    }])
    logActivity('comment_posted', 'task', taskId, { title: task?.title ?? '' })
    notifyAdminsAndAssignee('New comment', task?.title ?? '', 'comment_posted', taskId, task?.assigned_to ?? undefined)
    setNewComment('')
    setPostingComment(false)
  }

  async function archiveTask() {
    await supabase.from('tasks').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', taskId)
    logActivity('task_archived', 'task', taskId, { title: task?.title ?? '' })
    onUpdated()
    onClose()
  }

  async function restoreTask() {
    await supabase.from('tasks').update({ archived: false, updated_at: new Date().toISOString() }).eq('id', taskId)
    logActivity('task_restored', 'task', taskId, { title: task?.title ?? '' })
    setTask((t) => t ? { ...t, archived: false } : t)
    onUpdated()
  }

  async function togglePrivacy() {
    const next = !task?.is_private
    await supabase.from('tasks').update({ is_private: next, updated_at: new Date().toISOString() }).eq('id', taskId)
    setTask((t) => t ? { ...t, is_private: next } : t)
    onUpdated()
  }

  async function reassignTask(newId: string) {
    const prev = task?.assigned_to ?? null
    if (newId === prev) return
    await supabase.from('tasks').update({ assigned_to: newId || null, updated_at: new Date().toISOString() }).eq('id', taskId)
    const prevName = prev ? (teamMembers.find(m => m.id === prev)?.full_name ?? teamMembers.find(m => m.id === prev)?.email ?? 'Unknown') : 'Unassigned'
    const newName = newId ? (teamMembers.find(m => m.id === newId)?.full_name ?? teamMembers.find(m => m.id === newId)?.email ?? 'Unassigned') : 'Unassigned'
    setAssignedTo(newId)
    setAssigneeName(newName)
    setTask(t => t ? { ...t, assigned_to: newId || null } : t)
    logActivity('assignee_changed', 'task', taskId, { title: task?.title ?? '', from: prevName, to: newName })
    if (newId && newId !== prev) {
      notifyAdminsAndAssignee("You've been assigned a task", task?.title ?? '', 'task_assigned', taskId, newId)
    }
    onUpdated()
  }

  async function addFollower(userId: string) {
    await supabase.from('task_followers').insert({ task_id: taskId, user_id: userId })
    const member = teamMembers.find(m => m.id === userId)
    setFollowers(prev => [...prev, { userId, name: member?.full_name ?? member?.email ?? 'Unknown' }])
  }

  async function removeFollower(userId: string) {
    await supabase.from('task_followers').delete().eq('task_id', taskId).eq('user_id', userId)
    setFollowers(prev => prev.filter(f => f.userId !== userId))
  }

  const inputStyle = {
    background: 'var(--bg-base)',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    padding: '7px 10px',
    fontSize: '13px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    width: '100%',
  }

  if (!task) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />

      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
          ...(isMobile ? { left: 0 } : {}),
          width: '100%', maxWidth: isMobile ? '100%' : '480px',
          background: 'var(--bg-surface)',
          borderLeft: isMobile ? 'none' : '1px solid var(--border-default)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <PriorityDot priority={task.priority} />
              {editing ? (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ ...inputStyle, fontSize: '15px', fontWeight: 600 }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                />
              ) : (
                <h2 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, lineHeight: '1.4', margin: 0 }}>
                  {task.title}
                </h2>
              )}
            </div>
            <button onClick={onClose} style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '5px', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>

          {/* Status row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <StatusBadge status={task.status} />
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{task.type}</span>
            {task.archived && (
              <span style={{ background: '#78350f20', color: '#d97706', border: '1px solid #d9770640', borderRadius: '4px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', fontFamily: 'var(--font-mono)' }}>
                ARCHIVED
              </span>
            )}
            <button
              onClick={togglePrivacy}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: task.is_private ? 'rgba(239,68,68,0.08)' : 'var(--bg-elevated)', border: `1px solid ${task.is_private ? 'rgba(239,68,68,0.25)' : 'var(--border-default)'}`, color: task.is_private ? '#EF4444' : 'var(--text-tertiary)', borderRadius: '4px', fontSize: '10px', fontWeight: 600, padding: '2px 7px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            >
              {task.is_private ? <Lock size={9} /> : <Globe size={9} />}
              {task.is_private ? 'PRIVATE' : 'PUBLIC'}
            </button>
          </div>
        </div>

        {/* Status changer */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '8px' }}>CHANGE STATUS</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                style={{
                  background: task.status === s ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                  border: `1px solid ${task.status === s ? 'var(--accent-border)' : 'var(--border-default)'}`,
                  color: task.status === s ? 'var(--accent)' : 'var(--text-secondary)',
                  borderRadius: '6px', padding: '5px 10px', fontSize: '11px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                {task.status === s && <CheckCircle2 size={11} />}
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Meta info */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                <Building2 size={12} /> BU
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{buName || '—'}</div>
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                <User size={12} /> Assigned to
              </div>
              <select
                value={assignedTo}
                onChange={e => reassignTask(e.target.value)}
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-secondary)', padding: '4px 6px', fontSize: '12px', fontFamily: 'var(--font-ui)', outline: 'none', cursor: 'pointer', width: '100%' }}
              >
                <option value="">— Unassigned —</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                <Calendar size={12} /> Due date
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                <Clock size={12} /> Est. hours
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{task.estimated_hours ? `${task.estimated_hours}h` : '—'}</div>
            </div>
          </div>
        </div>

        {/* Followers */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '10px' }}>
            RELATED PEOPLE {followers.length > 0 && `· ${followers.length}`}
          </p>
          {followers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {followers.map(f => (
                <span key={f.userId} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '20px', padding: '3px 6px 3px 10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {f.name}
                  <button onClick={() => removeFollower(f.userId)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '15px', padding: '0 3px', lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <select
            onChange={(e) => { if (e.target.value) { addFollower(e.target.value); (e.target as HTMLSelectElement).value = '' } }}
            defaultValue=""
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-secondary)', padding: '5px 8px', fontSize: '12px', fontFamily: 'var(--font-ui)', outline: 'none', cursor: 'pointer', width: '100%' }}
          >
            <option value="">+ Add related person…</option>
            {teamMembers
              .filter(m => !followers.some(f => f.userId === m.id) && m.id !== task.assigned_to)
              .map(m => <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>)}
          </select>
        </div>

        {/* Edit section */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          {editing ? (
            <div className="flex flex-col gap-3">
              <div>
                <label style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Add context..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Due date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  />
                </div>
                <div>
                  <label style={{ color: 'var(--text-tertiary)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} style={{ ...inputStyle, cursor: 'pointer' }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
                  >
                    <option value="HIGH">🔴 HIGH</option>
                    <option value="MEDIUM">🟡 MEDIUM</option>
                    <option value="LOW">🟢 LOW</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '7px', padding: '8px', fontSize: '12px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={saveEdits} disabled={saving} style={{ flex: 2, background: 'var(--accent)', color: '#000', borderRadius: '7px', padding: '8px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {task.description ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' }}>{task.description}</p>
              ) : (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginBottom: '10px' }}>No description.</p>
              )}
              <button onClick={() => setEditing(true)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>
                Edit task
              </button>
            </div>
          )}
        </div>

        {/* Proofs */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="flex items-center gap-2 mb-3">
            <Paperclip size={12} style={{ color: 'var(--text-tertiary)' }} />
            <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', margin: 0 }}>PROOF {proofs.length > 0 && `· ${proofs.length} file${proofs.length > 1 ? 's' : ''}`}</p>
          </div>

          {/* Existing proofs */}
          {proofs.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {proofs.map((p) => {
                const isImage = p.file_type.startsWith('image/')
                const isPDF = p.file_type === 'application/pdf'
                const isVideo = p.file_type.startsWith('video/')
                const ext = p.file_type.split('/')[1]?.toUpperCase() ?? 'FILE'
                const EXT_COLORS: Record<string, string> = { PDF: '#EF4444', PNG: '#3B82F6', JPG: '#3B82F6', JPEG: '#3B82F6', WEBP: '#3B82F6', MP4: '#A855F7', MOV: '#A855F7', QUICKTIME: '#A855F7' }
                const extColor = EXT_COLORS[ext] ?? '#888888'

                return (
                  <div key={p.id} style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                    {/* File header row */}
                    <div className="flex items-center gap-3 px-3 py-2">
                      <span style={{ background: `${extColor}20`, color: extColor, fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                        {ext}
                      </span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', flex: 1 }}>
                        {new Date(p.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={() => setPreviewProof({ url: p.file_url, type: p.file_type })}
                        style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '5px', color: 'var(--text-secondary)', fontSize: '11px', padding: '3px 8px', cursor: 'pointer' }}
                      >
                        Preview
                      </button>
                      <a href={p.file_url} target="_blank" rel="noopener noreferrer"
                        style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '5px', color: 'var(--text-secondary)', fontSize: '11px', padding: '3px 8px', textDecoration: 'none' }}
                      >
                        Open ↗
                      </a>
                    </div>

                    {/* Inline preview */}
                    {isImage && (
                      <img
                        src={p.file_url}
                        alt="proof"
                        onClick={() => setPreviewProof({ url: p.file_url, type: p.file_type })}
                        style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block', cursor: 'zoom-in', borderTop: '1px solid var(--border-subtle)' }}
                      />
                    )}
                    {isPDF && (
                      <iframe
                        src={`${p.file_url}#toolbar=0`}
                        style={{ width: '100%', height: '200px', border: 'none', borderTop: '1px solid var(--border-subtle)', display: 'block' }}
                        title="PDF preview"
                      />
                    )}
                    {isVideo && (
                      <video
                        src={p.file_url}
                        controls
                        style={{ width: '100%', maxHeight: '200px', display: 'block', borderTop: '1px solid var(--border-subtle)' }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `1px dashed ${dragOver ? 'var(--accent)' : 'var(--border-default)'}`,
              borderRadius: '8px',
              padding: '12px',
              cursor: 'pointer',
              background: dragOver ? 'var(--accent-bg)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.15s',
            }}
          >
            <Upload size={13} style={{ color: dragOver ? 'var(--accent)' : 'var(--text-tertiary)' }} />
            <span style={{ color: dragOver ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: '12px' }}>
              {uploadingProof ? 'Uploading…' : 'Drop file or click to upload proof'}
            </span>
            <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProof(f) }}
            />
          </div>
        </div>

        {/* Comments */}
        <div style={{ padding: '14px 20px', flex: 1 }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '10px' }}>COMMENTS {comments.length > 0 && `· ${comments.length}`}</p>
          <div className="flex flex-col gap-3 mb-4">
            {comments.length === 0 && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>No comments yet.</p>
            )}
            {comments.map((c) => (
              <div key={c.id} style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '10px 12px' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600 }}>{c.author}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                    {new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5', margin: 0 }}>{c.content}</p>
              </div>
            ))}
          </div>

          {/* New comment */}
          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() } }}
              placeholder="Add a comment…"
              style={{ ...inputStyle, flex: 1 }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-default)')}
            />
            <button
              onClick={postComment}
              disabled={postingComment || !newComment.trim()}
              style={{ background: newComment.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: newComment.trim() ? '#000' : 'var(--text-tertiary)', border: 'none', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: newComment.trim() ? 'pointer' : 'not-allowed' }}
            >
              Post
            </button>
          </div>

          {/* Archive / restore */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            {task.archived ? (
              <button
                onClick={restoreTask}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '7px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
              >
                <ArchiveRestore size={13} />
                Restore task
              </button>
            ) : (
              <button
                onClick={archiveTask}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)', borderRadius: '7px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
              >
                <Archive size={13} />
                Archive task
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen preview modal */}
      {previewProof && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setPreviewProof(null)}
        >
          <button
            onClick={() => setPreviewProof(null)}
            style={{ position: 'absolute', top: '16px', right: '20px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: 'var(--text-secondary)', zIndex: 10 }}
          >
            <X size={16} />
          </button>
          <div
            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '10px', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {previewProof.type.startsWith('image/') && (
              <img src={previewProof.url} alt="proof" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', display: 'block', borderRadius: '8px' }} />
            )}
            {previewProof.type === 'application/pdf' && (
              <iframe
                src={previewProof.url}
                style={{ width: '80vw', height: '85vh', border: 'none', borderRadius: '8px', background: '#fff' }}
                title="PDF preview"
              />
            )}
            {previewProof.type.startsWith('video/') && (
              <video src={previewProof.url} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '8px' }} />
            )}
          </div>
          <a
            href={previewProof.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ position: 'absolute', bottom: '20px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '7px', padding: '8px 16px', color: 'var(--text-secondary)', fontSize: '12px', textDecoration: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            Open original ↗
          </a>
        </div>
      )}
    </>
  )
}
