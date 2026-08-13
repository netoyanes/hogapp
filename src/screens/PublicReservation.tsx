import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AppLogoBadge } from '../components/ui/AppLogo'

// Página pública de reservas — accesible sin sesión vía ?reservar=<CÓDIGO>.
// Toda la lógica y validación viven en el Edge Function public-reservation
// (service role); esta página solo pinta el formulario y muestra el resultado.
interface Info {
  venue: string
  supported: boolean
  engine?: 'night' | 'tables'
  online_max_pax?: number | null
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
  // EL OYSTER CLUB tiene identidad propia (la misma del menú en /menu/oc.html):
  // fondo azul cielo, tinta, Oswald/Cutive Mono/Inter. El resto de venues
  // conserva el tema oscuro de la app.
  const isOC = code.toUpperCase() === 'OC'
  useEffect(() => {
    if (!isOC) return
    document.title = 'EL OYSTER CLUB · Reservas'
    const meta = document.querySelector('meta[name="theme-color"]') ?? (() => {
      const m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); document.head.appendChild(m); return m
    })()
    meta.setAttribute('content', '#8bb8e6')
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Cutive+Mono&family=Inter:wght@400;600;700&display=swap'
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [isOC])

  const [info, setInfo] = useState<Info | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  // Prellenada con HOY (hora local): en iPhone un date input vacío se ve roto
  // y sin fecha no se cargan los horarios disponibles
  const [fecha, setFecha] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [horario, setHorario] = useState('21:00')
  const [pax, setPax] = useState('2')
  const [notas, setNotas] = useState('')
  const [sending, setSending] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  // Horarios con lugar para la fecha y grupo (motor de mesas O aforo
  // simultáneo). 'free' = venue sin aforo/horario → hora libre.
  const [slots, setSlots] = useState<string[] | null>(null)
  const [slotsMode, setSlotsMode] = useState<'free' | 'slots'>('free')
  const [slotsLoading, setSlotsLoading] = useState(false)

  const tableEngine = info?.engine === 'tables'
  const usePicker = slotsMode === 'slots'

  // El Edge Function responde con status != 2xx cuando rechaza (cupo lleno,
  // datos inválidos) — supabase-js lo entrega como FunctionsHttpError y el
  // JSON con el motivo real viene en error.context. Sin esto, todo rechazo
  // se veía como el genérico "No se pudo enviar".
  async function invokePublic(body: Record<string, unknown>): Promise<{ data?: Record<string, unknown>; errMsg?: string }> {
    const { data, error } = await supabase.functions.invoke('public-reservation', { body })
    if (!error) return data?.error ? { errMsg: String(data.error) } : { data }
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) {
        const j = await ctx.json()
        if (j?.error) return { errMsg: String(j.error) }
      }
    } catch { /* sin cuerpo legible — cae al genérico */ }
    return { errMsg: 'No se pudo enviar. Intenta de nuevo.' }
  }
  useEffect(() => {
    if (!fecha || !(parseInt(pax, 10) > 0) || !info?.supported) { setSlots(null); setSlotsMode('free'); return }
    setSlotsLoading(true)
    const t = setTimeout(() => {
      supabase.functions.invoke('public-reservation', { body: { action: 'slots', code, fecha, pax } })
        .then(({ data, error }) => {
          // Function viejo sin 'slots' o modo libre → hora libre (degrada bien)
          if (error || !data || data.mode === 'free') { setSlots(null); setSlotsMode('free'); setSlotsLoading(false); return }
          const list = (data.slots ?? []) as string[]
          setSlotsMode('slots')
          setSlots(list)
          setSlotsLoading(false)
          setHorario(h => list.includes(h) ? h : (list[0] ?? ''))
        })
    }, 250)
    return () => clearTimeout(t)
  }, [code, fecha, pax, info?.supported])

  useEffect(() => {
    supabase.functions.invoke('public-reservation', { body: { action: 'info', code } })
      .then(({ data, error }) => {
        if (error || data?.error) setLoadErr(data?.error ?? 'No se pudo cargar. Intenta más tarde.')
        else setInfo(data as Info)
        setLoading(false)
      })
  }, [code])

  // Fecha local (no UTC: en Mazatlán toISOString brinca a "mañana" desde las ~5pm)
  const hoyISO = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (usePicker && (!horario || !(slots ?? []).includes(horario))) {
      setFormErr('Elige uno de los horarios disponibles.'); return
    }
    setFormErr(null); setSending(true)
    const { data, errMsg } = await invokePublic({ action: 'book', code, nombre, telefono, fecha, horario, pax, notas })
    setSending(false)
    if (errMsg) { setFormErr(errMsg); return }
    setDone(data as unknown as Done)
  }

  // Tema Oyster: se re-pintan las variables que ya usa el formulario, así toda
  // la página (inputs, chips de horario, botones) adopta la identidad del menú
  const ocVars = {
    '--bg-base': '#8bb8e6', '--bg-surface': 'rgba(255,255,255,0.42)', '--bg-elevated': '#ffffff',
    '--border-default': '#231f20', '--border-subtle': 'rgba(35,31,32,0.35)',
    '--text-primary': '#231f20', '--text-secondary': '#3d3a3b', '--text-tertiary': '#3d3a3b',
    '--accent': '#231f20', '--on-accent': '#8bb8e6', '--accent-bg': 'rgba(35,31,32,0.08)',
    '--status-risk': '#8a1f1f', '--status-attention': '#7a4b00',
    '--radius-md': '10px', '--radius-lg': '14px',
  } as React.CSSProperties
  const ocMono: React.CSSProperties = { fontFamily: '"Cutive Mono","Courier New",monospace', textTransform: 'uppercase', letterSpacing: '0.18em' }
  const menuBtn = (solid: boolean): React.CSSProperties => ({
    display: 'inline-block', textDecoration: 'none', textAlign: 'center', cursor: 'pointer',
    fontFamily: '"Oswald","Arial Narrow",sans-serif', textTransform: 'uppercase', letterSpacing: '0.14em',
    fontSize: 14, fontWeight: 600, padding: '13px 26px', borderRadius: 999, border: '2px solid #231f20',
    background: solid ? '#231f20' : 'transparent', color: solid ? '#8bb8e6' : '#231f20',
  })

  const shell = (children: React.ReactNode) => isOC ? (
    <div style={{ minHeight: '100vh', background: '#8bb8e6', color: '#231f20', padding: 'calc(34px + env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom))', fontFamily: '"Inter",-apple-system,sans-serif', ...ocVars }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* Portada — misma cabecera que la carta */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <img src="/menu/oc-logo.svg" alt="EL OYSTER CLUB" style={{ width: 'min(300px, 82%)', display: 'block', margin: '0 auto 10px' }} />
          <p style={{ ...ocMono, fontSize: 13, margin: '0 0 4px' }}>Marisquería de tres costas</p>
          <p style={{ ...ocMono, fontSize: 10, letterSpacing: '0.14em', margin: 0, opacity: 0.85 }}>Atlántico europeo · Mar de Cortés · Pacífico californiano</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <a href="#reservar" style={menuBtn(true)}>Reservar mesa</a>
            <a href="/menu/oc.html" style={menuBtn(false)}>Ver el menú</a>
          </div>
        </div>
        <div id="reservar" style={{ border: '2px solid #231f20', borderRadius: 16, overflow: 'hidden' }}>
          {children}
        </div>
        <p style={{ ...ocMono, fontSize: 9.5, textAlign: 'center', marginTop: 18, opacity: 0.8 }}>
          EL OYSTER CLUB · <a href="/menu/oc.html" style={{ color: '#231f20' }}>Menú en línea</a>
        </p>
      </div>
    </div>
  ) : (
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
      {isOC && (
        <a href="/menu/oc.html" style={{ ...menuBtn(true), marginTop: 20 }}>Ver el menú mientras tanto</a>
      )}
    </div>
  )

  return shell(
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
      <h1 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 800, margin: '0 0 4px', ...(isOC ? { fontFamily: '"Oswald","Arial Narrow",sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 } : {}) }}>
        {isOC ? 'Reservar mesa' : `Reserva en ${info?.venue}`}
      </h1>
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
            {!usePicker && (
              <div style={{ flex: 1 }}><span style={lbl}>Hora de llegada</span>
                <input type="time" value={horario} onChange={e => setHorario(e.target.value)} style={inp} required /></div>
            )}
          </div>
          <div><span style={lbl}>Personas</span>
            <input type="number" min={1} max={tableEngine ? (info?.online_max_pax ?? 40) : 40} value={pax} onChange={e => setPax(e.target.value)} style={inp} required />
            {tableEngine && info?.online_max_pax && parseInt(pax, 10) > info.online_max_pax && (
              <p style={{ color: 'var(--status-attention)', fontSize: 12, margin: '6px 0 0' }}>
                Para grupos de más de {info.online_max_pax} escríbenos por WhatsApp y el equipo te arma la mesa.
              </p>
            )}
          </div>
          {(usePicker || slotsLoading) && (
            <div><span style={lbl}>Hora de llegada — horarios con lugar</span>
              {!fecha ? (
                <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>Elige primero la fecha.</p>
              ) : slotsLoading ? (
                <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>Buscando horarios…</p>
              ) : (slots ?? []).length === 0 ? (
                <p style={{ color: 'var(--status-attention)', fontSize: 13, margin: 0 }}>No hay horarios disponibles esa fecha para {pax} personas. Prueba otra fecha 🙏</p>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(slots ?? []).map(s => (
                    <button type="button" key={s} onClick={() => setHorario(s)}
                      style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: 15, fontWeight: 700, background: horario === s ? 'var(--accent)' : 'var(--bg-elevated)', border: `1px solid ${horario === s ? 'var(--accent)' : 'var(--border-default)'}`, color: horario === s ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
