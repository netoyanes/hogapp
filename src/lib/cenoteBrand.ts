// ─────────────────────────────────────────────────────────────────────────────
// IDENTIDAD CENOTE — tokens tomados de las piezas impresas de Cenote Wellness
// Club (menú del spa, 1-pager "Nueva forma de operar", tarjeta del huésped
// Flow). Como podBrand.ts y apricotBrand.ts, esto NO es el tema de HOG APP:
// vive aparte para que lo público hable en Cenote.
//
// La proporción de las piezas: arena de fondo, tinta para texto y bloques
// sólidos, y tres acentos que nunca cubren la pantalla entera — el oliva
// marca la oferta (fundadores), el cielo es el agua del spa y el óxido es la
// letra a mano ("Calor, vapor, frío. Y una pausa.").
// ─────────────────────────────────────────────────────────────────────────────

export const CENOTE = {
  /** Arena — el fondo del menú del spa. */
  arena:  '#EEEBDD',
  /** Piedra — el fondo del 1-pager y del reverso de la tarjeta. */
  piedra: '#D4D0C5',
  /** Papel — las tarjetas que flotan sobre la piedra. */
  papel:  '#F2F0E9',
  /** Tinta — texto, reglas y el bloque oscuro de "Reserva en línea". */
  tinta:  '#071518',
  /** Gris de los textos secundarios. */
  humo:   '#6D726E',
  /** Oliva — la oferta: fundadores, precio destacado. */
  oliva:  '#BEC47D',
  /** Cielo — el agua; el frente de la tarjeta y la columna del spa. */
  cielo:  '#A2BACE',
  /** Óxido — la letra a mano y los eyebrows. */
  oxido:  '#8E3523',
} as const

/**
 * Tipografía de las piezas:
 *   · Space Grotesk — la marca CENOTE y los titulares grandes en mayúsculas.
 *   · Inter — todo lo demás; Light para el cuerpo, SemiBold para precios.
 *   · Sarina — la mano: "wellness club" y las frases de pausa.
 */
export const GROTESK = "'Space Grotesk', system-ui, -apple-system, sans-serif"
export const INTER = "'Inter', system-ui, -apple-system, sans-serif"
export const MANO = "'Sarina', 'Brush Script MT', cursive"

export const CENOTE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Sarina&family=Space+Grotesk:wght@400;500;700&display=swap'

/** Eyebrow de las piezas: versalitas pequeñas con mucho tracking. */
export const EYEBROW = {
  fontFamily: INTER, fontSize: 11, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase',
} as const

export const LUGAR = {
  nombre: 'Cenote Wellness Club',
  calle: 'Av. Nuevo León 108, 2º piso',
  colonia: 'Condesa, CDMX',
  referencia: 'Segundo piso del Hotel Flow',
  mapa: 'https://maps.app.goo.gl/AmEqutekz1gGPEZD6',
} as const
