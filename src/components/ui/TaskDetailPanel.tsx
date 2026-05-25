import { useEffect, useRef, useState } from 'react'
import { X, Calendar, Clock, User, Building2, CheckCircle2, Paperclip, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { notifySlack, statusChangedMessage, proofUploadedMessage } from '../../hooks/useSlack'
import { PriorityDot } from './PriorityDot'
import { StatusBadge } from './StatusBadge'
import type { Task, TaskStatus, TaskPriority } from '../../types'

interface Props {
  taskId: string
  onClose: () => void
  onUpdated: () => void
}

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'PROOF_SUBMITTED', 'APPROVED', 'REVISION']
const STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PROOF_SUBMITTED: 'Proof Submitted',
  APPROVED: 'Approved',
  REVISION: 'Revision',
}

export function TaskDetailPanel({ taskId, onClose, onUpdated }: Props) {
  const [task, setTask] = useState<Task | null>(null)
  const [buName, setBuName] = useState('')
  const [assigneeName, setAssigneeName] = useState('')
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
  const [dragOver, setDragOver] = useState(false)
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

      if (t.bu_id) {
        const { data: bu } = await supabase.from('business_units').select('code, name').eq('id', t.bu_id).single()
        if (bu) setBuName(`${bu.code} · ${bu.name}`)
      }
      if (t.assigned_to) {
        const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', t.assigned_to).single()
        if (p) setAssigneeName(p.full_name ?? p.email ?? '')
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
    await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId)
    setTask((t) => t ? { ...t, status } : t)
    notifySlack(statusChangedMessage(task?.title ?? '', prev, status, buName || 'HOG OPS'))
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
    setNewComment('')
    setPostingComment(false)
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
          width: '100%', maxWidth: '480px',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
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
          <div className="flex items-center gap-2 mt-3">
            <StatusBadge status={task.status} />
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{task.type}</span>
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
            {[
              { icon: <Building2 size={12} />, label: 'BU', value: buName || '—' },
              { icon: <User size={12} />, label: 'Assigned to', value: assigneeName || 'Unassigned' },
              { icon: <Calendar size={12} />, label: 'Due date', value: task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
              { icon: <Clock size={12} />, label: 'Est. hours', value: task.estimated_hours ? `${task.estimated_hours}h` : '—' },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                  {row.icon} {row.label}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{row.value}</div>
              </div>
            ))}
          </div>
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
            <div className="flex flex-wrap gap-2 mb-3">
              {proofs.map((p) => (
                <a key={p.id} href={p.file_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', border: '1px solid var(--border-default)', borderRadius: '6px', overflow: 'hidden' }}
                >
                  {p.file_type.startsWith('image/') ? (
                    <img src={p.file_url} alt="proof" style={{ width: '80px', height: '80px', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '80px', height: '80px', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '24px' }}>{p.file_type.startsWith('video/') ? '🎥' : '📄'}</span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                        {p.file_type.split('/')[1]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                </a>
              ))}
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
        </div>
      </div>
    </>
  )
}
