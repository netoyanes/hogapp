// Eventos de venta para el Meta Pixel (el código base vive en ronqueo.html).
// Si el pixel no cargó (bloqueador de anuncios, sin red), no pasa nada.
type Fbq = (accion: 'track', evento: string, params?: Record<string, unknown>, opciones?: { eventID?: string }) => void
const fbq = (): Fbq | undefined => (window as unknown as { fbq?: Fbq }).fbq

const BASE = { content_name: 'all you can eat · edición ronqueo', content_category: 'evento', currency: 'MXN' }

/** ViewContent: al cargar /ronqueo (una vez por carga de página). */
let contenidoVisto = false
export function pixelVistaLanding(precio: number) {
  if (contenidoVisto) return
  contenidoVisto = true
  fbq()?.('track', 'ViewContent', { ...BASE, value: precio, content_ids: ['ronqueo-2026-11-20'], content_type: 'product' })
}

/** InitiateCheckout: clic en «pagar» (con el formulario completo, justo antes de abrir Stripe). */
export function pixelInicioPago(cantidad: number, total: number) {
  fbq()?.('track', 'InitiateCheckout', { ...BASE, value: total, num_items: cantidad, content_ids: ['ronqueo-2026-11-20'], content_type: 'product' })
}

/** Purchase: solo en /ronqueo/gracias (la página a la que Stripe regresa tras un pago
 *  exitoso) y solo si el servidor confirma el pago. Una vez por código aunque recarguen. */
export function pixelCompra(codigo: string, cantidad: number, total: number) {
  const clave = `ronqueo_px_${codigo}`
  try { if (localStorage.getItem(clave)) return; localStorage.setItem(clave, '1') } catch { /* sin storage */ }
  fbq()?.('track', 'Purchase', { ...BASE, value: total, num_items: cantidad, content_ids: ['ronqueo-2026-11-20'], content_type: 'product' }, { eventID: codigo })
}
