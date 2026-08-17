// /r/OC — la URL para PAUTAS y para compartir el landing de reservas.
// Sirve Open Graph del venue (el copy que Instagram muestra) y redirige a la
// SPA (?reservar=CODE). Usa SIEMPRE esta URL como destino del anuncio: la de
// ?reservar= directa enseña "HOG APP" porque el robot no ejecuta JS.
import { venueName, ogRedirect } from '../_og.js'

export default async function handler(req, res) {
  const code = String(req.query.code ?? '').slice(0, 12)
  const name = (await venueName(code)) ?? 'nuestra casa'
  ogRedirect(res, {
    host: req.headers.host,
    dest: `/?reservar=${encodeURIComponent(code)}`,
    title: `Reserva tu mesa en ${name}`,
    description: 'Elige día, hora y cuántos son — tu mesa queda confirmada en minutos.',
  })
}
