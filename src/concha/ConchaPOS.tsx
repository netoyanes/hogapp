// Doña Concha · POS — pantalla de venta (Figma 191:161).
// Tablet horizontal 1366×1024. A la izquierda el menú del día; a la derecha la
// orden en curso. Funciona sin internet: todo se guarda en la tablet (store.ts).
import { useEffect, useState } from 'react'
import './concha.css'
import type { Descuento, Orden, Pago, Renglon } from './types'
import {
  aplicado, comidasEnOrden, fechaLarga, fechaLocal, folioTxt, horaCorta, horario,
  menuDelDia, pesos, siguienteFolio, totales, turnoDelDia, type ItemDelDia,
} from './logic'
import { cobrarOrden, ErrorCobro, setBorrador, usePOS } from './store'
import { Cobro } from './Cobro'
import { CorteCaja } from './CorteCaja'
import { subirPendientes, useSesion, useSincronizacion } from './sync'
import { Chip, HojaCodigo, HojaEntrar, Logo } from './comun'
import { nuevaOrden, textoDescuento, useAhora, useEnLinea, usePrecache } from './util'
import { ConchaMovil } from './ConchaMovil'
import { useIsMobile } from '../hooks/useIsMobile'

// ── Componentes del archivo de Figma ──────────────────────────────────────

/** POS / Tarjeta de guiso (191:146) */
function TarjetaGuiso({ item, onAgregar }: { item: ItemDelDia; onAgregar: () => void }) {
  const { agotado } = item
  return (
    <div className={'dc-card' + (agotado ? ' is-agotado' : '')}>
      <div className="dc-card-top">
        <span className="dc-tag">{item.etiqueta}</span>
        <p className="dc-card-name">{item.platillo.nombre}</p>
      </div>
      <div className="dc-card-bottom">
        <div>
          <div className="dc-price">{item.precio ? pesos(item.precio) : '—'}</div>
          <div className="dc-quedan">{agotado ? 'Agotado' : item.quedan == null ? 'Sin límite' : `Quedan ${item.quedan}`}</div>
        </div>
        <button type="button" className="dc-add" onClick={onAgregar} disabled={agotado}>
          {agotado ? 'Agotado' : '+ Agregar'}
        </button>
      </div>
    </div>
  )
}

type Vista = 'venta' | 'semana' | 'colaboraciones' | 'extras' | 'corte'
type FormaUI = 'efectivo' | 'tarjeta' | 'dividir'

const PENDIENTES: Record<Exclude<Vista, 'venta' | 'corte'>, { t: string; d: string }> = {
  semana: { t: 'Semana', d: 'Menú por día, mover o copiar platillos y existencias. Se construye después del cobro y el corte.' },
  colaboraciones: { t: 'Colaboraciones', d: 'Chef, platillo, fechas, precio, costo y reparto. Va después de Descuentos.' },
  extras: { t: 'Bebidas y extras', d: 'Aguas, guarniciones y extras del día con su precio. Los precios de medio litro, litro, arroz extra y agua extra siguen pendientes.' },
}

// ── Pantalla ──────────────────────────────────────────────────────────────

/** Tablet: la pantalla de Figma. Celular: flujo guiado paso a paso (ConchaMovil). */
export function ConchaPOS() {
  return useIsMobile(760) ? <ConchaMovil /> : <ConchaTablet />
}

function ConchaTablet() {
  const pos = usePOS()
  const { catalogo: cat, existencias, ordenes, dispositivo } = pos
  const ahora = useAhora()
  const enLinea = useEnLinea()
  usePrecache()
  const hoy = fechaLocal(ahora)
  const turno = turnoDelDia(cat, hoy)

  // Orden en curso: se guarda en la tablet; si cambió el día, se empieza otra
  const orden: Orden = pos.borrador && pos.borrador.fecha === hoy
    ? pos.borrador
    : nuevaOrden(hoy, turno?.id ?? null, dispositivo)
  const guardarOrden = (o: Orden) => setBorrador(o)

  const [vista, setVista] = useState<Vista>('venta')
  const [guarniciones, setGuarniciones] = useState<string[]>([])
  const [agua, setAgua] = useState<string | null | undefined>(undefined) // null = sin agua
  const [forma, setForma] = useState<FormaUI>('efectivo')
  const [sel, setSel] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const [hojaCodigo, setHojaCodigo] = useState(false)
  const [hojaCobro, setHojaCobro] = useState(false)
  const [hojaEntrar, setHojaEntrar] = useState(false)
  const sesion = useSesion()
  const errorSync = useSincronizacion(sesion)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(id)
  }, [toast])

  const enOrden: Record<string, number> = {}
  for (const r of orden.renglones) enOrden[r.platilloId] = (enOrden[r.platilloId] ?? 0) + r.cantidad

  const guisos = menuDelDia(cat, hoy, 'guiso', existencias, enOrden)
  const guarnDia = menuDelDia(cat, hoy, 'guarnicion')
  const aguasDia = menuDelDia(cat, hoy, 'agua')
  const extrasDia = menuDelDia(cat, hoy, 'extra')

  // Por omisión: las dos primeras guarniciones y la primera agua (como en el diseño)
  const guarnSel = guarniciones.length ? guarniciones : guarnDia.slice(0, 2).map(g => g.platillo.id)
  const aguaSel = agua === undefined ? (aguasDia[0]?.platillo.id ?? null) : agua

  const descActivo: Descuento | undefined = cat.descuentos.find(d => d.id === orden.descuento?.id)
  const tot = totales(orden.renglones, orden.descuento, turno, descActivo)
  const descuentosHoy = cat.descuentos.filter(d => d.activo && (!d.desde || d.desde <= hoy) && (!d.hasta || hoy <= d.hasta))
  const convenios = descuentosHoy.filter(d => d.tipo === 'convenio')
  const sinCobro = descuentosHoy.filter(d => d.tipo === 'sin_cobro')
  const frecuente = descuentosHoy.find(d => d.tipo === 'cliente_frecuente')
  const sellosMax = cat.config.sellosParaGratis

  // Lo vendido hoy (barra superior)
  const deHoy = ordenes.filter(o => o.fecha === hoy && o.estado === 'cobrada')
  const vendidosHoy = deHoy.filter(o => !o.sinCobro).reduce((s, o) => s + comidasEnOrden(o.renglones), 0)
  const ventaHoy = deHoy.filter(o => !o.sinCobro).reduce((s, o) => s + o.total, 0)
  const sinCobroHoy = deHoy.filter(o => o.sinCobro).length
  const porSubir = ordenes.filter(o => !o.sincronizada).length + pos.gastos.filter(g => !g.sincronizado).length + pos.cortes.filter(c => !c.sincronizado).length
  const cajaCerrada = pos.cortes.some(c => c.fecha === hoy)

  const aviso = (msg: string, error = false) => setToast({ msg, error })

  // ── Acciones ──
  function toggleGuarnicion(id: string) {
    const cur = guarnSel
    if (cur.includes(id)) setGuarniciones(cur.filter(x => x !== id))
    else setGuarniciones(cur.length >= 2 ? [cur[1], id] : [...cur, id]) // la tercera reemplaza a la más vieja
  }

  function agregarGuiso(item: ItemDelDia) {
    if (item.agotado) return
    if (!item.precio) { aviso(`Falta definir el precio de ${item.platillo.nombre}${turno ? ` (${turno.nombre})` : ''}`, true); return }
    if (guarnSel.length !== 2) { aviso('Elige dos guarniciones', true); return }
    const gs = guarnSel.map(id => ({ id, nombre: guarnDia.find(g => g.platillo.id === id)?.platillo.nombre ?? id }))
    const ag = aguaSel ? { id: aguaSel, nombre: aguasDia.find(a => a.platillo.id === aguaSel)?.platillo.nombre ?? aguaSel } : null
    const clave = (r: Renglon) => `${r.platilloId}|${r.guarniciones.map(g => g.id).join(',')}|${r.agua?.id ?? ''}`
    const nuevo: Renglon = {
      id: crypto.randomUUID(), tipo: 'comida', platilloId: item.platillo.id, nombre: item.platillo.nombre,
      guarniciones: gs, agua: ag, cantidad: 1, precioUnit: item.precio, costoUnit: item.costo,
      colaboracionId: item.colaboracion?.id ?? null,
    }
    const igual = orden.renglones.find(r => clave(r) === clave(nuevo))
    const renglones = igual
      ? orden.renglones.map(r => (r === igual ? { ...r, cantidad: r.cantidad + 1 } : r))
      : [...orden.renglones, nuevo]
    guardarOrden({ ...orden, renglones })
  }

  function agregarExtra(item: ItemDelDia) {
    if (item.precio == null) {
      aviso(`Falta definir el precio de ${item.platillo.nombre}. Se captura en Bebidas y extras.`, true)
      return
    }
    const igual = orden.renglones.find(r => r.tipo === 'extra' && r.platilloId === item.platillo.id)
    const renglones = igual
      ? orden.renglones.map(r => (r === igual ? { ...r, cantidad: r.cantidad + 1 } : r))
      : [...orden.renglones, {
          id: crypto.randomUUID(), tipo: 'extra' as const, platilloId: item.platillo.id, nombre: item.platillo.nombre,
          guarniciones: [], agua: null, cantidad: 1, precioUnit: item.precio, costoUnit: item.costo, colaboracionId: null,
        }]
    guardarOrden({ ...orden, renglones })
  }

  function cambiarCantidad(id: string, delta: number) {
    const r = orden.renglones.find(x => x.id === id)
    if (!r) return
    if (delta > 0 && r.tipo === 'comida') {
      const item = guisos.find(g => g.platillo.id === r.platilloId)
      if (item && (item.agotado || item.quedan === 0)) { aviso(`Ya no quedan porciones de ${r.nombre}`, true); return }
    }
    const cantidad = r.cantidad + delta
    const renglones = cantidad <= 0 ? orden.renglones.filter(x => x.id !== id) : orden.renglones.map(x => (x.id === id ? { ...x, cantidad } : x))
    if (cantidad <= 0) setSel(null)
    guardarOrden({ ...orden, renglones })
  }

  /** Un descuento por orden: elegir otro reemplaza al anterior; tocar el mismo lo quita */
  function elegirDescuento(d: Descuento | null, codigo: string | null = null) {
    const quitar = !d || orden.descuento?.id === d.id
    guardarOrden({
      ...orden,
      descuento: quitar ? null : aplicado(d),
      codigoCapturado: quitar ? null : codigo,
      selloNumero: !quitar && d.tipo === 'cliente_frecuente' ? sellosMax
        : orden.descuento?.tipo === 'cliente_frecuente' ? null : orden.selloNumero,
    })
  }

  function tocarSello(n: number) {
    if (n === sellosMax) {
      if (!frecuente) { aviso('Configura el descuento de cliente frecuente', true); return }
      elegirDescuento(frecuente)
      return
    }
    const quitarFrecuente = orden.descuento?.tipo === 'cliente_frecuente'
    guardarOrden({
      ...orden,
      selloNumero: orden.selloNumero === n ? null : n,
      descuento: quitarFrecuente ? null : orden.descuento,
      codigoCapturado: quitarFrecuente ? null : orden.codigoCapturado,
    })
  }

  /** Cierra la orden con sus pagos (vacío = sin cobro). Devuelve la orden o el error. */
  function registrar(pagos: Pago[]): Orden | string {
    try {
      const c = cobrarOrden({
        ...orden, turnoId: turno?.id ?? null, subtotal: tot.subtotal, descuentoMonto: tot.descuento,
        total: tot.total, sinCobro: tot.sinCobro, costoSinCobro: tot.costoSinCobro, sellos: tot.sellos, pagos,
        cajero: sesion?.user.id ?? null,
      })
      setSel(null)
      subirPendientes().catch(() => {})
      return c
    } catch (e) {
      return e instanceof ErrorCobro ? e.message : 'No se pudo guardar la orden'
    }
  }

  function cobrar() {
    if (!orden.renglones.length) return
    if (tot.sinCobro || tot.total === 0) {
      const r = registrar([])
      if (typeof r === 'string') aviso(r, true)
      else aviso(tot.sinCobro ? `Orden ${folioTxt(r.folio!)} registrada sin cobro · ${orden.descuento?.nombre}` : `Orden ${folioTxt(r.folio!)} registrada`)
      return
    }
    setHojaCobro(true)
  }

  // ── Textos ──
  const folio = folioTxt(siguienteFolio(ordenes, hoy))
  const selloTxt = orden.selloNumero == null ? 'CLIENTE FRECUENTE · MARCA EL SELLO'
    : orden.selloNumero === sellosMax ? `CLIENTE FRECUENTE · SELLO ${sellosMax} DE ${sellosMax} · GRATIS`
    : `CLIENTE FRECUENTE · SELLO ${orden.selloNumero} DE ${sellosMax}`
  const descTxt = textoDescuento(orden, cat)
  const btnCobrar = tot.sinCobro ? 'REGISTRAR SIN COBRO' : `COBRAR ${pesos(tot.total)}`

  return (
    <div className="dc">
      {/* Barra superior */}
      <header className="dc-top">
        <div className="dc-brand">
          <Logo />
          <div>
            <h1 className="dc-title">PUNTO DE VENTA</h1>
            <p className="dc-sub">
              {fechaLarga(hoy)} · {turno ? `${turno.nombre} ${horario(turno.inicio, turno.fin)}` : 'Hoy no hay servicio'}
              {!enLinea && <> · <b>Sin internet</b></>}
              {cajaCerrada && <> · <b>Caja cerrada</b></>}
              {porSubir > 0 && <> · {porSubir} por subir</>}
              {sesion === null && <> · <button type="button" className="dc-link" onClick={() => setHojaEntrar(true)}>Entrar para sincronizar</button></>}
              {sesion && errorSync && errorSync !== 'sin sesión' && <> · <b title={errorSync}>No se pudo subir</b></>}
            </p>
          </div>
        </div>
        <div className="dc-estado">
          <div className="dc-stat"><span className="dc-stat-k">VENDIDOS HOY</span><span className="dc-stat-v">{vendidosHoy}</span></div>
          <div className="dc-stat"><span className="dc-stat-k">VENTA DEL DÍA</span><span className="dc-stat-v">{pesos(ventaHoy)}</span></div>
          <div className="dc-stat"><span className="dc-stat-k">SIN COBRO</span><span className="dc-stat-v">{sinCobroHoy}</span></div>
          <button type="button" className="dc-btn-corte" onClick={() => setVista('corte')}>Corte de caja</button>
        </div>
      </header>

      {vista === 'corte' ? <CorteCaja hoy={hoy} cajero={sesion?.user.id ?? null} onVolver={() => setVista('venta')} /> : (
      <div className="dc-body">
        {/* Menú */}
        <main className="dc-menu">
          <nav className="dc-row">
            <Chip on={vista === 'venta'} onClick={() => setVista('venta')}>Menú de hoy</Chip>
            <Chip on={vista === 'semana'} onClick={() => setVista('semana')}>Semana</Chip>
            <Chip on={vista === 'colaboraciones'} onClick={() => setVista('colaboraciones')}>Colaboraciones</Chip>
            <Chip on={vista === 'extras'} onClick={() => setVista('extras')}>Bebidas y extras</Chip>
          </nav>

          {vista !== 'venta' ? (
            <div className="dc-pendiente">
              <h3>{PENDIENTES[vista].t}</h3>
              <p>{PENDIENTES[vista].d}</p>
            </div>
          ) : !turno ? (
            <div className="dc-pendiente">
              <h3>Hoy no hay servicio</h3>
              <p>Comida de lunes a viernes y brunch los sábados. Los horarios se cambian en la configuración.</p>
            </div>
          ) : (
            <>
              <div className="dc-head">
                <h2>{turno.id === 'comida' ? 'GUISOS DE HOY' : `${turno.nombre.toUpperCase()} DE HOY`}</h2>
                <span>Comida completa: un guiso, dos guarniciones y agua de sabor</span>
              </div>
              {guisos.length ? (
                <div className="dc-guisos">
                  {guisos.map(g => <TarjetaGuiso key={g.menu.id} item={g} onAgregar={() => agregarGuiso(g)} />)}
                </div>
              ) : (
                <div className="dc-pendiente"><p>No hay guisos capturados para hoy. Se agregan desde Semana.</p></div>
              )}

              <div className="dc-head"><h2>GUARNICIONES</h2><span>Elige dos</span></div>
              <div className="dc-row">
                {guarnDia.map(g => (
                  <Chip key={g.platillo.id} on={guarnSel.includes(g.platillo.id)} onClick={() => toggleGuarnicion(g.platillo.id)}>
                    {g.platillo.nombre}
                  </Chip>
                ))}
              </div>

              <div className="dc-head"><h2>AGUA DE SABOR</h2><span>Incluida</span></div>
              <div className="dc-row">
                {aguasDia.map(a => (
                  <Chip key={a.platillo.id} on={aguaSel === a.platillo.id} onClick={() => setAgua(a.platillo.id)}>{a.platillo.nombre}</Chip>
                ))}
                <Chip on={aguaSel === null} onClick={() => setAgua(null)}>Sin agua</Chip>
              </div>

              <div className="dc-head"><h2>EXTRAS</h2><span>Se cobran aparte</span></div>
              <div className="dc-row">
                {extrasDia.map(x => (
                  <Chip key={x.platillo.id} onClick={() => agregarExtra(x)}>
                    {x.platillo.nombre}{x.precio != null ? ` ${pesos(x.precio)}` : ''}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </main>

        {/* Orden */}
        <aside className="dc-orden">
          <div className="dc-orden-head">
            <h2>ORDEN {folio}</h2>
            <span className="dc-hora">{horaCorta(ahora)}</span>
          </div>

          <div className="dc-row" style={{ gap: 8 }}>
            {cat.config.servicios.aqui && <Chip on={orden.servicio === 'aqui'} onClick={() => guardarOrden({ ...orden, servicio: 'aqui' })}>Aquí</Chip>}
            {cat.config.servicios.llevar && <Chip on={orden.servicio === 'llevar'} onClick={() => guardarOrden({ ...orden, servicio: 'llevar' })}>Para llevar</Chip>}
            {cat.config.servicios.domicilio && <Chip on={orden.servicio === 'domicilio'} onClick={() => guardarOrden({ ...orden, servicio: 'domicilio' })}>A domicilio</Chip>}
          </div>

          <div className="dc-renglones">
            {orden.renglones.length === 0 && <p className="dc-vacia">Toca «+ Agregar» en un guiso para empezar la orden.</p>}
            {orden.renglones.map(r => (
              <div key={r.id}>
                <button type="button" className="dc-renglon" onClick={() => setSel(sel === r.id ? null : r.id)}>
                  <span className="dc-cant">{r.cantidad}</span>
                  <span className="dc-det">
                    <b>{r.nombre}</b>
                    {r.tipo === 'comida' && (
                      <small>
                        {[r.colaboracionId ? 'Colaboración' : null, ...r.guarniciones.map(g => g.nombre), r.agua ? `Agua de ${r.agua.nombre.toLowerCase()}` : 'Sin agua']
                          .filter(Boolean).join(' · ')}
                      </small>
                    )}
                    {r.tipo === 'extra' && <small>Extra</small>}
                  </span>
                  <span className="dc-monto">{pesos(r.precioUnit * r.cantidad)}</span>
                </button>
                {sel === r.id && (
                  <div className="dc-ajuste" style={{ marginTop: 8 }}>
                    <button type="button" onClick={() => cambiarCantidad(r.id, -1)} aria-label="Uno menos">−</button>
                    <button type="button" onClick={() => cambiarCantidad(r.id, 1)} aria-label="Uno más">+</button>
                    <button type="button" className="dc-quitar" onClick={() => cambiarCantidad(r.id, -r.cantidad)}>Quitar</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="dc-rule" />

          <p className="dc-label">CÓDIGO DE DESCUENTO · CONVENIO</p>
          <div className="dc-row" style={{ gap: 8 }}>
            {convenios.map(d => <Chip key={d.id} on={orden.descuento?.id === d.id} onClick={() => elegirDescuento(d)}>{d.etiqueta}</Chip>)}
            <Chip on={orden.descuento?.tipo === 'codigo'} onClick={() => (orden.descuento?.tipo === 'codigo' ? elegirDescuento(null) : setHojaCodigo(true))}>
              {orden.descuento?.tipo === 'codigo' ? `${orden.codigoCapturado} ${orden.descuento.porcentaje}%` : '+ Otro código'}
            </Chip>
          </div>

          <p className="dc-label">{selloTxt}</p>
          <div className="dc-sellos">
            {Array.from({ length: sellosMax }, (_, i) => i + 1).map(n => (
              <button
                key={n} type="button" aria-label={n === sellosMax ? `Sello ${n}: comida gratis` : `Sello ${n}`}
                className={'dc-sello' + (orden.selloNumero != null && n <= orden.selloNumero ? ' is-on' : '') + (n === sellosMax ? ' is-gratis' : '')}
                onClick={() => tocarSello(n)}
              />
            ))}
          </div>

          <p className="dc-label">SIN COBRO</p>
          <div className="dc-row" style={{ gap: 8 }}>
            {sinCobro.map(d => <Chip key={d.id} on={orden.descuento?.id === d.id} onClick={() => elegirDescuento(d)}>{d.etiqueta}</Chip>)}
          </div>

          <div className="dc-espacio" />
          <div className="dc-rule" />

          <div className="dc-total"><span>Subtotal</span><strong>{pesos(tot.subtotal)}</strong></div>
          {descTxt && <div className="dc-total"><span>{descTxt}</span><strong>{pesos(-tot.descuento)}</strong></div>}
          <div className="dc-total is-grande"><span>TOTAL</span><strong>{pesos(tot.total)}</strong></div>

          <div className="dc-pagos">
            {(['efectivo', 'tarjeta', 'dividir'] as const).map(f => (
              <button key={f} type="button" className={'dc-pago' + (forma === f && !tot.sinCobro ? ' is-on' : '')}
                onClick={() => setForma(f)} disabled={tot.sinCobro}>
                {f === 'efectivo' ? 'Efectivo' : f === 'tarjeta' ? 'Tarjeta' : 'Dividir'}
              </button>
            ))}
          </div>
          <button type="button" className="dc-cobrar" onClick={cobrar} disabled={!orden.renglones.length}>{btnCobrar}</button>
        </aside>
      </div>

      )}

      {hojaCobro && (
        <Cobro
          orden={orden} tot={tot} folio={siguienteFolio(ordenes, hoy)} descTxt={descTxt}
          modoInicial={forma} onCancelar={() => setHojaCobro(false)} onConfirmar={registrar}
          onNueva={() => { setHojaCobro(false); setForma('efectivo') }}
        />
      )}
      {hojaEntrar && <HojaEntrar onCerrar={() => setHojaEntrar(false)} />}
      {hojaCodigo && (
        <HojaCodigo
          descuentos={descuentosHoy.filter(d => d.tipo === 'codigo')}
          onCerrar={() => setHojaCodigo(false)}
          onAplicar={(d, codigo) => { elegirDescuento(d, codigo); setHojaCodigo(false) }}
        />
      )}
      {toast && <div className={'dc-toast' + (toast.error ? ' is-error' : '')} role="status">{toast.msg}</div>}
    </div>
  )
}
