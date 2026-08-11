import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AppLogoBadge } from '../components/ui/AppLogo'

// ─────────────────────────────────────────────────────────────────────────────
// MI RESERVA — página pública (?mireserva=<token>) que llega en el WhatsApp de
// confirmación. El cliente ve su reserva y puede:
//  · avisar que llega un poco tarde (10/20/30 min) → nota + alerta al equipo
//  · cancelar por un imprevisto → status cancelled + alerta al equipo
// Todo pasa por la edge function public-reservation (acciones manage_*).
// ─────────────────────────────────────────────────────────────────────────────

interface ResInfo {
  venue: string; codigo: string; nombre: string
  fecha: string; hora: string; pax: number
  status: 'requested' | 'confirmed' | 'seated' | 'completed' | 'no_show' | 'cancelled'
}

const STATUS_LABEL: Record<ResInfo['status'], string> = {
  requested: 'Solicitada', confirmed: 'Confirmada ✅', seated: 'En curso',
  completed: 'Completada', no_show: 'No asistió', cancelled: 'Cancelada',
}

export function GuestReservation({ token }: { token: string }) {
  const [info, setInfo] = useState<ResInfo | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [cancelMode, setCancelMode] = useState(false)
  const [motivo, setMotivo] = useState('')

  async function call(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('public-reservation', { body: { ...body, token } })
    if (!error) return data?.error ? { errMsg: String(data.error) } : { data }
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) { const j = await ctx.json(); if (j?.error) return { errMsg: String(j.error) } }
    } catch { /* genérico */ }
    return { errMsg: 'No se pudo conectar. Intenta de nuevo.' }
  }

  useEffect(() => {
    call({ action: 'manage_info' }).then(r => {
      if (r.errMsg) setErr(r.errMsg)
      else setInfo(r.data as unknown as ResInfo)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function avisarTarde(mins: number) {
    setBusy(true)
    const r = await call({ action: 'manage_late', minutos: mins })
    setBusy(false)
    if (r.errMsg) { setErr(r.errMsg); return }
    setOkMsg(`Avisado 🙌 — el equipo sabe que llegas ~${mins} minutos tarde. Tu mesa te espera.`)
  }

  async function cancelar() {
    if (!window.confirm('¿Seguro que quieres cancelar tu reserva?')) return
    setBusy(true)
    const r = await call({ action: 'manage_cancel', motivo })
    setBusy(false)
    if (r.errMsg) { setErr(r.errMsg); return }
    setInfo(prev => prev ? { ...prev, status: 'cancelled' } : prev)
    setCancelMode(false)
    setOkMsg('Tu reserva quedó cancelada. Gracias por avisarnos — ¡te esperamos pronto! 💙')
  }

  const activa = info && ['requested', 'confirmed'].includes(info.status)
  const btn = (solid: boolean): React.CSSProperties => ({
    minHeight: 48, padding: '0 18px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 700,
    border: solid ? 'none' : '1px solid var(--border-default)',
    background: solid ? 'var(--accent)' : 'transparent',
    color: solid ? 'var(--on-accent)' : 'var(--text-secondary)',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '28px 16px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <AppLogoBadge size={30} radius={7} />
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-tertiary)', textAlign: 'center' }}>Cargando tu reserva…</p>
        ) : err && !info ? (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>{err}</p>
          </div>
        ) : info && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', margin: '0 0 6px' }}>Tu reserva</p>
            <h1 style={{ color: 'var(--text-primary)', fontSize: 21, fontWeight: 800, margin: '0 0 2px' }}>{info.venue}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: '0 0 14px' }}>
              {new Date(info.fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} · <strong>{info.hora}</strong> · {info.pax} {info.pax === 1 ? 'persona' : 'personas'}
              <br /><span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>A nombre de {info.nombre} · {STATUS_LABEL[info.status]}</span>
            </p>

            {okMsg ? (
              <div style={{ background: 'color-mix(in srgb, var(--status-healthy) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--status-healthy) 35%, transparent)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                <p style={{ color: 'var(--text-primary)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>{okMsg}</p>
              </div>
            ) : !activa ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>
                {info.status === 'cancelled' ? 'Esta reserva está cancelada. Si quieres volver a reservar, escríbenos por WhatsApp.' : 'Esta reserva ya no admite cambios por aquí — cualquier cosa, escríbenos por WhatsApp.'}
              </p>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <p style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>🕐 ¿Llegas un poco tarde? Avísanos y te guardamos la mesa:</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[10, 20, 30].map(m => (
                      <button key={m} onClick={() => avisarTarde(m)} disabled={busy} style={{ ...btn(false), flex: 1 }}>
                        ~{m} min
                      </button>
                    ))}
                  </div>
                </div>

                {!cancelMode ? (
                  <button onClick={() => setCancelMode(true)} disabled={busy}
                    style={{ ...btn(false), width: '100%', color: 'var(--status-risk)', borderColor: 'color-mix(in srgb, var(--status-risk) 45%, transparent)' }}>
                    Tengo un imprevisto — cancelar reserva
                  </button>
                ) : (
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 8px' }}>Cuéntanos brevemente (opcional) y confirmamos la cancelación:</p>
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (opcional)"
                      style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', padding: '10px 12px', fontSize: 14, outline: 'none', minHeight: 44, marginBottom: 10 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={cancelar} disabled={busy}
                        style={{ ...btn(true), flex: 1, background: 'var(--status-risk)', color: '#fff' }}>
                        {busy ? 'Cancelando…' : 'Sí, cancelar'}
                      </button>
                      <button onClick={() => setCancelMode(false)} disabled={busy} style={{ ...btn(false), flex: 1 }}>
                        Mejor no
                      </button>
                    </div>
                  </div>
                )}
                {err && <p style={{ color: 'var(--status-risk)', fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
