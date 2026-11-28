// Doña Concha · Reporte — forma de los datos (concha_datos_reporte) y cálculos.
import { lunesDe, sumarDias } from '../logic'

export interface DiaReporte {
  fecha: string
  fuente: 'pos' | 'historial' | null
  venta: number
  comidas: number
  ordenes: number
  efectivo: number
  tarjeta: number
  propinas: number
  ordenes_sin_cobro: number
  costo_sin_cobro: number
}

export interface DatosReporte {
  meta: number
  dias: DiaReporte[]
  platillos: { nombre: string; cantidad: number; monto: number }[]
  descuentos: { nombre: string; tipo: string; ordenes: number; monto: number }[]
  sin_cobro: { motivo: string; ordenes: number; comidas: number; costo: number }[]
  colaboraciones: { chef: string; vendidos: number; ganancia: number; al_chef: number }[]
  servicio: Record<string, number>
  cajeros: { cajero: string; ordenes: number; venta: number }[]
  horas: { hora: number; ordenes: number }[]
}

export interface ReportePublicado {
  estado: 'ok' | 'vencido' | 'revocado' | 'no_existe'
  titulo?: string
  desde?: string
  hasta?: string
  expira_en?: string
  generado?: string
  datos?: DatosReporte
}

export interface Resumen {
  venta: number
  comidas: number
  ordenes: number
  ticket: number
  diasAbiertos: number
  diasConMeta: number
  comidasPromedio: number
  efectivo: number
  tarjeta: number
  propinas: number
  sinCobroOrdenes: number
  sinCobroCosto: number
  diasHistorial: number
}

/** Ticket promedio redondeado a pesos (en centavos) */
export const ticketDe = (venta: number, ordenes: number) => (ordenes ? Math.round(venta / ordenes / 100) * 100 : 0)

/** Un día cuenta como abierto si tiene datos (POS o historial) */
export const abierto = (d: DiaReporte) => d.fuente != null && (d.comidas > 0 || d.venta > 0 || d.ordenes > 0)

export function resumir(d: DatosReporte): Resumen {
  const ab = d.dias.filter(abierto)
  const s = (f: (x: DiaReporte) => number) => d.dias.reduce((t, x) => t + f(x), 0)
  const venta = s(x => x.venta), ordenes = s(x => x.ordenes), comidas = s(x => x.comidas)
  return {
    venta, comidas, ordenes,
    ticket: ticketDe(venta, ordenes),
    diasAbiertos: ab.length,
    diasConMeta: ab.filter(x => x.comidas >= d.meta).length,
    comidasPromedio: ab.length ? Math.round((comidas / ab.length) * 10) / 10 : 0,
    efectivo: s(x => x.efectivo), tarjeta: s(x => x.tarjeta), propinas: s(x => x.propinas),
    sinCobroOrdenes: s(x => x.ordenes_sin_cobro), sinCobroCosto: s(x => x.costo_sin_cobro),
    diasHistorial: ab.filter(x => x.fuente === 'historial').length,
  }
}

export interface Semana {
  lunes: string
  domingo: string
  venta: number
  comidas: number
  ordenes: number
  ticket: number
  dias: number
  /** Venta promedio por día abierto (compara bien semanas incompletas) */
  promedio: number
  /** Cambio del promedio diario contra la semana anterior (0.12 = +12 %); null si no hay con qué comparar */
  cambio: number | null
}

/** Semana contra semana (lunes a domingo) */
export function semanas(dias: DiaReporte[]): Semana[] {
  const m = new Map<string, Semana>()
  for (const d of dias) {
    const lunes = lunesDe(d.fecha)
    const w = m.get(lunes) ?? { lunes, domingo: sumarDias(lunes, 6), venta: 0, comidas: 0, ordenes: 0, ticket: 0, dias: 0, promedio: 0, cambio: null }
    w.venta += d.venta; w.comidas += d.comidas; w.ordenes += d.ordenes
    if (abierto(d)) w.dias += 1
    m.set(lunes, w)
  }
  const lista = [...m.values()].sort((a, b) => a.lunes.localeCompare(b.lunes))
  lista.forEach((w, i) => {
    w.ticket = ticketDe(w.venta, w.ordenes)
    w.promedio = w.dias ? Math.round(w.venta / w.dias / 100) * 100 : 0
    const prev = lista[i - 1]
    w.cambio = prev && prev.promedio > 0 && w.dias > 0 ? (w.promedio - prev.promedio) / prev.promedio : null
  })
  return lista
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const partes = (f: string) => { const [y, m, d] = f.split('-').map(Number); return { y, m, d } }

/** «1 al 28 de noviembre de 2026» · «28 de octubre al 3 de noviembre de 2026» */
export function periodoTexto(desde: string, hasta: string): string {
  const a = partes(desde), b = partes(hasta)
  if (desde === hasta) return `${b.d} de ${MESES[b.m - 1]} de ${b.y}`
  if (a.y !== b.y) return `${a.d} de ${MESES[a.m - 1]} de ${a.y} al ${b.d} de ${MESES[b.m - 1]} de ${b.y}`
  if (a.m !== b.m) return `${a.d} de ${MESES[a.m - 1]} al ${b.d} de ${MESES[b.m - 1]} de ${b.y}`
  return `${a.d} al ${b.d} de ${MESES[b.m - 1]} de ${b.y}`
}

/** «lun 23» */
export function diaCorto(f: string): string {
  const { y, m, d } = partes(f)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][dow]} ${d}`
}

/** «23 nov» */
export function fechaCorta(f: string): string {
  const { m, d } = partes(f)
  return `${d} ${MESES[m - 1].slice(0, 3)}`
}

export function porcentaje(x: number): string {
  const v = Math.round(x * 1000) / 10
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} %`
}
