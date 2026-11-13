// Assets de las invitaciones del ronqueo (Figma, página «10 · Invitaciones»).
//   1) recorta la foto del atún al tamaño exacto de cada «Foto / Marcador»
//      (recorte centrado, igual que el fill de Figma) → public/ronqueo/inv/
//   2) empaqueta fuentes + imágenes en base64 para la edge function
//      → supabase/functions/ronqueo-invitaciones/assets.ts
// Uso: node scripts/ronqueo-invitaciones-assets.mjs <foto-atun-original>
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

const foto = process.argv[2]
const pub = 'public/ronqueo/inv'
const recortes = { 'foto-feed.jpg': [952, 220], 'foto-story-venta.jpg': [920, 319], 'foto-story-cortesia.jpg': [920, 317] }
for (const [nombre, [w, h]] of Object.entries(recortes)) {
  await sharp(foto).resize(w, h, { fit: 'cover', position: 'centre' }).jpeg({ quality: 90, mozjpeg: true }).toFile(`${pub}/${nombre}`)
}

const fuentes = {
  inter400: 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff',
  inter500: 'node_modules/@fontsource/inter/files/inter-latin-500-normal.woff',
  inter600: 'node_modules/@fontsource/inter/files/inter-latin-600-normal.woff',
  inter700: 'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff',
  inter800: 'node_modules/@fontsource/inter/files/inter-latin-800-normal.woff',
  mono400: 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff',
}
const imagenes = [
  'wordmark-dia.svg', 'wordmark-noche.svg', 'simbolo-dia.svg', 'simbolo-noche.svg', 'sello-circulo.svg',
  'sello-anillo-feed.png', 'sello-anillo-story.png', 'sello-simbolo.svg', 'codigo-simbolo-dia.svg',
  'codigo-simbolo-noche.svg', 'foto-feed.jpg', 'foto-story-venta.jpg', 'foto-story-cortesia.jpg',
]
const mime = f => f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : 'image/jpeg'
let ts = '// GENERADO por scripts/ronqueo-invitaciones-assets.mjs — no editar a mano.\n'
ts += '// Fuentes (woff, base64) e imágenes (data URI) de las invitaciones, embebidas\n// para que la edge function no dependa de la red al renderizar.\n\n'
ts += 'export const FUENTES_B64: Record<string, string> = {\n'
for (const [k, p] of Object.entries(fuentes)) ts += `  ${k}: '${readFileSync(p).toString('base64')}',\n`
ts += '}\n\nexport const IMAGENES: Record<string, string> = {\n'
for (const f of imagenes) ts += `  '${f}': 'data:${mime(f)};base64,${readFileSync(`${pub}/${f}`).toString('base64')}',\n`
ts += '}\n'
writeFileSync('supabase/functions/ronqueo-invitaciones/assets.ts', ts)
console.log('listo', (ts.length / 1024).toFixed(0) + ' KB')
