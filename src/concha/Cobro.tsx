// Doña Concha · POS — pantalla de cobro (propuesta, mismo estilo que Venta).
// Efectivo con lo recibido y el cambio, tarjeta (se cobra en la terminal del
// banco; aquí solo se registra), pago dividido y propina en efectivo o tarjeta.
// Un solo teclado numérico edita el campo seleccionado.
import { useState } from 'react'
import type { Orden, Pago } from './types'
import { armarPagos, billetesSugeridos, folioTxt, pesos, type CamposCobro, type ModoCobro, type Totales } from './logic'

type Campo = 'recibido' | 'propina' | 'referencia' | 'enEfectivo'

interface Props {
  orden: Orden
  tot: Totales
  folio: number
  descTxt: string | null
  modoInicial: ModoCobro
  onCancelar: () => void
  /** Devuelve la orden cobrada o un mensaje de error */
  onConfirmar: (pagos: Pago[]) => Orden | string
  onNueva: () => void
}

const aCent = (s: string) => (s ? parseInt(s, 10) * 100 : 0)

export function Cobro({ orden, tot, folio, descTxt, modoInicial, onCancelar, onConfirmar, onNueva }: Props) {
  const [modo, setModo] = useState<ModoCobro>(modoInicial)
  const [v, setV] = useState<Record<Campo, string>>({ recibido: '', propina: '', referencia: '', enEfectivo: '' })
  const [propinaForma, setPropinaForma] = useState<'efectivo' | 'tarjeta'>(modoInicial === 'efectivo' ? 'efectivo' : 'tarjeta')
  const [campo, setCampo] = useState<Campo>(modoInicial === 'dividir' ? 'enEfectivo' : modoInicial === 'efectivo' ? 'recibido' : 'propina')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Orden | null>(null)

  const total = tot.total
  const campos: CamposCobro = {
    recibido: aCent(v.recibido), propina: aCent(v.propina), propinaForma,
    referencia: v.referencia, enEfectivo: aCent(v.enEfectivo),
  }
  const { pagos, error: invalido } = armarPagos(modo, total, campos)
  const cambio = pagos.filter(p => p.forma === 'efectivo').reduce((s, p) => s + (p.cambio ?? 0), 0)
  const enTerminal = pagos.filter(p => p.forma === 'tarjeta').reduce((s, p) => s + p.monto + p.propina, 0)

  function elegirModo(m: ModoCobro) {
    setModo(m); setError(null)
    setV(prev => ({ ...prev, recibido: '', enEfectivo: '' }))   // los montos dependen de la forma de pago
    setPropinaForma(m === 'efectivo' ? 'efectivo' : 'tarjeta')
    setCampo(m === 'dividir' ? 'enEfectivo' : m === 'efectivo' ? 'recibido' : 'propina')
  }
  function tecla(k: string) {
    setError(null)
    setV(prev => {
      const cur = prev[campo]
      const max = campo === 'referencia' ? 12 : 6
      const next = k === '⌫' ? cur.slice(0, -1) : k === 'C' ? '' : (cur + k).replace(/^0+(?=\d)/, '').slice(0, max)
      return { ...prev, [campo]: next }
    })
  }
  function confirmar() {
    if (invalido) { setError(invalido); return }
    const r = onConfirmar(pagos)
    if (typeof r === 'string') setError(r)
    else setHecho(r)
  }

  // ── Listo: cambio grande y nueva orden ──
  if (hecho) {
    const cam = hecho.pagos.filter(p => p.forma === 'efectivo').reduce((s, p) => s + (p.cambio ?? 0), 0)
    const prop = hecho.pagos.reduce((s, p) => s + p.propina, 0)
    return (
      <div className="dc-velo">
        <div className="dc-cobro dc-cobro-listo">
          <p className="dc-label">ORDEN {folioTxt(hecho.folio!)} · COBRADA</p>
          {hecho.pagos.some(p => p.forma === 'efectivo' && p.monto > 0) ? (
            <>
              <p className="dc-cobro-k">Cambio</p>
              <p className="dc-cobro-grande">{pesos(cam)}</p>
            </>
          ) : (
            <p className="dc-cobro-grande">{pesos(hecho.total)}</p>
          )}
          <p className="dc-cobro-nota">
            {hecho.pagos.map(p => `${p.forma === 'efectivo' ? 'Efectivo' : 'Tarjeta'} ${pesos(p.monto)}`).filter((_, i) => hecho.pagos[i].monto > 0).join(' · ')}
            {prop > 0 && ` · Propina ${pesos(prop)}`}
          </p>
          <button type="button" className="dc-cobrar" onClick={onNueva} autoFocus>NUEVA ORDEN</button>
        </div>
      </div>
    )
  }

  const campoBtn = ({ id, k, valor, ayuda }: { id: Campo; k: string; valor: string; ayuda?: string }) => (
    <button type="button" className={'dc-campo' + (campo === id ? ' is-on' : '')} onClick={() => setCampo(id)}>
      <span className="dc-campo-k">{k}</span>
      <span className="dc-campo-v">{valor}</span>
      {ayuda && <span className="dc-campo-a">{ayuda}</span>}
    </button>
  )

  return (
    <div className="dc-velo">
      <div className="dc-cobro">
        {/* Resumen de la orden */}
        <section className="dc-cobro-resumen">
          <div className="dc-orden-head">
            <h2>COBRAR {folioTxt(folio)}</h2>
            <span className="dc-hora">{orden.servicio === 'llevar' ? 'Para llevar' : orden.servicio === 'domicilio' ? 'A domicilio' : 'Aquí'}</span>
          </div>
          <div className="dc-renglones">
            {orden.renglones.map(r => (
              <div key={r.id} className="dc-renglon">
                <span className="dc-cant">{r.cantidad}</span>
                <span className="dc-det"><b>{r.nombre}</b>{r.tipo === 'comida' && <small>{r.guarniciones.map(g => g.nombre).join(' · ')}</small>}</span>
                <span className="dc-monto">{pesos(r.precioUnit * r.cantidad)}</span>
              </div>
            ))}
          </div>
          <div className="dc-espacio" />
          <div className="dc-rule" />
          <div className="dc-total"><span>Subtotal</span><strong>{pesos(tot.subtotal)}</strong></div>
          {descTxt && <div className="dc-total"><span>{descTxt}</span><strong>{pesos(-tot.descuento)}</strong></div>}
          <div className="dc-total is-grande"><span>TOTAL</span><strong>{pesos(total)}</strong></div>
        </section>

        {/* Pago */}
        <section className="dc-cobro-pago">
          <div className="dc-pagos">
            {(['efectivo', 'tarjeta', 'dividir'] as const).map(m => (
              <button key={m} type="button" className={'dc-pago' + (modo === m ? ' is-on' : '')} onClick={() => elegirModo(m)}>
                {m === 'efectivo' ? 'Efectivo' : m === 'tarjeta' ? 'Tarjeta' : 'Dividir'}
              </button>
            ))}
          </div>

          <div className="dc-campos">
            {modo === 'dividir' && campoBtn({ id: "enEfectivo", k: "EN EFECTIVO", valor: pesos(campos.enEfectivo), ayuda: `Tarjeta ${pesos(Math.max(0, total - campos.enEfectivo))}` })}
            {modo !== 'tarjeta' && campoBtn({ id: "recibido", k: "RECIBIDO", valor: v.recibido ? pesos(campos.recibido) : modo === 'dividir' ? 'Exacto' : '$0' })}
            {campoBtn({ id: "propina", k: "PROPINA", valor: pesos(campos.propina) })}
            {modo !== 'efectivo' && campoBtn({ id: "referencia", k: "REFERENCIA", valor: v.referencia || '—', ayuda: v.referencia ? undefined : 'Opcional' })}
          </div>

          {modo !== 'efectivo' && campos.propina > 0 && (
            <div className="dc-row" style={{ gap: 8, alignItems: 'center' }}>
              <span className="dc-label">PROPINA EN</span>
              <button type="button" className={'dc-chip' + (propinaForma === 'tarjeta' ? ' is-on' : '')} onClick={() => setPropinaForma('tarjeta')}>Tarjeta</button>
              <button type="button" className={'dc-chip' + (propinaForma === 'efectivo' ? ' is-on' : '')} onClick={() => setPropinaForma('efectivo')}>Efectivo</button>
            </div>
          )}

          {campo === 'recibido' && modo === 'efectivo' && (
            <div className="dc-row" style={{ gap: 8 }}>
              {billetesSugeridos(total + campos.propina).map(b => (
                <button key={b} type="button" className="dc-chip" onClick={() => setV(p => ({ ...p, recibido: String(b / 100) }))}>
                  {b === total + campos.propina ? 'Exacto' : pesos(b)}
                </button>
              ))}
            </div>
          )}

          <div className="dc-teclado">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => (
              <button key={k} type="button" onClick={() => tecla(k)}>{k}</button>
            ))}
          </div>

          <div className="dc-cobro-estado">
            {pagos.some(p => p.forma === 'efectivo' && p.monto > 0) && <div className="dc-total is-grande"><span>CAMBIO</span><strong>{pesos(cambio)}</strong></div>}
            {enTerminal > 0 && <p className="dc-cobro-nota">Cobra en la terminal: <b>{pesos(enTerminal)}</b>{campos.propina > 0 && propinaForma === 'tarjeta' ? ' (incluye propina)' : ''}</p>}
            {(error || (invalido && (v.recibido || modo !== 'efectivo'))) && <p className="dc-cobro-error">{error ?? invalido}</p>}
          </div>

          <div className="dc-hoja-btns">
            <button type="button" className="dc-pago" onClick={onCancelar}>Volver</button>
            <button type="button" className="dc-cobrar" style={{ flex: 2 }} onClick={confirmar} disabled={!!invalido}>
              REGISTRAR {pesos(total)}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
