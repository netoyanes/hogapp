// Cliente de la edge function `ronqueo-tickets`. La llave secreta de Stripe
// vive solo en el servidor: aquí únicamente pedimos el cupo, abrimos la sesión
// de Checkout y leemos la confirmación.
import { supabase } from '../../lib/supabase'

export type Cupo = { cupo: number; vendidos: number; reservados: number; restantes: number; maxPorCompra: number; precioCentavos?: number }

export type Confirmacion =
  | { estado: 'pagado'; nombre: string; codigo: string; cantidad: number; total: number; correo: string }
  | { estado: 'procesando' }
  | { estado: 'no_encontrado' }

async function llamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ronqueo-tickets', { body })
  if (error) {
    // supabase-js envuelve el 4xx; el cuerpo trae { error, restantes? }
    let detalle: { error?: string; restantes?: number } = {}
    try { detalle = await (error as { context?: Response }).context?.json() } catch { /* sin cuerpo */ }
    throw Object.assign(new Error(detalle.error ?? error.message), detalle)
  }
  return data as T
}

export const pedirCupo = () => llamar<Cupo>({ action: 'cupo' })

export const abrirCheckout = (datos: { cantidad: number; nombre: string; correo: string; whatsapp: string; idioma: 'es' | 'en' }) =>
  llamar<{ url: string }>({ action: 'checkout', ...datos })

export const liberarReserva = (orden: string) => llamar<{ ok: boolean }>({ action: 'liberar', orden })

export const leerConfirmacion = (sessionId: string) => llamar<Confirmacion>({ action: 'sesion', session_id: sessionId })

export const pesos = (n: number) => '$' + n.toLocaleString('en-US')
