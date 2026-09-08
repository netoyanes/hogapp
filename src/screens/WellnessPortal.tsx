import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PodWellnessLogo, PodIcon } from '../components/ui/PodWellnessLogo'
import { CREAM, OBSIDIAN, ESPACIO, WELLNESS_GRADIENT, POPPINS, PLEX } from '../lib/podBrand'

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL WELLNESS — la cara pública (?wellness=CODIGO)
//
// ESTE LINK SE PEGA EN REDES. Quien lo abre puede no saber qué es POD, dónde
// está ni cuánto cuesta, y lo abre en el teléfono, de pie, con una mano. Todo
// lo que sigue está ordenado por esa realidad: qué es y dónde → cuánto y por
// qué registrarse → cuándo hay clases → cómo llego.
//
// Para el alumno no hay cuenta de HOG APP ni contraseñas: se registra una vez
// con nombre y teléfono, y su acceso queda en el navegador. La fricción mata la
// asistencia a una clase de 7:30 am.
//
// Los datos viajan por RPCs security-definer (patrón fn_shared_task): el anon
// key solo puede ver horario/cupo y operar SU cuenta vía token.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El cobro en línea todavía NO está listo: falta el alta de producción de
 * Blumon y validar el origen en la edge function wellness-pay, que hoy acepta
 * peticiones de cualquier dominio. Mientras tanto se cobra en caja y el portal
 * lo dice claro, en vez de ofrecer un botón que falla.
 *
 * Para encenderlo: cerrar esos dos pendientes y poner esto en true. La ruta de
 * pago (`pagar`) ya está escrita y probada contra el checkout.
 */
const PAGO_EN_LINEA = false

const LUGAR = {
  nombre: 'POD Condesa',
  calle: 'Nuevo León 108',
  colonia: 'Condesa, CDMX',
  mapa: 'https://share.google/fsz5ugWZOe5x6Wv',
  pisoEstudio: 'Segundo piso',
  pisoCaja: 'POD Art House, primer piso',
} as const

interface SlotDef {
  slot_id: string; weekday: number; start_time: string
  class: string; description: string | null; price: number
  capacity: number; duration_min: number; color: string; instructor: string | null
}
interface Occ { slot_id: string; class_date: string; booked: number }
interface MyBooking {
  booking_id: string; code: string | null; class: string; class_date: string; start_time: string
  instructor: string | null; status: string; paid: boolean; paid_via: string | null; amount: number | null
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
  const [perfil, setPerfil] = useState<{ phone?: string; email?: string | null; since?: string; tomadas?: number } | null>(null)
  const [acc, setAcc] = useState({ phone: '', name: '', email: '' })
  const [accNuevo, setAccNuevo] = useState(false)
  const [cuentaOpen, setCuentaOpen] = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [correoEdit, setCorreoEdit] = useState('')
  const [mine, setMine] = useState<MyBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [regOpen, setRegOpen] = useState<{ slot: SlotDef; date: string } | null>(null)
  const [rName, setRName] = useState('')
  const [rPhone, setRPhone] = useState('')
  const [rEmail, setREmail] = useState('')
  // El ticket que se muestra al terminar de reservar: es el comprobante que se
  // enseña en caja, así que se abre solo y ocupa la pantalla.
  const [ticket, setTicket] = useState<MyBooking | null>(null)
  const [info, setInfo] = useState<{ venue?: string; precio_regular?: number | null; descuento?: number | null; precio_vigente?: number | null; promocion?: boolean } | null>(null)
  const accesoRef = useRef<HTMLDivElement>(null)

  const hoy = new Date()
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 13)

  const load = useCallback(async () => {
    const [{ data: sch }, { data: oc }] = await Promise.all([
      supabase.rpc('fn_wellness_schedule', { p_code: code }),
      supabase.rpc('fn_wellness_occupancy', { p_code: code, p_from: iso(hoy), p_to: iso(hasta) }),
    ])
    setSlots((sch ?? []) as SlotDef[])
    setOcc((oc ?? []) as Occ[])
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
    setPerfil({ phone: data.phone, email: data.email, since: data.since, tomadas: data.tomadas })
    setCorreoEdit(data.email ?? '')
    setMine((data.bookings ?? []) as MyBooking[])
  }, [token])
  useEffect(() => { loadMine() }, [loadMine])

  const proximas = useMemo(() => {
    const out: { slot: SlotDef; date: string; booked: number }[] = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i)
      for (const s of slots.filter(s => s.weekday === d.getDay())) {
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

  // Tras reservar hay que releer la cuenta para tener el ticket completo (con
  // su código); el RPC de reserva solo devuelve el código, no la clase ni la
  // hora, y el ticket los necesita.
  async function abrirTicket(bookingId: string, fallback: Partial<MyBooking>) {
    const { data } = await supabase.rpc('fn_wellness_me', { p_token: token })
    const lista = (data?.bookings ?? []) as MyBooking[]
    setMine(lista)
    setTicket(lista.find(b => b.booking_id === bookingId) ?? ({ ...fallback, booking_id: bookingId } as MyBooking))
  }

  async function reservar(slot: SlotDef, date: string) {
    if (!token) { setRegOpen({ slot, date }); return }
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_book', { p_token: token, p_slot: slot.slot_id, p_date: date })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    await abrirTicket(data.booking_id, {
      code: data.code, class: slot.class, class_date: date, start_time: slot.start_time,
      instructor: slot.instructor, status: 'reservada', paid: false, amount: data.amount,
    })
    load()
  }

  async function entrar() {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_login', { p_phone: acc.phone, p_name: acc.name })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    if (data?.nuevo) {
      setAccNuevo(true)
      setMsg({ text: 'Ese teléfono todavía no está registrado. Completa tus datos y creamos tu cuenta — así se te aplica el descuento.' })
      return
    }
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setAccNuevo(false)
    setMsg({ text: `Qué gusto verte de nuevo, ${String(data.name).split(' ')[0]}.` })
  }

  async function crearCuenta() {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_register', {
      p_name: acc.name, p_phone: acc.phone, p_email: acc.email,
    })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setAccNuevo(false)
    setMsg({ text: hayDescuento ? `¡Listo! Tu descuento quedó activo: pagas ${mxn(conDescuento!)} por clase.` : '¡Listo! Tu cuenta quedó creada.' })
  }

  async function guardarCorreo() {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_update_me', { p_token: token, p_email: correoEdit })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    setPerfil(p => p ? { ...p, email: data.email } : p)
    setMsg({ text: 'Correo actualizado.' })
  }

  async function registrar() {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_register', {
      p_name: rName, p_phone: rPhone, p_email: rEmail,
    })
    if (data?.error) { setBusy(false); setMsg({ text: data.error, error: true }); return }
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    const pend = regOpen
    setRegOpen(null)
    if (pend) {
      const { data: bk } = await supabase.rpc('fn_wellness_book', { p_token: data.token, p_slot: pend.slot.slot_id, p_date: pend.date })
      setBusy(false)
      if (bk?.error) { setMsg({ text: bk.error, error: true }); return }
      // El token del estado todavía no se propaga en este tick, así que el
      // ticket se arma con lo que ya se sabe en vez de releer la cuenta.
      setTicket({
        booking_id: bk.booking_id, code: bk.code, class: pend.slot.class, class_date: pend.date,
        start_time: pend.slot.start_time, instructor: pend.slot.instructor,
        status: 'reservada', paid: false, paid_via: null, amount: bk.amount,
      })
      load()
      return
    }
    setBusy(false)
    setMsg({ text: hayDescuento ? `¡Listo! Tu descuento quedó activo: pagas ${mxn(conDescuento!)} por clase.` : '¡Listo! Tu cuenta quedó creada.' })
  }

  async function pagar(b: MyBooking) {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('wellness-pay', {
        body: { token, booking_id: b.booking_id },
      })
      // Cuando la función responde 4xx/5xx, invoke() NO entrega el cuerpo en
      // data: el JSON real viene dentro de error.context.
      let payload = data as { pay_url?: string; error?: string } | null
      if (error && !payload) {
        try { payload = await (error as { context?: Response }).context?.json() ?? null } catch { payload = null }
      }
      if (!payload?.pay_url) {
        setMsg({ text: payload?.error ?? `El pago en línea no está disponible ahorita — puedes pagar en ${LUGAR.pisoCaja}.`, error: true })
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
  const fmtCorto = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return `${d.getDate()} ${d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`
  }
  const esMismoDia = (a: string, b: Date) => a === iso(b)

  const porDia = useMemo(() => {
    const m = new Map<string, typeof proximas>()
    for (const p of proximas) { const arr = m.get(p.date) ?? []; arr.push(p); m.set(p.date, arr) }
    return [...m.entries()]
  }, [proximas])

  const vigentes = mine.filter(b => b.status !== 'cancelada' && b.class_date >= iso(hoy))
  const pasadas = mine.filter(b => b.status !== 'cancelada' && b.class_date < iso(hoy))

  const regular = Number(info?.precio_regular) > 0 ? Number(info!.precio_regular) : null
  const conDescuento = Number(info?.precio_vigente) > 0 ? Number(info!.precio_vigente) : null
  const hayDescuento = !!info?.promocion && Number(info?.descuento) > 0 && regular != null && conDescuento != null
  const ahorro = hayDescuento ? regular! - conDescuento! : 0
  const precioDe = (p: number) => {
    if (!hayDescuento) return conDescuento ?? p
    return token ? conDescuento! : regular!
  }

  const irAAcceso = () => accesoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // ── Identidad POD (manual de marca): 70% cream · 20% obsidian · 10% verde ──
  const inpPod: React.CSSProperties = {
    width: '100%', minHeight: 52, background: CREAM[300], border: `1px solid ${CREAM[600]}`,
    borderRadius: 12, padding: '0 14px', fontSize: 16, color: OBSIDIAN[500], outline: 'none',
    boxSizing: 'border-box', fontFamily: POPPINS, fontWeight: 300,
  }
  const tarjeta: React.CSSProperties = {
    background: CREAM[300], border: `1px solid ${CREAM[600]}`, borderRadius: 16,
  }
  const rotulo: React.CSSProperties = {
    fontFamily: PLEX, fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.12em', color: OBSIDIAN[100], margin: '0 0 10px',
  }
  const btnPrimario: React.CSSProperties = {
    minHeight: 54, borderRadius: 999, border: 'none', background: OBSIDIAN[500], color: CREAM[500],
    fontFamily: PLEX, fontSize: 16, fontWeight: 600, cursor: 'pointer', width: '100%',
  }

  return (
    // Página independiente y SIEMPRE clara: es la cara al cliente, y habla en
    // la marca de POD, no en la de HOG APP.
    <div style={{ minHeight: '100vh', background: CREAM[500], color: OBSIDIAN[500], fontFamily: POPPINS }}>

      {/* ── PORTADA ──────────────────────────────────────────────────────────
          El degradado del espacio con la marca en cream, que es como el manual
          pide usar el logotipo sobre color. Quien llega de redes no sabe qué es
          esto: por eso lo primero que se lee es qué se hace y dónde. */}
      <header style={{ background: WELLNESS_GRADIENT, padding: '30px 18px 30px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <PodWellnessLogo color={CREAM[500]} />
          <p style={{ fontFamily: PLEX, fontWeight: 300, fontSize: 12.5, letterSpacing: '0.18em', color: 'rgba(239,239,224,0.75)', margin: '16px 0 0' }}>
            {LUGAR.calle.toUpperCase()} · {LUGAR.colonia.toUpperCase()}
          </p>

          <h1 style={{ fontFamily: POPPINS, fontSize: 'clamp(27px, 8vw, 38px)', fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.1, color: CREAM[500], margin: '20px 0 0' }}>
            Yoga y Pilates<br />en la Condesa
          </h1>
          <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 16, lineHeight: 1.55, color: 'rgba(239,239,224,0.88)', margin: '12px 0 0' }}>
            Clase por clase, sin mensualidades. Reservas solo la que vas a tomar.
          </p>

          {/* El precio va en la portada: es la primera pregunta de cualquiera
              que llegue de una historia de Instagram. */}
          {hayDescuento && (
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 9, margin: '20px 0 0', padding: '9px 18px', borderRadius: 999, background: 'rgba(239,239,224,0.14)', border: '1px solid rgba(239,239,224,0.3)' }}>
              <span style={{ fontFamily: PLEX, fontSize: 14, fontWeight: 300, color: 'rgba(239,239,224,0.65)', textDecoration: 'line-through' }}>{mxn(regular!)}</span>
              <span style={{ fontFamily: POPPINS, fontSize: 26, fontWeight: 700, color: CREAM[500], lineHeight: 1 }}>{mxn(conDescuento!)}</span>
              <span style={{ fontFamily: PLEX, fontSize: 12.5, fontWeight: 300, color: 'rgba(239,239,224,0.8)' }}>por clase</span>
            </div>
          )}

          {!token && (
            <>
              <button onClick={irAAcceso}
                style={{ ...btnPrimario, background: CREAM[500], color: OBSIDIAN[500], marginTop: 18, maxWidth: 360 }}>
                {hayDescuento ? `Registrarme y pagar ${mxn(conDescuento!)}` : 'Crear mi cuenta'}
              </button>
              {hayDescuento && (
                <p style={{ fontFamily: PLEX, fontWeight: 300, fontSize: 12.5, color: 'rgba(239,239,224,0.72)', margin: '10px 0 0' }}>
                  Te registras una vez y el descuento de {mxn(ahorro)} queda activo para siempre.
                </p>
              )}
            </>
          )}
          {token && (
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 15, color: CREAM[500], margin: '20px 0 0' }}>
              Hola de nuevo, <strong style={{ fontWeight: 600 }}>{myName.split(' ')[0]}</strong>
              {hayDescuento ? <> — tu precio es {mxn(conDescuento!)}.</> : '.'}
            </p>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 18px 60px' }}>

        {msg && (
          <div onClick={() => setMsg(null)} style={{ padding: '13px 15px', borderRadius: 12, marginBottom: 18, cursor: 'pointer', fontFamily: POPPINS, fontWeight: 300, background: msg.error ? '#F7E9E4' : 'rgba(29,158,117,0.10)', border: `1px solid ${msg.error ? '#DFB6A8' : 'rgba(29,158,117,0.35)'}`, color: msg.error ? '#7A2E1B' : '#0F5B43', fontSize: 14, lineHeight: 1.5 }}>
            {msg.text}
          </div>
        )}

        {/* ── ACCESO ── Sin cuenta no hay descuento, así que va antes de la
            cartelera y no escondido detrás de un intento de reserva. */}
        {!token && (
          <section ref={accesoRef} style={{ ...tarjeta, padding: 18, marginBottom: 22, scrollMarginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <PodIcon size={24} color={ESPACIO.wellness} />
              <h2 style={{ fontFamily: PLEX, fontSize: 19, fontWeight: 700, margin: 0 }}>
                {accNuevo ? 'Solo falta esto' : hayDescuento ? `Activa tu precio de ${mxn(conDescuento!)}` : 'Entra o crea tu cuenta'}
              </h2>
            </div>
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 14, color: OBSIDIAN[100], margin: '0 0 15px', lineHeight: 1.55 }}>
              {accNuevo
                ? 'Tu teléfono será tu acceso. No hay contraseñas que recordar.'
                : hayDescuento
                  ? <>Nombre y teléfono, nada más. El descuento de <strong style={{ color: ESPACIO.wellness, fontWeight: 600 }}>{mxn(ahorro)}</strong> se aplica solo en todas tus reservas. ¿Ya te registraste? Entra con tu teléfono.</>
                  : 'Tu teléfono es tu acceso. Si es la primera vez, te creamos la cuenta al momento.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={acc.name} onChange={e => setAcc(a => ({ ...a, name: e.target.value }))}
                placeholder="Tu nombre" style={inpPod} autoComplete="name"
                onKeyDown={e => { if (e.key === 'Enter' && !accNuevo) entrar() }} />
              <input value={acc.phone} onChange={e => { setAcc(a => ({ ...a, phone: e.target.value })); setAccNuevo(false) }}
                placeholder="Tu teléfono (10 dígitos)" type="tel" inputMode="numeric" autoComplete="tel" style={inpPod}
                onKeyDown={e => { if (e.key === 'Enter' && !accNuevo) entrar() }} />
              {accNuevo && (
                <input value={acc.email} onChange={e => setAcc(a => ({ ...a, email: e.target.value }))}
                  placeholder="Tu correo (para tu comprobante)" type="email" inputMode="email" autoComplete="email" style={inpPod} />
              )}
              <button onClick={() => accNuevo ? crearCuenta() : entrar()} disabled={busy || acc.phone.trim().length < 10 || acc.name.trim().length < 3}
                style={{ ...btnPrimario, opacity: busy || acc.phone.trim().length < 10 || acc.name.trim().length < 3 ? 0.45 : 1 }}>
                {busy ? 'Un momento…' : accNuevo ? 'Crear mi cuenta' : hayDescuento ? `Activar mi precio de ${mxn(conDescuento!)}` : 'Entrar'}
              </button>
            </div>
          </section>
        )}

        {/* ── MI CUENTA ── */}
        {token && (
          <section style={{ ...tarjeta, marginBottom: 22, overflow: 'hidden' }}>
            <button onClick={() => setCuentaOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <PodIcon size={28} color={ESPACIO.wellness} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: PLEX, fontSize: 15.5, fontWeight: 600 }}>{myName}</span>
                <span style={{ display: 'block', fontFamily: POPPINS, fontWeight: 300, fontSize: 12.5, color: OBSIDIAN[100] }}>
                  {perfil?.tomadas ? `${perfil.tomadas} ${perfil.tomadas === 1 ? 'clase tomada' : 'clases tomadas'}` : 'Mi cuenta'}
                  {hayDescuento ? ` · pagas ${mxn(conDescuento!)}` : ''}
                </span>
              </span>
              <span style={{ fontFamily: PLEX, fontSize: 12, color: OBSIDIAN[100] }}>{cuentaOpen ? 'Ocultar' : 'Ver'}</span>
            </button>
            {cuentaOpen && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontFamily: POPPINS, fontWeight: 300, fontSize: 13 }}>
                  <span><span style={{ color: OBSIDIAN[100] }}>Teléfono</span><br /><strong style={{ fontWeight: 600 }}>{perfil?.phone ?? '—'}</strong></span>
                  <span><span style={{ color: OBSIDIAN[100] }}>Desde</span><br /><strong style={{ fontWeight: 600 }}>{perfil?.since ? new Date(perfil.since).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '—'}</strong></span>
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: PLEX, fontSize: 11.5, color: OBSIDIAN[100], marginBottom: 5 }}>
                    Correo {perfil?.email ? '' : '— para recibir tu comprobante'}
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={correoEdit} onChange={e => setCorreoEdit(e.target.value)} placeholder="tucorreo@ejemplo.com"
                      type="email" inputMode="email" style={inpPod} onKeyDown={e => { if (e.key === 'Enter') guardarCorreo() }} />
                    <button onClick={guardarCorreo} disabled={busy || correoEdit === (perfil?.email ?? '')}
                      style={{ minHeight: 52, padding: '0 16px', borderRadius: 999, border: 'none', background: correoEdit !== (perfil?.email ?? '') ? ESPACIO.wellness : CREAM[600], color: correoEdit !== (perfil?.email ?? '') ? CREAM[500] : OBSIDIAN[100], fontFamily: PLEX, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Guardar
                    </button>
                  </div>
                </div>
                {pasadas.length > 0 && (
                  <div>
                    <button onClick={() => setHistorialOpen(v => !v)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: PLEX, fontSize: 13, fontWeight: 600, color: ESPACIO.wellness }}>
                      {historialOpen ? 'Ocultar historial' : `Ver mis ${pasadas.length} ${pasadas.length === 1 ? 'clase anterior' : 'clases anteriores'}`}
                    </button>
                    {historialOpen && (
                      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {pasadas.map(b => (
                          <li key={b.booking_id} style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[100] }}>
                            <span style={{ fontFamily: PLEX, fontVariantNumeric: 'tabular-nums', minWidth: 52, color: OBSIDIAN[200] }}>{fmtCorto(b.class_date)}</span>
                            <span style={{ flex: 1, minWidth: 0, color: OBSIDIAN[500] }}>{b.class}</span>
                            <span style={{ fontFamily: PLEX, fontSize: 11.5, color: b.status === 'asistio' ? ESPACIO.wellness : OBSIDIAN[100] }}>
                              {b.status === 'asistio' ? 'Asististe' : b.status === 'no_asistio' ? 'No fuiste' : 'Reservada'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── MIS PRÓXIMAS CLASES ── Arriba de la cartelera: si ya reservaste,
            lo que buscas al volver a abrir el link es tu código, no el horario. */}
        {token && vigentes.length > 0 && (
          <section style={{ marginBottom: 26 }}>
            <h2 style={rotulo}>Mis próximas clases</h2>
            {vigentes.map(b => (
              <div key={b.booking_id} style={{ ...tarjeta, padding: '13px 16px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontFamily: PLEX, fontSize: 15.5, fontWeight: 600 }}>{b.class} · {b.start_time}</div>
                    <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[100] }}>{fmtFecha(b.class_date)}</div>
                  </div>
                  {b.paid
                    ? <span style={{ fontFamily: PLEX, fontSize: 12, fontWeight: 600, color: ESPACIO.wellness, background: 'rgba(29,158,117,0.10)', border: '1px solid rgba(29,158,117,0.3)', borderRadius: 999, padding: '6px 13px' }}>Pagada</span>
                    : PAGO_EN_LINEA && Number(b.amount) > 0
                      ? <button onClick={() => pagar(b)} disabled={busy} style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: ESPACIO.wellness, color: CREAM[500], fontFamily: PLEX, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Pagar {mxn(Number(b.amount))}</button>
                      : <span style={{ fontFamily: PLEX, fontSize: 12, color: OBSIDIAN[100] }}>Pagas al llegar</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, paddingTop: 11, borderTop: `1px solid ${CREAM[600]}`, flexWrap: 'wrap' }}>
                  {/* nowrap en los dos: sin esto, a 390px el rótulo se parte en
                      dos renglones y el código se corta a la mitad — que es
                      justo el dato que la persona va a leer en voz alta. */}
                  <button onClick={() => setTicket(b)}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', flexShrink: 0 }}>
                    <span style={{ fontFamily: PLEX, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: OBSIDIAN[100], whiteSpace: 'nowrap' }}>Código</span>
                    <span style={{ fontFamily: PLEX, fontSize: 15, fontWeight: 700, letterSpacing: '0.05em', color: ESPACIO.wellness, whiteSpace: 'nowrap' }}>{b.code ?? '—'}</span>
                  </button>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => setTicket(b)} style={{ background: 'none', border: `1px solid ${CREAM[600]}`, borderRadius: 999, padding: '7px 13px', fontFamily: PLEX, fontSize: 12.5, cursor: 'pointer', color: OBSIDIAN[500] }}>Ver ticket</button>
                  <button onClick={() => cancelar(b)} disabled={busy}
                    style={{ background: 'none', border: 'none', color: OBSIDIAN[100], fontFamily: PLEX, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>Cancelar</button>
                </div>
              </div>
            ))}
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12.5, color: OBSIDIAN[100], lineHeight: 1.6, marginTop: 10 }}>
              Puedes cancelar hasta 3 horas antes de la clase.
            </p>
          </section>
        )}

        {/* ── CARTELERA ── */}
        <h2 style={{ ...rotulo, marginBottom: 12 }}>Próximas clases</h2>
        {loading ? (
          <p style={{ textAlign: 'center', color: OBSIDIAN[100], fontWeight: 300 }}>Cargando horarios…</p>
        ) : porDia.length === 0 ? (
          <p style={{ textAlign: 'center', color: OBSIDIAN[100], fontWeight: 300 }}>Sin clases programadas por ahora.</p>
        ) : porDia.map(([date, rows]) => (
          <section key={date} style={{ marginBottom: 22 }}>
            <h3 style={rotulo}>
              {esMismoDia(date, hoy) ? 'Hoy · ' : ''}{fmtFecha(date)}
            </h3>
            {rows.map(({ slot, booked }) => {
              const libres = slot.capacity - booked
              const lleno = libres <= 0
              const reservada = yaReserve(slot.slot_id, date)
              const precio = precioDe(slot.price)
              return (
                <div key={slot.slot_id + date} style={{ ...tarjeta, display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px', marginBottom: 8 }}>
                  <div style={{ textAlign: 'center', minWidth: 50 }}>
                    <div style={{ fontFamily: PLEX, fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{slot.start_time}</div>
                    <div style={{ fontFamily: PLEX, fontSize: 11, fontWeight: 300, color: OBSIDIAN[100] }}>{slot.duration_min} min</div>
                  </div>
                  {/* Filete del color del espacio: el 10% de acento del manual */}
                  <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: ESPACIO.wellness, flexShrink: 0, opacity: lleno ? 0.3 : 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: PLEX, fontSize: 16, fontWeight: 600 }}>{slot.class}</div>
                    {/* Maestro, precio y cupo en renglones propios. Juntos en
                        una sola línea se parten en tres a 390px de ancho, que
                        es donde va a vivir esta página. */}
                    {slot.instructor && (
                      <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[100], marginTop: 1 }}>
                        con {slot.instructor}
                      </div>
                    )}
                    <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[100], marginTop: 1 }}>
                      {precio > 0 ? (
                        hayDescuento
                          ? (token
                              ? <strong style={{ color: ESPACIO.wellness, fontWeight: 600 }}>{mxn(conDescuento!)}</strong>
                              : <><span style={{ textDecoration: 'line-through' }}>{mxn(regular!)}</span> <strong style={{ color: ESPACIO.wellness, fontWeight: 600 }}>{mxn(conDescuento!)}</strong> registrado</>)
                          : mxn(precio)
                      ) : 'sin costo'}
                    </div>
                    <div style={{ fontFamily: PLEX, fontSize: 11.5, marginTop: 3, fontWeight: 600, letterSpacing: '0.03em', color: lleno ? '#8C2F1F' : libres <= 3 ? '#8A6206' : ESPACIO.wellness }}>
                      {lleno ? 'Llena' : libres <= 3 ? `Quedan ${libres} lugares` : `${libres} lugares`}
                    </div>
                  </div>
                  <button disabled={lleno || reservada || busy} onClick={() => reservar(slot, date)}
                    style={{ minHeight: 44, padding: '0 17px', borderRadius: 999, border: reservada ? `1px solid ${ESPACIO.wellness}` : 'none', fontFamily: PLEX, fontSize: 13.5, fontWeight: 600, letterSpacing: '0.02em', cursor: lleno || reservada ? 'default' : 'pointer', background: reservada ? 'rgba(29,158,117,0.10)' : lleno ? CREAM[600] : OBSIDIAN[500], color: reservada ? ESPACIO.wellness : lleno ? OBSIDIAN[100] : CREAM[500], flexShrink: 0 }}>
                    {reservada ? 'Voy' : lleno ? 'Llena' : 'Reservar'}
                  </button>
                </div>
              )
            })}
          </section>
        ))}

        {/* ── CÓMO LLEGAR ── Dos pisos distintos, y eso confunde a quien viene
            por primera vez: el estudio arriba, la caja abajo. Va explícito. */}
        <section style={{ ...tarjeta, padding: 18, marginTop: 30 }}>
          <h2 style={{ ...rotulo, marginBottom: 12 }}>Cómo llegar</h2>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <PodIcon size={26} color={ESPACIO.wellness} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: PLEX, fontSize: 17, fontWeight: 700 }}>{LUGAR.nombre}</div>
              <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 14.5, color: OBSIDIAN[200], marginTop: 2 }}>
                {LUGAR.calle}, {LUGAR.colonia}
              </div>
            </div>
          </div>
          <a href={LUGAR.mapa} target="_blank" rel="noopener noreferrer"
            style={{ ...btnPrimario, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', marginTop: 14, background: ESPACIO.wellness }}>
            Abrir en Google Maps
          </a>
          <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <li style={{ display: 'flex', gap: 10, fontFamily: POPPINS, fontWeight: 300, fontSize: 13.5, lineHeight: 1.5 }}>
              <span style={{ fontFamily: PLEX, fontWeight: 700, color: ESPACIO.wellness, minWidth: 18 }}>2º</span>
              <span><strong style={{ fontWeight: 600 }}>El estudio.</strong> {LUGAR.pisoEstudio} — ahí se toman todas las clases.</span>
            </li>
            <li style={{ display: 'flex', gap: 10, fontFamily: POPPINS, fontWeight: 300, fontSize: 13.5, lineHeight: 1.5 }}>
              <span style={{ fontFamily: PLEX, fontWeight: 700, color: ESPACIO.wellness, minWidth: 18 }}>1º</span>
              <span><strong style={{ fontWeight: 600 }}>La caja.</strong> {LUGAR.pisoCaja} — ahí pagas tu clase con tu código.</span>
            </li>
          </ul>
          <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12.5, color: OBSIDIAN[100], lineHeight: 1.6, margin: '14px 0 0' }}>
            Llega 10 minutos antes si es tu primera vez. Trae ropa cómoda; los tapetes están en el estudio.
          </p>
        </section>

        {/* Pie */}
        <footer style={{ marginTop: 36, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <PodIcon size={36} color={CREAM[700]} />
          {!token ? (
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[100], margin: 0, maxWidth: 380, lineHeight: 1.6 }}>
              Tu teléfono es tu acceso. Si cambias de celular, entra con el mismo número y tu cuenta te sigue.
            </p>
          ) : (
            <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setMine([]); setPerfil(null); setCuentaOpen(false) }}
              style={{ fontFamily: PLEX, fontSize: 12, color: OBSIDIAN[100], background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Salir de esta cuenta en este dispositivo
            </button>
          )}
        </footer>
      </main>

      {/* ── TICKET ── El comprobante que se enseña en caja. */}
      {ticket && (
        <div onClick={() => setTicket(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 60, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: CREAM[300], borderRadius: 20, width: '100%', maxWidth: 380, overflow: 'hidden', margin: 'auto' }}>
            <div style={{ background: WELLNESS_GRADIENT, padding: '20px 22px 18px', textAlign: 'center' }}>
              <PodWellnessLogo size={17} color={CREAM[500]} />
              <p style={{ fontFamily: PLEX, fontSize: 11.5, letterSpacing: '0.14em', color: 'rgba(239,239,224,0.8)', margin: '12px 0 0' }}>
                TU LUGAR ESTÁ APARTADO
              </p>
            </div>
            <div style={{ padding: '20px 22px 22px' }}>
              <div style={{ fontFamily: PLEX, fontSize: 21, fontWeight: 700, lineHeight: 1.2 }}>{ticket.class}</div>
              <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 14.5, color: OBSIDIAN[200], marginTop: 3 }}>
                {fmtFecha(ticket.class_date)} · {ticket.start_time}
                {ticket.instructor ? ` · con ${ticket.instructor}` : ''}
              </div>

              {/* El código en grande: es lo único que hay que enseñar en caja. */}
              <div style={{ margin: '18px 0', padding: '16px 14px', borderRadius: 14, background: CREAM[500], border: `1px dashed ${ESPACIO.wellness}`, textAlign: 'center' }}>
                <div style={{ fontFamily: PLEX, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: OBSIDIAN[100] }}>Código de tu reserva</div>
                <div style={{ fontFamily: PLEX, fontSize: 30, fontWeight: 700, letterSpacing: '0.08em', color: ESPACIO.wellness, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
                  {ticket.code ?? '—'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: POPPINS, fontSize: 14, fontWeight: 300 }}>
                <span style={{ color: OBSIDIAN[100] }}>Total a pagar</span>
                <strong style={{ fontFamily: POPPINS, fontSize: 22, fontWeight: 700 }}>{Number(ticket.amount) > 0 ? mxn(Number(ticket.amount)) : 'Sin costo'}</strong>
              </div>

              <div style={{ marginTop: 16, padding: '13px 15px', borderRadius: 12, background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.25)' }}>
                <div style={{ fontFamily: PLEX, fontSize: 12.5, fontWeight: 600, color: '#0F5B43', marginBottom: 5 }}>
                  {ticket.paid ? 'Ya está pagada' : 'Paga al llegar'}
                </div>
                <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[200], margin: 0, lineHeight: 1.55 }}>
                  {ticket.paid
                    ? <>Solo preséntate en el estudio, {LUGAR.pisoEstudio.toLowerCase()}.</>
                    : <>Enseña este código en la caja de <strong style={{ fontWeight: 600 }}>{LUGAR.pisoCaja}</strong>. La clase es en el {LUGAR.pisoEstudio.toLowerCase()}.</>}
                </p>
              </div>

              <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12, color: OBSIDIAN[100], lineHeight: 1.55, margin: '14px 0 0' }}>
                Guarda tu código. Lo vuelves a ver cuando quieras en “Mis próximas clases”, desde este mismo link.
              </p>

              <button onClick={() => setTicket(null)} style={{ ...btnPrimario, marginTop: 16 }}>Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── REGISTRO al intentar reservar sin cuenta ── */}
      {regOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 50, overflowY: 'auto' }}>
          <div style={{ background: CREAM[500], borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, margin: 'auto' }}>
            <PodIcon size={38} color={ESPACIO.wellness} />
            <h3 style={{ fontFamily: POPPINS, fontSize: 22, fontWeight: 800, margin: '14px 0 6px', letterSpacing: '-0.01em' }}>
              {hayDescuento ? `Regístrate y paga ${mxn(conDescuento!)}` : 'Un paso y listo'}
            </h3>
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 14, color: OBSIDIAN[100], margin: '0 0 18px', lineHeight: 1.55 }}>
              Apartas tu lugar en <strong style={{ fontWeight: 600, color: OBSIDIAN[500] }}>{regOpen.slot.class}</strong> ({fmtFecha(regOpen.date)}, {regOpen.slot.start_time})
              {hayDescuento ? <> con tu descuento de {mxn(ahorro)} ya aplicado.</> : '.'} Sin contraseñas.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={rName} onChange={e => setRName(e.target.value)} placeholder="Tu nombre completo" autoComplete="name" style={inpPod} autoFocus />
              <input value={rPhone} onChange={e => setRPhone(e.target.value)} placeholder="Tu teléfono (10 dígitos)" type="tel" inputMode="numeric" autoComplete="tel" style={inpPod} />
              <input value={rEmail} onChange={e => setREmail(e.target.value)} placeholder="Tu correo (opcional)" type="email" inputMode="email" autoComplete="email" style={inpPod} />
              <button onClick={registrar} disabled={busy || rPhone.trim().length < 10 || rName.trim().length < 3}
                style={{ ...btnPrimario, marginTop: 4, opacity: busy || rPhone.trim().length < 10 || rName.trim().length < 3 ? 0.45 : 1 }}>
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
