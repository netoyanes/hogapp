// Doña Concha · POS — versión celular, a prueba de errores.
// Un paso por pantalla, botones grandes y el botón principal siempre dice qué
// falta. Usa las mismas reglas (logic.ts) y los mismos datos (store.ts) que la
// tablet; funciona sin internet igual.
//
//   Menú → (toca un guiso) Armar comida → Menú … → Orden → Cobro → Listo
import { useEffect, useState } from 'react'
import './concha.css'
import type { Descuento, FormaPago, Orden, Pago, Renglon } from './types'
import {
  aplicado, armarPagos, billetesSugeridos, comidasEnOrden, fechaLarga, fechaLocal, folioTxt,
  menuDelDia, pesos, siguienteFolio, totales, turnoDelDia, type ItemDelDia, type ModoCobro,
} from './logic'
import { cobrarOrden, ErrorCobro, setBorrador, usePOS } from './store'
import { subirPendientes, useSesion, useSincronizacion } from './sync'
import { CorteCaja } from './CorteCaja'
import { HojaCodigo, HojaEntrar, Logo } from './comun'
import { nuevaOrden, textoDescuento, useAhora, useEnLinea, usePrecache } from './util'

type Paso = 'menu' | 'armar' | 'orden' | 'descuento' | 'cobro' | 'listo' | 'corte'

export function ConchaMovil() {
  const pos = usePOS()
  const { catalogo: cat, existencias, ordenes, dispositivo } = pos
  const ahora = useAhora()
  const enLinea = useEnLinea()
  usePrecache()
  const sesion = useSesion()
  const errorSync = useSincronizacion(sesion)
  const hoy = fechaLocal(ahora)
  const turno = turnoDelDia(cat, hoy)

  const orden: Orden = pos.borrador && pos.borrador.fecha === hoy ? pos.borrador : nuevaOrden(hoy, turno?.id ?? null, dispositivo)
  const guardar = (o: Orden) => setBorrador(o)

  const [paso, setPaso] = useState<Paso>('menu')
  const [guiso, setGuiso] = useState<ItemDelDia | null>(null)
  const [cobrada, setCobrada] = useState<Orden | null>(null)
  const [aviso, setAviso] = useState<{ msg: string; error?: boolean } | null>(null)
  const [hojaEntrar, setHojaEntrar] = useState(false)
  const [hojaCodigo, setHojaCodigo] = useState(false)

  useEffect(() => {
    if (!aviso) return
    const id = setTimeout(() => setAviso(null), 1600)
    return () => clearTimeout(id)
  }, [aviso])
  // Al cambiar de pantalla, empieza arriba
  useEffect(() => { document.querySelector('.dm-scroll')?.scrollTo(0, 0) }, [paso])

  const enOrden: Record<string, number> = {}
  for (const r of orden.renglones) enOrden[r.platilloId] = (enOrden[r.platilloId] ?? 0) + r.cantidad
  const guisos = menuDelDia(cat, hoy, 'guiso', existencias, enOrden)
  const guarniciones = menuDelDia(cat, hoy, 'guarnicion')
  const aguas = menuDelDia(cat, hoy, 'agua')
  const extras = menuDelDia(cat, hoy, 'extra')

  const desc = cat.descuentos.find(d => d.id === orden.descuento?.id)
  const tot = totales(orden.renglones, orden.descuento, turno, desc)
  const platillos = orden.renglones.reduce((n, r) => n + r.cantidad, 0)
  const folio = siguienteFolio(ordenes, hoy)
  const cajaCerrada = pos.cortes.some(c => c.fecha === hoy)
  const porSubir = ordenes.filter(o => !o.sincronizada).length + pos.gastos.filter(g => !g.sincronizado).length + pos.cortes.filter(c => !c.sincronizado).length
  const ventaHoy = ordenes.filter(o => o.fecha === hoy && o.estado === 'cobrada' && !o.sinCobro)

  const avisar = (msg: string, error = false) => setAviso({ msg, error })

  function agregarComida(item: ItemDelDia, gIds: string[], aguaId: string | null) {
    const nombre = (lista: ItemDelDia[], id: string) => lista.find(x => x.platillo.id === id)?.platillo.nombre ?? id
    const nuevo: Renglon = {
      id: crypto.randomUUID(), tipo: 'comida', platilloId: item.platillo.id, nombre: item.platillo.nombre,
      guarniciones: gIds.map(id => ({ id, nombre: nombre(guarniciones, id) })),
      agua: aguaId ? { id: aguaId, nombre: nombre(aguas, aguaId) } : null,
      cantidad: 1, precioUnit: item.precio!, costoUnit: item.costo, colaboracionId: item.colaboracion?.id ?? null,
    }
    const clave = (r: Renglon) => `${r.platilloId}|${r.guarniciones.map(g => g.id).join(',')}|${r.agua?.id ?? ''}`
    const igual = orden.renglones.find(r => clave(r) === clave(nuevo))
    guardar({ ...orden, renglones: igual ? orden.renglones.map(r => (r === igual ? { ...r, cantidad: r.cantidad + 1 } : r)) : [...orden.renglones, nuevo] })
    setPaso('menu')
    avisar(`Agregado: ${item.platillo.nombre}`)
  }

  function agregarExtra(item: ItemDelDia) {
    if (item.precio == null) { avisar(`Falta definir el precio de ${item.platillo.nombre}`, true); return }
    const igual = orden.renglones.find(r => r.tipo === 'extra' && r.platilloId === item.platillo.id)
    guardar({ ...orden, renglones: igual
      ? orden.renglones.map(r => (r === igual ? { ...r, cantidad: r.cantidad + 1 } : r))
      : [...orden.renglones, { id: crypto.randomUUID(), tipo: 'extra', platilloId: item.platillo.id, nombre: item.platillo.nombre, guarniciones: [], agua: null, cantidad: 1, precioUnit: item.precio, costoUnit: item.costo, colaboracionId: null }] })
    avisar(`Agregado: ${item.platillo.nombre}`)
  }

  function cambiarCantidad(r: Renglon, delta: number) {
    if (delta > 0 && r.tipo === 'comida' && guisos.find(g => g.platillo.id === r.platilloId)?.agotado) { avisar(`Ya no quedan porciones de ${r.nombre}`, true); return }
    const cantidad = r.cantidad + delta
    const renglones = cantidad <= 0 ? orden.renglones.filter(x => x.id !== r.id) : orden.renglones.map(x => (x.id === r.id ? { ...x, cantidad } : x))
    guardar({ ...orden, renglones })
    if (!renglones.length) setPaso('menu')
  }

  function elegirDescuento(d: Descuento | null, codigo: string | null = null) {
    guardar({ ...orden, descuento: d ? aplicado(d) : null, codigoCapturado: d ? codigo : null, selloNumero: d?.tipo === 'cliente_frecuente' ? cat.config.sellosParaGratis : null })
    setPaso('orden')
  }

  function registrar(pagos: Pago[]): boolean {
    try {
      const c = cobrarOrden({
        ...orden, turnoId: turno?.id ?? null, subtotal: tot.subtotal, descuentoMonto: tot.descuento, total: tot.total,
        sinCobro: tot.sinCobro, costoSinCobro: tot.costoSinCobro, sellos: tot.sellos, pagos, cajero: sesion?.user.id ?? null,
      })
      setCobrada(c); setPaso('listo')
      subirPendientes().catch(() => {})
      return true
    } catch (e) {
      avisar(e instanceof ErrorCobro ? e.message : 'No se pudo guardar la orden', true)
      return false
    }
  }

  // ── Pantallas ──────────────────────────────────────────────────────────
  let pantalla
  if (paso === 'corte') {
    pantalla = <div className="dm-scroll dm-corte"><CorteCaja hoy={hoy} cajero={sesion?.user.id ?? null} onVolver={() => setPaso('menu')} /></div>
  } else if (paso === 'armar' && guiso) {
    pantalla = <ArmarComida item={guiso} guarniciones={guarniciones} aguas={aguas} onCancelar={() => setPaso('menu')} onAgregar={(g, a) => agregarComida(guiso, g, a)} />
  } else if (paso === 'orden') {
    pantalla = (
      <>
        <div className="dm-scroll">
          <button type="button" className="dm-atras" onClick={() => setPaso('menu')}>← Agregar más</button>
          <h1 className="dm-h1">ORDEN {folioTxt(folio)}</h1>

          <p className="dm-paso">¿PARA DÓNDE ES?</p>
          <div className="dm-dos">
            <button type="button" className={'dm-opcion' + (orden.servicio === 'aqui' ? ' is-on' : '')} onClick={() => guardar({ ...orden, servicio: 'aqui' })}>Aquí</button>
            <button type="button" className={'dm-opcion' + (orden.servicio === 'llevar' ? ' is-on' : '')} onClick={() => guardar({ ...orden, servicio: 'llevar' })}>Para llevar</button>
          </div>

          <p className="dm-paso">LO QUE PIDIÓ</p>
          {orden.renglones.map(r => (
            <div key={r.id} className="dm-renglon">
              <div className="dm-renglon-det">
                <b>{r.nombre}</b>
                <small>{r.tipo === 'extra' ? 'Extra' : [...r.guarniciones.map(g => g.nombre), r.agua ? `Agua de ${r.agua.nombre.toLowerCase()}` : 'Sin agua'].join(' · ')}</small>
                <strong>{pesos(r.precioUnit * r.cantidad)}</strong>
              </div>
              <div className="dm-cantidad">
                <button type="button" onClick={() => cambiarCantidad(r, -1)} aria-label={`Uno menos de ${r.nombre}`}>{r.cantidad === 1 ? '✕' : '−'}</button>
                <span>{r.cantidad}</span>
                <button type="button" onClick={() => cambiarCantidad(r, 1)} aria-label={`Uno más de ${r.nombre}`}>+</button>
              </div>
            </div>
          ))}

          <p className="dm-paso">DESCUENTO</p>
          <button type="button" className="dm-fila" onClick={() => setPaso('descuento')}>
            <span>{orden.descuento ? textoDescuento(orden, cat) : 'Sin descuento'}</span>
            <span className="dm-cambiar">Cambiar</span>
          </button>

          <div className="dm-totales">
            <div><span>Subtotal</span><strong>{pesos(tot.subtotal)}</strong></div>
            {tot.descuento > 0 && <div><span>{textoDescuento(orden, cat)}</span><strong>{pesos(-tot.descuento)}</strong></div>}
            <div className="is-total"><span>TOTAL</span><strong>{pesos(tot.total)}</strong></div>
          </div>
        </div>
        <div className="dm-abajo">
          <button type="button" className="dm-principal" onClick={() => (tot.sinCobro || tot.total === 0 ? registrar([]) : setPaso('cobro'))}>
            {tot.sinCobro ? 'REGISTRAR SIN COBRO' : `COBRAR ${pesos(tot.total)}`}
          </button>
        </div>
      </>
    )
  } else if (paso === 'descuento') {
    const grupos: { t: string; ayuda: string; lista: Descuento[] }[] = [
      { t: 'CONVENIO', ayuda: 'Pide la credencial', lista: cat.descuentos.filter(d => d.activo && d.tipo === 'convenio') },
      { t: 'CLIENTE FRECUENTE', ayuda: 'Solo si trae la tarjeta con 9 sellos', lista: cat.descuentos.filter(d => d.activo && d.tipo === 'cliente_frecuente') },
      { t: 'SIN COBRO', ayuda: 'No se cobra; se registra el motivo', lista: cat.descuentos.filter(d => d.activo && d.tipo === 'sin_cobro') },
    ]
    pantalla = (
      <div className="dm-scroll">
        <button type="button" className="dm-atras" onClick={() => setPaso('orden')}>← Volver a la orden</button>
        <h1 className="dm-h1">DESCUENTO</h1>
        <p className="dm-ayuda">Solo uno por orden.</p>
        <button type="button" className={'dm-opcion dm-ancha' + (!orden.descuento ? ' is-on' : '')} onClick={() => elegirDescuento(null)}>Sin descuento</button>
        {grupos.map(g => g.lista.length > 0 && (
          <div key={g.t}>
            <p className="dm-paso">{g.t} <span>· {g.ayuda}</span></p>
            {g.lista.map(d => (
              <button key={d.id} type="button" className={'dm-opcion dm-ancha' + (orden.descuento?.id === d.id ? ' is-on' : '')} onClick={() => elegirDescuento(d)}>
                {d.tipo === 'cliente_frecuente' ? 'Comida gratis (décima)' : d.tipo === 'sin_cobro' ? d.nombre : d.etiqueta}
              </button>
            ))}
          </div>
        ))}
        <p className="dm-paso">OTRO CÓDIGO</p>
        <button type="button" className="dm-opcion dm-ancha" onClick={() => setHojaCodigo(true)}>Escribir un código</button>
      </div>
    )
  } else if (paso === 'cobro') {
    pantalla = <CobroSimple total={tot.total} onVolver={() => setPaso('orden')} onCobrar={registrar} />
  } else if (paso === 'listo' && cobrada) {
    const cambio = cobrada.pagos.filter(p => p.forma === 'efectivo').reduce((s, p) => s + (p.cambio ?? 0), 0)
    const efectivo = cobrada.pagos.some(p => p.forma === 'efectivo' && p.monto > 0)
    pantalla = (
      <div className="dm-listo">
        <p className="dm-paso">ORDEN {folioTxt(cobrada.folio!)} · {cobrada.sinCobro ? 'REGISTRADA' : 'COBRADA'}</p>
        {efectivo ? <><p className="dm-listo-k">Da de cambio</p><p className="dm-listo-v">{pesos(cambio)}</p></>
          : <p className="dm-listo-v">{cobrada.sinCobro ? 'Sin cobro' : '¡Listo!'}</p>}
        <button type="button" className="dm-principal" onClick={() => { setCobrada(null); setPaso('menu') }}>NUEVA ORDEN</button>
      </div>
    )
  } else {
    // Menú
    pantalla = (
      <>
        <div className="dm-scroll">
          <header className="dm-top">
            <Logo />
            <button type="button" className="dm-corte" onClick={() => setPaso('corte')}>Corte de caja</button>
          </header>
          <p className="dm-estado">
            {fechaLarga(hoy)} · Vendido hoy {pesos(ventaHoy.reduce((s, o) => s + o.total, 0))} ({ventaHoy.reduce((n, o) => n + comidasEnOrden(o.renglones), 0)} comidas)
            {!enLinea && <> · <b>Sin internet</b></>}
            {cajaCerrada && <> · <b>Caja cerrada</b></>}
            {porSubir > 0 && <> · {porSubir} por subir</>}
            {sesion === null && <> · <button type="button" className="dc-link" onClick={() => setHojaEntrar(true)}>Entrar para sincronizar</button></>}
            {sesion && errorSync && errorSync !== 'sin sesión' && <> · <b>No se pudo subir</b></>}
          </p>

          {!turno ? (
            <div className="dm-vacio">Hoy no hay servicio.</div>
          ) : (
            <>
              <h1 className="dm-h1">TOCA UN GUISO</h1>
              <p className="dm-ayuda">Incluye dos guarniciones y agua de sabor.</p>
              {guisos.map(g => (
                <button key={g.menu.id} type="button" className={'dm-guiso' + (g.agotado ? ' is-agotado' : '')} disabled={g.agotado}
                  onClick={() => {
                    if (!g.precio) { avisar(`Falta definir el precio de ${g.platillo.nombre}`, true); return }
                    setGuiso(g); setPaso('armar')
                  }}>
                  <span className="dm-guiso-nombre">{g.platillo.nombre}</span>
                  <span className="dm-guiso-info">{g.agotado ? 'AGOTADO' : g.quedan == null ? g.etiqueta : `Quedan ${g.quedan}`}</span>
                  <span className="dm-guiso-precio">{g.precio ? pesos(g.precio) : '—'}</span>
                </button>
              ))}
              {extras.length > 0 && (
                <>
                  <p className="dm-paso">EXTRAS <span>· se cobran aparte</span></p>
                  <div className="dm-extras">
                    {extras.map(x => (
                      <button key={x.platillo.id} type="button" className="dm-opcion" onClick={() => agregarExtra(x)}>
                        {x.platillo.nombre}{x.precio != null ? ` · ${pesos(x.precio)}` : ''}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="dm-abajo">
          {platillos > 0
            ? <button type="button" className="dm-principal" onClick={() => setPaso('orden')}>VER ORDEN · {platillos} · {pesos(tot.total)}</button>
            : <p className="dm-pista">La orden está vacía</p>}
        </div>
      </>
    )
  }

  return (
    <div className="dc dm">
      {pantalla}
      {hojaEntrar && <HojaEntrar onCerrar={() => setHojaEntrar(false)} />}
      {hojaCodigo && (
        <HojaCodigo descuentos={cat.descuentos.filter(d => d.activo && d.tipo === 'codigo')} onCerrar={() => setHojaCodigo(false)}
          onAplicar={(d, codigo) => { setHojaCodigo(false); elegirDescuento(d, codigo) }} />
      )}
      {/* «Agregado» solo en el menú; los errores en cualquier pantalla */}
      {aviso && (aviso.error || paso === 'menu') && <div className={'dc-toast dm-toast' + (aviso.error ? ' is-error' : '')} role="status">{aviso.msg}</div>}
    </div>
  )
}

/** Paso 2: dos guarniciones y agua. El botón dice qué falta. */
function ArmarComida({ item, guarniciones, aguas, onCancelar, onAgregar }: {
  item: ItemDelDia; guarniciones: ItemDelDia[]; aguas: ItemDelDia[]
  onCancelar: () => void; onAgregar: (guarniciones: string[], agua: string | null) => void
}) {
  const [sel, setSel] = useState<string[]>([])
  const [agua, setAgua] = useState<string | null | undefined>(undefined) // null = sin agua
  const faltan = 2 - sel.length
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : s.length < 2 ? [...s, id] : s))
  const listo = faltan === 0 && agua !== undefined
  return (
    <>
      <div className="dm-scroll">
        <button type="button" className="dm-atras" onClick={onCancelar}>← Cancelar</button>
        <h1 className="dm-h1">{item.platillo.nombre}</h1>
        <p className="dm-ayuda">{pesos(item.precio!)} · comida completa</p>

        <p className="dm-paso">1. ELIGE 2 GUARNICIONES <span>· {sel.length} de 2</span></p>
        {guarniciones.map(g => {
          const on = sel.includes(g.platillo.id)
          return (
            <button key={g.platillo.id} type="button" className={'dm-opcion dm-ancha' + (on ? ' is-on' : '')}
              disabled={!on && faltan === 0} onClick={() => toggle(g.platillo.id)}>
              <span className="dm-check">{on ? '✓' : ''}</span>{g.platillo.nombre}
            </button>
          )
        })}

        <p className="dm-paso">2. AGUA DE SABOR</p>
        {aguas.map(a => (
          <button key={a.platillo.id} type="button" className={'dm-opcion dm-ancha' + (agua === a.platillo.id ? ' is-on' : '')} onClick={() => setAgua(a.platillo.id)}>
            <span className="dm-check">{agua === a.platillo.id ? '✓' : ''}</span>{a.platillo.nombre}
          </button>
        ))}
        <button type="button" className={'dm-opcion dm-ancha' + (agua === null ? ' is-on' : '')} onClick={() => setAgua(null)}>
          <span className="dm-check">{agua === null ? '✓' : ''}</span>Sin agua
        </button>
      </div>
      <div className="dm-abajo">
        <button type="button" className="dm-principal" disabled={!listo} onClick={() => onAgregar(sel, agua ?? null)}>
          {faltan > 0 ? `Falta${faltan === 2 ? 'n 2 guarniciones' : ' 1 guarnición'}` : agua === undefined ? 'Falta elegir el agua' : `AGREGAR · ${pesos(item.precio!)}`}
        </button>
      </div>
    </>
  )
}

/** Cobro: una pregunta a la vez. Propina opcional, aparte de la venta. */
function CobroSimple({ total, onVolver, onCobrar }: { total: number; onVolver: () => void; onCobrar: (pagos: Pago[]) => boolean }) {
  const [modo, setModo] = useState<ModoCobro | null>(null)
  const [recibido, setRecibido] = useState(0)
  const [enEfectivo, setEnEfectivo] = useState(0)
  const [propina, setPropina] = useState(0)
  const [propinaForma, setPropinaForma] = useState<FormaPago>('tarjeta')
  const [referencia, setReferencia] = useState('')
  const [teclado, setTeclado] = useState<null | 'recibido' | 'enEfectivo' | 'propina'>(null)
  const [conPropina, setConPropina] = useState(false)

  const forma: FormaPago = modo === 'efectivo' ? 'efectivo' : propinaForma
  const { pagos, error } = modo ? armarPagos(modo, total, { recibido, propina, propinaForma: forma, referencia, enEfectivo }) : { pagos: [], error: 'Elige cómo paga' }
  const cambio = pagos.filter(p => p.forma === 'efectivo').reduce((s, p) => s + (p.cambio ?? 0), 0)
  const enTerminal = pagos.filter(p => p.forma === 'tarjeta').reduce((s, p) => s + p.monto + p.propina, 0)

  if (!modo) {
    return (
      <div className="dm-scroll">
        <button type="button" className="dm-atras" onClick={onVolver}>← Volver a la orden</button>
        <p className="dm-paso">TOTAL A COBRAR</p>
        <p className="dm-total-grande">{pesos(total)}</p>
        <p className="dm-paso">¿CÓMO PAGA?</p>
        <button type="button" className="dm-opcion dm-ancha dm-alta" onClick={() => setModo('efectivo')}>Efectivo</button>
        <button type="button" className="dm-opcion dm-ancha dm-alta" onClick={() => setModo('tarjeta')}>Tarjeta</button>
        <button type="button" className="dm-opcion dm-ancha dm-alta" onClick={() => setModo('dividir')}>Una parte en efectivo y otra con tarjeta</button>
      </div>
    )
  }

  const valorTeclado = teclado === 'recibido' ? recibido : teclado === 'enEfectivo' ? enEfectivo : propina
  const setTecla = (v: number) => (teclado === 'recibido' ? setRecibido(v) : teclado === 'enEfectivo' ? setEnEfectivo(v) : setPropina(v))

  return (
    <>
      <div className="dm-scroll">
        <button type="button" className="dm-atras" onClick={() => { setModo(null); setRecibido(0); setEnEfectivo(0) }}>← Cambiar forma de pago</button>
        <p className="dm-paso">TOTAL {modo === 'efectivo' ? '· EFECTIVO' : modo === 'tarjeta' ? '· TARJETA' : '· DIVIDIDO'}</p>
        <p className="dm-total-grande">{pesos(total)}</p>

        {modo === 'dividir' && (
          <>
            <p className="dm-paso">¿CUÁNTO PAGA EN EFECTIVO?</p>
            <button type="button" className="dm-monto" onClick={() => setTeclado('enEfectivo')}>{enEfectivo ? pesos(enEfectivo) : 'Toca para escribir'}</button>
            {enEfectivo > 0 && enEfectivo < total && <p className="dm-ayuda">Con tarjeta: {pesos(total - enEfectivo)}</p>}
          </>
        )}

        {modo === 'efectivo' && (
          <>
            <p className="dm-paso">¿CON CUÁNTO PAGA?</p>
            <div className="dm-billetes">
              {billetesSugeridos(total + (conPropina ? propina : 0)).map(b => (
                <button key={b} type="button" className={'dm-opcion' + (recibido === b ? ' is-on' : '')} onClick={() => setRecibido(b)}>
                  {b === total + (conPropina ? propina : 0) ? 'Exacto' : pesos(b)}
                </button>
              ))}
              <button type="button" className="dm-opcion" onClick={() => setTeclado('recibido')}>Otra cantidad</button>
            </div>
          </>
        )}

        {modo !== 'efectivo' && enTerminal > 0 && (
          <div className="dm-terminal">
            <p className="dm-paso">COBRA EN LA TERMINAL</p>
            <p className="dm-total-grande">{pesos(enTerminal)}</p>
            <input className="dc-input" style={{ textTransform: 'none' }} inputMode="numeric" placeholder="Referencia (opcional)" value={referencia} onChange={e => setReferencia(e.target.value.replace(/\D/g, '').slice(0, 12))} />
          </div>
        )}

        {!conPropina ? (
          <button type="button" className="dc-link dm-link" onClick={() => { setConPropina(true); setPropinaForma(modo === 'efectivo' ? 'efectivo' : 'tarjeta') }}>+ Dejó propina</button>
        ) : (
          <>
            <p className="dm-paso">PROPINA <span>· no es venta</span></p>
            <button type="button" className="dm-monto" onClick={() => setTeclado('propina')}>{propina ? pesos(propina) : 'Toca para escribir'}</button>
            {modo !== 'efectivo' && (
              <div className="dm-dos">
                <button type="button" className={'dm-opcion' + (propinaForma === 'tarjeta' ? ' is-on' : '')} onClick={() => setPropinaForma('tarjeta')}>Con tarjeta</button>
                <button type="button" className={'dm-opcion' + (propinaForma === 'efectivo' ? ' is-on' : '')} onClick={() => setPropinaForma('efectivo')}>En efectivo</button>
              </div>
            )}
            <button type="button" className="dc-link dm-link" onClick={() => { setConPropina(false); setPropina(0) }}>Quitar propina</button>
          </>
        )}

        {pagos.some(p => p.forma === 'efectivo' && p.monto > 0) && !error && (
          <div className="dm-cambio"><span>CAMBIO</span><strong>{pesos(cambio)}</strong></div>
        )}
      </div>
      <div className="dm-abajo">
        <button type="button" className="dm-principal" disabled={!!error} onClick={() => onCobrar(pagos)}>
          {error
            ? (modo === 'efectivo' && !recibido ? 'Falta: ¿con cuánto paga?' : modo === 'dividir' && !enEfectivo ? 'Falta: parte en efectivo' : 'Revisa los montos')
            : modo === 'efectivo' ? `COBRAR · CAMBIO ${pesos(cambio)}` : 'YA PASÓ LA TARJETA'}
        </button>
      </div>
      {teclado && <Teclado valor={valorTeclado} titulo={teclado === 'recibido' ? '¿Con cuánto paga?' : teclado === 'enEfectivo' ? '¿Cuánto en efectivo?' : 'Propina'}
        onListo={v => { setTecla(v); setTeclado(null) }} onCerrar={() => setTeclado(null)} />}
    </>
  )
}

/** Teclado numérico grande, en pesos */
function Teclado({ valor, titulo, onListo, onCerrar }: { valor: number; titulo: string; onListo: (centavos: number) => void; onCerrar: () => void }) {
  const [txt, setTxt] = useState(valor ? String(valor / 100) : '')
  const tecla = (k: string) => setTxt(t => (k === '⌫' ? t.slice(0, -1) : k === 'C' ? '' : (t + k).replace(/^0+(?=\d)/, '').slice(0, 6)))
  return (
    <div className="dc-velo" onClick={onCerrar}>
      <div className="dm-teclado" onClick={e => e.stopPropagation()}>
        <p className="dm-paso">{titulo.toUpperCase()}</p>
        <p className="dm-total-grande">{pesos((parseInt(txt || '0', 10)) * 100)}</p>
        <div className="dc-teclado">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => <button key={k} type="button" onClick={() => tecla(k)}>{k}</button>)}
        </div>
        <button type="button" className="dm-principal" onClick={() => onListo(parseInt(txt || '0', 10) * 100)}>LISTO</button>
      </div>
    </div>
  )
}
