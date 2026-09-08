// ─────────────────────────────────────────────────────────────────────────────
// IDENTIDAD POD — tokens tomados del manual de marca (Figma 2026_POD_Condesa,
// nodo 118:1216). Esto NO es el tema de HOG APP: la app interna es otra marca.
// Vive aparte para que el portal público hable en POD y la app en HOG.
//
// LA REGLA DE PROPORCIÓN del manual: 70% cream · 20% obsidian · 10% color de
// espacio. El verde es acento, no fondo — por eso aparece en el logo, en el
// precio y en un detalle, nunca cubriendo la pantalla.
//
// El color de cada espacio se usa SIEMPRE en el tono 500. Los demás tonos son
// solo para detalles o jerarquía de texto.
// ─────────────────────────────────────────────────────────────────────────────

/** Cream — la base. El fondo de todo lo público de POD. */
export const CREAM = {
  300: '#F5F5EC', 400: '#F2F2E6', 500: '#EFEFE0',
  600: '#D7D7CA', 700: '#B3B3A8', 800: '#A7A79D', 900: '#83837B',
} as const

/** Obsidian — el texto y los botones sólidos. */
export const OBSIDIAN = {
  100: '#6E6E6E', 200: '#565656', 400: '#252525', 500: '#0D0D0D',
} as const

/** Color por espacio, tono 500. Cada casa de POD tiene el suyo. */
export const ESPACIO = {
  wellness: '#1D9E75',
} as const

/** El degradado de Wellness: del 500 al fondo profundo. Fondo o detalle. */
export const WELLNESS_GRADIENT = `linear-gradient(135deg, ${ESPACIO.wellness} 0%, #04342C 100%)`

/**
 * Tipografía del manual: Poppins para display y cuerpo, IBM Plex Sans para
 * encabezados y etiquetas. Los dos pesos y tracking vienen del archivo.
 */
export const POPPINS = "'Poppins', system-ui, -apple-system, sans-serif"
export const PLEX = "'IBM Plex Sans', system-ui, -apple-system, sans-serif"

/** Escala tipográfica tal cual está tokenizada en el manual. */
export const TIPO = {
  displayXl: { fontFamily: POPPINS, fontSize: 72, fontWeight: 600, letterSpacing: '0.075em' },
  displayLg: { fontFamily: PLEX, fontSize: 56, fontWeight: 300, letterSpacing: '0.02em' },
  h1:        { fontFamily: POPPINS, fontSize: 40, fontWeight: 800 },
  h2:        { fontFamily: PLEX, fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' },
  h3:        { fontFamily: PLEX, fontSize: 24, fontWeight: 700 },
  h4:        { fontFamily: PLEX, fontSize: 20, fontWeight: 600 },
  bodyLg:    { fontFamily: POPPINS, fontSize: 18, fontWeight: 300 },
  bodyMd:    { fontFamily: POPPINS, fontSize: 16, fontWeight: 300 },
  bodySm:    { fontFamily: POPPINS, fontSize: 14, fontWeight: 300 },
  labelLg:   { fontFamily: PLEX, fontSize: 14, fontWeight: 200 },
  labelSm:   { fontFamily: PLEX, fontSize: 12, fontWeight: 300 },
} as const

/**
 * Reglas de uso del logotipo, del propio manual:
 *   · el ícono nunca baja de 40px de ancho
 *   · el ícono va en cream 500 u obsidian 500 — sobre el degradado del espacio
 *     va en cream, que es como se ve el lockup de cada casa
 *   · el texto del logo nunca baja de 32px, con 7.5px de tracking sobre 36px
 *   · el texto suele ser el primer elemento de arriba a abajo, con 16px de aire
 */
// El tracking del logotipo es 7.5 PÍXELES sobre 36px de texto — 0.2083em —,
// no 7.5%: es lo que dice la nota del manual y lo que trae el archivo.
export const LOGO = { iconMin: 40, textMin: 32, tracking: '0.2083em', padding: 16 } as const
