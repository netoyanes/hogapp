// ─────────────────────────────────────────────────────────────────────────────
// APERTURAS — planeación y control de un local nuevo. Solo MASTER.
//
// En una apertura, "pintar el local" es al mismo tiempo una tarea del
// cronograma, un costo del presupuesto y un compromiso con un proveedor. Las
// herramientas fallan cuando esas tres cosas viven en tablas separadas que
// alguien sincroniza a mano. Aquí solo se captura la PARTIDA; la ruta crítica,
// el flujo de caja, el avance y las alertas se calculan en
// src/lib/aperturas/motor.ts, que no sabe que existe React ni Supabase.
//
// Consecuencia directa: mover una fecha mueve el dinero, y cambiar el % de
// anticipo de un proveedor mueve el flujo. No hay doble captura en ningún lado.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HardHat, Plus, Sparkles, Flag, RotateCcw, AlertTriangle, CalendarClock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { Sheet, showToast } from '../components/v2'
import {
  type Partida, type Proveedor, montoDe, duracionDe, iso, masDias, diasEntre,
} from '../lib/aperturas/modelo'
import { calcular, fraccionPlaneada, type Pago } from '../lib/aperturas/motor'
import {
  type ProyectoFila, cargarProyectos, cargarProyecto, sembrarEjemplo, tomarLineaBase,
} from '../lib/aperturas/datos'
import { PartidaDetalle } from '../components/aperturas/PartidaDetalle'
import { Cronograma, TablaPartidas, TablaProveedores, Flujo, AjustesProyecto } from '../components/aperturas/vistas'
import {
  mxn, pct, dia, card, secTitle, btn, btnGhost, inp, C_CRITICA, C_ESTIMADO, colorDeMonto,
} from '../components/aperturas/tokens'
import { Barra, Guardado } from '../components/aperturas/ui'

type Pestana = 'panel' | 'cronograma' | 'partidas' | 'proveedores' | 'flujo' | 'ajustes'
type EstadoGuardado = 'listo' | 'guardando' | 'guardado' | 'error'

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'panel', label: 'Panel' },
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'partidas', label: 'Partidas' },
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'flujo', label: 'Flujo de caja' },
  { id: 'ajustes', label: 'Ajustes' },
]

export function Aperturas() {
  const isMobile = useIsMobile()
  const hoy = useMemo(() => iso(new Date()), [])

  const [proyectos, setProyectos] = useState<ProyectoFila[]>([])
  const [proyectoId, setProyectoId] = useState('')
  const [partidas, setPartidas] = useState<Partida[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [pestana, setPestana] = useState<Pestana>('panel')
  const [selId, setSelId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<EstadoGuardado>('listo')
  const [sembrando, setSembrando] = useState(false)

  const proyecto = proyectos.find(p => p.id === proyectoId) ?? null

  // ── Autoguardado ──────────────────────────────────────────────────────────
  // Se acumulan los cambios por fila y se mandan juntos: escribir en cada
  // tecla convierte un nombre de 20 letras en 20 updates.
  const pendientes = useRef(new Map<string, { tabla: string; patch: Record<string, unknown> }>())
  const reloj = useRef<number | null>(null)

  const vaciar = useCallback(async () => {
    const lote = [...pendientes.current.entries()]
    pendientes.current.clear()
    if (!lote.length) return
    for (const [id, { tabla, patch }] of lote) {
      const { error } = await supabase.from(tabla).update(patch).eq('id', id)
      if (error) { setEstado('error'); showToast(`No se guardó: ${error.message}`, 'error'); return }
    }
    setEstado('guardado')
  }, [])

  const encolar = useCallback((tabla: string, id: string, patch: Record<string, unknown>) => {
    const previo = pendientes.current.get(id)
    pendientes.current.set(id, { tabla, patch: { ...previo?.patch, ...patch } })
    setEstado('guardando')
    if (reloj.current) window.clearTimeout(reloj.current)
    reloj.current = window.setTimeout(vaciar, 600)
  }, [vaciar])

  // Salir de la pantalla no debe perder lo último que se escribió.
  useEffect(() => () => { if (reloj.current) window.clearTimeout(reloj.current); vaciar() }, [vaciar])

  // ── Carga ─────────────────────────────────────────────────────────────────
  const cargarLista = useCallback(async () => {
    try {
      const lista = await cargarProyectos()
      setProyectos(lista)
      setProyectoId(prev => prev || lista[0]?.id || '')
    } catch (e) {
      showToast(`No se pudieron cargar las aperturas: ${(e as Error).message}`, 'error')
    } finally {
      setCargando(false)
    }
  }, [])
  useEffect(() => { cargarLista() }, [cargarLista])

  // Cambiar de apertura mientras la anterior sigue cargando es normal: gana la
  // última pedida, no la última en responder.
  const ultimaPedida = useRef('')
  const abrir = useCallback(async (id: string) => {
    ultimaPedida.current = id
    if (!id) { setPartidas([]); setProveedores([]); return }
    try {
      const d = await cargarProyecto(id)
      if (ultimaPedida.current !== id) return
      setPartidas(d.partidas)
      setProveedores(d.proveedores)
      setSelId(null)
    } catch (e) {
      showToast(`No se pudo abrir la apertura: ${(e as Error).message}`, 'error')
    }
  }, [])
  useEffect(() => { abrir(proyectoId) }, [abrir, proyectoId])

  // ── El tablero: una sola llamada al motor alimenta las seis pestañas ──────
  const tablero = useMemo(
    () => proyecto ? calcular(proyecto, partidas, proveedores, hoy) : null,
    [proyecto, partidas, proveedores, hoy],
  )

  const seleccionada = partidas.find(p => p.id === selId) ?? null

  // ── Escrituras ────────────────────────────────────────────────────────────
  function cambiarPartida(id: string, patch: Partial<Partida>) {
    setPartidas(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p))
    encolar('aperturas_partidas', id, patch as Record<string, unknown>)
  }

  function cambiarProveedor(id: string, patch: Partial<Proveedor>) {
    setProveedores(vs => vs.map(v => v.id === id ? { ...v, ...patch } : v))
    encolar('aperturas_proveedores', id, patch as Record<string, unknown>)
  }

  function cambiarProyecto(patch: Record<string, unknown>) {
    setProyectos(ps => ps.map(p => p.id === proyectoId ? { ...p, ...patch } as ProyectoFila : p))
    encolar('aperturas_proyectos', proyectoId, patch)
  }

  async function agregarPartida(tipo: Partida['tipo']) {
    if (!proyectoId) return
    const nombre = tipo === 'compra' ? 'Nueva compra' : tipo === 'trabajo' ? 'Nuevo trabajo' : 'Nueva tarea'
    const fila: Record<string, unknown> = {
      proyecto_id: proyectoId, nombre, tipo,
      fase: partidas.at(-1)?.fase ?? 'Fase 1 · Obra y montaje',
      orden: (partidas.length + 1) * 10,
    }
    // Arranca en 1 día para que aparezca en el Gantt desde el primer momento;
    // una barra de cero días es invisible y parece que no se guardó.
    fila[tipo === 'compra' ? 'dias_entrega' : tipo === 'trabajo' ? 'dias_ejecucion' : 'dias'] = 1
    const { data, error } = await supabase.from('aperturas_partidas').insert(fila).select().single()
    if (error) { showToast(`No se pudo agregar: ${error.message}`, 'error'); return }
    const { partidas: frescas } = await cargarProyecto(proyectoId)
    setPartidas(frescas)
    setSelId(data.id as string)
    if (pestana === 'panel') setPestana('partidas')
  }

  async function borrarPartida(id: string) {
    const { error } = await supabase.from('aperturas_partidas').delete().eq('id', id)
    if (error) { showToast(`No se pudo eliminar: ${error.message}`, 'error'); return }
    // Las dependencias hacia ella se limpian aquí: el motor las ignora de todos
    // modos, pero dejarlas guardadas es basura que confunde a quien las lea.
    setPartidas(ps => ps.filter(p => p.id !== id).map(p =>
      p.depende_de.includes(id) ? { ...p, depende_de: p.depende_de.filter(d => d !== id) } : p))
    for (const p of partidas.filter(q => q.depende_de.includes(id))) {
      encolar('aperturas_partidas', p.id, { depende_de: p.depende_de.filter(d => d !== id) })
    }
    setSelId(null)
  }

  async function agregarProveedor() {
    const { data, error } = await supabase.from('aperturas_proveedores')
      .insert({ nombre: 'Nuevo proveedor', tipo: 'contratista', anticipo_pct: 0.5 }).select().single()
    if (error) { showToast(`No se pudo agregar: ${error.message}`, 'error'); return }
    setProveedores(vs => [...vs, {
      id: data.id as string, nombre: data.nombre as string, tipo: 'contratista',
      oficio: null, anticipo_pct: 0.5, contacto: null, dominio: null,
    }])
  }

  async function borrarProveedor(id: string) {
    const { error } = await supabase.from('aperturas_proveedores').delete().eq('id', id)
    if (error) { showToast(`No se pudo eliminar: ${error.message}`, 'error'); return }
    setProveedores(vs => vs.filter(v => v.id !== id))
  }

  /** Marcar un pago es marcar su bandera en la partida: no hay tabla de pagos. */
  function alternarPago(pago: Pago, valor: boolean) {
    cambiarPartida(pago.partida_id, pago.clase === 'anticipo' ? { anticipo_pagado: valor } : { saldo_pagado: valor })
  }

  async function nuevaApertura() {
    const { data, error } = await supabase.from('aperturas_proyectos').insert({
      nombre: 'Nueva apertura', ciudad: 'CDMX', inicio: hoy,
      meta_apertura: masDias(hoy, 45), presupuesto_aprobado: 0, reserva_pct: 0.1,
    }).select().single()
    if (error) { showToast(`No se pudo crear: ${error.message}`, 'error'); return }
    await cargarLista()
    setProyectoId(data.id as string)
    setPestana('ajustes')
  }

  async function cargarEjemplo() {
    setSembrando(true)
    try {
      const id = await sembrarEjemplo(hoy)
      await cargarLista()
      setProyectoId(id)
      setPestana('panel')
      showToast('Apertura de ejemplo cargada. Bórrala cuando cargues la tuya.', 'success')
    } catch (e) {
      showToast(`No se pudo cargar el ejemplo: ${(e as Error).message}`, 'error')
    } finally {
      setSembrando(false)
    }
  }

  function fijarLineaBase() {
    const base = tomarLineaBase(partidas, duracionDe, montoDe)
    cambiarProyecto({ linea_base: base, linea_base_at: new Date().toISOString() })
    showToast('Plan fijado. A partir de aquí se ve lo que se movió.', 'success')
  }

  async function volverAlPlan() {
    if (!proyecto?.linea_base) return
    const base = proyecto.linea_base
    const cambios = partidas.filter(p => base[p.id])
    for (const p of cambios) {
      const b = base[p.id]
      const patch: Record<string, unknown> = { depende_de: b.depende_de }
      if (p.tipo === 'compra') patch.dias_entrega = b.dias
      else if (p.tipo === 'trabajo') patch.dias_ejecucion = b.dias
      else patch.dias = b.dias
      const { error } = await supabase.from('aperturas_partidas').update(patch).eq('id', p.id)
      if (error) { showToast(`No se pudo restaurar: ${error.message}`, 'error'); return }
    }
    const { partidas: frescas } = await cargarProyecto(proyectoId)
    setPartidas(frescas)
    showToast(`Se restauraron ${cambios.length} partidas al plan original.`, 'success')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (cargando) {
    return <p style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>Cargando aperturas…</p>
  }

  if (!proyecto) {
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <HardHat size={28} style={{ color: 'var(--text-tertiary)' }} />
        <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800, margin: '12px 0 6px' }}>Aperturas</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, margin: '0 0 18px' }}>
          Cronograma con ruta crítica, presupuesto, flujo de caja y proveedores de un local nuevo.
          Captura partidas; las fechas, el dinero y las alertas se calculan solos.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={nuevaApertura} style={{ ...btn, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Nueva apertura
          </button>
          <button onClick={cargarEjemplo} disabled={sembrando} style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} /> {sembrando ? 'Cargando…' : 'Cargar ejemplo'}
          </button>
        </div>
      </div>
    )
  }

  const detalle = seleccionada && tablero && (
    <PartidaDetalle
      partida={seleccionada} partidas={partidas} proveedores={proveedores} crono={tablero.crono}
      onChange={patch => cambiarPartida(seleccionada.id, patch)}
      onDelete={() => borrarPartida(seleccionada.id)}
      onClose={() => setSelId(null)}
      onSelect={setSelId}
    />
  )

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <datalist id="aperturas-fases">
        {[...new Set(partidas.map(p => p.fase))].map(f => <option key={f} value={f} />)}
      </datalist>

      {/* El respiro de abajo en móvil es para que la barra de navegación no
          se coma la última fila. */}
      <div style={{
        display: 'flex', gap: 14, padding: 16, paddingBottom: isMobile ? 92 : 16,
        maxWidth: 1400, margin: '0 auto', alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Encabezado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <HardHat size={18} style={{ color: 'var(--accent)' }} />
            <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800, margin: 0 }}>Aperturas</h1>
            <Guardado estado={estado} />
            <div style={{ flex: 1 }} />
            <select value={proyectoId} onChange={e => setProyectoId(e.target.value)}
              style={{ ...inp, width: 'auto', maxWidth: 230, cursor: 'pointer' }}>
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <button onClick={nuevaApertura} title="Nueva apertura"
              style={{ ...btn, minHeight: 38, width: 38, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={15} />
            </button>
          </div>

          {/* Pestañas */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {PESTANAS.map(t => (
              <button key={t.id} onClick={() => setPestana(t.id)} style={{
                minHeight: 34, padding: '0 13px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                fontSize: 12.5, fontWeight: pestana === t.id ? 700 : 500,
                background: pestana === t.id ? 'var(--accent-bg)' : 'transparent',
                border: `1px solid ${pestana === t.id ? 'var(--accent)' : 'var(--border-default)'}`,
                color: pestana === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              }}>{t.label}</button>
            ))}
          </div>

          {tablero && (
            <>
              {pestana === 'panel' && (
                <Panel proyecto={proyecto} partidas={partidas} tablero={tablero} hoy={hoy}
                  isMobile={isMobile} onSelect={setSelId} onIrA={setPestana} />
              )}
              {pestana === 'cronograma' && (
                <Cronograma proyecto={proyecto} partidas={partidas} tablero={tablero} hoy={hoy}
                  selId={selId} onSelect={setSelId} isMobile={isMobile} />
              )}
              {pestana === 'partidas' && (
                <TablaPartidas partidas={partidas} proveedores={proveedores} tablero={tablero}
                  selId={selId} onSelect={setSelId} onAdd={agregarPartida} isMobile={isMobile} />
              )}
              {pestana === 'proveedores' && (
                <TablaProveedores proveedores={proveedores} partidas={partidas} tablero={tablero}
                  onChange={cambiarProveedor} onAdd={agregarProveedor} onDelete={borrarProveedor} isMobile={isMobile} />
              )}
              {pestana === 'flujo' && (
                <Flujo tablero={tablero} hoy={hoy} onTogglePago={alternarPago} onSelect={setSelId} isMobile={isMobile} />
              )}
              {pestana === 'ajustes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <AjustesProyecto proyecto={proyecto} onChange={cambiarProyecto} />
                  <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <p style={{ ...secTitle, margin: '0 0 4px' }}>Línea base</p>
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                        {proyecto.linea_base_at
                          ? `Plan fijado el ${new Date(proyecto.linea_base_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}. Volver restaura duraciones y dependencias.`
                          : 'Fija el plan cuando lo des por bueno. Es la única forma de contestar después "¿esto ya se movió?".'}
                      </p>
                    </div>
                    <button onClick={fijarLineaBase} style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Flag size={13} /> Fijar plan
                    </button>
                    {proyecto.linea_base && (
                      <button onClick={volverAlPlan} style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RotateCcw size={13} /> Volver al plan original
                      </button>
                    )}
                  </div>
                  <button onClick={cargarEjemplo} disabled={sembrando}
                    style={{ ...btnGhost, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={13} /> {sembrando ? 'Cargando…' : 'Cargar otra apertura de ejemplo'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detalle: columna persistente en escritorio, hoja en móvil */}
        {!isMobile && seleccionada && (
          <div style={{
            width: 380, flexShrink: 0, position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)', padding: 12, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {detalle}
          </div>
        )}
      </div>

      {isMobile && seleccionada && (
        <Sheet open onClose={() => setSelId(null)} isMobile tall>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>{detalle}</div>
        </Sheet>
      )}
    </div>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────
// La primera pantalla de la mañana. Se tiene que leer en diez segundos, así que
// todo lo que está aquí es accionable hoy y todo es clicable.

function Panel({ proyecto, partidas, tablero, hoy, isMobile, onSelect, onIrA }: {
  proyecto: ProyectoFila
  partidas: Partida[]
  tablero: NonNullable<ReturnType<typeof calcular>>
  hoy: string
  isMobile: boolean
  onSelect: (id: string) => void
  onIrA: (p: Pestana) => void
}) {
  const { crono, presupuesto, alertas, fases } = tablero
  const criticas = partidas.filter(p => crono.barras.get(p.id)?.critica)
  const estimadas = partidas.filter(p => p.estimado || montoDe(p) <= 0)
  const proximos = tablero.pagos.filter(p => !p.pagado && p.fecha >= hoy && p.fecha <= masDias(hoy, 7))
  const atrasadas = partidas.filter(p => {
    const b = crono.barras.get(p.id)
    return b && p.avance / 100 < fraccionPlaneada(p, crono, hoy) - 0.02
  })

  const colorColchon = crono.colchon < 0 ? C_CRITICA : crono.colchon === 0 ? C_ESTIMADO : 'var(--text-primary)'
  const fila: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
    borderTop: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 12.5,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Alertas primero: si algo está mal, no debe haber que buscarlo */}
      {alertas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alertas.slice(0, 4).map(a => (
            <div key={a.id} onClick={() => a.partida_id && onSelect(a.partida_id)} style={{
              display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 'var(--radius-md)',
              cursor: a.partida_id ? 'pointer' : 'default',
              background: `color-mix(in srgb, ${a.gravedad === 'roja' ? 'var(--status-risk)' : 'var(--status-attention)'} 10%, transparent)`,
              borderLeft: `3px solid ${a.gravedad === 'roja' ? C_CRITICA : C_ESTIMADO}`,
            }}>
              <AlertTriangle size={14} style={{ color: a.gravedad === 'roja' ? C_CRITICA : C_ESTIMADO, flexShrink: 0, marginTop: 1 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{a.titulo}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{a.detalle}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cuatro indicadores */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8 }}>
        <div onClick={() => onIrA('cronograma')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Apertura</div>
          <div className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color: colorColchon, lineHeight: 1 }}>
            {crono.colchon > 0 ? `+${crono.colchon}` : crono.colchon} d
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Lista el {dia(crono.fin)} · meta {dia(proyecto.meta_apertura)}
          </div>
        </div>

        <div onClick={() => onIrA('partidas')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Avance físico</div>
          <div className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
            {pct(tablero.avance)}
          </div>
          <div style={{ marginTop: 6 }}><Barra valor={tablero.avance} planeado={tablero.planeado} /></div>
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Planeado a hoy {pct(tablero.planeado)}{atrasadas.length ? ` · ${atrasadas.length} atrasadas` : ''}
          </div>
        </div>

        <div onClick={() => onIrA('flujo')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Comprometido</div>
          <div className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, lineHeight: 1, color: presupuesto.disponible < 0 ? C_CRITICA : 'var(--text-primary)' }}>
            {mxn(presupuesto.comprometido)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
            de {mxn(presupuesto.ejecutable)} ejecutables
            {presupuesto.disponible < 0 && <span style={{ color: C_CRITICA }}> · sobregiro {mxn(-presupuesto.disponible)}</span>}
          </div>
        </div>

        <div onClick={() => onIrA('flujo')} style={{ ...card, cursor: 'pointer' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Pagado</div>
          <div className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, color: 'var(--status-healthy)', lineHeight: 1 }}>
            {mxn(presupuesto.pagado)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Por pagar {mxn(presupuesto.por_pagar)} · {pct(tablero.financiero)} del comprometido
          </div>
        </div>
      </div>

      {/* Tres listas cortas */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        <div style={card}>
          <p style={{ ...secTitle, color: C_CRITICA }}>Ruta crítica · {criticas.length}</p>
          {criticas.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Sin partidas con duración todavía.</p>}
          {criticas.map(p => {
            const b = crono.barras.get(p.id)!
            return (
              <div key={p.id} onClick={() => onSelect(p.id)} style={fila}>
                <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {dia(b.fecha_inicio)} → {dia(b.fecha_fin)}
                </span>
              </div>
            )
          })}
        </div>

        <div style={card}>
          <p style={{ ...secTitle, color: C_ESTIMADO }}>Sin precio firme · {estimadas.length}</p>
          {estimadas.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Todo está cotizado en firme.</p>}
          {estimadas.map(p => {
            const monto = montoDe(p)
            return (
              <div key={p.id} onClick={() => onSelect(p.id)} style={fila}>
                <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: colorDeMonto(monto, true) }}>{mxn(monto)}</span>
              </div>
            )
          })}
        </div>

        <div style={card}>
          <p style={secTitle}><CalendarClock size={11} style={{ verticalAlign: '-2px' }} /> Pagos · próximos 7 días</p>
          {proximos.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Nada por pagar esta semana.</p>}
          {proximos.map(pago => (
            <div key={`${pago.partida_id}:${pago.clase}`} onClick={() => onSelect(pago.partida_id)} style={fila}>
              <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', width: 46, flexShrink: 0 }}>{dia(pago.fecha)}</span>
              <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pago.partida}</span>
              <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: pago.estimado ? C_ESTIMADO : 'var(--text-primary)' }}>{mxn(pago.monto)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Avance por fase */}
      <div style={card}>
        <p style={secTitle}>Avance por fase</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fases.map(f => (
            <div key={f.nombre}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{f.partidas} partidas</span>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}>{mxn(f.monto)}</span>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', width: 38, textAlign: 'right' }}>{pct(f.avance)}</span>
              </div>
              <Barra valor={f.avance} />
            </div>
          ))}
          {fases.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Todavía no hay partidas.</p>}
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, textAlign: 'center' }}>
        {partidas.length} partidas · {diasEntre(proyecto.inicio, crono.fin_total) + 1} días de proyecto · todo lo de arriba se calcula, nada se captura
      </p>
    </div>
  )
}
