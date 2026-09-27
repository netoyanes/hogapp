import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Piano, Plus, Play, Pause, SkipForward, ChevronUp, ChevronDown, X, Search, ExternalLink, Download, Copy, Radio } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { SegmentedControl, StatusBadgeV2, EmptyStateV2, Sheet, showToast } from '../components/v2'
import { APRICOT, MANO, MONO, APRICOT_LOGO, APRICOT_FONTS_HREF } from '../lib/apricotBrand'

// ─────────────────────────────────────────────────────────────────────────────
// PIANO NIGHTS · control de la noche
//
// La otra mitad del QR de la mesa (PianoLetras). Aquí el músico o el staff:
//  · captura el repertorio una vez (título, artista, letra),
//  · arma el setlist de cada noche y la pone EN VIVO,
//  · y durante la noche pasa de canción con un botón — las mesas se mueven solas.
//
// Pensado para usarse desde el teléfono en el escenario: el botón de
// "siguiente" es grande y está siempre arriba.
// ─────────────────────────────────────────────────────────────────────────────

interface Bu { id: string; code: string; name: string }
interface Cancion {
  id: string; titulo: string; artista: string | null; autores: string | null; letra: string
  tono: string | null; notas: string | null; activo: boolean
}
interface Noche {
  id: string; bu_id: string; fecha: string; titulo: string
  estado: 'programada' | 'en_vivo' | 'cerrada'; actual_id: string | null
}
interface Item { id: string; noche_id: string; cancion_id: string; orden: number; tocada_at: string | null }

const ESTADO: Record<Noche['estado'], { label: string; tone: 'neutral' | 'attention' | 'healthy' }> = {
  programada: { label: 'Programada', tone: 'neutral' },
  en_vivo:    { label: 'En vivo',    tone: 'healthy' },
  cerrada:    { label: 'Cerrada',    tone: 'neutral' },
}

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })

const linkPublico = (code: string) => `${window.location.origin}/letras/${code}`

export function PianoBar() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('noche')
  const [bus, setBus] = useState<Bu[]>([])
  const [buId, setBuId] = useState('')
  const [canciones, setCanciones] = useState<Cancion[]>([])
  const [noches, setNoches] = useState<Noche[]>([])
  const [nocheId, setNocheId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Partial<Cancion> | null>(null)

  const bu = bus.find(b => b.id === buId) ?? null

  const cargarCanciones = useCallback(async () => {
    const { data, error } = await supabase.from('piano_canciones').select('*').order('titulo')
    if (error) { setMissing(true); return }
    setCanciones((data ?? []) as Cancion[])
  }, [])

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('business_units').select('id, code, name').order('code')
      const list = (data ?? []) as Bu[]
      setBus(list)
      // Apricot Mazatlán es donde nace la noche de piano: aterriza ahí.
      setBuId((list.find(b => b.code === 'AM') ?? list[0])?.id ?? '')
      await cargarCanciones()
      setLoading(false)
    })()
  }, [cargarCanciones])

  const cargarNoches = useCallback(async (keepSelected = true) => {
    if (!buId) return
    const { data } = await supabase.from('piano_noches').select('*').eq('bu_id', buId)
      .order('fecha', { ascending: false }).limit(30)
    const list = (data ?? []) as Noche[]
    setNoches(list)
    setNocheId(prev => {
      if (keepSelected && list.some(n => n.id === prev)) return prev
      // La que está sonando; si no, la próxima programada; si no, la última.
      const hoy = hoyISO()
      return (list.find(n => n.estado === 'en_vivo')
        ?? [...list].reverse().find(n => n.estado === 'programada' && n.fecha >= hoy)
        ?? list[0])?.id ?? ''
    })
  }, [buId])

  useEffect(() => { cargarNoches(false) }, [cargarNoches])

  const cargarItems = useCallback(async () => {
    if (!nocheId) { setItems([]); return }
    const { data } = await supabase.from('piano_setlist').select('*').eq('noche_id', nocheId).order('orden')
    setItems((data ?? []) as Item[])
  }, [nocheId])

  useEffect(() => { cargarItems() }, [cargarItems])

  // Si alguien más opera la noche desde otro teléfono, que no se desincronice.
  useEffect(() => {
    if (tab !== 'noche' || !nocheId) return
    const t = setInterval(() => { cargarItems(); cargarNoches() }, 10000)
    return () => clearInterval(t)
  }, [tab, nocheId, cargarItems, cargarNoches])

  if (missing) return (
    <Aviso texto="Falta correr piano_nights.sql en Supabase — es lo que crea el repertorio, las noches y el setlist." />
  )
  if (loading) return <Aviso texto="Cargando…" />

  const noche = noches.find(n => n.id === nocheId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, padding: '14px 20px 0', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <Piano size={17} style={{ color: 'var(--accent)' }} />
          <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 17, margin: 0 }}>Piano Nights · letras en vivo</h1>
          <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inp, cursor: 'pointer', maxWidth: 240, marginLeft: 'auto' }}>
            {bus.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
        </div>
        <SegmentedControl value={tab} onChange={setTab} options={[
          { id: 'noche',      label: 'La noche' },
          { id: 'repertorio', label: `Repertorio (${canciones.length})` },
          { id: 'qr',         label: 'QR de mesa' },
        ]} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px' }}>
        {tab === 'noche' && bu && (
          <NocheTab
            bu={bu} noches={noches} noche={noche} setNocheId={setNocheId} items={items} canciones={canciones}
            onChange={async () => { await Promise.all([cargarNoches(), cargarItems()]) }}
            onCreada={async (id) => { await cargarNoches(); setNocheId(id) }}
            onNuevaCancion={() => setEditando({ activo: true, letra: '' })}
          />
        )}
        {tab === 'repertorio' && (
          <Repertorio canciones={canciones} onEditar={setEditando} onNueva={() => setEditando({ activo: true, letra: '' })} />
        )}
        {tab === 'qr' && bu && <QrTab bu={bu} />}
      </div>

      <Sheet open={!!editando} onClose={() => setEditando(null)} isMobile={isMobile} width={620}>
        {editando && (
          <CancionForm
            inicial={editando}
            onClose={() => setEditando(null)}
            onGuardada={async () => { setEditando(null); await cargarCanciones() }}
          />
        )}
      </Sheet>
    </div>
  )
}

// ── LA NOCHE — setlist, en vivo y "siguiente" ────────────────────────────────
function NocheTab({ bu, noches, noche, setNocheId, items, canciones, onChange, onCreada, onNuevaCancion }: {
  bu: Bu; noches: Noche[]; noche: Noche | null; setNocheId: (id: string) => void
  items: Item[]; canciones: Cancion[]
  onChange: () => Promise<void>; onCreada: (id: string) => Promise<void>; onNuevaCancion: () => void
}) {
  const [fechaNueva, setFechaNueva] = useState(hoyISO())
  const [busca, setBusca] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const porId = useMemo(() => new Map(canciones.map(c => [c.id, c])), [canciones])

  async function correr(fn: () => Promise<{ error: { message: string } | null } | void>) {
    if (ocupado) return
    setOcupado(true)
    try {
      const r = await fn()
      if (r && r.error) showToast(r.error.message, 'error')
      await onChange()
    } finally { setOcupado(false) }
  }

  async function crearNoche() {
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('piano_noches')
      .insert({ bu_id: bu.id, fecha: fechaNueva, created_by: u.user?.id ?? null }).select('id').single()
    if (error) { showToast(error.message, 'error'); return }
    showToast('Noche creada', 'success')
    await onCreada(data.id)
  }

  if (!noche) return (
    <div style={{ maxWidth: 520 }}>
      <EmptyStateV2 icon={<Piano size={28} />} title={`Todavía no hay noches de piano en ${bu.name}. Crea la primera y arma su setlist.`} />
      <NuevaNoche fecha={fechaNueva} setFecha={setFechaNueva} onCrear={crearNoche} />
    </div>
  )

  const actual = items.find(i => i.id === noche.actual_id) ?? null
  const pendientes = items.filter(i => !i.tocada_at && i.id !== noche.actual_id)
  const siguiente = (actual ? pendientes.find(i => i.orden > actual.orden) : null) ?? pendientes[0] ?? null
  const enSetlist = new Set(items.map(i => i.cancion_id))
  const q = busca.trim().toLowerCase()
  const sugeridas = canciones
    .filter(c => c.activo && !enSetlist.has(c.id))
    .filter(c => !q || c.titulo.toLowerCase().includes(q) || (c.artista ?? '').toLowerCase().includes(q))
    .slice(0, 8)

  const sonar = (id: string | null) => correr(async () => {
    const { error } = await supabase.rpc('fn_piano_sonar', { p_noche: noche.id, p_item: id })
    return { error }
  })

  const nocheId = noche.id
  async function cambiarEstado(estado: Noche['estado']) {
    await correr(async () => {
      // Solo una noche en vivo por casa: el QR de la mesa abre "la que suena".
      if (estado === 'en_vivo') {
        await supabase.from('piano_noches').update({ estado: 'cerrada' })
          .eq('bu_id', bu.id).eq('estado', 'en_vivo').neq('id', nocheId)
      }
      const { error } = await supabase.from('piano_noches').update({ estado }).eq('id', nocheId)
      if (!error) showToast(estado === 'en_vivo' ? 'La noche está en vivo — las mesas ya la ven' : 'Noche actualizada', 'success')
      return { error }
    })
  }

  const agregar = (cancionId: string) => correr(async () => {
    const orden = items.reduce((m, i) => Math.max(m, i.orden), 0) + 1
    const { error } = await supabase.from('piano_setlist').insert({ noche_id: noche.id, cancion_id: cancionId, orden })
    if (!error) setBusca('')
    return { error }
  })

  const quitar = (id: string) => correr(async () => {
    const { error } = await supabase.from('piano_setlist').delete().eq('id', id)
    return { error }
  })

  const mover = (idx: number, dir: -1 | 1) => correr(async () => {
    const a = items[idx], b = items[idx + dir]
    if (!a || !b) return
    // Intercambio de orden: dos updates, y si el orden venía repetido se
    // desempata con el índice para que el cambio siempre se vea.
    const oa = a.orden === b.orden ? a.orden + dir : b.orden
    const { error } = await supabase.from('piano_setlist').update({ orden: oa }).eq('id', a.id)
    if (error) return { error }
    return { error: (await supabase.from('piano_setlist').update({ orden: a.orden }).eq('id', b.id)).error }
  })

  const enVivo = noche.estado === 'en_vivo'
  const actualCancion = actual ? porId.get(actual.cancion_id) : null

  return (
    <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Selector de noche + estado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select value={noche.id} onChange={e => setNocheId(e.target.value)} style={{ ...inp, cursor: 'pointer', minWidth: 220 }}>
          {noches.map(n => <option key={n.id} value={n.id}>{fechaCorta(n.fecha)} · {ESTADO[n.estado].label}</option>)}
        </select>
        <StatusBadgeV2 tone={ESTADO[noche.estado].tone} label={ESTADO[noche.estado].label} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!enVivo && (
            <button onClick={() => cambiarEstado('en_vivo')} disabled={ocupado} style={btnPrimario}>
              <Radio size={15} /> Poner en vivo
            </button>
          )}
          {enVivo && (
            <button onClick={() => cambiarEstado('cerrada')} disabled={ocupado} style={btnSecundario}>Cerrar noche</button>
          )}
          <a href={linkPublico(bu.code)} target="_blank" rel="noreferrer" style={{ ...btnSecundario, textDecoration: 'none' }}>
            <ExternalLink size={14} /> Ver como mesa
          </a>
        </div>
      </div>

      {/* Lo que suena — el control grande, para el escenario */}
      <div style={{
        background: 'var(--bg-surface)', border: `1px solid ${enVivo ? 'var(--accent)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-lg)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div>
          <p style={lbl}>{enVivo ? 'Sonando ahora' : 'La noche no está en vivo — las mesas ven "el piano descansa"'}</p>
          {actualCancion ? (
            <>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{actualCancion.titulo}</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {actualCancion.artista ?? '—'}{actualCancion.tono ? ` · tono ${actualCancion.tono}` : ''}
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 15, color: 'var(--text-secondary)' }}>Nada suena todavía.</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => siguiente && sonar(siguiente.id)} disabled={ocupado || !siguiente}
            style={{ ...btnPrimario, minHeight: 56, fontSize: 16, flex: '1 1 220px', justifyContent: 'center', opacity: siguiente ? 1 : 0.5 }}>
            {actual ? <SkipForward size={18} /> : <Play size={18} />}
            {siguiente ? `${actual ? 'Siguiente' : 'Empezar'}: ${porId.get(siguiente.cancion_id)?.titulo ?? ''}` : 'No quedan canciones'}
          </button>
          {actual && (
            <button onClick={() => sonar(null)} disabled={ocupado} style={{ ...btnSecundario, minHeight: 56 }}>
              <Pause size={16} /> Pausa
            </button>
          )}
        </div>
      </div>

      {/* Setlist */}
      <div>
        <p style={lbl}>Setlist · {items.length} canciones</p>
        {items.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Agrega canciones del repertorio abajo.</p>
        ) : (
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {items.map((it, idx) => {
              const c = porId.get(it.cancion_id)
              const esActual = it.id === noche.actual_id
              const estado = esActual ? 'sonando' : it.tocada_at ? 'tocada' : 'pendiente'
              return (
                <div key={it.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minHeight: 52,
                  borderTop: idx ? '1px solid var(--border-subtle)' : 'none',
                  background: esActual ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  opacity: estado === 'tocada' ? 0.55 : 1,
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)', width: 20, textAlign: 'right' }}>{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c?.titulo ?? 'Canción borrada'}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {c?.artista ?? '—'} · {estado}{c && !c.letra.trim() ? ' · sin letra' : ''}
                    </p>
                  </div>
                  {!esActual && (
                    <button onClick={() => sonar(it.id)} disabled={ocupado} aria-label="Que suene esta" title="Que suene esta" style={iconBtn}><Play size={14} /></button>
                  )}
                  <button onClick={() => mover(idx, -1)} disabled={ocupado || idx === 0} aria-label="Subir" style={iconBtn}><ChevronUp size={14} /></button>
                  <button onClick={() => mover(idx, 1)} disabled={ocupado || idx === items.length - 1} aria-label="Bajar" style={iconBtn}><ChevronDown size={14} /></button>
                  <button onClick={() => quitar(it.id)} disabled={ocupado} aria-label="Quitar del setlist" style={iconBtn}><X size={14} /></button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Agregar del repertorio */}
      <div>
        <p style={lbl}>Agregar al setlist</p>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 13, color: 'var(--text-tertiary)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título o artista…" style={{ ...inp, width: '100%', paddingLeft: 30 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {sugeridas.map(c => (
            <button key={c.id} onClick={() => agregar(c.id)} disabled={ocupado} style={{ ...btnSecundario, minHeight: 36, fontSize: 12.5 }}>
              <Plus size={13} /> {c.titulo}{c.artista ? ` · ${c.artista}` : ''}
            </button>
          ))}
          <button onClick={onNuevaCancion} style={{ ...btnSecundario, minHeight: 36, fontSize: 12.5, borderStyle: 'dashed' }}>
            <Plus size={13} /> Nueva canción al repertorio
          </button>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
        <NuevaNoche fecha={fechaNueva} setFecha={setFechaNueva} onCrear={crearNoche} />
      </div>
    </div>
  )
}

function NuevaNoche({ fecha, setFecha, onCrear }: { fecha: string; setFecha: (v: string) => void; onCrear: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      <div>
        <label style={lbl}>Programar otra noche</label>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
      </div>
      <button onClick={onCrear} style={btnSecundario}><Plus size={14} /> Crear noche</button>
    </div>
  )
}

// ── REPERTORIO ───────────────────────────────────────────────────────────────
function Repertorio({ canciones, onEditar, onNueva }: {
  canciones: Cancion[]; onEditar: (c: Cancion) => void; onNueva: () => void
}) {
  const [busca, setBusca] = useState('')
  const q = busca.trim().toLowerCase()
  const lista = canciones.filter(c => !q || c.titulo.toLowerCase().includes(q) || (c.artista ?? '').toLowerCase().includes(q))
  return (
    <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 13, color: 'var(--text-tertiary)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar canción…" style={{ ...inp, width: '100%', paddingLeft: 30 }} />
        </div>
        <button onClick={onNueva} style={btnPrimario}><Plus size={15} /> Canción</button>
      </div>
      {lista.length === 0 ? (
        <EmptyStateV2 icon={<Piano size={28} />} title={canciones.length ? 'Nada coincide con la búsqueda.' : 'El repertorio está vacío. Captura cada canción una vez y úsala todas las noches.'} />
      ) : (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {lista.map((c, i) => (
            <button key={c.id} onClick={() => onEditar(c)} style={{
              display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '12px 14px', minHeight: 52,
              background: 'transparent', border: 'none', borderTop: i ? '1px solid var(--border-subtle)' : 'none',
              cursor: 'pointer', textAlign: 'left', opacity: c.activo ? 1 : 0.5,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.titulo}</p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {c.artista ?? '—'}{c.tono ? ` · ${c.tono}` : ''}
                </p>
              </div>
              {!c.letra.trim() && <StatusBadgeV2 tone="attention" label="Sin letra" />}
              {!c.activo && <StatusBadgeV2 tone="neutral" label="Inactiva" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CancionForm({ inicial, onClose, onGuardada }: {
  inicial: Partial<Cancion>; onClose: () => void; onGuardada: () => void
}) {
  const [f, setF] = useState<Partial<Cancion>>(inicial)
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof Cancion>(k: K, v: Cancion[K]) => setF(p => ({ ...p, [k]: v }))

  async function guardar() {
    if (!f.titulo?.trim()) { showToast('La canción necesita título', 'error'); return }
    setGuardando(true)
    const row = {
      titulo: f.titulo.trim(), artista: f.artista?.trim() || null, autores: f.autores?.trim() || null, letra: f.letra ?? '',
      tono: f.tono?.trim() || null, notas: f.notas?.trim() || null, activo: f.activo ?? true,
    }
    const { data: u } = await supabase.auth.getUser()
    const { error } = f.id
      ? await supabase.from('piano_canciones').update(row).eq('id', f.id)
      : await supabase.from('piano_canciones').insert({ ...row, created_by: u.user?.id ?? null })
    setGuardando(false)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Canción guardada', 'success')
    onGuardada()
  }

  async function borrar() {
    if (!f.id || !confirm('¿Borrar esta canción del repertorio?')) return
    const { error } = await supabase.from('piano_canciones').delete().eq('id', f.id)
    // restrict: si ya se tocó en alguna noche, borrarla rompería ese setlist.
    if (error) { showToast('Ya está en algún setlist — mejor desactívala.', 'error'); return }
    showToast('Canción borrada', 'success')
    onGuardada()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{f.id ? 'Editar canción' : 'Nueva canción'}</h2>
        <button onClick={onClose} aria-label="Cerrar" style={{ ...iconBtn, marginLeft: 'auto' }}><X size={15} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={lbl}>Título</label>
          <input value={f.titulo ?? ''} onChange={e => set('titulo', e.target.value)} style={{ ...inp, width: '100%' }} autoFocus />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 2 }}>
            <label style={lbl}>Artista</label>
            <input value={f.artista ?? ''} onChange={e => set('artista', e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Tono (solo músico)</label>
            <input value={f.tono ?? ''} onChange={e => set('tono', e.target.value)} placeholder="Am" style={{ ...inp, width: '100%' }} />
          </div>
        </div>
        <div>
          <label style={lbl}>Letra y música (autores)</label>
          <input value={f.autores ?? ''} onChange={e => set('autores', e.target.value)} placeholder="Consuelo Velázquez" style={{ ...inp, width: '100%' }} />
        </div>
        <div>
          <label style={lbl}>Letra — deja una línea en blanco entre estrofas</label>
          <textarea value={f.letra ?? ''} onChange={e => set('letra', e.target.value)} rows={14}
            style={{ ...inp, width: '100%', padding: 12, lineHeight: 1.55, resize: 'vertical', fontFamily: 'inherit' }} />
          <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '6px 0 0' }}>
            Esta letra se muestra en el portal público. Captura solo letras que Apricot tenga derecho a mostrar.
          </p>
        </div>
        <div>
          <label style={lbl}>Notas internas (el público no las ve)</label>
          <input value={f.notas ?? ''} onChange={e => set('notas', e.target.value)} style={{ ...inp, width: '100%' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={f.activo ?? true} onChange={e => set('activo', e.target.checked)} />
          Activa (aparece para armar setlists)
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
        {f.id && <button onClick={borrar} style={{ ...btnSecundario, color: 'var(--status-risk)' }}>Borrar</button>}
        <button onClick={guardar} disabled={guardando} style={{ ...btnPrimario, marginLeft: 'auto' }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── QR DE MESA ───────────────────────────────────────────────────────────────
// Un solo QR fijo por casa: siempre abre la noche en vivo, así que se imprime
// una vez y sirve para todas las noches.
function QrTab({ bu }: { bu: Bu }) {
  const url = linkPublico(bu.code)
  const [png, setPng] = useState('')
  // La vista previa habla en Apricot: sus fuentes solo se cargan aquí.
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = APRICOT_FONTS_HREF
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])
  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 1024, margin: 2, errorCorrectionLevel: 'M',
      color: { dark: APRICOT.carbon, light: APRICOT.crema },
    }).then(setPng).catch(() => setPng(''))
  }, [url])

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Vista previa en identidad Apricot — lo que se imprime en la mesa */}
      <div style={{ width: 300, background: APRICOT.crema, color: APRICOT.carbon, borderRadius: 16, padding: '22px 22px 18px', position: 'relative', overflow: 'hidden', boxShadow: '0 1px 0 rgba(0,0,0,0.2)' }}>
        <div aria-hidden style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: 'rgba(241,198,53,0.45)', top: -80, right: -70 }} />
        <p style={{ position: 'relative', fontFamily: MONO, fontSize: 9.5, margin: 0 }}>** NOCHES DE PIANO · {bu.name.toUpperCase()} **</p>
        <p style={{ position: 'relative', fontFamily: MANO, fontSize: 44, lineHeight: 1, margin: '8px 0 0', color: '#000' }}>piano nights</p>
        <p style={{ position: 'relative', fontFamily: MANO, fontSize: 22, margin: '0 0 12px', color: '#000' }}>canta con nosotros</p>
        {png && <img src={png} alt={`QR ${url}`} style={{ width: '100%', display: 'block' }} />}
        <p style={{ fontFamily: MONO, fontSize: 10, textAlign: 'center', margin: '8px 0 12px' }}>ESCANEA · LA LETRA DE LO QUE SUENA</p>
        <div style={{ borderTop: `2px solid ${APRICOT.carbon}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <img src={APRICOT_LOGO} alt="Apricot" width={70} height={20} />
          <span style={{ fontFamily: MONO, fontSize: 9 }}>VINOS Y VINILOS</span>
        </div>
      </div>

      <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
        <div>
          <p style={lbl}>Link del QR</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', margin: 0, wordBreak: 'break-all' }}>{url}</p>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          El QR no cambia entre noches: siempre abre la que esté en vivo en {bu.name}. Imprímelo una vez
          (o colócalo en el flyer de Figma) y listo.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={png} download={`qr-piano-nights-${bu.code}.png`} style={{ ...btnPrimario, textDecoration: 'none', pointerEvents: png ? 'auto' : 'none' }}>
            <Download size={14} /> Descargar QR
          </a>
          <button onClick={() => navigator.clipboard?.writeText(url).then(() => showToast('Link copiado', 'success'))} style={btnSecundario}>
            <Copy size={14} /> Copiar link
          </button>
          <a href={url} target="_blank" rel="noreferrer" style={{ ...btnSecundario, textDecoration: 'none' }}>
            <ExternalLink size={14} /> Abrir
          </a>
        </div>
      </div>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div style={{ padding: 24 }}>
      <p style={{ fontSize: 13, color: 'var(--status-attention)', margin: 0 }}>{texto}</p>
    </div>
  )
}

const inp: React.CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none', minHeight: 40, boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }
const btnPrimario: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', borderRadius: 999,
  border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const btnSecundario: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', borderRadius: 999,
  border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-default)', background: 'none',
  color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
