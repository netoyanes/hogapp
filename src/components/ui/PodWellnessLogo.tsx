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
const LOCKUP_OFICIAL = '/pod-wellness-logo.svg'

/**
 * ¿Está el archivo oficial en public/? Devuelve null mientras no se sabe, para
 * no parpadear entre el dibujo y el archivo en el primer render.
 */
function useArchivoOficial(url: string) {
  const [existe, setExiste] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    fetch(url, { method: 'HEAD' })
      .then(r => { if (vivo) setExiste(r.ok && (r.headers.get('content-type') ?? '').includes('svg')) })
      .catch(() => { if (vivo) setExiste(false) })
    return () => { vivo = false }
  }, [url])
  return existe
}

/**
 * La marca sola. `size` en px — el manual pide mínimo 40. También acepta una
 * medida CSS en texto ('1.1667em', 'clamp(...)') para que el lockup pueda
 * escalar con el ancho de pantalla sin recalcular nada en JS.
 */
export function PodIcon({ size = LOGO.iconMin, color = ESPACIO.wellness, title }: {
  size?: number | string; color?: string; title?: string
}) {
  // Si alguien deja el SVG oficial en public/, gana sobre el dibujo
  const oficial = useArchivoOficial(ICONO_OFICIAL)
  // El clipPath necesita id propio: con dos logos en la misma página, un id
  // compartido hace que el segundo recorte contra el primero.
  const clipId = useId()

  if (oficial) {
    return <img src={ICONO_OFICIAL} alt={title ?? 'POD Wellness'} style={{ display: 'block', width: size, height: size }} />
  }
  // Geometría: cuatro círculos tangentes entre sí sobre las diagonales,
  // RECORTADOS por el círculo envolvente. De ahí salen las tres cosas que
  // definen la marca: contorno circular, cuatro muescas delgadas en los ejes
  // y la estrella de cuatro picos en el negativo.
  //
  // Con los centros en (50±k, 50±k), dos círculos vecinos quedan tangentes
  // exactamente cuando el radio es k — se tocan en el eje, a k del centro. Eso
  // fija de un solo parámetro las dos proporciones que se ven:
  //   · muesca  = 50 − k     → 7.75, o 15% del radio
  //   · estrella = 2k(√2−1)  → 35 de 100 de ancho
  // k = 42.25 es lo que da esas dos medidas contra el logotipo de referencia.
  // (Estaba en 31.11: tangente también, pero con la muesca al doble de profunda
  // y la estrella en 26 en vez de 35 — se leía como trébol, no como la vaina.)
  const k = 42.25
  const centros: [number, number][] = [[50 + k, 50 - k], [50 + k, 50 + k], [50 - k, 50 + k], [50 - k, 50 - k]]
  return (
    <svg viewBox="0 0 100 100" fill="none" role="img"
      aria-label={title ?? 'POD Wellness'} style={{ display: 'block', width: size, height: size, flexShrink: 0 }}>
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
 * El lockup completo. `size` es la altura del texto — número en px, o una
 * medida CSS en texto para que escale con la pantalla. El manual pide mínimo
 * 32px, pero eso aplica al material impreso: en un teléfono de 360px, el
 * lockup a 32px no cabe y se corta la última S. Por eso el default es un
 * clamp — respeta los 32 cuando hay ancho y baja cuando no.
 *
 * Todo el interior va en em, así que UNA medida escala ícono, texto y aire.
 *
 * Si dejas el lockup exportado en public/pod-wellness-logo.svg, esta pieza lo
 * usa tal cual y solo lo escala. Así el archivo oficial entra sin tocar código
 * y sin que nadie tenga que redibujar la tipografía.
 */
export function PodWellnessLogo({ size = LOGO.fluido, color = ESPACIO.wellness, gap }: {
  size?: number | string; color?: string; gap?: number | string
}) {
  const oficial = useArchivoOficial(LOCKUP_OFICIAL)
  if (oficial) {
    // El archivo trae ícono y texto juntos; su alto es el del ícono (42/36 del
    // texto). Se fija el alto y el ancho va automático para no deformarlo, con
    // maxWidth 100% para que nunca se desborde por angosto que sea el teléfono.
    return (
      <img src={LOCKUP_OFICIAL} alt="POD Wellness"
        style={{ display: 'block', height: `calc(${typeof size === 'number' ? `${size}px` : size} * ${42 / 36})`, width: 'auto', maxWidth: '100%', margin: '0 auto' }} />
    )
  }
  return (
    // El font-size del contenedor es la unidad: lo de adentro va en em.
    <span style={{
      display: 'inline-flex', alignItems: 'center', lineHeight: 1, maxWidth: '100%',
      fontSize: size, gap: gap ?? `${LOGO.gap}em`,
    }}>
      <PodIcon size={`${42 / 36}em`} color={color} title="POD Wellness" />
      <span style={{
        fontFamily: POPPINS, fontWeight: 600, fontSize: '1em', letterSpacing: LOGO.tracking,
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
