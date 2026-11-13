// ─────────────────────────────────────────────────────────────────────────────
// Invitaciones del ronqueo — las 4 plantillas de Figma (página «10 ·
// Invitaciones · Ronqueo 20 nov») como árbol de Satori, a tamaño real:
//   67:21  invitado estratégico (venta) · feed   1080×1350 · modo Día
//   67:92  invitado estratégico (venta) · story  1080×1920 · modo Día
//   67:147 influencer cortesía · feed            1080×1350 · modo Noche
//   67:204 influencer cortesía · story           1080×1920 · modo Noche
//
// Este archivo NO importa nada: lo usan la edge function (PNG con resvg) y el
// navegador (vista previa en vivo con Satori). Medidas, colores, tracking e
// interlineados salen tal cual de get_design_context; no cambiarlos a ojo.
// ─────────────────────────────────────────────────────────────────────────────

export type Tipo = 'venta' | 'cortesia'
export type Formato = 'feed' | 'story'
export type Titular = 'invitada' | 'invitado' | 'invitados'

export type DatosInvitacion = {
  tipo: Tipo
  formato: Formato
  nombre: string        // como saludo: «magui», «walter y william»
  codigo: string        // RONQUEO-36 / CORTESÍA-09 (en cortesía no se pinta)
  firma: string         // «neto», «bruma records»… (se antepone «— »)
  titular?: Titular     // solo cortesía
  acompanantes?: number // solo cortesía: tú + N
}

export const MEDIDAS: Record<Formato, { w: number; h: number }> = {
  feed: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
}

// Fuentes que necesita Satori (familia, peso, clave del archivo .woff)
export const FUENTES = [
  { name: 'Inter', weight: 400, key: 'inter400' },
  { name: 'Inter', weight: 500, key: 'inter500' },
  { name: 'Inter', weight: 600, key: 'inter600' },
  { name: 'Inter', weight: 700, key: 'inter700' },
  { name: 'Inter', weight: 800, key: 'inter800' },
  { name: 'IBM Plex Mono', weight: 400, key: 'mono400' },
] as const

// Bruma · Semántico (variables de Figma), modo Día y modo Noche
const DIA = {
  bg: '#f4f1e9', texto: '#192623', secundario: '#887a5b', borde: '#192623',
  cajaCodigo: '#161714', etiquetaCodigo: '#f4f1e9', lima: '#daff62', vinyl: '#0f0f0f',
  pillBg: '#192623', pillTexto: '#f4f1e9',
}
const NOCHE = {
  bg: '#161714', texto: '#f4f1e9', secundario: '#9fa9b7', borde: '#f4f1e9',
  cajaCodigo: '#152c31', etiquetaCodigo: '#9fa9b7', lima: '#daff62', vinyl: '#0f0f0f',
  pillBg: '#daff62', pillTexto: '#0f0f0f',
}

const INTER = 'Inter'
const MONO = 'IBM Plex Mono'

// ── copy (minúsculas, igual que Figma) ──────────────────────────────────────
export function titularLineas(t: Titular = 'invitada'): [string, string] {
  return t === 'invitado' ? ['eres nuestro', 'invitado.'] : t === 'invitados' ? ['son nuestros', 'invitados.'] : ['eres nuestra', 'invitada.']
}
/** Texto del código en la cortesía: «magui + 1» (sin acompañantes, solo el nombre). */
export function codigoCortesia(nombre: string, n = 1) {
  return n > 0 ? `${nombre} + ${n}` : nombre
}
export function selloCortesia(n = 1): [string, string] {
  return ['cortesía', n > 0 ? `tú + ${n}` : 'solo tú']
}
function incluyeCortesia(n = 1) {
  const base = 'welcome drink, ronqueo y degustación para ti'
  return n <= 0 ? base : n === 1 ? `${base} y tu acompañante` : `${base} y tus ${n} acompañantes`
}

// ── mini «JSX» para Satori, sin React ───────────────────────────────────────
type Estilo = Record<string, string | number>
export type Nodo = { type: string; props: { style?: Estilo; children?: unknown; src?: string; width?: number; height?: number } }
const div = (style: Estilo, ...children: unknown[]): Nodo =>
  ({ type: 'div', props: { style: { display: 'flex', ...style }, children: children.length === 1 ? children[0] : children } })
const img = (src: string, width: number, height: number, style: Estilo = {}): Nodo =>
  ({ type: 'img', props: { src, width, height, style: { width, height, ...style } } })

/**
 * Árbol de Satori de una invitación. `src(nombre)` devuelve la URL o data URI
 * de cada asset de public/ronqueo/inv (el servidor usa data URIs embebidos).
 */
export function plantilla(d: DatosInvitacion, src: (archivo: string) => string): Nodo {
  const venta = d.tipo === 'venta'
  const story = d.formato === 'story'
  const c = venta ? DIA : NOCHE
  const { w, h } = MEDIDAS[d.formato]
  const n = d.acompanantes ?? 1

  // Medidas por formato (feed / story) — de los nodos 67:21 / 67:92 / 67:147 / 67:204
  const m = story
    ? { x: 80, headerY: 120, ancho: 920, contenidoY: 350, gap: 28, nombreW: 640, tituloW: 660, titulo: 112, tituloLh: 0.92, tituloLs: -5.6,
        bajada: 30, bajadaLh: 1.25, bajadaLs: -0.6, fotoH: venta ? 319 : 317, filaPy: 14, valor: 30, valorLh: 1.25, valorLs: -0.6,
        codigoPy: 28, codigo: 72, codigoPeso: 800, codigoLh: 0.96, codigoLs: -2.88,
        cierre: 34, cierrePeso: 600, cierreLh: 1.1, cierreLs: -0.68, sello: 260 }
    : { x: 64, headerY: 64, ancho: 952, contenidoY: 264, gap: 18, nombreW: 672, tituloW: 692, titulo: 72, tituloLh: 0.96, tituloLs: -2.88,
        bajada: 24, bajadaLh: 1.3, bajadaLs: -0.24, fotoH: 220, filaPy: 10, valor: 24, valorLh: 1.3, valorLs: -0.24,
        codigoPy: 22, codigo: 48, codigoPeso: 700, codigoLh: 1, codigoLs: -1.44,
        cierre: 24, cierrePeso: 500, cierreLh: 1.3, cierreLs: 0, sello: 220 }

  // Sello: caja girada (Figma: rotate 10° en venta, −8° en cortesía).
  // Posición = esquina del bounding box de Figma + (bbox − lado) / 2.
  const selloPos = venta
    ? story ? { x: 694.85, y: 310, bbox: 301.199 } : { x: 757.8, y: 214, bbox: 254.86 }
    : story ? { x: 740, y: 273.81, bbox: 293.655 } : { x: 796, y: 183.38, bbox: 248.477 }
  const S = m.sello
  const off = (selloPos.bbox - S) / 2
  const selloTexto = venta ? ['all you can eat', 'edición ronqueo'] : selloCortesia(n)
  const sello = div(
    { position: 'absolute', left: selloPos.x + off, top: selloPos.y + off, width: S, height: S, transform: `rotate(${venta ? 10 : -8}deg)` },
    img(src('sello-circulo.svg'), S, S, { position: 'absolute', left: 0, top: 0 }),
    img(src(story ? 'sello-anillo-story.png' : 'sello-anillo-feed.png'), S - 26, S - 26, { position: 'absolute', left: 13, top: 13 }),
    img(src('sello-simbolo.svg'), story ? 109.2 : 92.4, story ? 36.4 : 30.8, { position: 'absolute', left: story ? 75.4 : 63.8, top: story ? 57.2 : 48.4 }),
    div(
      { position: 'absolute', left: (S - (story ? 216 : 176)) / 2, top: story ? 114.4 : 101.2, width: story ? 216 : 176,
        flexDirection: 'column', alignItems: 'center', fontFamily: INTER, fontWeight: 700, fontSize: story ? 26 : 20, lineHeight: 1.15, color: c.vinyl },
      ...selloTexto.map(t => div({ textAlign: 'center' }, t)),
    ),
  )

  const header = div(
    { position: 'absolute', left: m.x, top: m.headerY, width: m.ancho, justifyContent: 'space-between', alignItems: 'flex-start' },
    div({ position: 'relative', width: 220, height: 144.2 },
      img(src(venta ? 'wordmark-dia.svg' : 'wordmark-noche.svg'), 220, 96, { position: 'absolute', left: 0, top: 0 }),
      img(src(venta ? 'simbolo-dia.svg' : 'simbolo-noche.svg'), 100, 33.333, { position: 'absolute', left: 0, top: 110.87 }),
    ),
    div({ backgroundColor: c.pillBg, padding: '14px 24px', borderRadius: 4, fontFamily: INTER, fontWeight: 700, fontSize: 26, lineHeight: 1.15, color: c.pillTexto, whiteSpace: 'nowrap' },
      venta ? 'invitación personal' : 'cortesía · invitación personal'),
  )

  const fila = (etiqueta: string, valor: string) => div(
    { width: '100%', borderTop: `1px solid ${c.borde}`, padding: `${m.filaPy}px 0`, gap: 24, alignItems: 'flex-start' },
    div({ width: 130, flexShrink: 0, fontFamily: MONO, fontSize: 18, lineHeight: 1.3, letterSpacing: 1.08, textTransform: 'uppercase', color: c.secundario }, etiqueta),
    div({ flex: 1, fontFamily: INTER, fontWeight: 400, fontSize: m.valor, lineHeight: m.valorLh, letterSpacing: m.valorLs, color: c.texto }, valor),
  )

  const [t1, t2] = venta ? ['te guardamos', 'lugar.'] : titularLineas(d.titular)
  const filas = venta
    ? [
        fila('cuándo', 'viernes 20 de noviembre · puertas 6:00 pm · ronqueo 7:30 pm'),
        fila('dónde', 'bruma records · mazatlán'),
        fila('boleto', '$1,500 por persona · all you can eat, welcome drink y ronqueo en vivo'),
      ]
    : [
        fila('cuándo', 'viernes 20 de noviembre · llega 6:00 pm · ronqueo 7:30 pm'),
        fila('dónde', 'bruma records · mazatlán'),
        fila('incluye', incluyeCortesia(n)),
        fila('a cambio', 'stories en vivo esa noche + 1 post · tag @bruma_recmzt · #ronqueobruma · sin guion'),
      ]

  const contenido = div(
    { position: 'absolute', left: m.x, top: m.contenidoY, width: m.ancho, flexDirection: 'column', gap: m.gap, alignItems: 'flex-start' },
    div({ width: m.nombreW, fontFamily: INTER, fontWeight: 600, fontSize: 34, lineHeight: 1.1, letterSpacing: -0.68, color: c.texto }, `${d.nombre},`),
    div({ width: m.tituloW, flexDirection: 'column', fontFamily: INTER, fontWeight: 800, fontSize: m.titulo, lineHeight: m.tituloLh, letterSpacing: m.tituloLs, color: c.texto },
      div({}, t1), div({}, t2)),
    // +6px: Satori no aplica el kerning de Inter y el texto sale ~0.5% más ancho
    // que en Figma; sin este margen la bajada de la cortesía feed parte en 3 líneas.
    div({ width: m.ancho + 6, fontFamily: INTER, fontWeight: 400, fontSize: m.bajada, lineHeight: m.bajadaLh, letterSpacing: m.bajadaLs, color: c.secundario },
      venta
        ? 'un atún completo se despieza en vivo frente a ti y se sirve en todos sus cortes, sin límite. chef samu (oyster club) en cocina, red pig en cabina. solo 50 lugares.'
        : 'reabrimos bruma records con un ronqueo: un atún completo despiezado en vivo, chef samu (oyster club) en cocina, red pig en cabina. queremos que lo vivas y lo cuentes.'),
    img(src(story ? (venta ? 'foto-story-venta.jpg' : 'foto-story-cortesia.jpg') : 'foto-feed.jpg'), m.ancho, m.fotoH),
    div({ width: '100%', flexDirection: 'column' }, ...filas),
    div(
      { width: '100%', boxSizing: 'border-box', backgroundColor: c.cajaCodigo, borderRadius: 8, padding: `${m.codigoPy}px 32px`, justifyContent: 'space-between', alignItems: 'center' },
      div({ flex: 1, flexDirection: 'column', gap: 4 },
        div({ fontFamily: MONO, fontSize: 18, lineHeight: 1.3, letterSpacing: 1.08, textTransform: 'uppercase', opacity: 0.8, color: c.etiquetaCodigo },
          venta ? 'tu código personal · compra antes del lun 16' : 'tu lugar · confirma antes del lun 16'),
        div({ fontFamily: INTER, fontWeight: m.codigoPeso, fontSize: m.codigo, lineHeight: m.codigoLh, letterSpacing: m.codigoLs, color: c.lima },
          venta ? d.codigo : codigoCortesia(d.nombre, n)),
      ),
      img(src(venta ? 'codigo-simbolo-dia.svg' : 'codigo-simbolo-noche.svg'), 90, 30),
    ),
    div({ width: '100%', justifyContent: 'space-between', alignItems: 'flex-end' },
      div({ flex: 1, flexDirection: 'column', fontFamily: INTER, fontWeight: m.cierrePeso, fontSize: m.cierre, lineHeight: m.cierreLh, letterSpacing: m.cierreLs, color: c.texto },
        ...(venta
          ? ['compra tu lugar en el link que te compartimos.', 'llega temprano, de verdad.']
          : ['confirma por whatsapp antes del lun 16.', 'tu lugar tiene nombre.']).map(t => div({}, t))),
      div({ flexShrink: 0, fontFamily: MONO, fontSize: 22, lineHeight: 1.3, letterSpacing: 1.76, whiteSpace: 'nowrap', color: c.secundario }, `— ${d.firma}`),
    ),
  )

  return div({ position: 'relative', width: w, height: h, backgroundColor: c.bg, overflow: 'hidden' }, header, sello, contenido)
}
