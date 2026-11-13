// Cliente de la edge function `ronqueo-invitaciones` y utilidades de la
// herramienta de PR (/pr/invitaciones).
import { supabase } from '../../lib/supabase'
import type { Formato, Tipo, Titular } from '../../../supabase/functions/ronqueo-invitaciones/plantillas'

export type UsuarioPr = { id: string; nombre: string; telefono: string }
export type Invitacion = {
  id: string; codigo: string; tipo: Tipo; numero: number; nombre: string; titular: Titular | null
  acompanantes: number; firma: string; formato: Formato | 'ambos'; created_at: string
  creado_por_nombre: string | null; creado_por_tel: string | null; anulada_at: string | null; anulada_por: string | null; descargas: number
}

const CLAVE = 'ronqueo_pr_token'
export const tokenGuardado = () => { try { return localStorage.getItem(CLAVE) } catch { return null } }
export const guardarToken = (t: string | null) => { try { if (t) localStorage.setItem(CLAVE, t); else localStorage.removeItem(CLAVE) } catch { /* sin storage */ } }

export async function pr<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ronqueo-invitaciones', { body: { token: tokenGuardado(), ...body } })
  if (error) {
    let detalle: { error?: string } = {}
    try { detalle = await (error as { context?: Response }).context?.json() } catch { /* sin cuerpo */ }
    const e = new Error(detalle.error ?? 'algo falló. intenta otra vez.') as Error & { status?: number }
    e.status = (error as { context?: Response }).context?.status
    throw e
  }
  return data as T
}

export const FIRMAS = ['neto', 'norbert', 'bárbara', 'bruma records'] as const
export const LINK_COMPRA = 'https://hogapp-smoky.vercel.app/ronqueo'

/** Mensaje para pegar en WhatsApp (copy acordado; en minúsculas). */
export function mensajeWhatsapp(inv: Pick<Invitacion, 'tipo' | 'nombre' | 'codigo'>) {
  const base = `${inv.nombre}, te guardamos lugar para el ronqueo del viernes 20 en bruma records. un atún completo, despiezado en vivo y servido en todos sus cortes. all you can eat.`
  return inv.tipo === 'venta'
    ? `${base} solo 50 lugares. $1,500 por persona. compra tu lugar aquí: ${LINK_COMPRA} · tu código: ${inv.codigo}`
    : `${base} confirma por whatsapp antes del lun 16. tu lugar tiene nombre. · tu código: ${inv.codigo}`
}

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const b64aBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
