import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../hooks/useActivityLog'
import { notifySlack } from '../../hooks/useSlack'
import { APP_VERSION } from '../../config/version'

// ─────────────────────────────────────────────────────────────────────────────
// REPORTAR FALLA / SUGERIR MEJORA — la bandera discreta de cada ventana.
//
// Vive UNA vez en el primitivo Sheet (toda ventana la hereda gratis) y a mano
// en los paneles especiales (tarea, deal). El contexto —"¿en qué ventana te
// pasó?"— se captura solo: si nadie lo pasa como prop, al abrir se toma el
// primer encabezado del panel donde vive la bandera. URL y versión van solas.
//
// No usa showToast a propósito: importarlo desde components/v2 crearía un
// ciclo (v2 → FeedbackButton → v2); el "enviado ✓" vive dentro del modal.
// ─────────────────────────────────────────────────────────────────────────────

export function FeedbackButton({ context, variant = 'float' }: {
  context?: string
  /** float: pin arriba-derecha (a la izquierda de la X). inline: botón de header. */
  variant?: 'float' | 'inline'
}) {
  const [open, setOpen] = useState(false)
  const [ctx, setCtx] = useState(context ?? '')
  const [kind, setKind] = useState<'falla' | 'mejora'>('falla')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [listo, setListo] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function abrir(e: React.MouseEvent) {
    e.stopPropagation()
    // Contexto automático: el primer encabezado de la ventana que me contiene
    let c = context ?? ''
    if (!c) {
      const panel = (e.currentTarget as HTMLElement).closest('[role="dialog"], .hog-sheet-panel')
      const h = panel?.querySelector('h1, h2, h3')
      c = h?.textContent?.trim().slice(0, 120) ?? document.title
    }
    setCtx(c)
    setKind('falla'); setMsg(''); setListo(false); setErr(null)
    setOpen(true)
  }

  async function enviar() {
    if (!msg.trim()) { setErr('Cuéntanos qué pasó — sin texto no hay reporte.'); return }
    setBusy(true); setErr(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('app_feedback').insert({
      user_id: user?.id ?? null, kind, context: ctx || null,
      message: msg.trim(), url: window.location.href, app_version: APP_VERSION,
    })
    setBusy(false)
    if (error) {
      // Sin app_feedback.sql la tabla no existe: el reporte viaja igual por
      // Slack y Actividad — perder el reporte sería peor que perder la tabla
      if (!/does not exist|relation/i.test(error.message)) { setErr(`No se pudo enviar: ${error.message}`); return }
    }
    logActivity('feedback_sent', 'app', crypto.randomUUID(), { kind, context: ctx, message: msg.trim().slice(0, 200) })
    notifySlack(`${kind === 'falla' ? '🐞 *Falla reportada*' : '💡 *Sugerencia*'} — ${ctx || 'HOG APP'} (v${APP_VERSION})\n${msg.trim()}`)
    setListo(true)
    setTimeout(() => setOpen(false), 1600)
  }

  return (
    <>
      <button onClick={abrir} title="Reportar una falla o sugerir una mejora de esta ventana" aria-label="Reportar falla o sugerir mejora"
        style={variant === 'inline'
          // Botón de header: mismo tamaño y trato que compartir/conversación/cerrar
          ? { width: 34, height: 34, border: 'none', borderRadius: 8, background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
          // Flotante ESTÁNDAR: arriba a la derecha, dejando el hueco de la X
          : { position: 'absolute', top: 12, right: 48, zIndex: 5, width: 28, height: 28, border: 'none', borderRadius: '50%', background: 'none', color: 'var(--text-tertiary)', opacity: 0.45, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity .15s' }}
        onMouseEnter={e => { if (variant !== 'inline') e.currentTarget.style.opacity = '1' }}
        onMouseLeave={e => { if (variant !== 'inline') e.currentTarget.style.opacity = '0.45' }}>
        <Flag size={13} />
      </button>

      {open && createPortal(
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'var(--scrim, rgba(0,0,0,0.5))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-sheet, 0 24px 80px rgba(0,0,0,0.5))' }}>
            {listo ? (
              <p style={{ margin: 0, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--status-healthy)', padding: '12px 0' }}>
                Enviado ✓ — gracias, esto mejora la app.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Flag size={14} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Reportar sobre esta ventana</span>
                  <button onClick={() => setOpen(false)} aria-label="Cerrar" style={{ width: 28, height: 28, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={14} /></button>
                </div>
                {ctx && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 12px' }}>Contexto: {ctx}</p>}

                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {([['falla', '🐞 Falla'], ['mejora', '💡 Mejora']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setKind(k)}
                      style={{ flex: 1, minHeight: 38, borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: kind === k ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--border-default)'}`, color: kind === k ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {label}
                    </button>
                  ))}
                </div>

                <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} autoFocus
                  placeholder={kind === 'falla' ? '¿Qué pasó? ¿Qué esperabas que pasara?' : '¿Cómo mejorarías esta herramienta?'}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 90 }} />
                {err && <p style={{ fontSize: 11.5, color: 'var(--status-risk)', margin: '6px 0 0' }}>{err}</p>}

                <button onClick={enviar} disabled={busy}
                  style={{ width: '100%', minHeight: 44, marginTop: 12, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                  {busy ? 'Enviando…' : 'Enviar'}
                </button>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '8px 0 0', textAlign: 'center' }}>
                  Se adjunta solo la versión de la app y en qué pantalla estabas.
                </p>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
