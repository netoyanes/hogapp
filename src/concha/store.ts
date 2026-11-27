// Doña Concha · POS — almacén local de la tablet (funciona sin internet).
//
// Todo se guarda en el navegador de la tablet al instante. Las órdenes cobradas
// quedan con `sincronizada: false` hasta que la sincronización las sube a
// Supabase; si no hay red, se quedan en la cola y se suben después. El folio
// se asigna aquí, en la tablet: es consecutivo por día y no depende de la red.
import { useSyncExternalStore } from 'react'
import type { CajeroLocal, Catalogo, Corte, Existencia, Gasto, Orden, SesionCaja } from './types'
import { catalogoDemo } from './seed'
import { fechaLocal, siguienteFolio } from './logic'

const KEY = 'concha:pos:v1'

export interface EstadoPOS {
  dispositivo: string
  catalogo: Catalogo
  existencias: Record<string, Existencia>
  ordenes: Orden[]
  gastos: Gasto[]
  cortes: Corte[]
  /** Orden en curso (sobrevive a recargar la página) */
  borrador: Orden | null
  /** Quién cobra ahora. Sin sesión de caja no se puede vender. */
  sesionCaja: SesionCaja | null
  /** Quienes ya entraron con internet aquí: pueden volver a entrar sin red */
  cajeros: CajeroLocal[]
}

function nuevo(): EstadoPOS {
  return {
    dispositivo: crypto.randomUUID(),
    catalogo: catalogoDemo(fechaLocal()),
    existencias: {},
    ordenes: [],
    gastos: [],
    cortes: [],
    borrador: null,
    sesionCaja: null,
    cajeros: [],
  }
}

function cargar(): EstadoPOS {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { gastos: [], cortes: [], sesionCaja: null, cajeros: [], ...JSON.parse(raw) } as EstadoPOS
  } catch { /* almacenamiento bloqueado o dañado: arranca limpio */ }
  return nuevo()
}

let estado: EstadoPOS = cargar()
const subs = new Set<() => void>()

function guardar(next: EstadoPOS) {
  estado = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* sin espacio: sigue en memoria */ }
  subs.forEach(f => f())
}

// Otra pestaña de la misma tablet cambió algo
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue) { estado = JSON.parse(e.newValue); subs.forEach(f => f()) }
  })
}

export function usePOS(): EstadoPOS {
  return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, () => estado)
}

export function getPOS(): EstadoPOS { return estado }

export function setBorrador(o: Orden | null) {
  guardar({ ...estado, borrador: o })
}

export class ErrorCobro extends Error {}

/**
 * Cierra la orden: asigna folio del día, descuenta porciones y la deja en la
 * cola para subir. Falla si algún guiso ya no tiene porciones.
 */
export function cobrarOrden(o: Orden): Orden {
  if (estado.cortes.some(c => c.fecha === o.fecha)) throw new ErrorCobro('La caja de hoy ya se cerró')
  const exs = { ...estado.existencias }
  const fecha = o.fecha
  // Valida existencias contra lo que se vendió desde que se armó la orden
  for (const r of o.renglones) {
    const m = estado.catalogo.menu.find(x => x.platilloId === r.platilloId && x.desde <= fecha && fecha <= x.hasta)
    const k = `${fecha}|${r.platilloId}`
    const ex = exs[k] ?? { fecha, platilloId: r.platilloId, vendidas: 0, agotadoManual: false }
    if (m?.porciones != null && ex.vendidas + r.cantidad > m.porciones) {
      throw new ErrorCobro(`Ya no alcanzan las porciones de ${r.nombre}`)
    }
    exs[k] = { ...ex, vendidas: ex.vendidas + r.cantidad }
  }
  const ahora = new Date().toISOString()
  const cerrada: Orden = {
    ...o,
    folio: siguienteFolio(estado.ordenes, fecha),
    estado: 'cobrada',
    cobradaEn: ahora,
    sincronizada: false,
  }
  guardar({ ...estado, existencias: exs, ordenes: [...estado.ordenes, cerrada], borrador: null })
  return cerrada
}

export function marcarSincronizadas(ids: string[]) {
  const s = new Set(ids)
  guardar({ ...estado, ordenes: estado.ordenes.map(o => (s.has(o.id) ? { ...o, sincronizada: true } : o)) })
}

export function setCatalogo(c: Catalogo) {
  guardar({ ...estado, catalogo: c })
}

/** Solo para la demo: vuelve a los datos de ejemplo */
export function reiniciarDemo() {
  guardar({ ...nuevo(), dispositivo: estado.dispositivo, cajeros: estado.cajeros })
}

// ── Caja ───────────────────────────────────────────────────────────────────

export function agregarGasto(g: Gasto) {
  if (estado.cortes.some(c => c.fecha === g.fecha)) throw new ErrorCobro('La caja de ese día ya se cerró')
  guardar({ ...estado, gastos: [...estado.gastos, g] })
}

export function quitarGasto(id: string) {
  const g = estado.gastos.find(x => x.id === id)
  if (!g || estado.cortes.some(c => c.fecha === g.fecha)) return
  if (g.sincronizado) throw new ErrorCobro('Ese gasto ya se subió; corrígelo desde HOG APP')
  guardar({ ...estado, gastos: estado.gastos.filter(x => x.id !== id) })
}

/** Cierra la caja del día: el corte queda fijo y ya no se puede vender ese día */
export function cerrarCorte(c: Corte) {
  if (estado.cortes.some(x => x.fecha === c.fecha)) throw new ErrorCobro('La caja de ese día ya se cerró')
  guardar({ ...estado, cortes: [...estado.cortes, c] })
}

export function marcarCajaSincronizada(gastos: string[], cortes: string[]) {
  const g = new Set(gastos), c = new Set(cortes)
  guardar({
    ...estado,
    gastos: estado.gastos.map(x => (g.has(x.id) ? { ...x, sincronizado: true } : x)),
    cortes: estado.cortes.map(x => (c.has(x.id) ? { ...x, sincronizado: true } : x)),
  })
}

// ── Quién cobra ────────────────────────────────────────────────────────────

export function abrirCaja(sesion: SesionCaja, cajero: CajeroLocal | null) {
  const cajeros = cajero ? [...estado.cajeros.filter(c => c.usuario !== cajero.usuario), cajero] : estado.cajeros
  guardar({ ...estado, sesionCaja: sesion, cajeros })
}

export function salirCaja() {
  guardar({ ...estado, sesionCaja: null })
}
