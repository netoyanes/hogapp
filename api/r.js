// /r/OC — la URL para PAUTAS y para compartir el landing de reservas.
// Sirve el Open Graph configurado en HOG APP (Reservas → Compartir: título,
// descripción, imagen) y redirige a la SPA (?reservar=CODE).
//
// Función PLANA + código por query (la reescritura /r/:code → /api/r?code=
// vive en vercel.json): la versión con ruta dinámica api/r/[code].js no se
// registraba como función en este proyecto y el catch-all de la SPA terminaba
// sirviendo index.html — el preview salía "HOG APP" (código 206 en el
// Sharing Debugger, la firma de un estático).
import { venueMeta, ogRedirect } from './_og.js'

export default async function handler(req, res) {
  const code = String(req.query.code ?? '').slice(0, 12)
  const m = (await venueMeta(code)) ?? {}
  ogRedirect(res, {
    host: req.headers.host,
    dest: `/?reservar=${encodeURIComponent(code)}`,
    title: m.og_title || `Reserva tu mesa en ${m.name ?? 'nuestra casa'}`,
    description: m.og_description || 'Elige día, hora y cuántos son — tu mesa queda confirmada en minutos.',
    image: m.og_image_url || null,
  })
}
