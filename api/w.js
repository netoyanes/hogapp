// /w/PC — igual que /r/ pero para el portal wellness (?wellness=CODE).
// Reusa la IMAGEN configurada del venue; el texto tiene su propio default de
// clases (el og_title de reservas hablaría de mesas, no de yoga).
import { venueMeta, ogRedirect } from './_og.js'

export default async function handler(req, res) {
  const code = String(req.query.code ?? '').slice(0, 12)
  const m = (await venueMeta(code)) ?? {}
  ogRedirect(res, {
    host: req.headers.host,
    dest: `/?wellness=${encodeURIComponent(code)}`,
    title: `Reserva tu clase en ${m.name ?? 'nuestro estudio'}`,
    description: 'Yoga y wellness — aparta tu lugar en segundos, sin cuentas ni contraseñas.',
    image: m.og_image_url || null,
  })
}
