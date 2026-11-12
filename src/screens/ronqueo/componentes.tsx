// Piezas compartidas del landing y la confirmación de Ronqueo.
// Logo, símbolo, sello y línea orgánica son los SVG exportados de Figma tal
// cual (public/ronqueo/*.svg) — no se redibujan.
import type { Resp } from './contenido'

// Fuentes self-hosted (solo latin) — Inter 400/500/600/700/800 e IBM Plex Mono 400
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import './ronqueo.css'

/** Texto que cambia entre el frame desktop (d) y el mobile (m). */
export function R({ t }: { t: Resp }) {
  // rq-pre solo cuando el texto trae saltos de línea del diseño (\n)
  const pre = (s: string) => (s.includes('\n') ? ' rq-pre' : '')
  if (typeof t === 'string') return <span className={pre(t).trim() || undefined}>{t}</span>
  if (t.d === t.m) return <span className={pre(t.d).trim() || undefined}>{t.d}</span>
  return (
    <>
      <span className={'rq-d' + pre(t.d)}>{t.d}</span>
      <span className={'rq-m' + pre(t.m)}>{t.m}</span>
    </>
  )
}

export function Logo({ tono, href = '/ronqueo' }: { tono: 'noche' | 'dia'; href?: string }) {
  return (
    <a className="rq-logo" href={href} aria-label="bruma records · inicio">
      <img src={`/ronqueo/bruma-lockup-${tono}.svg`} width={150} height={99} alt="" />
    </a>
  )
}

export function Surcos({ tono }: { tono: 'noche' | 'dia' }) {
  const src = `/ronqueo/linea-organica-${tono}.svg`
  return (
    <div className="rq-surcos" aria-hidden="true">
      <img src={src} alt="" width={1200} height={18} />
      <img src={src} alt="" width={1200} height={18} />
      <img src={src} alt="" width={1200} height={18} />
    </div>
  )
}
