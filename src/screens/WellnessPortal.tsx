import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PodWellnessLogo, PodIcon } from '../components/ui/PodWellnessLogo'
import { CREAM, OBSIDIAN, ESPACIO, WELLNESS_GRADIENT, POPPINS, PLEX } from '../lib/podBrand'

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL WELLNESS — la cara pública (?wellness=CODIGO)
//
// ESTE LINK SE PEGA EN REDES. Quien lo abre no sabe qué es POD ni dónde está,
// y lo abre en el teléfono. El orden es: qué y dónde → qué clases hay → aparto.
//
// DOS DECISIONES QUE MANDAN SOBRE EL DISEÑO:
//
// 1. El registro NO se pide por adelantado. La cartelera se ve sin dar nada, y
//    los datos se piden en el momento de apartar — cuando ya hay una razón para
//    darlos. Un formulario antes de mostrar el producto ahuyenta.
//
// 2. La lista se recorre con el pulgar. Filtro por clase y una semana a la vez,
//    porque catorce días de cartelera son cincuenta tarjetas de scroll.
//
// El precio de lista es el que se anuncia. El descuento aparece al apartar,
// que es donde puede cambiar la decisión: ahí se ven las dos opciones —con
// cuenta y sin cuenta— y la diferencia de precio entre ellas.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EL COBRO EN LÍNEA, DE MOMENTO, SOLO PARA PROBARLO.
 *
 * La pasarela ya funciona de punta a punta —checkout, regreso y webhook—, pero
 * las credenciales cargadas son las de SANDBOX. Encenderlo para todos mandaría
 * a los alumnos a un checkout donde su tarjeta no se cobra, y llegarían al
 * estudio creyendo que ya pagaron.
 *
 * Así que se enciende por URL: /?wellness=PC&pago=1
 *
 * Quien llega del link de redes no lo ve y paga en caja, como hasta ahora.
 * Quien quiere probar el flujo completo agrega el parámetro.
 *
 * PARA PRODUCCIÓN: cuando BLUMON_ENV sea 'prod' con credenciales productivas y
 * la URL del webhook esté registrada, esto se cambia por `true` a secas.
 */
const pagoEnLinea = () => new URLSearchParams(location.search).get('pago') === '1'

const LUGAR = {
  nombre: 'POD Condesa',
  calle: 'Nuevo León 108',
  colonia: 'Condesa, CDMX',
  mapa: 'https://maps.app.goo.gl/AmEqutekz1gGPEZD6',
  pisoEstudio: 'segundo piso',
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
interface Info {
  venue?: string; precio_regular?: number | null; descuento?: number | null
  precio_vigente?: number | null; promocion?: boolean
  promo_hasta?: string | null; promo_solo_primera?: boolean
}
interface Producto {
  code: string; nombre: string; descripcion: string | null; tipo: string
  precio: number; creditos: number | null; vigencia_dias: number
  por_clase: number | null; vigente_hasta: string | null
  cupo_total: number | null; disponibles: number | null
}
interface Compra {
  purchase_id: string; code: string | null; producto: string; tipo: string
  precio: number; paid: boolean; status: string
  creditos_totales: number | null; creditos_usados: number
  restantes: number | null; ilimitado: boolean
  inicia: string | null; vence: string | null; vigente: boolean
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
  const [perfil, setPerfil] = useState<{ phone?: string; email?: string | null; since?: string; tomadas?: number; primera_disponible?: boolean } | null>(null)
  const [mine, setMine] = useState<MyBooking[]>([])
  const [info, setInfo] = useState<Info | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)

  // Cartelera: filtro por clase y cuántos días se muestran
  const [filtro, setFiltro] = useState<string | null>(null)
  const [dias, setDias] = useState(7)

  // Ventanas
  const [loginOpen, setLoginOpen] = useState(false)
  const [reservaOpen, setReservaOpen] = useState<{ slot: SlotDef; date: string } | null>(null)
  const [ticket, setTicket] = useState<MyBooking | null>(null)
  const [cuentaOpen, setCuentaOpen] = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [compraOpen, setCompraOpen] = useState<Producto | null>(null)
  const [ticketCompra, setTicketCompra] = useState<{ code: string; nombre: string; precio: number; creditos: number | null; vence: string | null; inicia_en_primera_clase: boolean } | null>(null)
  // Lo que la reserva devolvió sobre la compra que la cubrió, para el ticket
  const [ticketExtra, setTicketExtra] = useState<{ producto?: string | null; restantes?: number | null } | null>(null)

  // Un solo formulario para las dos rutas de reserva: cambia el botón que se
  // aprieta, no los campos.
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '' })
  // Cuentas de antes de las contraseñas: entran una vez con su nombre y aquí
  // se les pide crear una.
  const [pedirPassword, setPedirPassword] = useState(false)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [correoEdit, setCorreoEdit] = useState('')

  const hoy = new Date()

  const load = useCallback(async () => {
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 13)
    const [{ data: sch }, { data: oc }] = await Promise.all([
      supabase.rpc('fn_wellness_schedule', { p_code: code }),
      supabase.rpc('fn_wellness_occupancy', { p_code: code, p_from: iso(hoy), p_to: iso(hasta) }),
    ])
    setSlots((sch ?? []) as SlotDef[])
    setOcc((oc ?? []) as Occ[])
    supabase.rpc('fn_wellness_info', { p_code: code }).then(({ data }) => setInfo(data ?? null))
    // Sin wellness_productos.sql el RPC no existe y la sección simplemente no
    // aparece: el portal sigue vendiendo clase suelta como antes.
    supabase.rpc('fn_wellness_products', { p_code: code })
      .then(({ data }) => setProductos((data ?? []) as Producto[]))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])
  useEffect(() => { load() }, [load])

  const loadMine = useCallback(async () => {
    if (!token) { setMine([]); setMyName(''); setPerfil(null); setCompras([]); return }
    const { data } = await supabase.rpc('fn_wellness_me', { p_token: token })
    if (!data) { localStorage.removeItem(TOKEN_KEY); setToken(null); return }
    setMyName(data.name ?? '')
    setPerfil({ phone: data.phone, email: data.email, since: data.since, tomadas: data.tomadas, primera_disponible: data.primera_disponible })
    setCorreoEdit(data.email ?? '')
    setMine((data.bookings ?? []) as MyBooking[])
    setCompras((data.compras ?? []) as Compra[])
  }, [token])
  useEffect(() => { loadMine() }, [loadMine])

  // ── Precio ────────────────────────────────────────────────────────────────
  // El de lista es el que se anuncia. El descuento es de PRIMERA CLASE y con
  // fecha límite, así que no es "el precio": es una condición que se cumple o
  // no, y se evalúa contra la clase concreta que se está apartando.
  const regular = Number(info?.precio_regular) > 0 ? Number(info!.precio_regular) : null
  const conDescuento = Number(info?.precio_vigente) > 0 ? Number(info!.precio_vigente) : null
  const promoViva = !!info?.promocion && regular != null && conDescuento != null && conDescuento < regular
  const ahorro = promoViva ? regular! - conDescuento! : 0
  const promoHasta = info?.promo_hasta ?? null
  const soloPrimera = info?.promo_solo_primera !== false
  // Con sesión sabemos si ya la usó; sin sesión, quien está por registrarse
  // estrena cuenta y por definición es su primera.
  const primeraDisponible = token ? perfil?.primera_disponible !== false : true

  /** ¿Esta clase concreta califica para el descuento, con cuenta? */
  const aplicaDescuento = (fecha: string) =>
    promoViva && (!promoHasta || fecha <= promoHasta) && (!soloPrimera || primeraDisponible)

  const precioLista = (p: number) => regular ?? p

  // ── Cartelera ─────────────────────────────────────────────────────────────
  const clases = useMemo(
    () => [...new Set(slots.map(s => s.class))].sort((a, b) => a.localeCompare(b, 'es')),
    [slots])

  const proximas = useMemo(() => {
    const out: { slot: SlotDef; date: string; booked: number }[] = []
    for (let i = 0; i < dias; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i)
      for (const s of slots.filter(s => s.weekday === d.getDay())) {
        if (filtro && s.class !== filtro) continue
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
  }, [slots, occ, filtro, dias])

  const porDia = useMemo(() => {
    const m = new Map<string, typeof proximas>()
    for (const p of proximas) { const arr = m.get(p.date) ?? []; arr.push(p); m.set(p.date, arr) }
    return [...m.entries()]
  }, [proximas])

  const yaReserve = (slotId: string, date: string) =>
    mine.some(b => b.class_date === date && b.status !== 'cancelada'
      && proximas.some(p => p.slot.slot_id === slotId && p.date === date && p.slot.class === b.class && p.slot.start_time === b.start_time))

  const vigentes = mine.filter(b => b.status !== 'cancelada' && b.class_date >= iso(hoy))
  // Lo comprado que todavía sirve. Una compra agotada o vencida no se muestra:
  // ver "Paquete 5 · 0 restantes" no le dice nada útil a nadie.
  const vigentes_compras = compras.filter(c => c.vigente && (c.ilimitado || (c.restantes ?? 0) > 0))

  /**
   * ¿Alguna compra viva cubre una clase de ESTA fecha? La cobertura no es un
   * sí o un no global: un paquete que vence el 22 no cubre una clase del 25, y
   * la semana de prueba solo cubre sus siete días. Mostrar "incluida" en una
   * clase que sí se va a cobrar es prometer de más.
   */
  // La semana de prueba, si sigue en el catálogo, y si esta persona ya la usó.
  // Es "una vez por persona", así que basta con haberla comprado alguna vez.
  // Se resuelve en el render y no en el módulo, para que funcione igual si el
  // portal algún día navega sin recargar.
  const puedePagar = pagoEnLinea()

  const prueba = productos.find(p => p.tipo === 'prueba') ?? null
  const tienePrueba = compras.some(c => c.tipo === 'prueba')

  const cubreFecha = (fecha: string) => vigentes_compras.some(c =>
    (c.inicia == null || fecha >= c.inicia) && (c.vence == null || fecha <= c.vence))
  const pasadas = mine.filter(b => b.status !== 'cancelada' && b.class_date < iso(hoy))

  // ── Acciones ──────────────────────────────────────────────────────────────
  function abrirReserva(slot: SlotDef, date: string) {
    // Con sesión no hay nada que preguntar: se aparta y se muestra el ticket.
    if (token) { reservarConCuenta(slot, date); return }
    setF({ name: '', phone: '', email: '', password: '' })
    setReservaOpen({ slot, date })
  }

  async function reservarConCuenta(slot: SlotDef, date: string, tok = token) {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_book', { p_token: tok, p_slot: slot.slot_id, p_date: date })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    setReservaOpen(null)
    setTicketExtra({ producto: data.producto, restantes: data.restantes })
    setTicket({
      booking_id: data.booking_id, code: data.code, class: slot.class, class_date: date,
      start_time: slot.start_time, instructor: slot.instructor,
      status: 'reservada', paid: false, paid_via: null, amount: data.amount,
    })
    load(); loadMine()
  }

  /** Ruta CON cuenta: crea (o recupera) la cuenta y aparta. */
  async function registrarYApartar() {
    if (!reservaOpen) return
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_register', {
      p_name: f.name, p_phone: f.phone, p_email: f.email, p_password: f.password,
    })
    if (data?.error) { setBusy(false); setMsg({ text: data.error, error: true }); return }
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setBusy(false)
    await reservarConCuenta(reservaOpen.slot, reservaOpen.date, data.token)
  }

  /** Ruta SIN cuenta: aparta al precio de lista y no entrega acceso. */
  async function apartarSinCuenta() {
    if (!reservaOpen) return
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_book_guest', {
      p_name: f.name, p_phone: f.phone, p_slot: reservaOpen.slot.slot_id, p_date: reservaOpen.date,
    })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    const { slot, date } = reservaOpen
    setReservaOpen(null)
    setTicketExtra(null)
    setTicket({
      booking_id: data.booking_id, code: data.code, class: slot.class, class_date: date,
      start_time: slot.start_time, instructor: slot.instructor,
      status: 'reservada', paid: false, paid_via: null, amount: data.amount,
    })
    load()
  }

  // ── Comprar ───────────────────────────────────────────────────────────────
  // Comprar EXIGE cuenta: un paquete de 10 clases sin dónde consultarlo es una
  // promesa que nadie puede cobrar. Si no hay sesión, se pide el registro en la
  // misma ventana, igual que al apartar.
  function abrirCompra(prod: Producto) {
    if (token) { comprar(prod); return }
    setF({ name: '', phone: '', email: '', password: '' })
    setCompraOpen(prod)
  }

  async function comprar(prod: Producto, tok = token) {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_buy', { p_token: tok, p_venue: code, p_product: prod.code })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    setCompraOpen(null)
    setTicketCompra({
      code: data.code, nombre: data.nombre, precio: Number(data.precio),
      creditos: data.creditos ?? null, vence: data.vence ?? null,
      inicia_en_primera_clase: !!data.inicia_en_primera_clase,
    })
    load(); loadMine()
  }

  async function registrarYComprar() {
    if (!compraOpen) return
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_register', {
      p_name: f.name, p_phone: f.phone, p_email: f.email, p_password: f.password,
    })
    if (data?.error) { setBusy(false); setMsg({ text: data.error, error: true }); return }
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setBusy(false)
    await comprar(compraOpen, data.token)
  }

  async function entrar() {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_login', { p_phone: f.phone, p_password: f.password })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    if (data?.nuevo) {
      setMsg({ text: 'Ese teléfono todavía no tiene cuenta. Se crea la primera vez que apartas una clase.', error: true })
      return
    }
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setLoginOpen(false)
    // Cuenta de antes de las contraseñas: entró con su nombre y ahora se le
    // pide una. Mientras no la cree, su cuenta sigue abriéndose con un dato
    // que cualquiera que la conozca puede adivinar.
    if (data.sin_password) { setPedirPassword(true); setNuevaPassword('') }
    setMsg({ text: `Qué gusto verte, ${String(data.name).split(' ')[0]}.` })
  }

  async function guardarPassword() {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_set_password', { p_token: token, p_password: nuevaPassword })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    setPedirPassword(false); setNuevaPassword('')
    setMsg({ text: 'Listo — tu contraseña quedó guardada.' })
  }

  async function guardarCorreo() {
    setBusy(true)
    const { data } = await supabase.rpc('fn_wellness_update_me', { p_token: token, p_email: correoEdit })
    setBusy(false)
    if (data?.error) { setMsg({ text: data.error, error: true }); return }
    setPerfil(p => p ? { ...p, email: data.email } : p)
    setMsg({ text: 'Correo actualizado.' })
  }

  async function pagar(b: MyBooking) {
    setBusy(true)
    // Sin `finally`: en el camino bueno la pestaña se va a Blumon, y liberar el
    // botón justo antes de irse deja una rendija para un segundo clic — que
    // sería un segundo cobro iniciado. Solo se libera cuando algo falló y la
    // persona sigue aquí.
    const { data, error } = await supabase.functions.invoke('wellness-pay', { body: { token, booking_id: b.booking_id } })
    let payload = data as { pay_url?: string; error?: string } | null
    if (error && !payload) {
      try { payload = await (error as { context?: Response }).context?.json() ?? null } catch { payload = null }
    }
    if (!payload?.pay_url) {
      setBusy(false)
      setMsg({ text: payload?.error ?? `El pago en línea no está disponible ahorita — puedes pagar en ${LUGAR.pisoCaja}.`, error: true })
      return
    }
    // MISMA PESTAÑA, no window.open. El navegador solo permite abrir una
    // ventana si es reacción inmediata a un clic, y aquí ya esperamos la
    // respuesta de Blumon: para cuando llega, el gesto del usuario venció y el
    // bloqueador de pop-ups la mata. La persona se queda mirando un botón que
    // no hizo nada, con el cobro ya iniciado del otro lado.
    //
    // Navegar en la misma pestaña no se puede bloquear, y el regreso ya está
    // resuelto: Blumon devuelve al portal por action=return.
    window.location.assign(payload.pay_url)
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
  const fmtDia = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return `${DIAS[d.getDay()]} ${d.getDate()}`
  }
  const fmtCorto = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return `${d.getDate()} ${d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`
  }
  const fmtHasta = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return `${d.getDate()} de ${d.toLocaleDateString('es-MX', { month: 'long' })}`
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', minHeight: 52, background: CREAM[300], border: `1px solid ${CREAM[600]}`,
    borderRadius: 12, padding: '0 14px', fontSize: 16, color: OBSIDIAN[500], outline: 'none',
    boxSizing: 'border-box', fontFamily: POPPINS, fontWeight: 300,
  }
  const tarjeta: React.CSSProperties = {
    background: CREAM[300], border: `1px solid ${CREAM[600]}`, borderRadius: 16,
  }
  const rotulo: React.CSSProperties = {
    fontFamily: PLEX, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.13em', color: OBSIDIAN[100], margin: '0 0 9px',
  }
  const btn: React.CSSProperties = {
    minHeight: 52, borderRadius: 999, border: 'none', background: OBSIDIAN[500], color: CREAM[500],
    fontFamily: PLEX, fontSize: 15.5, fontWeight: 600, cursor: 'pointer', width: '100%',
  }
  const camposReserva = f.name.trim().length >= 3 && f.phone.trim().length >= 10
  // Crear cuenta pide además contraseña; entrar solo teléfono + contraseña.
  const camposCuenta = camposReserva && f.password.length >= 6
  const camposLogin = f.phone.trim().length >= 10 && f.password.length >= 1

  return (
    <div style={{ minHeight: '100vh', background: CREAM[500], color: OBSIDIAN[500], fontFamily: POPPINS }}>

      {/* ── BARRA DE LA SEMANA DE PRUEBA ── Pegada arriba en todo el scroll.
          Es la pieza que hace funcionar el resto del embudo, así que no puede
          vivir enterrada al final de la página. Desaparece para quien ya la
          compró: seguir ofreciéndosela sería ruido, y comprarla dos veces no
          se puede. */}
      {prueba && !tienePrueba && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 40, background: OBSIDIAN[500],
          padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: PLEX, fontSize: 13.5, fontWeight: 600, color: CREAM[500], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Semana de prueba · {mxn(prueba.precio)}
            </div>
            <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 11.5, color: 'rgba(239,239,224,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              7 días de clases ilimitadas
            </div>
          </div>
          <button onClick={() => abrirCompra(prueba)} disabled={busy}
            style={{ flexShrink: 0, minHeight: 38, padding: '0 16px', borderRadius: 999, border: 'none', background: CREAM[500], color: OBSIDIAN[500], fontFamily: PLEX, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            La quiero
          </button>
        </div>
      )}

      {/* ── PORTADA ── Mínima: quién, dónde, cuánto. Y la puerta de entrada a
          la cuenta, que antes no existía en ningún lado. */}
      <header style={{ background: WELLNESS_GRADIENT, padding: '18px 18px 26px' }}>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <PodWellnessLogo size="clamp(15px, 4.4vw, 21px)" color={CREAM[500]} />
            <button onClick={() => (token ? setCuentaOpen(v => !v) : (setF({ name: '', phone: '', email: '', password: '' }), setLoginOpen(true)))}
              style={{ flexShrink: 0, minHeight: 38, padding: '0 15px', borderRadius: 999, background: 'rgba(239,239,224,0.16)', border: '1px solid rgba(239,239,224,0.35)', color: CREAM[500], fontFamily: PLEX, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {token ? `Hola, ${myName.split(' ')[0]}` : 'Entrar'}
            </button>
          </div>

          <p style={{ fontFamily: PLEX, fontWeight: 300, fontSize: 11.5, letterSpacing: '0.18em', color: 'rgba(239,239,224,0.72)', margin: '22px 0 0' }}>
            {LUGAR.calle.toUpperCase()} · {LUGAR.colonia.toUpperCase()}
          </p>
          <h1 style={{ fontFamily: POPPINS, fontSize: 'clamp(25px, 7.4vw, 34px)', fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.12, color: CREAM[500], margin: '8px 0 0' }}>
            Yoga y Pilates<br />en la Condesa
          </h1>

          {/* El precio de la clase suelta ya no va en la portada: la barra fija
              de arriba lleva la oferta de entrada, y el precio por clase se ve
              en cada renglón de la cartelera y en la sección de paquetes.
              Repetirlo aquí solo alargaba la portada. */}
          {/* La promoción solo se anuncia a quien todavía puede usarla: a quien
              ya tiene cuenta y ya la gastó, ofrecerle "tu primera clase con
              descuento" es prometer algo que no va a recibir en la caja. */}
          {promoViva && primeraDisponible && (
            <p style={{ fontFamily: PLEX, fontWeight: 300, fontSize: 13, color: 'rgba(239,239,224,0.85)', margin: '7px 0 0' }}>
              Tu primera clase <strong style={{ fontWeight: 600, color: CREAM[500] }}>{mxn(conDescuento!)}</strong>
              {token ? '' : ' si creas cuenta'}
              {promoHasta ? <> — hasta el {fmtHasta(promoHasta)}</> : null}.
            </p>
          )}

          <a href={LUGAR.mapa} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 16, fontFamily: PLEX, fontSize: 13, color: CREAM[500], textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {LUGAR.calle} · Cómo llegar
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 620, margin: '0 auto', padding: '20px 18px 56px' }}>

        {msg && (
          <div onClick={() => setMsg(null)} style={{ padding: '12px 15px', borderRadius: 12, marginBottom: 16, cursor: 'pointer', fontFamily: POPPINS, fontWeight: 300, background: msg.error ? '#F7E9E4' : 'rgba(29,158,117,0.10)', border: `1px solid ${msg.error ? '#DFB6A8' : 'rgba(29,158,117,0.35)'}`, color: msg.error ? '#7A2E1B' : '#0F5B43', fontSize: 14, lineHeight: 1.5 }}>
            {msg.text}
          </div>
        )}

        {/* ── MI CUENTA ── Se abre desde el botón de arriba, no ocupa espacio. */}
        {token && cuentaOpen && (
          <section style={{ ...tarjeta, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontFamily: POPPINS, fontWeight: 300, fontSize: 13 }}>
              <span><span style={{ color: OBSIDIAN[100] }}>Teléfono</span><br /><strong style={{ fontWeight: 600 }}>{perfil?.phone ?? '—'}</strong></span>
              <span><span style={{ color: OBSIDIAN[100] }}>Clases tomadas</span><br /><strong style={{ fontWeight: 600 }}>{perfil?.tomadas ?? 0}</strong></span>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontFamily: PLEX, fontSize: 11.5, color: OBSIDIAN[100], marginBottom: 5 }}>
                Correo {perfil?.email ? '' : '— para tu comprobante'}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={correoEdit} onChange={e => setCorreoEdit(e.target.value)} placeholder="tucorreo@ejemplo.com"
                  type="email" inputMode="email" style={inp} onKeyDown={e => { if (e.key === 'Enter') guardarCorreo() }} />
                <button onClick={guardarCorreo} disabled={busy || correoEdit === (perfil?.email ?? '')}
                  style={{ minHeight: 52, padding: '0 16px', borderRadius: 999, border: 'none', background: correoEdit !== (perfil?.email ?? '') ? ESPACIO.wellness : CREAM[600], color: correoEdit !== (perfil?.email ?? '') ? CREAM[500] : OBSIDIAN[100], fontFamily: PLEX, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Guardar
                </button>
              </div>
            </div>
            {pasadas.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <button onClick={() => setHistorialOpen(v => !v)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: PLEX, fontSize: 13, fontWeight: 600, color: ESPACIO.wellness }}>
                  {historialOpen ? 'Ocultar historial' : `Ver mis ${pasadas.length} ${pasadas.length === 1 ? 'clase anterior' : 'clases anteriores'}`}
                </button>
                {historialOpen && (
                  <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {pasadas.map(b => (
                      <li key={b.booking_id} style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontFamily: POPPINS, fontWeight: 300, fontSize: 13 }}>
                        <span style={{ fontFamily: PLEX, fontVariantNumeric: 'tabular-nums', minWidth: 52, color: OBSIDIAN[100] }}>{fmtCorto(b.class_date)}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>{b.class}</span>
                        <span style={{ fontFamily: PLEX, fontSize: 11.5, color: b.status === 'asistio' ? ESPACIO.wellness : OBSIDIAN[100] }}>
                          {b.status === 'asistio' ? 'Asististe' : b.status === 'no_asistio' ? 'No fuiste' : 'Reservada'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <button onClick={() => { setNuevaPassword(''); setPedirPassword(true) }}
              style={{ marginTop: 14, display: 'block', background: 'none', border: 'none', padding: 0, color: ESPACIO.wellness, fontFamily: PLEX, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cambiar mi contraseña
            </button>
            <button onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setCuentaOpen(false) }}
              style={{ marginTop: 14, background: 'none', border: 'none', padding: 0, color: OBSIDIAN[100], fontFamily: PLEX, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
              Salir en este dispositivo
            </button>
          </section>
        )}

        {/* ── LO QUE TIENES ── Antes de la cartelera: si ya compraste, lo
            primero que quieres saber es cuántas clases te quedan. */}
        {token && vigentes_compras.length > 0 && (
          <section style={{ marginBottom: 22 }}>
            <h2 style={rotulo}>Lo que tienes</h2>
            {vigentes_compras.map(c => (
              <div key={c.purchase_id} style={{ ...tarjeta, padding: '12px 15px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: PLEX, fontSize: 15, fontWeight: 600 }}>{c.producto}</div>
                  <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12.5, color: OBSIDIAN[100] }}>
                    {c.ilimitado
                      ? <>Ilimitado{c.vence ? ` · hasta el ${fmtCorto(c.vence)}` : ' · arranca en tu primera clase'}</>
                      : <>{c.restantes} de {c.creditos_totales} clases{c.vence ? ` · hasta el ${fmtCorto(c.vence)}` : ''}</>}
                    {!c.paid && ' · por pagar en caja'}
                  </div>
                </div>
                {!c.ilimitado && (
                  <div style={{ fontFamily: PLEX, fontSize: 22, fontWeight: 700, color: ESPACIO.wellness, flexShrink: 0 }}>
                    {c.restantes}
                  </div>
                )}
                {c.code && (
                  <span style={{ fontFamily: PLEX, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: ESPACIO.wellness, background: 'rgba(29,158,117,0.10)', border: '1px solid rgba(29,158,117,0.3)', borderRadius: 999, padding: '6px 11px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {c.code}
                  </span>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── MIS PRÓXIMAS CLASES ── Lo que buscas al volver: tu código. */}
        {token && vigentes.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2 style={rotulo}>Mis próximas clases</h2>
            {vigentes.map(b => (
              <div key={b.booking_id} style={{ ...tarjeta, padding: '12px 15px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: PLEX, fontSize: 15, fontWeight: 600 }}>{b.class}</div>
                  <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12.5, color: OBSIDIAN[100] }}>
                    {fmtDia(b.class_date)} · {b.start_time}
                  </div>
                </div>
                <button onClick={() => setTicket(b)}
                  style={{ background: 'rgba(29,158,117,0.10)', border: '1px solid rgba(29,158,117,0.3)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer', fontFamily: PLEX, fontSize: 13.5, fontWeight: 700, letterSpacing: '0.04em', color: ESPACIO.wellness, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {b.code ?? 'Ver'}
                </button>
              </div>
            ))}
          </section>
        )}

        {/* ── FILTRO POR CLASE ── */}
        {clases.length > 1 && (
          <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4, marginBottom: 14, scrollbarWidth: 'none' }}>
            {[null, ...clases].map(c => {
              const on = filtro === c
              return (
                <button key={c ?? '·todas'} onClick={() => setFiltro(c)}
                  style={{ flexShrink: 0, minHeight: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: PLEX, fontSize: 13, fontWeight: on ? 600 : 400, border: `1px solid ${on ? OBSIDIAN[500] : CREAM[600]}`, background: on ? OBSIDIAN[500] : 'transparent', color: on ? CREAM[500] : OBSIDIAN[200] }}>
                  {c ?? 'Todas'}
                </button>
              )
            })}
          </div>
        )}

        {/* ── CARTELERA ── */}
        {loading ? (
          <p style={{ textAlign: 'center', color: OBSIDIAN[100], fontWeight: 300 }}>Cargando horarios…</p>
        ) : porDia.length === 0 ? (
          <p style={{ textAlign: 'center', color: OBSIDIAN[100], fontWeight: 300, padding: '20px 0' }}>
            {filtro ? `No hay ${filtro} en los próximos ${dias} días.` : 'Sin clases programadas por ahora.'}
          </p>
        ) : porDia.map(([date, rows]) => (
          <section key={date} style={{ marginBottom: 18 }}>
            <h3 style={rotulo}>{date === iso(hoy) ? 'Hoy' : fmtDia(date)}</h3>
            {rows.map(({ slot, booked }) => {
              const libres = slot.capacity - booked
              const lleno = libres <= 0
              const reservada = yaReserve(slot.slot_id, date)
              return (
                <div key={slot.slot_id + date} style={{ ...tarjeta, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', marginBottom: 7 }}>
                  <div style={{ fontFamily: PLEX, fontSize: 15.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', minWidth: 44 }}>
                    {slot.start_time}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: PLEX, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {slot.class}
                    </div>
                    <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12, color: lleno ? '#8C2F1F' : OBSIDIAN[100], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {slot.instructor ? `${slot.instructor} · ` : ''}
                      {lleno
                        ? 'Llena'
                        : libres <= 3
                          ? `quedan ${libres}`
                          : cubreFecha(date)
                            // Con paquete o membresía vigente esta clase no se
                            // cobra: enseñar $300 haría dudar de lo ya pagado.
                            ? <span style={{ color: ESPACIO.wellness, fontWeight: 600 }}>Incluida</span>
                            : mxn(precioLista(slot.price))}
                    </div>
                  </div>
                  <button disabled={lleno || reservada || busy} onClick={() => abrirReserva(slot, date)}
                    style={{ minHeight: 40, padding: '0 15px', borderRadius: 999, border: reservada ? `1px solid ${ESPACIO.wellness}` : 'none', fontFamily: PLEX, fontSize: 13, fontWeight: 600, cursor: lleno || reservada ? 'default' : 'pointer', background: reservada ? 'rgba(29,158,117,0.10)' : lleno ? CREAM[600] : OBSIDIAN[500], color: reservada ? ESPACIO.wellness : lleno ? OBSIDIAN[100] : CREAM[500], flexShrink: 0 }}>
                    {reservada ? 'Voy' : lleno ? 'Llena' : 'Reservar'}
                  </button>
                </div>
              )
            })}
          </section>
        ))}

        {dias < 14 && !loading && porDia.length > 0 && (
          <button onClick={() => setDias(14)}
            style={{ width: '100%', minHeight: 46, borderRadius: 999, border: `1px solid ${CREAM[600]}`, background: 'none', color: OBSIDIAN[200], fontFamily: PLEX, fontSize: 13.5, cursor: 'pointer', marginTop: 4 }}>
            Ver dos semanas
          </button>
        )}

        {/* ── PAQUETES Y MEMBRESÍAS ── Va DESPUÉS de la cartelera: primero se
            ve que hay clases a las que se quiere ir, y solo entonces tiene
            sentido comprar diez. */}
        {productos.length > 0 && (
          <section style={{ marginTop: 30 }}>
            <h2 style={rotulo}>Ven más seguido y paga menos</h2>
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13.5, color: OBSIDIAN[100], lineHeight: 1.55, margin: '0 0 12px' }}>
              La clase suelta cuesta {regular != null ? mxn(regular) : '—'}. Estas opciones bajan el precio por clase.
            </p>
            {productos.map(prod => {
              const yaLoTiene = compras.some(c => c.producto === prod.nombre && c.vigente)
              const quedan = prod.disponibles
              return (
                <div key={prod.code} style={{ ...tarjeta, padding: '14px 15px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: PLEX, fontSize: 15.5, fontWeight: 600 }}>{prod.nombre}</div>
                      {prod.descripcion && (
                        <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12.5, color: OBSIDIAN[100], marginTop: 2, lineHeight: 1.5 }}>
                          {prod.descripcion}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: POPPINS, fontSize: 18, fontWeight: 700 }}>{mxn(prod.precio)}</div>
                      {prod.tipo === 'membresia' && (
                        <div style={{ fontFamily: PLEX, fontSize: 11, color: OBSIDIAN[100] }}>al mes</div>
                      )}
                      {prod.por_clase != null && (
                        <div style={{ fontFamily: PLEX, fontSize: 11, color: ESPACIO.wellness }}>{mxn(prod.por_clase)} por clase</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
                    {/* El contador de fundadores sale de la base: "quedan 6" es
                        argumento de venta y tiene que ser verdad. */}
                    {quedan != null && (
                      <span style={{ fontFamily: PLEX, fontSize: 12, fontWeight: 600, color: quedan <= 5 ? '#8A6206' : OBSIDIAN[100] }}>
                        {quedan === 1 ? 'Queda 1 lugar' : `Quedan ${quedan} lugares`}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <button onClick={() => abrirCompra(prod)} disabled={busy || yaLoTiene}
                      style={{ minHeight: 42, padding: '0 18px', borderRadius: 999, border: 'none', fontFamily: PLEX, fontSize: 13.5, fontWeight: 600, cursor: yaLoTiene ? 'default' : 'pointer', background: yaLoTiene ? CREAM[600] : OBSIDIAN[500], color: yaLoTiene ? OBSIDIAN[100] : CREAM[500], flexShrink: 0 }}>
                      {yaLoTiene ? 'Ya lo tienes' : 'Comprar'}
                    </button>
                  </div>
                </div>
              )
            })}
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12, color: OBSIDIAN[100], lineHeight: 1.6, marginTop: 10 }}>
              Compras aquí y pagas con tu código en la caja de {LUGAR.pisoCaja}. Puedes cancelar una clase hasta 4 horas antes sin perderla.
            </p>
          </section>
        )}

        {/* ── CÓMO LLEGAR ── Compacto, pero con los dos pisos: es lo que más
            confunde a quien viene por primera vez. */}
        <section style={{ ...tarjeta, padding: 16, marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <PodIcon size={24} color={ESPACIO.wellness} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: PLEX, fontSize: 15.5, fontWeight: 700 }}>{LUGAR.nombre}</div>
              <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[100] }}>{LUGAR.calle}, {LUGAR.colonia}</div>
            </div>
            <a href={LUGAR.mapa} target="_blank" rel="noopener noreferrer"
              style={{ flexShrink: 0, minHeight: 40, display: 'flex', alignItems: 'center', padding: '0 15px', borderRadius: 999, background: ESPACIO.wellness, color: CREAM[500], fontFamily: PLEX, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Mapa
            </a>
          </div>
          <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[200], lineHeight: 1.6, margin: '13px 0 0' }}>
            Las clases son en el <strong style={{ fontWeight: 600 }}>{LUGAR.pisoEstudio}</strong>. Pagas con tu código en la caja de <strong style={{ fontWeight: 600 }}>{LUGAR.pisoCaja}</strong>.
          </p>
        </section>
      </main>

      {/* ── RESERVA ── Aquí y solo aquí se piden datos, y aquí aparece el
          descuento: con cuenta o sin cuenta, con la diferencia a la vista. */}
      {reservaOpen && (() => {
        const conDesc = aplicaDescuento(reservaOpen.date)
        const precioCuenta = conDesc ? conDescuento! : precioLista(reservaOpen.slot.price)
        const precioInvitado = precioLista(reservaOpen.slot.price)
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50, overflowY: 'auto' }}>
            <div style={{ background: CREAM[500], borderRadius: 20, padding: 22, width: '100%', maxWidth: 400, margin: 'auto' }}>
              <div style={{ fontFamily: PLEX, fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>{reservaOpen.slot.class}</div>
              <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 14, color: OBSIDIAN[100], marginTop: 3 }}>
                {fmtFecha(reservaOpen.date)} · {reservaOpen.slot.start_time}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
                <input value={f.name} onChange={e => setF(v => ({ ...v, name: e.target.value }))}
                  placeholder="Tu nombre" autoComplete="name" style={inp} autoFocus />
                <input value={f.phone} onChange={e => setF(v => ({ ...v, phone: e.target.value }))}
                  placeholder="Tu teléfono (10 dígitos)" type="tel" inputMode="numeric" autoComplete="tel" style={inp} />
                <input value={f.email} onChange={e => setF(v => ({ ...v, email: e.target.value }))}
                  placeholder="Tu correo (opcional)" type="email" inputMode="email" autoComplete="email" style={inp} />
                <input value={f.password} onChange={e => setF(v => ({ ...v, password: e.target.value }))}
                  placeholder="Crea una contraseña (6+ caracteres)" type="password" autoComplete="new-password" style={inp} />
              </div>

              {/* Con cuenta primero: es la opción que queremos que tomen, y con
                  descuento vigente es además la más barata. */}
              <button onClick={registrarYApartar} disabled={busy || !camposCuenta}
                style={{ ...btn, marginTop: 16, opacity: busy || !camposCuenta ? 0.45 : 1 }}>
                {busy ? 'Un momento…' : `Crear cuenta y apartar · ${mxn(precioCuenta)}`}
              </button>
              <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12.5, color: OBSIDIAN[100], lineHeight: 1.55, margin: '8px 0 0', textAlign: 'center' }}>
                {conDesc
                  ? <>Ahorras {mxn(ahorro)} en esta clase{soloPrimera ? ' — es el descuento de primera clase' : ''}. Guardas tus reservas y tu código.</>
                  : 'Guardas tus reservas, tu código y tu historial de clases.'}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
                <span style={{ flex: 1, height: 1, background: CREAM[600] }} />
                <span style={{ fontFamily: PLEX, fontSize: 11.5, color: OBSIDIAN[100] }}>o</span>
                <span style={{ flex: 1, height: 1, background: CREAM[600] }} />
              </div>

              <button onClick={apartarSinCuenta} disabled={busy || !camposReserva}
                style={{ ...btn, background: 'none', border: `1px solid ${CREAM[600]}`, color: OBSIDIAN[500], fontWeight: 400, opacity: busy || !camposReserva ? 0.45 : 1 }}>
                Apartar sin cuenta · {mxn(precioInvitado)}
              </button>

              <button onClick={() => setReservaOpen(null)}
                style={{ width: '100%', minHeight: 40, background: 'none', border: 'none', color: OBSIDIAN[100], fontFamily: PLEX, fontSize: 13, cursor: 'pointer', marginTop: 8 }}>
                Ahora no
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── ENTRAR ── */}
      {loginOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50, overflowY: 'auto' }}>
          <div style={{ background: CREAM[500], borderRadius: 20, padding: 22, width: '100%', maxWidth: 380, margin: 'auto' }}>
            <PodIcon size={32} color={ESPACIO.wellness} />
            <h3 style={{ fontFamily: POPPINS, fontSize: 21, fontWeight: 800, margin: '13px 0 5px', letterSpacing: '-0.01em' }}>Entra a tus clases</h3>
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13.5, color: OBSIDIAN[100], margin: '0 0 16px', lineHeight: 1.55 }}>
              Con tu teléfono y tu contraseña. Aquí ves tus reservas, tus códigos, tus paquetes y a qué clases has ido.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={f.phone} onChange={e => setF(v => ({ ...v, phone: e.target.value }))}
                placeholder="Tu teléfono (10 dígitos)" type="tel" inputMode="numeric" autoComplete="tel" style={inp} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') entrar() }} />
              <input value={f.password} onChange={e => setF(v => ({ ...v, password: e.target.value }))}
                placeholder="Tu contraseña" type="password" autoComplete="current-password" style={inp}
                onKeyDown={e => { if (e.key === 'Enter') entrar() }} />
              <button onClick={entrar} disabled={busy || !camposLogin}
                style={{ ...btn, opacity: busy || !camposLogin ? 0.45 : 1 }}>
                {busy ? 'Un momento…' : 'Entrar'}
              </button>
              <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12, color: OBSIDIAN[100], lineHeight: 1.55, margin: 0, textAlign: 'center' }}>
                ¿Se te olvidó? Pídenos que te la repongamos en el estudio.
              </p>
              <button onClick={() => setLoginOpen(false)}
                style={{ minHeight: 40, background: 'none', border: 'none', color: OBSIDIAN[100], fontFamily: PLEX, fontSize: 13, cursor: 'pointer' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPRAR SIN SESIÓN ── Mismo formulario que al apartar. */}
      {compraOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 55, overflowY: 'auto' }}>
          <div style={{ background: CREAM[500], borderRadius: 20, padding: 22, width: '100%', maxWidth: 400, margin: 'auto' }}>
            <div style={{ fontFamily: PLEX, fontSize: 19, fontWeight: 700 }}>{compraOpen.nombre}</div>
            <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 14, color: OBSIDIAN[100], marginTop: 3, lineHeight: 1.5 }}>
              {mxn(compraOpen.precio)}
              {compraOpen.por_clase != null ? ` · ${mxn(compraOpen.por_clase)} por clase` : ''}
              {compraOpen.tipo === 'membresia' ? ' al mes' : ''}
            </div>
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13.5, color: OBSIDIAN[100], margin: '14px 0 0', lineHeight: 1.55 }}>
              Para comprarlo necesitas cuenta — es donde vas a ver cuántas clases te quedan y tu código.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              <input value={f.name} onChange={e => setF(v => ({ ...v, name: e.target.value }))}
                placeholder="Tu nombre" autoComplete="name" style={inp} autoFocus />
              <input value={f.phone} onChange={e => setF(v => ({ ...v, phone: e.target.value }))}
                placeholder="Tu teléfono (10 dígitos)" type="tel" inputMode="numeric" autoComplete="tel" style={inp} />
              <input value={f.email} onChange={e => setF(v => ({ ...v, email: e.target.value }))}
                placeholder="Tu correo (opcional)" type="email" inputMode="email" autoComplete="email" style={inp} />
              <input value={f.password} onChange={e => setF(v => ({ ...v, password: e.target.value }))}
                placeholder="Crea una contraseña (6+ caracteres)" type="password" autoComplete="new-password" style={inp} />
              <button onClick={registrarYComprar} disabled={busy || !camposCuenta}
                style={{ ...btn, marginTop: 4, opacity: busy || !camposCuenta ? 0.45 : 1 }}>
                {busy ? 'Un momento…' : `Crear cuenta y comprar · ${mxn(compraOpen.precio)}`}
              </button>
              <button onClick={() => setCompraOpen(null)}
                style={{ minHeight: 40, background: 'none', border: 'none', color: OBSIDIAN[100], fontFamily: PLEX, fontSize: 13, cursor: 'pointer' }}>
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREAR CONTRASEÑA ── Para las cuentas de antes de que existieran. */}
      {pedirPassword && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 58, overflowY: 'auto' }}>
          <div style={{ background: CREAM[500], borderRadius: 20, padding: 22, width: '100%', maxWidth: 380, margin: 'auto' }}>
            <PodIcon size={32} color={ESPACIO.wellness} />
            <h3 style={{ fontFamily: POPPINS, fontSize: 21, fontWeight: 800, margin: '13px 0 5px', letterSpacing: '-0.01em' }}>Crea tu contraseña</h3>
            <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13.5, color: OBSIDIAN[100], margin: '0 0 16px', lineHeight: 1.55 }}>
              Tu cuenta es de antes de que existieran las contraseñas y ahora guarda tus paquetes. Ponle una para que solo tú entres.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={nuevaPassword} onChange={e => setNuevaPassword(e.target.value)}
                placeholder="Contraseña (6+ caracteres)" type="password" autoComplete="new-password" style={inp} autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && nuevaPassword.length >= 6) guardarPassword() }} />
              <button onClick={guardarPassword} disabled={busy || nuevaPassword.length < 6}
                style={{ ...btn, opacity: busy || nuevaPassword.length < 6 ? 0.45 : 1 }}>
                {busy ? 'Un momento…' : 'Guardar'}
              </button>
              <button onClick={() => setPedirPassword(false)}
                style={{ minHeight: 40, background: 'none', border: 'none', color: OBSIDIAN[100], fontFamily: PLEX, fontSize: 13, cursor: 'pointer' }}>
                Luego
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TICKET DE COMPRA ── */}
      {ticketCompra && (
        <div onClick={() => setTicketCompra(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: CREAM[300], borderRadius: 20, width: '100%', maxWidth: 370, overflow: 'hidden', margin: 'auto' }}>
            <div style={{ background: WELLNESS_GRADIENT, padding: '18px 22px 16px', textAlign: 'center' }}>
              <PodWellnessLogo size={15} color={CREAM[500]} />
              <p style={{ fontFamily: PLEX, fontSize: 11, letterSpacing: '0.14em', color: 'rgba(239,239,224,0.8)', margin: '11px 0 0' }}>
                COMPRA REGISTRADA
              </p>
            </div>
            <div style={{ padding: '18px 22px 22px' }}>
              <div style={{ fontFamily: PLEX, fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{ticketCompra.nombre}</div>
              <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 14, color: OBSIDIAN[200], marginTop: 3 }}>
                {ticketCompra.creditos != null
                  ? `${ticketCompra.creditos} clases`
                  : 'Clases ilimitadas'}
                {ticketCompra.vence
                  ? ` · vence el ${fmtCorto(ticketCompra.vence)}`
                  : ticketCompra.inicia_en_primera_clase ? ' · arranca en tu primera clase' : ''}
              </div>

              <div style={{ margin: '16px 0', padding: '15px 14px', borderRadius: 14, background: CREAM[500], border: `1px dashed ${ESPACIO.wellness}`, textAlign: 'center' }}>
                <div style={{ fontFamily: PLEX, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: OBSIDIAN[100] }}>Código de tu compra</div>
                <div style={{ fontFamily: PLEX, fontSize: 29, fontWeight: 700, letterSpacing: '0.08em', color: ESPACIO.wellness, marginTop: 4 }}>
                  {ticketCompra.code}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: POPPINS, fontSize: 14, fontWeight: 300 }}>
                <span style={{ color: OBSIDIAN[100] }}>Total a pagar</span>
                <strong style={{ fontSize: 21, fontWeight: 700 }}>{mxn(ticketCompra.precio)}</strong>
              </div>

              <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[200], margin: '14px 0 0', lineHeight: 1.55, padding: '12px 14px', borderRadius: 12, background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.25)' }}>
                Paga en la caja de <strong style={{ fontWeight: 600 }}>{LUGAR.pisoCaja}</strong> con este código. Ya puedes apartar tus clases desde ahora — no se te cobra otra vez.
              </p>

              <button onClick={() => setTicketCompra(null)} style={{ ...btn, marginTop: 14 }}>Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TICKET ── El comprobante que se enseña en caja. */}
      {ticket && (
        <div onClick={() => setTicket(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: CREAM[300], borderRadius: 20, width: '100%', maxWidth: 370, overflow: 'hidden', margin: 'auto' }}>
            <div style={{ background: WELLNESS_GRADIENT, padding: '18px 22px 16px', textAlign: 'center' }}>
              <PodWellnessLogo size={15} color={CREAM[500]} />
              <p style={{ fontFamily: PLEX, fontSize: 11, letterSpacing: '0.14em', color: 'rgba(239,239,224,0.8)', margin: '11px 0 0' }}>
                TU LUGAR ESTÁ APARTADO
              </p>
            </div>
            <div style={{ padding: '18px 22px 22px' }}>
              <div style={{ fontFamily: PLEX, fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{ticket.class}</div>
              <div style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 14, color: OBSIDIAN[200], marginTop: 3 }}>
                {fmtFecha(ticket.class_date)} · {ticket.start_time}
                {ticket.instructor ? ` · ${ticket.instructor}` : ''}
              </div>

              <div style={{ margin: '16px 0', padding: '15px 14px', borderRadius: 14, background: CREAM[500], border: `1px dashed ${ESPACIO.wellness}`, textAlign: 'center' }}>
                <div style={{ fontFamily: PLEX, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: OBSIDIAN[100] }}>Código de tu reserva</div>
                <div style={{ fontFamily: PLEX, fontSize: 29, fontWeight: 700, letterSpacing: '0.08em', color: ESPACIO.wellness, marginTop: 4 }}>
                  {ticket.code ?? '—'}
                </div>
              </div>

              {/* Cubierta por un paquete o membresía: no se cobra nada, y lo
                  que la persona quiere saber es cuántas le quedan. */}
              {Number(ticket.amount) === 0 && ticketExtra?.producto ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontFamily: POPPINS, fontSize: 14, fontWeight: 300 }}>
                  <span style={{ color: OBSIDIAN[100] }}>Con tu {ticketExtra.producto}</span>
                  <strong style={{ fontSize: 15, fontWeight: 700, color: ESPACIO.wellness, textAlign: 'right' }}>
                    {ticketExtra.restantes == null ? 'Sin costo' : `Te quedan ${ticketExtra.restantes}`}
                  </strong>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: POPPINS, fontSize: 14, fontWeight: 300 }}>
                  <span style={{ color: OBSIDIAN[100] }}>Total a pagar</span>
                  <strong style={{ fontSize: 21, fontWeight: 700 }}>{Number(ticket.amount) > 0 ? mxn(Number(ticket.amount)) : 'Sin costo'}</strong>
                </div>
              )}

              <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 13, color: OBSIDIAN[200], margin: '14px 0 0', lineHeight: 1.55, padding: '12px 14px', borderRadius: 12, background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.25)' }}>
                {ticket.paid
                  ? <>Ya está pagada. Preséntate en el estudio, {LUGAR.pisoEstudio}.</>
                  : Number(ticket.amount) === 0 && ticketExtra?.producto
                    ? <>Esta clase ya va incluida. Preséntate en el estudio, {LUGAR.pisoEstudio}, con tu código.</>
                    : <>Enseña este código en la caja de <strong style={{ fontWeight: 600 }}>{LUGAR.pisoCaja}</strong>. La clase es en el {LUGAR.pisoEstudio}.</>}
              </p>

              {/* Sin cuenta no hay dónde volver a consultarlo: hay que decirlo
                  antes de que cierre la ventana, no después. */}
              {!token && (
                <p style={{ fontFamily: POPPINS, fontWeight: 300, fontSize: 12.5, color: OBSIDIAN[100], lineHeight: 1.55, margin: '12px 0 0' }}>
                  Reservaste sin cuenta: <strong style={{ fontWeight: 600, color: OBSIDIAN[500] }}>toma captura de este código</strong>, porque no hay dónde volver a verlo. Con cuenta se te guarda solo.
                </p>
              )}

              {puedePagar && !ticket.paid && Number(ticket.amount) > 0 && (
                <button onClick={() => pagar(ticket)} disabled={busy}
                  style={{ ...btn, background: ESPACIO.wellness, marginTop: 12 }}>
                  Pagar ahora {mxn(Number(ticket.amount))}
                </button>
              )}

              {token && vigentes.some(b => b.booking_id === ticket.booking_id) && (
                <button onClick={() => { const b = ticket; setTicket(null); cancelar(b) }}
                  style={{ width: '100%', minHeight: 40, background: 'none', border: 'none', color: OBSIDIAN[100], fontFamily: PLEX, fontSize: 12.5, cursor: 'pointer', marginTop: 10, textDecoration: 'underline' }}>
                  Cancelar esta reserva
                </button>
              )}
              <button onClick={() => setTicket(null)} style={{ ...btn, marginTop: 12 }}>Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
