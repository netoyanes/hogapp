// /pr/invitaciones — herramienta interna del equipo de PR de Bruma Records.
// Genera invitaciones al ronqueo (venta o cortesía), las descarga como PNG
// igual al diseño de Figma y lleva el registro de todo lo emitido.
//
// Acceso: link sin índice + celular y PIN (edge function ronqueo-invitaciones).
// No aparece en ninguna navegación pública.
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { zipSync } from 'fflate'
import { Logo } from './componentes'
import './pr.css'
import { svgVistaPrevia } from './vistaPrevia'
import { codigoCortesia, type DatosInvitacion, type Formato, type Tipo, type Titular } from '../../../supabase/functions/ronqueo-invitaciones/plantillas'
import {
  FIRMAS, b64aBytes, descargarBlob, guardarToken, mensajeWhatsapp, pr, tokenGuardado,
  type Invitacion, type UsuarioPr,
} from './prApi'

type FormatoSel = Formato | 'ambos'
const formatosDe = (f: FormatoSel): Formato[] => (f === 'ambos' ? ['story', 'feed'] : [f])

function useSinIndice() {
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'; m.content = 'noindex, nofollow'
    document.head.appendChild(m)
    document.title = 'invitaciones · ronqueo · bruma records'
    const prev = document.body.style.background
    document.body.style.background = '#f4f1e9'
    return () => { m.remove(); document.body.style.background = prev }
  }, [])
}

export function PrInvitaciones() {
  useSinIndice()
  const [usuario, setUsuario] = useState<UsuarioPr | null>(null)
  const [revisando, setRevisando] = useState(() => !!tokenGuardado())

  useEffect(() => {
    if (!tokenGuardado()) return
    pr<{ usuario: UsuarioPr }>({ action: 'yo' })
      .then(r => setUsuario(r.usuario))
      .catch(() => guardarToken(null))
      .finally(() => setRevisando(false))
  }, [])

  const salir = () => { guardarToken(null); setUsuario(null) }

  return (
    <div className="rq rq-dia pr">
      <header className="pr-top">
        <Logo tono="dia" href="/pr/invitaciones" />
        <div className="pr-top__t">
          <p className="pr-et">invitaciones · ronqueo · vie 20 nov</p>
          {usuario && <p className="pr-yo">{usuario.nombre} · <button type="button" className="pr-link" onClick={salir}>salir</button></p>}
        </div>
      </header>
      <main className="pr-main">
        {revisando ? <p className="pr-nota">un momento…</p> : usuario ? <Herramienta usuario={usuario} onVencida={salir} /> : <Acceso onListo={setUsuario} />}
      </main>
    </div>
  )
}

// ── Entrar / registrarse con celular + PIN ──────────────────────────────────
function Acceso({ onListo }: { onListo: (u: UsuarioPr) => void }) {
  const uid = useId()
  const [paso, setPaso] = useState<'entrar' | 'registro'>('entrar')
  const [telefono, setTelefono] = useState('')
  const [pin, setPin] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null); setEnviando(true)
    try {
      if (paso === 'entrar') {
        const r = await pr<{ token?: string; usuario?: UsuarioPr; nuevo?: boolean }>({ action: 'login', telefono, pin })
        if (r.nuevo) { setPaso('registro'); setError(null); return }
        guardarToken(r.token!); onListo(r.usuario!)
      } else {
        const r = await pr<{ token: string; usuario: UsuarioPr }>({ action: 'registro', telefono, pin, nombre })
        guardarToken(r.token); onListo(r.usuario)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally { setEnviando(false) }
  }

  return (
    <form className="pr-acceso" onSubmit={enviar}>
      <h1 className="pr-h1">{paso === 'entrar' ? 'entra con tu celular.' : 'primera vez aquí.'}</h1>
      <p className="pr-nota">{paso === 'entrar'
        ? 'herramienta del equipo de pr de bruma records. si es tu primera vez, te pedimos tu nombre y creas tu pin.'
        : 'ese celular no está registrado. escribe tu nombre y crea un pin de 4 a 6 números.'}</p>
      {paso === 'registro' && (
        <div className="pr-campo">
          <label htmlFor={`${uid}-n`}>tu nombre</label>
          <input id={`${uid}-n`} value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="name" required />
        </div>
      )}
      <div className="pr-campo">
        <label htmlFor={`${uid}-t`}>celular</label>
        <input id={`${uid}-t`} value={telefono} onChange={e => setTelefono(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="669 000 0000" required />
      </div>
      <div className="pr-campo">
        <label htmlFor={`${uid}-p`}>{paso === 'entrar' ? 'pin' : 'crea tu pin'}</label>
        <input id={`${uid}-p`} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" autoComplete={paso === 'entrar' ? 'current-password' : 'new-password'} placeholder="••••" required />
      </div>
      {error && <p className="pr-error" role="alert">{error}</p>}
      <button className="rq-btn rq-btn--lima" type="submit" disabled={enviando}>{enviando ? 'un momento…' : paso === 'entrar' ? 'entrar' : 'crear mi acceso'}</button>
      {paso === 'registro' && <button type="button" className="pr-link" onClick={() => setPaso('entrar')}>ya tengo pin</button>}
    </form>
  )
}

// ── Formulario + vista previa + registro ────────────────────────────────────
function Herramienta({ usuario, onVencida }: { usuario: UsuarioPr; onVencida: () => void }) {
  const uid = useId()
  const [tipo, setTipo] = useState<Tipo>('venta')
  const [nombre, setNombre] = useState('')
  const [titular, setTitular] = useState<Titular>('invitada')
  const [acompanantes, setAcompanantes] = useState(1)
  const [firma, setFirma] = useState<string>('bruma records')
  const [formato, setFormato] = useState<FormatoSel>('ambos')
  const [generando, setGenerando] = useState<string | null>(null)
  const [hecha, setHecha] = useState<Invitacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  const nombreLimpio = nombre.trim().toLocaleLowerCase('es-MX')
  const datos = useMemo<Omit<DatosInvitacion, 'formato'>>(() => ({
    tipo, nombre: nombreLimpio || (tipo === 'venta' ? 'nombre' : 'nombre'), firma,
    codigo: tipo === 'venta' ? 'RONQUEO-XX' : 'CORTESÍA-XX', titular, acompanantes,
  }), [tipo, nombreLimpio, firma, titular, acompanantes])

  const manejar = useCallback((e: unknown) => {
    const x = e as Error & { status?: number }
    if (x.status === 401) onVencida()
    setError(x.message)
  }, [onVencida])

  async function descargar(inv: Invitacion, formatos: Formato[]) {
    const pngs: { archivo: string; bytes: Uint8Array }[] = []
    for (const f of formatos) {
      setGenerando(`renderizando ${f}…`)
      const r = await pr<{ png: string; archivo: string }>({ action: 'png', codigo: inv.codigo, formato: f })
      pngs.push({ archivo: r.archivo, bytes: b64aBytes(r.png) })
    }
    if (pngs.length === 1) {
      descargarBlob(new Blob([pngs[0].bytes as BlobPart], { type: 'image/png' }), pngs[0].archivo)
    } else {
      const zip = zipSync(Object.fromEntries(pngs.map(p => [p.archivo, [p.bytes, { level: 0 }]])))
      descargarBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), pngs[0].archivo.replace(/-(story|feed)\.png$/, '.zip'))
    }
  }

  async function generar(e: FormEvent) {
    e.preventDefault()
    if (!nombreLimpio) { setError('escribe el nombre como saludo.'); document.getElementById(`${uid}-nombre`)?.focus(); return }
    setError(null); setHecha(null); setGenerando('creando el código…')
    try {
      const { invitacion } = await pr<{ invitacion: Invitacion }>({
        action: 'emitir', tipo, nombre: nombreLimpio, titular, acompanantes, firma, formato,
      })
      setHecha(invitacion)
      setRecarga(n => n + 1)
      await descargar(invitacion, formatosDe(formato))
    } catch (err) { manejar(err) } finally { setGenerando(null) }
  }

  return (
    <>
      <section className="pr-grid" aria-label="nueva invitación">
        <form className="pr-form" onSubmit={generar}>
          <h1 className="pr-h1">nueva invitación.</h1>

          <fieldset className="pr-set">
            <legend>tipo</legend>
            <div className="pr-seg">
              {(['venta', 'cortesia'] as Tipo[]).map(t => (
                <label key={t} className="pr-op"><input type="radio" name={`${uid}-tipo`} checked={tipo === t} onChange={() => setTipo(t)} />
                  <span>{t === 'venta' ? 'venta · invitado estratégico' : 'cortesía · influencer'}</span></label>
              ))}
            </div>
          </fieldset>

          <div className="pr-campo">
            <label htmlFor={`${uid}-nombre`}>nombre como saludo</label>
            <input id={`${uid}-nombre`} value={nombre} onChange={e => setNombre(e.target.value)} maxLength={40} placeholder={tipo === 'venta' ? 'magui' : 'walter y william'} autoComplete="off" />
            <p className="pr-ayuda">va en minúsculas, como en el diseño. la coma la ponemos nosotros.</p>
          </div>

          {tipo === 'cortesia' && (
            <>
              <fieldset className="pr-set">
                <legend>titular</legend>
                <div className="pr-seg">
                  {(['invitada', 'invitado', 'invitados'] as Titular[]).map(t => (
                    <label key={t} className="pr-op"><input type="radio" name={`${uid}-tit`} checked={titular === t} onChange={() => setTitular(t)} />
                      <span>{t === 'invitados' ? 'son nuestros invitados' : `eres nuestr${t === 'invitada' ? 'a' : 'o'} ${t}`}</span></label>
                  ))}
                </div>
              </fieldset>
              <div className="pr-campo">
                <span className="pr-label" id={`${uid}-acl`}>acompañantes</span>
                <div className="pr-stepper" role="group" aria-labelledby={`${uid}-acl`}>
                  <button type="button" aria-label="quitar un acompañante" disabled={acompanantes <= 0} onClick={() => setAcompanantes(a => a - 1)}>–</button>
                  <output aria-live="polite">{acompanantes}</output>
                  <button type="button" aria-label="agregar un acompañante" disabled={acompanantes >= 10} onClick={() => setAcompanantes(a => a + 1)}>+</button>
                </div>
                <p className="pr-ayuda">sello: «{acompanantes > 0 ? `tú + ${acompanantes}` : 'solo tú'}» · código en la imagen: «{codigoCortesia(nombreLimpio || 'nombre', acompanantes)}»</p>
              </div>
            </>
          )}

          <fieldset className="pr-set">
            <legend>firma</legend>
            <div className="pr-seg">
              {FIRMAS.map(f => (
                <label key={f} className="pr-op"><input type="radio" name={`${uid}-firma`} checked={firma === f} onChange={() => setFirma(f)} /><span>— {f}</span></label>
              ))}
            </div>
          </fieldset>

          <fieldset className="pr-set">
            <legend>formato</legend>
            <div className="pr-seg">
              {(['story', 'feed', 'ambos'] as FormatoSel[]).map(f => (
                <label key={f} className="pr-op"><input type="radio" name={`${uid}-fmt`} checked={formato === f} onChange={() => setFormato(f)} />
                  <span>{f === 'story' ? 'story 1080×1920' : f === 'feed' ? 'feed 1080×1350' : 'ambos (.zip)'}</span></label>
              ))}
            </div>
          </fieldset>

          {error && <p className="pr-error" role="alert">{error}</p>}
          <button className="rq-btn rq-btn--lima pr-generar" type="submit" disabled={!!generando}>{generando ?? 'generar'}</button>
          <p className="pr-ayuda">«generar» crea el código ({tipo === 'venta' ? 'RONQUEO-XX' : 'CORTESÍA-XX'}), lo guarda en el registro y descarga el png. cada código es único.</p>

          {hecha && <Resultado inv={hecha} onDescargar={() => descargar(hecha, formatosDe(hecha.formato)).catch(manejar).finally(() => setGenerando(null))} />}
        </form>

        <VistaPrevia datos={datos} formatos={formatosDe(formato)} codigoFinal={hecha?.codigo} />
      </section>

      <Registro recarga={recarga} usuario={usuario} onError={manejar} onDescargar={(inv, f) => descargar(inv, f).catch(manejar).finally(() => setGenerando(null))} />
    </>
  )
}

function Resultado({ inv, onDescargar }: { inv: Invitacion; onDescargar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="pr-hecha" role="status">
      <p className="pr-et">invitación generada</p>
      <p className="pr-hecha__codigo">{inv.codigo}</p>
      <p className="pr-nota">{inv.nombre} · {inv.tipo === 'venta' ? 'venta' : `cortesía · tú + ${inv.acompanantes}`} · — {inv.firma}</p>
      <div className="pr-acciones">
        <button type="button" className="rq-btn rq-btn--borde" onClick={onDescargar}>descargar otra vez</button>
        <button type="button" className="rq-btn rq-btn--borde" onClick={async () => { await navigator.clipboard.writeText(mensajeWhatsapp(inv)); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}>
          {copiado ? 'mensaje copiado' : 'copiar mensaje de whatsapp'}
        </button>
      </div>
    </div>
  )
}

function VistaPrevia({ datos, formatos, codigoFinal }: { datos: Omit<DatosInvitacion, 'formato'>; formatos: Formato[]; codigoFinal?: string }) {
  const [imgs, setImgs] = useState<Record<string, string>>({})
  const clave = JSON.stringify({ ...datos, formatos, codigoFinal })
  useEffect(() => {
    let vivo = true
    const t = setTimeout(async () => {
      const r: Record<string, string> = {}
      for (const f of formatos) r[f] = await svgVistaPrevia({ ...datos, codigo: codigoFinal ?? datos.codigo, formato: f })
      if (vivo) setImgs(r)
    }, 150)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return (
    <section className="pr-previa" aria-label="vista previa">
      <p className="pr-et">vista previa · así sale el png</p>
      <div className={'pr-previa__imgs' + (formatos.length > 1 ? ' pr-previa__imgs--2' : '')}>
        {formatos.map(f => (
          <figure key={f}>
            {imgs[f] ? <img src={imgs[f]} alt={`vista previa ${f}`} /> : <div className="pr-previa__cargando" style={{ aspectRatio: f === 'story' ? '1080 / 1920' : '1080 / 1350' }} />}
            <figcaption>{f === 'story' ? 'story · 1080×1920' : 'feed · 1080×1350'}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

function Registro({ recarga, usuario, onError, onDescargar }: {
  recarga: number; usuario: UsuarioPr; onError: (e: unknown) => void; onDescargar: (inv: Invitacion, f: Formato[]) => void
}) {
  const uid = useId()
  const [lista, setLista] = useState<Invitacion[] | null>(null)
  const [q, setQ] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)
  const [extra, setExtra] = useState(0)

  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => {
      pr<{ invitaciones: Invitacion[] }>({ action: 'lista', q }).then(r => { if (vivo) setLista(r.invitaciones) }).catch(onError)
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [q, recarga, extra, onError])

  async function anular(inv: Invitacion) {
    if (!confirm(`¿anular ${inv.codigo} (${inv.nombre})? el código ya no se podrá descargar ni volver a usar.`)) return
    try { await pr({ action: 'anular', codigo: inv.codigo }); setExtra(n => n + 1) } catch (e) { onError(e) }
  }
  async function copiar(inv: Invitacion) {
    await navigator.clipboard.writeText(mensajeWhatsapp(inv))
    setCopiado(inv.codigo); setTimeout(() => setCopiado(null), 2000)
  }

  const fecha = (s: string) => new Date(s).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mazatlan' })
  const activas = (lista ?? []).filter(i => !i.anulada_at)

  return (
    <section className="pr-registro" aria-labelledby={`${uid}-t`}>
      <div className="pr-registro__enc">
        <h2 id={`${uid}-t`} className="pr-h2">emitidas.</h2>
        <p className="pr-nota">{activas.filter(i => i.tipo === 'venta').length} de venta · {activas.filter(i => i.tipo === 'cortesia').length} de cortesía · tú eres {usuario.nombre}</p>
      </div>
      <div className="pr-campo pr-buscar">
        <label htmlFor={`${uid}-q`}>buscar por nombre o código</label>
        <input id={`${uid}-q`} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="magui, RONQUEO-36…" />
      </div>
      {lista === null ? <p className="pr-nota">cargando…</p> : lista.length === 0 ? <p className="pr-nota">todavía no hay invitaciones{q ? ' con esa búsqueda' : ''}.</p> : (
        <div className="pr-tabla-w">
          <table className="pr-tabla">
            <thead><tr><th>código</th><th>nombre</th><th>tipo</th><th>firma</th><th>formato</th><th>generó</th><th>fecha</th><th><span className="rq-sr">acciones</span></th></tr></thead>
            <tbody>
              {lista.map(inv => (
                <tr key={inv.id} className={inv.anulada_at ? 'pr-anulada' : undefined}>
                  <td className="pr-mono">{inv.codigo}{inv.anulada_at && <span className="pr-badge">anulada</span>}</td>
                  <td>{inv.nombre}</td>
                  <td>{inv.tipo === 'venta' ? 'venta' : `cortesía · +${inv.acompanantes}`}</td>
                  <td>— {inv.firma}</td>
                  <td>{inv.formato}</td>
                  <td>{inv.creado_por_nombre ?? '—'}</td>
                  <td className="pr-nowrap">{fecha(inv.created_at)}</td>
                  <td className="pr-nowrap">
                    {!inv.anulada_at && (
                      <>
                        {formatosDe(inv.formato).map(f => (
                          <button key={f} type="button" className="pr-link" onClick={() => onDescargar(inv, [f])}>{f}</button>
                        ))}
                        <button type="button" className="pr-link" onClick={() => copiar(inv)}>{copiado === inv.codigo ? 'copiado' : 'whatsapp'}</button>
                        <button type="button" className="pr-link pr-link--peligro" onClick={() => anular(inv)}>anular</button>
                      </>
                    )}
                    {inv.anulada_at && <span className="pr-nota">{inv.anulada_por}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
