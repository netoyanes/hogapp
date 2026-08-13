import { useEffect, useRef, useState } from 'react'
import { X, Calendar, Clock, User, Building2, CheckCircle2, Paperclip, Upload, Archive, ArchiveRestore, Lock, Globe, Share2, Check, Link2, Plus, Trash2, ExternalLink, Copy, FolderKanban } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { notifySlack, proofUploadedMessage, taskAssignedMessage, notifyUserDM, taskLink } from '../../hooks/useSlack'
import { changeTaskStatus } from '../../lib/taskActions'
import { logActivity } from '../../hooks/useActivityLog'
import { notifyAdminsAndAssignee, sendTaskAssignmentEmail } from '../../lib/notifications'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useSheetLayer, Sheet, showToast } from '../v2'
import { PriorityDot } from './PriorityDot'
import { StatusBadge } from './StatusBadge'
import { HtmlFrame } from './HtmlFrame'
import { Avatar } from './Avatar'
import { EntityChat } from './EntityChat'
import type { Task, TaskStatus, TaskPriority, TaskArea, ClientImpact, DeadlineType } from '../../types'
import { TASK_AREA_LABELS, TASK_AREA_GROUPS, CLIENT_IMPACT_LABELS } from '../../lib/taskAreas'

interface Props {
  taskId: string
  onClose: () => void
  onUpdated: () => void
  onOpenTask?: (id: string) => void
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

interface ProofCardProps {
  proof: { id: string; file_url: string; file_type: string; created_at: string; archived: boolean }
  archived?: boolean
  onPreview: () => void
  onArchive?: () => void
  onUnarchive?: () => void
}

function ProofCard({ proof: p, archived, onPreview, onArchive, onUnarchive }: ProofCardProps) {
  const isImage = p.file_type.startsWith('image/')
  const isPDF = p.file_type === 'application/pdf'
  const isVideo = p.file_type.startsWith('video/')
  const isHTML = p.file_type === 'text/html'
  const ext = isHTML ? 'HTML' : p.file_type.split('/')[1]?.toUpperCase() ?? 'FILE'
  const EXT_COLORS: Record<string, string> = { PDF: '#EF4444', PNG: '#3B82F6', JPG: '#3B82F6', JPEG: '#3B82F6', WEBP: '#3B82F6', MP4: '#A855F7', MOV: '#A855F7', QUICKTIME: '#A855F7', HTML: '#F97316' }
  const extColor = EXT_COLORS[ext] ?? '#888888'

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-elevated)', opacity: archived ? 0.55 : 1 }}>
      <div className="flex items-center gap-3 px-3 py-2">
        <span style={{ background: `${extColor}20`, color: extColor, fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
          {ext}
        </span>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', flex: 1 }}>
          {new Date(p.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {archived && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>ARCHIVED</span>}
        </span>
        <button onClick={onPreview} style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '5px', color: 'var(--text-secondary)', fontSize: '11px', padding: '3px 8px', cursor: 'pointer' }}>
          Preview
        </button>
        <a href={p.file_url} target="_blank" rel="noopener noreferrer" style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '5px', color: 'var(--text-secondary)', fontSize: '11px', padding: '3px 8px', textDecoration: 'none' }}>
          Open ↗
        </a>
        {archived ? (
          <button onClick={onUnarchive} title="Restore" style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '5px', color: 'var(--text-tertiary)', fontSize: '11px', padding: '3px 8px', cursor: 'pointer' }}>
            Restore
          </button>
        ) : (
          <button onClick={onArchive} title="Archive" style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '5px', color: 'var(--text-tertiary)', fontSize: '11px', padding: '3px 8px', cursor: 'pointer' }}>
            Archive
          </button>
        )}
      </div>

      {!archived && isImage && (
        <img src={p.file_url} alt="proof" onClick={onPreview}
          style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block', cursor: 'zoom-in', borderTop: '1px solid var(--border-subtle)' }}
        />
      )}
      {!archived && isPDF && (
        <iframe src={`${p.file_url}#toolbar=0`} style={{ width: '100%', height: '200px', border: 'none', borderTop: '1px solid var(--border-subtle)', display: 'block' }} title="PDF preview" />
      )}
      {!archived && isVideo && (
        <video src={p.file_url} controls style={{ width: '100%', maxHeight: '200px', display: 'block', borderTop: '1px solid var(--border-subtle)' }} />
      )}
      {!archived && isHTML && (
        <HtmlFrame url={p.file_url} title="HTML preview" style={{ width: '100%', height: '220px', border: 'none', borderTop: '1px solid var(--border-subtle)', display: 'block', background: '#fff' }} />
      )}
    </div>
  )
}

interface TaskLink { id: string; url: string; title: string | null; created_at: string; archived: boolean }

// Preview de link sin servidor: deduce el tipo por el URL. YouTube → embed;
// imagen directa → miniatura; el resto → tarjeta con favicon + dominio.
function linkKind(url: string): { kind: 'youtube' | 'image' | 'video' | 'link'; embed?: string } {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const yt = host.includes('youtube.com') ? u.searchParams.get('v') : host === 'youtu.be' ? u.pathname.slice(1) : null
    if (yt) return { kind: 'youtube', embed: `https://www.youtube.com/embed/${yt}` }
    if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u.pathname)) return { kind: 'image' }
    if (/\.(mp4|webm|mov)(\?|$)/i.test(u.pathname)) return { kind: 'video' }
    return { kind: 'link' }
  } catch { return { kind: 'link' } }
}
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function LinkCard({ link, onArchive }: { link: TaskLink; onArchive: () => void }) {
  const meta = linkKind(link.url)
  const host = hostOf(link.url)
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`
  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-elevated)' }}>
      <div className="flex items-center gap-3 px-3 py-2">
        <img src={favicon} alt="" width={16} height={16} style={{ flexShrink: 0, borderRadius: '3px' }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {link.title?.trim() || host}
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.url}</div>
        </div>
        <a href={link.url} target="_blank" rel="noopener noreferrer" title="Abrir" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: '5px', padding: '4px 7px', display: 'flex', alignItems: 'center' }}>
          <ExternalLink size={12} />
        </a>
        <button onClick={onArchive} title="Quitar" style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '5px', color: 'var(--text-tertiary)', padding: '4px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <Trash2 size={12} />
        </button>
      </div>
      {meta.kind === 'youtube' && (
        <iframe src={meta.embed} style={{ width: '100%', height: '180px', border: 'none', borderTop: '1px solid var(--border-subtle)', display: 'block' }} allowFullScreen title="YouTube preview" />
      )}
      {meta.kind === 'image' && (
        <a href={link.url} target="_blank" rel="noopener noreferrer">
          <img src={link.url} alt="" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block', borderTop: '1px solid var(--border-subtle)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </a>
      )}
      {meta.kind === 'video' && (
        <video src={link.url} controls style={{ width: '100%', maxHeight: '200px', display: 'block', borderTop: '1px solid var(--border-subtle)' }} />
      )}
    </div>
  )
}

export function TaskDetailPanel({ taskId, onClose, onUpdated, onOpenTask, userRole: _userRole }: Props) {
  const isMobile = useIsMobile()
  // Cada cambio guardado avisa a TODA la app (evento global): la ventana desde
  // la que se abrió esta tarea (proyecto, board, campana) se refresca sola
  const notifyUpdated = () => { onUpdated(); window.dispatchEvent(new CustomEvent('hog:task-updated')) }
  // Se apila sobre la ventana desde la que se abrió (p. ej. un proyecto):
  // en escritorio se centra y la anterior queda visible detrás, conectadas
  const { behind, isTop, zBase } = useSheetLayer(true)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isTop) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isTop, onClose])
  const [task, setTask] = useState<Task | null>(null)
  const [buName, setBuName] = useState('')
  const [creatorName, setCreatorName] = useState<string | null>(null)
  const [, setAssigneeName] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM')
  const [taskArea, setTaskArea] = useState<TaskArea>('direccion')
  const [clientImpact, setClientImpact] = useState<ClientImpact>('internal')
  const [buId, setBuId] = useState('')
  const [proofRequired, setProofRequired] = useState(false)
  const [estimatedHours, setEstimatedHours] = useState('')
  const [deadlineType, setDeadlineType] = useState<DeadlineType>('SOFT')
  const [saving, setSaving] = useState(false)
  const [proofs, setProofs] = useState<{ id: string; file_url: string; file_type: string; created_at: string; archived: boolean }[]>([])
  const [uploadingProof, setUploadingProof] = useState(false)
  const [links, setLinks] = useState<TaskLink[]>([])
  const [newLink, setNewLink] = useState('')
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [addingLink, setAddingLink] = useState(false)

  const [followers, setFollowers] = useState<{ userId: string; name: string }[]>([])
  const [, setCurrentUserId] = useState<string | undefined>(undefined)
  const [dragOver, setDragOver] = useState(false)
  const [previewProof, setPreviewProof] = useState<{ url: string; type: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [approvedAt, setApprovedAt] = useState<string | null>(null)
  // Metadata collapses so comments + evidence get the vertical space (mobile-first)
  const [metaOpen, setMetaOpen] = useState(!isMobile)
  const fileRef = useRef<HTMLInputElement>(null)

  function copyShareLink() {
    const url = `${window.location.origin}?share=${taskId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? undefined))
  }, [])

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from('tasks').select('*').eq('id', taskId).single()
      if (!t) return
      setTask(t)
      setTitle(t.title)
      setDescription(t.description ?? '')
      setDueDate(t.due_date ?? '')
      setPriority(t.priority)
      setTaskArea(t.area ?? 'direccion')
      setClientImpact(t.client_impact ?? 'internal')
      setBuId(t.bu_id ?? '')
      setProofRequired(t.proof_required)
      setEstimatedHours(t.estimated_hours != null ? String(t.estimated_hours) : '')
      setDeadlineType(t.deadline_type)
      setAssignedTo(t.assigned_to ?? '')

      const { data: buses } = await supabase.from('business_units').select('id, code, name').order('name')
      setBuList(buses ?? [])
      const matchedBu = buses?.find(b => b.id === t.bu_id)
      if (matchedBu) setBuName(`${matchedBu.code} · ${matchedBu.name}`)
      if (t.assigned_to) {
        const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', t.assigned_to).single()
        if (p) setAssigneeName(p.full_name ?? p.email ?? '')
      }
      if (t.created_by) {
        const { data: creator } = await supabase.from('profiles').select('full_name, email').eq('id', t.created_by).single()
        if (creator) setCreatorName(creator.full_name ?? creator.email ?? null)
      }

      const { data: members } = await supabase.from('profiles').select('id, full_name, email').not('full_name', 'is', null)
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

      // Load proofs
      const { data: pr } = await supabase
        .from('task_proofs')
        .select('id, file_url, file_type, created_at, archived')
        .eq('task_id', taskId)
        .order('created_at')
      setProofs((pr ?? []).map(p => ({ ...p, archived: p.archived ?? false })))

      // Load links (referencias externas: Drive, Figma, YouTube…)
      const { data: lk } = await supabase
        .from('task_links')
        .select('id, url, title, created_at, archived')
        .eq('task_id', taskId)
        .order('created_at')
      setLinks((lk ?? []) as TaskLink[])

      // Find when task was first approved
      const { data: approvalLog } = await supabase
        .from('activity_log')
        .select('created_at, details')
        .eq('entity_id', taskId)
        .eq('action', 'status_changed')
        .order('created_at', { ascending: true })
      const firstApproval = approvalLog?.find(
        (e) => (e.details as Record<string, unknown>)?.to === 'APPROVED'
      )
      setApprovedAt(firstApproval?.created_at ?? null)
    }
    load()
  }, [taskId])

  async function changeStatus(status: TaskStatus) {
    if (!task) return
    // Shared action = DB update + Slack/DM/log/notifications (same as board swipe)
    await changeTaskStatus(task, status, buName)
    setTask((t) => t ? { ...t, status, ...(status === 'APPROVED' ? { priority: 'LOW' } : {}) } : t)
    setPriority(status === 'APPROVED' ? 'LOW' : priority)
    notifyUpdated()
  }

  async function uploadProof(file: File) {
    const ext = file.name.split('.').pop()
    const path = `proofs/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('proofs').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' })
    if (error) return
    const { data: urlData } = supabase.storage.from('proofs').getPublicUrl(path)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('task_proofs').insert({
      task_id: taskId,
      file_url: urlData.publicUrl,
      file_type: file.type,
      uploaded_by: user?.id,
    })
    setProofs((prev) => [...prev, { id: Date.now().toString() + Math.random(), file_url: urlData.publicUrl, file_type: file.type, created_at: new Date().toISOString(), archived: false }])
    return urlData.publicUrl
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return
    setUploadingProof(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: pRow } = await supabase.from('profiles').select('full_name, email').eq('id', user?.id ?? '').single()
    const uploaderName = pRow?.full_name ?? pRow?.email ?? 'Someone'
    await Promise.all(files.map(f => uploadProof(f)))
    notifySlack(proofUploadedMessage(task?.title ?? '', buName || 'HOG APP', uploaderName, taskLink(taskId)))
    logActivity('proof_uploaded', 'task', taskId, { title: task?.title ?? '', count: files.length })
    notifyAdminsAndAssignee('Proof uploaded', task?.title ?? '', 'proof_uploaded', taskId, task?.assigned_to ?? undefined)
    setUploadingProof(false)
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) uploadFiles(files)
  }

  async function addLink() {
    let url = newLink.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url  // tolera pegar sin http
    try { new URL(url) } catch { return }
    setAddingLink(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('task_links')
      .insert({ task_id: taskId, url, title: newLinkTitle.trim() || null, added_by: user?.id ?? null })
      .select('id, url, title, created_at, archived').single()
    setAddingLink(false)
    if (error || !data) return
    setLinks(prev => [...prev, data as TaskLink])
    setNewLink(''); setNewLinkTitle('')
    logActivity('link_added', 'task', taskId, { title: task?.title ?? '', url })
  }

  async function archiveLink(id: string) {
    await supabase.from('task_links').update({ archived: true }).eq('id', id)
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  async function saveEdits() {
    if (!task) return
    setSaving(true)
    const newBuName = buList.find(b => b.id === buId)
    const newHours = estimatedHours ? parseFloat(estimatedHours) : null

    // Diff campo por campo, legible en español — es lo que queda en el log
    const buLabel = (id: string | null) => id ? (buList.find(b => b.id === id)?.code ?? '?') : 'sin venue'
    const cambios: string[] = []
    if (title !== task.title) cambios.push(`título: "${task.title}" → "${title}"`)
    if ((description || null) !== task.description) cambios.push('descripción editada')
    if ((buId || null) !== task.bu_id) cambios.push(`venue: ${buLabel(task.bu_id)} → ${buLabel(buId || null)}`)
    if (taskArea !== task.area) cambios.push(`área: ${task.area ? TASK_AREA_LABELS[task.area] : '—'} → ${TASK_AREA_LABELS[taskArea]}`)
    if (clientImpact !== task.client_impact) cambios.push(`impacto: ${task.client_impact ? CLIENT_IMPACT_LABELS[task.client_impact] : '—'} → ${CLIENT_IMPACT_LABELS[clientImpact]}`)
    if (priority !== task.priority) cambios.push(`prioridad: ${task.priority} → ${priority}`)
    if ((dueDate || null) !== task.due_date) cambios.push(`fecha límite: ${task.due_date ?? '—'} → ${dueDate || '—'}`)
    if (deadlineType !== task.deadline_type) cambios.push(`deadline: ${task.deadline_type} → ${deadlineType}`)
    if (newHours !== task.estimated_hours) cambios.push(`horas: ${task.estimated_hours ?? '—'} → ${newHours ?? '—'}`)
    if (proofRequired !== task.proof_required) cambios.push(proofRequired ? 'ahora exige evidencia' : 'ya no exige evidencia')

    const { error } = await supabase.from('tasks').update({
      title,
      description: description || null,
      due_date: dueDate || null,
      priority,
      area: taskArea,
      client_impact: clientImpact,
      bu_id: buId || null,
      proof_required: proofRequired,
      estimated_hours: newHours,
      deadline_type: deadlineType,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId)
    if (!error && cambios.length > 0) {
      logActivity('task_edited', 'task', taskId, { title, cambios: cambios.join(' · ') })
    }
    if (newBuName) setBuName(`${newBuName.code} · ${newBuName.name}`)
    else setBuName('')
    setTask(prev => prev ? { ...prev, title, description: description || null, due_date: dueDate || null, priority, area: taskArea, client_impact: clientImpact, bu_id: buId || null, proof_required: proofRequired, estimated_hours: newHours, deadline_type: deadlineType } : prev)
    setSaving(false)
    setEditing(false)
    notifyUpdated()
  }

  const [duplicating, setDuplicating] = useState(false)
  // Duplicar: ideal para tareas recurrentes. Copia la configuración (área,
  // venue, prioridad, horas, privacidad, links de referencia) pero arranca
  // limpia — estatus Abierta, sin fecha, sin evidencia ni comentarios.
  async function duplicateTask() {
    if (!task || duplicating) return
    setDuplicating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: copy, error } = await supabase.from('tasks').insert({
      title: `${task.title} (copia)`,
      description: task.description,
      area: task.area,
      client_impact: task.client_impact,
      bu_id: task.bu_id,
      priority: task.priority,
      status: 'OPEN',
      assigned_to: task.assigned_to,
      created_by: user?.id ?? null,
      due_date: null,
      proof_required: task.proof_required,
      deadline_type: task.deadline_type,
      estimated_hours: task.estimated_hours,
      is_private: task.is_private,
    }).select('id').single()
    if (error || !copy) { setDuplicating(false); return }
    // Copia los links de referencia (útiles en recurrentes); NO copia
    // evidencia ni comentarios (eso es del ciclo anterior).
    if (links.length) {
      await supabase.from('task_links').insert(
        links.map(l => ({ task_id: copy.id, url: l.url, title: l.title, added_by: user?.id ?? null }))
      )
    }
    logActivity('task_created', 'task', copy.id, { title: `${task.title} (copia)`, via: 'duplicate' })
    setDuplicating(false)
    notifyUpdated()
    if (onOpenTask) onOpenTask(copy.id); else onClose()
  }

  async function archiveTask() {
    await supabase.from('tasks').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', taskId)
    logActivity('task_archived', 'task', taskId, { title: task?.title ?? '' })
    notifyUpdated()
    onClose()
  }

  async function restoreTask() {
    await supabase.from('tasks').update({ archived: false, updated_at: new Date().toISOString() }).eq('id', taskId)
    logActivity('task_restored', 'task', taskId, { title: task?.title ?? '' })
    setTask((t) => t ? { ...t, archived: false } : t)
    notifyUpdated()
  }

  async function togglePrivacy() {
    const next = !task?.is_private
    await supabase.from('tasks').update({ is_private: next, updated_at: new Date().toISOString() }).eq('id', taskId)
    setTask((t) => t ? { ...t, is_private: next } : t)
    notifyUpdated()
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
      sendTaskAssignmentEmail(taskId, newId)
      notifyUserDM(newId, taskAssignedMessage(task?.title ?? '', newName, taskLink(taskId)))
    }
    notifyUpdated()
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

  async function archiveProof(id: string) {
    await supabase.from('task_proofs').update({ archived: true }).eq('id', id)
    const proof = proofs.find(p => p.id === id)
    logActivity('proof_archived', 'task', taskId, { title: task?.title ?? '', fileType: proof?.file_type ?? '' })
    setProofs(prev => prev.map(p => p.id === id ? { ...p, archived: true } : p))
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
    boxSizing: 'border-box' as const,
  }
  const lbl: React.CSSProperties = { color: 'var(--text-tertiary)', fontSize: '11px', display: 'block', marginBottom: '4px' }

  if (!task) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0" style={{ background: zBase > 60 ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.5)', zIndex: zBase }} onClick={onClose} />

      {/* Panel: centrado en escritorio, hoja completa en teléfono; si tiene
          subventanas encima se atenúa y asoma detrás (misma pila que Sheet) */}
      <div
        style={{
          zIndex: zBase + 1,
          background: 'var(--bg-surface)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
          transition: 'transform .28s cubic-bezier(.2,.8,.2,1), filter .28s',
          ...(isMobile
            ? { position: 'fixed' as const, top: 0, right: 0, bottom: 0, left: 0, width: '100%' }
            : {
                position: 'fixed' as const, left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                width: 480, maxWidth: '94vw', height: 'min(86vh, 860px)', maxHeight: '94vh',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
                animation: 'sheet-pop var(--motion-sheet)',
              }),
          ...(behind > 0
            ? {
                transform: isMobile
                  ? `translateY(${-6 - behind * 4}px) scale(${1 - 0.03 * behind})`
                  : `translate(-50%, calc(-50% - ${12 + behind * 8}px)) scale(${1 - 0.035 * behind})`,
                filter: 'brightness(0.55) saturate(0.85)',
                pointerEvents: 'none' as const,
              }
            : {}),
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
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {!task.event_id && (
                <button onClick={() => setConvertOpen(true)} title="Convertir en proyecto"
                  style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '5px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <FolderKanban size={13} />
                </button>
              )}
              <button onClick={copyShareLink} title="Copy share link" style={{ color: copied ? 'var(--accent)' : 'var(--text-secondary)', background: copied ? 'var(--accent-bg)' : 'var(--bg-elevated)', border: `1px solid ${copied ? 'var(--accent-border)' : 'var(--border-default)'}`, padding: '5px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontFamily: 'var(--font-ui)' }}>
                {copied ? <><Check size={12} /> Copied!</> : <Share2 size={13} />}
              </button>
              <button onClick={onClose} style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '5px', borderRadius: '6px', cursor: 'pointer' }}>
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Status row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <StatusBadge status={task.status} />
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{task.area ? TASK_AREA_LABELS[task.area] : '—'}</span>
            {task.client_impact && (
              <span style={{
                color: task.client_impact === 'client_facing' ? 'var(--accent)' : 'var(--text-tertiary)',
                fontSize: '11px', fontFamily: 'var(--font-mono)',
                border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '1px 6px',
              }}>{CLIENT_IMPACT_LABELS[task.client_impact]}</span>
            )}
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

        {/* Meta info — collapsible so comments/evidence get the space */}
        <button
          onClick={() => setMetaOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '10px 20px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', flexShrink: 0 }}
        >
          {metaOpen ? '▾' : '▸'} DETALLES
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 400 }}>
            {buName || '—'} · {task.due_date ? new Date(task.due_date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }) : 'sin fecha'}
          </span>
        </button>
        {metaOpen && (
        <>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}><Building2 size={12} /> BU</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{buName || '—'}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}><User size={12} /> Assigned to</div>
              <select value={assignedTo} onChange={e => reassignTask(e.target.value)}
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-secondary)', padding: '4px 6px', fontSize: '12px', fontFamily: 'var(--font-ui)', outline: 'none', cursor: 'pointer', width: '100%' }}>
                <option value="">— Unassigned —</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>)}
              </select>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}><Calendar size={12} /> Due date</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}><Clock size={12} /> Est. hours</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{task.estimated_hours ? `${task.estimated_hours}h` : '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '2px' }}>Área</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{task.area ? TASK_AREA_LABELS[task.area] : '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '2px' }}>Impacto en cliente</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{task.client_impact ? CLIENT_IMPACT_LABELS[task.client_impact] : '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '2px' }}>Deadline</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{task.deadline_type} {task.proof_required ? '· Proof req.' : ''}</div>
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
        </>
        )}

        {/* Edit section */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          {editing ? (
            <div className="flex flex-col gap-3">
              <div>
                <label style={lbl}>Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-default)')} />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="Add context…" style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border-default)')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lbl}>Área</label>
                  <select value={taskArea} onChange={e => setTaskArea(e.target.value as TaskArea)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {TASK_AREA_GROUPS.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map(a => <option key={a} value={a}>{TASK_AREA_LABELS[a]}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Impacto en cliente</label>
                  <select value={clientImpact} onChange={e => setClientImpact(e.target.value as ClientImpact)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {(Object.keys(CLIENT_IMPACT_LABELS) as ClientImpact[]).map(k => <option key={k} value={k}>{CLIENT_IMPACT_LABELS[k]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Business Unit</label>
                  <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">— None —</option>
                    {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="HIGH">🔴 HIGH</option>
                    <option value="MEDIUM">🟡 MEDIUM</option>
                    <option value="LOW">🟢 LOW</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Deadline type</label>
                  <select value={deadlineType} onChange={e => setDeadlineType(e.target.value as DeadlineType)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="SOFT">SOFT</option>
                    <option value="HARD">HARD</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Due date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border-default)')} />
                </div>
                <div>
                  <label style={lbl}>Est. hours</label>
                  <input type="number" min={0} step={0.5} value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)}
                    placeholder="0" style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border-default)')} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={proofRequired} onChange={e => setProofRequired(e.target.checked)} />
                Proof required
              </label>
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
              {task.description
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' }}>{task.description}</p>
                : <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginBottom: '10px' }}>No description.</p>
              }
              <button onClick={() => setEditing(true)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>
                Edit task
              </button>
            </div>
          )}
        </div>

        {/* Archivos adjuntos (evidencia en Storage) */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="flex items-center gap-2 mb-3">
            <Paperclip size={12} style={{ color: 'var(--text-tertiary)' }} />
            <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', margin: 0 }}>ARCHIVOS ADJUNTOS {proofs.filter(p => !p.archived).length > 0 && `· ${proofs.filter(p => !p.archived).length}`}</p>
          </div>

          {/* Active proofs */}
          {proofs.filter(p => !p.archived).length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {proofs.filter(p => !p.archived).map((p) => (
                <ProofCard
                  key={p.id}
                  proof={p}
                  onPreview={() => setPreviewProof({ url: p.file_url, type: p.file_type })}
                  onArchive={() => archiveProof(p.id)}
                />
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
              {uploadingProof ? 'Uploading…' : 'Drop files or click to upload proofs'}
            </span>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*,application/pdf,.html,.htm" style={{ display: 'none' }}
              onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) uploadFiles(files); e.target.value = '' }}
            />
          </div>
        </div>

        {/* Links adjuntos (referencias externas con preview) */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div className="flex items-center gap-2 mb-3">
            <Link2 size={12} style={{ color: 'var(--text-tertiary)' }} />
            <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', margin: 0 }}>LINKS ADJUNTOS {links.length > 0 && `· ${links.length}`}</p>
          </div>

          {links.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {links.map(l => <LinkCard key={l.id} link={l} onArchive={() => archiveLink(l.id)} />)}
            </div>
          )}

          {/* Agregar link — pega el URL (y opcionalmente un nombre) + Enter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              value={newLinkTitle} onChange={e => setNewLinkTitle(e.target.value)}
              placeholder="Nombre (opcional) — ej. Carpeta de Drive"
              style={{ ...inputStyle, fontSize: '12px' }}
              onKeyDown={e => { if (e.key === 'Enter') void addLink() }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={newLink} onChange={e => setNewLink(e.target.value)}
                placeholder="Pega un link…"
                style={{ ...inputStyle, fontSize: '12px', flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter') void addLink() }}
              />
              <button onClick={() => void addLink()} disabled={!newLink.trim() || addingLink}
                style={{ background: newLink.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: newLink.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', border: newLink.trim() ? 'none' : '1px solid var(--border-default)', borderRadius: '7px', padding: '0 14px', fontSize: '12px', fontWeight: 600, cursor: newLink.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Plus size={13} /> {addingLink ? '…' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>

        {/* Chat de la tarea — menciones @, doble palomita y tiempo real */}
        <div style={{ padding: '14px 20px', flex: 1 }}>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '10px' }}>CHAT</p>
          <EntityChat scope="task" entityId={taskId} entityLabel={task.title} notifyUserIds={[task.assigned_to, task.created_by]} />

          {/* Task created baseline entry */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', opacity: 0.6, marginTop: 12 }}>
            {creatorName
              ? <Avatar name={creatorName} size={28} />
              : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>✦</div>
            }
            <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: '8px', padding: '8px 12px', borderLeft: '2px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>{creatorName ?? 'Unknown'}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                  {new Date(task.created_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', fontStyle: 'italic', margin: '2px 0 0' }}>Tarea creada</p>
            </div>
          </div>

          {/* Response time */}
          {(() => {
            const start = task.created_at ? new Date(task.created_at).getTime() : null
            const end = approvedAt ? new Date(approvedAt).getTime() : null
            if (!start) return null
            const elapsed = (end ?? Date.now()) - start
            const totalMins = Math.floor(elapsed / 60000)
            const days  = Math.floor(totalMins / 1440)
            const hrs   = Math.floor((totalMins % 1440) / 60)
            const mins  = totalMins % 60
            const parts = []
            if (days) parts.push(`${days}d`)
            if (hrs)  parts.push(`${hrs}h`)
            if (!days && mins) parts.push(`${mins}m`)
            if (!parts.length) parts.push('<1m')
            const label = end ? 'Tiempo de atención' : 'En proceso desde'
            const color = end ? '#22C55E' : 'var(--text-tertiary)'
            return (
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
                  {end && '✅ '}{parts.join(' ')}
                </span>
              </div>
            )
          })()}

          {/* Duplicar — para tareas recurrentes */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={duplicateTask}
              disabled={duplicating}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '7px', padding: '8px 14px', fontSize: '12px', cursor: duplicating ? 'wait' : 'pointer', width: '100%', justifyContent: 'center' }}
            >
              <Copy size={13} />
              {duplicating ? 'Duplicando…' : 'Duplicar tarea'}
            </button>
          </div>

          {/* Archive / restore */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
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
            {previewProof.type === 'text/html' && (
              <HtmlFrame
                url={previewProof.url}
                title="HTML preview"
                style={{ width: '88vw', height: '85vh', border: 'none', borderRadius: '8px', background: '#fff' }}
              />
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

      {/* Convertir en proyecto — la tarea y su gente se trasladan a Proyectos */}
      {convertOpen && (
        <ConvertToProjectSheet
          task={task} buList={buList} teamMembers={teamMembers} followers={followers} isMobile={isMobile}
          onClose={() => setConvertOpen(false)}
          onConverted={() => { setConvertOpen(false); notifyUpdated(); onClose() }}
        />
      )}
    </>
  )
}

// ─── Convertir la tarea en proyecto (Proyectos) ──────────────────────────────
// Traslado completo: se crea el proyecto con los datos de la tarea, la tarea
// queda ligada como su primera tarea, y las personas relacionadas que elijas
// viajan con ella (siguen la tarea y quedan como colaboradores del proyecto).
function ConvertToProjectSheet({ task, buList, teamMembers, followers, isMobile, onClose, onConverted }: {
  task: Task
  buList: { id: string; code: string; name: string }[]
  teamMembers: { id: string; full_name: string | null; email: string | null }[]
  followers: { userId: string; name: string }[]
  isMobile: boolean
  onClose: () => void
  onConverted: () => void
}) {
  const KINDS = [
    { id: 'otro', label: 'Proyecto' }, { id: 'evento', label: 'Evento' }, { id: 'adecuacion', label: 'Adecuación' },
    { id: 'remodelacion', label: 'Remodelación' }, { id: 'apertura', label: 'Apertura' }, { id: 'mantenimiento', label: 'Mantenimiento' },
  ]
  const [name, setName] = useState(task.title)
  const [buId, setBuId] = useState(task.bu_id ?? '')
  const [kind, setKind] = useState('otro')
  const [endDate, setEndDate] = useState(task.due_date ?? '')
  const [responsible, setResponsible] = useState(task.assigned_to ?? '')
  // Personas relacionadas: arranca con las que ya siguen la tarea; aquí se
  // agregan/quitan y TODAS se trasladan al proyecto.
  const [people, setPeople] = useState<Set<string>>(() => new Set(followers.map(f => f.userId)))
  const [saving, setSaving] = useState(false)

  const nameOf = (id: string) => {
    const m = teamMembers.find(x => x.id === id)
    return m?.full_name ?? m?.email ?? ''
  }
  const togglePerson = (id: string) => setPeople(p => {
    const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n
  })

  async function convert() {
    if (!name.trim()) { showToast('Ponle nombre al proyecto.', 'error'); return }
    if (!buId) { showToast('Elige el venue del proyecto.', 'error'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const hoy = new Date()
    const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    const colaboradores = [...people].map(nameOf).filter(Boolean).join(', ')
    const { data: plan, error } = await supabase.from('event_plans').insert({
      bu_id: buId, name: name.trim(), description: task.description, kind,
      date: hoyISO, end_date: endDate || null, event_type: 'otro', status: 'planning',
      responsible: responsible || null, collaborators: colaboradores || null,
      created_by: user?.id ?? null,
    }).select('id').single()
    if (error || !plan) { setSaving(false); showToast(`No se pudo crear el proyecto: ${error?.message}`, 'error'); return }

    // La tarea se traslada: queda como la primera tarea del proyecto
    const { error: linkErr } = await supabase.from('tasks').update({ event_id: plan.id }).eq('id', task.id)
    if (linkErr) showToast(`Proyecto creado, pero la tarea no se pudo ligar: ${linkErr.message}`, 'error')

    // Las personas elegidas que aún no seguían la tarea, ahora la siguen
    const nuevos = [...people].filter(id => !followers.some(f => f.userId === id))
    if (nuevos.length) {
      await supabase.from('task_followers').insert(nuevos.map(uid => ({ task_id: task.id, user_id: uid })))
    }

    logActivity('task_converted_to_project', 'event', plan.id, { task: task.title, name: name.trim(), personas: people.size })
    setSaving(false)
    showToast('Proyecto creado — la tarea y su gente se trasladaron.', 'success')
    // Abrir el proyecto recién creado en Proyectos
    localStorage.setItem('hog_pending_project', plan.id)
    window.dispatchEvent(new CustomEvent('hog:goto-projects'))
    onConverted()
  }

  const inp: React.CSSProperties = { width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }
  const lb: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={440}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderKanban size={16} style={{ color: 'var(--accent)' }} /> Convertir en proyecto
          </h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
          La tarea se traslada a Proyectos: queda como la primera tarea del proyecto nuevo, con su chat e historial intactos, y las personas que elijas viajan con ella.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={lb}>Nombre del proyecto *</label><input value={name} onChange={e => setName(e.target.value)} style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lb}>Venue *</label>
              <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">Elegir…</option>
                {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select>
            </div>
            <div><label style={lb}>Tipo</label>
              <select value={kind} onChange={e => setKind(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lb}>Fecha objetivo</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="num" style={inp} /></div>
            <div><label style={lb}>Responsable</label>
              <select value={responsible} onChange={e => setResponsible(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">Sin responsable</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={lb}>Personas relacionadas — se trasladan al proyecto {people.size > 0 && `· ${people.size}`}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {teamMembers.map(m => {
                const on = people.has(m.id)
                return (
                  <button key={m.id} onClick={() => togglePerson(m.id)}
                    style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: on ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${on ? 'var(--accent-border)' : 'var(--border-default)'}`, color: on ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    {on ? '✓ ' : ''}{m.full_name ?? m.email}
                  </button>
                )
              })}
            </div>
          </div>
          <button onClick={convert} disabled={saving}
            style={{ minHeight: 46, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Convirtiendo…' : 'Crear proyecto y trasladar'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
