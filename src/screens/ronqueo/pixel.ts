// Eventos de venta para el Meta Pixel (el código base vive en ronqueo.html).
// Si el pixel no cargó (bloqueador de anuncios, sin red), no pasa nada.
type Fbq = (accion: 'track', evento: string, params?: Record<string, unknown>, opciones?: { eventID?: string }) => void
const fbq = (): Fbq | undefined => (window as unknown as { fbq?: Fbq }).fbq

const BASE = { content_name: 'all you can eat · edición ronqueo', content_category: 'evento', currency: 'MXN' }

/** Llegó a la sección del boleto (una vez por visita). */
let contenidoVisto = false
export function pixelVioBoleto(precio: number) {
  if (contenidoVisto) return
  contenidoVisto = true
  fbq()?.('track', 'ViewContent', { ...BASE, value: precio, content_ids: ['ronqueo-2026-11-20'], content_type: 'product' })
}

/** Clic en «pagar» con el formulario completo. */
export function pixelInicioPago(cantidad: number, total: number) {
  fbq()?.('track', 'InitiateCheckout', { ...BASE, value: total, num_items: cantidad, content_ids: ['ronqueo-2026-11-20'], content_type: 'product' })
}

/** Pago confirmado. Una sola vez por código (aunque recarguen la página). */
export function pixelCompra(codigo: string, cantidad: number, total: number) {
  const clave = `ronqueo_px_${codigo}`
  try { if (localStorage.getItem(clave)) return; localStorage.setItem(clave, '1') } catch { /* sin storage */ }
  fbq()?.('track', 'Purchase', { ...BASE, value: total, num_items: cantidad, content_ids: ['ronqueo-2026-11-20'], content_type: 'product' }, { eventID: codigo })
}
