import { useEffect, useState } from 'react'
import { Globe, Lock, MessageCircle, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { HtmlFrame } from '../components/ui/HtmlFrame'
import { AppLogoBadge } from '../components/ui/AppLogo'
import type { Session } from '@supabase/supabase-js'
import type { TaskArea } from '../types'
import { TASK_AREA_LABELS } from '../lib/taskAreas'

// ─────────────────────────────────────────────────────────────────────────────
// TAREA COMPARTIDA — vista PÚBLICA (?share=<id>) para quien NO tiene HOG APP.
// Se ve completa y sin login, pero el diseño deja claro en todo momento que
// es una vista abierta y de solo lectura: banner arriba, sello en el header,
// la conversación del equipo bajo candado y el cierre invitando a entrar.
// Datos vía fn_shared_task (security definer, ejecutable por anon).
// Las tareas privadas nunca se exponen.
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
  comment_count: number
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

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
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
  const [data, setData] = useState<SharedData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'private'>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [previewProof, setPreviewProof] = useState<SharedData['proofs'][number] | null>(null)

  // La sesión solo cambia el CIERRE (login vs "abrir en HOG APP"): el
  // contenido se carga igual para todos, sin esperar al auth.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    supabase.rpc('fn_shared_task', { p_task: taskId }).then(({ data: d, error }) => {
      if (error || !d) { setState('notfound'); return }
      if (d.private) { setState('private'); return }
      setData(d as SharedData)
      setState('ok')
    })
  }, [taskId])

  async function signInWithGoogle() {
    setSigningIn(true)
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
  }

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
          <Lock size={20} style={{ color: 'var(--text-tertiary)', marginBottom: 10 }} />
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Esta tarea es privada</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Quien la compartió debe marcarla como pública en HOG APP para que se pueda ver por link.
          </p>
        </div>
      </div>
    )
  }

  if (state === 'notfound' || !data) {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Tarea no encontrada</p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Puede que la tarea ya no exista o que el link sea inválido.</p>
        </div>
      </div>
    )
  }

  const { task, bu, assignee, proofs, links, comment_count } = data
  const pColor = PRIORITY_COLORS[task.priority] ?? '#6B7280'
  const sColor = STATUS_COLORS[task.status] ?? '#6B7280'

  return (
    <div style={bgStyle}>
      <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Header con sello de vista pública */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AppLogoBadge size={30} radius={7} />
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px' }}>HOG APP</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '11px', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '999px', padding: '3px 10px', fontFamily: 'var(--font-mono)' }}>
            <Globe size={11} /> VISTA PÚBLICA
          </span>
        </div>

        {/* Banner: qué es esto y qué falta — solo para quien no trae sesión */}
        {!session && (
          <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '12px', padding: '14px 16px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Estás viendo una tarea compartida desde HOG APP
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
              Esta vista es pública y de solo lectura. Para comentar, dar feedback o ver el resto
              del proyecto necesitas iniciar sesión.
            </p>
            <button onClick={signInWithGoogle} disabled={signingIn}
              style={{ marginTop: 12, width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', cursor: signingIn ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', fontFamily: 'var(--font-ui)' }}>
              <GoogleIcon /> {signingIn ? 'Redirigiendo…' : 'Iniciar sesión en HOG APP'}
            </button>
          </div>
        )}

        {/* Tarjeta de la tarea */}
        <div style={cardStyle}>
          <div style={{ height: '3px', background: pColor, borderRadius: '2px 2px 0 0', margin: '-20px -20px 16px -20px' }} />

          <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px', lineHeight: 1.3 }}>{task.title}</h1>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: sColor, background: `${sColor}15`, border: `1px solid ${sColor}40`, borderRadius: '4px', padding: '2px 8px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sColor, flexShrink: 0 }} />
              {STATUS_LABELS[task.status] ?? task.status}
            </span>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '2px 8px' }}>{task.area ? TASK_AREA_LABELS[task.area] : '—'}</span>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: pColor, background: `${pColor}15`, border: `1px solid ${pColor}40`, borderRadius: '4px', padding: '2px 8px' }}>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
          </div>

          {task.description && (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px', background: 'var(--bg-base)', borderRadius: '8px', padding: '12px', whiteSpace: 'pre-wrap' }}>{task.description}</p>
          )}

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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px' }}>
                        <span style={{ background: `${extColor}20`, color: extColor, fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>{ext}</span>
                        <span style={{ flex: 1, fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {new Date(p.created_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button onClick={() => setPreviewProof(p)} style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>
                          Ampliar
                        </button>
                        <a href={p.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--text-secondary)', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: '5px', padding: '3px 8px' }}>
                          Abrir ↗
                        </a>
                      </div>
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

        {/* Conversación del equipo: bajo candado — hace tangible lo que falta */}
        <div style={{ ...cardStyle, position: 'relative', overflow: 'hidden', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <MessageCircle size={13} style={{ color: 'var(--text-tertiary)' }} />
            <span style={sectionTitleInline}>Conversación del equipo</span>
            {comment_count > 0 && (
              <span className="num" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '1px 6px' }}>
                {comment_count} {comment_count === 1 ? 'mensaje' : 'mensajes'}
              </span>
            )}
            <Lock size={12} style={{ color: 'var(--text-tertiary)', marginLeft: 'auto' }} />
          </div>
          {/* Placeholder difuminado: se intuye que hay conversación, no se lee */}
          <div aria-hidden style={{ filter: 'blur(4px)', opacity: 0.5, userSelect: 'none', pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
            {[86, 62, 74].map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--bg-elevated)', flexShrink: 0 }} />
                <span style={{ height: 9, width: `${w}%`, borderRadius: 4, background: 'var(--bg-elevated)' }} />
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            {session
              ? 'Abre la tarea en HOG APP para leer y responder la conversación.'
              : 'Los comentarios del equipo son privados. Inicia sesión para leerlos y participar.'}
          </p>
        </div>

        {/* Cierre: el camino a HOG APP */}
        <div style={{ ...cardStyle, textAlign: 'center', padding: '18px 20px' }}>
          {session ? (
            <>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Ya tienes sesión iniciada</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>Abre la tarea en HOG APP para comentar, subir evidencia y ver todo el proyecto.</p>
              <a href={`${window.location.origin}/`}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, padding: '0 20px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
                Abrir en HOG APP <ArrowRight size={14} />
              </a>
            </>
          ) : (
            <>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>¿Quieres comentar o dar feedback?</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Inicia sesión en HOG APP para participar en esta tarea y ver el resto del proyecto.
              </p>
              <button onClick={signInWithGoogle} disabled={signingIn}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 44, padding: '0 20px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: '13px', fontWeight: 700, border: 'none', cursor: signingIn ? 'wait' : 'pointer' }}>
                {signingIn ? 'Redirigiendo…' : 'Iniciar sesión'} <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', fontFamily: 'var(--font-mono)', margin: 0 }}>
          {session ? `Sesión: ${session.user.email}` : 'Vista pública de solo lectura · HOG APP'}
        </p>
      </div>

      {/* Pantalla completa de evidencia */}
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
const sectionTitleInline: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase',
  letterSpacing: '0.05em', fontFamily: 'var(--font-ui)',
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
  maxWidth: '520px',
}
