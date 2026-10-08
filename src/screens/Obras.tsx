import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import QRCode from 'qrcode'
import { HardHat, Plus, Copy, ExternalLink, Download, X, Users, ScrollText, Share2, ListChecks, KeyRound, Archive } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { SegmentedControl, StatusBadgeV2, EmptyStateV2, Sheet, showToast } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// OBRAS · el lado interno del portal de remodelaciones
//
// Aquí dirección arma la obra (grupos y tareas), comparte el link, ve quién
// entró y qué cambió, y lleva el costo. La gente externa trabaja desde el
// portal público (?obra=CODIGO, pantalla ObraPortal); aquí se ve TODO lo que
// hicieron, firmado con su nombre — la misma bitácora que escribe el trigger
// de obra_tareas, sin importar de qué lado vino el cambio.
//
// Acceso: EXCLUSIVO del Master (la policy fn_can_obras lo vuelve a verificar).
// ─────────────────────────────────────────────────────────────────────────────

interface Bu { id: string; code: string; name: string }
interface Obra {
  id: string; bu_id: string | null; code: string; nombre: string; descripcion: string | null; responsable: string | null
  meta_fecha: string | null; presupuesto: number | null; estado: 'activa' | 'pausada' | 'cerrada'; created_at: string
}
interface Grupo { id: string; obra_id: string; nombre: string; orden: number }
interface Tarea {
  id: string; obra_id: string; grupo_id: string | null; titulo: string; detalle: string | null; orden: number
  hecho: boolean; hecho_at: string | null; hecho_por: string | null; fecha_plan: string | null; nota: string | null
  requiere_dinero: boolean; costo_estimado: number | null; costo_real: number | null; ejecutor: string | null
  archivada: boolean; updated_at: string
}
interface Miembro { id: string; nombre: string; telefono: string; rol: string; activo: boolean; last_seen_at: string | null; created_at: string }
interface LogItem {
  id: number; tarea_id: string | null; actor: string; accion: string; campo: string | null
  antes: unknown; despues: unknown; tarea_titulo: string | null; created_at: string
}
interface Reporte { id: string; actor: string; fecha: string; texto: string; created_at: string; tarea_id: string | null }

const ESTADO: Record<Obra['estado'], { label: string; tone: 'healthy' | 'attention' | 'neutral' }> = {
  activa: { label: 'Activa', tone: 'healthy' }, pausada: { label: 'Pausada', tone: 'attention' }, cerrada: { label: 'Cerrada', tone: 'neutral' },
}
const CAMPO: Record<string, string> = {
  titulo: 'título', detalle: 'detalle', fecha_plan: 'fecha', nota: 'nota', requiere_dinero: 'requiere dinero',
  costo_estimado: 'costo estimado', costo_real: 'costo real', ejecutor: 'quién ejecuta', grupo_id: 'grupo',
}
const mxn = (n: number | null | undefined) => n == null ? '—' : `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const fechaCorta = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'
const fechaHora = (ts: string) => new Date(ts).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const linkPublico = (code: string) => `${window.location.origin}/?obra=${code}`

function describeLog(l: LogItem): string {
  const v = (x: unknown) => {
    if (x == null || x === '') return 'vacío'
    if (typeof x === 'boolean') return x ? 'sí' : 'no'
    if (typeof x === 'number') return l.campo?.startsWith('costo') ? mxn(x) : String(x)
    if (typeof x === 'string') return l.campo === 'fecha_plan' ? fechaCorta(x) : x
    return JSON.stringify(x)
  }
  switch (l.accion) {
    case 'check': return 'marcó como hecha'
    case 'uncheck': return 'quitó la marca de hecha'
    case 'crear_tarea': return 'agregó la tarea'
    case 'archivar': return 'archivó la tarea'
    case 'borrar': return 'borró la tarea'
    case 'reporte': return `reportó: “${(l.despues as { texto?: string } | null)?.texto ?? ''}”`
    case 'registro': return 'se registró en la obra'
    case 'login': return 'entró al portal'
    case 'alta_miembro': return `dio de alta a ${(l.despues as { nombre?: string } | null)?.nombre ?? 'alguien'}`
    case 'editar': return `cambió ${CAMPO[l.campo ?? ''] ?? l.campo}: ${v(l.antes)} → ${v(l.despues)}`
    default: return l.accion
  }
}

export function Obras() {
  const isMobile = useIsMobile()
  const [bus, setBus] = useState<Bu[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [nueva, setNueva] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [{ data: o, error }, { data: t }] = await Promise.all([
      supabase.from('obras').select('*').order('created_at', { ascending: false }),
      supabase.from('obra_tareas').select('id, obra_id, hecho, costo_estimado, costo_real, requiere_dinero, archivada').eq('archivada', false),
    ])
    if (error) { setMissing(true); setLoading(false); return }
    setObras((o ?? []) as Obra[])
    setTareas((t ?? []) as Tarea[])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.from('business_units').select('id, code, name').order('code').then(({ data }) => setBus((data ?? []) as Bu[]))
    cargar()
  }, [cargar])

  if (missing) return <Aviso texto="Falta correr obras.sql en Supabase — es lo que crea las obras, sus tareas, el equipo externo y la bitácora." />
  if (loading) return <Aviso texto="Cargando…" />

  const obra = obras.find(o => o.id === abierta) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, padding: '14px 20px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <HardHat size={17} style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 17, margin: 0 }}>Obras · avance de remodelaciones</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: '2px 0 0' }}>Cada obra tiene un link para la gente externa: entran con celular y PIN, y todo lo que tocan queda firmado.</p>
        </div>
        <button onClick={() => setNueva(true)} style={btnPrimario}><Plus size={14} /> Nueva obra</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px' }}>
        {obras.length === 0 ? (
          <EmptyStateV2 icon={<HardHat size={28} />} title="Todavía no hay obras. Crea la primera, arma sus tareas y comparte el link con quien va a ejecutar." actionLabel="Nueva obra" onAction={() => setNueva(true)} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {obras.map(o => {
              const ts = tareas.filter(t => t.obra_id === o.id)
              const hechas = ts.filter(t => t.hecho).length
              const pct = ts.length ? Math.round(hechas / ts.length * 100) : 0
              const real = ts.reduce((s, t) => s + (Number(t.costo_real) || 0), 0)
              const est = ts.reduce((s, t) => s + (Number(t.costo_estimado) || 0), 0)
              const bu = bus.find(b => b.id === o.bu_id)
              return (
                <button key={o.id} onClick={() => setAbierta(o.id)} style={{ ...card, textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{bu ? `${bu.code} · ` : ''}{o.code}</p>
                      <p style={{ margin: '2px 0 0', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{o.nombre}</p>
                    </div>
                    <StatusBadgeV2 tone={ESTADO[o.estado].tone} label={ESTADO[o.estado].label} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                    <b className="num" style={{ fontSize: 18, color: 'var(--text-primary)' }}>{hechas} / {ts.length}</b>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border-default)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--accent)' }} /></div>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{pct}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                    {o.meta_fecha && <span>Meta {fechaCorta(o.meta_fecha)}</span>}
                    <span>Gastado {mxn(real)}{o.presupuesto ? ` de ${mxn(o.presupuesto)}` : est ? ` · est. ${mxn(est)}` : ''}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Sheet open={nueva} onClose={() => setNueva(false)} isMobile={isMobile} width={560}>
        <NuevaObra bus={bus} onClose={() => setNueva(false)} onCreada={async (id) => { setNueva(false); await cargar(); setAbierta(id) }} />
      </Sheet>

      <Sheet open={!!obra} onClose={() => setAbierta(null)} isMobile={isMobile} width={900} tall>
        {obra && <ObraDetalle obra={obra} bus={bus} isMobile={isMobile} onClose={() => setAbierta(null)} onChange={cargar} />}
      </Sheet>
    </div>
  )
}

// ── Nueva obra ───────────────────────────────────────────────────────────────
function NuevaObra({ bus, onClose, onCreada }: { bus: Bu[]; onClose: () => void; onCreada: (id: string) => Promise<void> }) {
  const [f, setF] = useState({ nombre: '', bu_id: '', meta_fecha: '', responsable: '', presupuesto: '', descripcion: '', conGrupos: true })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF(p => ({ ...p, [k]: v }))

  async function crear() {
    if (busy || f.nombre.trim().length < 3) return
    setBusy(true)
    const { data: code, error: e1 } = await supabase.rpc('fn_obra_nuevo_codigo')
    if (e1 || !code) { showToast(e1?.message ?? 'No se pudo generar el código', 'error'); setBusy(false); return }
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('obras').insert({
      code, nombre: f.nombre.trim(), bu_id: f.bu_id || null, meta_fecha: f.meta_fecha || null,
      responsable: f.responsable.trim() || null, presupuesto: f.presupuesto ? Number(f.presupuesto) : null,
      descripcion: f.descripcion.trim() || null, created_by: u.user?.id ?? null,
    }).select('id').single()
    if (error || !data) { showToast(error?.message ?? 'No se pudo crear', 'error'); setBusy(false); return }
    if (f.conGrupos) {
      await supabase.from('obra_grupos').insert(
        ['Electricidad y audio', 'Obra y reparaciones', 'Pintura y limpieza', 'Entrega'].map((nombre, i) => ({ obra_id: data.id, nombre, orden: i + 1 })))
    }
    showToast('Obra creada', 'success')
    await onCreada(data.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header titulo="Nueva obra" onClose={onClose} />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <label style={lbl}>Nombre<input value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Remodelación de Bruma" style={inp} autoFocus /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={lbl}>Venue<select value={f.bu_id} onChange={e => set('bu_id', e.target.value)} style={inp}><option value="">Sin venue</option>{bus.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></label>
          <label style={lbl}>Meta: todo listo el<input type="date" value={f.meta_fecha} onChange={e => set('meta_fecha', e.target.value)} style={inp} /></label>
          <label style={lbl}>Responsable<input value={f.responsable} onChange={e => set('responsable', e.target.value)} placeholder="quién responde por la obra" style={inp} /></label>
          <label style={lbl}>Presupuesto (MXN)<input type="number" value={f.presupuesto} onChange={e => set('presupuesto', e.target.value)} placeholder="opcional" style={inp} /></label>
        </div>
        <label style={lbl}>Instrucciones para quien ejecuta<textarea value={f.descripcion} onChange={e => set('descripcion', e.target.value)} rows={3} placeholder="Se muestran arriba del plan en el portal: orden sugerido, a quién avisar, qué no tocar…" style={{ ...inp, minHeight: 80, paddingTop: 10, resize: 'vertical' }} /></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={f.conGrupos} onChange={e => set('conGrupos', e.target.checked)} /> Empezar con grupos sugeridos (electricidad, obra, pintura, entrega)
        </label>
      </div>
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnSecundario}>Cancelar</button>
        <button onClick={crear} disabled={busy || f.nombre.trim().length < 3} style={btnPrimario}>{busy ? 'Creando…' : 'Crear obra'}</button>
      </div>
    </div>
  )
}

// ── Detalle de una obra ──────────────────────────────────────────────────────
function ObraDetalle({ obra, bus, isMobile, onClose, onChange }: { obra: Obra; bus: Bu[]; isMobile: boolean; onClose: () => void; onChange: () => Promise<void> }) {
  const [tab, setTab] = useState('tareas')
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [log, setLog] = useState<LogItem[]>([])
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [editando, setEditando] = useState<Tarea | null>(null)
  const bu = bus.find(b => b.id === obra.bu_id)

  const cargar = useCallback(async () => {
    const [g, t, m, l, r] = await Promise.all([
      supabase.from('obra_grupos').select('*').eq('obra_id', obra.id).order('orden'),
      supabase.from('obra_tareas').select('*').eq('obra_id', obra.id).eq('archivada', false).order('orden').order('created_at'),
      supabase.from('obra_miembros').select('id, nombre, telefono, rol, activo, last_seen_at, created_at').eq('obra_id', obra.id).order('nombre'),
      supabase.from('obra_log').select('*').eq('obra_id', obra.id).order('created_at', { ascending: false }).limit(300),
      supabase.from('obra_reportes').select('*').eq('obra_id', obra.id).order('created_at', { ascending: false }).limit(100),
    ])
    setGrupos((g.data ?? []) as Grupo[]); setTareas((t.data ?? []) as Tarea[]); setMiembros((m.data ?? []) as Miembro[])
    setLog((l.data ?? []) as LogItem[]); setReportes((r.data ?? []) as Reporte[])
  }, [obra.id])
  useEffect(() => { cargar() }, [cargar])

  // La obra la mueven desde el celular: refrescar mientras está abierta.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 15000)
    return () => clearInterval(t)
  }, [cargar])

  const hechas = tareas.filter(t => t.hecho).length
  const est = tareas.reduce((s, t) => s + (Number(t.costo_estimado) || 0), 0)
  const real = tareas.reduce((s, t) => s + (Number(t.costo_real) || 0), 0)

  async function patchObra(p: Partial<Obra>) {
    const { error } = await supabase.from('obras').update(p).eq('id', obra.id)
    if (error) { showToast(error.message, 'error'); return }
    await onChange()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{bu ? `${bu.code} · ${bu.name} · ` : ''}código {obra.code}</p>
            <h2 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{obra.nombre}</h2>
          </div>
          <select value={obra.estado} onChange={e => patchObra({ estado: e.target.value as Obra['estado'] })} style={{ ...inp, minHeight: 34, fontSize: 12, width: 'auto' }}>
            <option value="activa">Activa</option><option value="pausada">Pausada</option><option value="cerrada">Cerrada</option>
          </select>
          <button onClick={onClose} style={btnIcono} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span><b className="num" style={{ color: 'var(--text-primary)', fontSize: 14 }}>{hechas} / {tareas.length}</b> hechas</span>
          <span>Meta <input type="date" value={obra.meta_fecha ?? ''} onChange={e => patchObra({ meta_fecha: e.target.value || null })} style={{ ...inp, minHeight: 28, fontSize: 12, width: 'auto', padding: '0 6px' }} /></span>
          <span>Estimado <b style={{ color: 'var(--text-primary)' }}>{mxn(est)}</b></span>
          <span>Gastado <b style={{ color: real > (obra.presupuesto ?? Infinity) ? 'var(--status-risk)' : 'var(--text-primary)' }}>{mxn(real)}</b>{obra.presupuesto ? ` de ${mxn(obra.presupuesto)}` : ''}</span>
          <span>{miembros.filter(m => m.activo).length} en el equipo</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <SegmentedControl value={tab} onChange={setTab} scrollable={isMobile} options={[
            { id: 'tareas', label: 'Tareas' }, { id: 'equipo', label: `Equipo (${miembros.length})` },
            { id: 'bitacora', label: 'Bitácora' }, { id: 'compartir', label: 'Compartir' },
          ]} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 28px' }}>
        {tab === 'tareas' && <TareasTab obra={obra} grupos={grupos} tareas={tareas} onEditar={setEditando}
          onMarcarLocal={(id, hecho) => setTareas(prev => prev.map(t => t.id === id ? { ...t, hecho } : t))}
          onChange={async () => { await cargar(); await onChange() }} />}
        {tab === 'equipo' && <EquipoTab obra={obra} miembros={miembros} onChange={cargar} />}
        {tab === 'bitacora' && <BitacoraTab log={log} reportes={reportes} tareas={tareas} />}
        {tab === 'compartir' && <CompartirTab obra={obra} />}
      </div>

      <Sheet open={!!editando} onClose={() => setEditando(null)} isMobile={isMobile} width={560}>
        {editando && <TareaForm tarea={editando} grupos={grupos} onClose={() => setEditando(null)} onGuardada={async () => { setEditando(null); await cargar(); await onChange() }} />}
      </Sheet>
    </div>
  )
}

// ── Tareas ───────────────────────────────────────────────────────────────────
function TareasTab({ obra, grupos, tareas, onEditar, onMarcarLocal, onChange }: {
  obra: Obra; grupos: Grupo[]; tareas: Tarea[]; onEditar: (t: Tarea) => void
  onMarcarLocal: (id: string, hecho: boolean) => void; onChange: () => Promise<void>
}) {
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [nuevaEn, setNuevaEn] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const secciones = useMemo(() => {
    const s = grupos.map(g => ({ g, ts: tareas.filter(t => t.grupo_id === g.id) }))
    const sueltas = tareas.filter(t => !t.grupo_id || !grupos.some(g => g.id === t.grupo_id))
    return { s, sueltas }
  }, [grupos, tareas])

  async function marcar(t: Tarea, hecho: boolean) {
    onMarcarLocal(t.id, hecho)   // se pinta al instante; la base confirma después
    const { error } = await supabase.from('obra_tareas').update({ hecho }).eq('id', t.id)
    if (error) { onMarcarLocal(t.id, !hecho); showToast(error.message, 'error') }
    await onChange()
  }
  async function crearGrupo() {
    if (nuevoGrupo.trim().length < 2) return
    const { error } = await supabase.from('obra_grupos').insert({ obra_id: obra.id, nombre: nuevoGrupo.trim(), orden: (grupos.at(-1)?.orden ?? 0) + 1 })
    if (error) { showToast(error.message, 'error'); return }
    setNuevoGrupo(''); await onChange()
  }
  async function crearTarea(grupoId: string) {
    if (titulo.trim().length < 3) return
    const orden = (tareas.filter(t => t.grupo_id === grupoId).at(-1)?.orden ?? 0) + 1
    const { error } = await supabase.from('obra_tareas').insert({ obra_id: obra.id, grupo_id: grupoId, titulo: titulo.trim(), orden })
    if (error) { showToast(error.message, 'error'); return }
    setTitulo(''); setNuevaEn(null); await onChange()
  }
  async function borrarGrupo(g: Grupo) {
    if (!confirm(`¿Quitar el grupo "${g.nombre}"? Sus tareas quedan en "Otras tareas".`)) return
    const { error } = await supabase.from('obra_grupos').delete().eq('id', g.id)
    if (error) showToast(error.message, 'error')
    await onChange()
  }

  const Fila = ({ t }: { t: Tarea }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: '2px 10px', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)', alignItems: 'start' }}>
      <input type="checkbox" checked={t.hecho} onChange={e => marcar(t, e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer' }} />
      <button onClick={() => onEditar(t)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0, color: 'inherit', fontFamily: 'inherit' }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: t.hecho ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: t.hecho ? 'line-through' : 'none' }}>{t.titulo}</span>
        {t.detalle && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 1 }}>{t.detalle}</span>}
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          {t.hecho ? <span style={{ color: 'var(--status-healthy)' }}>hecha{t.hecho_por ? ` · ${t.hecho_por}` : ''}{t.hecho_at ? ` · ${fechaHora(t.hecho_at)}` : ''}</span> : t.fecha_plan ? <span>para el {fechaCorta(t.fecha_plan)}</span> : <span>sin fecha</span>}
          {t.ejecutor && <span>ejecuta: {t.ejecutor}</span>}
          {t.requiere_dinero && <span style={{ color: 'var(--status-attention)' }}>💵 est. {mxn(t.costo_estimado)} · real {mxn(t.costo_real)}</span>}
          {t.nota && <span>📝 {t.nota}</span>}
        </span>
      </button>
      <button onClick={() => onEditar(t)} style={{ ...btnTexto, fontSize: 12 }}>Editar</button>
    </div>
  )

  return (
    <div style={{ maxWidth: 760 }}>
      {secciones.s.map(({ g, ts }) => (
        <section key={g.id} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '2px solid var(--border-strong)', paddingBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{g.nombre}</h3>
            <span className="num" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{ts.filter(t => t.hecho).length} / {ts.length}</span>
            <button onClick={() => borrarGrupo(g)} style={{ ...btnTexto, fontSize: 11, color: 'var(--text-tertiary)' }}>quitar grupo</button>
          </div>
          {ts.map(t => <Fila key={t.id} t={t} />)}
          {nuevaEn === g.id ? (
            <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="¿Qué hay que hacer?" style={{ ...inp, flex: 1 }} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') crearTarea(g.id); if (e.key === 'Escape') setNuevaEn(null) }} />
              <button onClick={() => crearTarea(g.id)} style={btnPrimario}>Agregar</button>
              <button onClick={() => setNuevaEn(null)} style={btnSecundario}>Cancelar</button>
            </div>
          ) : (
            <button onClick={() => { setNuevaEn(g.id); setTitulo('') }} style={{ ...btnTexto, padding: '8px 0', fontSize: 13 }}>+ Agregar tarea</button>
          )}
        </section>
      ))}
      {secciones.sueltas.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '2px solid var(--border-strong)', paddingBottom: 4 }}>Otras tareas</h3>
          {secciones.sueltas.map(t => <Fila key={t.id} t={t} />)}
        </section>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)} placeholder="Nuevo grupo (ej. Cocina)" style={{ ...inp, flex: 1, maxWidth: 320 }} onKeyDown={e => { if (e.key === 'Enter') crearGrupo() }} />
        <button onClick={crearGrupo} disabled={nuevoGrupo.trim().length < 2} style={btnSecundario}><Plus size={13} /> Grupo</button>
      </div>
    </div>
  )
}

function TareaForm({ tarea, grupos, onClose, onGuardada }: { tarea: Tarea; grupos: Grupo[]; onClose: () => void; onGuardada: () => Promise<void> }) {
  const [f, setF] = useState({
    titulo: tarea.titulo, detalle: tarea.detalle ?? '', grupo_id: tarea.grupo_id ?? '', fecha_plan: tarea.fecha_plan ?? '', nota: tarea.nota ?? '',
    requiere_dinero: tarea.requiere_dinero, costo_estimado: tarea.costo_estimado == null ? '' : String(tarea.costo_estimado),
    costo_real: tarea.costo_real == null ? '' : String(tarea.costo_real), ejecutor: tarea.ejecutor ?? '',
  })
  const [hist, setHist] = useState<LogItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF(p => ({ ...p, [k]: v }))

  async function guardar() {
    if (busy || f.titulo.trim().length < 3) return
    setBusy(true)
    const { error } = await supabase.from('obra_tareas').update({
      titulo: f.titulo.trim(), detalle: f.detalle.trim() || null, grupo_id: f.grupo_id || null, fecha_plan: f.fecha_plan || null,
      nota: f.nota.trim() || null, requiere_dinero: f.requiere_dinero,
      costo_estimado: f.costo_estimado === '' ? null : Number(f.costo_estimado), costo_real: f.costo_real === '' ? null : Number(f.costo_real),
      ejecutor: f.ejecutor.trim() || null,
    }).eq('id', tarea.id)
    setBusy(false)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Tarea guardada', 'success')
    await onGuardada()
  }
  async function archivar() {
    if (!confirm('¿Archivar esta tarea? Desaparece del plan pero queda en la bitácora.')) return
    const { error } = await supabase.from('obra_tareas').update({ archivada: true }).eq('id', tarea.id)
    if (error) { showToast(error.message, 'error'); return }
    await onGuardada()
  }
  async function verHistorial() {
    const { data } = await supabase.from('obra_log').select('*').eq('tarea_id', tarea.id).order('created_at', { ascending: false }).limit(100)
    setHist((data ?? []) as LogItem[])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Header titulo="Tarea" onClose={onClose} />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <label style={lbl}>Qué hay que hacer<input value={f.titulo} onChange={e => set('titulo', e.target.value)} style={inp} /></label>
        <label style={lbl}>Detalle<textarea value={f.detalle} onChange={e => set('detalle', e.target.value)} rows={2} style={{ ...inp, minHeight: 60, paddingTop: 10, resize: 'vertical' }} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={lbl}>Grupo<select value={f.grupo_id} onChange={e => set('grupo_id', e.target.value)} style={inp}><option value="">Sin grupo</option>{grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}</select></label>
          <label style={lbl}>Cuándo<input type="date" value={f.fecha_plan} onChange={e => set('fecha_plan', e.target.value)} style={inp} /></label>
          <label style={lbl}>Quién ejecuta<input value={f.ejecutor} onChange={e => set('ejecutor', e.target.value)} placeholder="nombre o empresa" style={inp} /></label>
          <label style={{ ...lbl, justifyContent: 'flex-end' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={f.requiere_dinero} onChange={e => set('requiere_dinero', e.target.checked)} /> ¿Requiere dinero?
            </span>
          </label>
          {f.requiere_dinero && <>
            <label style={lbl}>Costo estimado<input type="number" value={f.costo_estimado} onChange={e => set('costo_estimado', e.target.value)} style={inp} /></label>
            <label style={lbl}>Costo real<input type="number" value={f.costo_real} onChange={e => set('costo_real', e.target.value)} style={inp} /></label>
          </>}
        </div>
        <label style={lbl}>Nota<textarea value={f.nota} onChange={e => set('nota', e.target.value)} rows={2} style={{ ...inp, minHeight: 60, paddingTop: 10, resize: 'vertical' }} /></label>
        {tarea.hecho && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>Marcada como hecha por <b>{tarea.hecho_por ?? '—'}</b>{tarea.hecho_at ? ` el ${fechaHora(tarea.hecho_at)}` : ''}.</p>}
        <button onClick={hist ? () => setHist(null) : verHistorial} style={{ ...btnTexto, alignSelf: 'flex-start', fontSize: 13 }}>{hist ? 'Ocultar historial' : 'Ver quién la cambió'}</button>
        {hist && <LogLista items={hist} />}
      </div>
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
        <button onClick={archivar} style={{ ...btnSecundario, color: 'var(--status-risk)' }}><Archive size={13} /> Archivar</button>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={btnSecundario}>Cancelar</button>
        <button onClick={guardar} disabled={busy} style={btnPrimario}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}

// ── Equipo ───────────────────────────────────────────────────────────────────
function EquipoTab({ obra, miembros, onChange }: { obra: Obra; miembros: Miembro[]; onChange: () => Promise<void> }) {
  const [f, setF] = useState({ nombre: '', telefono: '', pin: '', rol: 'ejecutor' })
  const [busy, setBusy] = useState(false)

  async function alta() {
    if (busy) return
    setBusy(true)
    const { data, error } = await supabase.rpc('fn_obra_alta_miembro', { p_obra: obra.id, p_nombre: f.nombre, p_telefono: f.telefono, p_pin: f.pin, p_rol: f.rol })
    setBusy(false)
    const r = (data ?? null) as { ok?: boolean; error?: string } | null
    if (error || !r?.ok) { showToast(r?.error ?? error?.message ?? 'No se pudo dar de alta', 'error'); return }
    showToast(`${f.nombre.trim()} ya puede entrar con su celular y PIN ${f.pin}`, 'success')
    setF({ nombre: '', telefono: '', pin: '', rol: 'ejecutor' }); await onChange()
  }
  async function toggleActivo(m: Miembro) {
    const { error } = await supabase.from('obra_miembros').update({ activo: !m.activo }).eq('id', m.id)
    if (error) showToast(error.message, 'error')
    await onChange()
  }
  async function resetPin(m: Miembro) {
    const pin = prompt(`Nuevo PIN para ${m.nombre} (4 a 6 números):`)
    if (!pin) return
    const { data, error } = await supabase.rpc('fn_obra_reset_pin', { p_miembro: m.id, p_pin: pin })
    const r = (data ?? null) as { ok?: boolean; error?: string } | null
    if (error || !r?.ok) { showToast(r?.error ?? error?.message ?? 'No se pudo', 'error'); return }
    showToast(`PIN de ${m.nombre} repuesto: ${pin}`, 'success')
  }

  return (
    <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        La gente se registra sola desde el link (celular + nombre + PIN). También puedes darla de alta aquí para dictarle su PIN. Quien está desactivado no puede entrar, pero su historial se queda.
      </p>
      {miembros.length === 0 ? <EmptyStateV2 icon={<Users size={26} />} title="Nadie ha entrado todavía. Comparte el link o da de alta a alguien aquí abajo." /> : (
        <div>
          {miembros.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', opacity: m.activo ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.nombre} <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>· {m.rol}</span></p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {m.telefono} · {m.last_seen_at ? `visto ${fechaHora(m.last_seen_at)}` : 'nunca ha entrado'}
                </p>
              </div>
              <button onClick={() => resetPin(m)} style={btnSecundario} title="Reponer PIN"><KeyRound size={13} /> PIN</button>
              <button onClick={() => toggleActivo(m)} style={btnSecundario}>{m.activo ? 'Desactivar' : 'Reactivar'}</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 14 }}>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Dar de alta a alguien</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <input value={f.nombre} onChange={e => setF(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre y apellido" style={inp} />
          <input value={f.telefono} onChange={e => setF(p => ({ ...p, telefono: e.target.value }))} placeholder="Celular (10 dígitos)" inputMode="tel" style={inp} />
          <input value={f.pin} onChange={e => setF(p => ({ ...p, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="PIN (4 a 6 números)" inputMode="numeric" style={inp} />
          <select value={f.rol} onChange={e => setF(p => ({ ...p, rol: e.target.value }))} style={inp}><option value="ejecutor">Ejecutor</option><option value="supervisor">Supervisor</option></select>
        </div>
        <button onClick={alta} disabled={busy || f.nombre.trim().length < 3 || f.telefono.replace(/\D/g, '').length < 10 || f.pin.length < 4} style={{ ...btnPrimario, marginTop: 10 }}>
          <Plus size={13} /> Dar de alta
        </button>
      </div>
    </div>
  )
}

// ── Bitácora ─────────────────────────────────────────────────────────────────
function BitacoraTab({ log, reportes, tareas }: { log: LogItem[]; reportes: Reporte[]; tareas: Tarea[] }) {
  const [vista, setVista] = useState('todo')
  const [quien, setQuien] = useState('')
  const actores = useMemo(() => [...new Set([...log.map(l => l.actor), ...reportes.map(r => r.actor)])].sort(), [log, reportes])
  const items = useMemo(() => {
    let l = log
    if (vista === 'cambios') l = l.filter(x => x.accion !== 'login' && x.accion !== 'reporte')
    if (vista === 'accesos') l = l.filter(x => x.accion === 'login' || x.accion === 'registro' || x.accion === 'alta_miembro')
    if (quien) l = l.filter(x => x.actor === quien)
    return l
  }, [log, vista, quien])
  const reps = useMemo(() => quien ? reportes.filter(r => r.actor === quien) : reportes, [reportes, quien])
  const tituloDe = (id: string | null) => tareas.find(t => t.id === id)?.titulo

  return (
    <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <SegmentedControl value={vista} onChange={setVista} options={[
          { id: 'todo', label: 'Todo' }, { id: 'cambios', label: 'Cambios' }, { id: 'reportes', label: `Reportes (${reportes.length})` }, { id: 'accesos', label: 'Accesos' },
        ]} />
        <select value={quien} onChange={e => setQuien(e.target.value)} style={{ ...inp, width: 'auto', minHeight: 36, fontSize: 12 }}>
          <option value="">Todas las personas</option>{actores.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {vista === 'reportes' ? (
        reps.length === 0 ? <EmptyStateV2 icon={<ScrollText size={26} />} title="Todavía no hay reportes del día." /> : reps.map(r => (
          <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}><b style={{ color: 'var(--text-primary)' }}>{r.actor}</b> · {fechaHora(r.created_at)}{r.tarea_id ? ` · ${tituloDe(r.tarea_id) ?? 'tarea'}` : ''}</p>
            <p style={{ margin: '3px 0 0', fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{r.texto}</p>
          </div>
        ))
      ) : <LogLista items={items} conTarea />}
    </div>
  )
}

function LogLista({ items, conTarea }: { items: LogItem[]; conTarea?: boolean }) {
  if (!items.length) return <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>Sin movimientos.</p>
  return (
    <div>
      {items.map(l => (
        <p key={l.id} style={{ margin: 0, padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
          <span className="num" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{fechaHora(l.created_at)}</span> · <b style={{ color: 'var(--text-primary)' }}>{l.actor}</b> {describeLog(l)}
          {conTarea && l.tarea_titulo && l.accion !== 'reporte' && <span style={{ color: 'var(--text-tertiary)' }}> — {l.tarea_titulo}</span>}
        </p>
      ))}
    </div>
  )
}

// ── Compartir ────────────────────────────────────────────────────────────────
function CompartirTab({ obra }: { obra: Obra }) {
  const url = linkPublico(obra.code)
  const [png, setPng] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { width: 768, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#173519', light: '#F9F4EF' } }).then(setPng).catch(() => setPng(''))
  }, [url])
  const mensaje = `Hola, este es el plan de trabajo de "${obra.nombre}". Ábrelo en tu celular, entra con tu número y un PIN que tú elijas, y ve marcando lo que quede hecho: ${url}`
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start', maxWidth: 820 }}>
      <div style={{ width: 240, background: '#F9F4EF', borderRadius: 14, padding: 16, color: '#173519' }}>
        <p style={{ margin: 0, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600, color: '#767F76' }}>avance de obra</p>
        <p style={{ margin: '4px 0 10px', fontWeight: 800, fontSize: 18, lineHeight: 1.15 }}>{obra.nombre}</p>
        {png && <img src={png} alt={`QR ${url}`} style={{ width: '100%', display: 'block', borderRadius: 8 }} />}
        <p style={{ margin: '8px 0 0', fontSize: 11, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>código {obra.code}</p>
      </div>
      <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p style={lbl}>Link para la gente externa</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', margin: 0, wordBreak: 'break-all' }}>{url}</p>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Quien lo abre entra con su celular y un PIN que elige la primera vez (y su nombre). No necesita cuenta de HOG APP.
          Todo lo que marque, edite o reporte queda en la bitácora con su nombre y la hora.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => navigator.clipboard?.writeText(url).then(() => showToast('Link copiado', 'success'))} style={btnPrimario}><Copy size={14} /> Copiar link</button>
          <button onClick={() => navigator.clipboard?.writeText(mensaje).then(() => showToast('Mensaje copiado — pégalo en WhatsApp', 'success'))} style={btnSecundario}><Share2 size={14} /> Copiar mensaje para WhatsApp</button>
          <a href={png} download={`qr-obra-${obra.code}.png`} style={{ ...btnSecundario, textDecoration: 'none', pointerEvents: png ? 'auto' : 'none' }}><Download size={14} /> QR</a>
          <a href={url} target="_blank" rel="noreferrer" style={{ ...btnSecundario, textDecoration: 'none' }}><ExternalLink size={14} /> Abrir</a>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><ListChecks size={13} /> El link es el mismo toda la obra: se puede imprimir y pegar en el sitio.</p>
      </div>
    </div>
  )
}

// ── Piezas ───────────────────────────────────────────────────────────────────
function Header({ titulo, onClose }: { titulo: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{titulo}</h2>
      <button onClick={onClose} style={btnIcono} aria-label="Cerrar"><X size={16} /></button>
    </div>
  )
}
function Aviso({ texto }: { texto: string }) {
  return <div style={{ padding: 24 }}><p style={{ fontSize: 13, color: 'var(--status-attention)', margin: 0 }}>{texto}</p></div>
}

const inp: CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none', minHeight: 40, boxSizing: 'border-box', width: '100%', fontFamily: 'inherit',
}
const lbl: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', margin: 0 }
const card: CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14, fontFamily: 'inherit' }
const btnPrimario: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 14px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
  background: 'var(--accent)', color: 'var(--on-accent, #fff)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const btnSecundario: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
}
const btnTexto: CSSProperties = { background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontFamily: 'inherit' }
const btnIcono: CSSProperties = { background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-tertiary)', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }
