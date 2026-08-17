import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL WELLNESS — la cara pública (?wellness=CODIGO)
//
// Para el alumno, sin cuenta de HOG APP: ve el horario de los próximos días,
// se registra UNA vez (nombre + teléfono) y su acceso queda guardado en el
// navegador. Volver a entrar desde otro teléfono = poner su número otra vez.
// Cero contraseñas: la fricción mata la asistencia a una clase de 7:30 am.
//
// Los datos viajan por RPCs security-definer (patrón fn_shared_task): el anon
// key solo puede ver horario/cupo y operar SU cuenta vía token. El pago abre
// el checkout de Blumon en otra pestaña — la tarjeta nunca pasa por aquí.
// ─────────────────────────────────────────────────────────────────────────────

interface SlotDef {
  slot_id: string; weekday: number; start_time: string
  class: string; description: string | null; price: number
  capacity: number; duration_min: number; color: string; instructor: string | null
}
interface Occ { slot_id: string; class_date: string; booked: number }
interface MyBooking {
  booking_id: string; class: string; class_date: string; start_time: string
  instructor: string | null; status: string; paid: boolean; amount: number | null
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const TOKEN_KEY = 'hog_wellness_token'
const mxn = (n: number) => `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function WellnessPortal({ code }: { code: string }) {
  const [slots, setSlots] = useState<SlotDef[]>([])
  const [occ, setOcc] = useState<Occ[]>([])
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [myName, setMyName] = useState('')
  const [mine, setMine] = useState<MyBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  // Registro (se abre al intentar reservar sin acceso)
  const [regOpen, setRegOpen] = useState<{ slot: SlotDef; date: string } | null>(null)
  const [rName, setRName] = useState('')
  const [rPhone, setRPhone] = useState('')
  const [rEmail, setREmail] = useState('')

  const hoy = new Date()
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 13)

  const load = useCallback(async () => {
    const [{ data: sch }, { data: oc }] = await Promise.all([
      supabase.rpc('fn_wellness_schedule', { p_code: code }),
      supabase.rpc('fn_wellness_occupancy', { p_code: code, p_from: iso(hoy), p_to: iso(hasta) }),
    ])
    setSlots((sch ?? []) as SlotDef[])
    setOcc((oc ?? []) as Occ[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])
  useEffect(() => { load() }, [load])

  const loadMine = useCallback(async () => {
    if (!token) { setMine([]); setMyName(''); return }
    const { data } = await supabase.rpc('fn_wellness_me', { p_token: token })
    if (!data) { localStorage.removeItem(TOKEN_KEY); setToken(null); return }
    setMyName(data.name ?? '')
    setMine((data.bookings ?? []) as MyBooking[])
  }, [token])
  useEffect(() => { loadMine() }, [loadMine])

  // Las próximas ocurrencias reales: cada slot semanal × los próximos 14 días
  const proximas = useMemo(() => {
    const out: { slot: SlotDef; date: string; booked: number }[] = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i)
      for (const s of slots.filter(s => s.weekday === d.getDay())) {
        // Hoy: solo si la clase aún no empieza
        if (i === 0) {
          const [h, m] = s.start_time.split(':').map(Number)
          if (d.getHours() * 60 + d.getMinutes() > h * 60 + m - 30) continue
        }
        const o = occ.find(x => x.slot_id === s.slot_id && x.class_date === iso(d))
        out.push({ slot: s, date: iso(d), booked: o?.booked ?? 0 })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, occ])

  const yaReserve = (slotId: string, date: string) =>
    mine.some(b => b.class_date === date && b.status !== 'cancelada'
      && proximas.some(p => p.slot.slot_id === slotId && p.date === date && p.slot.class === b.class && p.slot.start_time === b.start_time))

  async function reservar(slot: SlotDef, date: string) {
    if (!token) { setRegOpen({ slot, date }); return }
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_book', { p_token: token, p_slot: slot.slot_id, p_date: date })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    setMsg({ text: `Listo — tu lugar en ${slot.class} quedó apartado. ${Number(data?.amount) > 0 ? 'Puedes pagarla abajo en "Mis clases".' : ''}` })
    load(); loadMine()
  }

  async function registrar() {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_register', {
      p_name: rName, p_phone: rPhone, p_email: rEmail,
    })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setMsg({ text: data.returning ? `Bienvenido de vuelta, ${data.name}.` : '¡Registro listo! Tu acceso quedó guardado en este navegador.' })
    // Completa la reserva que motivó el registro
    if (regOpen) {
      const { slot, date } = regOpen
      setRegOpen(null)
      const { data: bk } = await supabase.rpc('fn_wellness_book', { p_token: data.token, p_slot: slot.slot_id, p_date: date })
      if (bk?.error) setMsg({ text: bk.error, error: true })
      else setMsg({ text: `Listo — tu lugar en ${slot.class} quedó apartado.` })
      load()
    }
  }

  async function pagar(b: MyBooking) {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('wellness-pay', {
        body: { token, booking_id: b.booking_id },
      })
      if (error || data?.error) { setMsg({ text: data?.error ?? 'No se pudo generar el pago.', error: true }); return }
      window.open(data.pay_url, '_blank', 'noopener')
      setMsg({ text: 'Se abrió la página de pago seguro. Al terminar, tu clase aparecerá como pagada.' })
    } finally { setBusy(false) }
  }

  async function cancelar(b: MyBooking) {
    if (!window.confirm(`¿Cancelar tu lugar en ${b.class} del ${fmtFecha(b.class_date)}?`)) return
    const { data } = await supabase.rpc('fn_wellness_cancel', { p_token: token, p_booking: b.booking_id })
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    setMsg({ text: 'Clase cancelada — tu lugar quedó libre para alguien más.' })
    load(); loadMine()
  }

  const fmtFecha = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return `${DIAS[d.getDay()]} ${d.getDate()} de ${d.toLocaleDateString('es-MX', { month: 'long' })}`
  }
  const esMismoDia = (a: string, b: Date) => a === iso(b)

  // Agrupar por día para leerse como cartelera
  const porDia = useMemo(() => {
    const m = new Map<string, typeof proximas>()
    for (const p of proximas) { const arr = m.get(p.date) ?? []; arr.push(p); m.set(p.date, arr) }
    return [...m.entries()]
  }, [proximas])

  const vigentes = mine.filter(b => b.status !== 'cancelada' && b.class_date >= iso(hoy))
  const inp: React.CSSProperties = {
    width: '100%', minHeight: 48, background: '#fff', border: '1px solid #D8D2C7', borderRadius: 10,
    padding: '0 14px', fontSize: 15, color: '#1A1613', outline: 'none', boxSizing: 'border-box',
  }

  return (
    // Página independiente y SIEMPRE clara: es la cara al cliente, no la app
    <div style={{ minHeight: '100vh', background: '#F6F3EE', color: '#1A1613', fontFamily: "'Geist', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 18px 60px' }}>
        {/* Encabezado */}
        <header style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontSize: 34 }}>🧘</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 2px', letterSpacing: '-0.01em' }}>Wellness</h1>
          <p style={{ fontSize: 13.5, color: 'rgba(26,22,19,0.55)', margin: 0 }}>
            Aparta tu lugar — sin cuentas ni contraseñas.
          </p>
          {myName && (
            <p style={{ fontSize: 13, margin: '10px 0 0', color: '#2E6B45', fontWeight: 700 }}>
              Hola, {myName.split(' ')[0]} 👋
            </p>
          )}
        </header>

        {msg && (
          <div onClick={() => setMsg(null)} style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 16, cursor: 'pointer', background: msg.error ? '#FBEAE7' : '#E8F3EA', border: `1px solid ${msg.error ? '#E2B4AA' : '#B9D9C1'}`, color: msg.error ? '#8C2F1F' : '#25583A', fontSize: 13.5, lineHeight: 1.5 }}>
            {msg.text}
          </div>
        )}

        {/* Cartelera de clases */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'rgba(26,22,19,0.5)' }}>Cargando horarios…</p>
        ) : porDia.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'rgba(26,22,19,0.5)' }}>Sin clases programadas por ahora.</p>
        ) : porDia.map(([date, rows]) => (
          <section key={date} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(26,22,19,0.5)', margin: '0 0 8px' }}>
              {esMismoDia(date, hoy) ? 'Hoy · ' : ''}{fmtFecha(date)}
            </h2>
            {rows.map(({ slot, booked }) => {
              const libres = slot.capacity - booked
              const lleno = libres <= 0
              const reservada = yaReserve(slot.slot_id, date)
              return (
                <div key={slot.slot_id + date} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 8, boxShadow: '0 1px 4px rgba(26,22,19,0.06)', borderLeft: `4px solid ${slot.color}` }}>
                  <div style={{ textAlign: 'center', minWidth: 52 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Geist Mono', monospace" }}>{slot.start_time}</div>
                    <div style={{ fontSize: 10, color: 'rgba(26,22,19,0.45)' }}>{slot.duration_min} min</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{slot.class}</div>
                    <div style={{ fontSize: 12, color: 'rgba(26,22,19,0.55)' }}>
                      {slot.instructor ? `con ${slot.instructor} · ` : ''}{slot.price > 0 ? mxn(slot.price) : 'sin costo'}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 2, fontWeight: 700, color: lleno ? '#8C2F1F' : libres <= 3 ? '#9A6C05' : '#2E6B45' }}>
                      {lleno ? 'Llena' : libres <= 3 ? `Quedan ${libres} lugares` : `${libres} lugares`}
                    </div>
                  </div>
                  <button disabled={lleno || reservada || busy} onClick={() => reservar(slot, date)}
                    style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: 'none', fontSize: 13.5, fontWeight: 800, cursor: lleno || reservada ? 'default' : 'pointer', background: reservada ? '#E8F3EA' : lleno ? '#EDE8DF' : '#1A1613', color: reservada ? '#2E6B45' : lleno ? 'rgba(26,22,19,0.4)' : '#F6F3EE' }}>
                    {reservada ? '✓ Voy' : lleno ? 'Llena' : 'Reservar'}
                  </button>
                </div>
              )
            })}
          </section>
        ))}

        {/* Mis clases */}
        {token && vigentes.length > 0 && (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(26,22,19,0.5)', margin: '0 0 8px' }}>Mis clases</h2>
            {vigentes.map(b => (
              <div key={b.booking_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 14, padding: '12px 16px', marginBottom: 8, boxShadow: '0 1px 4px rgba(26,22,19,0.06)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{b.class} · {b.start_time}</div>
                  <div style={{ fontSize: 12, color: 'rgba(26,22,19,0.55)' }}>{fmtFecha(b.class_date)}</div>
                </div>
                {b.paid ? (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#2E6B45', background: '#E8F3EA', borderRadius: 999, padding: '5px 12px' }}>Pagada ✓</span>
                ) : Number(b.amount) > 0 ? (
                  <button onClick={() => pagar(b)} disabled={busy}
                    style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: '#8F5E0C', color: '#FFF8EC', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                    Pagar {mxn(Number(b.amount))}
                  </button>
                ) : null}
                <button onClick={() => cancelar(b)} disabled={busy}
                  style={{ minHeight: 40, padding: '0 12px', borderRadius: 999, border: '1px solid #D8D2C7', background: 'none', color: 'rgba(26,22,19,0.55)', fontSize: 12, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            ))}
            <p style={{ fontSize: 11, color: 'rgba(26,22,19,0.45)', lineHeight: 1.5 }}>
              Puedes cancelar hasta 3 horas antes de la clase. El pago en línea es procesado por Blumon Pay — tu tarjeta nunca pasa por nuestro sistema. También puedes pagar en el estudio.
            </p>
          </section>
        )}

        {/* Pie con acceso */}
        <footer style={{ marginTop: 34, textAlign: 'center' }}>
          {!token ? (
            <p style={{ fontSize: 12, color: 'rgba(26,22,19,0.45)' }}>
              ¿Ya te habías registrado? Reserva cualquier clase y pon tu mismo teléfono — recuperas tu cuenta sola.
            </p>
          ) : (
            <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setMine([]) }}
              style={{ fontSize: 11.5, color: 'rgba(26,22,19,0.4)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Salir de esta cuenta en este dispositivo
            </button>
          )}
        </footer>
      </div>

      {/* Registro — solo cuando intenta reservar sin acceso */}
      {regOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,19,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 50 }}>
          <div style={{ background: '#F6F3EE', borderRadius: 18, padding: 24, width: '100%', maxWidth: 400 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Un paso y listo</h3>
            <p style={{ fontSize: 13, color: 'rgba(26,22,19,0.55)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Para apartar tu lugar en <strong>{regOpen.slot.class}</strong> ({fmtFecha(regOpen.date)}, {regOpen.slot.start_time}) solo necesitamos saber quién eres. No hay contraseñas.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={rName} onChange={e => setRName(e.target.value)} placeholder="Tu nombre completo" style={inp} autoFocus />
              <input value={rPhone} onChange={e => setRPhone(e.target.value)} placeholder="Tu teléfono (10 dígitos)" type="tel" inputMode="tel" style={inp} />
              <input value={rEmail} onChange={e => setREmail(e.target.value)} placeholder="Tu correo (opcional)" type="email" inputMode="email" style={inp} />
              <button onClick={registrar} disabled={busy}
                style={{ minHeight: 50, borderRadius: 999, border: 'none', background: '#1A1613', color: '#F6F3EE', fontSize: 15, fontWeight: 800, cursor: 'pointer', marginTop: 4 }}>
                {busy ? 'Un momento…' : 'Apartar mi lugar'}
              </button>
              <button onClick={() => setRegOpen(null)} style={{ minHeight: 40, background: 'none', border: 'none', color: 'rgba(26,22,19,0.5)', fontSize: 13, cursor: 'pointer' }}>
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
