// Variantes webp de las fotos del evento (DJ, ronqueo, cuchillos).
// Uso: node scripts/ronqueo-fotos.mjs <carpeta-con-originales>
//   1.jpg  red pig flower (b/n, corona)      → dj-retrato
//   2.jpg  red pig flower (rojo, en cabina)  → dj-rojo
//   3.webp chef samu en el ronqueo           → samu-ronqueo
//   4.webp manos sobre el atún               → atun-manos
//   5.webp los cuchillos                     → cuchillos
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const dir = process.argv[2]
const out = 'public/ronqueo/img'
mkdirSync(out, { recursive: true })
const fotos = [
  ['1.jpg', 'dj-retrato', [480, 800, 1154]],
  ['2.jpg', 'dj-rojo', [640, 1000, 1600]],
  ['3.webp', 'samu-ronqueo', [480, 972]],
  ['4.webp', 'atun-manos', [480, 972]],
  ['5.webp', 'cuchillos', [480, 954]],
]
for (const [src, nombre, anchos] of fotos) {
  for (const w of anchos) {
    await sharp(`${dir}/${src}`).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72, effort: 6 }).toFile(`${out}/${nombre}-${w}.webp`)
  }
}
console.log('listo')
