import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AppLogoBadge } from '../components/ui/AppLogo'

// Página pública de reservas — accesible sin sesión vía ?reservar=<CÓDIGO>.
// Toda la lógica y validación viven en el Edge Function public-reservation
// (service role); esta página solo pinta el formulario y muestra el resultado.
interface Info {
  venue: string
  supported: boolean
  deposit: { over_pax: number; per_person: number | null; fixed: number | null } | null
}
interface Done {
  venue: string; fecha: string; hora: string; pax: number
  deposito: { total: number } | null
}

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '12px 14px',
  fontSize: 16, outline: 'none', boxSizing: 'border-box', minHeight: 48,
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }

export function PublicReservation({ code }: { code: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [fecha, setFecha] = useState('')
  const [horario, setHorario] = useState('21:00')
  const [pax, setPax] = useState('2')
  const [notas, setNotas] = useState('')
  const [sending, setSending] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)

  useEffect(() => {
    supabase.functions.invoke('public-reservation', { body: { action: 'info', code } })
      .then(({ data, error }) => {
        if (error || data?.error) setLoadErr(data?.error ?? 'No se pudo cargar. Intenta más tarde.')
        else setInfo(data as Info)
        setLoading(false)
      })
  }, [code])

  const hoyISO = new Date().toISOString().slice(0, 10)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormErr(null); setSending(true)
    const { data, error } = await supabase.functions.invoke('public-reservation', {
      body: { action: 'book', code, nombre, telefono, fecha, horario, pax, notas },
    })
    setSending(false)
    if (error || data?.error) { setFormErr(data?.error ?? 'No se pudo enviar. Intenta de nuevo.'); return }
    setDone(data as Done)
  }

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '28px 16px' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, justifyContent: 'center' }}>
          <AppLogoBadge size={30} radius={7} />
        </div>
        {children}
      </div>
    </div>
  )

  if (loading) return shell(<p style={{ color: 'var(--text-tertiary)', textAlign: 'center' }}>Cargando…</p>)
  if (loadErr) return shell(
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>{loadErr}</p>
    </div>
  )

  if (done) return shell(
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
      <h1 style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>¡Solicitud recibida!</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
        Tu lugar en <strong>{done.venue}</strong> quedó solicitado para el{' '}
        {new Date(done.fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}, {done.hora}, {done.pax} {done.pax === 1 ? 'persona' : 'personas'}.
      </p>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 12 }}>El equipo te confirma por WhatsApp en breve.</p>
      {done.deposito && (
        <div style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: 'var(--radius-md)', padding: 14, marginTop: 16, textAlign: 'left' }}>
          <p style={{ color: 'var(--text-primary)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            💳 Para grupos de tu tamaño se pide un apartado de <strong>${done.deposito.total} MXN</strong> para asegurar la mesa. El equipo te comparte los datos de depósito al confirmarte.
          </p>
        </div>
      )}
    </div>
  )

  return shell(
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
      <h1 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Reserva en {info?.venue}</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: '0 0 20px' }}>Déjanos tus datos y te confirmamos por WhatsApp.</p>

      {info && !info.supported ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Este venue no toma reservas por este medio. Escríbenos por WhatsApp o Instagram y con gusto te atendemos.
        </p>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><span style={lbl}>Tu nombre</span>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo" style={inp} required /></div>
          <div><span style={lbl}>WhatsApp</span>
            <input value={telefono} onChange={e => setTelefono(e.target.value)} inputMode="tel" placeholder="10 dígitos" style={inp} required /></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}><span style={lbl}>Fecha</span>
              <input type="date" value={fecha} min={hoyISO} onChange={e => setFecha(e.target.value)} style={inp} required /></div>
            <div style={{ flex: 1 }}><span style={lbl}>Hora de llegada</span>
              <input type="time" value={horario} onChange={e => setHorario(e.target.value)} style={inp} required /></div>
          </div>
          <div><span style={lbl}>Personas</span>
            <input type="number" min={1} max={40} value={pax} onChange={e => setPax(e.target.value)} style={inp} required /></div>
          <div><span style={lbl}>Nota (opcional)</span>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Cumpleaños, terraza, silla de bebé…" style={{ ...inp, minHeight: 60, resize: 'vertical' }} /></div>

          {info?.deposit && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
              ℹ️ Grupos de {info.deposit.over_pax} o más requieren un apartado
              {info.deposit.per_person ? ` de $${info.deposit.per_person} por persona` : info.deposit.fixed ? ` de $${info.deposit.fixed}` : ''}.
              El equipo te comparte los datos al confirmarte.
            </p>
          )}
          {formErr && <p style={{ color: 'var(--status-risk)', fontSize: 13, margin: 0 }}>{formErr}</p>}
          <button type="submit" disabled={sending}
            style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 999, padding: 14, fontSize: 16, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', minHeight: 50 }}>
            {sending ? 'Enviando…' : 'Solicitar reserva'}
          </button>
        </form>
      )}
    </div>
  )
}
