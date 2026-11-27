// Doña Concha · POS — sincronización con Supabase.
//
// La tablet vende sin internet; esto sube las órdenes cobradas que quedaron en
// cola cuando hay red y sesión. concha_subir_orden() es idempotente (el id lo
// genera la tablet), así que reintentar nunca duplica una orden.
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getPOS, marcarCajaSincronizada, marcarSincronizadas } from './store'

let subiendo = false

export async function subirPendientes(): Promise<{ subidas: number; error: string | null }> {
  if (subiendo || !navigator.onLine) return { subidas: 0, error: null }
  const pos = getPOS()
  const pendientes = pos.ordenes.filter(o => !o.sincronizada && o.estado !== 'abierta')
  const gastos = pos.gastos.filter(g => !g.sincronizado)
  const cortes = pos.cortes.filter(c => !c.sincronizado)
  if (!pendientes.length && !gastos.length && !cortes.length) return { subidas: 0, error: null }
  const { data } = await supabase.auth.getSession()
  if (!data.session) return { subidas: 0, error: 'sin sesión' }
  subiendo = true
  const ok: string[] = []
  let error: string | null = null
  try {
    for (const o of pendientes) {
      const { error: e } = await supabase.rpc('concha_subir_orden', { o })
      if (e) { error = e.message; break }       // se reintenta en la siguiente vuelta, en orden
      ok.push(o.id)
    }
    // Gastos y cortes: después de las órdenes, para que el corte llegue con su venta
    if (!error && gastos.length) {
      const { error: e } = await supabase.from('concha_gastos_caja').upsert(gastos.map(g => ({
        id: g.id, fecha: g.fecha, concepto: g.concepto, monto: g.monto, registrado_por: g.registradoPor, creado_en: g.creadoEn,
      })))
      if (e) error = e.message; else marcarCajaSincronizada(gastos.map(g => g.id), [])
    }
    if (!error && cortes.length) {
      const { error: e } = await supabase.from('concha_cortes').upsert(cortes.map(c => ({
        id: c.id, fecha: c.fecha, fondo: c.fondo, venta_total: c.ventaTotal, efectivo: c.efectivo, tarjeta: c.tarjeta,
        propinas: c.propinas, gastos: c.gastos, sin_cobro_costo: c.sinCobroCosto, efectivo_a_entregar: c.efectivoAEntregar,
        efectivo_contado: c.efectivoContado, diferencia: c.diferencia, notas: c.notas, cerrado_por: c.cerradoPor, cerrado_en: c.cerradoEn,
        desglose: {
          ...c.desglose, propinasEfectivo: c.propinasEfectivo, propinasTarjeta: c.propinasTarjeta,
          ordenes: c.ordenes, comidas: c.comidas, ticketPromedio: c.ticketPromedio, meta: c.meta,
        },
      })))
      if (e) error = e.message; else marcarCajaSincronizada([], cortes.map(c => c.id))
    }
  } finally {
    subiendo = false
    if (ok.length) marcarSincronizadas(ok)
  }
  return { subidas: ok.length, error }
}

/** Sesión de HOG APP (se guarda en la tablet: sigue valiendo sin internet) */
export function useSesion(): Session | null | undefined {
  const [s, setS] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setS(data.session)).catch(() => setS(null))
    const { data } = supabase.auth.onAuthStateChange((_e, ses) => setS(ses))
    return () => data.subscription.unsubscribe()
  }, [])
  return s
}

/** Sube la cola al abrir, al volver la red y cada 30 s */
export function useSincronizacion(sesion: Session | null | undefined) {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!sesion) return
    const correr = () => { subirPendientes().then(r => setError(r.error)).catch(e => setError(String(e))) }
    correr()
    const id = setInterval(correr, 30000)
    window.addEventListener('online', correr)
    return () => { clearInterval(id); window.removeEventListener('online', correr) }
  }, [sesion])
  return error
}
