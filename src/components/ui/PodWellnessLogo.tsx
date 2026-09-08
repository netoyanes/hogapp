// ─────────────────────────────────────────────────────────────────────────────
// LOGO POD WELLNESS
//
// El lockup son dos piezas: el ícono (la "vaina" de cuatro lóbulos) y el texto
// POD WELLNESS con el tracking del manual.
//
// LA VAINA es el trazo OFICIAL, copiado del SVG de marca — no una
// reconstrucción. Va embebido en vez de cargarse como archivo para que siga
// aceptando `color`: en el pie de página la marca va en cream, no en verde, y
// un <img> no se puede recolorear.
//
// EL LOCKUP COMPLETO sí sale del archivo (public/pod-wellness-logo.svg), porque
// el texto está en trazos y no hay forma de reproducir esa tipografía en vivo
// sin depender de que Poppins cargue. Si el archivo faltara, se dibuja con
// Poppins como respaldo — parecido, no idéntico.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { ESPACIO, POPPINS, LOGO } from '../../lib/podBrand'

const LOCKUP_OFICIAL = '/pod-wellness-logo.svg'

/**
 * Medidas del archivo oficial, tomadas con getBBox — no a ojo:
 *   viewBox 436×71 · contenido de x 0 a 405.76, y de 15 a 56
 * De ahí salen las dos correcciones que necesita para verse bien:
 *   · el alto útil es 41 de 71 (hay 15 de aire arriba y 15 abajo), así que el
 *     archivo se escala contra ESO, no contra su alto total
 *   · sobran 30.24 a la derecha —el tracking después de la última S— y nada a
 *     la izquierda, así que centrar la caja deja el dibujo corrido
 */
const ARCHIVO = { ancho: 436, alto: 71, marcaAlto: 41, sobranteDer: 30.24 } as const

/** El trazo oficial de la vaina. viewBox cuadrado, con el dibujo centrado. */
const VAINA = 'M34.5211 23.585C30.7615 20.8891 25.9877 19.5508 21.0282 20.1691C21.2322 18.5651 21.2092 16.9487 20.9695 15.364L20.9141 15C15.8452 15.8161 11.5704 18.5516 8.7513 22.3337C6.0405 25.9712 4.67473 30.5762 5.24409 35.3711C3.61785 35.1756 1.97777 35.1993 0.371121 35.4333L0 35.4864C0.83214 40.4577 3.62131 44.6502 7.47773 47.415C11.2373 50.1109 16.0089 51.4492 20.9695 50.8309C20.7678 52.4349 20.7908 54.0513 21.0305 55.636L21.0859 56C26.1536 55.1839 30.4284 52.4484 33.2476 48.6663C35.9583 45.0288 37.3253 40.4238 36.7559 35.6289C38.3822 35.8244 40.0211 35.8007 41.6289 35.5667L42 35.5136C41.1679 30.5423 38.3775 26.3498 34.5211 23.585ZM24.215 42.6834C22.4436 45.1136 21.3855 47.831 21.0006 50.5969C20.9925 50.5382 20.9833 50.4805 20.9752 50.4229C20.2779 45.8122 17.7469 41.4784 13.577 38.5553C11.2846 36.948 8.74092 35.9397 6.13962 35.4989C10.6691 34.7246 14.9013 32.2717 17.7838 28.3144C19.5541 25.8841 20.6122 23.1656 20.9983 20.3997C21.0063 20.4585 21.0144 20.5172 21.0236 20.5749C21.7209 25.1856 24.2519 29.5193 28.423 32.4424C30.7154 34.0498 33.2591 35.058 35.8604 35.4989C31.3297 36.2732 27.0987 38.726 24.215 42.6834Z'

/**
 * ¿El archivo oficial se puede pintar? No lo deduce de las cabeceras: lo carga
 * y ve si el navegador lo acepta.
 *
 * Mirar el content-type no sirve, por los dos lados. Si se exige que diga
 * "svg", un servidor que mande application/octet-stream hace que se descarte un
 * archivo perfectamente bueno, en silencio. Y si se acepta cualquier cosa que
 * no sea HTML —siendo SPA, una ruta inexistente devuelve index.html con 200—,
 * entonces ese mismo octet-stream pasa la prueba pero el navegador se niega a
 * renderizarlo en un <img> y sale el ícono de imagen rota.
 *
 * Cargarlo de verdad responde la única pregunta que importa. Mientras se
 * resuelve se dibuja el respaldo, así que nunca hay hueco ni imagen rota.
 */
function useLogoRenderizable(url: string) {
  const [sirve, setSirve] = useState(false)
  useEffect(() => {
    let vivo = true
    const im = new Image()
    im.onload = () => { if (vivo) setSirve(true) }
    im.onerror = () => { if (vivo) setSirve(false) }
    im.src = url
    return () => { vivo = false; im.onload = null; im.onerror = null }
  }, [url])
  return sirve
}

/**
 * La marca sola. `size` en px — el manual pide mínimo 40. También acepta una
 * medida CSS en texto ('1.1667em', 'clamp(...)') para escalar con la pantalla.
 */
export function PodIcon({ size = LOGO.iconMin, color = ESPACIO.wellness, title }: {
  size?: number | string; color?: string; title?: string
}) {
  return (
    // El dibujo mide 42×41 desde y=15; el viewBox se abre a 42×42 centrado para
    // que la caja sea cuadrada y `size` no lo deforme.
    <svg viewBox="0 14.5 42 42" fill="none" role="img"
      aria-label={title ?? 'POD Wellness'}
      style={{ display: 'block', width: size, height: size, flexShrink: 0 }}>
      {title && <title>{title}</title>}
      <path d={VAINA} fill={color} />
    </svg>
  )
}

/**
 * El lockup completo. `size` es la altura de referencia del texto — número en
 * px, o una medida CSS en texto para que escale con la pantalla.
 *
 * El manual pide mínimo 32px, pero eso aplica a impreso: en un teléfono de
 * 360px el lockup a 32 no cabe y se corta la última S. El default es un clamp
 * que respeta los 32 cuando hay ancho y baja cuando no.
 */
export function PodWellnessLogo({ size = LOGO.fluido, color = ESPACIO.wellness, gap }: {
  size?: number | string; color?: string; gap?: number | string
}) {
  const oficial = useLogoRenderizable(LOCKUP_OFICIAL)
  const medida = typeof size === 'number' ? `${size}px` : size

  if (oficial) {
    // El archivo se escala por su VAINA, no por su alto total: así queda del
    // mismo tamaño que el respaldo dibujado y `size` significa lo mismo en los
    // dos caminos. alto = size × (42/36) × (71/41)
    const factorAlto = (42 / 36) * (ARCHIVO.alto / ARCHIVO.marcaAlto)
    const alto = `calc(${medida} * ${factorAlto.toFixed(4)})`
    // El ancho va explícito, no en auto. Un <img> en display:block con
    // width:auto y margin:0 auto se estira al ancho del contenedor en vez de
    // respetar su proporción — medido: 640×68.7 para un archivo que es 436×71.
    const ancho = `calc(${medida} * ${(factorAlto * (ARCHIVO.ancho / ARCHIVO.alto)).toFixed(4)})`
    return (
      <img src={LOCKUP_OFICIAL} alt="POD Wellness"
        style={{
          display: 'block', height: alto, width: ancho, maxWidth: '100%', margin: '0 auto',
          // Si maxWidth llegara a recortar el ancho, que encoja proporcionado
          // en vez de aplastar el dibujo.
          objectFit: 'contain',
          // El sobrante de la derecha deja el dibujo corrido a la izquierda
          // dentro de su propia caja. Se empuja la mitad para centrarlo de
          // verdad — el porcentaje del translate es sobre el ancho del <img>.
          transform: `translateX(${(ARCHIVO.sobranteDer / 2 / ARCHIVO.ancho * 100).toFixed(3)}%)`,
        }} />
    )
  }

  // Respaldo: la vaina oficial + Poppins. El font-size del contenedor es la
  // unidad, y todo lo de adentro va en em, así una sola medida escala el
  // conjunto.
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', lineHeight: 1, maxWidth: '100%',
      fontSize: size, gap: gap ?? `${LOGO.gap}em`,
    }}>
      <PodIcon size={`${42 / 36}em`} color={color} title="POD Wellness" />
      <span style={{
        fontFamily: POPPINS, fontWeight: 600, fontSize: '1em', letterSpacing: LOGO.tracking,
        color, whiteSpace: 'nowrap',
        // Mismo sobrante que en el archivo: el tracking deja aire tras la última
        // S y hay que compensarlo para que el bloque quede óptico.
        marginRight: `-${LOGO.tracking}`,
      }}>
        POD WELLNESS
      </span>
    </span>
  )
}
