// /ronqueo — landing público de «All You Can Eat · Edición Ronqueo» de Bruma
// Records. Página en modo Noche; la sección Boleto y la barra fija van en Día.
// El cobro es Stripe Checkout con sesión creada en el servidor (edge function
// ronqueo-tickets); aquí solo mandamos cantidad + datos y redirigimos.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { R, Logo, Surcos } from './componentes'
import {
  BARRA_MOVIL, BOLETO, CIERRE, DATOS, EVENTO, FOOTER, HERO, ITINERARIO, LA_NOCHE, NAV, PREGUNTAS, QUIEN,
} from './contenido'
import { abrirCheckout, liberarReserva, pedirCupo, pesos, type Cupo } from './api'

const FOTO_ANCHO = '/ronqueo/img/atun-ancho-640.webp 640w, /ronqueo/img/atun-ancho-960.webp 960w, /ronqueo/img/atun-ancho-1440.webp 1440w, /ronqueo/img/atun-ancho-2000.webp 2000w'
const FOTO_ALTO = '/ronqueo/img/atun-alto-400.webp 400w, /ronqueo/img/atun-alto-800.webp 800w, /ronqueo/img/atun-alto-1200.webp 1200w'

function usePaginaNoche() {
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#161714'
    // main.tsx pone el título de HOG APP; aquí va el del evento
    document.title = 'all you can eat · edición ronqueo · bruma records'
    return () => { document.body.style.background = prev }
  }, [])
}

export function Ronqueo() {
  usePaginaNoche()
  const [cupo, setCupo] = useState<Cupo | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [boletoVisible, setBoletoVisible] = useState(false)
  const compraRef = useRef<HTMLElement>(null)

  // Regreso desde Stripe sin pagar: liberamos los lugares que se apartaron
  const [cancelado] = useState(() => new URLSearchParams(location.search).get('cancelado'))
  useEffect(() => {
    if (!cancelado) return
    liberarReserva(cancelado).catch(() => { /* si falla, la sesión expira sola en 30 min */ })
      .finally(() => {
        pedirCupo().then(setCupo).catch(() => {})
        const url = new URL(location.href)
        url.searchParams.delete('cancelado')
        history.replaceState({}, '', url.pathname + url.search + url.hash)
      })
  }, [cancelado])

  useEffect(() => {
    let vivo = true
    const cargar = () => pedirCupo().then(c => { if (vivo) setCupo(c) }).catch(() => {})
    cargar()
    const t = setInterval(cargar, 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  // La barra fija se esconde cuando la tarjeta de compra ya está a la vista
  useEffect(() => {
    const el = compraRef.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setBoletoVisible(e.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Escape cierra el menú mobile
  useEffect(() => {
    if (!menuAbierto) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAbierto(false) }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [menuAbierto])

  const agotado = cupo !== null && cupo.restantes <= 0

  return (
    <div className="rq">
      <a className="rq-saltar" href="#boleto">ir a comprar boleto</a>

      <header className="rq-nav">
        <Logo tono="noche" />
        <nav aria-label="secciones">
          <ul className="rq-nav__links">
            {NAV.links.map(l => <li key={l.href}><a className="rq-nav__link" href={l.href}>{l.texto}</a></li>)}
            <li><a className="rq-btn rq-btn--lima" href="#boleto">{NAV.cta}</a></li>
          </ul>
          <button
            className="rq-nav__menu" type="button" aria-expanded={menuAbierto} aria-controls="rq-menu"
            aria-label={menuAbierto ? 'cerrar menú' : 'abrir menú'} onClick={() => setMenuAbierto(v => !v)}
          >
            <span /><span /><span />
          </button>
          {menuAbierto && (
            <div className="rq-nav__panel" id="rq-menu">
              {NAV.links.map(l => <a key={l.href} href={l.href} onClick={() => setMenuAbierto(false)}>{l.texto}</a>)}
            </div>
          )}
        </nav>
      </header>

      <main>
        <section className="rq-hero" aria-labelledby="rq-titulo">
          <picture className="rq-hero__foto">
            <source media="(min-width: 900px)" type="image/webp" srcSet={FOTO_ANCHO} sizes="100vw" />
            <source type="image/webp" srcSet={FOTO_ALTO} sizes="100vw" />
            <img src="/ronqueo/img/atun-ancho-1440.jpg" alt={HERO.fotoAlt} fetchPriority="high" decoding="async" />
          </picture>
          <p className="rq-pill rq-pill--lima"><R t={HERO.pill} /></p>
          <img className="rq-hero__sello" src="/ronqueo/sello-ronqueo.svg" width={279} height={279} alt={HERO.sello.join(' · ')} />
          <div className="rq-hero__texto">
            <h1 id="rq-titulo" className="rq-hero__titulo">
              {HERO.titulo.map(l => <span key={l}>{l}</span>)}
            </h1>
            <p className="rq-hero__bajada"><R t={HERO.bajada} /></p>
            <div className="rq-hero__ctas">
              <a className="rq-btn rq-btn--lima" href="#boleto">{HERO.ctaPrincipal}</a>
              <a className="rq-btn rq-btn--borde" href="#la-noche">{HERO.ctaSecundario}</a>
            </div>
          </div>
        </section>

        <dl className="rq-datos" aria-label="datos del evento">
          {DATOS.map(d => (
            <div key={d.etiqueta}><dt>{d.etiqueta}</dt><dd><R t={d.valor} /></dd></div>
          ))}
        </dl>

        <section className="rq-sec rq-noche" id="la-noche" aria-labelledby="rq-noche-t">
          <div className="rq-noche__enc">
            <h2 id="rq-noche-t" className="rq-h2">{LA_NOCHE.titulo.map(l => <span key={l} style={{ display: 'block' }}>{l}</span>)}</h2>
            <p className="rq-noche__indice" aria-hidden="true">{LA_NOCHE.indice}</p>
          </div>
          <ol className="rq-momentos">
            {LA_NOCHE.momentos.map(m => (
              <li className="rq-momento" key={m.num} id={m.id}>
                {m.foto ? (
                  <div className="rq-momento__foto">
                    <img srcSet={FOTO_ANCHO} sizes="(min-width: 900px) 30vw, 100vw" src="/ronqueo/img/atun-ancho-640.webp" alt="" loading="lazy" decoding="async" />
                  </div>
                ) : (
                  <div className="rq-momento__foto rq-momento__foto--vacia" aria-hidden="true"><p>{m.placeholderFoto}</p></div>
                )}
                <div className="rq-momento__t rq-filete">
                  <span className="rq-momento__num" aria-hidden="true">{m.num}</span>
                  <div className="rq-momento__c">
                    <h3 className="rq-momento__titulo">{m.titulo}</h3>
                    <p className="rq-momento__texto"><R t={m.texto} /></p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rq-sec rq-itin" aria-labelledby="rq-itin-t">
          <h2 id="rq-itin-t" className="rq-h2"><R t={ITINERARIO.titulo} /></h2>
          <Surcos tono="noche" />
          <div className="rq-itin__esp" aria-hidden="true" />
          <ol className="rq-itin__lista">
            {ITINERARIO.horario.map(h => (
              <li className="rq-itin__fila rq-filete" key={h.hora}>
                <p className="rq-itin__hora">{h.hora}</p>
                <p className="rq-itin__que">{h.que}</p>
                <p className="rq-itin__detalle">{h.detalle}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="rq-sec rq-quien" id="quien" aria-labelledby="rq-quien-t">
          <h2 id="rq-quien-t" className="rq-h2"><R t={QUIEN.titulo} /></h2>
          <div className="rq-quien__esp" aria-hidden="true" />
          <ul className="rq-fichas">
            {QUIEN.fichas.map(f => (
              <li className="rq-ficha rq-filete" key={f.nombre}>
                <p className="rq-ficha__rol">{f.rol}</p>
                <h3 className="rq-ficha__nombre">{f.nombre}</h3>
                <p className="rq-ficha__texto"><R t={f.texto} /></p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rq-sec rq-boleto rq-dia" id="boleto" aria-labelledby="rq-boleto-t">
          <div className="rq-boleto__grid">
            <div className="rq-boleto__izq">
              <p className="rq-pill rq-pill--verde">{BOLETO.pill}</p>
              <h2 id="rq-boleto-t" className="rq-precio"><span className="rq-sr">boleto: </span>{BOLETO.precio}</h2>
              <p className="rq-porpersona">
                <span>{BOLETO.porPersona}</span>
                {cupo && <span className="rq-quedan" aria-live="polite">{agotado ? BOLETO.compra.agotado : `quedan ${cupo.restantes} de ${cupo.cupo} lugares`}</span>}
              </p>
              <ul className="rq-incluye">
                {BOLETO.incluye.map((t, i) => (
                  <li className="rq-incluye__fila rq-filete" key={i}>
                    <span className="rq-incluye__et">incluye</span>
                    <span className="rq-incluye__tx"><R t={t} /></span>
                  </li>
                ))}
              </ul>
            </div>
            <Compra cupo={cupo} agotado={agotado} cancelado={!!cancelado} refTarjeta={compraRef} onAgotado={r => setCupo(c => c && { ...c, restantes: r })} />
          </div>
          <p className="rq-boleto__nota"><R t={BOLETO.nota} /></p>
        </section>

        <section className="rq-sec rq-preg" aria-labelledby="rq-preg-t">
          <h2 id="rq-preg-t" className="rq-h2"><R t={PREGUNTAS.titulo} /></h2>
          <div className="rq-preg__esp" aria-hidden="true" />
          <dl className="rq-preg__lista">
            {PREGUNTAS.lista.map((q, i) => (
              <div className="rq-preg__fila rq-filete" key={i}>
                <dt className="rq-preg__p"><R t={q.p} /></dt>
                <dd className="rq-preg__r"><R t={q.r} /></dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rq-sec rq-cierre" aria-label="cierre">
          <p className="rq-cierre__titulo"><R t={CIERRE.titulo} /></p>
          <a className="rq-btn rq-btn--oscuro" href="#boleto">{CIERRE.cta}</a>
        </section>
      </main>

      <footer className="rq-footer">
        <Logo tono="noche" />
        <address className="rq-footer__info" style={{ fontStyle: 'normal' }}>
          {FOOTER.lineas.map(l => <span key={l}>{l}</span>)}
        </address>
      </footer>

      <div className="rq-barra rq-dia" data-oculta={boletoVisible} aria-hidden={boletoVisible || undefined}>
        <div className="rq-barra__precio">
          <span className="rq-barra__monto">{BARRA_MOVIL.precio}</span>
          <span className="rq-barra__lugares">{cupo ? (agotado ? 'agotado' : `${cupo.restantes} lugares`) : `${EVENTO.cupo} lugares`}</span>
        </div>
        <a className="rq-btn rq-btn--lima" href="#boleto" tabIndex={boletoVisible ? -1 : undefined}>{BARRA_MOVIL.cta}</a>
      </div>
    </div>
  )
}

// ── Tarjeta de compra ───────────────────────────────────────────────────────
type Errores = Partial<Record<'nombre' | 'correo' | 'whatsapp', string>>

function Compra({ cupo, agotado, cancelado, refTarjeta, onAgotado }: {
  cupo: Cupo | null; agotado: boolean; cancelado: boolean
  refTarjeta: React.RefObject<HTMLElement | null>; onAgotado: (restantes: number) => void
}) {
  const uid = useId()
  const max = Math.max(1, Math.min(cupo?.maxPorCompra ?? EVENTO.maxPorCompra, cupo?.restantes ?? EVENTO.maxPorCompra))
  const [cantidad, setCantidad] = useState(2)
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(cancelado ? BOLETO.compra.cancelado : null)

  const cant = Math.min(cantidad, max)
  const total = cant * EVENTO.precio
  const bloqueado = agotado || enviando

  function validar(): Errores {
    const e: Errores = {}
    if (nombre.trim().length < 2) e.nombre = 'escribe el nombre que va en la lista'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.trim())) e.correo = 'revisa tu correo: ahí llega tu código'
    if (whatsapp.replace(/\D/g, '').length < 10) e.whatsapp = 'tu whatsapp a 10 dígitos'
    return e
  }

  async function pagar(ev: FormEvent) {
    ev.preventDefault()
    const e = validar()
    setErrores(e)
    if (Object.keys(e).length) {
      document.getElementById(`${uid}-${Object.keys(e)[0]}`)?.focus()
      return
    }
    setEnviando(true)
    setAviso(null)
    try {
      const { url } = await abrirCheckout({ cantidad: cant, nombre: nombre.trim(), correo: correo.trim(), whatsapp: whatsapp.trim() })
      location.href = url
    } catch (err) {
      const x = err as Error & { restantes?: number }
      if (typeof x.restantes === 'number') {
        onAgotado(x.restantes)
        setAviso(x.restantes > 0 ? `solo quedan ${x.restantes} lugares. ajusta la cantidad.` : BOLETO.compra.agotado)
      } else {
        setAviso('no pudimos abrir el pago. intenta otra vez en un momento.')
      }
      setEnviando(false)
    }
  }

  const campo = (k: 'nombre' | 'correo' | 'whatsapp', valor: string, set: (v: string) => void, extra: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="rq-campo">
      <label htmlFor={`${uid}-${k}`}>{BOLETO.compra.campos[k]}</label>
      <input
        id={`${uid}-${k}`} value={valor} onChange={e => set(e.target.value)} required disabled={agotado}
        aria-invalid={errores[k] ? true : undefined} aria-describedby={errores[k] ? `${uid}-${k}-err` : undefined} {...extra}
      />
      {errores[k] && <p className="rq-campo__error" id={`${uid}-${k}-err`}>{errores[k]}</p>}
    </div>
  )

  return (
    <section className="rq-compra" ref={refTarjeta} aria-labelledby={`${uid}-t`}>
      <h3 className="rq-compra__titulo" id={`${uid}-t`}>{BOLETO.compra.titulo}</h3>
      <form onSubmit={pagar} noValidate style={{ display: 'contents' }}>
        <div className="rq-compra__fila rq-compra__fila--cant">
          <span className="rq-compra__lugares" id={`${uid}-cant`}>{BOLETO.compra.lugares}</span>
          <div
            className="rq-selector" role="group" aria-labelledby={`${uid}-cant`}
            onKeyDown={e => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setCantidad(Math.min(max, cant + 1)) }
              if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setCantidad(Math.max(1, cant - 1)) }
            }}
          >
            <button type="button" aria-label="quitar un lugar" disabled={bloqueado || cant <= 1} onClick={() => setCantidad(cant - 1)}>–</button>
            <output aria-live="polite" aria-label={`${cant} ${cant === 1 ? 'lugar' : 'lugares'}`}>{cant}</output>
            <button type="button" aria-label="agregar un lugar" disabled={bloqueado || cant >= max} onClick={() => setCantidad(cant + 1)}>+</button>
          </div>
        </div>
        <div className="rq-compra__fila rq-compra__fila--total">
          <div className="rq-total__l">
            <span className="rq-total__et">{BOLETO.compra.total}</span>
            <span className="rq-total__mult">{cant} × {pesos(EVENTO.precio)} {EVENTO.moneda}</span>
          </div>
          <p className="rq-total__monto" aria-live="polite">{pesos(total)}</p>
        </div>
        {campo('nombre', nombre, setNombre, { autoComplete: 'name', placeholder: 'como te anotamos' })}
        {campo('correo', correo, setCorreo, { type: 'email', autoComplete: 'email', inputMode: 'email', placeholder: 'tu@correo.com' })}
        {campo('whatsapp', whatsapp, setWhatsapp, { type: 'tel', autoComplete: 'tel', inputMode: 'tel', placeholder: '669 000 0000' })}
        {aviso && <p className="rq-compra__aviso" role="status">{aviso}</p>}
        <button className="rq-btn rq-btn--lima rq-compra__pagar" type="submit" disabled={bloqueado} aria-disabled={bloqueado}>
          {agotado ? BOLETO.compra.agotado : enviando ? BOLETO.compra.cargando : `${BOLETO.compra.pagar} ${pesos(total)}`}
        </button>
      </form>
      <p className="rq-compra__legal">{BOLETO.compra.legal}</p>
    </section>
  )
}
