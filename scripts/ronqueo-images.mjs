// Genera las variantes webp de la foto del atún (Figma · «Foto · atún»).
// La foto original es vertical (2279×4050). El hero desktop usa una banda
// horizontal centrada —el mismo recorte que hace Figma con «fill»— y el hero
// mobile usa la foto completa. Uso: node scripts/ronqueo-images.mjs <foto.jpg>
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const src = process.argv[2]
const out = 'public/ronqueo/img'
mkdirSync(out, { recursive: true })

const meta = await sharp(src).metadata()
const bandH = 1800
const band = { left: 0, top: Math.round((meta.height - bandH) / 2), width: meta.width, height: bandH }

for (const w of [640, 960, 1440, 2000]) {
  await sharp(src).extract(band).resize({ width: w }).webp({ quality: 60, effort: 6 }).toFile(`${out}/atun-ancho-${w}.webp`)
}
for (const w of [400, 800, 1200]) {
  await sharp(src).resize({ width: w }).webp({ quality: 62, effort: 6 }).toFile(`${out}/atun-alto-${w}.webp`)
}
// Fallback jpg y la imagen para el preview del link compartido (1200×630)
await sharp(src).extract(band).resize({ width: 1440 }).jpeg({ quality: 78, mozjpeg: true }).toFile(`${out}/atun-ancho-1440.jpg`)
await sharp(src).extract(band).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80, mozjpeg: true }).toFile('public/ronqueo-og.jpg')
console.log('listo')
