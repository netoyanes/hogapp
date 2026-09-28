import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { APRICOT, MANO, GROTESK, MONO } from '../../lib/apricotBrand'

// ─────────────────────────────────────────────────────────────────────────────
// PIDE UNA CANCIÓN — la parte participativa del portal del QR.
//
// La persona pone nombre y celular (una vez: se recuerdan en su teléfono),
// aparta una canción del repertorio o sugiere una que no está. Con el celular
// entra a la lista de clientes de Apricot (guests) — por eso se pide.
//
// Todo pasa por RPCs anon (fn_piano_repertorio, fn_piano_pedir,
// fn_piano_mis_peticiones); el portal no toca tablas.
// ─────────────────────────────────────────────────────────────────────────────

interface Opcion { id: string; titulo: string; artista: string | null; pedidas: number }
interface Mia { id: string; estado: 'pendiente' | 'aceptada' | 'tocada' | 'descartada'; titulo: string; artista: string | null; sugerencia: boolean }

const ESTADO: Record<Mia['estado'], string> = {
  pendiente:  'en espera',
  aceptada:   '¡va en la lista!',
  tocada:     'ya sonó',
  descartada: 'esta vez no',
}

const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* incógnito */ } }
const leer = (k: string) => { try { return localStorage.getItem(k) ?? '' } catch { return '' } }

// El mismo id de visitante que usan los landings de reservas: una persona,
// un id por teléfono, aunque cambie de QR.
function visitanteId(): string {
  let id = leer('hog_visitor')
  if (!id) { id = crypto.randomUUID(); guardar('hog_visitor', id) }
  return id
}

export function PedirCancion({ code, enVivo }: { code: string; enVivo: boolean }) {
  const [nombre, setNombre] = useState(() => leer('apricot_nombre'))
  const [telefono, setTelefono] = useState(() => leer('apricot_tel'))
  const [registrado, setRegistrado] = useState(() => !!leer('apricot_nombre') && !!leer('apricot_tel'))
  const [abierta, setAbierta] = useState<boolean | null>(null)
  const [opciones, setOpciones] = useState<Opcion[]>([])
  const [mias, setMias] = useState<Mia[]>([])
  const [busca, setBusca] = useState('')
  const [sugerencia, setSugerencia] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null)

  const cargar = useCallback(async () => {
    const [{ data: rep }, { data: mis }] = await Promise.all([
      supabase.rpc('fn_piano_repertorio', { p_code: code }),
      supabase.rpc('fn_piano_mis_peticiones', { p_code: code, p_visitante: visitanteId(), p_telefono: leer('apricot_tel') || null }),
    ])
    const r = rep as { abierta: boolean; canciones: Opcion[] } | null
    setAbierta(r?.abierta ?? false)
    setOpciones(r?.canciones ?? [])
    setMias((mis ?? []) as Mia[])
  }, [code])

  // Las peticiones cambian de estado cuando el staff las acepta o cuando
  // suenan: se refrescan cada 15 s mientras la pestaña esté visible.
  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 15000)
    return () => clearInterval(t)
  }, [cargar])

  async function pedir(cancion: string | null, texto: string | null) {
    if (enviando) return
    const n = nombre.trim(), t = telefono.trim()
    if (n.length < 2 || t.replace(/\D/g, '').length < 10) {
      setRegistrado(false)
      setAviso({ texto: 'Primero dinos tu nombre y celular.', ok: false })
      return
    }
    setEnviando(true); setAviso(null)
    const { data, error } = await supabase.rpc('fn_piano_pedir', {
      p_code: code, p_visitante: visitanteId(), p_nombre: n, p_telefono: t, p_cancion: cancion, p_sugerencia: texto,
    })
    setEnviando(false)
    const r = (data ?? null) as { ok?: boolean; error?: string } | null
    if (error || !r?.ok) { setAviso({ texto: r?.error ?? 'No se pudo enviar. Intenta otra vez.', ok: false }); return }
    guardar('apricot_nombre', n); guardar('apricot_tel', t)
    setRegistrado(true); setBusca(''); setSugerencia('')
    setAviso({ texto: cancion ? 'Apartada. El músico ya la tiene en su lista.' : 'Sugerencia enviada. Si la sabe, la toca.', ok: true })
    await cargar()
  }

  if (abierta === null) return null
  if (!abierta) return null

  const q = busca.trim().toLowerCase()
  const lista = q
    ? opciones.filter(o => o.titulo.toLowerCase().includes(q) || (o.artista ?? '').toLowerCase().includes(q)).slice(0, 8)
    : opciones.filter(o => o.pedidas > 0).sort((a, b) => b.pedidas - a.pedidas).slice(0, 5)

  return (
    <section style={{ marginTop: enVivo ? 48 : 30, borderTop: `2px solid ${APRICOT.carbon}`, paddingTop: 22 }}>
      <p style={{ fontFamily: MONO, fontSize: 12, margin: 0 }}>PIDE UNA CANCIÓN</p>
      <p style={{ fontFamily: MANO, fontSize: 36, lineHeight: 1.05, margin: '6px 0 0', color: '#000' }}>¿qué quieres cantar?</p>

      {/* Registro: una sola vez por teléfono */}
      {!registrado ? (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre" autoComplete="name" style={campo} maxLength={40} />
          <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Tu celular (10 dígitos)" inputMode="tel" autoComplete="tel" style={campo} />
          <p style={{ fontFamily: GROTESK, fontSize: 12.5, lineHeight: 1.45, margin: 0, opacity: 0.75 }}>
            Con tu nombre te anunciamos cuando suene la tuya. Al pedir aceptas el{' '}
            <a href="/?aviso=1" target="_blank" rel="noreferrer" style={{ color: APRICOT.carbon }}>aviso de privacidad</a> de Apricot.
          </p>
        </div>
      ) : (
        <p style={{ fontFamily: GROTESK, fontSize: 14, margin: '10px 0 0' }}>
          Pides como <strong>{nombre}</strong>.{' '}
          <button onClick={() => setRegistrado(false)} style={{ ...enlace }}>¿No eres tú?</button>
        </p>
      )}

      {/* Del repertorio */}
      <div style={{ marginTop: 18 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Busca en el repertorio…" style={campo} />
        {lista.length > 0 && (
          <div style={{ borderTop: `1px solid rgba(51,51,51,0.25)`, marginTop: 10 }}>
            {!q && <p style={{ fontFamily: MONO, fontSize: 10.5, margin: '10px 0 0', opacity: 0.7 }}>LAS MÁS PEDIDAS ESTA NOCHE</p>}
            {lista.map(o => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid rgba(51,51,51,0.25)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: GROTESK, fontWeight: 700, fontSize: 16, margin: 0 }}>{o.titulo}</p>
                  <p style={{ fontFamily: MONO, fontSize: 11, margin: '2px 0 0', textTransform: 'uppercase', opacity: 0.8 }}>
                    {o.artista ?? ''}{o.pedidas > 0 ? `${o.artista ? ' · ' : ''}${o.pedidas} ${o.pedidas === 1 ? 'la pidió' : 'la pidieron'}` : ''}
                  </p>
                </div>
                <button onClick={() => pedir(o.id, null)} disabled={enviando} style={botonChico}>Apartar</button>
              </div>
            ))}
          </div>
        )}
        {q && lista.length === 0 && (
          <p style={{ fontFamily: GROTESK, fontSize: 14, margin: '10px 0 0', opacity: 0.75 }}>No está en el repertorio — sugiérela aquí abajo.</p>
        )}
      </div>

      {/* Sugerencia libre */}
      <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        <input value={sugerencia} onChange={e => setSugerencia(e.target.value)} placeholder="¿No está? Escribe canción y artista" style={{ ...campo, flex: 1 }} maxLength={120} />
        <button onClick={() => pedir(null, sugerencia)} disabled={enviando || sugerencia.trim().length < 3} style={{ ...botonChico, opacity: sugerencia.trim().length < 3 ? 0.4 : 1 }}>Sugerir</button>
      </div>

      {aviso && (
        <p style={{ fontFamily: GROTESK, fontSize: 14, margin: '14px 0 0', padding: '10px 14px', borderRadius: 12, background: aviso.ok ? 'rgba(241,198,53,0.3)' : 'rgba(241,145,53,0.25)' }}>
          {aviso.texto}
        </p>
      )}

      {/* Mis peticiones */}
      {mias.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <p style={{ fontFamily: MONO, fontSize: 12, margin: '0 0 6px' }}>TUS PETICIONES</p>
          {mias.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(51,51,51,0.2)', opacity: m.estado === 'descartada' || m.estado === 'tocada' ? 0.55 : 1 }}>
              <span style={{ fontFamily: GROTESK, fontWeight: 600, fontSize: 15 }}>{m.titulo}{m.sugerencia ? ' ✎' : ''}</span>
              <span style={{ fontFamily: m.estado === 'aceptada' ? MANO : MONO, fontSize: m.estado === 'aceptada' ? 20 : 11, textTransform: m.estado === 'aceptada' ? 'none' : 'uppercase', flexShrink: 0 }}>{ESTADO[m.estado]}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const campo: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '0 14px', borderRadius: 12,
  border: `2px solid ${APRICOT.carbon}`, background: 'rgba(255,255,255,0.45)', color: APRICOT.tinta,
  fontFamily: GROTESK, fontSize: 16, outline: 'none',
}
const botonChico: React.CSSProperties = {
  minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', flexShrink: 0,
  background: APRICOT.carbon, color: APRICOT.crema, fontFamily: GROTESK, fontWeight: 700, fontSize: 14, cursor: 'pointer',
}
const enlace: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: APRICOT.carbon, fontFamily: GROTESK, fontSize: 14, textDecoration: 'underline', cursor: 'pointer',
}
