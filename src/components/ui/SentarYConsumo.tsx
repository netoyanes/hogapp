import { useState } from 'react'
import { Armchair, Camera, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Sheet, showToast } from '../v2'
import { logActivity } from '../../hooks/useActivityLog'

// ─────────────────────────────────────────────────────────────────────────────
// SENTAR Y CERRAR MESA — los dos momentos donde el dinero se ancla a la realidad.
//
// Si un PR trajo la mesa, su comisión no sale del pax que se RESERVÓ ni del
// consumo que alguien recuerde: sale de lo que el host capturó al sentar y del
// ticket al cerrar. Por eso estos dos formularios existen y por eso el PR no
// tiene acceso a ninguno de los dos.
//
// Sin PR de por medio siguen sirviendo igual: el pax real alimenta el show rate
// honesto y el consumo alimenta el ticket promedio por venue.
// ─────────────────────────────────────────────────────────────────────────────

/** Sentar: cuánta gente llegó DE VERDAD (rara vez es la que reservó). */
export function SentarSheet({ reservationId, nombre, paxReservado, isMobile, onClose, onDone }: {
  reservationId: string; nombre: string; paxReservado: number
  isMobile: boolean; onClose: () => void; onDone: () => void
}) {
  const [pax, setPax] = useState(paxReservado)
  const [mesa, setMesa] = useState('')
  const [busy, setBusy] = useState(false)

  async function sentar() {
    setBusy(true)
    const { error } = await supabase.from('reservations').update({
      status: 'seated', pax_sentado: pax, mesa_ref: mesa.trim() || null,
    }).eq('id', reservationId)
    setBusy(false)
    if (error) { showToast(`No se pudo sentar: ${error.message}`, 'error'); return }
    logActivity('reservation_status', 'reservation', reservationId, {
      guest: nombre, to: 'Sentada', pax_sentado: pax,
      ...(pax !== paxReservado ? { pax_reservado: paxReservado } : {}),
    })
    showToast(pax === paxReservado ? `${nombre} sentado, ${pax} pax.` : `${nombre} sentado: llegaron ${pax} de ${paxReservado}.`, 'success')
    onDone()
  }

  const dif = pax - paxReservado
  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={380}>
      <div style={{ padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Sentar a {nombre}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          ¿Cuántos llegaron?
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <button onClick={() => setPax(p => Math.max(1, p - 1))}
            style={{ width: 52, height: 52, borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 24, cursor: 'pointer' }}>−</button>
          <div className="num" style={{ flex: 1, textAlign: 'center', fontSize: 34, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{pax}</div>
          <button onClick={() => setPax(p => p + 1)}
            style={{ width: 52, height: 52, borderRadius: 12, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 24, cursor: 'pointer' }}>+</button>
        </div>
        <p style={{ fontSize: 11.5, color: dif === 0 ? 'var(--text-tertiary)' : 'var(--status-attention)', margin: '0 0 14px', textAlign: 'center' }}>
          {dif === 0 ? `Reservaron ${paxReservado}` : dif > 0 ? `Llegaron ${dif} más de los ${paxReservado} reservados` : `Faltaron ${-dif} de los ${paxReservado} reservados`}
        </p>

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Mesa (opcional)</label>
        <input value={mesa} onChange={e => setMesa(e.target.value)} placeholder="12, Terraza 3…"
          style={{ width: '100%', minHeight: 46, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '5px 0 16px' }}>
          Anotarla ayuda a casar el ticket del POS con esta mesa al cerrar.
        </p>

        <button onClick={sentar} disabled={busy}
          style={{ width: '100%', minHeight: 52, borderRadius: 999, border: 'none', background: 'var(--status-healthy)', color: '#04210f', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Armchair size={18} /> {busy ? 'Sentando…' : `Sentar ${pax} pax`}
        </button>
      </div>
    </Sheet>
  )
}

/** Cerrar mesa: el consumo del ticket. Es lo que vuelve real a la comisión. */
export function ConsumoSheet({ reservationId, nombre, paxSentado, tienePR, isMobile, onClose, onDone }: {
  reservationId: string; nombre: string; paxSentado: number; tienePR: boolean
  isMobile: boolean; onClose: () => void; onDone: () => void
}) {
  const [monto, setMonto] = useState('')
  const [pax, setPax] = useState(paxSentado)
  const [subiendo, setSubiendo] = useState(false)
  const [ticket, setTicket] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [comision, setComision] = useState<{ monto: number; tier: string } | null>(null)

  async function subirTicket(file: File) {
    setSubiendo(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `tickets/${reservationId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('proofs').upload(path, file)
    setSubiendo(false)
    if (error) { showToast(`No se pudo subir el ticket: ${error.message}`, 'error'); return }
    const { data } = supabase.storage.from('proofs').getPublicUrl(path)
    setTicket(data.publicUrl)
    showToast('Ticket adjuntado.', 'success')
  }

  async function cerrar() {
    const n = Number(monto.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(n) || n < 0) { showToast('Escribe el consumo de la mesa.', 'error'); return }
    setBusy(true)
    // Una sola llamada: sella el consumo Y dispara el cálculo de comisión, para
    // que no exista un estado intermedio donde el consumo ya entró pero la
    // comisión no — ahí es donde se pierden pagos.
    const { data, error } = await supabase.rpc('fn_pr_cerrar_consumo', {
      p_reservation: reservationId, p_consumo: n, p_pax_sentado: pax, p_ticket_url: ticket,
    })
    setBusy(false)
    if (error) {
      // Sin pr_fase1.sql la función no existe: se guarda el consumo directo
      // para no dejar al host sin poder cerrar la mesa
      if (/does not exist|function/i.test(error.message)) {
        const { error: e2 } = await supabase.from('reservations').update({
          consumo_neto: n, pax_sentado: pax, ticket_url: ticket, status: 'completed',
        }).eq('id', reservationId)
        if (e2) { showToast(`No se pudo cerrar: ${e2.message}`, 'error'); return }
        showToast('Mesa cerrada.', 'success'); onDone(); return
      }
      showToast(`No se pudo cerrar: ${error.message}`, 'error'); return
    }
    const r = data as { ok: boolean; error?: string; comision?: { ok: boolean; monto?: number; tier?: string; error?: string } }
    if (!r?.ok) { showToast(r?.error ?? 'No se pudo cerrar la mesa.', 'error'); return }
    logActivity('reservation_status', 'reservation', reservationId, { guest: nombre, to: 'Completada', consumo: n, pax_sentado: pax })

    if (r.comision?.ok && typeof r.comision.monto === 'number') {
      // Se le muestra al host el monto para que el número no sea un secreto
      // del sistema — pero es "por validar": todavía no es dinero de nadie.
      setComision({ monto: r.comision.monto, tier: r.comision.tier ?? '' })
      return
    }
    showToast('Mesa cerrada.', 'success')
    onDone()
  }

  if (comision) {
    return (
      <Sheet open onClose={onDone} isMobile={isMobile} width={380}>
        <div style={{ padding: 'var(--space-5) var(--space-4)', textAlign: 'center' }}>
          <Check size={34} style={{ color: 'var(--status-healthy)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '10px 0 4px' }}>Mesa cerrada</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            Esta mesa la trajo un PR. Su comisión quedó calculada:
          </p>
          <div className="num" style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            ${comision.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '6px 0 20px', lineHeight: 1.5 }}>
            Todavía no es dinero suyo: queda <strong>por validar</strong> hasta que el gerente la apruebe en la cola de mañana.
          </p>
          <button onClick={onDone}
            style={{ width: '100%', minHeight: 48, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Listo
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={380}>
      <div style={{ padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Cerrar mesa · {nombre}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {tienePR && (
          <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', marginBottom: 12, fontSize: 11.5, color: 'var(--accent)', lineHeight: 1.5 }}>
            Un PR trajo esta mesa: de este consumo sale su comisión. Captura el neto del ticket — sin IVA ni propina.
          </div>
        )}

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Consumo neto</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>$</span>
          <input value={monto} onChange={e => setMonto(e.target.value)} inputMode="decimal" autoFocus placeholder="0.00" className="num"
            style={{ flex: 1, minHeight: 54, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }} />
        </div>

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Personas que consumieron</label>
        <input type="number" inputMode="numeric" min={1} value={pax} onChange={e => setPax(Math.max(1, Number(e.target.value)))} className="num"
          style={{ width: '100%', minHeight: 46, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 15, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }} />

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, marginTop: 12, borderRadius: 999, border: `1px ${ticket ? 'solid' : 'dashed'} ${ticket ? 'var(--status-healthy)' : 'var(--border-default)'}`, color: ticket ? 'var(--status-healthy)' : 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          {ticket ? <><Check size={15} /> Ticket adjuntado</> : <><Camera size={15} /> {subiendo ? 'Subiendo…' : 'Foto del ticket'}</>}
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) subirTicket(f) }} />
        </label>
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '6px 0 16px', lineHeight: 1.5 }}>
          Mientras el POS no esté conectado, la foto es lo que respalda el monto ante cualquier duda.
        </p>

        <button onClick={cerrar} disabled={busy || !monto.trim()}
          style={{ width: '100%', minHeight: 52, borderRadius: 999, border: 'none', background: 'var(--status-healthy)', color: '#04210f', fontSize: 15, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy || !monto.trim() ? 0.5 : 1 }}>
          {busy ? 'Cerrando…' : 'Cerrar mesa'}
        </button>
      </div>
    </Sheet>
  )
}
