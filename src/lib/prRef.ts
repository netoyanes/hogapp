// ─────────────────────────────────────────────────────────────────────────────
// CÓDIGO DE PR EN EL NAVEGADOR — la memoria del "quién me trajo".
//
// Quien abre /p/SOFI-MZT llega al portal con ?ref=SOFI-MZT. Aquí se guarda por
// 30 días para que, si reserva tres días después, la reserva siga siendo de
// Sofía.
//
// LAST TOUCH a propósito: si el cliente toca el link de SOFI hoy y el de LUIS
// mañana, y reserva pasado mañana, la reserva es de LUIS. El último toque pisa
// al anterior — es la regla del brief y la que menos discusiones genera entre
// PRs, porque premia a quien estuvo más cerca de la decisión.
//
// Vive en localStorage (no en cookie) porque el portal público y la app son el
// mismo origen y no hay servidor que necesite leerlo: el código viaja explícito
// en la llamada que crea la reserva.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'hog_pr_ref'
const DIAS = 30
const VENTANA_MS = DIAS * 24 * 60 * 60 * 1000

type Guardado = { codigo: string; ts: number }

/** Guarda el código que viene en la URL. Llamar al arrancar, antes de nada. */
export function capturarRefDeUrl(): void {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (!ref) return
    const codigo = ref.trim().toUpperCase().slice(0, 24)
    if (!/^[A-Z0-9]{3,12}-[A-Z]{2,8}$/.test(codigo)) return
    localStorage.setItem(KEY, JSON.stringify({ codigo, ts: Date.now() } satisfies Guardado))
  } catch { /* incógnito estricto: se pierde la atribución, no la reserva */ }
}

/** El código vigente, o null si no hay o ya venció. */
export function refVigente(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const g = JSON.parse(raw) as Guardado
    if (!g?.codigo || typeof g.ts !== 'number') return null
    if (Date.now() - g.ts > VENTANA_MS) { localStorage.removeItem(KEY); return null }
    return g.codigo
  } catch { return null }
}

/** Tras reservar: el crédito ya se cobró, el código no debe seguir vivo. */
export function limpiarRef(): void {
  try { localStorage.removeItem(KEY) } catch { /* nada que limpiar */ }
}
