// Doña Concha · POS — corte de caja (propuesta, mismo estilo que Venta).
// Venta del día, caja (fondo, efectivo, propinas por liquidar, gastos y
// efectivo a entregar), desgloses y exportar a CSV o PDF. Funciona sin internet:
// el corte se guarda en la tablet y se sube cuando hay red.
import { useState } from 'react'
import type { Corte, FilaDesglose } from './types'
import { calcularCorte, corteCSV, fechaLarga, horaCorta, pesos, propinasSemana } from './logic'
import { agregarGasto, cerrarCorte, ErrorCobro, quitarGasto, usePOS } from './store'
import { subirPendientes } from './sync'

const aCent = (s: string) => Math.round((parseFloat(s.replace(/[^\d.]/g, '')) || 0) * 100)

function Tabla({ titulo, cols, filas, extra }: { titulo: string; cols: [string, string, string, string?]; filas: FilaDesglose[]; extra?: boolean }) {
  return (
    <div className="dc-panel">
      <p className="dc-label">{titulo}</p>
      {filas.length === 0 ? <p className="dc-vacia">Nada hoy</p> : (
        <table className="dc-tabla">
          <thead><tr>{cols.filter(Boolean).map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.clave}>
                <td>{f.nombre}</td><td>{f.cantidad}</td><td>{pesos(f.monto)}</td>
                {extra && <td>{pesos(f.extra ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function CorteCaja({ hoy, cajero, onVolver }: { hoy: string; cajero: string | null; onVolver: () => void }) {
  const pos = usePOS()
  const cerrado = pos.cortes.find(c => c.fecha === hoy) ?? null
  const [fondo, setFondo] = useState(String(pos.catalogo.config.fondoCajaSugerido / 100))
  const [contado, setContado] = useState('')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  const vivo = calcularCorte({
    fecha: hoy, ordenes: pos.ordenes, gastos: pos.gastos, fondo: aCent(fondo),
    efectivoContado: contado.trim() ? aCent(contado) : null,
    colaboraciones: pos.catalogo.colaboraciones, meta: pos.catalogo.config.metaDiaria,
  })
  const c = cerrado ?? vivo
  const gastosHoy = pos.gastos.filter(g => g.fecha === hoy)
  const semana = propinasSemana(pos.ordenes, hoy)
  const avance = c.meta ? Math.min(100, Math.round((c.comidas / c.meta) * 100)) : 0

  function nuevoGasto() {
    const m = aCent(monto)
    if (!concepto.trim() || m <= 0) { setError('Escribe el concepto y el monto del gasto'); return }
    try {
      agregarGasto({ id: crypto.randomUUID(), fecha: hoy, concepto: concepto.trim(), monto: m, registradoPor: cajero, creadoEn: new Date().toISOString(), sincronizado: false })
      setConcepto(''); setMonto(''); setError(null)
    } catch (e) { setError(e instanceof ErrorCobro ? e.message : 'No se pudo guardar el gasto') }
  }

  function cerrar() {
    const corte: Corte = { ...vivo, id: crypto.randomUUID(), notas: notas.trim() || null, cerradoPor: cajero, cerradoEn: new Date().toISOString(), sincronizado: false }
    try { cerrarCorte(corte); setConfirmar(false); subirPendientes().catch(() => {}) }
    catch (e) { setError(e instanceof ErrorCobro ? e.message : 'No se pudo cerrar la caja') }
  }

  function exportarCSV() {
    const url = URL.createObjectURL(new Blob([corteCSV(c)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `corte-dona-concha-${hoy}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const dif = c.diferencia
  return (
    <div className="dc-corte">
      <div className="dc-corte-head">
        <div>
          <h2 className="dc-title">CORTE DE CAJA</h2>
          <p className="dc-sub">{fechaLarga(hoy)}{cerrado ? ` · Cerrada a las ${horaCorta(new Date(cerrado.cerradoEn))}` : ' · Caja abierta'}</p>
        </div>
        <div className="dc-row dc-no-print" style={{ gap: 8 }}>
          <button type="button" className="dc-chip" onClick={onVolver}>← Venta</button>
          <button type="button" className="dc-chip" onClick={exportarCSV}>Exportar CSV</button>
          <button type="button" className="dc-chip" onClick={() => window.print()}>PDF</button>
        </div>
      </div>

      <div className="dc-corte-grid">
        {/* Venta */}
        <div className="dc-col">
          <div className="dc-panel">
            <p className="dc-label">VENTA DEL DÍA</p>
            <p className="dc-corte-grande">{pesos(c.ventaTotal)}</p>
            <div className="dc-total"><span>Efectivo</span><strong>{pesos(c.efectivo)}</strong></div>
            <div className="dc-total"><span>Tarjeta</span><strong>{pesos(c.tarjeta)}</strong></div>
            <div className="dc-total"><span>Órdenes · ticket promedio</span><strong>{c.ordenes} · {pesos(c.ticketPromedio)}</strong></div>
            <div className="dc-total"><span>Comidas vendidas · meta {c.meta}</span><strong>{c.comidas}</strong></div>
            <div className="dc-meta"><div style={{ width: `${avance}%` }} /></div>
            <div className="dc-total"><span>Sin cobro (a precio de lista)</span><strong>{pesos(c.sinCobroCosto)}</strong></div>
          </div>

          <div className="dc-panel">
            <p className="dc-label">PROPINAS · SE LIQUIDAN CADA SEMANA</p>
            <div className="dc-total"><span>Hoy en efectivo (se quedan en caja)</span><strong>{pesos(c.propinasEfectivo)}</strong></div>
            <div className="dc-total"><span>Hoy con tarjeta (llegan en 3 días)</span><strong>{pesos(c.propinasTarjeta)}</strong></div>
            <div className="dc-rule" />
            <div className="dc-total"><span>Por liquidar esta semana</span><strong>{pesos(semana.efectivo + semana.tarjeta)}</strong></div>
          </div>
        </div>

        {/* Caja */}
        <div className="dc-col">
          <div className="dc-panel">
            <p className="dc-label">CAJA</p>
            <label className="dc-total"><span>Fondo de caja</span>
              {cerrado ? <strong>{pesos(c.fondo)}</strong>
                : <input className="dc-input dc-input-chico" inputMode="decimal" value={fondo} onChange={e => setFondo(e.target.value)} />}
            </label>
            <div className="dc-total"><span>+ Ventas en efectivo</span><strong>{pesos(c.efectivo)}</strong></div>
            <div className="dc-total"><span>+ Propinas en efectivo</span><strong>{pesos(c.propinasEfectivo)}</strong></div>
            <div className="dc-total"><span>− Gastos de caja</span><strong>{pesos(-c.gastos)}</strong></div>
            <div className="dc-rule" />
            <div className="dc-total is-grande"><span>A ENTREGAR</span><strong>{pesos(c.efectivoAEntregar)}</strong></div>
            <label className="dc-total"><span>Efectivo contado</span>
              {cerrado ? <strong>{c.efectivoContado == null ? '—' : pesos(c.efectivoContado)}</strong>
                : <input className="dc-input dc-input-chico" inputMode="decimal" placeholder="$0" value={contado} onChange={e => setContado(e.target.value)} />}
            </label>
            {dif != null && (
              <div className="dc-total"><span>{dif === 0 ? 'Cuadra' : dif < 0 ? 'Faltan' : 'Sobran'}</span>
                <strong style={{ color: dif < 0 ? 'var(--dc-primary)' : undefined }}>{pesos(Math.abs(dif))}</strong></div>
            )}
          </div>

          <div className="dc-panel">
            <p className="dc-label">GASTOS DE CAJA</p>
            {gastosHoy.length === 0 && <p className="dc-vacia">Sin gastos hoy</p>}
            {gastosHoy.map(g => (
              <div key={g.id} className="dc-total">
                <span>{g.concepto}</span>
                <span className="dc-row" style={{ gap: 10, alignItems: 'center' }}>
                  <strong>{pesos(g.monto)}</strong>
                  {!cerrado && !g.sincronizado && <button type="button" className="dc-x dc-no-print" aria-label={`Quitar ${g.concepto}`} onClick={() => quitarGasto(g.id)}>×</button>}
                </span>
              </div>
            ))}
            {!cerrado && (
              <div className="dc-row dc-no-print" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <input className="dc-input dc-input-chico" style={{ flex: 2, width: 'auto', minWidth: 0, textAlign: 'left' }} placeholder="Concepto" value={concepto} onChange={e => setConcepto(e.target.value)} />
                <input className="dc-input dc-input-chico" style={{ flex: 1, width: 'auto', minWidth: 0 }} inputMode="decimal" placeholder="$0" value={monto} onChange={e => setMonto(e.target.value)} onKeyDown={e => e.key === 'Enter' && nuevoGasto()} />
                <button type="button" className="dc-chip is-on" onClick={nuevoGasto}>Agregar</button>
              </div>
            )}
          </div>

          {!cerrado ? (
            <div className="dc-no-print" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="dc-input dc-input-chico" style={{ textAlign: 'left', width: '100%' }} placeholder="Notas del corte (opcional)" value={notas} onChange={e => setNotas(e.target.value)} />
              {error && <p className="dc-cobro-error">{error}</p>}
              <button type="button" className="dc-cobrar" onClick={() => setConfirmar(true)}>CERRAR CAJA</button>
            </div>
          ) : (
            <div className="dc-panel"><p className="dc-label">CAJA CERRADA{cerrado.sincronizado ? ' · SUBIDA A HOG APP' : ' · POR SUBIR'}</p>{cerrado.notas && <p className="dc-vacia">{cerrado.notas}</p>}</div>
          )}
        </div>

        {/* Desgloses */}
        <div className="dc-col">
          <Tabla titulo="VENDIDOS POR PLATILLO" cols={['Platillo', 'Cant.', 'Monto']} filas={c.desglose.porGuiso} />
          <Tabla titulo="DESCUENTOS Y CONVENIOS" cols={['Descuento', 'Órdenes', 'Descontado']} filas={c.desglose.porDescuento} />
          <Tabla titulo="SIN COBRO POR MOTIVO" cols={['Motivo', 'Comidas', 'Costo']} filas={c.desglose.sinCobro} />
          <Tabla titulo="COLABORACIONES" cols={['Chef', 'Vendidos', 'Ganancia', 'Al chef']} filas={c.desglose.colaboraciones} extra />
        </div>
      </div>

      {confirmar && (
        <div className="dc-velo" onClick={() => setConfirmar(false)}>
          <div className="dc-hoja" onClick={e => e.stopPropagation()}>
            <h3>¿Cerrar la caja de hoy?</h3>
            <p>Se entregan {pesos(vivo.efectivoAEntregar)} en efectivo{vivo.diferencia != null && vivo.diferencia !== 0 ? ` (${vivo.diferencia < 0 ? 'faltan' : 'sobran'} ${pesos(Math.abs(vivo.diferencia))})` : ''}. Después de cerrar ya no se puede vender hoy ni cambiar el corte.</p>
            <div className="dc-hoja-btns">
              <button type="button" className="dc-pago" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button type="button" className="dc-pago is-on" onClick={cerrar}>Cerrar caja</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
