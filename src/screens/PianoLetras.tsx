import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  APRICOT, CIRCULO_AMARILLO, CIRCULO_DURAZNO, MANO, GROTESK, MONO,
  APRICOT_FONTS_HREF, APRICOT_LOGO,
} from '../lib/apricotBrand'
import { PianoArt } from '../components/pianobar/PianoArt'

// ─────────────────────────────────────────────────────────────────────────────
// PIANO NIGHTS · portal público de letras (?letras=CODIGO, sin sesión)
//
// Lo abre el QR de la mesa. Muestra la canción que está sonando con su letra
// y se mueve sola cuando el músico pasa a la siguiente. Todo sale de
// fn_piano_live (anon): el portal no toca tablas.
//
// Habla en Apricot, no en HOG: crema, carbón, Mynerve — el flyer hecho página.
// ─────────────────────────────────────────────────────────────────────────────

interface Cancion { id: string; titulo: string; artista: string | null; autores: string | null; letra: string }
interface Live {
  venue: string; code: string; en_vivo: boolean
  proxima?: { fecha: string; titulo: string } | null
  noche?: { id: string; fecha: string; titulo: string }
  rev?: number
  actual?: Cancion | null
  tocadas?: Cancion[]
  restantes?: number
}

// Cada cuánto preguntar qué suena. Una canción dura 3–4 minutos: 6s es
// "al instante" para quien canta y sigue siendo nada para el servidor.
const POLL_MS = 6000
const TAMANOS = [18, 21, 25, 30]

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()

export function PianoLetras({ code }: { code: string }) {
  const [live, setLive] = useState<Live | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  // null = sigo lo que suena. Con id, la persona regresó a una letra que ya
  // pasó: el portal NO la jala de vuelta cuando cambia la canción, solo avisa.
  const [viendo, setViendo] = useState<string | null>(null)
  const [tam, setTam] = useState(() => {
    try { const v = Number(localStorage.getItem('apricot_letra_tam')); return TAMANOS.includes(v) ? v : TAMANOS[1] } catch { return TAMANOS[1] }
  })
  const viendoRef = useRef<string | null>(null)
  useEffect(() => { viendoRef.current = viendo }, [viendo])
  const revRef = useRef<string>('')
  const actualRef = useRef<string | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  // Identidad Apricot en la pestaña: fuentes, título y barra del navegador.
  useEffect(() => {
    document.title = 'piano nights · Apricot'
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.style.colorScheme = 'light'
    document.body.style.background = APRICOT.crema
    const meta = document.querySelector('meta[name="theme-color"]')
    const prevColor = meta?.getAttribute('content')
    meta?.setAttribute('content', APRICOT.crema)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = APRICOT_FONTS_HREF
    document.head.appendChild(link)
    return () => {
      document.head.removeChild(link)
      if (prevColor) meta?.setAttribute('content', prevColor)
    }
  }, [])

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('fn_piano_live', { p_code: code })
    setCargando(false)
    if (err) { setError(true); return }
    setError(false)
    const d = (data ?? null) as Live | null
    // Sin cambios, sin repintar: quien va leyendo no pierde su lugar.
    const firma = d ? `${d.en_vivo}:${d.rev ?? ''}:${d.actual?.id ?? ''}` : 'null'
    if (firma === revRef.current) return
    revRef.current = firma
    const nuevaActual = d?.actual?.id ?? null
    if (nuevaActual !== actualRef.current) {
      actualRef.current = nuevaActual
      // Cambió la canción y la persona seguía lo que suena: arriba, a cantar.
      if (viendoRef.current === null && nuevaActual) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setLive(d)
  }, [code])

  // Sondeo solo con la pestaña visible; al volver al teléfono, al día de inmediato.
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined
    const arrancar = () => { clearInterval(t); t = setInterval(cargar, POLL_MS) }
    const onVis = () => {
      if (document.visibilityState === 'visible') { cargar(); arrancar() } else clearInterval(t)
    }
    cargar(); arrancar()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [cargar])

  // Pantalla encendida mientras se canta: nada peor que la letra apagándose
  // a media estrofa. Si el navegador no lo soporta, no pasa nada.
  useEffect(() => {
    if (!live?.en_vivo) return
    let lock: { release: () => Promise<void> } | null = null
    const pedir = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        if (wl && document.visibilityState === 'visible') lock = await wl.request('screen')
      } catch { /* sin permiso o sin soporte */ }
    }
    pedir()
    document.addEventListener('visibilitychange', pedir)
    return () => { document.removeEventListener('visibilitychange', pedir); lock?.release().catch(() => {}) }
  }, [live?.en_vivo])

  function cambiarTam(delta: number) {
    const i = Math.min(TAMANOS.length - 1, Math.max(0, TAMANOS.indexOf(tam) + delta))
    setTam(TAMANOS[i])
    try { localStorage.setItem('apricot_letra_tam', String(TAMANOS[i])) } catch { /* incógnito */ }
  }

  function abrir(id: string | null) {
    setViendo(id)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const actual = live?.actual ?? null
  const tocadas = live?.tocadas ?? []
  const enPantalla: Cancion | null = viendo ? (tocadas.find(c => c.id === viendo) ?? actual) : actual
  const viendoPasada = !!viendo && enPantalla?.id !== actual?.id

  return (
    <div style={{ minHeight: '100dvh', background: APRICOT.crema, color: APRICOT.carbon, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Los círculos del flyer: se salen del borde, nunca estorban la letra */}
      <div aria-hidden style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', background: CIRCULO_AMARILLO, top: -190, right: -150, pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'fixed', width: 260, height: 260, borderRadius: '50%', background: CIRCULO_DURAZNO, bottom: -120, left: -110, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', flex: 1, width: '100%', boxSizing: 'border-box', maxWidth: 620, margin: '0 auto', padding: 'max(28px, env(safe-area-inset-top)) 22px 0' }}>
        <header ref={topRef} style={{ scrollMarginTop: 12 }}>
          <p style={{ fontFamily: MONO, fontSize: 12, margin: 0, letterSpacing: '0.02em' }}>
            ** NOCHES DE PIANO · {(live?.venue ?? 'APRICOT').toUpperCase()} **
          </p>
          <h1 style={{ fontFamily: MANO, fontWeight: 400, fontSize: 'clamp(58px, 17vw, 96px)', lineHeight: 0.95, margin: '10px 0 0', color: '#000' }}>
            piano nights
          </h1>
          <p style={{ fontFamily: MANO, fontSize: 'clamp(30px, 8.5vw, 46px)', lineHeight: 1, margin: '2px 0 0 4px', color: '#000' }}>
            by apricot
          </p>
        </header>

        <main style={{ marginTop: 28, paddingBottom: 40 }}>
          {cargando ? (
            <p style={{ fontFamily: MONO, fontSize: 13, opacity: 0.6 }}>AFINANDO…</p>
          ) : error && !live ? (
            <Aviso titulo="se nos fue la señal" texto="Revisa tu conexión — la letra vuelve sola en cuanto regrese." />
          ) : !live ? (
            <Aviso titulo="este QR no es de aquí" texto="No encontramos esta casa. Pídele al equipo el código de la mesa." />
          ) : !live.en_vivo ? (
            <>
              <PianoArt style={{ maxWidth: 440, margin: '4px auto 26px' }} />
              <Aviso
                titulo="hoy el piano descansa"
                texto={live.proxima
                  ? `La próxima noche de piano es el ${fechaLarga(live.proxima.fecha).toLowerCase()}. Aquí te esperamos, con la copa servida.`
                  : 'Cuando haya piano en vivo, este mismo QR te va a mostrar las letras para cantar.'}
              />
            </>
          ) : !enPantalla ? (
            <>
              <PianoArt style={{ maxWidth: 440, margin: '4px auto 26px' }} />
              <Aviso titulo="el piano está por empezar" texto="Deja el teléfono a la mano: en cuanto suene la primera canción, aquí aparece la letra." />
            </>
          ) : (
            <>
              {viendoPasada && actual && (
                <button onClick={() => abrir(null)} style={{
                  display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  background: APRICOT.carbon, color: APRICOT.crema, border: 'none', borderRadius: 999,
                  padding: '12px 18px', marginBottom: 22, cursor: 'pointer', textAlign: 'left',
                  fontFamily: GROTESK, fontSize: 14, fontWeight: 700, position: 'sticky', top: 10, zIndex: 2,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Ahora suena: {actual.titulo}</span>
                  <span aria-hidden>→</span>
                </button>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <p style={{ fontFamily: MONO, fontSize: 12, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {viendoPasada ? 'YA SONÓ' : (<><Pulso /> SONANDO AHORA</>)}
                </p>
                <div style={{ display: 'flex', gap: 6 }} aria-label="Tamaño de letra">
                  <BotonTam onClick={() => cambiarTam(-1)} disabled={tam === TAMANOS[0]} label="Letra más chica">A−</BotonTam>
                  <BotonTam onClick={() => cambiarTam(1)} disabled={tam === TAMANOS[TAMANOS.length - 1]} label="Letra más grande">A+</BotonTam>
                </div>
              </div>

              <h2 style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: 'clamp(28px, 7.5vw, 38px)', letterSpacing: '-0.015em', lineHeight: 1.1, margin: '12px 0 0', color: '#000' }}>
                {enPantalla.titulo}
              </h2>
              {enPantalla.artista && (
                <p style={{ fontFamily: MONO, fontSize: 14, margin: '8px 0 0', textTransform: 'uppercase' }}>{enPantalla.artista}</p>
              )}
              {enPantalla.autores && (
                <p style={{ fontFamily: MONO, fontSize: 11.5, margin: '6px 0 0', opacity: 0.75 }}>Letra y música: {enPantalla.autores}</p>
              )}

              <div style={{ height: 2, background: APRICOT.carbon, margin: '20px 0 24px' }} />

              {enPantalla.letra.trim() ? (
                <div style={{ fontFamily: GROTESK, fontSize: tam, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: APRICOT.tinta, overflowWrap: 'anywhere' }}>
                  {enPantalla.letra.trim()}
                </div>
              ) : (
                <p style={{ fontFamily: GROTESK, fontSize: 18, lineHeight: 1.5, opacity: 0.75 }}>
                  Esta va sin letra en pantalla — escúchala con la copa en la mano.
                </p>
              )}

              {(tocadas.length > 0 || (live.restantes ?? 0) > 0) && (
                <section style={{ marginTop: 48 }}>
                  {tocadas.length > 0 && (
                    <>
                      <p style={{ fontFamily: MONO, fontSize: 12, margin: '0 0 10px' }}>YA SONARON ESTA NOCHE</p>
                      <div style={{ borderTop: `2px solid ${APRICOT.carbon}` }}>
                        {tocadas.map(c => (
                          <button key={c.id} onClick={() => abrir(c.id)} style={{
                            display: 'flex', width: '100%', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
                            background: c.id === enPantalla.id ? 'rgba(241, 198, 53, 0.25)' : 'transparent',
                            border: 'none', borderBottom: '1px solid rgba(51,51,51,0.25)',
                            padding: '14px 4px', cursor: 'pointer', textAlign: 'left', color: APRICOT.carbon, minHeight: 48,
                          }}>
                            <span style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: 17 }}>{c.titulo}</span>
                            {c.artista && <span style={{ fontFamily: MONO, fontSize: 11, textTransform: 'uppercase', flexShrink: 0, maxWidth: '45%', textAlign: 'right' }}>{c.artista}</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {(live.restantes ?? 0) > 0 && (
                    <p style={{ fontFamily: MANO, fontSize: 26, margin: '22px 0 0', color: '#000' }}>
                      …y {live.restantes} {live.restantes === 1 ? 'canción más' : 'canciones más'} esta noche
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>

      <footer style={{ position: 'relative', borderTop: `2px solid ${APRICOT.carbon}` }}>
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '18px 22px max(22px, env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src={APRICOT_LOGO} alt="Apricot" width={96} height={27} style={{ display: 'block' }} />
          <span style={{ fontFamily: MONO, fontSize: 12 }}>VINOS Y VINILOS</span>
        </div>
      </footer>
    </div>
  )
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p style={{ fontFamily: MANO, fontSize: 34, lineHeight: 1.1, margin: 0, color: '#000' }}>{titulo}</p>
      <p style={{ fontFamily: GROTESK, fontSize: 17, lineHeight: 1.55, margin: '10px 0 0', maxWidth: 460 }}>{texto}</p>
    </div>
  )
}

function Pulso() {
  return (
    <span aria-hidden style={{ position: 'relative', width: 10, height: 10, display: 'inline-block' }}>
      <style>{'@keyframes apricot-pulso{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.6);opacity:0}}'}</style>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: APRICOT.durazno, animation: 'apricot-pulso 1.6s ease-out infinite' }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: APRICOT.durazno }} />
    </span>
  )
}

function BotonTam({ children, onClick, disabled, label }: { children: string; onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} style={{
      minWidth: 44, height: 36, borderRadius: 999, border: `2px solid ${APRICOT.carbon}`,
      background: 'transparent', color: APRICOT.carbon, fontFamily: GROTESK, fontWeight: 700, fontSize: 14,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
    }}>{children}</button>
  )
}
