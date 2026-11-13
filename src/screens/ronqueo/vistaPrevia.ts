// Vista previa en el navegador: la MISMA plantilla que usa el servidor para el
// PNG (supabase/functions/ronqueo-invitaciones/plantillas.ts), renderizada con
// Satori a SVG. Lo que se ve aquí es lo que se descarga.
import satori from 'satori'
import { plantilla, FUENTES, MEDIDAS, type DatosInvitacion } from '../../../supabase/functions/ronqueo-invitaciones/plantillas'
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url'
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff?url'
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url'
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url'
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff?url'
import mono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url'

const URL_FUENTES: Record<string, string> = { inter400, inter500, inter600, inter700, inter800, mono400 }
const IMAGENES = [
  'wordmark-dia.svg', 'wordmark-noche.svg', 'simbolo-dia.svg', 'simbolo-noche.svg', 'sello-circulo.svg',
  'sello-anillo-feed.png', 'sello-anillo-story.png', 'sello-simbolo.svg', 'codigo-simbolo-dia.svg',
  'codigo-simbolo-noche.svg', 'foto-feed.jpg', 'foto-story-venta.jpg', 'foto-story-cortesia.jpg',
]

type Recursos = { fuentes: { name: string; weight: 400 | 500 | 600 | 700 | 800; style: 'normal'; data: ArrayBuffer }[]; img: Record<string, string> }
let recursos: Promise<Recursos> | null = null

const aDataUri = (blob: Blob) => new Promise<string>((ok, mal) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = mal; r.readAsDataURL(blob)
})

function cargar(): Promise<Recursos> {
  return (recursos ??= (async () => {
    const fuentes = await Promise.all(FUENTES.map(async f => ({
      name: f.name, weight: f.weight, style: 'normal' as const,
      data: await (await fetch(URL_FUENTES[f.key])).arrayBuffer(),
    })))
    const img: Record<string, string> = {}
    await Promise.all(IMAGENES.map(async n => { img[n] = await aDataUri(await (await fetch(`/ronqueo/inv/${n}`)).blob()) }))
    return { fuentes, img }
  })())
}

/** SVG (como data URI) de una invitación, para un <img>. */
export async function svgVistaPrevia(d: DatosInvitacion): Promise<string> {
  const r = await cargar()
  const { w, h } = MEDIDAS[d.formato]
  const svg = await satori(plantilla(d, n => r.img[n]) as never, { width: w, height: h, fonts: r.fuentes })
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
