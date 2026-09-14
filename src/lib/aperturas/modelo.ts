// ─────────────────────────────────────────────────────────────────────────────
// APERTURAS · MODELO DE DATOS
//
// LA IDEA QUE SOSTIENE TODO: en una apertura, "pintar el local" no son tres
// cosas. Es UNA con tres caras — cuándo (cronograma), cuánto (presupuesto) y
// con quién (proveedor). Las herramientas fallan cuando esas caras viven en
// tablas distintas que alguien sincroniza a mano: mueves una fecha en el Gantt
// y el flujo de caja se queda con la vieja.
//
// Por eso aquí solo se captura la Partida. El flujo de caja, la ruta crítica,
// el avance y las alertas NO son campos: son cálculos. Si algo se puede
// derivar, no se guarda — guardarlo es invitar a que se contradiga.
// ─────────────────────────────────────────────────────────────────────────────

/** Unidad en la que se cotiza cada oficio. Define qué pide el formulario. */
export interface Oficio {
  id: string
  nombre: string
  unidad: string
  /** Una línea, la que evita la pregunta "¿esto incluye material?" */
  ayuda: string
}

/**
 * Catálogo editable. Las unidades no son decorativas: un pintor cotiza por m²
 * y un carpintero por pieza, y pedirle "cantidad" sin decir de qué es la vía
 * rápida a un presupuesto que no cuadra.
 */
export const OFICIOS: Oficio[] = [
  { id: 'pintura',     nombre: 'Pintura',          unidad: 'm²',            ayuda: 'Material + mano de obra por m²' },
  { id: 'piso',        nombre: 'Piso',             unidad: 'm²',            ayuda: 'Incluye nivelación y colocación' },
  { id: 'tablaroca',   nombre: 'Tablaroca / yeso', unidad: 'm²',            ayuda: 'Estructura, placa y acabado' },
  { id: 'carpinteria', nombre: 'Carpintería',      unidad: 'pieza',         ayuda: 'Mueble terminado e instalado' },
  { id: 'herreria',    nombre: 'Herrería',         unidad: 'pieza o ml',    ayuda: 'Por pieza o por metro lineal' },
  { id: 'tapiceria',   nombre: 'Tapicería',        unidad: 'pieza',         ayuda: 'Tela y mano de obra por pieza' },
  { id: 'electrica',   nombre: 'Eléctrica',        unidad: 'punto/salida',  ayuda: 'Cada contacto, apagador o luminaria' },
  { id: 'plomeria',    nombre: 'Plomería',         unidad: 'salida',        ayuda: 'Cada toma de agua o drenaje' },
  { id: 'albanileria', nombre: 'Albañilería',      unidad: 'jornal',        ayuda: 'Día de trabajo por persona' },
  { id: 'limpieza',    nombre: 'Limpieza',         unidad: 'jornal',        ayuda: 'Día de trabajo por persona' },
  { id: 'otro',        nombre: 'Otro',             unidad: 'lote',          ayuda: 'Precio alzado por el trabajo completo' },
]

export const oficioDe = (id?: string | null) => OFICIOS.find(o => o.id === id) ?? null

export type TipoProveedor = 'taller' | 'contratista' | 'tienda_linea' | 'tienda_fisica' | 'interno'

export const TIPOS_PROVEEDOR: { id: TipoProveedor; nombre: string }[] = [
  { id: 'taller',        nombre: 'Taller' },
  { id: 'contratista',   nombre: 'Contratista' },
  { id: 'tienda_linea',  nombre: 'Tienda en línea' },
  { id: 'tienda_fisica', nombre: 'Tienda física' },
  { id: 'interno',       nombre: 'Interno' },
]

export interface Proveedor {
  id: string
  nombre: string
  tipo: TipoProveedor
  oficio?: string | null
  /** Manda sobre cuándo cae el dinero de todas sus partidas. */
  anticipo_pct: number
  contacto?: string | null
  dominio?: string | null
}

export type TipoPartida = 'compra' | 'trabajo' | 'tarea'

/**
 * La entidad única. Los tres subtipos comparten cronograma, proveedor y pagos;
 * solo cambia de dónde sale el monto y cuándo se paga.
 */
export interface Partida {
  id: string
  proyecto_id: string
  nombre: string
  fase: string
  tipo: TipoPartida
  /** Ids de partidas que deben terminar antes de que esta empiece. */
  depende_de: string[]
  proveedor_id?: string | null
  /** 0–100, capturado a mano: es lo único del avance que nadie puede calcular. */
  avance: number
  anticipo_pagado: boolean
  saldo_pagado: boolean
  /**
   * El campo más importante del tablero. Una partida estimada es dinero que
   * todavía puede moverse, y son las que hunden el presupuesto de una apertura.
   */
  estimado: boolean
  /**
   * No condiciona la apertura: la terraza que se termina en octubre no debe
   * hacer que el cronograma grite "no llegas". Sigue contando en presupuesto y
   * en flujo de caja —el dinero sale igual—, pero fuera de la fecha meta.
   */
  post_apertura: boolean
  /**
   * Fecha antes de la cual esto no puede arrancar, aunque todo lo que espera
   * ya esté listo. Es para lo que no depende de la obra sino de terceros: el
   * electricista que hasta el viernes se desocupa, el permiso que sale el día
   * que sale. Sin esto, el cronograma promete arranques que nadie va a cumplir.
   */
  no_antes_de?: string | null
  notas?: string | null

  // ── Compra ──
  url?: string | null
  foto?: string | null
  precio_unitario?: number | null
  cantidad?: number | null
  /** Para una compra, la duración en el cronograma ES el tiempo de entrega. */
  dias_entrega?: number | null

  // ── Trabajo ──
  oficio?: string | null
  dias_ejecucion?: number | null

  // ── Tarea ──
  responsable?: string | null
  dias?: number | null
  costo?: number | null
}

export interface Proyecto {
  id: string
  nombre: string
  ciudad: string
  inicio: string
  meta_apertura: string
  presupuesto_aprobado: number
  /** Fracción, no porcentaje: 0.10 = 10%. */
  reserva_pct: number
}

/** Lo que de verdad se puede comprometer. El resto es el colchón. */
export const presupuestoEjecutable = (p: Proyecto) =>
  p.presupuesto_aprobado * (1 - p.reserva_pct)

/**
 * Monto de una partida, según su cara económica.
 * Una sola función: si el monto se calculara en cada pantalla, tarde o
 * temprano dos pantallas darían números distintos.
 */
export function montoDe(p: Partida): number {
  if (p.tipo === 'compra') return (p.precio_unitario ?? 0) * (p.cantidad ?? 0)
  if (p.tipo === 'trabajo') return (p.cantidad ?? 0) * (p.precio_unitario ?? 0)
  return p.costo ?? 0
}

/** Días que ocupa en el cronograma. La compra ocupa su tiempo de entrega. */
export function duracionDe(p: Partida): number {
  if (p.tipo === 'compra') return Math.max(0, p.dias_entrega ?? 0)
  if (p.tipo === 'trabajo') return Math.max(0, p.dias_ejecucion ?? 0)
  return Math.max(0, p.dias ?? 0)
}

/**
 * Días de entrega por defecto, por tienda. Editable porque envejecen: son un
 * punto de partida para no capturar en blanco, no una promesa.
 */
export const ENTREGA_POR_TIENDA: { dominio: string; nombre: string; dias: [number, number] }[] = [
  { dominio: 'amazon.com.mx',     nombre: 'Amazon MX',      dias: [3, 5] },
  { dominio: 'mercadolibre.com',  nombre: 'Mercado Libre',  dias: [4, 6] },
  { dominio: 'liverpool.com.mx',  nombre: 'Liverpool',      dias: [5, 7] },
  { dominio: 'homedepot.com.mx',  nombre: 'Home Depot',     dias: [4, 6] },
  { dominio: 'ikea.com',          nombre: 'IKEA',           dias: [7, 10] },
  { dominio: 'temu.com',          nombre: 'Temu',           dias: [12, 18] },
  { dominio: 'aliexpress.com',    nombre: 'AliExpress',     dias: [20, 30] },
]

/**
 * Reconoce la tienda por dominio. Devuelve null si no está en la tabla.
 *
 * Compara por ETIQUETA, no por sufijo: las mismas tiendas cambian de dominio
 * por país y por sección. `articulo.mercadolibre.com.mx` no termina en
 * `mercadolibre.com` y un `endsWith` lo dejaría fuera.
 */
export function tiendaDeUrl(url: string) {
  let host: string
  try { host = new URL(url).hostname.toLowerCase() } catch { return null }
  const etiquetas = new Set(host.split('.'))
  return ENTREGA_POR_TIENDA.find(t => etiquetas.has(t.dominio.split('.')[0])) ?? null
}

// ── Fechas: días naturales ───────────────────────────────────────────────────
// Los fines de semana se ven en el Gantt pero NO se saltan: los talleres
// trabajan sábado y un cronograma que los excluye miente por exceso.
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const masDias = (fecha: string, n: number) => {
  const d = new Date(fecha + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return iso(d)
}

export const diasEntre = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
