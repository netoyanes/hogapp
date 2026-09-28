import { useCallback, useEffect, useState } from 'react'
import { Check, X, Plus, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatPhone, waLink } from '../../lib/phone'
import { showToast } from '../v2'

// ─────────────────────────────────────────────────────────────────────────────
// PETICIONES DEL PÚBLICO — lo que llega desde el QR de la mesa a "La noche".
//
// Pendientes arriba, con quién la pidió y su WhatsApp. "Al setlist" la mete al
// final de la lista y la marca aceptada; si es una sugerencia (no está en el
// repertorio), primero la crea como canción sin letra. Cuando suena, el
// trigger en la noche la pasa a tocada solo.
// ─────────────────────────────────────────────────────────────────────────────

interface Peticion {
  id: string; nombre: string; telefono: string; estado: 'pendiente' | 'aceptada' | 'tocada' | 'descartada'
  cancion_id: string | null; sugerencia: string | null; created_at: string
  cancion: { titulo: string; artista: string | null } | null
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

export function Peticiones({ nocheId, siguienteOrden, onChange }: {
  nocheId: string
  /** El orden que le toca al próximo item del setlist */
  siguienteOrden: number
  onChange: () => Promise<void>
}) {
  const [lista, setLista] = useState<Peticion[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [verTodas, setVerTodas] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('piano_peticiones')
      .select('id, nombre, telefono, estado, cancion_id, sugerencia, created_at, cancion:piano_canciones(titulo, artista)')
      .eq('noche_id', nocheId).order('created_at')
    setLista((data ?? []) as unknown as Peticion[])
  }, [nocheId])

  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 10000)
    return () => clearInterval(t)
  }, [cargar])

  async function correr(fn: () => Promise<string | null>) {
    if (ocupado) return
    setOcupado(true)
    try {
      const err = await fn()
      if (err) showToast(err, 'error')
      await Promise.all([cargar(), onChange()])
    } finally { setOcupado(false) }
  }

  const aceptar = (p: Peticion) => correr(async () => {
    let cancionId = p.cancion_id
    if (!cancionId) {
      // Sugerencia: nace en el repertorio sin letra, para que se pueda tocar
      // hoy y completar después.
      const { data: u } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('piano_canciones')
        .insert({ titulo: (p.sugerencia ?? '').trim(), notas: `Sugerida por ${p.nombre} en piano nights`, created_by: u.user?.id ?? null })
        .select('id').single()
      if (error) return error.message
      cancionId = data.id
    }
    const { data: item, error: e1 } = await supabase.from('piano_setlist')
      .insert({ noche_id: nocheId, cancion_id: cancionId, orden: siguienteOrden }).select('id').single()
    if (e1) return e1.message
    const { error: e2 } = await supabase.from('piano_peticiones')
      .update({ estado: 'aceptada', item_id: item.id, cancion_id: cancionId }).eq('id', p.id)
    if (e2) return e2.message
    showToast(`${p.cancion?.titulo ?? p.sugerencia} va al setlist`, 'success')
    return null
  })

  const descartar = (p: Peticion) => correr(async () => {
    const { error } = await supabase.from('piano_peticiones').update({ estado: 'descartada' }).eq('id', p.id)
    return error?.message ?? null
  })

  const pendientes = lista.filter(p => p.estado === 'pendiente')
  const resto = lista.filter(p => p.estado !== 'pendiente')

  if (lista.length === 0) return (
    <div>
      <p style={lbl}>Peticiones del público</p>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
        Todavía nadie pide. Aparecen aquí conforme la gente escanea el QR y aparta canciones.
      </p>
    </div>
  )

  return (
    <div>
      <p style={lbl}>Peticiones del público · {pendientes.length} en espera</p>
      {pendientes.length > 0 && (
        <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {pendientes.map((p, i) => <Fila key={p.id} p={p} primera={i === 0} ocupado={ocupado} onAceptar={() => aceptar(p)} onDescartar={() => descartar(p)} />)}
        </div>
      )}
      {resto.length > 0 && (
        <button onClick={() => setVerTodas(v => !v)} style={{ background: 'none', border: 'none', padding: '8px 0 0', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer' }}>
          {verTodas ? 'Ocultar' : 'Ver'} {resto.length} atendidas
        </button>
      )}
      {verTodas && resto.length > 0 && (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginTop: 6, opacity: 0.7 }}>
          {resto.map((p, i) => <Fila key={p.id} p={p} primera={i === 0} ocupado />)}
        </div>
      )}
    </div>
  )
}

function Fila({ p, primera, ocupado, onAceptar, onDescartar }: {
  p: Peticion; primera: boolean; ocupado: boolean; onAceptar?: () => void; onDescartar?: () => void
}) {
  const titulo = p.cancion?.titulo ?? p.sugerencia ?? '—'
  const detalle = p.cancion ? (p.cancion.artista ?? '') : 'sugerencia · no está en el repertorio'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', minHeight: 56,
      borderTop: primera ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titulo}{p.estado !== 'pendiente' && <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}> · {p.estado}</span>}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          <strong>{p.nombre}</strong> · {formatPhone(p.telefono)} · {hora(p.created_at)}{detalle ? ` · ${detalle}` : ''}
        </p>
      </div>
      <a href={waLink(p.telefono)} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp" style={iconBtn}><MessageCircle size={14} /></a>
      {onAceptar && (
        <button onClick={onAceptar} disabled={ocupado} title={p.cancion ? 'Al setlist' : 'Crear y al setlist'} style={{ ...iconBtn, width: 'auto', padding: '0 10px', gap: 6, borderColor: 'var(--accent)', color: 'var(--accent)' }}>
          {p.cancion ? <Check size={14} /> : <Plus size={14} />}<span style={{ fontSize: 12, fontWeight: 700 }}>Setlist</span>
        </button>
      )}
      {onDescartar && <button onClick={onDescartar} disabled={ocupado} aria-label="Descartar" title="Descartar" style={iconBtn}><X size={14} /></button>}
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }
const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-default)', background: 'none',
  color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, textDecoration: 'none',
}
