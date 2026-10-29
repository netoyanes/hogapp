import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { CENOTE, GROTESK, INTER, MANO, EYEBROW, CENOTE_FONTS_HREF, LUGAR } from '../lib/cenoteBrand'

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL CENOTE — la cara pública de la División Wellness (/cenote)
//
// Antes era el portal de clases de POD Wellness. Desde noviembre Cenote ya no
// da clases propias: renta el salón a facilitadores y vende el spa. Así que
// este portal vende DOS cosas a DOS personas distintas, y cada una tiene que
// encontrar lo suyo en el primer pantallazo:
//
//   · EL FACILITADOR — quiere saber si le sale. Por eso lo primero en su
//     sección es la calculadora con SUS números (alumnos × precio), no los
//     nuestros: "la renta se paga con la primera clase". Luego los planes, y
//     al final la solicitud. No compra en línea de entrada: primero recorrido,
//     luego le damos un código de acceso y con ese código elige plan, confirma
//     bloque y queda listo para pagar. Sin contrato y depósito no hay salón.
//
//   · QUIEN VIENE AL SPA — alumno, huésped del Flow o vecino. Ve el menú tal
//     cual está impreso, elige, aparta turno y paga. Los códigos (FLOW, el del
//     facilitador) se aplican en el mismo formulario, y el precio final lo
//     calcula la base, no el navegador.
//
// Precios y textos salen de cenote_catalogo (cenote_portal.sql). Si el SQL aún
// no se corre, el portal se ve igual con el catálogo de respaldo de abajo —
// pero los formularios avisan que no pudieron registrar.
// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  code: string; linea: 'salon' | 'spa'; grupo: string; nombre: string; detalle: string | null
  precio: number; unidad: string | null; horas_mes: number | null; lugares: number
  agenda: boolean; destacado: boolean; disponibles: number | null
}

/** El menú impreso de noviembre 2026. Respaldo si el RPC no responde. */
const CATALOGO_BASE: Item[] = [
  { code: 'base', linea: 'salon', grupo: 'membresia', nombre: 'Base', detalle: '8 h de clase al mes. Un bloque fijo de 2 h por semana.', precio: 2500, unidad: 'al mes', horas_mes: 8, lugares: 0, agenda: false, destacado: false, disponibles: null },
  { code: 'plus', linea: 'salon', grupo: 'membresia', nombre: 'Plus', detalle: '16 h al mes. Dos bloques fijos por semana.', precio: 4500, unidad: 'al mes', horas_mes: 16, lugares: 0, agenda: false, destacado: true, disponibles: null },
  { code: 'pro', linea: 'salon', grupo: 'membresia', nombre: 'Pro', detalle: '24 h al mes. Tres bloques fijos: tu estudio sin tener estudio.', precio: 6000, unidad: 'al mes', horas_mes: 24, lugares: 0, agenda: false, destacado: false, disponibles: null },
  { code: 'evento', linea: 'salon', grupo: 'evento', nombre: 'Evento o taller', detalle: 'Sin membresía. Mínimo 2 horas.', precio: 1000, unidad: 'por hora', horas_mes: null, lugares: 0, agenda: false, destacado: false, disponibles: null },
  { code: 'hora_extra', linea: 'salon', grupo: 'extra', nombre: 'Hora extra', detalle: 'Para miembros, sobre su plan.', precio: 350, unidad: 'por hora', horas_mes: null, lugares: 0, agenda: false, destacado: false, disponibles: null },
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
const DEPOSITO = 2500
/** Último día para firmar con precio congelado 6 meses. */
const CONGELA_HASTA = new Date(2026, 11, 31)

const GRUPOS_SPA: { id: string; titulo: string; nota: string }[] = [
  { id: 'circuito', titulo: 'Circuito', nota: '75 min · 2 personas por turno' },
  { id: 'paquete', titulo: 'Paquetes', nota: 'Transferibles' },
  { id: 'recovery', titulo: 'Membresía', nota: 'Mensual' },
  { id: 'masaje', titulo: 'Masajes', nota: 'Cabina privada' },
  { id: 'ritual', titulo: 'Rituales', nota: 'Circuito + masaje' },
  { id: 'privado', titulo: 'Turno privado', nota: '3 o 4 personas' },
]

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const HORAS_BLOQUE = ['07:00', '08:00', '09:00', '11:00', '13:00', '16:00', '18:00', '19:00', '20:00']
const PRIME = new Set(['07:00', '08:00', '09:00', '18:00', '19:00', '20:00'])

const mxn = (n: number) => `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fechaLarga = (s: string) => { const d = new Date(`${s}T12:00:00`); return `${DIA_CORTO[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}` }
const fechaMes = (s: string) => { const d = new Date(`${s}T12:00:00`); return `${d.getDate()} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][d.getMonth()]} ${d.getFullYear()}` }
const irA = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/** El mismo cálculo que hace fn_cenote_spa_pedido — solo para mostrarlo antes. */
function precioSpa(item: Item, desc: Desc | null) {
  if (!desc) return { descuento: 0, total: item.precio }
  if (desc.tipo === 'flow') { const d = Math.round(item.precio * 0.1); return { descuento: d, total: item.precio - d } }
  if (desc.tipo === 'alumno' && item.code === 'circuito') return { descuento: item.precio - 350, total: 350 }
  return { descuento: 0, total: item.precio }
}
interface Desc { tipo: 'flow' | 'alumno'; etiqueta: string }

// ─── Estilos ─────────────────────────────────────────────────────────────────
// Las rejillas necesitan media queries, que no caben en style={}: van en una
// hoja con prefijo cn- que solo existe mientras el portal está montado.
const CSS = `
.cn-wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.cn-g2{display:grid;grid-template-columns:1fr;gap:16px}
.cn-g3{display:grid;grid-template-columns:1fr;gap:16px}
.cn-g4{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cn-menu{display:grid;grid-template-columns:1fr;gap:36px}
.cn-nav a{display:none}
.cn-h1{font-size:44px}
.cn-h2{font-size:36px}
@media(min-width:760px){
  .cn-g2{grid-template-columns:1fr 1fr;gap:20px}
  .cn-g3{grid-template-columns:repeat(3,1fr);gap:20px}
  .cn-g4{grid-template-columns:repeat(4,1fr);gap:16px}
  .cn-menu{grid-template-columns:1fr 1fr;gap:28px 56px}
  .cn-nav a{display:inline}
  .cn-h1{font-size:76px}
  .cn-h2{font-size:56px}
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
  display: { fontFamily: GROTESK, fontWeight: 500, lineHeight: 0.98, letterSpacing: '-0.01em', textTransform: 'uppercase', margin: 0, color: CENOTE.tinta } as CSSProperties,
  mano: { fontFamily: MANO, color: CENOTE.oxido, fontWeight: 400 } as CSSProperties,
  cuerpo: { fontFamily: INTER, fontWeight: 300, fontSize: 16, lineHeight: 1.6, color: CENOTE.tinta, margin: 0 } as CSSProperties,
  regla: { borderTop: `1px solid ${CENOTE.tinta}`, margin: 0 } as CSSProperties,
}

function Boton({ children, onClick, tono = 'tinta', full, disabled, type = 'button' }: {
  children: ReactNode; onClick?: () => void; tono?: 'tinta' | 'linea' | 'oliva' | 'papel'; full?: boolean; disabled?: boolean; type?: 'button' | 'submit'
}) {
  const t = {
    tinta: { background: CENOTE.tinta, color: CENOTE.arena, border: `1px solid ${CENOTE.tinta}` },
    linea: { background: 'transparent', color: CENOTE.tinta, border: `1px solid ${CENOTE.tinta}` },
    oliva: { background: CENOTE.oliva, color: CENOTE.tinta, border: `1px solid ${CENOTE.oliva}` },
    papel: { background: CENOTE.arena, color: CENOTE.tinta, border: `1px solid ${CENOTE.arena}` },
  }[tono]
  return (
    <button type={type} className="cn-btn" onClick={onClick} disabled={disabled}
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

const SIN_SQL = 'No pudimos registrarlo en este momento. Escríbenos por WhatsApp o pregunta en el 2º piso del Hotel Flow.'

// ─────────────────────────────────────────────────────────────────────────────
export function CenotePortal() {
  const [catalogo, setCatalogo] = useState<Item[]>(CATALOGO_BASE)
  const [spaItem, setSpaItem] = useState<Item | null>(null)
  const [accesoOpen, setAccesoOpen] = useState<string | null>(() => new URLSearchParams(location.search).get('acceso'))
  const [planElegido, setPlanElegido] = useState('plus')

  // Fuentes y color de la barra del navegador, solo mientras esto está montado
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = CENOTE_FONTS_HREF
    document.head.appendChild(link)
    const meta = document.querySelector('meta[name="theme-color"]')
    const prevTheme = meta?.getAttribute('content')
    meta?.setAttribute('content', CENOTE.arena)
    const prevTitle = document.title
    document.title = 'Cenote Wellness Club · Salón y spa en la Condesa'
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
      if (!error && Array.isArray(data) && data.length) setCatalogo(data as Item[])
    })
  }, [])

  const planes = catalogo.filter(i => i.linea === 'salon' && i.grupo === 'membresia')
  const evento = catalogo.find(i => i.code === 'evento')
  const extra = catalogo.find(i => i.code === 'hora_extra')
  const circuito = catalogo.find(i => i.code === 'circuito')
  const base = planes[0]

  const quieroPlan = (code: string) => { setPlanElegido(code); irA('solicitud') }

  return (
    <div style={{ background: CENOTE.arena, color: CENOTE.tinta, fontFamily: INTER, minHeight: '100vh' }}>
      <style>{CSS}</style>

      {/* ─── Barra ─── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(238,235,221,.94)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(7,21,24,.12)' }}>
        <div className="cn-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Marca chico />
          <nav className="cn-nav" style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            {[['salon', 'Renta el salón'], ['spa', 'Spa'], ['acceso', 'Soy facilitador']].map(([id, t]) => (
              <a key={id} href={`#${id}`} onClick={e => { e.preventDefault(); if (id === 'acceso') setAccesoOpen(''); else irA(id) }}
                style={{ ...EYEBROW, fontSize: 11, color: CENOTE.tinta, textDecoration: 'none' }}>{t}</a>
            ))}
            <Boton onClick={() => circuito && setSpaItem(circuito)}>Reservar spa</Boton>
          </nav>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="cn-wrap" style={{ padding: '52px 20px 56px' }}>
        <p style={S.eyebrow}>Condesa · {LUGAR.referencia}</p>
        <h1 className="cn-h1" style={{ ...S.display, marginTop: 18 }}>Movimiento,<br />pausa y<br />comunidad.</h1>
        <p style={{ ...S.mano, fontSize: 26, margin: '14px 0 0' }}>Haz espacio para ti.</p>
        <p style={{ ...S.cuerpo, fontSize: 18, maxWidth: 620, marginTop: 22 }}>
          Un salón para que los mejores facilitadores de la ciudad den su clase, y un spa de
          calor, vapor y frío para todos los que pasan por aquí.
        </p>

        <div className="cn-g2" style={{ marginTop: 40 }}>
          <button onClick={() => irA('salon')} className="cn-btn"
            style={{ textAlign: 'left', background: CENOTE.tinta, color: CENOTE.arena, border: 'none', borderRadius: 3, padding: '26px 24px', cursor: 'pointer' }}>
            <span style={{ ...EYEBROW, color: CENOTE.oliva }}>Doy clases</span>
            <span style={{ display: 'block', fontFamily: GROTESK, fontSize: 30, fontWeight: 500, margin: '12px 0 6px', textTransform: 'uppercase', lineHeight: 1.05 }}>Renta el salón</span>
            <span style={{ display: 'block', fontFamily: INTER, fontWeight: 300, fontSize: 15, opacity: 0.85 }}>
              Desde {base ? mxn(base.precio) : '$2,500'} al mes · bloque fijo · sin porcentaje por alumno
            </span>
            <span style={{ display: 'block', ...EYEBROW, fontSize: 11, marginTop: 20 }}>Haz la cuenta →</span>
          </button>
          <button onClick={() => irA('spa')} className="cn-btn"
            style={{ textAlign: 'left', background: CENOTE.cielo, color: CENOTE.tinta, border: 'none', borderRadius: 3, padding: '26px 24px', cursor: 'pointer' }}>
            <span style={{ ...EYEBROW, color: CENOTE.tinta }}>Vengo a soltar</span>
            <span style={{ display: 'block', fontFamily: GROTESK, fontSize: 30, fontWeight: 500, margin: '12px 0 6px', textTransform: 'uppercase', lineHeight: 1.05 }}>Calor. Vapor. Frío.</span>
            <span style={{ display: 'block', fontFamily: INTER, fontWeight: 300, fontSize: 15 }}>
              Circuito {circuito ? mxn(circuito.precio) : '$500'} · masajes · rituales · Recovery ilimitado
            </span>
            <span style={{ display: 'block', ...EYEBROW, fontSize: 11, marginTop: 20 }}>Ver el menú →</span>
          </button>
        </div>
      </section>

      {/* ═══════════════════════ SALÓN ═══════════════════════ */}
      <section id="salon" style={{ background: CENOTE.piedra, padding: '64px 0 72px', scrollMarginTop: 64 }}>
        <div className="cn-wrap">
          <p style={S.eyebrow}>El salón · Membresía facilitador</p>
          <h2 className="cn-h2" style={{ ...S.display, marginTop: 16 }}>Tu clase.<br />Sin tener estudio.</h2>
          <p style={{ ...S.cuerpo, maxWidth: 640, marginTop: 18, fontSize: 17 }}>
            Tú traes a tu gente y les cobras directo. Nosotros te entregamos el salón listo, con mats y
            props, 15 minutos antes de tu clase. Pagas una membresía fija: <strong style={{ fontWeight: 600 }}>aquí no hay porcentaje por alumno.</strong>
          </p>

          <Calculadora planes={planes} onPlan={quieroPlan} />

          {/* Planes */}
          <div className="cn-g3" style={{ marginTop: 48 }}>
            {planes.map(p => (
              <div key={p.code} style={{ background: p.destacado ? CENOTE.tinta : CENOTE.papel, color: p.destacado ? CENOTE.arena : CENOTE.tinta,
                borderRadius: 3, padding: '26px 24px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {p.destacado && (
                  <span style={{ position: 'absolute', top: -11, left: 24, background: CENOTE.oliva, color: CENOTE.tinta, ...EYEBROW, fontSize: 10, fontWeight: 600, padding: '5px 10px', borderRadius: 2 }}>
                    El que más conviene
                  </span>
                )}
                <p style={{ ...EYEBROW, color: p.destacado ? CENOTE.oliva : CENOTE.oxido, margin: 0 }}>{p.nombre}</p>
                <p style={{ fontFamily: GROTESK, fontSize: 48, fontWeight: 500, margin: '14px 0 0', lineHeight: 1 }}>{mxn(p.precio)}</p>
                <p style={{ fontFamily: INTER, fontSize: 13, fontWeight: 300, margin: '6px 0 0', opacity: 0.8 }}>
                  al mes · {p.horas_mes} h de clase
                </p>
                <p style={{ fontFamily: INTER, fontSize: 14, fontWeight: 300, lineHeight: 1.55, margin: '18px 0 0', flex: 1 }}>{p.detalle}</p>
                <div style={{ borderTop: `1px solid ${p.destacado ? 'rgba(238,235,221,.25)' : 'rgba(7,21,24,.15)'}`, margin: '20px 0 18px', paddingTop: 14, display: 'flex', justifyContent: 'space-between', fontFamily: INTER, fontSize: 13 }}>
                  <span style={{ opacity: 0.75 }}>Tu hora sale en</span>
                  <strong style={{ fontWeight: 600 }}>{p.horas_mes ? mxn(Math.floor(p.precio / p.horas_mes)) : '—'}</strong>
                </div>
                <Boton tono={p.destacado ? 'oliva' : 'tinta'} full onClick={() => quieroPlan(p.code)}>Quiero {p.nombre}</Boton>
              </div>
            ))}
          </div>

          <div className="cn-g2" style={{ marginTop: 16 }}>
            {evento && (
              <div style={{ border: `1px solid ${CENOTE.tinta}`, borderRadius: 3, padding: '18px 20px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <p style={{ fontFamily: INTER, fontWeight: 600, fontSize: 15, margin: 0 }}>{evento.nombre}</p>
                  <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 13, margin: '3px 0 0' }}>{evento.detalle} Ideal para probar o para retiros de un día.</p>
                </div>
                <p style={{ fontFamily: GROTESK, fontSize: 24, margin: 0, whiteSpace: 'nowrap' }}>{mxn(evento.precio)}<span style={{ fontSize: 12, fontFamily: INTER }}> /h</span></p>
              </div>
            )}
            {extra && (
              <div style={{ border: `1px solid ${CENOTE.tinta}`, borderRadius: 3, padding: '18px 20px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <p style={{ fontFamily: INTER, fontWeight: 600, fontSize: 15, margin: 0 }}>{extra.nombre}</p>
                  <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 13, margin: '3px 0 0' }}>{extra.detalle} Para el taller del mes o una clase especial.</p>
                </div>
                <p style={{ fontFamily: GROTESK, fontSize: 24, margin: 0, whiteSpace: 'nowrap' }}>{mxn(extra.precio)}<span style={{ fontSize: 12, fontFamily: INTER }}> /h</span></p>
              </div>
            )}
          </div>

          {/* Oferta de lanzamiento */}
          {new Date() <= CONGELA_HASTA && (
            <div style={{ marginTop: 24, background: CENOTE.oliva, borderRadius: 3, padding: '20px 22px', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ ...EYEBROW, margin: 0 }}>Facilitadores fundadores</p>
                <p style={{ fontFamily: GROTESK, fontSize: 22, fontWeight: 500, margin: '6px 0 0', textTransform: 'uppercase' }}>Precio congelado 6 meses si firmas antes del 31 de diciembre.</p>
              </div>
              <Boton onClick={() => irA('solicitud')}>Apartar mi bloque</Boton>
            </div>
          )}

          {/* Qué incluye */}
          <div style={{ marginTop: 64 }}>
            <p style={S.eyebrow}>Lo que te llevas</p>
            <div className="cn-g3" style={{ marginTop: 20 }}>
              {[
                ['Salón listo', 'Limpio, ventilado y con mats y props acomodados 15 minutos antes de tu clase.'],
                ['Tu bloque es tuyo', 'Día y hora fijos cada semana. Nadie más lo toca.'],
                ['Te ayudamos a llenar', 'Tu clase aparece en nuestro calendario y en el Instagram de Cenote.'],
                ['Un argumento de venta', `Tus alumnos entran al spa con tu código: circuito a $350 en lugar de ${circuito ? mxn(circuito.precio) : '$500'}.`],
                ['Cobras tú, directo', 'Tu gente te paga a ti. Sin comisiones, sin porcentajes, sin intermediarios.'],
                ['La mejor ubicación', 'Condesa, 2º piso del Hotel Flow. Cerca de Roma e Hipódromo.'],
              ].map(([t, d], i) => (
                <div key={t} style={{ borderTop: `1px solid ${CENOTE.tinta}`, paddingTop: 14 }}>
                  <p style={{ fontFamily: GROTESK, fontSize: 13, margin: 0, color: CENOTE.oxido }}>{String(i + 1).padStart(2, '0')}</p>
                  <p style={{ fontFamily: INTER, fontWeight: 600, fontSize: 16, margin: '6px 0 0' }}>{t}</p>
                  <p style={{ ...S.cuerpo, fontSize: 14, marginTop: 6 }}>{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Cómo funciona */}
          <div style={{ marginTop: 64 }}>
            <p style={S.eyebrow}>Cómo entras</p>
            <div className="cn-g4" style={{ marginTop: 20 }}>
              {[
                ['01', 'Solicitud', 'Nos cuentas qué das y cuántos alumnos tienes.'],
                ['02', 'Recorrido', '20 minutos esta semana. Haces la cuenta con tus números.'],
                ['03', 'Código de acceso', 'Te apartamos el bloque 48 h y te mandamos tu código.'],
                ['04', 'Firma y arranca', `Eliges plan aquí, firmas y depositas. Tu primera clase, esa semana.`],
              ].map(([n, t, d]) => (
                <div key={n} style={{ background: CENOTE.papel, borderRadius: 3, padding: '18px 16px' }}>
                  <p style={{ fontFamily: GROTESK, fontSize: 30, margin: 0, lineHeight: 1 }}>{n}</p>
                  <p style={{ fontFamily: INTER, fontWeight: 600, fontSize: 15, margin: '12px 0 0' }}>{t}</p>
                  <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0' }}>{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Solicitud + acceso */}
          <div id="solicitud" className="cn-g2" style={{ marginTop: 64, alignItems: 'start', scrollMarginTop: 80 }}>
            <Solicitud planes={planes} plan={planElegido} setPlan={setPlanElegido} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div id="acceso" style={{ background: CENOTE.tinta, color: CENOTE.arena, borderRadius: 3, padding: '26px 24px', scrollMarginTop: 80 }}>
                <p style={{ ...EYEBROW, color: CENOTE.oliva, margin: 0 }}>¿Ya hiciste el recorrido?</p>
                <p style={{ fontFamily: GROTESK, fontSize: 28, fontWeight: 500, textTransform: 'uppercase', margin: '12px 0 8px', lineHeight: 1.05 }}>Entra con tu código</p>
                <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 14.5, lineHeight: 1.55, margin: '0 0 20px', opacity: 0.88 }}>
                  Con el código que te dimos eliges tu membresía, confirmas tu bloque y ves exactamente cuánto depositar.
                </p>
                <Boton tono="papel" full onClick={() => setAccesoOpen('')}>Tengo código de acceso</Boton>
              </div>
              <Reglas />
            </div>
          </div>

          {/* Objeciones */}
          <div style={{ marginTop: 64 }}>
            <p style={S.eyebrow}>Lo que nos preguntan</p>
            <div style={{ marginTop: 14 }}>
              {[
                ['¿No está caro?', `Haz la cuenta con tu clase: con 8 alumnos a $250 cobras $2,000 por clase. La renta del mes se paga con la primera clase y un poco más. Y aquí no hay porcentaje por alumno.`],
                ['Todavía no tengo tantos alumnos.', 'Empieza con Base: un bloque de 2 horas por semana. Tu clase aparece en nuestro calendario e Instagram, y tus alumnos tienen precio especial en el spa. Eso ayuda a llenar.'],
                ['Prefiero pagar solo cuando doy clase.', `Existe: evento o taller sin membresía a ${evento ? mxn(evento.precio) : '$1,000'} la hora, mínimo 2 horas. Con membresía, tu hora sale desde ${base && base.horas_mes ? mxn(Math.floor(base.precio / base.horas_mes)) : '$312'}.`],
                ['¿Me dan el primer mes gratis?', 'No hay descuentos fuera de lista. Lo que sí hay: precio congelado 6 meses si firmas antes del 31 de diciembre.'],
                ['¿Y si un día no puedo dar clase?', 'Avisa la noche anterior antes de las 20:00. La hora no se repone: es tu bloque, lo uses o no.'],
                ['¿Puedo compartir mi bloque?', 'No, el bloque es personal. Si otro maestro quiere dar clase, que tenga su propia membresía.'],
                ['¿Tengo exclusividad de mi disciplina?', 'Tu bloque es tuyo y nadie lo toca. La disciplina no es exclusiva: el salón tiene que estar lleno para seguir existiendo.'],
              ].map(([q, a]) => (
                <details key={q} className="cn-faq" style={{ borderTop: `1px solid ${CENOTE.tinta}` }}>
                  <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', fontFamily: INTER, fontWeight: 500, fontSize: 16 }}>
                    {q}<span className="cn-mas" style={{ fontFamily: GROTESK, fontSize: 24, transition: 'transform .15s', lineHeight: 1, marginLeft: 12 }}>+</span>
                  </summary>
                  <p style={{ ...S.cuerpo, fontSize: 15, padding: '0 0 20px', maxWidth: 720 }}>{a}</p>
                </details>
              ))}
              <div style={S.regla} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ SPA ═══════════════════════ */}
      <Spa catalogo={catalogo} onComprar={setSpaItem} />

      {/* ─── Pie ─── */}
      <footer style={{ background: CENOTE.tinta, color: CENOTE.arena, padding: '48px 0 40px' }}>
        <div className="cn-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: 28, justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <Marca color={CENOTE.arena} />
            <p style={{ fontFamily: MANO, fontSize: 18, color: CENOTE.oliva, margin: '18px 0 0' }}>Sin prisa, con intención.</p>
          </div>
          <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 300, lineHeight: 1.7, textAlign: 'right' }}>
            <p style={{ ...EYEBROW, fontSize: 11, margin: 0 }}>{LUGAR.calle} · {LUGAR.colonia}</p>
            <p style={{ margin: '4px 0 0', opacity: 0.8 }}>{LUGAR.referencia} · Spa de 10:00 a 21:00</p>
            <a href={LUGAR.mapa} target="_blank" rel="noreferrer" style={{ color: CENOTE.oliva, ...EYEBROW, fontSize: 11 }}>Cómo llegar →</a>
          </div>
        </div>
      </footer>

      {/* Botón fijo en el teléfono: el spa siempre a un toque */}
      <div className="cn-movil" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 15, display: 'flex', gap: 8 }}>
        <style>{'@media(min-width:760px){.cn-movil{display:none!important}}'}</style>
        <div style={{ flex: 1 }}><Boton full onClick={() => irA('salon')} tono="papel">Renta el salón</Boton></div>
        <div style={{ flex: 1 }}><Boton full onClick={() => circuito && setSpaItem(circuito)}>Reservar spa</Boton></div>
      </div>
      <div style={{ height: 76 }} className="cn-movil" />

      {spaItem && <CompraSpa item={spaItem} onClose={() => setSpaItem(null)} />}
      {accesoOpen !== null && <Acceso inicial={accesoOpen} planes={planes} onClose={() => setAccesoOpen(null)} />}
    </div>
  )
}

function Stepper({ label, valor, set, paso, min, max, fmt }: {
  label: string; valor: number; set: (n: number) => void; paso: number; min: number; max: number; fmt?: (n: number) => string
}) {
  return (
    <div>
      <span style={{ ...EYEBROW, fontSize: 10.5, color: CENOTE.humo }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, border: `1px solid ${CENOTE.tinta}`, borderRadius: 2, background: CENOTE.papel }}>
        <button aria-label={`Menos ${label}`} onClick={() => set(Math.max(min, valor - paso))}
          style={{ width: 48, height: 48, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: CENOTE.tinta }}>−</button>
        <span style={{ flex: 1, textAlign: 'center', fontFamily: GROTESK, fontSize: 22 }}>{fmt ? fmt(valor) : valor}</span>
        <button aria-label={`Más ${label}`} onClick={() => set(Math.min(max, valor + paso))}
          style={{ width: 48, height: 48, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: CENOTE.tinta }}>+</button>
      </div>
    </div>
  )
}

// ─── Calculadora del facilitador ─────────────────────────────────────────────
// La objeción número uno es "está caro". La respuesta de la guía de venta es
// hacer la cuenta con SUS números — esto es esa cuenta, en vivo.
function Calculadora({ planes, onPlan }: { planes: Item[]; onPlan: (code: string) => void }) {
  const [alumnos, setAlumnos] = useState(8)
  const [precio, setPrecio] = useState(250)
  const [clasesSemana, setClasesSemana] = useState(2)

  const clasesMes = clasesSemana * 4
  const ingreso = alumnos * precio * clasesMes
  // Clases de 1 h: el plan que alcanza para las horas del mes
  const plan = planes.find(p => (p.horas_mes ?? 0) >= clasesMes) ?? planes[planes.length - 1]
  const renta = plan?.precio ?? 0
  const queda = ingreso - renta
  const clasesParaPagar = alumnos * precio > 0 ? Math.ceil(renta / (alumnos * precio)) : 0

  return (
    <div style={{ marginTop: 40, background: CENOTE.papel, borderRadius: 3, padding: '26px 22px' }}>
      <p style={{ ...S.eyebrow }}>Haz la cuenta con tus números</p>
      <div className="cn-g3" style={{ marginTop: 18 }}>
        <Stepper label="Alumnos por clase" valor={alumnos} set={setAlumnos} paso={1} min={1} max={30} />
        <Stepper label="Cobras por alumno" valor={precio} set={setPrecio} paso={25} min={50} max={1000} fmt={mxn} />
        <Stepper label="Clases por semana" valor={clasesSemana} set={setClasesSemana} paso={1} min={1} max={6} />
      </div>
      <div className="cn-g3" style={{ marginTop: 22, borderTop: `1px solid ${CENOTE.tinta}`, paddingTop: 20 }}>
        <div>
          <p style={{ ...EYEBROW, fontSize: 10.5, color: CENOTE.humo, margin: 0 }}>Cobras al mes</p>
          <p style={{ fontFamily: GROTESK, fontSize: 34, margin: '6px 0 0' }}>{mxn(ingreso)}</p>
          <p style={{ fontFamily: INTER, fontSize: 12.5, fontWeight: 300, margin: '2px 0 0' }}>{clasesMes} clases · {mxn(alumnos * precio)} por clase</p>
        </div>
        <div>
          <p style={{ ...EYEBROW, fontSize: 10.5, color: CENOTE.humo, margin: 0 }}>Renta · plan {plan?.nombre}</p>
          <p style={{ fontFamily: GROTESK, fontSize: 34, margin: '6px 0 0' }}>{mxn(renta)}</p>
          <p style={{ fontFamily: INTER, fontSize: 12.5, fontWeight: 300, margin: '2px 0 0' }}>
            Se paga con {clasesParaPagar <= 1 ? 'tu primera clase' : `tus primeras ${clasesParaPagar} clases`}
          </p>
        </div>
        <div style={{ background: queda > 0 ? CENOTE.oliva : 'rgba(142,53,35,.12)', borderRadius: 3, padding: '14px 16px' }}>
          <p style={{ ...EYEBROW, fontSize: 10.5, margin: 0 }}>Te quedan al mes</p>
          <p style={{ fontFamily: GROTESK, fontSize: 34, margin: '6px 0 0' }}>{mxn(queda)}</p>
          <p style={{ fontFamily: INTER, fontSize: 12.5, margin: '2px 0 0' }}>Sin porcentaje por alumno</p>
        </div>
      </div>
      {plan && (
        <div style={{ marginTop: 18 }}>
          <Boton onClick={() => onPlan(plan.code)}>Quiero el plan {plan.nombre}</Boton>
        </div>
      )}
    </div>
  )
}

function Reglas() {
  return (
    <div style={{ border: `1px solid ${CENOTE.tinta}`, borderRadius: 3, padding: '22px 22px' }}>
      <p style={{ ...S.eyebrow, margin: 0 }}>Reglas claras</p>
      <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', fontFamily: INTER, fontSize: 14, fontWeight: 300, lineHeight: 1.55 }}>
        {[
          ['Tú', 'traes, registras y cobras a tu gente.'],
          ['Nosotros', 'salón listo 15 min antes, mats y props.'],
          ['Contrato', `depósito de ${mxn(DEPOSITO)}; los daños los cubre el facilitador.`],
          ['Pago', 'el día 1 de cada mes. Las horas no se acumulan.'],
          ['Cancelar', 'la noche anterior, antes de las 20:00.'],
          ['Pagos', 'siempre a la cuenta de HOG. Nunca a una persona.'],
        ].map(([k, v]) => (
          <li key={k} style={{ padding: '6px 0', borderBottom: '1px solid rgba(7,21,24,.1)' }}>
            <strong style={{ fontWeight: 600 }}>{k}:</strong> {v}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Solicitud de facilitador ────────────────────────────────────────────────
function Solicitud({ planes, plan, setPlan }: { planes: Item[]; plan: string; setPlan: (s: string) => void }) {
  const [f, setF] = useState({ nombre: '', telefono: '', correo: '', disciplina: '', alumnos: '', donde: '', dia: '', hora: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [listo, setListo] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }))

  const enviar = async () => {
    setMsg(null)
    if (f.nombre.trim().length < 2) return setMsg({ text: 'Escribe tu nombre.', error: true })
    if (f.telefono.replace(/\D/g, '').length < 10) return setMsg({ text: 'Tu WhatsApp debe tener 10 dígitos.', error: true })
    setBusy(true)
    const horario = [f.dia, f.hora].filter(Boolean).join(' ')
    const { data, error } = await supabase.rpc('fn_cenote_solicitud', {
      p_nombre: f.nombre, p_telefono: f.telefono, p_correo: f.correo, p_disciplina: f.disciplina,
      p_alumnos: f.alumnos ? Number(f.alumnos) : null, p_donde: f.donde, p_plan: plan, p_horario: horario,
    })
    setBusy(false)
    if (error) return setMsg({ text: SIN_SQL, error: true })
    if (!data?.ok) return setMsg({ text: data?.error ?? SIN_SQL, error: true })
    setListo(true)
  }

  if (listo) {
    return (
      <div style={{ background: CENOTE.papel, borderRadius: 3, padding: '30px 24px' }}>
        <p style={S.eyebrow}>Solicitud recibida</p>
        <p style={{ fontFamily: GROTESK, fontSize: 30, fontWeight: 500, textTransform: 'uppercase', margin: '12px 0 10px', lineHeight: 1.05 }}>
          Gracias, {f.nombre.trim().split(' ')[0]}.
        </p>
        <p style={{ ...S.cuerpo, fontSize: 15 }}>
          Te escribimos por WhatsApp en menos de 24 horas para agendar tu recorrido de 20 minutos.
          Si te late el espacio, te apartamos el bloque 48 horas y te mandamos tu código de acceso.
        </p>
        <p style={{ ...S.mano, fontSize: 20, margin: '18px 0 0' }}>Nos vemos en el 2º piso.</p>
      </div>
    )
  }

  return (
    <div style={{ background: CENOTE.papel, borderRadius: 3, padding: '26px 22px' }}>
      <p style={S.eyebrow}>Solicita tu bloque</p>
      <p style={{ fontFamily: GROTESK, fontSize: 28, fontWeight: 500, textTransform: 'uppercase', margin: '12px 0 6px', lineHeight: 1.05 }}>Cuéntanos de tu clase</p>
      <p style={{ ...S.cuerpo, fontSize: 14, marginBottom: 20 }}>Dos minutos. Te contactamos para el recorrido.</p>

      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {planes.map(p => (
            <button key={p.code} onClick={() => setPlan(p.code)} className="cn-btn"
              style={{ flex: '1 1 0', minWidth: 90, padding: '10px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: INTER, fontSize: 13,
                border: `1px solid ${CENOTE.tinta}`, background: plan === p.code ? CENOTE.tinta : 'transparent', color: plan === p.code ? CENOTE.arena : CENOTE.tinta }}>
              <strong style={{ fontWeight: 600 }}>{p.nombre}</strong> · {p.horas_mes} h
            </button>
          ))}
        </div>
        <Campo label="Nombre"><input className="cn-input" value={f.nombre} onChange={set('nombre')} autoComplete="name" /></Campo>
        <Campo label="WhatsApp"><input className="cn-input" value={f.telefono} onChange={set('telefono')} inputMode="tel" autoComplete="tel" placeholder="55 1234 5678" /></Campo>
        <Campo label="Correo (opcional)"><input className="cn-input" value={f.correo} onChange={set('correo')} type="email" autoComplete="email" /></Campo>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Campo label="¿Qué das?">
            <select className="cn-input" value={f.disciplina} onChange={set('disciplina')}>
              <option value="">Elige</option>
              {['Yoga', 'Pilates mat', 'Breathwork', 'Meditación', 'Sound healing', 'Movilidad', 'Danza', 'Otra'].map(d => <option key={d}>{d}</option>)}
            </select>
          </Campo>
          <Campo label="Alumnos fijos">
            <input className="cn-input" value={f.alumnos} onChange={set('alumnos')} inputMode="numeric" placeholder="8" />
          </Campo>
        </div>
        <Campo label="¿Dónde das clase hoy?"><input className="cn-input" value={f.donde} onChange={set('donde')} placeholder="Parque, casa, otro estudio…" /></Campo>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Campo label="Día ideal">
            <select className="cn-input" value={f.dia} onChange={set('dia')}>
              <option value="">Elige</option>
              {DIAS.map(d => <option key={d}>{d}</option>)}
            </select>
          </Campo>
          <Campo label="Hora ideal">
            <select className="cn-input" value={f.hora} onChange={set('hora')}>
              <option value="">Elige</option>
              {HORAS_BLOQUE.map(h => <option key={h} value={h}>{h}{PRIME.has(h) ? ' · prime' : ''}</option>)}
            </select>
          </Campo>
        </div>
        <Boton full onClick={enviar} disabled={busy}>{busy ? 'Enviando…' : 'Quiero mi recorrido'}</Boton>
        <Aviso msg={msg} />
        <p style={{ fontFamily: INTER, fontSize: 12, color: CENOTE.humo, margin: 0 }}>
          Horario prime: 7 a 10 y 18 a 21 h. Son los primeros que se van.
        </p>
      </div>
    </div>
  )
}

// ─── Acceso con código: elegir plan y confirmar bloque ───────────────────────
interface Fac {
  nombre: string; codigo: string; status: string; disciplina: string | null; bloque: string | null
  plan_code: string | null; deposito: number | null; primer_mes: number | null; precio_congelado_hasta: string | null
}
interface Contrato { plan: string; precio: number; deposito: number; total: number; bloque: string; codigo: string; precio_congelado_hasta: string | null }

function Acceso({ inicial, planes, onClose }: { inicial: string; planes: Item[]; onClose: () => void }) {
  const [codigo, setCodigo] = useState(inicial)
  const [fac, setFac] = useState<Fac | null>(null)
  const [plan, setPlan] = useState('plus')
  const [dia, setDia] = useState('')
  const [hora, setHora] = useState('')
  const [acepta, setAcepta] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [contrato, setContrato] = useState<Contrato | null>(null)

  const entrar = useCallback(async (c: string) => {
    if (!c.trim()) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('fn_cenote_acceso', { p_codigo: c })
    setBusy(false)
    if (error) return setMsg({ text: SIN_SQL, error: true })
    if (!data?.ok) return setMsg({ text: data?.error ?? 'Código no válido.', error: true })
    const f = data as Fac
    setFac(f)
    if (f.plan_code && planes.some(p => p.code === f.plan_code)) setPlan(f.plan_code)
    if (f.bloque) {
      const [d, h] = f.bloque.split(' ')
      if (DIAS.includes(d)) setDia(d)
      if (h && HORAS_BLOQUE.includes(h)) setHora(h)
    }
  }, [planes])

  useEffect(() => { if (inicial) void entrar(inicial) }, [inicial, entrar])

  const elegido = planes.find(p => p.code === plan)

  const contratar = async () => {
    if (!fac) return
    if (!dia || !hora) return setMsg({ text: 'Elige el día y la hora de tu bloque.', error: true })
    if (!acepta) return setMsg({ text: 'Acepta las reglas del espacio para continuar.', error: true })
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('fn_cenote_contratar', { p_codigo: fac.codigo, p_plan: plan, p_bloque: `${dia} ${hora}`, p_acepta: acepta })
    setBusy(false)
    if (error) return setMsg({ text: SIN_SQL, error: true })
    if (!data?.ok) return setMsg({ text: data?.error ?? SIN_SQL, error: true })
    setContrato(data as Contrato)
  }

  return (
    <Hoja titulo="Acceso facilitador" onClose={onClose}>
      {!fac && (
        <div>
          <p style={{ fontFamily: GROTESK, fontSize: 28, fontWeight: 500, textTransform: 'uppercase', margin: '0 0 8px', lineHeight: 1.05 }}>Tu código de acceso</p>
          <p style={{ ...S.cuerpo, fontSize: 14.5, marginBottom: 18 }}>Te lo mandamos por WhatsApp después del recorrido. ¿Aún no lo tienes? Solicita tu bloque y te contactamos.</p>
          <Campo label="Código">
            <input className="cn-input" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} autoFocus
              autoCapitalize="characters" style={{ fontFamily: GROTESK, fontSize: 22, letterSpacing: '0.12em' }}
              onKeyDown={e => { if (e.key === 'Enter') entrar(codigo) }} />
          </Campo>
          <div style={{ marginTop: 16 }}><Boton full onClick={() => entrar(codigo)} disabled={busy || !codigo.trim()}>{busy ? 'Revisando…' : 'Entrar'}</Boton></div>
          <Aviso msg={msg} />
        </div>
      )}

      {fac && fac.status === 'activo' && !contrato && (
        <div>
          <p style={{ fontFamily: GROTESK, fontSize: 28, fontWeight: 500, textTransform: 'uppercase', margin: 0 }}>Hola, {fac.nombre.split(' ')[0]}.</p>
          <p style={{ ...S.cuerpo, fontSize: 15, marginTop: 10 }}>
            Tu membresía {planes.find(p => p.code === fac.plan_code)?.nombre ?? ''} está activa{fac.bloque ? ` · bloque ${fac.bloque}` : ''}.
          </p>
          <CodigoAlumnos codigo={fac.codigo} />
        </div>
      )}

      {fac && fac.status !== 'activo' && !contrato && (
        <div>
          <p style={{ fontFamily: GROTESK, fontSize: 28, fontWeight: 500, textTransform: 'uppercase', margin: 0, lineHeight: 1.05 }}>Bienvenido, {fac.nombre.split(' ')[0]}.</p>
          <p style={{ ...S.cuerpo, fontSize: 14.5, marginTop: 8 }}>Elige tu membresía y confirma tu bloque fijo semanal.</p>

          <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
            {planes.map(p => (
              <button key={p.code} onClick={() => setPlan(p.code)} className="cn-btn"
                style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 2, cursor: 'pointer',
                  border: `1px solid ${CENOTE.tinta}`, background: plan === p.code ? CENOTE.tinta : CENOTE.papel, color: plan === p.code ? CENOTE.arena : CENOTE.tinta }}>
                <span>
                  <span style={{ fontFamily: INTER, fontWeight: 600, fontSize: 15 }}>{p.nombre}</span>
                  <span style={{ fontFamily: INTER, fontWeight: 300, fontSize: 13, display: 'block', marginTop: 2 }}>{p.horas_mes} h al mes · {p.horas_mes ? mxn(Math.floor(p.precio / p.horas_mes)) : ''} la hora</span>
                </span>
                <span style={{ fontFamily: GROTESK, fontSize: 22 }}>{mxn(p.precio)}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
            <Campo label="Día">
              <select className="cn-input" value={dia} onChange={e => setDia(e.target.value)}>
                <option value="">Elige</option>
                {DIAS.map(d => <option key={d}>{d}</option>)}
              </select>
            </Campo>
            <Campo label="Hora">
              <select className="cn-input" value={hora} onChange={e => setHora(e.target.value)}>
                <option value="">Elige</option>
                {HORAS_BLOQUE.map(h => <option key={h} value={h}>{h}{PRIME.has(h) ? ' · prime' : ''}</option>)}
              </select>
            </Campo>
          </div>
          <p style={{ fontFamily: INTER, fontSize: 12, color: CENOTE.humo, margin: '6px 0 0' }}>Es el bloque que vimos en el recorrido. Si cambia, lo confirmamos por WhatsApp.</p>

          {elegido && (
            <div style={{ marginTop: 18, background: CENOTE.papel, borderRadius: 3, padding: '14px 16px', fontFamily: INTER, fontSize: 14 }}>
              <Linea k="Depósito (reembolsable)" v={mxn(DEPOSITO)} />
              <Linea k={`Primer mes · ${elegido.nombre}`} v={mxn(elegido.precio)} />
              <div style={{ borderTop: `1px solid ${CENOTE.tinta}`, marginTop: 8, paddingTop: 8 }}>
                <Linea k="Para arrancar" v={mxn(DEPOSITO + elegido.precio)} fuerte />
              </div>
              {new Date() <= CONGELA_HASTA && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: CENOTE.oxido }}>Precio congelado 6 meses por firmar antes del 31 de diciembre.</p>}
            </div>
          )}

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontFamily: INTER, fontSize: 13.5, lineHeight: 1.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: CENOTE.tinta }} />
            <span>Acepto las reglas del espacio: pago el día 1, las horas no se acumulan, cancelo antes de las 20:00 del día anterior, el bloque es personal y los daños los cubro yo.</span>
          </label>

          <div style={{ marginTop: 16 }}><Boton full onClick={contratar} disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar membresía'}</Boton></div>
          <Aviso msg={msg} />
        </div>
      )}

      {contrato && (
        <div>
          <p style={S.eyebrow}>Membresía apartada</p>
          <p style={{ fontFamily: GROTESK, fontSize: 30, fontWeight: 500, textTransform: 'uppercase', margin: '10px 0 0', lineHeight: 1.05 }}>{contrato.plan} · {contrato.bloque}</p>
          <div style={{ marginTop: 18, background: CENOTE.papel, borderRadius: 3, padding: '14px 16px', fontFamily: INTER, fontSize: 14 }}>
            <Linea k="Depósito" v={mxn(contrato.deposito)} />
            <Linea k="Primer mes" v={mxn(contrato.precio)} />
            <div style={{ borderTop: `1px solid ${CENOTE.tinta}`, marginTop: 8, paddingTop: 8 }}><Linea k="Total a depositar" v={mxn(contrato.total)} fuerte /></div>
            {contrato.precio_congelado_hasta && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: CENOTE.oxido }}>Precio congelado hasta el {fechaMes(contrato.precio_congelado_hasta)}.</p>}
          </div>
          <ol style={{ fontFamily: INTER, fontSize: 14, fontWeight: 300, lineHeight: 1.6, paddingLeft: 20, margin: '18px 0 0' }}>
            <li>Te mandamos por WhatsApp la cuenta de HOG para el depósito. Nunca pagues a una cuenta personal.</li>
            <li>Firmas el acuerdo de uso del espacio.</li>
            <li>Con contrato y depósito, tu bloque queda activo y arrancas esa semana.</li>
          </ol>
          <CodigoAlumnos codigo={contrato.codigo} />
        </div>
      )}
    </Hoja>
  )
}

function Linea({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: fuerte ? 600 : 400, fontSize: fuerte ? 16 : 14 }}>
      <span>{k}</span><span>{v}</span>
    </div>
  )
}

/** El gancho para el facilitador: su código le da precio a sus alumnos. */
function CodigoAlumnos({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false)
  const texto = `Después de clase, pasa al spa de Cenote (sauna, vapor y cold plunge). Con mi código ${codigo} el circuito te sale en $350: ${location.origin}/cenote#spa`
  return (
    <div style={{ marginTop: 20, background: CENOTE.cielo, borderRadius: 3, padding: '18px 18px' }}>
      <p style={{ ...EYEBROW, margin: 0 }}>Tu código para alumnos</p>
      <p style={{ fontFamily: GROTESK, fontSize: 34, letterSpacing: '0.1em', margin: '8px 0 4px' }}>{codigo}</p>
      <p style={{ fontFamily: INTER, fontSize: 13.5, fontWeight: 300, margin: 0, lineHeight: 1.5 }}>Tus alumnos pagan el circuito a $350 en lugar de $500. Compártelo al final de cada clase: es tu mejor argumento.</p>
      <div style={{ marginTop: 14 }}>
        <Boton tono="tinta" onClick={() => { navigator.clipboard?.writeText(texto).then(() => setCopiado(true)).catch(() => {}) }}>
          {copiado ? 'Mensaje copiado' : 'Copiar mensaje para mis alumnos'}
        </Boton>
      </div>
    </div>
  )
}

// ─── Spa ─────────────────────────────────────────────────────────────────────
function Spa({ catalogo, onComprar }: { catalogo: Item[]; onComprar: (i: Item) => void }) {
  const spa = catalogo.filter(i => i.linea === 'spa')
  const fundador = spa.find(i => i.code === 'recovery_fundador')
  const circuito = spa.find(i => i.code === 'circuito')
  const paq4 = spa.find(i => i.code === 'paq4')

  return (
    <section id="spa" style={{ background: CENOTE.arena, padding: '64px 0 72px', scrollMarginTop: 64 }}>
      <div className="cn-wrap">
        <p style={S.eyebrow}>El spa · Sauna · Vapor · Cold plunge · Masajes</p>
        <h2 className="cn-h2" style={{ ...S.display, marginTop: 16 }}>Calor.<br />Vapor.<br />Frío.</h2>
        <p style={{ ...S.mano, fontSize: 26, margin: '12px 0 0' }}>Y una pausa.</p>
        <p style={{ ...S.cuerpo, fontSize: 17, maxWidth: 600, marginTop: 18 }}>
          75 minutos a tu ritmo, solo dos personas por turno. Elige, aparta tu lugar y llega diez minutos antes.
        </p>

        {/* Lo más vendido, arriba */}
        <div className="cn-g3" style={{ marginTop: 36 }}>
          {circuito && (
            <Destacado tono={CENOTE.cielo} eyebrow="Para empezar" titulo={circuito.nombre} precio={mxn(circuito.precio)}
              texto={circuito.detalle ?? ''} cta="Apartar turno" onClick={() => onComprar(circuito)} />
          )}
          {paq4 && (
            <Destacado tono={CENOTE.papel} eyebrow="Si vas a volver" titulo={paq4.nombre} precio={mxn(paq4.precio)}
              texto={`Te sale en ${mxn(paq4.precio / 4)} cada visita. ${paq4.detalle ?? ''}`} cta="Comprar paquete" onClick={() => onComprar(paq4)} />
          )}
          {fundador && (
            <Destacado tono={CENOTE.oliva} eyebrow={fundador.disponibles != null ? `Quedan ${fundador.disponibles} de 10` : 'Solo 10 lugares'}
              titulo={fundador.nombre} precio={`${mxn(fundador.precio)}`} unidad="al mes"
              texto="Un circuito al día, todos los días. Precio congelado 6 meses. Sin permanencia."
              cta={fundador.disponibles === 0 ? 'Agotado' : 'Quiero ser fundador'} disabled={fundador.disponibles === 0} onClick={() => onComprar(fundador)} />
          )}
        </div>

        {/* El menú completo, como el impreso */}
        <div className="cn-menu" style={{ marginTop: 56 }}>
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
                  <button key={i.code} className="cn-row" onClick={() => i.disponibles !== 0 && onComprar(i)}
                    style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(7,21,24,.1)', padding: '14px 4px', cursor: i.disponibles === 0 ? 'default' : 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start', color: CENOTE.tinta }}>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontFamily: INTER, fontWeight: 500, fontSize: 16, display: 'block' }}>{i.nombre}</span>
                      <span style={{ fontFamily: INTER, fontWeight: 300, fontSize: 13, display: 'block', marginTop: 3, lineHeight: 1.45 }}>{i.detalle}</span>
                      {i.grupo === 'paquete' && (
                        <span style={{ fontFamily: INTER, fontSize: 12, color: CENOTE.oxido, display: 'block', marginTop: 3 }}>
                          {mxn(Math.round(i.precio / (i.code === 'paq8' ? 8 : 4)))} c/u
                        </span>
                      )}
                    </span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontFamily: INTER, fontWeight: 600, fontSize: 16, display: 'block' }}>{mxn(i.precio)}</span>
                      {i.unidad && <span style={{ fontFamily: INTER, fontSize: 11, color: CENOTE.humo }}>{i.unidad}</span>}
                      <span style={{ ...EYEBROW, fontSize: 10, display: 'block', marginTop: 6, color: CENOTE.oxido }}>
                        {i.disponibles === 0 ? 'Agotado' : i.agenda ? 'Reservar' : 'Comprar'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        {/* Códigos y políticas — el bloque oscuro del menú impreso */}
        <div style={{ marginTop: 56, background: CENOTE.tinta, color: CENOTE.arena, borderRadius: 3, padding: '26px 24px' }}>
          <p style={{ ...EYEBROW, color: CENOTE.oliva, margin: 0 }}>Precios especiales</p>
          <div className="cn-g2" style={{ marginTop: 16 }}>
            <div>
              <p style={{ fontFamily: GROTESK, fontSize: 24, margin: 0, textTransform: 'uppercase' }}>Huéspedes Hotel Flow</p>
              <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 14, margin: '6px 0 0', lineHeight: 1.5 }}>10 % en todo el spa con el código <strong style={{ fontWeight: 600, color: CENOTE.oliva }}>FLOW</strong> y tu número de habitación. Circuito a $450.</p>
            </div>
            <div>
              <p style={{ fontFamily: GROTESK, fontSize: 24, margin: 0, textTransform: 'uppercase' }}>Alumnos de nuestros facilitadores</p>
              <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 14, margin: '6px 0 0', lineHeight: 1.5 }}>Circuito post-clase a <strong style={{ fontWeight: 600, color: CENOTE.oliva }}>$350</strong> con el código de tu maestro.</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(238,235,221,.2)', marginTop: 22, paddingTop: 16, fontFamily: INTER, fontSize: 12.5, fontWeight: 300, lineHeight: 1.6, opacity: 0.85 }}>
            Turnos cada 90 min, de 10:00 a 21:00 · 2 personas por turno · reserva previa.<br />
            Masaje cancelado con menos de 12 h: se cobra el 50 %. Circuito con menos de 4 h: se descuenta del paquete.
          </div>
        </div>
      </div>
    </section>
  )
}

function Destacado({ tono, eyebrow, titulo, precio, unidad, texto, cta, onClick, disabled }: {
  tono: string; eyebrow: string; titulo: string; precio: string; unidad?: string; texto: string; cta: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <div style={{ background: tono, borderRadius: 3, padding: '24px 22px', display: 'flex', flexDirection: 'column' }}>
      <p style={{ ...EYEBROW, margin: 0 }}>{eyebrow}</p>
      <p style={{ fontFamily: GROTESK, fontSize: 26, fontWeight: 500, textTransform: 'uppercase', margin: '12px 0 0', lineHeight: 1.05 }}>{titulo}</p>
      <p style={{ fontFamily: GROTESK, fontSize: 44, margin: '10px 0 0', lineHeight: 1 }}>{precio}{unidad && <span style={{ fontFamily: INTER, fontSize: 13 }}> {unidad}</span>}</p>
      <p style={{ fontFamily: INTER, fontWeight: 300, fontSize: 14, lineHeight: 1.5, margin: '12px 0 18px', flex: 1 }}>{texto}</p>
      <Boton full onClick={onClick} disabled={disabled}>{cta}</Boton>
    </div>
  )
}

// ─── Compra del spa ──────────────────────────────────────────────────────────
interface Ticket { folio: string; producto: string; fecha: string | null; turno: string | null; precio_lista: number; descuento: number; total: number }

function CompraSpa({ item, onClose }: { item: Item; onClose: () => void }) {
  const dias = useMemo(() => {
    const out: string[] = []; const h = new Date()
    for (let i = 0; i < 14; i++) out.push(iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + i)))
    return out
  }, [])
  const [fecha, setFecha] = useState(dias[0])
  const [turno, setTurno] = useState('')
  const [ocupados, setOcupados] = useState<Record<string, number>>({})
  const [f, setF] = useState({ nombre: '', telefono: '', correo: '', codigo: '', habitacion: '' })
  const [desc, setDesc] = useState<Desc | null>(null)
  const [codigoMsg, setCodigoMsg] = useState<string | null>(null)
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

  const validarCodigo = async () => {
    setCodigoMsg(null); setDesc(null)
    if (!f.codigo.trim()) return
    const { data, error } = await supabase.rpc('fn_cenote_codigo', { p_codigo: f.codigo })
    if (error) return setCodigoMsg('No pudimos revisar el código ahora; lo validamos al pagar.')
    if (!data?.ok) return setCodigoMsg(data?.error ?? 'Código no válido.')
    const d = data as Desc
    if (d.tipo === 'alumno' && item.code !== 'circuito') { setCodigoMsg('El código de tu maestro aplica al circuito individual.'); return }
    setDesc(d)
  }

  const { descuento, total } = precioSpa(item, desc)

  const comprar = async () => {
    setMsg(null)
    if (item.agenda && !turno) return setMsg({ text: 'Elige un turno.', error: true })
    if (f.nombre.trim().length < 2) return setMsg({ text: 'Escribe tu nombre.', error: true })
    if (f.telefono.replace(/\D/g, '').length < 10) return setMsg({ text: 'Tu WhatsApp debe tener 10 dígitos.', error: true })
    setBusy(true)
    const { data, error } = await supabase.rpc('fn_cenote_spa_pedido', {
      p_producto: item.code, p_nombre: f.nombre, p_telefono: f.telefono, p_correo: f.correo,
      p_fecha: item.agenda ? fecha : null, p_turno: item.agenda ? turno : null,
      p_codigo: desc ? f.codigo : null, p_habitacion: f.habitacion,
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
            {ticket.descuento > 0 && <><Linea k="Precio" v={mxn(ticket.precio_lista)} /><Linea k="Descuento" v={`−${mxn(ticket.descuento)}`} /></>}
            <Linea k="Total" v={mxn(ticket.total)} fuerte />
          </div>
        </div>
        <p style={{ ...S.cuerpo, fontSize: 14, marginTop: 16 }}>
          Te escribimos por WhatsApp con el link de pago. <strong style={{ fontWeight: 600 }}>Tu lugar queda confirmado al pagar</strong> — también
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
        <Campo label="Código de descuento" nota={codigoMsg ?? (desc ? desc.etiqueta : 'FLOW si te hospedas en el hotel, o el código de tu maestro.')}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="cn-input" value={f.codigo} onChange={e => { setF(s => ({ ...s, codigo: e.target.value.toUpperCase() })); setDesc(null); setCodigoMsg(null) }}
              autoCapitalize="characters" style={{ letterSpacing: '0.08em' }} onBlur={validarCodigo} />
            <button onClick={validarCodigo} className="cn-btn"
              style={{ ...EYEBROW, fontSize: 11, padding: '0 14px', border: `1px solid ${CENOTE.tinta}`, background: 'transparent', color: CENOTE.tinta, borderRadius: 2, cursor: 'pointer' }}>Aplicar</button>
          </div>
        </Campo>
        {desc?.tipo === 'flow' && <Campo label="Habitación"><input className="cn-input" value={f.habitacion} onChange={set('habitacion')} inputMode="numeric" /></Campo>}
      </div>

      <div style={{ marginTop: 18, background: CENOTE.papel, borderRadius: 3, padding: '12px 16px', fontFamily: INTER }}>
        {descuento > 0 && <><Linea k="Precio" v={mxn(item.precio)} /><Linea k={desc?.etiqueta ?? 'Descuento'} v={`−${mxn(descuento)}`} /></>}
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
