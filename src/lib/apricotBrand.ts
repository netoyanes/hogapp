// ─────────────────────────────────────────────────────────────────────────────
// IDENTIDAD APRICOT — tokens tomados del sistema de marca en Figma (archivo
// "DS NEW", frame colors 1109:927) y del flyer "piano nights" (1129:3), que es
// la pieza de la que sale el portal de letras. Esto NO es el tema de HOG APP:
// vive aparte para que lo público hable en Apricot, como podBrand.ts con POD.
//
// El flyer marca la proporción: crema de fondo, carbón para texto y trazo, y
// el amarillo y el durazno solo como círculos translúcidos que se salen del
// borde. Nunca como fondo sólido.
// ─────────────────────────────────────────────────────────────────────────────

export const APRICOT = {
  /** Crema — el fondo de todo. */
  crema:    '#FEF7E7',
  /** Carbón — texto, trazo del line art, líneas divisorias. */
  carbon:   '#333333',
  tinta:    '#222222',
  amarillo: '#F1C635',
  durazno:  '#F19135',
} as const

/** Los dos círculos del flyer: mismo color de marca, con la opacidad del archivo. */
export const CIRCULO_AMARILLO = 'rgba(241, 198, 53, 0.45)'
export const CIRCULO_DURAZNO = 'rgba(241, 145, 53, 0.32)'

/**
 * Tipografía del flyer:
 *   · Mynerve — la mano. Títulos ("piano nights", "by apricot").
 *   · Space Grotesk Bold — la bajada, con tracking apenas negativo.
 *   · Roboto Mono — datos: eyebrow, fecha, dirección, pie.
 */
export const MANO = "'Mynerve', 'Comic Sans MS', cursive"
export const GROTESK = "'Space Grotesk', system-ui, -apple-system, sans-serif"
export const MONO = "'Roboto Mono', ui-monospace, monospace"

export const APRICOT_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Mynerve&family=Roboto+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;700&display=swap'

/** Assets exportados del Figma (public/apricot). */
export const APRICOT_LOGO = '/apricot/logo.svg'
export const APRICOT_COPA = '/apricot/copa.svg'
