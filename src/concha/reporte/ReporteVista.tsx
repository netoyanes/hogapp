// Doña Concha · Reporte de ventas — la vista que ve el director (y la vista
// previa en HOG APP). Mismo estilo que el POS. Se imprime/descarga en PDF tal cual.
import type { ReactNode } from 'react'
import '../concha.css'
import './reporte.css'
import { Logo } from '../comun'
import { pesos } from '../logic'
import { abierto, diaCorto, fechaCorta, periodoTexto, porcentaje, resumir, semanas, ticketDe, type DatosReporte } from './datos'

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="dr-seccion">
      <div className="dr-seccion-head"><h2>{titulo}</h2>{ayuda && <span>{ayuda}</span>}</div>
      {children}
    </section>
  )
}

function Kpi({ k, v, ayuda }: { k: string; v: string; ayuda?: string }) {
  return <div className="dr-kpi"><span className="dr-kpi-k">{k}</span><span className="dr-kpi-v">{v}</span>{ayuda && <span className="dr-kpi-a">{ayuda}</span>}</div>
}

/** Barras verticales (una serie). La línea punteada es la meta. Pasa el dedo/ratón para ver el valor. */
function Barras({ datos, meta, formato, marcar }: {
  datos: { etiqueta: string; valor: number; detalle: string; tenue?: boolean }[]
  meta?: number; formato: (n: number) => string; marcar?: (v: number) => boolean
}) {
  const max = Math.max(1, meta ?? 0, ...datos.map(d => d.valor)) * 1.1
  const cada = Math.max(1, Math.ceil(datos.length / 16))
  // En el celular y en el PDF caben menos etiquetas: son un subconjunto de las de escritorio
  const cadaMovil = cada * Math.max(1, Math.ceil(Math.ceil(datos.length / 7) / cada))
  return (
    <div className="dr-barras" role="img" aria-label="Gráfica de barras; el detalle está en la tabla por día">
      <div className="dr-barras-plot">
        {meta != null && meta > 0 && (
          <div className="dr-meta" style={{ bottom: `${(meta / max) * 100}%` }}><span>Meta {formato(meta)}</span></div>
        )}
        {datos.map((d, i) => (
          <div key={i} className="dr-barra-col" tabIndex={0}>
            <div className={'dr-barra' + (d.tenue ? ' is-tenue' : '') + (marcar?.(d.valor) ? ' is-meta' : '')} style={{ height: `${(d.valor / max) * 100}%` }} />
            <div className="dr-tip"><b>{d.detalle}</b><br />{formato(d.valor)}</div>
          </div>
        ))}
      </div>
      <div className="dr-barras-eje">
        {datos.map((d, i) => <span key={i} className={i % cadaMovil === 0 ? 'is-m' : ''}>{i % cada === 0 ? d.etiqueta : ''}</span>)}
      </div>
    </div>
  )
}

function Tabla({ cols, filas, alinear }: { cols: string[]; filas: ReactNode[][]; alinear?: ('l' | 'r')[] }) {
  return (
    <div className="dr-tabla-wrap"><table className="dr-tabla">
      <thead><tr>{cols.map((c, i) => <th key={c} className={alinear?.[i] === 'l' || (!alinear && i === 0) ? '' : 'is-r'}>{c}</th>)}</tr></thead>
      <tbody>{filas.map((f, j) => <tr key={j}>{f.map((c, i) => <td key={i} className={alinear?.[i] === 'l' || (!alinear && i === 0) ? '' : 'is-r'}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  )
}

export function ReporteVista({ datos, titulo, desde, hasta, pie, acciones }: {
  datos: DatosReporte; titulo: string; desde: string; hasta: string; pie?: ReactNode; acciones?: ReactNode
}) {
  const r = resumir(datos)
  const ws = semanas(datos.dias)
  const sinDatos = r.diasAbiertos === 0
  const pago = r.efectivo + r.tarjeta
  const topPlatillos = datos.platillos.slice(0, 12)
  const maxPlatillo = Math.max(1, ...topPlatillos.map(p => p.cantidad))
  const servicioTotal = Object.values(datos.servicio).reduce((a, b) => a + b, 0)

  return (
    <div className="dr">
      <header className="dr-head">
        <Logo />
        <div className="dr-head-txt">
          <h1>{titulo}</h1>
          <p>{periodoTexto(desde, hasta)}</p>
        </div>
        {acciones && <div className="dr-acciones">{acciones}</div>}
      </header>

      {sinDatos ? (
        <div className="dr-vacio">Todavía no hay ventas registradas en este periodo.</div>
      ) : (
        <>
          <div className="dr-kpis">
            <Kpi k="VENTA" v={pesos(r.venta)} ayuda={`${r.diasAbiertos} días con venta`} />
            <Kpi k="COMIDAS VENDIDAS" v={r.comidas.toLocaleString('es-MX')} ayuda={`${r.comidasPromedio} al día · meta ${datos.meta}`} />
            <Kpi k="DÍAS EN META" v={`${r.diasConMeta} de ${r.diasAbiertos}`} ayuda={`${datos.meta} comidas o más`} />
            <Kpi k="TICKET PROMEDIO" v={pesos(r.ticket)} ayuda={`${r.ordenes.toLocaleString('es-MX')} órdenes`} />
          </div>

          <Seccion titulo="COMIDAS VENDIDAS POR DÍA" ayuda={`Meta: ${datos.meta} al día${r.diasHistorial ? ' · las barras claras vienen del historial' : ''}`}>
            <Barras
              meta={datos.meta}
              formato={n => `${n} comidas`}
              marcar={v => v >= datos.meta}
              datos={datos.dias.map(d => ({ etiqueta: datos.dias.length > 31 ? fechaCorta(d.fecha) : diaCorto(d.fecha), valor: d.comidas, detalle: diaCorto(d.fecha) + (d.fuente === 'historial' ? ' · historial' : ''), tenue: d.fuente === 'historial' }))}
            />
          </Seccion>

          {ws.length > 1 && (
            <Seccion titulo="SEMANA CONTRA SEMANA" ayuda="Venta promedio por día abierto, de lunes a domingo (así se comparan bien las semanas incompletas)">
              <Barras formato={n => `${pesos(n)} al día`} datos={ws.map(w => ({ etiqueta: fechaCorta(w.lunes), valor: w.promedio, detalle: `Semana del ${fechaCorta(w.lunes)} · ${w.dias} ${w.dias === 1 ? 'día' : 'días'}` }))} />
              <Tabla
                cols={['Semana', 'Días', 'Comidas', 'Venta', 'Por día', 'Ticket', 'vs. anterior']}
                filas={ws.map(w => [`${fechaCorta(w.lunes)} – ${fechaCorta(w.domingo)}`, w.dias, w.comidas, pesos(w.venta), pesos(w.promedio), pesos(w.ticket),
                  w.cambio == null ? '—' : <span className={w.cambio < 0 ? 'dr-baja' : 'dr-sube'}>{w.cambio < 0 ? '▼' : '▲'} {porcentaje(w.cambio)}</span>])}
              />
            </Seccion>
          )}

          <div className="dr-dos">
            <Seccion titulo="LO MÁS VENDIDO">
              {topPlatillos.length === 0 ? <p className="dr-nota">Sin detalle por platillo.</p> : (
                <div className="dr-ranking">
                  {topPlatillos.map(p => (
                    <div key={p.nombre} className="dr-rank">
                      <span className="dr-rank-n">{p.nombre}</span>
                      <span className="dr-rank-barra"><span style={{ width: `${(p.cantidad / maxPlatillo) * 100}%` }} /></span>
                      <span className="dr-rank-v">{p.cantidad}</span>
                    </div>
                  ))}
                </div>
              )}
            </Seccion>

            <Seccion titulo="CÓMO PAGAN">
              <Tabla cols={['Forma', 'Monto', '%']} filas={[
                ['Efectivo', pesos(r.efectivo), pago ? `${Math.round((r.efectivo / pago) * 100)} %` : '—'],
                ['Tarjeta', pesos(r.tarjeta), pago ? `${Math.round((r.tarjeta / pago) * 100)} %` : '—'],
              ]} />
              <p className="dr-nota">Propinas (aparte de la venta): <b>{pesos(r.propinas)}</b></p>
              {servicioTotal > 0 && (
                <p className="dr-nota">Aquí {Math.round(((datos.servicio.aqui ?? 0) / servicioTotal) * 100)} % · Para llevar {Math.round(((datos.servicio.llevar ?? 0) / servicioTotal) * 100)} %</p>
              )}
              {pago < r.venta && <p className="dr-nota">Los días del historial sin forma de pago no se incluyen aquí.</p>}
            </Seccion>
          </div>

          <div className="dr-dos">
            <Seccion titulo="CONVENIOS Y DESCUENTOS">
              {datos.descuentos.length === 0 ? <p className="dr-nota">Ninguno en el periodo.</p> : (
                <Tabla cols={['Descuento', 'Órdenes', 'Descontado']} filas={datos.descuentos.map(d => [d.nombre, d.ordenes, pesos(d.monto)])} />
              )}
            </Seccion>
            <Seccion titulo="SIN COBRO" ayuda="A precio de lista, como costo">
              {datos.sin_cobro.length === 0 ? <p className="dr-nota">Ninguno en el periodo.</p> : (
                <Tabla cols={['Motivo', 'Comidas', 'Costo']} filas={datos.sin_cobro.map(s => [s.motivo, s.comidas, pesos(s.costo)])} />
              )}
            </Seccion>
          </div>

          {(datos.colaboraciones.length > 0 || datos.cajeros.length > 0) && (
            <div className="dr-dos">
              {datos.colaboraciones.length > 0 && (
                <Seccion titulo="COLABORACIONES" ayuda="Reparto 50-50 la primera semana">
                  <Tabla cols={['Chef', 'Vendidos', 'Ganancia', 'Al chef']} filas={datos.colaboraciones.map(c => [c.chef, c.vendidos, pesos(c.ganancia), pesos(c.al_chef)])} />
                </Seccion>
              )}
              {datos.cajeros.length > 0 && (
                <Seccion titulo="QUIÉN COBRÓ">
                  <Tabla cols={['Cajero', 'Órdenes', 'Venta']} filas={datos.cajeros.map(c => [c.cajero, c.ordenes, pesos(c.venta)])} />
                </Seccion>
              )}
            </div>
          )}

          {datos.horas.length > 0 && (
            <Seccion titulo="HORAS CON MÁS ÓRDENES">
              <Barras formato={n => `${n} órdenes`} datos={datos.horas.map(h => ({ etiqueta: `${h.hora % 12 || 12}${h.hora < 12 ? 'am' : 'pm'}`, valor: h.ordenes, detalle: `${h.hora}:00 a ${h.hora}:59` }))} />
            </Seccion>
          )}

          <Seccion titulo="DETALLE POR DÍA">
            <Tabla
              cols={['Día', 'Comidas', 'Órdenes', 'Venta', 'Ticket', 'Origen']}
              filas={datos.dias.filter(abierto).map(d => [
                diaCorto(d.fecha) + ' ' + fechaCorta(d.fecha).split(' ')[1],
                <span className={d.comidas >= datos.meta ? 'dr-sube' : ''}>{d.comidas}</span>,
                d.ordenes, pesos(d.venta), d.ordenes ? pesos(ticketDe(d.venta, d.ordenes)) : '—',
                d.fuente === 'pos' ? 'Caja' : 'Historial',
              ])}
            />
          </Seccion>
        </>
      )}
      {pie && <footer className="dr-pie">{pie}</footer>}
    </div>
  )
}
