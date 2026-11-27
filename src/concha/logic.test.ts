import { describe, expect, it } from 'vitest'
import {
  diaSemana, fechaLarga, folioTxt, horario, lunesDe, menuDelDia, pesos,
  repartoColaboracion, siguienteFolio, totales, turnoDelDia, aplicado, armarPagos, billetesSugeridos, calcularCorte, corteCSV, propinasSemana,
} from './logic'
import { catalogoDemo } from './seed'
import type { Orden, Renglon } from './types'

const JUEVES = '2026-11-26'
const cat = catalogoDemo(JUEVES)
const comida = cat.turnos[0]
const d = (id: string) => cat.descuentos.find(x => x.id === id)!

const renglon = (p: Partial<Renglon>): Renglon => ({
  id: crypto.randomUUID(), tipo: 'comida', platilloId: 'chicharron', nombre: 'x', guarniciones: [], agua: null,
  cantidad: 1, precioUnit: 13000, costoUnit: null, colaboracionId: null, ...p,
})

describe('fechas y textos', () => {
  it('días y lunes', () => {
    expect(diaSemana(JUEVES)).toBe(4)
    expect(lunesDe(JUEVES)).toBe('2026-11-23')
    expect(lunesDe('2026-11-29')).toBe('2026-11-23') // domingo
  })
  it('como en el diseño', () => {
    expect(fechaLarga(JUEVES)).toBe('Jueves 26 de noviembre')
    expect(horario('12:00', '16:30')).toBe('12:00 a 4:30 PM')
    expect(horario('09:30', '15:00')).toBe('9:30 AM a 3:00 PM')
    expect(pesos(175500)).toBe('$1,755')
    expect(pesos(-2800)).toBe('−$28')
    expect(pesos(2850)).toBe('$28.50')
    expect(folioTxt(27)).toBe('#0027')
  })
})

describe('menú del día', () => {
  it('turno por día', () => {
    expect(turnoDelDia(cat, JUEVES)?.id).toBe('comida')
    expect(turnoDelDia(cat, '2026-11-28')?.id).toBe('brunch')
    expect(turnoDelDia(cat, '2026-11-29')).toBeNull()
  })
  it('precio base, colaboración y agotado', () => {
    const g = menuDelDia(cat, JUEVES, 'guiso')
    expect(g.map(x => x.platillo.id)).toEqual(['chicharron', 'fajitas', 'albondigas', 'marlin', 'especial', 'colache'])
    expect(g[0].precio).toBe(13000)
    expect(g[0].etiqueta).toBe('SOLO HOY')
    expect(g[2].etiqueta).toBe('TODA LA SEMANA')
    expect(g[4].precio).toBe(15000)
    expect(g[4].etiqueta).toBe('COLABORACIÓN · CHEF INVITADO')
    expect(g[5].agotado).toBe(true)
  })
  it('las porciones bajan con lo vendido y con la orden en curso', () => {
    const exs = { [`${JUEVES}|chicharron`]: { fecha: JUEVES, platilloId: 'chicharron', vendidas: 10, agotadoManual: false } }
    const [ch] = menuDelDia(cat, JUEVES, 'guiso', exs, { chicharron: 2 })
    expect(ch.quedan).toBe(0)
    expect(ch.agotado).toBe(true)
  })
  it('tope diario de la colaboración', () => {
    const c2 = { ...cat, colaboraciones: [{ ...cat.colaboraciones[0], topeDia: 5, topes: { [JUEVES]: 3 } }] }
    const esp = menuDelDia(c2, JUEVES, 'guiso').find(x => x.platillo.id === 'especial')!
    expect(esp.quedan).toBe(3)
  })
  it('un platillo de un solo día no aparece al siguiente', () => {
    expect(menuDelDia(cat, '2026-11-27', 'guiso').some(x => x.platillo.id === 'chicharron')).toBe(false)
  })
})

describe('totales', () => {
  const orden = [renglon({}), renglon({ platilloId: 'especial', precioUnit: 15000, colaboracionId: 'colab-demo' })]
  it('Petroil 10% como en el diseño: $280 − $28 = $252', () => {
    const t = totales(orden, aplicado(d('petroil')), comida, d('petroil'))
    expect(t).toMatchObject({ subtotal: 28000, descuento: 2800, total: 25200, sinCobro: false, sellos: 2 })
  })
  it('convenio sin el platillo de colaboración, si así se configura', () => {
    const sinColab = { ...d('petroil'), aplicaAColaboracion: false }
    expect(totales(orden, aplicado(sinColab), comida, sinColab).descuento).toBe(1300)
  })
  it('cliente frecuente: 100% de una comida, la de menor precio; no suma sello esa', () => {
    const t = totales(orden, aplicado(d('frecuente')), comida)
    expect(t.descuento).toBe(13000)
    expect(t.total).toBe(15000)
    expect(t.sellos).toBe(1)
  })
  it('sin cobro: total 0, costo a precio de lista, sin sellos', () => {
    const t = totales(orden, aplicado(d('cortesia')), comida)
    expect(t).toMatchObject({ total: 0, sinCobro: true, costoSinCobro: 28000, sellos: 0 })
  })
  it('brunch con sello pendiente no suma', () => {
    expect(totales(orden, null, cat.turnos[1]).sellos).toBe(0)
  })
})

describe('folio y reparto al chef', () => {
  const o = (fecha: string, folio: number | null, renglones: Renglon[], sinCobro = false): Orden => ({
    id: crypto.randomUUID(), dispositivo: 't', fecha, folio, creadaEn: '', cobradaEn: '', turnoId: 'comida',
    servicio: 'aqui', canal: 'mostrador', nombreCliente: null, telefono: null, direccion: null, costoEnvio: 0,
    estado: 'cobrada', renglones, descuento: null, codigoCapturado: null, subtotal: 0, descuentoMonto: 0, total: 0,
    sinCobro, costoSinCobro: 0, sellos: 0, selloNumero: null, pagos: [], cajero: null, sincronizada: false,
  })
  it('folio consecutivo por día', () => {
    const ords = [o(JUEVES, 1, []), o(JUEVES, 2, []), o('2026-11-25', 9, [])]
    expect(siguienteFolio(ords, JUEVES)).toBe(3)
    expect(siguienteFolio(ords, '2026-11-27')).toBe(1)
  })
  it('50-50 de (precio − costo) solo la primera semana', () => {
    const c = cat.colaboraciones[0] // desde el lunes 23, $150, costo $60
    const esp = (cantidad: number) => renglon({ platilloId: 'especial', precioUnit: 15000, costoUnit: 6000, colaboracionId: c.id, cantidad })
    const ords = [
      o('2026-11-23', 1, [esp(3)]),
      o('2026-11-23', 2, [esp(1)], true), // sin cobro: no cuenta
      o('2026-11-30', 1, [esp(2)]),       // segunda semana: sin reparto
    ]
    const r = repartoColaboracion(c, ords)
    expect(r[0]).toMatchObject({ fecha: '2026-11-23', vendidos: 3, ganancia: 27000, alChef: 13500, conReparto: true })
    expect(r[1]).toMatchObject({ fecha: '2026-11-30', vendidos: 2, alChef: 0, conReparto: false })
  })
})

describe('cobro', () => {
  const base = { recibido: 0, propina: 0, propinaForma: 'efectivo' as const, referencia: '', enEfectivo: 0 }
  it('efectivo: cambio, y la propina en efectivo sale del cambio', () => {
    const r = armarPagos('efectivo', 25200, { ...base, recibido: 30000, propina: 2000 })
    expect(r.error).toBeNull()
    expect(r.pagos[0]).toMatchObject({ forma: 'efectivo', monto: 25200, recibido: 30000, cambio: 2800, propina: 2000 })
  })
  it('efectivo: no alcanza', () => {
    expect(armarPagos('efectivo', 25200, { ...base, recibido: 20000 }).error).toMatch(/Falta/)
  })
  it('tarjeta con propina en tarjeta: la venta no cambia', () => {
    const r = armarPagos('tarjeta', 25200, { ...base, propina: 3000, propinaForma: 'tarjeta', referencia: '1234' })
    expect(r.pagos).toHaveLength(1)
    expect(r.pagos[0]).toMatchObject({ forma: 'tarjeta', monto: 25200, propina: 3000, referencia: '1234' })
  })
  it('tarjeta con propina en efectivo', () => {
    const r = armarPagos('tarjeta', 25200, { ...base, propina: 2000, propinaForma: 'efectivo' })
    expect(r.pagos.map(p => [p.forma, p.monto, p.propina])).toEqual([['tarjeta', 25200, 0], ['efectivo', 0, 2000]])
  })
  it('dividido: efectivo exacto por omisión y el resto a tarjeta', () => {
    const r = armarPagos('dividir', 25200, { ...base, enEfectivo: 10000, propina: 2500, propinaForma: 'tarjeta' })
    expect(r.pagos.map(p => [p.forma, p.monto, p.propina, p.cambio])).toEqual([['efectivo', 10000, 0, 0], ['tarjeta', 15200, 2500, null]])
    expect(armarPagos('dividir', 25200, { ...base, enEfectivo: 25200 }).error).toBeTruthy()
  })
  it('billetes sugeridos', () => {
    expect(billetesSugeridos(25200)).toEqual([25200, 30000, 50000, 100000])
  })
})

describe('corte de caja', () => {
  const orden = (p: Partial<Orden>): Orden => ({
    id: crypto.randomUUID(), dispositivo: 't', fecha: JUEVES, folio: 1, creadaEn: '', cobradaEn: '', turnoId: 'comida',
    servicio: 'aqui', canal: 'mostrador', nombreCliente: null, telefono: null, direccion: null, costoEnvio: 0,
    estado: 'cobrada', renglones: [renglon({ nombre: 'Chicharrón' })], descuento: null, codigoCapturado: null,
    subtotal: 13000, descuentoMonto: 0, total: 13000, sinCobro: false, costoSinCobro: 0, sellos: 1, selloNumero: null,
    pagos: [], cajero: null, sincronizada: false, ...p,
  })
  const pago = (forma: 'efectivo' | 'tarjeta', monto: number, propina = 0) =>
    ({ id: crypto.randomUUID(), forma, monto, recibido: null, cambio: null, propina, referencia: null })
  const ordenes = [
    orden({ pagos: [pago('efectivo', 13000, 1000)] }),
    orden({ total: 11700, descuentoMonto: 1300, descuento: aplicado(d('petroil')), pagos: [pago('tarjeta', 11700, 2000)] }),
    orden({ total: 0, sinCobro: true, costoSinCobro: 13000, descuento: aplicado(d('personal')), pagos: [] }),
    orden({ fecha: '2026-11-25', pagos: [pago('efectivo', 13000, 500)] }),   // otro día de la semana
  ]
  const gastos = [{ id: 'g', fecha: JUEVES, concepto: 'Hielo', monto: 4000, registradoPor: null, creadoEn: '', sincronizado: false }]
  const c = calcularCorte({ fecha: JUEVES, ordenes, gastos, fondo: 50000, efectivoContado: 69000, colaboraciones: [], meta: 40 })

  it('venta, formas de pago y propinas aparte', () => {
    expect(c).toMatchObject({ ventaTotal: 24700, efectivo: 13000, tarjeta: 11700, propinasEfectivo: 1000, propinasTarjeta: 2000, ordenes: 2, comidas: 2, ticketPromedio: 12350 })
  })
  it('efectivo a entregar = fondo + efectivo + propinas en efectivo − gastos', () => {
    expect(c.efectivoAEntregar).toBe(50000 + 13000 + 1000 - 4000)
    expect(c.diferencia).toBe(69000 - 60000)
  })
  it('sin cobro y descuentos por separado', () => {
    expect(c.sinCobroCosto).toBe(13000)
    expect(c.desglose.sinCobro).toEqual([{ clave: 'personal', nombre: 'Comida de personal', cantidad: 1, monto: 13000 }])
    expect(c.desglose.porDescuento[0]).toMatchObject({ nombre: 'Grupo Petroil', cantidad: 1, monto: 1300 })
    expect(c.desglose.porGuiso[0]).toMatchObject({ nombre: 'Chicharrón', cantidad: 2 })
  })
  it('propinas por liquidar de la semana', () => {
    expect(propinasSemana(ordenes, JUEVES)).toEqual({ efectivo: 1500, tarjeta: 2000 })
  })
  it('CSV', () => {
    const csv = corteCSV(c)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Efectivo a entregar,600.00')
    expect(csv).toContain('Grupo Petroil,1,13.00')
  })
})
