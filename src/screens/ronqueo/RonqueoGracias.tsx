// /ronqueo/gracias?session_id=… — confirmación de pago (modo Día).
// La sesión se lee en el servidor: nombre, código, cantidad y total salen de
// la base, nunca de la URL. Si el webhook todavía no llega, la función
// confirma la orden en ese momento contra Stripe (la misma lógica idempotente),
// así que «procesando» solo se ve si Stripe aún no marca el pago.
import { useEffect, useState } from 'react'
import { Logo, Surcos } from './componentes'
import { CambioIdioma, ProveedorIdioma } from './idioma'
import { useContenido, useIdioma } from './idiomaCtx'
import { leerConfirmacion, pesos, type Confirmacion } from './api'
import { descargarIcs } from './ics'
import { pixelCompra } from './pixel'

export function RonqueoGracias() {
  return <ProveedorIdioma><GraciasPagina /></ProveedorIdioma>
}

function GraciasPagina() {
  const { CONFIRMACION, UI } = useContenido()
  const { idioma } = useIdioma()
  const [sessionId] = useState(() => new URLSearchParams(location.search).get('session_id'))
  const [conf, setConf] = useState<Confirmacion | null>(sessionId ? null : { estado: 'no_encontrado' })

  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#f4f1e9'
    return () => { document.body.style.background = prev }
  }, [])

  useEffect(() => {
    if (!sessionId) return
    let vivo = true
    let intentos = 0
    const leer = () => leerConfirmacion(sessionId)
      .then(c => {
        if (!vivo) return
        setConf(c)
        if (c.estado === 'pagado') pixelCompra(c.codigo, c.cantidad, c.total)
        if (c.estado === 'procesando' && ++intentos < 20) setTimeout(leer, 2500)
      })
      .catch(() => { if (vivo) setConf({ estado: 'no_encontrado' }) })
    leer()
    return () => { vivo = false }
  }, [sessionId])

  return (
    <div className="rq rq-dia">
      <main className="rq-conf">
        <div className="rq-conf__top">
          <Logo tono="dia" etiqueta={UI.inicio} />
          <CambioIdioma />
        </div>
        <div className="rq-conf__esp" aria-hidden="true" />
        <Surcos tono="dia" />
        {conf?.estado === 'pagado' ? <Pagado c={conf} /> : (
          <>
            <p className="rq-conf__et">{conf?.estado === 'no_encontrado' ? UI.gracias.noEncontradoEt : UI.gracias.unMomento}</p>
            <p className="rq-conf__estado" role="status" aria-live="polite">
              {conf?.estado === 'no_encontrado' ? CONFIRMACION.noEncontrado : CONFIRMACION.procesando}
            </p>
            {conf?.estado === 'no_encontrado' && (
              <div className="rq-conf__acciones"><a className="rq-btn rq-btn--borde" href={`/ronqueo${idioma === 'en' ? '?lang=en' : ''}#boleto`}>{UI.gracias.regresar}</a></div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Pagado({ c }: { c: Extract<Confirmacion, { estado: 'pagado' }> }) {
  const { CONFIRMACION, EVENTO, UI } = useContenido()
  const [copiado, setCopiado] = useState(false)
  const { idioma } = useIdioma()
  useEffect(() => { document.title = UI.gracias.tituloDoc(c.codigo) }, [c.codigo, UI])

  async function compartir() {
    const texto = CONFIRMACION.compartirTexto(c.codigo)
    const url = `${location.origin}/ronqueo${idioma === 'en' ? '?lang=en' : ''}`
    if (navigator.share) {
      try { await navigator.share({ title: 'all you can eat · edición ronqueo', text: texto, url }); return } catch { /* cancelado */ }
      return
    }
    try {
      await navigator.clipboard.writeText(`${texto} ${url}`)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, '_blank', 'noopener')
    }
  }

  const [l1, l2] = CONFIRMACION.titulo(c.nombre)
  return (
    <>
      <p className="rq-conf__et">{CONFIRMACION.etiqueta}</p>
      <h1 className="rq-conf__titulo"><span>{l1}</span><span>{l2}</span></h1>
      <section className="rq-codigo" aria-label={UI.gracias.codigoAria}>
        <div className="rq-codigo__l">
          <p className="rq-codigo__et">{CONFIRMACION.tuCodigo}</p>
          <p className="rq-codigo__valor">{c.codigo}</p>
        </div>
        <div className="rq-codigo__r">
          <p>{CONFIRMACION.detalle(c.cantidad, pesos(c.total))}</p>
          <p>{CONFIRMACION.fecha}</p>
          <p>{CONFIRMACION.lugar}</p>
        </div>
      </section>
      <p className="rq-conf__correo">{CONFIRMACION.correo(c.correo)}</p>
      <div className="rq-conf__acciones">
        <button type="button" className="rq-btn rq-btn--lima" onClick={() => descargarIcs(c.codigo, EVENTO, UI)}>{CONFIRMACION.calendario}</button>
        <button type="button" className="rq-btn rq-btn--borde" onClick={compartir}>{copiado ? UI.gracias.linkCopiado : CONFIRMACION.compartir}</button>
      </div>
      <div className="rq-conf__cierre rq-filete">
        <p>{CONFIRMACION.cierre}</p>
        <img src="/ronqueo/bruma-simbolo-dia.svg" width={96} height={32} alt="" />
      </div>
    </>
  )
}
