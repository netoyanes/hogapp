import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { HtmlFrame } from '../components/ui/HtmlFrame'
import { AppLogoBadge } from '../components/ui/AppLogo'
import type { TaskArea } from '../types'
import { TASK_AREA_LABELS } from '../lib/taskAreas'

// ─────────────────────────────────────────────────────────────────────────────
// TAREA COMPARTIDA — vista PÚBLICA (?share=<id>): cualquiera con el link ve
// todo el contenido, con o sin sesión. Los datos llegan por fn_shared_task
// (security definer, ejecutable por anon): tarea + venue + asignado +
// evidencias + links. Las tareas privadas nunca se exponen y el chat interno
// no viaja — la vista queda registrada en Actividad ("anónimo" si no hay
// sesión).
// ─────────────────────────────────────────────────────────────────────────────

interface SharedData {
  task: {
    id: string; title: string; description: string | null; area: TaskArea | null
    status: string; priority: string; due_date: string | null
    estimated_hours: number | null; deadline_type: string; proof_required: boolean
  }
  bu: { code: string; name: string } | null
  assignee: string | null
  proofs: { id: string; file_url: string; file_type: string; created_at: string }[]
  links: { id: string; url: string; title: string | null }[]
}

const PRIORITY_COLORS: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#EAB308', LOW: '#22C55E' }
const STATUS_COLORS: Record<string, string> = {
  OPEN: '#6B7280', IN_PROGRESS: '#3B82F6', PROOF_SUBMITTED: '#F59E0B',
  APPROVED: '#22C55E', REVISION: '#EF4444',
}
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Abierta', IN_PROGRESS: 'En progreso', PROOF_SUBMITTED: 'Evidencia enviada',
  APPROVED: 'Aprobada', REVISION: 'En revisión',
}
const PRIORITY_LABELS: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' }

interface Props {
  taskId: string
}

export function SharedTask({ taskId }: Props) {
  const [data, setData] = useState<SharedData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'private'>('loading')
  const [previewProof, setPreviewProof] = useState<SharedData['proofs'][number] | null>(null)

  useEffect(() => {
    supabase.rpc('fn_shared_task', { p_task: taskId }).then(({ data: d, error }) => {
      if (error || !d) { setState('notfound'); return }
      if (d.private) { setState('private'); return }
      setData(d as SharedData)
      setState('ok')
    })
  }, [taskId])

  if (state === 'loading') {
    return (
      <div style={bgStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <AppLogoBadge size={32} radius={8} />
          <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>Cargando…</span>
        </div>
      </div>
    )
  }

  if (state === 'private') {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Esta tarea es privada</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Quien la compartió debe ponerla como pública (candado de la tarea) para poder verla por link.</p>
        </div>
      </div>
    )
  }

  if (state === 'notfound' || !data) {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Tarea no encontrada</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Puede que la tarea ya no exista o el link sea inválido.</p>
        </div>
      </div>
    )
  }

  const { task, bu, assignee, proofs, links } = data
  const pColor = PRIORITY_COLORS[task.priority] ?? '#6B7280'
  const sColor = STATUS_COLORS[task.status] ?? '#6B7280'

  return (
    <div style={bgStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', width: '100%', maxWidth: '480px' }}>
        <AppLogoBadge size={30} radius={7} />
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px' }}>HOG APP</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '2px 8px', fontFamily: 'var(--font-mono)' }}>
          Tarea compartida
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
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '2px 8px' }}>{task.area ? TASK_AREA_LABELS[task.area] : '—'}</span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: pColor, background: `${pColor}15`, border: `1px solid ${pColor}40`, borderRadius: '4px', padding: '2px 8px' }}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
        </div>

        {/* Description */}
        {task.description && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px', background: 'var(--bg-base)', borderRadius: '8px', padding: '12px', whiteSpace: 'pre-wrap' }}>{task.description}</p>
        )}

        {/* Meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: proofs.length || links.length ? '20px' : '4px' }}>
          {bu && <MetaCell label="Venue" value={`${bu.code} · ${bu.name}`} />}
          {assignee && <MetaCell label="Asignada a" value={assignee} />}
          {task.due_date && <MetaCell label="Fecha límite" value={new Date(task.due_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} />}
          {task.estimated_hours != null && <MetaCell label="Horas estimadas" value={`${task.estimated_hours} h`} />}
          {task.proof_required && <MetaCell label="Requiere evidencia" value="Sí" />}
        </div>

        {/* Links */}
        {links.length > 0 && (
          <div style={{ marginBottom: proofs.length ? '20px' : '4px' }}>
            <div style={sectionTitle}>Links · {links.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {links.map(l => {
                let host = ''
                try { host = new URL(l.url).hostname.replace(/^www\./, '') } catch { host = l.url }
                return (
                  <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '9px 12px', background: 'var(--bg-base)', textDecoration: 'none' }}>
                    <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title || host}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{host} ↗</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {/* Evidencias */}
        {proofs.length > 0 && (
          <div>
            <div style={sectionTitle}>Evidencias · {proofs.length}</div>
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
                        {new Date(p.created_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button onClick={() => setPreviewProof(p)} style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>
                        Pantalla completa
                      </button>
                      <a href={p.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: '5px', padding: '3px 8px' }}>
                        Abrir ↗
                      </a>
                    </div>

                    {/* Inline preview */}
                    {isImage && (
                      <img src={p.file_url} alt="evidencia" onClick={() => setPreviewProof(p)}
                        style={{ width: '100%', maxHeight: '320px', objectFit: 'cover', display: 'block', borderTop: '1px solid var(--border-subtle)', cursor: 'zoom-in' }} />
                    )}
                    {isVideo && (
                      <video src={p.file_url} controls style={{ width: '100%', maxHeight: '320px', display: 'block', borderTop: '1px solid var(--border-subtle)' }} />
                    )}
                    {isPDF && (
                      <iframe src={`${p.file_url}#toolbar=0`} title="PDF" style={{ width: '100%', height: '400px', border: 'none', borderTop: '1px solid var(--border-subtle)', display: 'block', background: '#fff' }} />
                    )}
                    {isHTML && (
                      <HtmlFrame url={p.file_url} title="Vista HTML" style={{ width: '100%', height: '360px', border: 'none', borderTop: '1px solid var(--border-subtle)', display: 'block', background: '#fff' }} />
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
        Vista pública de solo lectura · HOG APP
      </p>

      {/* Fullscreen preview */}
      {previewProof && (
        <div onClick={() => setPreviewProof(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setPreviewProof(null)}
            style={{ position: 'absolute', top: '16px', right: '20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: '13px', zIndex: 10 }}>
            ✕ Cerrar
          </button>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '92vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {previewProof.file_type.startsWith('image/') && (
              <img src={previewProof.file_url} alt="evidencia" style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }} />
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

const sectionTitle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: '10px', fontFamily: 'var(--font-ui)',
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
