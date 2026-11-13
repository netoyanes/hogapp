// Embudo de venta del landing: visitas → llegó al boleto → clic en «compra tu
// boleto» → clic en «pagar». Anónimo: un id al azar por navegador, sin datos
// personales. Se manda con sendBeacon (no frena la navegación ni el pago).
// Las cifras se ven en HOG APP → Ronqueo → Estadísticas.
type Tipo = 'visita' | 'boleto_visto' | 'cta' | 'pagar'

const URL_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ronqueo-tickets`

// Sin conteo en pruebas locales ni en navegadores automatizados (bots, tests)
const activo = typeof window !== 'undefined'
  && !/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)
  && !navigator.webdriver
  && !new URLSearchParams(location.search).has('notrack')

function visitante(): string {
  try {
    let v = localStorage.getItem('ronqueo_visitante')
    if (!v) { v = crypto.randomUUID(); localStorage.setItem('ronqueo_visitante', v) }
    return v
  } catch { return 'sin-storage-' + Math.random().toString(36).slice(2, 12) }
}

// De dónde llegó: ?ref=… o ?utm_source=… del link (se recuerda en la sesión)
function origen(): string | null {
  try {
    const q = new URLSearchParams(location.search)
    const o = q.get('ref') ?? q.get('utm_source')
    if (o) sessionStorage.setItem('ronqueo_origen', o)
    return sessionStorage.getItem('ronqueo_origen')
  } catch { return null }
}

const dispositivo = () => (matchMedia('(max-width: 899px)').matches ? 'movil' : 'escritorio')
const yaMandados = new Set<string>()

/** Registra un evento del embudo. `unaVez` evita duplicados en la misma carga. */
export function registrar(tipo: Tipo, opciones: { idioma: 'es' | 'en'; detalle?: string; unaVez?: boolean }) {
  if (!activo) return
  const clave = tipo + (opciones.detalle ?? '')
  if (opciones.unaVez && yaMandados.has(clave)) return
  yaMandados.add(clave)
  const cuerpo = JSON.stringify({
    action: 'evento', tipo, visitante: visitante(), idioma: opciones.idioma,
    detalle: opciones.detalle, dispositivo: dispositivo(), origen: origen(),
  })
  try {
    if (navigator.sendBeacon?.(URL_FN, new Blob([cuerpo], { type: 'text/plain' }))) return
  } catch { /* sigue con fetch */ }
  fetch(URL_FN, { method: 'POST', body: cuerpo, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {})
}
