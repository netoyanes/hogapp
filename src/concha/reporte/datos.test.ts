import { describe, expect, it } from 'vitest'
import { diaCorto, periodoTexto, porcentaje, resumir, semanas, type DatosReporte, type DiaReporte } from './datos'

const dia = (fecha: string, comidas: number, venta: number, ordenes: number, fuente: DiaReporte['fuente'] = 'pos'): DiaReporte =>
  ({ fecha, fuente, venta, comidas, ordenes, efectivo: venta, tarjeta: 0, propinas: 0, ordenes_sin_cobro: 0, costo_sin_cobro: 0 })

const datos: DatosReporte = {
  meta: 40,
  dias: [
    dia('2026-11-16', 30, 390000, 30, 'historial'),
    dia('2026-11-17', 45, 585000, 44, 'historial'),
    dia('2026-11-22', 0, 0, 0, null),               // domingo cerrado
    dia('2026-11-23', 42, 546000, 40),
    dia('2026-11-24', 20, 260000, 20),
  ],
  platillos: [], descuentos: [], sin_cobro: [], colaboraciones: [], servicio: {}, cajeros: [], horas: [],
}

describe('reporte', () => {
  it('resumen: días abiertos, meta y ticket', () => {
    const r = resumir(datos)
    expect(r).toMatchObject({ venta: 1781000, comidas: 137, ordenes: 134, diasAbiertos: 4, diasConMeta: 2, diasHistorial: 2 })
    expect(r.ticket).toBe(13300)   // $132.91 → $133
    expect(r.comidasPromedio).toBe(34.3)
  })
  it('semana contra semana', () => {
    const s = semanas(datos.dias)
    expect(s.map(w => [w.lunes, w.venta, w.dias])).toEqual([['2026-11-16', 975000, 2], ['2026-11-23', 806000, 2]])
    expect(s[0].cambio).toBeNull()
    expect(s.map(w => w.promedio)).toEqual([487500, 403000])   // ya en pesos cerrados
    expect(s[1].cambio).toBeCloseTo((403000 - 487500) / 487500)
  })
  it('textos', () => {
    expect(periodoTexto('2026-11-01', '2026-11-28')).toBe('1 al 28 de noviembre de 2026')
    expect(periodoTexto('2026-10-26', '2026-11-08')).toBe('26 de octubre al 8 de noviembre de 2026')
    expect(diaCorto('2026-11-23')).toBe('lun 23')
    expect(porcentaje(-0.1733)).toBe('−17.3 %')
    expect(porcentaje(0.05)).toBe('+5 %')
  })
})
