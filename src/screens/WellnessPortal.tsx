import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PodWellnessLogo, PodIcon } from '../components/ui/PodWellnessLogo'
import { CREAM, OBSIDIAN, ESPACIO, WELLNESS_GRADIENT, POPPINS, PLEX } from '../lib/podBrand'

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
  // Precio vigente y promoción de apertura (wellness_config, vía RPC público)
  const [info, setInfo] = useState<{ venue?: string; precio_regular?: number | null; descuento?: number | null; precio_vigente?: number | null; promocion?: boolean } | null>(null)

  const hoy = new Date()
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 13)

  const load = useCallback(async () => {
    const [{ data: sch }, { data: oc }] = await Promise.all([
      supabase.rpc('fn_wellness_schedule', { p_code: code }),
      supabase.rpc('fn_wellness_occupancy', { p_code: code, p_from: iso(hoy), p_to: iso(hasta) }),
    ])
    setSlots((sch ?? []) as SlotDef[])
    setOcc((oc ?? []) as Occ[])
    // Sin wellness_portal_identidad.sql el RPC no existe: el portal cae al
    // precio de cada clase, que es como funcionaba antes.
    supabase.rpc('fn_wellness_info', { p_code: code }).then(({ data }) => setInfo(data ?? null))
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
      // Cuando la función responde 4xx/5xx, invoke() NO entrega el cuerpo en
      // data: el JSON real ("Blumon auth falló…", "checkout rechazado…") viene
      // dentro de error.context. Sin leerlo, todo error se veía como un
      // genérico "no se pudo" — indiagnosticable desde el teléfono del alumno.
      let payload = data as { pay_url?: string; error?: string } | null
      if (error && !payload) {
        try { payload = await (error as { context?: Response }).context?.json() ?? null } catch { payload = null }
      }
      if (!payload?.pay_url) {
        setMsg({
          text: payload?.error
            ?? 'El pago en línea no está disponible ahorita — puedes pagar en el estudio. (Si esto persiste, avísanos.)',
          error: true,
        })
        return
      }
      window.open(payload.pay_url, '_blank', 'noopener')
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

  // El precio que ve el alumno: el vigente de la casa manda sobre el de la
  // clase, para que una promoción se anuncie en un solo lugar.
  const precioDe = (p: number) => info?.precio_vigente != null && info.precio_vigente > 0 ? Number(info.precio_vigente) : p
  const hayPromo = !!info?.promocion && Number(info?.descuento) > 0

  // ── Identidad POD (manual de marca): 70% cream · 20% obsidian · 10% verde ──
  const inpPod: React.CSSProperties = {
    width: '100%', minHeight: 50, background: CREAM[300], border: `1px solid ${CREAM[600]}`,
    borderRadius: 12, padding: '0 14px', fontSize: 15, color: OBSIDIAN[500], outline: 'none',
    boxSizing: 'border-box', fontFamily: POPPINS, fontWeight: 300,
  }
  const tarjeta: React.CSSProperties = {
    background: CREAM[300], border: `1px solid ${CREAM[600]}`, borderRadius: 16,
  }
  const rotulo: React.CSSProperties = {
    fontFamily: PLEX, fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.12em', color: OBSIDIAN[100], margin: '0 0 10px',
  }

  return (
    // Página independiente y SIEMPRE clara: es la cara al cliente, y habla en
    // la marca de POD, no en la de HOG APP.
    <div style={{ minHeight: '100vh', background: CREAM[500], color: OBSIDIAN[500], fontFamily: POPPINS }}>
      {/* Banda de marca: el degradado del espacio con el logo en cream, que es
          como el manual pide usar el ícono sobre color. */}
      <div style={{ background: WELLNESS_GRADIENT, padding: '30px 18px 26px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <PodWellnessLogo size={26} color={CREAM[500]} />
          <p style={{ fontFamily: PLEX, fontWeight: 200, fontSize: 14, letterSpacing: '0.06em', color: 'rgba(239,239,224,0.72)', margin: '14px 0 0' }}>
            {info?.venue ? info.venue.toUpperCase() : 'YOGA · PILATES · BIENESTAR'}
          </p>
          {hayPromo && (
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, marginTop: 16, padding: '7px 16px', borderRadius: 999, background: 'rgba(239,239,224,0.13)', border: '1px solid rgba(239,239,224,0.28)' }}>
              <span style={{ fontFamily: PLEX, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(239,239,224,0.75)' }}>Apertura</span>
              <span style={{ fontFamily: PLEX, fontSize: 13, fontWeight: 300, color: 'rgba(239,239,224,0.6)', textDecoration: 'line-through' }}>{mxn(Number(info!.precio_regular))}</span>
              <span style={{ fontFamily: POPPINS, fontSize: 19, fontWeight: 600, color: CREAM[500] }}>{mxn(Number(info!.precio_vigente))}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '26px 18px 60px' }}>
        <header style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontFamily: POPPINS, fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
            Aparta tu lugar
          </h1>
          <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 16, color: OBSIDIAN[100], margin: '6px 0 0' }}>
            Sin cuentas ni contraseñas.{hayPromo ? ` Todo septiembre a ${mxn(Number(info!.precio_vigente))}.` : ''}
          </p>
          {myName && (
            <p style={{ fontFamily: PLEX, fontSize: 13.5, margin: '12px 0 0', color: ESPACIO.wellness, fontWeight: 600 }}>
              Hola, {myName.split(' ')[0]}
            </p>
          )}
        </header>

        {msg && (
          <div onClick={() => setMsg(null)} style={{ padding: '13px 15px', borderRadius: 12, marginBottom: 16, cursor: 'pointer', fontFamily: POPPINS, fontWeight: 300, background: msg.error ? '#F7E9E4' : 'rgba(29,158,117,0.10)', border: `1px solid ${msg.error ? '#DFB6A8' : 'rgba(29,158,117,0.35)'}`, color: msg.error ? '#7A2E1B' : '#0F5B43', fontSize: 14, lineHeight: 1.5 }}>
            {msg.text}
          </div>
        )}

        {/* Cartelera */}
        {loading ? (
          <p style={{ textAlign: 'center', color: OBSIDIAN[100], fontWeight: 300 }}>Cargando horarios…</p>
        ) : porDia.length === 0 ? (
          <p style={{ textAlign: 'center', color: OBSIDIAN[100], fontWeight: 300 }}>Sin clases programadas por ahora.</p>
        ) : porDia.map(([date, rows]) => (
          <section key={date} style={{ marginBottom: 22 }}>
            <h2 style={rotulo}>
              {esMismoDia(date, hoy) ? 'Hoy · ' : ''}{fmtFecha(date)}
            </h2>
            {rows.map(({ slot, booked }) => {
              const libres = slot.capacity - booked
              const lleno = libres <= 0
              const reservada = yaReserve(slot.slot_id, date)
              const precio = precioDe(slot.price)
              return (
                <div key={slot.slot_id + date} style={{ ...tarjeta, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', marginBottom: 8 }}>
                  <div style={{ textAlign: 'center', minWidth: 54 }}>
                    <div style={{ fontFamily: PLEX, fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{slot.start_time}</div>
                    <div style={{ fontFamily: PLEX, fontSize: 11, fontWeight: 300, color: OBSIDIAN[100] }}>{slot.duration_min} min</div>
                  </div>
                  {/* Filete del color del espacio: el 10% de acento del manual */}
                  <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: ESPACIO.wellness, flexShrink: 0, opacity: lleno ? 0.3 : 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: PLEX, fontSize: 16.5, fontWeight: 600 }}>{slot.class}</div>
                    <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[100], marginTop: 1 }}>
                      {slot.instructor ? `con ${slot.instructor}` : ''}
                      {slot.instructor && precio > 0 ? ' · ' : ''}
                      {precio > 0 ? (
                        hayPromo
                          ? <><span style={{ textDecoration: 'line-through', opacity: 0.65 }}>{mxn(Number(info!.precio_regular))}</span> <strong style={{ color: ESPACIO.wellness, fontWeight: 600 }}>{mxn(precio)}</strong></>
                          : mxn(precio)
                      ) : 'sin costo'}
                    </div>
                    <div style={{ fontFamily: PLEX, fontSize: 11.5, marginTop: 3, fontWeight: 600, letterSpacing: '0.03em', color: lleno ? '#8C2F1F' : libres <= 3 ? '#8A6206' : ESPACIO.wellness }}>
                      {lleno ? 'Llena' : libres <= 3 ? `Quedan ${libres} lugares` : `${libres} lugares`}
                    </div>
                  </div>
                  <button disabled={lleno || reservada || busy} onClick={() => reservar(slot, date)}
                    style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: reservada ? `1px solid ${ESPACIO.wellness}` : 'none', fontFamily: PLEX, fontSize: 13.5, fontWeight: 600, letterSpacing: '0.02em', cursor: lleno || reservada ? 'default' : 'pointer', background: reservada ? 'rgba(29,158,117,0.10)' : lleno ? CREAM[600] : OBSIDIAN[500], color: reservada ? ESPACIO.wellness : lleno ? OBSIDIAN[100] : CREAM[500] }}>
                    {reservada ? 'Voy' : lleno ? 'Llena' : 'Reservar'}
                  </button>
                </div>
              )
            })}
          </section>
        ))}

        {/* Mis clases */}
        {token && vigentes.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={rotulo}>Mis clases</h2>
            {vigentes.map(b => (
              <div key={b.booking_id} style={{ ...tarjeta, display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontFamily: PLEX, fontSize: 15, fontWeight: 600 }}>{b.class} · {b.start_time}</div>
                  <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[100] }}>{fmtFecha(b.class_date)}</div>
                </div>
                {b.paid ? (
                  <span style={{ fontFamily: PLEX, fontSize: 12, fontWeight: 600, color: ESPACIO.wellness, background: 'rgba(29,158,117,0.10)', border: `1px solid rgba(29,158,117,0.3)`, borderRadius: 999, padding: '6px 13px' }}>Pagada</span>
                ) : Number(b.amount) > 0 ? (
                  <button onClick={() => pagar(b)} disabled={busy}
                    style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: ESPACIO.wellness, color: CREAM[500], fontFamily: PLEX, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Pagar {mxn(precioDe(Number(b.amount)))}
                  </button>
                ) : null}
                <button onClick={() => cancelar(b)} disabled={busy}
                  style={{ minHeight: 40, padding: '0 13px', borderRadius: 999, border: `1px solid ${CREAM[600]}`, background: 'none', color: OBSIDIAN[100], fontFamily: PLEX, fontSize: 12.5, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            ))}
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12, color: OBSIDIAN[100], lineHeight: 1.6, marginTop: 10 }}>
              Puedes cancelar hasta 3 horas antes de la clase. El pago en línea lo procesa Blumon Pay — tu tarjeta nunca pasa por nuestro sistema. También puedes pagar en el estudio.
            </p>
          </section>
        )}

        {/* Pie */}
        <footer style={{ marginTop: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <PodIcon size={40} color={CREAM[700]} />
          {!token ? (
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[100], margin: 0, maxWidth: 380, lineHeight: 1.6 }}>
              ¿Ya te habías registrado? Reserva cualquier clase y pon tu mismo teléfono — recuperas tu cuenta sola.
            </p>
          ) : (
            <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setMine([]) }}
              style={{ fontFamily: PLEX, fontSize: 12, color: OBSIDIAN[100], background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Salir de esta cuenta en este dispositivo
            </button>
          )}
        </footer>
      </div>

      {/* Registro */}
      {regOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 50 }}>
          <div style={{ background: CREAM[500], borderRadius: 20, padding: 26, width: '100%', maxWidth: 400 }}>
            <PodIcon size={40} color={ESPACIO.wellness} />
            <h3 style={{ fontFamily: POPPINS, fontSize: 22, fontWeight: 800, margin: '16px 0 6px', letterSpacing: '-0.01em' }}>Un paso y listo</h3>
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 14, color: OBSIDIAN[100], margin: '0 0 18px', lineHeight: 1.55 }}>
              Para apartar tu lugar en <strong style={{ fontWeight: 600, color: OBSIDIAN[500] }}>{regOpen.slot.class}</strong> ({fmtFecha(regOpen.date)}, {regOpen.slot.start_time}) solo necesitamos saber quién eres. No hay contraseñas.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={rName} onChange={e => setRName(e.target.value)} placeholder="Tu nombre completo" style={inpPod} autoFocus />
              <input value={rPhone} onChange={e => setRPhone(e.target.value)} placeholder="Tu teléfono (10 dígitos)" type="tel" inputMode="tel" style={inpPod} />
              <input value={rEmail} onChange={e => setREmail(e.target.value)} placeholder="Tu correo (opcional)" type="email" inputMode="email" style={inpPod} />
              <button onClick={registrar} disabled={busy}
                style={{ minHeight: 52, borderRadius: 999, border: 'none', background: OBSIDIAN[500], color: CREAM[500], fontFamily: PLEX, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 6 }}>
                {busy ? 'Un momento…' : 'Apartar mi lugar'}
              </button>
              <button onClick={() => setRegOpen(null)} style={{ minHeight: 40, background: 'none', border: 'none', color: OBSIDIAN[100], fontFamily: PLEX, fontSize: 13, cursor: 'pointer' }}>
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
