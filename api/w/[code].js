// /w/PC — igual que /r/ pero para el portal wellness (?wellness=CODE):
// pautas y compartidas de clases salen invitando a reservar clase, no "HOG APP".
import { venueName, ogRedirect } from '../_og.js'

export default async function handler(req, res) {
  const code = String(req.query.code ?? '').slice(0, 12)
  const name = (await venueName(code)) ?? 'nuestro estudio'
  ogRedirect(res, {
    host: req.headers.host,
    dest: `/?wellness=${encodeURIComponent(code)}`,
    title: `Reserva tu clase en ${name}`,
    description: 'Yoga y wellness — aparta tu lugar en segundos, sin cuentas ni contraseñas.',
  })
}
