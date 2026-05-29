import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { HtmlFrame } from '../components/ui/HtmlFrame'
import type { Session } from '@supabase/supabase-js'

interface TaskData {
  id: string
  title: string
  description: string | null
  type: string
  status: string
  priority: string
  due_date: string | null
  estimated_hours: number | null
  deadline_type: string
  proof_required: boolean
  is_private: boolean
  bu_id: string | null
  assigned_to: string | null
}

interface Proof {
  id: string
  file_url: string
  file_type: string
  created_at: string
  archived: boolean
}

const PRIORITY_COLORS: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#EAB308', LOW: '#22C55E' }
const STATUS_COLORS: Record<string, string> = {
  OPEN: '#6B7280', IN_PROGRESS: '#3B82F6', PROOF_SUBMITTED: '#F59E0B',
  APPROVED: '#22C55E', REVISION: '#EF4444',
}
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', PROOF_SUBMITTED: 'Proof Submitted',
  APPROVED: 'Approved', REVISION: 'Revision',
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

interface Props {
  taskId: string
}

export function SharedTask({ taskId }: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [task, setTask] = useState<TaskData | null>(null)
  const [buName, setBuName] = useState('')
  const [assigneeName, setAssigneeName] = useState('')
  const [proofs, setProofs] = useState<Proof[]>([])
  const [taskLoading, setTaskLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [previewProof, setPreviewProof] = useState<Proof | null>(null)

  // Watch auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s)
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load task once authenticated
  useEffect(() => {
    if (!session) return
    const activeSession = session
    async function load() {
      setTaskLoading(true)
      const { data: t } = await supabase.from('tasks').select('*').eq('id', taskId).single()
      if (!t) { setNotFound(true); setTaskLoading(false); return }
      setTask(t)

      const [{ data: bu }, { data: assignee }, { data: proofRows }] = await Promise.all([
        t.bu_id ? supabase.from('business_units').select('code, name').eq('id', t.bu_id).single() : Promise.resolve({ data: null }),
        t.assigned_to ? supabase.from('profiles').select('full_name, email').eq('id', t.assigned_to).single() : Promise.resolve({ data: null }),
        supabase.from('task_proofs').select('id, file_url, file_type, created_at, archived').eq('task_id', taskId).order('created_at'),
      ])
      if (bu) setBuName(`${bu.code} · ${bu.name}`)
      if (assignee) setAssigneeName(assignee.full_name ?? assignee.email ?? '')
      setProofs((proofRows ?? []).map(p => ({ ...p, archived: p.archived ?? false })).filter(p => !p.archived))

      // Log view
      await supabase.from('activity_log').insert({
        user_id: activeSession.user.id,
        action: 'task_viewed_externally',
        entity_type: 'task',
        entity_id: taskId,
        details: { title: t.title, viewer_email: activeSession.user.email },
      })
      setTaskLoading(false)
    }
    load()
  }, [session, taskId])

  async function signInWithGoogle() {
    setGoogleLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
  }

  // ── Loading ──────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={bgStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--accent)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px' }}>H</span>
          </div>
          <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>Loading…</span>
        </div>
      </div>
    )
  }

  // ── Not authenticated → sign-in gate ─────────────────
  if (!session) {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{ background: 'var(--accent)', borderRadius: '7px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px' }}>H</span>
            </div>
            <div>
              <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px' }}>HOG OPS</div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Shared Task</div>
            </div>
          </div>

          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Sign in to view this task</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
            A team member shared a task with you. Sign in with Google so we know who's viewing it.
          </p>

          <button
            onClick={signInWithGoogle}
            disabled={googleLoading}
            style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '11px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontFamily: 'var(--font-ui)', fontWeight: 500 }}
          >
            <GoogleIcon />
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>
        </div>
      </div>
    )
  }

  // ── Authenticated → show task ─────────────────────────
  if (taskLoading) {
    return (
      <div style={bgStyle}>
        <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>Loading task…</div>
      </div>
    )
  }

  if (notFound || !task) {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Task not found</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>This task may have been deleted or the link is invalid.</p>
        </div>
      </div>
    )
  }

  const pColor = PRIORITY_COLORS[task.priority] ?? '#6B7280'
  const sColor = STATUS_COLORS[task.status] ?? '#6B7280'

  return (
    <div style={bgStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--accent)', borderRadius: '7px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px' }}>H</span>
        </div>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px' }}>HOG OPS</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '2px 8px', fontFamily: 'var(--font-mono)' }}>
          Shared Task
        </span>
      </div>

      {/* Task card */}
      <div style={cardStyle}>
        {/* Priority bar */}
        <div style={{ height: '3px', background: pColor, borderRadius: '2px 2px 0 0', margin: '-20px -20px 16px -20px' }} />

        {/* Title + badges */}
        <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', lineHeight: 1.3 }}>{task.title}</h1>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: sColor, background: `${sColor}15`, border: `1px solid ${sColor}40`, borderRadius: '4px', padding: '2px 8px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sColor, flexShrink: 0 }} />
            {STATUS_LABELS[task.status] ?? task.status}
          </span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '2px 8px' }}>{task.type}</span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: pColor, background: `${pColor}15`, border: `1px solid ${pColor}40`, borderRadius: '4px', padding: '2px 8px' }}>{task.priority}</span>
        </div>

        {/* Description */}
        {task.description && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px', background: 'var(--bg-base)', borderRadius: '8px', padding: '12px' }}>{task.description}</p>
        )}

        {/* Meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: proofs.length ? '20px' : '4px' }}>
          {buName && <MetaCell label="Business Unit" value={buName} />}
          {assigneeName && <MetaCell label="Assigned to" value={assigneeName} />}
          {task.due_date && <MetaCell label="Due date" value={new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} />}
          {task.estimated_hours && <MetaCell label="Est. hours" value={`${task.estimated_hours}h`} />}
          <MetaCell label="Deadline type" value={task.deadline_type} />
          {task.proof_required && <MetaCell label="Proof required" value="Yes" />}
        </div>

        {/* Proofs */}
        {proofs.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', fontFamily: 'var(--font-ui)' }}>
              Proof · {proofs.length} file{proofs.length > 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {proofs.map(p => {
                const isImage = p.file_type.startsWith('image/')
                const isVideo = p.file_type.startsWith('video/')
                const isPDF   = p.file_type === 'application/pdf'
                const isHTML  = p.file_type === 'text/html'
                const ext = isHTML ? 'HTML' : p.file_type.split('/')[1]?.toUpperCase() ?? 'FILE'
                const EXT_COLORS: Record<string, string> = { PDF: '#EF4444', PNG: '#3B82F6', JPG: '#3B82F6', JPEG: '#3B82F6', WEBP: '#3B82F6', MP4: '#A855F7', MOV: '#A855F7', QUICKTIME: '#A855F7', HTML: '#F97316' }
                const extColor = EXT_COLORS[ext] ?? '#888'
                return (
                  <div key={p.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', overflow: 'hidden', background: 'var(--bg-base)' }}>
                    {/* File header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px' }}>
                      <span style={{ background: `${extColor}20`, color: extColor, fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>{ext}</span>
                      <span style={{ flex: 1, fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        {new Date(p.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button onClick={() => setPreviewProof(p)} style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>
                        Full screen
                      </button>
                      <a href={p.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: '5px', padding: '3px 8px' }}>
                        Open ↗
                      </a>
                    </div>

                    {/* Inline preview */}
                    {isImage && (
                      <img src={p.file_url} alt="proof" onClick={() => setPreviewProof(p)}
                        style={{ width: '100%', maxHeight: '320px', objectFit: 'cover', display: 'block', borderTop: '1px solid var(--border-subtle)', cursor: 'zoom-in' }} />
                    )}
                    {isVideo && (
                      <video src={p.file_url} controls style={{ width: '100%', maxHeight: '320px', display: 'block', borderTop: '1px solid var(--border-subtle)' }} />
                    )}
                    {isPDF && (
                      <iframe src={`${p.file_url}#toolbar=0`} title="PDF" style={{ width: '100%', height: '400px', border: 'none', borderTop: '1px solid var(--border-subtle)', display: 'block', background: '#fff' }} />
                    )}
                    {isHTML && (
                      <HtmlFrame url={p.file_url} title="HTML preview" style={{ width: '100%', height: '360px', border: 'none', borderTop: '1px solid var(--border-subtle)', display: 'block', background: '#fff' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        Viewing as {session.user.email}
      </p>

      {/* Fullscreen preview */}
      {previewProof && (
        <div onClick={() => setPreviewProof(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setPreviewProof(null)}
            style={{ position: 'absolute', top: '16px', right: '20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: '13px', zIndex: 10 }}>
            ✕ Close
          </button>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '92vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {previewProof.file_type.startsWith('image/') && (
              <img src={previewProof.file_url} alt="proof" style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }} />
            )}
            {previewProof.file_type.startsWith('video/') && (
              <video src={previewProof.file_url} controls autoPlay style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: '8px' }} />
            )}
            {previewProof.file_type === 'application/pdf' && (
              <iframe src={previewProof.file_url} title="PDF" style={{ width: '88vw', height: '90vh', border: 'none', borderRadius: '8px', background: '#fff' }} />
            )}
            {previewProof.file_type === 'text/html' && (
              <HtmlFrame url={previewProof.file_url} title="HTML" style={{ width: '90vw', height: '90vh', border: 'none', borderRadius: '8px', background: '#fff' }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-ui)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{value}</div>
    </div>
  )
}

const bgStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg-base)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  padding: '20px',
  width: '100%',
  maxWidth: '480px',
}
