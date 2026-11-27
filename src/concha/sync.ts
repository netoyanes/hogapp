// Doña Concha · POS — sincronización con Supabase.
//
// La tablet vende sin internet; esto sube las órdenes cobradas que quedaron en
// cola cuando hay red y sesión. concha_subir_orden() es idempotente (el id lo
// genera la tablet), así que reintentar nunca duplica una orden.
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getPOS, marcarSincronizadas } from './store'

let subiendo = false

export async function subirPendientes(): Promise<{ subidas: number; error: string | null }> {
  if (subiendo || !navigator.onLine) return { subidas: 0, error: null }
  const pendientes = getPOS().ordenes.filter(o => !o.sincronizada && o.estado !== 'abierta')
  if (!pendientes.length) return { subidas: 0, error: null }
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
