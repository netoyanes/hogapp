// ─────────────────────────────────────────────────────────────────────────────
// LOGO POD WELLNESS
//
// El lockup son dos piezas: el ícono (la "vaina" de cuatro lóbulos) y el
// texto POD WELLNESS en Poppins SemiBold con 7.5% de tracking, tal como está
// tokenizado en el manual.
//
// SOBRE EL ÍCONO: el SVG oficial vive en Figma, pero la política de red de la
// organización bloquea las descargas desde figma.com, así que la geometría
// está reconstruida contra el logotipo de referencia — contorno circular,
// cuatro muescas delgadas en los ejes y la estrella de cuatro picos al centro.
// Si prefieres el archivo original, deja el SVG exportado en
// public/pod-wellness-icon.svg y esta pieza lo usa en su lugar, sin tocar
// código: PodIcon lo intenta primero y solo dibuja si no existe.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useId, useState } from 'react'
import { ESPACIO, POPPINS, LOGO } from '../../lib/podBrand'

const ICONO_OFICIAL = '/pod-wellness-icon.svg'

/** La marca sola. `size` en px — el manual pide mínimo 40. */
export function PodIcon({ size = LOGO.iconMin, color = ESPACIO.wellness, title }: {
  size?: number; color?: string; title?: string
}) {
  // Si alguien deja el SVG oficial en public/, gana sobre el dibujo
  const [oficial, setOficial] = useState<boolean | null>(null)
  // El clipPath necesita id propio: con dos logos en la misma página, un id
  // compartido hace que el segundo recorte contra el primero.
  const clipId = useId()
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
  // Geometría: cuatro círculos tangentes entre sí sobre las diagonales,
  // RECORTADOS por el círculo envolvente. De ahí salen las tres cosas que
  // definen la marca: contorno circular, cuatro muescas delgadas en los ejes
  // y la estrella de cuatro picos en el negativo.
  //   k = 44/√2 → centros a 44 del centro, radio igual a la mitad de la
  //   separación entre vecinos (tangentes), y todo dentro de r = 50.
  const k = 31.11
  const centros: [number, number][] = [[50 + k, 50 - k], [50 + k, 50 + k], [50 - k, 50 + k], [50 - k, 50 - k]]
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img"
      aria-label={title ?? 'POD Wellness'} style={{ display: 'block' }}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clipId}><circle cx="50" cy="50" r="50" /></clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`} fill={color}>
        {centros.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={k} />)}
      </g>
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
