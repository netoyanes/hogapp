import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '../public')
mkdirSync(publicDir, { recursive: true })

// AppLogoBadge: dark green square with cream HOG symbol
// HOG symbol = 4 arcs in a ring shape (100x100 viewBox, scaled inside 512x512 square)
const size = 512
const pad = size * 0.1   // 10% padding on each side
const logoSize = size - pad * 2

function scalePath(d, scale, ox, oy) {
  return d.replace(/[-\d.]+/g, (n) => {
    const num = parseFloat(n)
    if (isNaN(num)) return n
    return num
  })
}

// Scale factor from 100-unit viewBox to logoSize pixels
const s = logoSize / 100
const ox = pad
const oy = pad

function scaleCoord(val) { return (parseFloat(val) * s + (ox)).toFixed(2) }
function scaleCoordY(val) { return (parseFloat(val) * s + (oy)).toFixed(2) }
function scaleR(val) { return (parseFloat(val) * s).toFixed(2) }

// Original paths in 100x100 viewBox — manually scale to (size x size) with padding
// We'll embed as an SVG string with the exact viewBox and let sharp handle scaling
const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#1B3A20"/>
  <g transform="translate(${ox}, ${oy}) scale(${s})">
    <!-- Top arc -->
    <path d="M 24.73 15.21 A 43 43 0 0 1 75.27 15.21 L 65.87 28.16 A 27 27 0 0 0 34.13 28.16 Z" fill="#F5F0E8"/>
    <!-- Right arc -->
    <path d="M 84.79 24.73 A 43 43 0 0 1 84.79 75.27 L 71.84 65.87 A 27 27 0 0 0 71.84 34.13 Z" fill="#F5F0E8"/>
    <!-- Bottom arc -->
    <path d="M 75.27 84.79 A 43 43 0 0 1 24.73 84.79 L 34.13 71.84 A 27 27 0 0 0 65.87 71.84 Z" fill="#F5F0E8"/>
    <!-- Left arc -->
    <path d="M 15.21 75.27 A 43 43 0 0 1 15.21 24.73 L 28.16 34.13 A 27 27 0 0 0 28.16 65.87 Z" fill="#F5F0E8"/>
  </g>
</svg>`

const buf = Buffer.from(svg)

await sharp(buf).resize(512, 512).png().toFile(`${publicDir}/icon-512.png`)
console.log('✓ icon-512.png')

await sharp(buf).resize(192, 192).png().toFile(`${publicDir}/icon-192.png`)
console.log('✓ icon-192.png')

// Apple touch icon — no border-radius (iOS clips it automatically)
const svgApple = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#1B3A20"/>
  <g transform="translate(${ox}, ${oy}) scale(${s})">
    <path d="M 24.73 15.21 A 43 43 0 0 1 75.27 15.21 L 65.87 28.16 A 27 27 0 0 0 34.13 28.16 Z" fill="#F5F0E8"/>
    <path d="M 84.79 24.73 A 43 43 0 0 1 84.79 75.27 L 71.84 65.87 A 27 27 0 0 0 71.84 34.13 Z" fill="#F5F0E8"/>
    <path d="M 75.27 84.79 A 43 43 0 0 1 24.73 84.79 L 34.13 71.84 A 27 27 0 0 0 65.87 71.84 Z" fill="#F5F0E8"/>
    <path d="M 15.21 75.27 A 43 43 0 0 1 15.21 24.73 L 28.16 34.13 A 27 27 0 0 0 28.16 65.87 Z" fill="#F5F0E8"/>
  </g>
</svg>`

await sharp(Buffer.from(svgApple)).resize(180, 180).png().toFile(`${publicDir}/apple-touch-icon.png`)
console.log('✓ apple-touch-icon.png')
