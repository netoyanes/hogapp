// ─────────────────────────────────────────────────────────────────────────────
// LOGO POD WELLNESS
//
// El lockup son dos piezas: el ícono (la "vaina" de cuatro lóbulos) y el
// texto POD WELLNESS en Poppins SemiBold con 7.5% de tracking, tal como está
// tokenizado en el manual.
//
// SOBRE EL ÍCONO: el SVG oficial vive en Figma, pero la política de red de la
// organización bloquea las descargas desde figma.com, así que la geometría
// está reconstruida: cuatro círculos tangentes inscritos en los cuadrantes del
// lienzo. Los cuatro puntos de tangencia forman la estrella de cuatro picos
// del negativo. Si prefieres el archivo original, deja el SVG exportado en
// public/pod-wellness-icon.svg y esta pieza lo usa en su lugar, sin tocar
// código: PodIcon lo intenta primero y solo dibuja si no existe.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { ESPACIO, POPPINS, LOGO } from '../../lib/podBrand'

const ICONO_OFICIAL = '/pod-wellness-icon.svg'

/** La marca sola. `size` en px — el manual pide mínimo 40. */
export function PodIcon({ size = LOGO.iconMin, color = ESPACIO.wellness, title }: {
  size?: number; color?: string; title?: string
}) {
  // Si alguien deja el SVG oficial en public/, gana sobre el dibujo
  const [oficial, setOficial] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    fetch(ICONO_OFICIAL, { method: 'HEAD' })
      .then(r => { if (vivo) setOficial(r.ok && (r.headers.get('content-type') ?? '').includes('svg')) })
      .catch(() => { if (vivo) setOficial(false) })
    return () => { vivo = false }
  }, [])

  if (oficial) {
    return <img src={ICONO_OFICIAL} alt={title ?? 'POD Wellness'} width={size} height={size} style={{ display: 'block' }} />
  }
  // Cuatro círculos tangentes: r = 25 centrados en los cuadrantes de 100×100.
  // Se tocan en los puntos medios de cada lado y dejan la estrella al centro.
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img"
      aria-label={title ?? 'POD Wellness'} style={{ display: 'block' }}>
      {title && <title>{title}</title>}
      {([[25, 25], [75, 25], [75, 75], [25, 75]] as const).map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={25} fill={color} />
      ))}
    </svg>
  )
}

/**
 * El lockup completo. `size` es la altura del texto en px — el manual pide
 * mínimo 32. El ícono se escala en proporción al texto, como en el archivo
 * (42px de ícono para 36px de texto).
 */
export function PodWellnessLogo({ size = LOGO.textMin, color = ESPACIO.wellness, gap }: {
  size?: number; color?: string; gap?: number
}) {
  const icono = Math.round(size * (42 / 36))
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: gap ?? Math.round(size * 0.55), lineHeight: 1 }}>
      <PodIcon size={icono} color={color} title="POD Wellness" />
      <span style={{
        fontFamily: POPPINS, fontWeight: 600, fontSize: size, letterSpacing: LOGO.tracking,
        color, whiteSpace: 'nowrap',
        // El tracking deja aire sobrante a la derecha; se compensa para que el
        // bloque quede ópticamente centrado.
        marginRight: `-${LOGO.tracking}`,
      }}>
        POD WELLNESS
      </span>
    </span>
  )
}
