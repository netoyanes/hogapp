import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { CENOTE, GROTESK, INTER, MANO, EYEBROW, CENOTE_FONTS_HREF, LUGAR } from '../lib/cenoteBrand'

// ─────────────────────────────────────────────────────────────────────────────
// CENOTE SPA — el sitio comercial del spa (/cenote)
//
// Solo vende el spa: circuito de sauna, vapor y cold plunge, paquetes, la
// membresía Recovery, masajes, rituales y el turno privado. El salón para
// facilitadores se quitó del sitio a propósito: por ahora el foco es el spa.
//
// QUIÉN LLEGA Y QUÉ NECESITA VER:
//   · El vecino o el que vio el link en redes — qué es, cuánto cuesta, y un
//     botón para apartar. El circuito a $500 es la puerta de entrada.
//   · El huésped de Hotel Flow — escaneó la tarjeta de su habitación. Su
//     descuento (10 % en todo, circuito a $450) tiene que verse sin buscarlo.
//     La tarjeta puede apuntar a /cenote?flow=1 y el sitio abre con el precio
//     de huésped ya aplicado.
//   · El que ya vino — el paquete y la Recovery, que es donde está la
//     recurrencia: "hoy pagaste $500; con el paquete te sale en $450".
//
// Precios y textos salen de cenote_catalogo (cenote_portal.sql). Si el RPC no
// responde, el sitio se ve igual con el catálogo de respaldo de abajo. El
// precio final siempre lo calcula la base, nunca el navegador.
// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  code: string; linea: 'salon' | 'spa'; grupo: string; nombre: string; detalle: string | null
  precio: number; unidad: string | null; horas_mes: number | null; lugares: number
  agenda: boolean; destacado: boolean; disponibles: number | null
}

/** El menú impreso de noviembre 2026. Respaldo si el RPC no responde. */
const CATALOGO_BASE: Item[] = [
  { code: 'circuito', linea: 'spa', grupo: 'circuito', nombre: 'Circuito', detalle: 'Sauna, vapor y cold plunge, a tu ritmo. 75 min. Incluye toalla y agua.', precio: 500, unidad: null, horas_mes: null, lugares: 1, agenda: true, destacado: true, disponibles: null },
  { code: 'pareja', linea: 'spa', grupo: 'circuito', nombre: 'Circuito en pareja', detalle: 'El turno completo para dos.', precio: 900, unidad: null, horas_mes: null, lugares: 2, agenda: true, destacado: false, disponibles: null },
  { code: 'paq4', linea: 'spa', grupo: 'paquete', nombre: 'Paquete 4', detalle: 'Cuatro circuitos. Vigencia 60 días, transferible.', precio: 1800, unidad: null, horas_mes: null, lugares: 0, agenda: false, destacado: false, disponibles: null },
  { code: 'paq8', linea: 'spa', grupo: 'paquete', nombre: 'Paquete 8', detalle: 'Ocho circuitos. Vigencia 90 días, transferible.', precio: 3200, unidad: null, horas_mes: null, lugares: 0, agenda: false, destacado: true, disponibles: null },
  { code: 'recovery_fundador', linea: 'spa', grupo: 'recovery', nombre: 'Recovery Fundador', detalle: 'Un circuito al día, todos los días. Congelado 6 meses. Cargo automático, sin permanencia.', precio: 2299, unidad: 'al mes', horas_mes: null, lugares: 0, agenda: false, destacado: true, disponibles: 10 },
  { code: 'recovery', linea: 'spa', grupo: 'recovery', nombre: 'Recovery', detalle: 'Un circuito al día, todos los días. Cargo automático, sin permanencia.', precio: 2900, unidad: 'al mes', horas_mes: null, lugares: 0, agenda: false, destacado: false, disponibles: null },
  { code: 'relajante', linea: 'spa', grupo: 'masaje', nombre: 'Masaje relajante · 60 min', detalle: 'Presión suave a media para soltar el día.', precio: 1300, unidad: null, horas_mes: null, lugares: 0, agenda: true, destacado: false, disponibles: null },
  { code: 'descontracturante', linea: 'spa', grupo: 'masaje', nombre: 'Masaje descontracturante · 60 min', detalle: 'Presión profunda en espalda, cuello y hombros.', precio: 1500, unidad: null, horas_mes: null, lugares: 0, agenda: true, destacado: false, disponibles: null },
  { code: 'masaje90', linea: 'spa', grupo: 'masaje', nombre: 'Masaje · 90 min', detalle: 'Relajante o descontracturante, cuerpo completo.', precio: 1900, unidad: null, horas_mes: null, lugares: 0, agenda: true, destacado: false, disponibles: null },
  { code: 'reset', linea: 'spa', grupo: 'ritual', nombre: 'Reset', detalle: 'Circuito + masaje relajante 60 min.', precio: 1600, unidad: null, horas_mes: null, lugares: 1, agenda: true, destacado: true, disponibles: null },
  { code: 'reset_deep', linea: 'spa', grupo: 'ritual', nombre: 'Reset Deep', detalle: 'Circuito + masaje descontracturante 60 min.', precio: 1800, unidad: null, horas_mes: null, lugares: 1, agenda: true, destacado: false, disponibles: null },
  { code: 'reset_pareja', linea: 'spa', grupo: 'ritual', nombre: 'Reset en pareja', detalle: 'Dos circuitos + dos masajes de 60 min.', precio: 3000, unidad: null, horas_mes: null, lugares: 2, agenda: true, destacado: false, disponibles: null },
  { code: 'dia_cenote', linea: 'spa', grupo: 'ritual', nombre: 'Día Cenote', detalle: 'Circuito + masaje de 90 min + bebida.', precio: 2100, unidad: null, horas_mes: null, lugares: 1, agenda: true, destacado: false, disponibles: null },
  { code: 'privado', linea: 'spa', grupo: 'privado', nombre: 'Turno privado · 3 o 4 personas', detalle: '90 min con el spa solo para ustedes.', precio: 1800, unidad: null, horas_mes: null, lugares: 2, agenda: true, destacado: false, disponibles: null },
]

/** Turnos cada 90 min de 10:00 a 21:00 — los mismos que valida la base. */
const TURNOS = ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30', '19:00']
/** Descuento de huésped de Hotel Flow. La base aplica el mismo con el código FLOW. */
const FLOW_PCT = 10

const GRUPOS_SPA: { id: string; titulo: string; nota: string }[] = [
  { id: 'circuito', titulo: 'Circuito', nota: '75 min · 2 personas por turno' },
  { id: 'paquete', titulo: 'Paquetes', nota: 'Transferibles' },
  { id: 'recovery', titulo: 'Membresía', nota: 'Mensual' },
  { id: 'masaje', titulo: 'Masajes', nota: 'Cabina privada' },
  { id: 'ritual', titulo: 'Rituales', nota: 'Circuito + masaje' },
  { id: 'privado', titulo: 'Turno privado', nota: '3 o 4 personas' },
]

const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const mxn = (n: number) => `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fechaLarga = (s: string) => { const d = new Date(`${s}T12:00:00`); return `${DIA_CORTO[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}` }
const irA = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
/** El mismo redondeo que fn_cenote_spa_pedido. */
const descuentoFlow = (precio: number) => Math.round(precio * FLOW_PCT / 100)
const precioFinal = (item: Item, flow: boolean) => item.precio - (flow ? descuentoFlow(item.precio) : 0)

// ─── Estilos ─────────────────────────────────────────────────────────────────
// Las rejillas necesitan media queries, que no caben en style={}: van en una
// hoja con prefijo cn- que solo existe mientras el sitio está montado.
const CSS = `
.cn-wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.cn-g2{display:grid;grid-template-columns:1fr;gap:16px}
.cn-g3{display:grid;grid-template-columns:1fr;gap:16px}
.cn-g4{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cn-hero{display:grid;grid-template-columns:1fr;gap:28px}
.cn-menu{display:grid;grid-template-columns:1fr;gap:36px}
.cn-nav a{display:none}
.cn-h1{font-size:56px}
.cn-h2{font-size:36px}
@media(min-width:760px){
  .cn-g2{grid-template-columns:1fr 1fr;gap:20px}
  .cn-g3{grid-template-columns:repeat(3,1fr);gap:20px}
  .cn-g4{grid-template-columns:repeat(4,1fr);gap:16px}
  .cn-hero{grid-template-columns:1.25fr 1fr;gap:48px;align-items:end}
  .cn-menu{grid-template-columns:1fr 1fr;gap:28px 56px}
  .cn-nav a{display:inline}
  .cn-h1{font-size:96px}
  .cn-h2{font-size:56px}
  .cn-movil{display:none!important}
}
.cn-btn{transition:transform .12s ease,opacity .12s ease}
.cn-btn:hover{opacity:.88}
.cn-btn:active{transform:scale(.98)}
.cn-row{transition:background .12s ease}
.cn-row:hover{background:rgba(7,21,24,.04)}
.cn-faq summary{list-style:none;cursor:pointer}
.cn-faq summary::-webkit-details-marker{display:none}
.cn-faq[open] .cn-mas{transform:rotate(45deg)}
.cn-input{width:100%;box-sizing:border-box;font:400 15px ${INTER};color:${CENOTE.tinta};background:${CENOTE.papel};border:1px solid rgba(7,21,24,.22);border-radius:2px;padding:12px 14px;outline:none}
.cn-input:focus{border-color:${CENOTE.tinta}}
@media (prefers-reduced-motion:reduce){.cn-btn,.cn-row{transition:none}}
`

const S = {
  eyebrow: { ...EYEBROW, color: CENOTE.oxido, margin: 0 } as CSSProperties,
  display: { fontFamily: GROTESK, fontWeight: 500, lineHeight: 0.96, letterSpacing: '-0.01em', textTransform: 'uppercase', margin: 0, color: CENOTE.tinta } as CSSProperties,
  mano: { fontFamily: MANO, color: CENOTE.oxido, fontWeight: 400 } as CSSProperties,
  cuerpo: { fontFamily: INTER, fontWeight: 300, fontSize: 16, lineHeight: 1.6, color: CENOTE.tinta, margin: 0 } as CSSProperties,
}

function Boton({ children, onClick, tono = 'tinta', full, disabled }: {
  children: ReactNode; onClick?: () => void; tono?: 'tinta' | 'linea' | 'oliva' | 'papel'; full?: boolean; disabled?: boolean
}) {
  const t = {
    tinta: { background: CENOTE.tinta, color: CENOTE.arena, border: `1px solid ${CENOTE.tinta}` },
    linea: { background: 'transparent', color: CENOTE.tinta, border: `1px solid ${CENOTE.tinta}` },
    oliva: { background: CENOTE.oliva, color: CENOTE.tinta, border: `1px solid ${CENOTE.oliva}` },
    papel: { background: CENOTE.arena, color: CENOTE.tinta, border: `1px solid ${CENOTE.arena}` },
  }[tono]
  return (
    <button type="button" className="cn-btn" onClick={onClick} disabled={disabled}
      style={{ ...t, ...EYEBROW, fontSize: 12, fontWeight: 600, padding: '15px 22px', borderRadius: 2,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, width: full ? '100%' : undefined, minHeight: 48 }}>
      {children}
    </button>
  )
}

function Marca({ color = CENOTE.tinta, chico }: { color?: string; chico?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
      <span style={{ fontFamily: GROTESK, fontWeight: 500, fontSize: chico ? 22 : 30, letterSpacing: '0.06em', color }}>CENOTE</span>
      <span style={{ fontFamily: MANO, fontSize: chico ? 9 : 11, color, marginTop: 2 }}>wellness club</span>
    </div>
  )
}

function Campo({ label, children, nota }: { label: string; children: ReactNode; nota?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ ...EYEBROW, fontSize: 10.5, color: CENOTE.humo, display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
      {nota && <span style={{ fontFamily: INTER, fontSize: 12, color: CENOTE.humo, display: 'block', marginTop: 5 }}>{nota}</span>}
    </label>
  )
}

function Hoja({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(7,21,24,.55)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: CENOTE.arena, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', borderRadius: '6px 6px 0 0', padding: '22px 20px 28px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <p style={S.eyebrow}>{titulo}</p>
          <button onClick={onClose} aria-label="Cerrar"
            style={{ background: 'none', border: 'none', fontFamily: INTER, fontSize: 26, lineHeight: 1, color: CENOTE.tinta, cursor: 'pointer', padding: 4 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Aviso({ msg }: { msg: { text: string; error?: boolean } | null }) {
  if (!msg) return null
  return (
    <p role="status" style={{ fontFamily: INTER, fontSize: 13.5, margin: '12px 0 0', padding: '10px 12px', borderRadius: 2,
      background: msg.error ? 'rgba(142,53,35,.1)' : 'rgba(190,196,125,.35)', color: msg.error ? CENOTE.oxido : CENOTE.tinta }}>
      {msg.text}
    </p>
  )
}

function Linea({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontWeight: fuerte ? 600 : 400, fontSize: fuerte ? 16 : 14 }}>
      <span>{k}</span><span style={{ whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  )
}

/** Precio de lista, y debajo el de huésped cuando está activo. */
function Precio({ item, flow, grande }: { item: Item; flow: boolean; grande?: boolean }) {
  const final = precioFinal(item, flow)
  return (
    <span style={{ display: 'block', lineHeight: 1 }}>
      {flow && <span style={{ fontFamily: INTER, fontSize: grande ? 15 : 12, textDecoration: 'line-through', opacity: 0.6, display: 'block', marginBottom: 4 }}>{mxn(item.precio)}</span>}
      <span style={{ fontFamily: grande ? GROTESK : INTER, fontWeight: grande ? 500 : 600, fontSize: grande ? 44 : 16 }}>{mxn(final)}</span>
      {item.unidad && <span style={{ fontFamily: INTER, fontSize: grande ? 13 : 11, fontWeight: 400 }}> {item.unidad}</span>}
    </span>
  )
}

const SIN_SQL = 'No pudimos registrarlo en este momento. Pregunta en el 2º piso del Hotel Flow o inténtalo de nuevo en un momento.'

// ─────────────────────────────────────────────────────────────────────────────
export function CenotePortal() {
  const [catalogo, setCatalogo] = useState<Item[]>(CATALOGO_BASE)
  const [item, setItem] = useState<Item | null>(null)
  // ?flow=1 — el QR de la tarjeta en la habitación del hotel
  const [flow, setFlow] = useState(() => new URLSearchParams(location.search).get('flow') === '1')

  // Fuentes, título y color de la barra del navegador, solo mientras esto está montado
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = CENOTE_FONTS_HREF
    document.head.appendChild(link)
    const meta = document.querySelector('meta[name="theme-color"]')
    const prevTheme = meta?.getAttribute('content')
    meta?.setAttribute('content', CENOTE.arena)
    const prevTitle = document.title
    document.title = 'Cenote Spa · Sauna, vapor y cold plunge en la Condesa'
    const prevBg = document.body.style.background
    document.body.style.background = CENOTE.arena
    return () => {
      document.head.removeChild(link)
      if (prevTheme) meta?.setAttribute('content', prevTheme)
      document.title = prevTitle
      document.body.style.background = prevBg
    }
  }, [])

  useEffect(() => {
    supabase.rpc('fn_cenote_catalogo').then(({ data, error }) => {
      if (!error && Array.isArray(data)) {
        const spa = (data as Item[]).filter(i => i.linea === 'spa')
        if (spa.length) setCatalogo(spa)
      }
    })
  }, [])

  const spa = catalogo.filter(i => i.linea === 'spa')
  const get = (code: string) => spa.find(i => i.code === code)
  const circuito = get('circuito')
  const paq4 = get('paq4')
  const fundador = get('recovery_fundador')
  const reset = get('reset')
  const reservar = () => circuito && setItem(circuito)

  return (
    <div style={{ background: CENOTE.arena, color: CENOTE.tinta, fontFamily: INTER, minHeight: '100vh' }}>
      <style>{CSS}</style>

      {/* ─── Barra ─── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(238,235,221,.94)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(7,21,24,.12)' }}>
        <div className="cn-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Marca chico />
          <nav className="cn-nav" style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            {[['circuito', 'El circuito'], ['menu', 'Menú'], ['flow', 'Huéspedes Flow']].map(([id, t]) => (
              <a key={id} href={`#${id}`} onClick={e => { e.preventDefault(); irA(id) }}
                style={{ ...EYEBROW, fontSize: 11, color: CENOTE.tinta, textDecoration: 'none' }}>{t}</a>
            ))}
            <Boton onClick={reservar}>Reservar</Boton>
          </nav>
        </div>
      </header>

      {/* Huésped del hotel: el precio ya viene aplicado */}
      {flow && (
        <div style={{ background: CENOTE.oliva }}>
          <div className="cn-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 20px', fontFamily: INTER, fontSize: 13.5 }}>
            <span><strong style={{ fontWeight: 600 }}>Precio de huésped Hotel Flow activo:</strong> {FLOW_PCT} % en todo el spa.</span>
            <button onClick={() => setFlow(false)} style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontFamily: INTER, fontSize: 12.5, color: CENOTE.tinta, whiteSpace: 'nowrap' }}>No me hospedo</button>
          </div>
        </div>
      )}

      {/* ─── Hero ─── */}
      <section className="cn-wrap" style={{ padding: '52px 20px 60px' }}>
        <div className="cn-hero">
          <div>
            <p style={S.eyebrow}>Spa · Condesa · {LUGAR.referencia}</p>
            <h1 className="cn-h1" style={{ ...S.display, marginTop: 18 }}>Calor.<br />Vapor.<br />Frío.</h1>
            <p style={{ ...S.mano, fontSize: 30, margin: '14px 0 0' }}>Y una pausa.</p>
            <p style={{ ...S.cuerpo, fontSize: 18, maxWidth: 520, marginTop: 22 }}>
              Sauna, vapor y cold plunge en el corazón de la Condesa. 75 minutos a tu ritmo,
              solo dos personas por turno. Masajes y rituales en cabina privada.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28 }}>
              <Boton onClick={reservar}>Reservar circuito · {circuito ? mxn(precioFinal(circuito, flow)) : '$500'}</Boton>
              <Boton tono="linea" onClick={() => irA('menu')}>Ver el menú</Boton>
            </div>
          </div>
          <div style={{ background: CENOTE.cielo, borderRadius: 3, padding: '28px 26px' }}>
            <p style={{ ...EYEBROW, margin: 0 }}>Todos los días, de 10:00 a 21:00</p>
            {[['Sauna', 'Calor seco para soltar el cuerpo.'], ['Vapor', 'Calor húmedo que abre la respiración.'], ['Cold plunge', 'Agua fría para despertar todo.']].map(([t, d]) => (
              <div key={t} style={{ borderTop: `1px solid ${CENOTE.tinta}`, marginTop: 16, paddingTop: 12 }}>
                <p style={{ fontFamily: GROTESK, fontSize: 24, fontWeight: 500, textTransform: 'uppercase', margin: 0 }}>{t}</p>
                <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 14, margin: '4px 0 0' }}>{d}</p>
              </div>
            ))}
            <p style={{ fontFamily: INTER, fontSize: 13, margin: '18px 0 0' }}>Incluye toalla y agua.</p>
          </div>
        </div>
      </section>

      {/* ─── Cómo venir: lo más vendido ─── */}
      <section id="circuito" style={{ background: CENOTE.piedra, padding: '64px 0 72px', scrollMarginTop: 64 }}>
        <div className="cn-wrap">
          <p style={S.eyebrow}>Elige cómo venir</p>
          <h2 className="cn-h2" style={{ ...S.display, marginTop: 16 }}>Una vez,<br />o todos los días.</h2>

          <div className="cn-g3" style={{ marginTop: 36 }}>
            {circuito && (
              <Destacado tono={CENOTE.cielo} eyebrow="Para empezar" item={circuito} flow={flow}
                texto={circuito.detalle ?? ''} cta="Apartar turno" onClick={() => setItem(circuito)} />
            )}
            {paq4 && (
              <Destacado tono={CENOTE.papel} eyebrow="Si vas a volver" item={paq4} flow={flow}
                texto={`Te sale en ${mxn(Math.round(precioFinal(paq4, flow) / 4))} cada visita. ${paq4.detalle ?? ''}`} cta="Comprar paquete" onClick={() => setItem(paq4)} />
            )}
            {fundador && (
              <Destacado tono={CENOTE.oliva} eyebrow={fundador.disponibles != null ? `Quedan ${fundador.disponibles} de 10` : 'Solo 10 lugares'}
                item={fundador} flow={flow}
                texto="Un circuito al día, todos los días. Precio congelado 6 meses. Sin permanencia."
                cta={fundador.disponibles === 0 ? 'Agotado' : 'Quiero ser fundador'} disabled={fundador.disponibles === 0} onClick={() => setItem(fundador)} />
            )}
          </div>

          {reset && (
            <div style={{ marginTop: 16, background: CENOTE.tinta, color: CENOTE.arena, borderRadius: 3, padding: '22px 24px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ maxWidth: 560 }}>
                <p style={{ ...EYEBROW, color: CENOTE.oliva, margin: 0 }}>Circuito + masaje</p>
                <p style={{ fontFamily: GROTESK, fontSize: 28, fontWeight: 500, textTransform: 'uppercase', margin: '8px 0 4px' }}>{reset.nombre}</p>
                <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 15, margin: 0 }}>{reset.detalle} El día completo en una sola visita.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <Precio item={reset} flow={flow} grande />
                <Boton tono="oliva" onClick={() => setItem(reset)}>Reservar</Boton>
              </div>
            </div>
          )}

          {/* Cómo funciona */}
          <div style={{ marginTop: 56 }}>
            <p style={S.eyebrow}>Cómo funciona</p>
            <div className="cn-g4" style={{ marginTop: 18 }}>
              {[
                ['01', 'Elige', 'Circuito, masaje, ritual o paquete.'],
                ['02', 'Aparta', 'Día y turno. Solo dos personas por turno.'],
                ['03', 'Paga', 'Por link o en el 2º piso con tu folio.'],
                ['04', 'Llega', '10 minutos antes. Toalla y agua van por nuestra cuenta.'],
              ].map(([n, t, d]) => (
                <div key={n} style={{ background: CENOTE.papel, borderRadius: 3, padding: '18px 16px' }}>
                  <p style={{ fontFamily: GROTESK, fontSize: 30, margin: 0, lineHeight: 1 }}>{n}</p>
                  <p style={{ fontFamily: INTER, fontWeight: 600, fontSize: 15, margin: '12px 0 0' }}>{t}</p>
                  <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0' }}>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Huéspedes de Hotel Flow ─── */}
      <section id="flow" style={{ background: CENOTE.tinta, color: CENOTE.arena, padding: '56px 0', scrollMarginTop: 64 }}>
        <div className="cn-wrap cn-g2" style={{ alignItems: 'center' }}>
          <div>
            <p style={{ ...EYEBROW, color: CENOTE.oliva, margin: 0 }}>Para huéspedes de Hotel Flow</p>
            <p className="cn-h2" style={{ ...S.display, color: CENOTE.arena, marginTop: 14 }}>Estás a un piso.</p>
            <p style={{ fontFamily: MANO, fontSize: 24, color: CENOTE.oliva, margin: '12px 0 0' }}>Haz espacio para ti.</p>
            <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 16, lineHeight: 1.6, margin: '18px 0 0', maxWidth: 480 }}>
              El spa está en el segundo piso del hotel. 75 minutos para soltar el viaje, con {FLOW_PCT} % de descuento
              en circuitos, masajes, rituales y paquetes. Solo menciona tu habitación.
            </p>
          </div>
          <div style={{ background: CENOTE.arena, color: CENOTE.tinta, borderRadius: 3, padding: '26px 24px' }}>
            <p style={{ ...EYEBROW, margin: 0 }}>Circuito para huéspedes</p>
            <p style={{ fontFamily: GROTESK, fontSize: 64, margin: '10px 0 0', lineHeight: 1 }}>{circuito ? mxn(precioFinal(circuito, true)) : '$450'}</p>
            <p style={{ fontFamily: INTER, fontSize: 14, margin: '6px 0 0', color: CENOTE.humo }}>precio regular <span style={{ textDecoration: 'line-through' }}>{circuito ? mxn(circuito.precio) : '$500'}</span></p>
            <p style={{ fontFamily: INTER, fontSize: 14, fontWeight: 500, margin: '16px 0 18px' }}>{FLOW_PCT} % también en masajes, rituales y paquetes.</p>
            {flow
              ? <Boton full onClick={reservar}>Reservar con precio de huésped</Boton>
              : <Boton full onClick={() => { setFlow(true); irA('menu') }}>Me hospedo en Hotel Flow</Boton>}
          </div>
        </div>
      </section>

      {/* ─── El menú completo, como el impreso ─── */}
      <section id="menu" style={{ background: CENOTE.arena, padding: '64px 0 72px', scrollMarginTop: 64 }}>
        <div className="cn-wrap">
          <p style={S.eyebrow}>Menú spa</p>
          <h2 className="cn-h2" style={{ ...S.display, marginTop: 16 }}>Todo el menú</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: INTER, fontSize: 14 }}>Ver precios de:</span>
            {([[false, 'Público'], [true, 'Huésped Hotel Flow']] as const).map(([v, t]) => (
              <button key={t} onClick={() => setFlow(v)} className="cn-btn"
                style={{ fontFamily: INTER, fontSize: 13, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${CENOTE.tinta}`,
                  background: flow === v ? CENOTE.tinta : 'transparent', color: flow === v ? CENOTE.arena : CENOTE.tinta }}>{t}</button>
            ))}
          </div>

          <div className="cn-menu" style={{ marginTop: 32 }}>
            {GRUPOS_SPA.map(g => {
              const items = spa.filter(i => i.grupo === g.id)
              if (!items.length) return null
              return (
                <div key={g.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `1.5px solid ${CENOTE.tinta}`, paddingTop: 10 }}>
                    <p style={{ ...S.eyebrow, margin: 0 }}>{g.titulo}</p>
                    <p style={{ fontFamily: INTER, fontSize: 12, color: CENOTE.humo, margin: 0 }}>{g.nota}</p>
                  </div>
                  {items.map(i => (
                    <button key={i.code} className="cn-row" onClick={() => i.disponibles !== 0 && setItem(i)}
                      style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(7,21,24,.1)', padding: '14px 4px', cursor: i.disponibles === 0 ? 'default' : 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start', color: CENOTE.tinta }}>
                      <span style={{ flex: 1 }}>
                        <span style={{ fontFamily: INTER, fontWeight: 500, fontSize: 16, display: 'block' }}>{i.nombre}</span>
                        <span style={{ fontFamily: INTER, fontWeight: 300, fontSize: 13, display: 'block', marginTop: 3, lineHeight: 1.45 }}>{i.detalle}</span>
                        {i.grupo === 'paquete' && (
                          <span style={{ fontFamily: INTER, fontSize: 12, color: CENOTE.oxido, display: 'block', marginTop: 3 }}>
                            {mxn(Math.round(precioFinal(i, flow) / (i.code === 'paq8' ? 8 : 4)))} c/u
                          </span>
                        )}
                      </span>
                      <span style={{ textAlign: 'right', flexShrink: 0 }}>
                        <Precio item={i} flow={flow} />
                        <span style={{ ...EYEBROW, fontSize: 10, display: 'block', marginTop: 8, color: CENOTE.oxido }}>
                          {i.disponibles === 0 ? 'Agotado' : i.agenda ? 'Reservar' : 'Comprar'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 40, border: `1px solid ${CENOTE.tinta}`, borderRadius: 3, padding: '18px 20px', fontFamily: INTER, fontSize: 13.5, fontWeight: 300, lineHeight: 1.6 }}>
            <strong style={{ fontWeight: 600 }}>Horario:</strong> turnos cada 90 min, de 10:00 a 21:00 · 2 personas por turno · reserva previa.<br />
            Masaje cancelado con menos de 12 h: se cobra el 50 %. Circuito cancelado con menos de 4 h: se descuenta del paquete.
          </div>
        </div>
      </section>

      {/* ─── Preguntas ─── */}
      <section style={{ background: CENOTE.piedra, padding: '56px 0 64px' }}>
        <div className="cn-wrap">
          <p style={S.eyebrow}>Antes de venir</p>
          <div style={{ marginTop: 14 }}>
            {[
              ['¿Qué incluye el circuito?', 'Sauna, vapor y cold plunge durante 75 minutos, a tu ritmo. Te damos toalla y agua.'],
              ['¿Cuántas personas hay por turno?', 'Máximo dos. Si vienen tres o cuatro, el turno privado les deja el spa solo para ustedes por 90 minutos.'],
              ['¿Cómo pago?', 'Al apartar te mandamos el link de pago por WhatsApp; también puedes pagar en el 2º piso del Hotel Flow con tu folio. Tu lugar queda confirmado al pagar.'],
              ['¿Puedo compartir mi paquete?', 'Sí, los paquetes son transferibles. El de 4 dura 60 días y el de 8, 90 días.'],
              ['¿La Recovery tiene permanencia?', 'No. Es un circuito al día, todos los días, con cargo automático mensual. La cancelas cuando quieras.'],
              ['Me hospedo en Hotel Flow, ¿cómo uso mi descuento?', `Al reservar marca "Me hospedo en Hotel Flow" y escribe tu número de habitación. Tienes ${FLOW_PCT} % en todo el spa.`],
              ['¿Y si necesito cambiar mi reserva?', 'Avísanos con tiempo: masajes con 12 h de anticipación, circuitos con 4 h.'],
            ].map(([q, a]) => (
              <details key={q} className="cn-faq" style={{ borderTop: `1px solid ${CENOTE.tinta}` }}>
                <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', fontFamily: INTER, fontWeight: 500, fontSize: 16 }}>
                  {q}<span className="cn-mas" style={{ fontFamily: GROTESK, fontSize: 24, transition: 'transform .15s', lineHeight: 1, marginLeft: 12 }}>+</span>
                </summary>
                <p style={{ ...S.cuerpo, fontSize: 15, padding: '0 0 20px', maxWidth: 720 }}>{a}</p>
              </details>
            ))}
            <div style={{ borderTop: `1px solid ${CENOTE.tinta}` }} />
          </div>
        </div>
      </section>

      {/* ─── Pie ─── */}
      <footer style={{ background: CENOTE.tinta, color: CENOTE.arena, padding: '48px 0 40px' }}>
        <div className="cn-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: 28, justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <Marca color={CENOTE.arena} />
            <p style={{ fontFamily: MANO, fontSize: 18, color: CENOTE.oliva, margin: '18px 0 0' }}>Calor, vapor, frío. Y una pausa.</p>
          </div>
          <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 300, lineHeight: 1.7, textAlign: 'right' }}>
            <p style={{ ...EYEBROW, fontSize: 11, margin: 0 }}>{LUGAR.calle} · {LUGAR.colonia}</p>
            <p style={{ margin: '4px 0 0', opacity: 0.8 }}>{LUGAR.referencia} · De 10:00 a 21:00</p>
            <a href={LUGAR.mapa} target="_blank" rel="noreferrer" style={{ color: CENOTE.oliva, ...EYEBROW, fontSize: 11 }}>Cómo llegar →</a>
          </div>
        </div>
      </footer>

      {/* Botón fijo en el teléfono: reservar siempre a un toque */}
      <div className="cn-movil" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 15 }}>
        <Boton full onClick={reservar}>Reservar circuito · {circuito ? mxn(precioFinal(circuito, flow)) : '$500'}</Boton>
      </div>
      <div className="cn-movil" style={{ height: 76 }} />

      {item && <CompraSpa item={item} flowInicial={flow} onClose={() => setItem(null)} />}
    </div>
  )
}

function Destacado({ tono, eyebrow, item, flow, texto, cta, onClick, disabled }: {
  tono: string; eyebrow: string; item: Item; flow: boolean; texto: string; cta: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <div style={{ background: tono, borderRadius: 3, padding: '24px 22px', display: 'flex', flexDirection: 'column' }}>
      <p style={{ ...EYEBROW, margin: 0 }}>{eyebrow}</p>
      <p style={{ fontFamily: GROTESK, fontSize: 26, fontWeight: 500, textTransform: 'uppercase', margin: '12px 0 12px', lineHeight: 1.05 }}>{item.nombre}</p>
      <Precio item={item} flow={flow} grande />
      <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 14, lineHeight: 1.5, margin: '14px 0 18px', flex: 1 }}>{texto}</p>
      <Boton full onClick={onClick} disabled={disabled}>{cta}</Boton>
    </div>
  )
}

// ─── Compra ──────────────────────────────────────────────────────────────────
interface Ticket { folio: string; producto: string; fecha: string | null; turno: string | null; precio_lista: number; descuento: number; total: number }

function CompraSpa({ item, flowInicial, onClose }: { item: Item; flowInicial: boolean; onClose: () => void }) {
  const dias = useMemo(() => {
    const out: string[] = []; const h = new Date()
    for (let i = 0; i < 14; i++) out.push(iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + i)))
    return out
  }, [])
  const [fecha, setFecha] = useState(dias[0])
  const [turno, setTurno] = useState('')
  const [ocupados, setOcupados] = useState<Record<string, number>>({})
  const [f, setF] = useState({ nombre: '', telefono: '', correo: '', habitacion: '' })
  const [flow, setFlow] = useState(flowInicial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    if (!item.agenda) return
    supabase.rpc('fn_cenote_turnos', { p_fecha: fecha }).then(({ data, error }) => setOcupados(!error && data ? data as Record<string, number> : {}))
  }, [fecha, item.agenda])

  const ahora = new Date()
  const esHoy = fecha === iso(ahora)
  const turnoLibre = (t: string) => {
    if (esHoy) { const [h, m] = t.split(':').map(Number); if (h * 60 + m <= ahora.getHours() * 60 + ahora.getMinutes() + 30) return false }
    return item.lugares === 0 || (ocupados[t] ?? 0) + item.lugares <= 2
  }

  const descuento = flow ? descuentoFlow(item.precio) : 0
  const total = item.precio - descuento

  const comprar = async () => {
    setMsg(null)
    if (item.agenda && !turno) return setMsg({ text: 'Elige un turno.', error: true })
    if (f.nombre.trim().length < 2) return setMsg({ text: 'Escribe tu nombre.', error: true })
    if (f.telefono.replace(/\D/g, '').length < 10) return setMsg({ text: 'Tu WhatsApp debe tener 10 dígitos.', error: true })
    if (flow && !f.habitacion.trim()) return setMsg({ text: 'Escribe tu número de habitación para el precio de huésped.', error: true })
    setBusy(true)
    const { data, error } = await supabase.rpc('fn_cenote_spa_pedido', {
      p_producto: item.code, p_nombre: f.nombre, p_telefono: f.telefono, p_correo: f.correo,
      p_fecha: item.agenda ? fecha : null, p_turno: item.agenda ? turno : null,
      p_codigo: flow ? 'FLOW' : null, p_habitacion: flow ? f.habitacion : null,
    })
    setBusy(false)
    if (error) return setMsg({ text: SIN_SQL, error: true })
    if (!data?.ok) return setMsg({ text: data?.error ?? SIN_SQL, error: true })
    setTicket(data as Ticket)
  }

  if (ticket) {
    return (
      <Hoja titulo="Listo" onClose={onClose}>
        <div style={{ background: CENOTE.papel, borderRadius: 3, padding: '22px 20px', textAlign: 'center' }}>
          <Marca chico />
          <p style={{ ...EYEBROW, color: CENOTE.humo, margin: '18px 0 0' }}>Tu folio</p>
          <p style={{ fontFamily: GROTESK, fontSize: 38, letterSpacing: '0.08em', margin: '4px 0 0' }}>{ticket.folio}</p>
          <p style={{ fontFamily: INTER, fontWeight: 600, fontSize: 17, margin: '14px 0 0' }}>{ticket.producto}</p>
          {ticket.fecha && <p style={{ fontFamily: INTER, fontSize: 15, margin: '4px 0 0' }}>{fechaLarga(ticket.fecha)} · {ticket.turno}</p>}
          <div style={{ borderTop: `1px dashed ${CENOTE.tinta}`, margin: '16px 0 0', paddingTop: 12, fontFamily: INTER, fontSize: 14, textAlign: 'left' }}>
            {ticket.descuento > 0 && <><Linea k="Precio" v={mxn(ticket.precio_lista)} /><Linea k="Huésped Hotel Flow" v={`−${mxn(ticket.descuento)}`} /></>}
            <Linea k="Total" v={mxn(ticket.total)} fuerte />
          </div>
        </div>
        <p style={{ ...S.cuerpo, fontSize: 14, marginTop: 16 }}>
          Te escribimos por WhatsApp con el link de pago. <strong style={{ fontWeight: 600 }}>Tu lugar queda confirmado al pagar</strong>. También
          puedes pagar en el 2º piso del Hotel Flow con tu folio. {ticket.fecha && 'Llega 10 minutos antes.'}
        </p>
        <p style={{ ...S.mano, fontSize: 20, margin: '14px 0 0' }}>Haz espacio para ti.</p>
        <div style={{ marginTop: 18 }}><Boton full tono="linea" onClick={onClose}>Cerrar</Boton></div>
      </Hoja>
    )
  }

  return (
    <Hoja titulo={item.agenda ? 'Reservar' : 'Comprar'} onClose={onClose}>
      <p style={{ fontFamily: GROTESK, fontSize: 28, fontWeight: 500, textTransform: 'uppercase', margin: 0, lineHeight: 1.05 }}>{item.nombre}</p>
      <p style={{ ...S.cuerpo, fontSize: 14.5, marginTop: 6 }}>{item.detalle}</p>

      {item.agenda && (
        <div style={{ marginTop: 20 }}>
          <span style={{ ...EYEBROW, fontSize: 10.5, color: CENOTE.humo }}>Día</span>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '8px -20px 0', padding: '0 20px 4px' }}>
            {dias.map(d => {
              const dt = new Date(`${d}T12:00:00`); const sel = d === fecha
              return (
                <button key={d} onClick={() => { setFecha(d); setTurno('') }} className="cn-btn"
                  style={{ flexShrink: 0, width: 58, padding: '8px 0', borderRadius: 2, cursor: 'pointer', border: `1px solid ${CENOTE.tinta}`,
                    background: sel ? CENOTE.tinta : CENOTE.papel, color: sel ? CENOTE.arena : CENOTE.tinta, fontFamily: INTER }}>
                  <span style={{ display: 'block', fontSize: 11 }}>{DIA_CORTO[dt.getDay()]}</span>
                  <span style={{ display: 'block', fontFamily: GROTESK, fontSize: 20 }}>{dt.getDate()}</span>
                </button>
              )
            })}
          </div>
          <span style={{ ...EYEBROW, fontSize: 10.5, color: CENOTE.humo, display: 'block', marginTop: 16 }}>Turno</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
            {TURNOS.map(t => {
              const libre = turnoLibre(t); const sel = t === turno
              const quedan = 2 - (ocupados[t] ?? 0)
              return (
                <button key={t} disabled={!libre} onClick={() => setTurno(t)} className="cn-btn"
                  style={{ padding: '10px 0', borderRadius: 2, cursor: libre ? 'pointer' : 'default', border: `1px solid ${libre ? CENOTE.tinta : 'rgba(7,21,24,.2)'}`,
                    background: sel ? CENOTE.tinta : libre ? CENOTE.papel : 'transparent', color: sel ? CENOTE.arena : libre ? CENOTE.tinta : CENOTE.humo,
                    fontFamily: INTER, textDecoration: libre ? 'none' : 'line-through' }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>{t}</span>
                  {item.lugares > 0 && libre && <span style={{ display: 'block', fontSize: 10.5, opacity: 0.75 }}>{quedan === 1 ? 'queda 1' : `${quedan} lugares`}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
        <Campo label="Nombre"><input className="cn-input" value={f.nombre} onChange={set('nombre')} autoComplete="name" /></Campo>
        <Campo label="WhatsApp"><input className="cn-input" value={f.telefono} onChange={set('telefono')} inputMode="tel" autoComplete="tel" placeholder="55 1234 5678" /></Campo>
        <Campo label="Correo (opcional)"><input className="cn-input" value={f.correo} onChange={set('correo')} type="email" autoComplete="email" /></Campo>

        <label style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 14px', borderRadius: 2, cursor: 'pointer',
          background: flow ? CENOTE.oliva : CENOTE.papel, border: `1px solid ${flow ? CENOTE.oliva : 'rgba(7,21,24,.22)'}` }}>
          <input type="checkbox" checked={flow} onChange={e => setFlow(e.target.checked)} style={{ width: 20, height: 20, accentColor: CENOTE.tinta, flexShrink: 0 }} />
          <span style={{ fontFamily: INTER, fontSize: 14.5, lineHeight: 1.4 }}>
            <strong style={{ fontWeight: 600 }}>Me hospedo en Hotel Flow</strong><br />
            <span style={{ fontWeight: 300, fontSize: 13 }}>{FLOW_PCT} % de descuento: te ahorras {mxn(descuentoFlow(item.precio))}</span>
          </span>
        </label>
        {flow && <Campo label="Habitación" nota="Validamos tu estancia en recepción."><input className="cn-input" value={f.habitacion} onChange={set('habitacion')} inputMode="numeric" /></Campo>}
      </div>

      <div style={{ marginTop: 18, background: CENOTE.papel, borderRadius: 3, padding: '12px 16px', fontFamily: INTER }}>
        {descuento > 0 && <><Linea k="Precio" v={mxn(item.precio)} /><Linea k="Huésped Hotel Flow" v={`−${mxn(descuento)}`} /></>}
        <Linea k={item.unidad ? `Total ${item.unidad}` : 'Total'} v={mxn(total)} fuerte />
      </div>

      <div style={{ marginTop: 16 }}>
        <Boton full onClick={comprar} disabled={busy}>{busy ? 'Apartando…' : item.agenda ? `Apartar por ${mxn(total)}` : `Comprar por ${mxn(total)}`}</Boton>
      </div>
      <Aviso msg={msg} />
      <p style={{ fontFamily: INTER, fontSize: 12, color: CENOTE.humo, margin: '12px 0 0', lineHeight: 1.5 }}>
        {item.grupo === 'masaje' || item.grupo === 'ritual'
          ? 'Masaje cancelado con menos de 12 h: se cobra el 50 %.'
          : item.agenda ? 'Circuito cancelado con menos de 4 h: se descuenta del paquete.'
          : 'Te enviamos tu comprobante por WhatsApp.'}
      </p>
    </Hoja>
  )
}
