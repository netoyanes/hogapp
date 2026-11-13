// Idioma del landing y la confirmación del ronqueo.
// Español por default; «EN» cambia a inglés. Se elige así, en orden:
// ?lang=en|es en la URL → lo que el visitante eligió antes → español.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as ES from './contenido'
import * as EN from './contenido.en'

import { IdiomaCtx, useIdioma, type Contenido, type Idioma } from './idiomaCtx'

// Si a contenido.en.ts le falta un texto (o cambia una forma), esto no compila
const CONTENIDO: Record<Idioma, Contenido> = { es: ES, en: EN }

const CLAVE = 'ronqueo_idioma'

function inicial(): Idioma {
  const q = new URLSearchParams(location.search).get('lang')
  if (q === 'en' || q === 'es') return q
  try { if (localStorage.getItem(CLAVE) === 'en') return 'en' } catch { /* sin storage */ }
  return 'es'
}


export function ProveedorIdioma({ children }: { children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>(inicial)

  useEffect(() => {
    document.documentElement.lang = idioma
    try { localStorage.setItem(CLAVE, idioma) } catch { /* sin storage */ }
    // La URL refleja el idioma (para compartir el link en inglés); español no lleva parámetro
    const url = new URL(location.href)
    if (idioma === 'en') url.searchParams.set('lang', 'en'); else url.searchParams.delete('lang')
    history.replaceState(history.state, '', url.pathname + url.search + url.hash)
  }, [idioma])

  const cambiar = useCallback(() => setIdioma(i => (i === 'es' ? 'en' : 'es')), [])
  const valor = useMemo(() => ({ idioma, c: CONTENIDO[idioma], cambiar }), [idioma, cambiar])
  return <IdiomaCtx.Provider value={valor}>{children}</IdiomaCtx.Provider>
}

/** Botón «EN» / «ES» de la barra superior. */
export function CambioIdioma() {
  const { c, cambiar } = useIdioma()
  return (
    <button type="button" className="rq-idioma" onClick={cambiar} aria-label={c.UI.idioma.aria} lang={c.UI.idioma.lang}>
      {c.UI.idioma.boton}
    </button>
  )
}
