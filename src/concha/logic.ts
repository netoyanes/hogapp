// Doña Concha · POS — reglas del negocio, sin pantalla. Todo lo que cuenta
// dinero, porciones o sellos vive aquí para poder probarlo solo.
import type {
  Catalogo, Colaboracion, Descuento, DescuentoAplicado, Existencia, MenuItem,
  Corte, FilaDesglose, FormaPago, Gasto, Orden, Pago, Platillo, Renglon, Turno,
} from './types'

export const TZ = 'America/Mazatlan'

// ── Fechas ────────────────────────────────────────────────────────────────

export function fechaLocal(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Día de la semana de una fecha 'YYYY-MM-DD' (0 = domingo) */
export function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  return t.toISOString().slice(0, 10)
}

/** Lunes de la semana de `fecha` */
export function lunesDe(fecha: string): string {
  const dow = diaSemana(fecha)
  return sumarDias(fecha, dow === 0 ? -6 : 1 - dow)
}

/** «Jueves 26 de noviembre» */
export function fechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const s = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(',', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function partesHora(h: string) {
  const [hh, mm] = h.split(':').map(Number)
  const pm = hh >= 12
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return { txt: `${h12}:${String(mm).padStart(2, '0')}`, mer: pm ? 'PM' : 'AM' }
}

/** «12:00 a 4:30 PM» · «9:30 AM a 3:00 PM» */
export function horario(inicio: string, fin: string): string {
  const a = partesHora(inicio), b = partesHora(fin)
  return a.mer === b.mer ? `${a.txt} a ${b.txt} ${b.mer}` : `${a.txt} ${a.mer} a ${b.txt} ${b.mer}`
}

/** «1:42 PM» en hora de Mazatlán */
export function horaCorta(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
}

// ── Dinero ────────────────────────────────────────────────────────────────

/** 125200 → «$1,252» · 2850 → «$28.50» */
export function pesos(centavos: number): string {
  const neg = centavos < 0
  const abs = Math.abs(centavos)
  const entero = Math.floor(abs / 100)
  const cent = abs % 100
  const s = entero.toLocaleString('en-US') + (cent ? '.' + String(cent).padStart(2, '0') : '')
  return (neg ? '−$' : '$') + s
}

// ── Menú del día ──────────────────────────────────────────────────────────

export function turnoDelDia(cat: Catalogo, fecha: string): Turno | null {
  const dow = diaSemana(fecha)
  return cat.turnos.find(t => t.activo && t.dias.includes(dow)) ?? null
}

export function vigenteEn(desde: string | null, hasta: string | null, fecha: string): boolean {
  return (!desde || desde <= fecha) && (!hasta || fecha <= hasta)
}

export function colaboracionDe(cat: Catalogo, platilloId: string, fecha: string): Colaboracion | null {
  return cat.colaboraciones.find(c => c.activo && c.platilloId === platilloId && vigenteEn(c.desde, c.hasta, fecha)) ?? null
}

export interface ItemDelDia {
  menu: MenuItem
  platillo: Platillo
  colaboracion: Colaboracion | null
  precio: number | null
  costo: number | null
  /** Porciones que quedan (null = sin límite) */
  quedan: number | null
  agotado: boolean
  etiqueta: string
}

export function existencia(exs: Record<string, Existencia>, fecha: string, platilloId: string): Existencia {
  return exs[`${fecha}|${platilloId}`] ?? { fecha, platilloId, vendidas: 0, agotadoManual: false }
}

/** Órdenes del platillo de colaboración en el día, para el tope */
function topeColaboracion(c: Colaboracion, fecha: string): number | null {
  return c.topes[fecha] ?? c.topeDia
}

export function etiquetaVigencia(m: MenuItem, c: Colaboracion | null): string {
  if (c) return 'COLABORACIÓN · CHEF INVITADO'
  if (m.vigencia === 'semana') return 'TODA LA SEMANA'
  if (m.vigencia === 'dia') return 'SOLO HOY'
  return 'POR TIEMPO LIMITADO'
}

/**
 * Platillos del día de un tipo, con precio y existencias.
 * `enOrden` descuenta lo que ya está en la orden en curso (para no vender de más).
 */
export function menuDelDia(
  cat: Catalogo, fecha: string, tipo: Platillo['tipo'],
  exs: Record<string, Existencia> = {}, enOrden: Record<string, number> = {},
): ItemDelDia[] {
  const turno = turnoDelDia(cat, fecha)
  if (!turno) return []
  const out: ItemDelDia[] = []
  for (const m of cat.menu) {
    if (m.turnoId !== turno.id || !vigenteEn(m.desde, m.hasta, fecha)) continue
    const p = cat.platillos.find(x => x.id === m.platilloId)
    if (!p || !p.activo || p.tipo !== tipo) continue
    const c = colaboracionDe(cat, p.id, fecha)
    const ex = existencia(exs, fecha, p.id)
    const ocupadas = ex.vendidas + (enOrden[p.id] ?? 0)
    let quedan = m.porciones == null ? null : m.porciones - ocupadas
    if (c) {
      const tope = topeColaboracion(c, fecha)
      if (tope != null) quedan = quedan == null ? tope - ocupadas : Math.min(quedan, tope - ocupadas)
    }
    if (quedan != null) quedan = Math.max(0, quedan)
    const precio = c ? c.precio : p.tipo === 'guiso' ? (p.precio ?? turno.precioBase) : p.precio
    out.push({
      menu: m, platillo: p, colaboracion: c, precio,
      costo: c ? c.costoIngredientes : p.costoIngredientes,
      quedan, agotado: ex.agotadoManual || quedan === 0,
      etiqueta: etiquetaVigencia(m, c),
    })
  }
  return out.sort((a, b) => a.menu.orden - b.menu.orden)
}

// ── Totales de la orden ───────────────────────────────────────────────────

export function subtotal(renglones: Renglon[]): number {
  return renglones.reduce((s, r) => s + r.precioUnit * r.cantidad, 0)
}

export function comidasEnOrden(renglones: Renglon[]): number {
  return renglones.filter(r => r.tipo === 'comida').reduce((s, r) => s + r.cantidad, 0)
}

export function aplicado(d: Descuento): DescuentoAplicado {
  return { id: d.id, nombre: d.nombre, tipo: d.tipo, porcentaje: d.porcentaje, motivo: d.motivo }
}

/**
 * Cuánto descuenta un descuento sobre los renglones.
 * - convenio / código: % sobre la orden. Si `aplicaAColaboracion === false`,
 *   el platillo de colaboración queda fuera (null = pendiente: se aplica, como en el diseño).
 * - cliente frecuente: 100% de UNA comida completa (la de menor precio). No toca extras.
 * - sin cobro: todo (la orden no es venta; se registra como costo).
 */
export function montoDescuento(renglones: Renglon[], d: DescuentoAplicado | null, desc?: Descuento): number {
  if (!d) return 0
  const sub = subtotal(renglones)
  if (d.tipo === 'sin_cobro') return sub
  if (d.tipo === 'cliente_frecuente') {
    const comidas = renglones.filter(r => r.tipo === 'comida')
    if (!comidas.length) return 0
    const unit = Math.min(...comidas.map(r => r.precioUnit))
    return Math.round(unit * d.porcentaje / 100)
  }
  const base = desc?.aplicaAColaboracion === false
    ? subtotal(renglones.filter(r => !r.colaboracionId))
    : sub
  return Math.round(base * d.porcentaje / 100)
}

export interface Totales {
  subtotal: number
  descuento: number
  total: number
  sinCobro: boolean
  costoSinCobro: number
  sellos: number
}

export function totales(renglones: Renglon[], d: DescuentoAplicado | null, turno: Turno | null, desc?: Descuento): Totales {
  const sub = subtotal(renglones)
  const sinCobro = d?.tipo === 'sin_cobro'
  const descuento = montoDescuento(renglones, d, desc)
  const total = Math.max(0, sub - descuento)
  // Sello: una por comida completa pagada. El canje y el sin cobro no suman.
  let sellos = 0
  if (turno?.sumaSello && !sinCobro) {
    sellos = comidasEnOrden(renglones) - (d?.tipo === 'cliente_frecuente' ? 1 : 0)
  }
  return { subtotal: sub, descuento, total, sinCobro, costoSinCobro: sinCobro ? sub : 0, sellos: Math.max(0, sellos) }
}

/** Cambio en efectivo; null si no alcanza */
export function cambio(total: number, recibido: number): number | null {
  return recibido >= total ? recibido - total : null
}

/** Siguiente folio del día (consecutivo por fecha) */
export function siguienteFolio(ordenes: Orden[], fecha: string): number {
  return ordenes.reduce((m, o) => (o.fecha === fecha && o.folio != null ? Math.max(m, o.folio) : m), 0) + 1
}

export function folioTxt(n: number): string {
  return '#' + String(n).padStart(4, '0')
}

// ── Colaboraciones: reparto al chef ───────────────────────────────────────

export interface RepartoDia {
  fecha: string
  vendidos: number
  ganancia: number      // (precio − costo) × vendidos
  alChef: number        // lo que le toca al chef ese día
  conReparto: boolean
}

/**
 * Platillos de la colaboración vendidos por día y lo que le toca al chef.
 * Ganancia = precio de lista − costo de ingredientes (copiados en el renglón).
 * Solo los primeros `diasConReparto` días desde el inicio se reparten.
 * Los sin cobro no cuentan como vendidos.
 */
export function repartoColaboracion(c: Colaboracion, ordenes: Orden[]): RepartoDia[] {
  const porDia = new Map<string, RepartoDia>()
  const finReparto = sumarDias(c.desde, c.diasConReparto - 1)
  for (const o of ordenes) {
    if (o.estado !== 'cobrada' || o.sinCobro) continue
    for (const r of o.renglones) {
      if (r.colaboracionId !== c.id) continue
      const dia = porDia.get(o.fecha) ?? { fecha: o.fecha, vendidos: 0, ganancia: 0, alChef: 0, conReparto: o.fecha <= finReparto && o.fecha >= c.desde }
      const g = (r.precioUnit - (r.costoUnit ?? 0)) * r.cantidad
      dia.vendidos += r.cantidad
      dia.ganancia += g
      if (dia.conReparto) dia.alChef += Math.round(g * c.repartoPct / 100)
      porDia.set(o.fecha, dia)
    }
  }
  return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// ── Cobro ─────────────────────────────────────────────────────────────────

export type ModoCobro = 'efectivo' | 'tarjeta' | 'dividir'

export interface CamposCobro {
  /** Efectivo que entrega el cliente (en dividir: por la parte en efectivo) */
  recibido: number
  /** Propina, aparte de la venta. Puede dejarse en efectivo o con tarjeta */
  propina: number
  propinaForma: FormaPago
  referencia: string
  /** Solo dividir: cuánto se paga en efectivo; el resto va a tarjeta */
  enEfectivo: number
}

/**
 * Arma los pagos de una orden. La propina nunca suma a la venta: va en su
 * propio campo del pago con el que se dejó.
 * - Efectivo: cambio = recibido − total − propina en efectivo.
 * - Tarjeta: en la terminal se cobra total + propina; aquí solo se registra.
 * - Dividir: una parte en efectivo y el resto con tarjeta.
 */
export function armarPagos(modo: ModoCobro, total: number, c: CamposCobro, nuevoId: () => string = () => crypto.randomUUID()):
  { pagos: Pago[]; error: string | null } {
  const ref = c.referencia.trim() || null
  const propEf = c.propinaForma === 'efectivo' ? c.propina : 0
  const propTj = c.propinaForma === 'tarjeta' ? c.propina : 0
  if (modo === 'efectivo') {
    if (c.propinaForma === 'tarjeta' && c.propina > 0) return { pagos: [], error: 'La propina con tarjeta va con Tarjeta o Dividir' }
    if (c.recibido < total + propEf) return { pagos: [], error: `Falta: recibido ${pesos(c.recibido)} de ${pesos(total + propEf)}` }
    return { pagos: [{ id: nuevoId(), forma: 'efectivo', monto: total, recibido: c.recibido, cambio: c.recibido - total - propEf, propina: propEf, referencia: null }], error: null }
  }
  if (modo === 'tarjeta') {
    if (c.propinaForma === 'efectivo' && c.propina > 0) {
      // Pagó con tarjeta y dejó la propina en efectivo: se registra como un pago en efectivo de $0 con propina
      return { pagos: [
        { id: nuevoId(), forma: 'tarjeta', monto: total, recibido: null, cambio: null, propina: 0, referencia: ref },
        { id: nuevoId(), forma: 'efectivo', monto: 0, recibido: c.propina, cambio: 0, propina: c.propina, referencia: null },
      ], error: null }
    }
    return { pagos: [{ id: nuevoId(), forma: 'tarjeta', monto: total, recibido: null, cambio: null, propina: propTj, referencia: ref }], error: null }
  }
  const ef = c.enEfectivo
  if (ef <= 0 || ef >= total) return { pagos: [], error: 'Captura cuánto se paga en efectivo (menos que el total)' }
  const recibido = c.recibido || ef + propEf
  if (recibido < ef + propEf) return { pagos: [], error: `Falta: recibido ${pesos(recibido)} de ${pesos(ef + propEf)}` }
  return { pagos: [
    { id: nuevoId(), forma: 'efectivo', monto: ef, recibido, cambio: recibido - ef - propEf, propina: propEf, referencia: null },
    { id: nuevoId(), forma: 'tarjeta', monto: total - ef, recibido: null, cambio: null, propina: propTj, referencia: ref },
  ], error: null }
}

/** Billetes sugeridos para «recibido» (en centavos), mayores o iguales al total */
export function billetesSugeridos(total: number): number[] {
  const arriba = (n: number) => Math.ceil(total / n) * n
  const s = new Set([total, arriba(5000), arriba(10000), 20000, 50000, 100000].filter(x => x >= total))
  return [...s].sort((a, b) => a - b).slice(0, 4)
}

// ── Corte de caja ─────────────────────────────────────────────────────────

function agrupar(filas: { clave: string; nombre: string; cantidad: number; monto: number; extra?: number }[]): FilaDesglose[] {
  const m = new Map<string, FilaDesglose>()
  for (const f of filas) {
    const a = m.get(f.clave) ?? { clave: f.clave, nombre: f.nombre, cantidad: 0, monto: 0, ...(f.extra != null ? { extra: 0 } : {}) }
    a.cantidad += f.cantidad; a.monto += f.monto
    if (f.extra != null) a.extra = (a.extra ?? 0) + f.extra
    m.set(f.clave, a)
  }
  return [...m.values()].sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre))
}

export interface DatosCorte {
  fecha: string
  ordenes: Orden[]          // todas; se filtran por fecha
  gastos: Gasto[]
  fondo: number
  efectivoContado: number | null
  colaboraciones: Colaboracion[]
  meta: number
}

/**
 * Corte del día. Las propinas no son venta ni se pagan de la caja ese día:
 * las de efectivo se quedan en la caja (se entregan con el efectivo, por
 * liquidar) y las de tarjeta llegan con el depósito de la terminal.
 */
export function calcularCorte(d: DatosCorte): Omit<Corte, 'id' | 'notas' | 'cerradoPor' | 'cerradoEn' | 'sincronizado'> {
  const delDia = d.ordenes.filter(o => o.fecha === d.fecha && o.estado === 'cobrada')
  const venta = delDia.filter(o => !o.sinCobro)
  const sc = delDia.filter(o => o.sinCobro)
  const pagos = venta.flatMap(o => o.pagos)
  const efectivo = pagos.filter(p => p.forma === 'efectivo').reduce((s, p) => s + p.monto, 0)
  const tarjeta = pagos.filter(p => p.forma === 'tarjeta').reduce((s, p) => s + p.monto, 0)
  const propinasEfectivo = pagos.filter(p => p.forma === 'efectivo').reduce((s, p) => s + p.propina, 0)
  const propinasTarjeta = pagos.filter(p => p.forma === 'tarjeta').reduce((s, p) => s + p.propina, 0)
  const gastos = d.gastos.filter(g => g.fecha === d.fecha).reduce((s, g) => s + g.monto, 0)
  const ventaTotal = venta.reduce((s, o) => s + o.total, 0)
  const efectivoAEntregar = d.fondo + efectivo + propinasEfectivo - gastos
  const comidas = venta.reduce((s, o) => s + comidasEnOrden(o.renglones), 0)

  const porGuiso = agrupar(venta.flatMap(o => o.renglones.map(r => ({
    clave: r.platilloId, nombre: r.nombre, cantidad: r.cantidad, monto: r.precioUnit * r.cantidad,
  }))))
  const porDescuento = agrupar(venta.filter(o => o.descuento).map(o => ({
    clave: o.descuento!.id, nombre: o.descuento!.nombre, cantidad: 1, monto: o.descuentoMonto,
  })))
  const sinCobro = agrupar(sc.map(o => ({
    clave: o.descuento?.id ?? 'sin-motivo', nombre: o.descuento?.nombre ?? 'Sin motivo', cantidad: comidasEnOrden(o.renglones), monto: o.costoSinCobro,
  })))
  const colaboraciones = d.colaboraciones.flatMap(c => {
    const dia = repartoColaboracion(c, delDia).find(x => x.fecha === d.fecha)
    return dia ? [{ clave: c.id, nombre: c.chef, cantidad: dia.vendidos, monto: dia.ganancia, extra: dia.alChef }] : []
  })

  return {
    fecha: d.fecha, fondo: d.fondo, ventaTotal, efectivo, tarjeta,
    propinas: propinasEfectivo + propinasTarjeta, propinasEfectivo, propinasTarjeta,
    gastos, sinCobroCosto: sc.reduce((s, o) => s + o.costoSinCobro, 0),
    efectivoAEntregar,
    efectivoContado: d.efectivoContado,
    diferencia: d.efectivoContado == null ? null : d.efectivoContado - efectivoAEntregar,
    ordenes: venta.length, comidas,
    ticketPromedio: venta.length ? Math.round(ventaTotal / venta.length) : 0,
    meta: d.meta,
    desglose: { porGuiso, porDescuento, sinCobro, colaboraciones },
  }
}

/** Propinas por liquidar en la semana (lunes a domingo de `fecha`) */
export function propinasSemana(ordenes: Orden[], fecha: string): { efectivo: number; tarjeta: number } {
  const lun = lunesDe(fecha), dom = sumarDias(lun, 6)
  let efectivo = 0, tarjeta = 0
  for (const o of ordenes) {
    if (o.estado !== 'cobrada' || o.fecha < lun || o.fecha > dom) continue
    for (const p of o.pagos) { if (p.forma === 'efectivo') efectivo += p.propina; else tarjeta += p.propina }
  }
  return { efectivo, tarjeta }
}

/** CSV del corte (separado por comas, con BOM para que Excel/Sheets respeten acentos) */
export function corteCSV(c: Pick<Corte, 'fecha' | 'fondo' | 'ventaTotal' | 'efectivo' | 'tarjeta' | 'propinasEfectivo' | 'propinasTarjeta' | 'gastos' | 'sinCobroCosto' | 'efectivoAEntregar' | 'efectivoContado' | 'diferencia' | 'ordenes' | 'comidas' | 'ticketPromedio' | 'meta' | 'desglose'>): string {
  const m = (n: number | null) => (n == null ? '' : (n / 100).toFixed(2))
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const filas: (string | number)[][] = [
    ['Corte de caja', c.fecha], [],
    ['Concepto', 'Monto'],
    ['Venta total', m(c.ventaTotal)], ['Efectivo', m(c.efectivo)], ['Tarjeta', m(c.tarjeta)],
    ['Órdenes', c.ordenes], ['Comidas vendidas', c.comidas], ['Meta del día', c.meta], ['Ticket promedio', m(c.ticketPromedio)],
    ['Propinas en efectivo (por liquidar)', m(c.propinasEfectivo)], ['Propinas con tarjeta (por liquidar)', m(c.propinasTarjeta)],
    ['Fondo de caja', m(c.fondo)], ['Gastos de caja', m(c.gastos)], ['Efectivo a entregar', m(c.efectivoAEntregar)],
    ['Efectivo contado', m(c.efectivoContado)], ['Diferencia', m(c.diferencia)],
    ['Sin cobro (a precio de lista)', m(c.sinCobroCosto)],
  ]
  const seccion = (t: string, cols: string[], fs: FilaDesglose[], extra = false) => {
    filas.push([], [t], cols)
    for (const f of fs) filas.push(extra ? [f.nombre, f.cantidad, m(f.monto), m(f.extra ?? 0)] : [f.nombre, f.cantidad, m(f.monto)])
  }
  seccion('Vendidos por platillo', ['Platillo', 'Cantidad', 'Monto'], c.desglose.porGuiso)
  seccion('Descuentos', ['Descuento', 'Órdenes', 'Descontado'], c.desglose.porDescuento)
  seccion('Sin cobro por motivo', ['Motivo', 'Comidas', 'Costo'], c.desglose.sinCobro)
  seccion('Colaboraciones', ['Chef', 'Vendidos', 'Ganancia', 'Al chef'], c.desglose.colaboraciones, true)
  return '﻿' + filas.map(f => f.map(x => q(String(x))).join(',')).join('\n')
}
