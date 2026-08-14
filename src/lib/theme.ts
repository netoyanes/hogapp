// ─────────────────────────────────────────────────────────────────────────────
// TEMA — cada quien elige cómo ve HOG APP: oscuro, claro o automático.
//
// "Automático" sigue al sistema operativo: la app se aclara de día y se
// oscurece de noche sola, sin que nadie toque nada. Es la opción por defecto
// para gente nueva; quien ya venía usando la app se queda en oscuro (era lo
// único que había) hasta que decida cambiar.
//
// La preferencia vive en localStorage porque es del DISPOSITIVO, no de la
// cuenta: la tablet del venue en el host stand y la laptop de oficina se ven
// en condiciones de luz distintas y merecen ajustes distintos.
//
// El CSS solo conoce dos estados reales (data-theme="dark" | "light"); aquí se
// resuelve "auto" a uno de los dos. Así ninguna regla tiene que duplicarse
// entre un [data-theme] y un @media.
// ─────────────────────────────────────────────────────────────────────────────
export type ThemeMode = 'dark' | 'light' | 'auto'
export type ResolvedTheme = 'dark' | 'light'

const KEY = 'hog_theme'
/** Evento global: la app lo escucha para re-renderizar lo que dependa del tema */
export const THEME_EVENT = 'hog:theme-changed'

export const THEME_LABEL: Record<ThemeMode, { label: string; hint: string; icon: string }> = {
  dark:  { label: 'Oscuro',     hint: 'Siempre en oscuro',                 icon: '🌙' },
  light: { label: 'Claro',      hint: 'Siempre en claro',                  icon: '☀️' },
  auto:  { label: 'Automático', hint: 'Sigue al sistema: claro de día, oscuro de noche', icon: '🌗' },
}

export function getThemeMode(): ThemeMode {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
  return v === 'light' || v === 'auto' || v === 'dark' ? v : 'dark'
}

function prefersLight(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: light)').matches
}

export function resolveTheme(mode: ThemeMode = getThemeMode()): ResolvedTheme {
  if (mode === 'auto') return prefersLight() ? 'light' : 'dark'
  return mode
}

function apply(mode: ThemeMode) {
  const resolved = resolveTheme(mode)
  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  // Le dice al navegador de qué color pintar lo que no controlamos:
  // scrollbars nativos, autofill de formularios, pickers de fecha
  root.style.colorScheme = resolved
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { mode, resolved } }))
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(KEY, mode)
  apply(mode)
}

/** Se llama una vez al arrancar, antes de renderizar (evita el parpadeo) */
export function initTheme() {
  apply(getThemeMode())
  // En automático, seguir al sistema en vivo: si el Mac cambia a oscuro al
  // atardecer, la app cambia con él sin recargar.
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => { if (getThemeMode() === 'auto') apply('auto') }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange) // Safari viejo
  }
}
