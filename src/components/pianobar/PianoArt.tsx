import { APRICOT, APRICOT_COPA } from '../../lib/apricotBrand'

// El piano en line art del flyer "piano nights" (Figma 1132:2), redibujado en
// SVG con las mismas coordenadas: en el archivo son rectángulos con borde de
// 5px HACIA DENTRO, así que cada rect aquí se corre 2.5px y encoge 5px para
// que el trazo centrado de SVG caiga en el mismo lugar.
const W = 880, H = 505, B = 5

const box = (x: number, y: number, w: number, h: number) =>
  ({ x: x + B / 2, y: y + B / 2, width: w - B, height: h - B })

const CUERPO = [
  box(60, 0, 760, 190),    // cuerpo superior
  box(300, 24, 280, 130),  // atril
  box(28, 186, 824, 30),   // tapa
  box(20, 216, 840, 120),  // teclado
  box(60, 336, 760, 140),  // cuerpo inferior
  box(84, 476, 30, 29),    // pata izq
  box(766, 476, 30, 29),   // pata der
]
const LINEAS_ATRIL = [54, 76, 98, 120]
const DIVISIONES = Array.from({ length: 19 }, (_, i) => 62 + i * 42)
// Las negras del archivo: grupos de 2 y 3 como en un piano real (faltan la
// 2, 6, 9, 13 y 16).
const NEGRAS = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14, 15, 17, 18].map(i => 49 + i * 42)

export function PianoArt({ style }: { style?: React.CSSProperties }) {
  const c = APRICOT.carbon
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Piano" style={{ width: '100%', height: 'auto', display: 'block', ...style }}>
      {CUERPO.map((r, i) => <rect key={i} {...r} fill={APRICOT.crema} stroke={c} strokeWidth={B} />)}
      {LINEAS_ATRIL.map(y => <rect key={y} x={330} y={y} width={220} height={3} fill={c} />)}
      {DIVISIONES.map(x => <rect key={x} x={x} y={221} width={3} height={110} fill={c} />)}
      {NEGRAS.map(x => <rect key={x} x={x} y={218} width={26} height={74} fill={c} />)}
      {/* La copa del doodle, parada sobre la tapa como en el flyer */}
      <image href={APRICOT_COPA} x={640} y={42} width={50} height={150} />
    </svg>
  )
}
