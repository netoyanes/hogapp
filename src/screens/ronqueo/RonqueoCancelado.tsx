// Aviso de evento cancelado. Reemplaza el landing (/ronqueo), la confirmación
// (/ronqueo/gracias) y la herramienta de PR (/pr/invitaciones): el ronqueo se
// canceló y ya no se vende. El código del landing sigue en el repo por si se
// reprograma: basta con volver a apuntar las rutas en App.tsx.
import { useEffect } from 'react'
import { Logo } from './componentes'

export function RonqueoCancelado() {
  useEffect(() => {
    document.title = 'evento cancelado · bruma records'
    const prev = document.body.style.background
    document.body.style.background = '#161714'
    return () => { document.body.style.background = prev }
  }, [])

  return (
    <div className="rq">
      <header className="rq-nav"><Logo tono="noche" /></header>
      <main className="rq-sec rq-cancelado">
        <p className="rq-pill rq-pill--lima">evento cancelado</p>
        <h1 className="rq-h2">el ronqueo<br />se cancela.</h1>
        <p className="rq-cancelado__texto">
          cancelamos el all you can eat · edición ronqueo. si compraste un boleto, nos pondremos en contacto contigo.
        </p>
        <p className="rq-cancelado__texto" lang="en">
          the all you can eat · ronqueo edition has been cancelled. if you bought a ticket, we'll get in touch with you.
        </p>
        <a className="rq-btn rq-btn--borde" href="https://instagram.com/bruma_rec" target="_blank" rel="noopener noreferrer">
          @bruma_rec ↗
        </a>
      </main>
    </div>
  )
}
