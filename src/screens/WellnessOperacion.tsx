// ─────────────────────────────────────────────────────────────────────────────
// WELLNESS · OPERACIÓN — el panel de Excel de POD Wellness, dentro de HOG APP.
//
//   Parrilla  → la fuente única del calendario: día, hora, clase, turno,
//               responsable de piso, instructor, cupo y estatus.
//   Cierre    → el registro diario. Al terminar cada turno, quien estuvo en
//               piso llena su renglón: quiénes se registraron por link,
//               quiénes asistieron, cuántos walk-ins se cobraron, a qué
//               precio, si el instructor llegó a tiempo, si el espacio quedó
//               limpio, y qué pasó. Es la disciplina que sostiene el número.
//   Tablero   → se calcula solo desde los cierres. Nadie lo captura, porque un
//               número que alguien tiene que actualizar se vuelve mentira.
//   Maestros  → directorio con estatus, honorario y qué clases imparte.
//
// Mieruka: en la lista del día, lo que falta cerrar se ve en rojo sin que
// nadie tenga que preguntar.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, ChevronLeft, ChevronRight, Check, Clock, AlertTriangle, X, Settings, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Sheet, showToast, StatusBadgeV2 } from '../components/v2'
import { logActivity } from '../hooks/useActivityLog'

export interface OpInstructor {
  id: string; bu_id: string; full_name: string; phone?: string | null; email?: string | null
  revenue_pct: number; active: boolean
  estatus?: string | null; honorario?: number | null; notas?: string | null
}
export interface OpClass { id: string; bu_id: string; name: string; price: number; capacity: number; duration_min: number; active: boolean; color?: string }
export interface OpSlot {
  id: string; class_id: string; weekday: number; start_time: string; active: boolean
  turno?: string | null; responsable_id?: string | null; instructor_id?: string | null
  capacity?: number | null; duration_min?: number | null; estatus?: string | null; notas?: string | null
}
export interface OpSession {
  id: string; bu_id: string; slot_id: string | null; class_date: string; start_time: string
  class_name: string; turno: string; responsable_id: string | null; instructor_id: string | null
  registrados_link: number; asistieron: number; walk_ins: number; total_cobrados: number
  precio_aplicado: number; ingresos: number
  instructor_a_tiempo: boolean | null; espacio_ok: boolean | null; incidencias: string | null
  cerrado_por: string | null; cerrado_at: string | null
}
export interface OpConfig { bu_id: string; precio_regular: number; descuento: number; precio_vigente: number; meta_mensual: number }
export interface Persona { id: string; full_name: string | null }

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const TURNOS: { id: string; label: string }[] = [
  { id: 'AM', label: 'AM' }, { id: 'PM', label: 'PM' }, { id: 'SAB', label: 'Sábado' },
]
const EST_SLOT: Record<string, { label: string; color: string }> = {
  activa:    { label: 'Activa',    color: 'var(--status-healthy)' },
  pausa:     { label: 'En pausa',  color: 'var(--status-attention)' },
  cancelada: { label: 'Cancelada', color: 'var(--status-risk)' },
  propuesta: { label: 'Propuesta', color: 'var(--text-tertiary)' },
}
export const EST_MAESTRO: Record<string, { label: string; color: string }> = {
  confirmado: { label: 'Confirmado', color: 'var(--status-healthy)' },
  en_proceso: { label: 'En proceso', color: 'var(--status-attention)' },
  prospecto:  { label: 'Prospecto',  color: 'var(--text-tertiary)' },
  baja:       { label: 'Baja',       color: 'var(--status-risk)' },
}

const mxn = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hhmm = (t: string) => (t ?? '').slice(0, 5)
const hoyISO = () => iso(new Date())
const toD = (s: string) => new Date(s + 'T00:00:00')
/** Turno que le toca a un día y hora, si nadie lo capturó */
export const turnoDe = (weekday: number, time: string) => weekday === 6 ? 'SAB' : hhmm(time) < '13:00' ? 'AM' : 'PM'
const nombreDe = (id: string | null | undefined, gente: Persona[]) => id ? (gente.find(p => p.id === id)?.full_name ?? null) : null

const inp: React.CSSProperties = {
  width: '100%', minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const caja: React.CSSProperties = { background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }
const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }

export function FaltaSQL({ que }: { que: string }) {
  return (
    <div style={caja}>
      <p style={{ fontSize: 12.5, color: 'var(--status-attention)', margin: 0 }}>
        Falta correr <b>wellness_operacion.sql</b> en Supabase para activar {que}.
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PARRILLA — la fuente única del calendario
// ═══════════════════════════════════════════════════════════════════════════
export function ParrillaTab({ classes, slots, instructors, gente, canWrite, onChange }: {
  classes: OpClass[]; slots: OpSlot[]; instructors: OpInstructor[]; gente: Persona[]
  canWrite: boolean; onChange: () => void
}) {
  const [editando, setEditando] = useState<OpSlot | 'new' | null>(null)
  const [vista, setVista] = useState<'lista' | 'semana'>('lista')
  const claseDe = (id: string) => classes.find(c => c.id === id)
  const sinSQL = slots.length > 0 && slots.every(s => s.estatus == null)

  // Ordenada como la parrilla del Excel: por día y hora, la semana arranca lunes
  const orden = useMemo(() => [...slots].sort((a, b) =>
    ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start_time.localeCompare(b.start_time)), [slots])
  const activos = orden.filter(s => (s.estatus ?? 'activa') === 'activa')
  const sinInstructor = activos.filter(s => !s.instructor_id && !classes.find(c => c.id === s.class_id)?.name.startsWith('__')).length

  // Vista semanal: una rejilla hora × día, como la pestaña automática del Excel
  const horas = useMemo(() => [...new Set(activos.map(s => hhmm(s.start_time)))].sort(), [activos])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sinSQL && <FaltaSQL que="turno, responsable, instructor y estatus por horario" />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-elevated)', borderRadius: 999, padding: 2 }}>
          {([['lista', 'Parrilla'], ['semana', 'Vista semanal']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setVista(id)}
              style={{ minHeight: 32, padding: '0 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: vista === id ? 'var(--accent)' : 'transparent', color: vista === id ? 'var(--on-accent)' : 'var(--text-tertiary)' }}>
              {label}
            </button>
          ))}
        </div>
        <span className="num" style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)' }}>
          {activos.length} clases activas · {activos.filter(s => (s.turno ?? turnoDe(s.weekday, s.start_time)) === 'AM').length} AM · {activos.filter(s => (s.turno ?? turnoDe(s.weekday, s.start_time)) === 'PM').length} PM
        </span>
        {sinInstructor > 0 && (
          <span className="num" title="Horarios activos sin instructor asignado"
            style={{ ...mono, fontSize: 11, fontWeight: 800, color: 'var(--status-risk)', background: 'color-mix(in srgb, var(--status-risk) 13%, transparent)', padding: '2px 8px', borderRadius: 4 }}>
            {sinInstructor} sin instructor
          </span>
        )}
        <div style={{ flex: 1 }} />
        {canWrite && (
          <button onClick={() => setEditando('new')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 36, padding: '0 12px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={13} /> Horario
          </button>
        )}
      </div>

      {vista === 'semana' ? (
        <div style={{ ...caja, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
            <thead>
              <tr>
                <th style={{ ...mono, fontSize: 9.5, color: 'var(--text-tertiary)', textAlign: 'left', padding: '4px 8px', textTransform: 'uppercase' }}>Hora</th>
                {[1, 2, 3, 4, 5, 6, 0].map(d => (
                  <th key={d} style={{ ...mono, fontSize: 9.5, color: 'var(--text-tertiary)', textAlign: 'left', padding: '4px 8px', textTransform: 'uppercase' }}>{DIAS[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horas.map(h => (
                <tr key={h}>
                  <td className="num" style={{ ...mono, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', padding: '5px 8px', borderTop: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{h}</td>
                  {[1, 2, 3, 4, 5, 6, 0].map(d => {
                    const s = activos.find(x => x.weekday === d && hhmm(x.start_time) === h)
                    const c = s ? claseDe(s.class_id) : null
                    return (
                      <td key={d} style={{ padding: '4px 6px', borderTop: '1px solid var(--border-subtle)' }}>
                        {s && c ? (
                          <button onClick={() => canWrite && setEditando(s)} title={`${c.name} · ${DIAS_LARGO[d]} ${h}${s.instructor_id ? ` · ${instructors.find(i => i.id === s.instructor_id)?.full_name}` : ' · sin instructor'}`}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px', borderRadius: 4, border: 'none', borderLeft: `2px solid ${c.color ?? 'var(--accent)'}`, background: `color-mix(in srgb, ${c.color ?? 'var(--accent)'} 14%, transparent)`, color: 'var(--text-primary)', fontSize: 11, fontWeight: 600, cursor: canWrite ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.name}
                            {!s.instructor_id && <span style={{ color: 'var(--status-risk)', fontWeight: 800 }}> ·</span>}
                          </button>
                        ) : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
            Se llena sola desde la parrilla. El punto rojo marca el horario sin instructor asignado.
          </p>
        </div>
      ) : (
        <div style={{ ...caja, padding: 0, overflow: 'hidden' }}>
          {orden.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: 0, padding: 14 }}>Sin horarios todavía. Agrega el primero con “+ Horario”.</p>}
          {orden.map((s, i) => {
            const c = claseDe(s.class_id)
            const est = EST_SLOT[s.estatus ?? 'activa'] ?? EST_SLOT.activa
            const turno = s.turno ?? turnoDe(s.weekday, s.start_time)
            const instr = instructors.find(x => x.id === s.instructor_id)
            const resp = nombreDe(s.responsable_id, gente)
            const cupo = s.capacity ?? c?.capacity
            return (
              <div key={s.id} role={canWrite ? 'button' : undefined} tabIndex={canWrite ? 0 : undefined}
                onClick={() => canWrite && setEditando(s)} onKeyDown={e => { if (canWrite && e.key === 'Enter') setEditando(s) }}
                style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 12px', borderTop: i ? '1px solid var(--border-subtle)' : 'none', cursor: canWrite ? 'pointer' : 'default', minHeight: 46, opacity: est.label === 'Cancelada' ? 0.55 : 1 }}>
                <span className="num" style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {DIAS[s.weekday]} {hhmm(s.start_time)}
                </span>
                <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c?.name ?? '—'}</span>
                  <span className="num" style={{ ...mono, fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', border: '1px solid var(--border-default)', padding: '0 5px', borderRadius: 4, lineHeight: '15px' }}>{turno}</span>
                  {instr
                    ? <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{instr.full_name}</span>
                    : <span className="num" style={{ ...mono, fontSize: 9.5, fontWeight: 800, color: 'var(--status-risk)', background: 'color-mix(in srgb, var(--status-risk) 13%, transparent)', padding: '1px 6px', borderRadius: 4 }}>sin instructor</span>}
                  {resp && <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>piso: {resp}</span>}
                  {s.notas && <span title={s.notas} style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.notas}</span>}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {cupo != null && <span className="num" style={{ ...mono, fontSize: 10.5, color: 'var(--text-tertiary)' }}>cupo {cupo}</span>}
                  <span className="num" style={{ ...mono, fontSize: 10, fontWeight: 800, color: est.color }}>{est.label}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {editando && (
        <SlotSheet slot={editando === 'new' ? null : editando} classes={classes} instructors={instructors} gente={gente}
          onClose={() => setEditando(null)} onSaved={() => { setEditando(null); onChange() }} />
      )}
    </div>
  )
}

function SlotSheet({ slot, classes, instructors, gente, onClose, onSaved }: {
  slot: OpSlot | null; classes: OpClass[]; instructors: OpInstructor[]; gente: Persona[]
  onClose: () => void; onSaved: () => void
}) {
  const [classId, setClassId] = useState(slot?.class_id ?? classes[0]?.id ?? '')
  const [weekday, setWeekday] = useState(String(slot?.weekday ?? 1))
  const [time, setTime] = useState(hhmm(slot?.start_time ?? '08:00'))
  const [turno, setTurno] = useState(slot?.turno ?? turnoDe(slot?.weekday ?? 1, slot?.start_time ?? '08:00'))
  const [resp, setResp] = useState(slot?.responsable_id ?? '')
  const [instr, setInstr] = useState(slot?.instructor_id ?? '')
  const [cap, setCap] = useState(slot?.capacity != null ? String(slot.capacity) : '')
  const [dur, setDur] = useState(slot?.duration_min != null ? String(slot.duration_min) : '')
  const [estatus, setEstatus] = useState(slot?.estatus ?? 'activa')
  const [notas, setNotas] = useState(slot?.notas ?? '')
  const [busy, setBusy] = useState(false)
  // El turno sigue a la hora mientras nadie lo toque a mano
  const [turnoManual, setTurnoManual] = useState(false)
  useEffect(() => { if (!turnoManual) setTurno(turnoDe(Number(weekday), time)) }, [weekday, time, turnoManual])

  async function guardar() {
    if (!classId || !time) { showToast('Elige la clase y la hora.', 'error'); return }
    setBusy(true)
    const row = {
      class_id: classId, weekday: Number(weekday), start_time: time,
      turno, responsable_id: resp || null, instructor_id: instr || null,
      capacity: cap === '' ? null : Math.max(1, Number(cap)),
      duration_min: dur === '' ? null : Math.max(1, Number(dur)),
      estatus, notas: notas.trim() || null,
      active: estatus === 'activa',
    }
    // Sin wellness_operacion.sql las columnas nuevas no existen: se reintenta
    // con lo básico para que el horario igual se guarde.
    const basico = { class_id: row.class_id, weekday: row.weekday, start_time: row.start_time, active: row.active }
    let error
    if (slot) {
      ;({ error } = await supabase.from('wellness_slots').update(row).eq('id', slot.id))
      if (error && /column|schema cache/i.test(error.message)) ({ error } = await supabase.from('wellness_slots').update(basico).eq('id', slot.id))
    } else {
      ;({ error } = await supabase.from('wellness_slots').insert(row))
      if (error && /column|schema cache/i.test(error.message)) ({ error } = await supabase.from('wellness_slots').insert(basico))
    }
    setBusy(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    showToast('Horario guardado.', 'success')
    onSaved()
  }
  async function quitar() {
    if (!slot || !window.confirm('¿Quitar este horario de la parrilla?')) return
    const { error } = await supabase.from('wellness_slots').delete().eq('id', slot.id)
    if (error) { showToast(`No se pudo quitar: ${error.message}`, 'error'); return }
    showToast('Horario quitado.', 'success')
    onSaved()
  }

  return (
    <Sheet open onClose={onClose} isMobile={false} width={560}>
      <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, flex: 1 }}>{slot ? 'Horario de la parrilla' : 'Nuevo horario'}</h3>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div>
          <label style={lbl}>Clase</label>
          <select value={classId} onChange={e => setClassId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={lbl}>Día</label>
            <select value={weekday} onChange={e => setWeekday(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{DIAS_LARGO[d]}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Hora</label><input type="time" value={time} onChange={e => setTime(e.target.value)} className="num" style={inp} /></div>
          <div>
            <label style={lbl}>Turno</label>
            <select value={turno} onChange={e => { setTurnoManual(true); setTurno(e.target.value) }} style={{ ...inp, cursor: 'pointer' }} title="Se deduce de la hora; cámbialo si tu operación lo divide distinto">
              {TURNOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={lbl}>Instructor</label>
            <select value={instr} onChange={e => setInstr(e.target.value)} style={{ ...inp, cursor: 'pointer', color: instr ? 'var(--text-primary)' : 'var(--status-risk)' }}>
              <option value="">— Sin asignar —</option>
              {instructors.filter(i => i.active).map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Responsable de piso</label>
            <select value={resp} onChange={e => setResp(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="">— Sin asignar —</option>
              {gente.filter(p => (p.full_name ?? '').trim()).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 8 }}>
          <div><label style={lbl}>Cupo</label><input type="number" inputMode="numeric" min={1} value={cap} onChange={e => setCap(e.target.value)} placeholder="de la clase" className="num" style={inp} /></div>
          <div><label style={lbl}>Duración</label><input type="number" inputMode="numeric" min={1} value={dur} onChange={e => setDur(e.target.value)} placeholder="min" className="num" style={inp} /></div>
          <div>
            <label style={lbl}>Estatus</label>
            <select value={estatus} onChange={e => setEstatus(e.target.value)} style={{ ...inp, cursor: 'pointer', color: (EST_SLOT[estatus] ?? EST_SLOT.activa).color, fontWeight: 700 }}>
              {Object.entries(EST_SLOT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Notas</label>
          <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Pendiente confirmar instructor, clase de temporada…" style={inp} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={guardar} disabled={busy}
            style={{ flex: 1, minHeight: 44, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Guardando…' : 'Guardar horario'}
          </button>
          {slot && (
            <button onClick={quitar} title="Quitar de la parrilla"
              style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--status-risk)', cursor: 'pointer' }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CIERRE DE TURNO — el registro diario
// ═══════════════════════════════════════════════════════════════════════════
export function CierreTab({ classes, slots, instructors, gente, config, userId, canWrite, bookingsPorSlot }: {
  classes: OpClass[]; slots: OpSlot[]; instructors: OpInstructor[]; gente: Persona[]
  config: OpConfig | null; userId?: string; canWrite: boolean
  /** cuántos se registraron por link, por (slot_id|fecha) */
  bookingsPorSlot: Record<string, number>
}) {
  const [fecha, setFecha] = useState(hoyISO())
  const [sesiones, setSesiones] = useState<OpSession[]>([])
  const [falta, setFalta] = useState(false)
  const [abierta, setAbierta] = useState<{ slot: OpSlot | null; sesion: OpSession | null } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('wellness_sessions').select('*').eq('class_date', fecha)
    if (error) { setFalta(true); return }
    setFalta(false); setSesiones((data ?? []) as OpSession[])
  }, [fecha])
  useEffect(() => { load() }, [load])

  const mover = (n: number) => { const d = toD(fecha); d.setDate(d.getDate() + n); setFecha(iso(d)) }
  const dow = toD(fecha).getDay()
  const delDia = useMemo(() => slots
    .filter(s => s.weekday === dow && (s.estatus ?? 'activa') === 'activa')
    .sort((a, b) => a.start_time.localeCompare(b.start_time)), [slots, dow])
  // Lo que se impartió y no está en la lista del día: clases extra (sin
  // horario) y sesiones cuyo horario se pausó o se movió después de darlas.
  const fueraDeLista = sesiones.filter(s => !s.slot_id || !delDia.some(d => d.id === s.slot_id))
  const cerradas = delDia.filter(s => sesiones.find(x => x.slot_id === s.id)?.cerrado_at).length
  const totalDia = sesiones.reduce((n, s) => n + Number(s.ingresos || 0), 0)
  const alumnosDia = sesiones.reduce((n, s) => n + s.total_cobrados, 0)
  const esPasado = fecha < hoyISO()

  if (falta) return <FaltaSQL que="el registro diario" />

  const fila = (s: OpSlot | null, ses: OpSession | null, key: string) => {
    const c = s ? classes.find(x => x.id === s.class_id) : null
    const nombre = ses?.class_name ?? c?.name ?? '—'
    const hora = hhmm(ses?.start_time ?? s?.start_time ?? '')
    const turno = ses?.turno ?? s?.turno ?? (s ? turnoDe(s.weekday, s.start_time) : 'AM')
    const cerrada = !!ses?.cerrado_at
    const resp = nombreDe(ses?.responsable_id ?? s?.responsable_id, gente)
    const conIncidencia = !!ses?.incidencias?.trim()
    const ojo = ses && (ses.instructor_a_tiempo === false || ses.espacio_ok === false)
    return (
      <div key={key} role={canWrite ? 'button' : undefined} tabIndex={canWrite ? 0 : undefined}
        onClick={() => canWrite && setAbierta({ slot: s, sesion: ses })}
        onKeyDown={e => { if (canWrite && e.key === 'Enter') setAbierta({ slot: s, sesion: ses }) }}
        style={{ display: 'grid', gridTemplateColumns: '58px 1fr auto', gap: 10, alignItems: 'center', width: '100%', minHeight: 46, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${cerrada ? 'var(--status-healthy)' : esPasado ? 'var(--status-risk)' : 'var(--border-strong)'}`, borderRadius: 'var(--radius-sm)', padding: '6px 10px', cursor: canWrite ? 'pointer' : 'default' }}>
        <span className="num" style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>{hora}</span>
        <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{nombre}</span>
          <span className="num" style={{ ...mono, fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', border: '1px solid var(--border-default)', padding: '0 5px', borderRadius: 4, lineHeight: '15px' }}>{turno}</span>
          {!s && !ses?.slot_id && <span className="num" title="Se impartió fuera de la parrilla" style={{ ...mono, fontSize: 9.5, fontWeight: 700, color: 'var(--accent)' }}>extra</span>}
          {!s && !!ses?.slot_id && <span className="num" title="Su horario ya no está activo en la parrilla" style={{ ...mono, fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)' }}>fuera de parrilla</span>}
          {resp && <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{resp}</span>}
          {conIncidencia && <span title={ses!.incidencias!} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: 'var(--status-attention)' }}><AlertTriangle size={11} /> incidencia</span>}
          {ojo && <span title="El instructor no llegó a tiempo o el espacio no quedó bien" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: 'var(--status-risk)', fontWeight: 700 }}><AlertTriangle size={11} /> revisar</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {cerrada ? (
            <>
              <span className="num" style={{ ...mono, fontSize: 11, color: 'var(--text-secondary)' }}>{ses!.total_cobrados} cobrados</span>
              <span className="num" style={{ ...mono, fontSize: 12, fontWeight: 800, color: 'var(--status-healthy)' }}>{mxn(Number(ses!.ingresos))}</span>
              <Check size={13} style={{ color: 'var(--status-healthy)' }} />
            </>
          ) : (
            <span className="num" style={{ ...mono, fontSize: 10.5, fontWeight: 800, color: esPasado ? 'var(--status-risk)' : 'var(--text-tertiary)' }}>
              {esPasado ? 'sin cerrar' : 'pendiente'}
            </span>
          )}
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980 }}>
      {/* Navegación del día + resumen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => mover(-1)} aria-label="Día anterior" style={{ width: 36, height: 36, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' }}><ChevronLeft size={15} /></button>
        <button onClick={() => setFecha(hoyISO())} style={{ minHeight: 36, padding: '0 12px', border: '1px solid var(--border-default)', borderRadius: 999, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Hoy</button>
        <button onClick={() => mover(1)} aria-label="Día siguiente" style={{ width: 36, height: 36, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' }}><ChevronRight size={15} /></button>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="num" style={{ ...inp, width: 160, minHeight: 36 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{DIAS_LARGO[dow]}</span>
        <div style={{ flex: 1 }} />
        <span className="num" style={{ ...mono, fontSize: 11, fontWeight: 800, color: cerradas === delDia.length && delDia.length ? 'var(--status-healthy)' : 'var(--text-tertiary)' }}>
          {cerradas}/{delDia.length} cerradas
        </span>
        {alumnosDia > 0 && <span className="num" style={{ ...mono, fontSize: 11, color: 'var(--text-secondary)' }}>{alumnosDia} alumnos</span>}
        {totalDia > 0 && <span className="num" style={{ ...mono, fontSize: 13, fontWeight: 800, color: 'var(--status-healthy)' }}>{mxn(totalDia)}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {delDia.map(s => fila(s, sesiones.find(x => x.slot_id === s.id) ?? null, s.id))}
        {fueraDeLista.map(ses => fila(null, ses, ses.id))}
        {delDia.length === 0 && fueraDeLista.length === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: 0, padding: '10px 0' }}>
            No hay clases en la parrilla para {DIAS_LARGO[dow].toLowerCase()}. Si se impartió algo fuera de programa, agrégalo como clase extra.
          </p>
        )}
      </div>

      {canWrite && (
        <button onClick={() => setAbierta({ slot: null, sesion: null })}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 34, padding: '0 12px', borderRadius: 999, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={12} /> Clase extra (fuera de parrilla)
        </button>
      )}

      <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0 }}>
        Cada turno se cierra llenando su renglón. Lo que quedó <span style={{ color: 'var(--status-risk)', fontWeight: 700 }}>sin cerrar</span> en un día pasado se ve en rojo: es la deuda de la bitácora.
      </p>

      {abierta && (
        <CierreSheet slot={abierta.slot} sesion={abierta.sesion} fecha={fecha}
          classes={classes} instructors={instructors} gente={gente} config={config} userId={userId}
          registradosLink={abierta.slot ? (bookingsPorSlot[`${abierta.slot.id}|${fecha}`] ?? 0) : 0}
          onClose={() => setAbierta(null)} onSaved={() => { setAbierta(null); load() }} />
      )}
    </div>
  )
}

function CierreSheet({ slot, sesion, fecha, classes, instructors, gente, config, userId, registradosLink, onClose, onSaved }: {
  slot: OpSlot | null; sesion: OpSession | null; fecha: string
  classes: OpClass[]; instructors: OpInstructor[]; gente: Persona[]
  config: OpConfig | null; userId?: string; registradosLink: number
  onClose: () => void; onSaved: () => void
}) {
  const clase = slot ? classes.find(c => c.id === slot.class_id) : null
  const [className, setClassName] = useState(sesion?.class_name ?? clase?.name ?? '')
  const [hora, setHora] = useState(hhmm(sesion?.start_time ?? slot?.start_time ?? '08:00'))
  const [turno, setTurno] = useState(sesion?.turno ?? slot?.turno ?? turnoDe(toD(fecha).getDay(), slot?.start_time ?? '08:00'))
  const [resp, setResp] = useState(sesion?.responsable_id ?? slot?.responsable_id ?? '')
  const [instr, setInstr] = useState(sesion?.instructor_id ?? slot?.instructor_id ?? '')
  // Los registrados por link se precargan de las reservas reales, pero se
  // pueden corregir: quien estuvo en piso sabe lo que de verdad pasó.
  const [reg, setReg] = useState(String(sesion?.registrados_link ?? registradosLink))
  const [asis, setAsis] = useState(sesion ? String(sesion.asistieron) : '')
  const [walk, setWalk] = useState(sesion ? String(sesion.walk_ins) : '')
  const [cobrados, setCobrados] = useState(sesion ? String(sesion.total_cobrados) : '')
  const [cobradosManual, setCobradosManual] = useState(!!sesion)
  const [precio, setPrecio] = useState(String(sesion?.precio_aplicado ?? config?.precio_vigente ?? clase?.price ?? 0))
  const [aTiempo, setATiempo] = useState<boolean | null>(sesion?.instructor_a_tiempo ?? null)
  const [limpio, setLimpio] = useState<boolean | null>(sesion?.espacio_ok ?? null)
  const [inc, setInc] = useState(sesion?.incidencias ?? '')
  const [busy, setBusy] = useState(false)

  // Cobrados = quienes asistieron + walk-ins, mientras nadie lo corrija a mano
  const nAsis = Number(asis || 0), nWalk = Number(walk || 0)
  useEffect(() => { if (!cobradosManual) setCobrados(String(nAsis + nWalk)) }, [nAsis, nWalk, cobradosManual])
  const ingresos = Number(cobrados || 0) * Number(precio || 0)
  const noShows = Math.max(0, Number(reg || 0) - nAsis)

  async function guardar(cerrar: boolean) {
    if (!className.trim()) { showToast('Ponle nombre a la clase.', 'error'); return }
    setBusy(true)
    const { data: bu } = slot
      ? await supabase.from('wellness_classes').select('bu_id').eq('id', slot.class_id).maybeSingle()
      : { data: null as { bu_id: string } | null }
    const buId = sesion?.bu_id ?? bu?.bu_id ?? classes[0]?.bu_id
    if (!buId) { setBusy(false); showToast('No se pudo determinar el venue de la clase.', 'error'); return }
    const row = {
      bu_id: buId, slot_id: slot?.id ?? null, class_date: fecha, start_time: hora,
      class_name: className.trim(), turno,
      responsable_id: resp || null, instructor_id: instr || null,
      registrados_link: Math.max(0, Number(reg || 0)),
      asistieron: Math.max(0, nAsis), walk_ins: Math.max(0, nWalk),
      total_cobrados: Math.max(0, Number(cobrados || 0)),
      precio_aplicado: Math.max(0, Number(precio || 0)),
      instructor_a_tiempo: aTiempo, espacio_ok: limpio,
      incidencias: inc.trim() || null,
      ...(cerrar ? { cerrado_por: userId ?? null, cerrado_at: new Date().toISOString() } : {}),
    }
    const { error } = sesion
      ? await supabase.from('wellness_sessions').update(row).eq('id', sesion.id)
      : await supabase.from('wellness_sessions').insert({ ...row, created_by: userId ?? null })
    setBusy(false)
    if (error) {
      showToast(/schema cache|does not exist/i.test(error.message)
        ? 'Falta correr wellness_operacion.sql en Supabase para guardar el registro diario.'
        : `No se pudo guardar: ${error.message}`, 'error')
      return
    }
    logActivity(cerrar ? 'wellness_turno_cerrado' : 'wellness_turno_guardado', 'event', undefined, { clase: row.class_name, fecha, cobrados: row.total_cobrados, ingresos })
    showToast(cerrar ? `Turno cerrado · ${mxn(ingresos)}` : 'Guardado.', 'success')
    onSaved()
  }

  const siNo = (v: boolean | null, set: (b: boolean | null) => void, label: string) => (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        {([[true, 'Sí'], [false, 'No']] as const).map(([val, txt]) => (
          <button key={txt} onClick={() => set(v === val ? null : val)}
            style={{ flex: 1, minHeight: 38, borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: v === val ? (val ? 'color-mix(in srgb, var(--status-healthy) 16%, transparent)' : 'color-mix(in srgb, var(--status-risk) 16%, transparent)') : 'transparent', border: `1px solid ${v === val ? (val ? 'var(--status-healthy)' : 'var(--status-risk)') : 'var(--border-default)'}`, color: v === val ? (val ? 'var(--status-healthy)' : 'var(--status-risk)') : 'var(--text-secondary)' }}>
            {txt}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <Sheet open onClose={onClose} isMobile={false} width={620} tall>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flexShrink: 0, padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={14} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, flex: 1 }}>{sesion?.cerrado_at ? 'Turno cerrado' : 'Cerrar turno'}</h3>
            <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span className="num" style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)' }}>{DIAS_LARGO[toD(fecha).getDay()]} {fecha}</span>
            {sesion?.cerrado_at && <StatusBadgeV2 tone="healthy" label={`Cerrado ${new Date(sesion.cerrado_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`} />}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 'var(--space-3)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
              <div>
                <label style={lbl}>Clase</label>
                <input value={className} onChange={e => setClassName(e.target.value)} disabled={!!slot} style={{ ...inp, fontWeight: 700 }} />
              </div>
              <div><label style={lbl}>Hora</label><input type="time" value={hora} onChange={e => setHora(e.target.value)} className="num" style={inp} /></div>
              <div>
                <label style={lbl}>Turno</label>
                <select value={turno} onChange={e => setTurno(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  {TURNOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={lbl}>Responsable de piso</label>
                <select value={resp} onChange={e => setResp(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">— Sin asignar —</option>
                  {gente.filter(p => (p.full_name ?? '').trim()).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Instructor que la dio</label>
                <select value={instr} onChange={e => setInstr(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="">— Sin asignar —</option>
                  {instructors.map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
                </select>
              </div>
            </div>

            {/* Los cuatro números */}
            <div style={caja}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <div>
                  <label style={lbl}>Registrados por link</label>
                  <input type="number" inputMode="numeric" min={0} value={reg} onChange={e => setReg(e.target.value)} className="num" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Asistieron</label>
                  <input type="number" inputMode="numeric" min={0} value={asis} onChange={e => setAsis(e.target.value)} placeholder="0" className="num" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Walk-ins</label>
                  <input type="number" inputMode="numeric" min={0} value={walk} onChange={e => setWalk(e.target.value)} placeholder="0" className="num" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Total cobrados</label>
                  <input type="number" inputMode="numeric" min={0} value={cobrados}
                    onChange={e => { setCobradosManual(true); setCobrados(e.target.value) }}
                    title="Se propone como asistieron + walk-ins; corrígelo si cobraste distinto"
                    className="num" style={{ ...inp, fontWeight: 700, borderColor: cobradosManual ? 'var(--accent)' : 'var(--border-subtle)' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, alignItems: 'end' }}>
                <div>
                  <label style={lbl}>Precio aplicado</label>
                  <input type="number" inputMode="decimal" min={0} value={precio} onChange={e => setPrecio(e.target.value)} className="num" style={inp} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ ...lbl, marginBottom: 2 }}>Ingresos</span>
                  <div className="num" style={{ ...mono, fontSize: 22, fontWeight: 800, color: ingresos > 0 ? 'var(--status-healthy)' : 'var(--text-tertiary)', lineHeight: 1.1 }}>{mxn(ingresos)}</div>
                </div>
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>
                {noShows > 0
                  ? <>Se registraron {reg} y asistieron {nAsis}: <b style={{ color: 'var(--status-attention)' }}>{noShows} no llegaron</b>. Los ingresos se calculan solos: cobrados × precio.</>
                  : <>Los ingresos se calculan solos: cobrados × precio. Nadie los escribe a mano.</>}
                {config && Number(precio) !== Number(config.precio_vigente) && (
                  <> · <span style={{ color: 'var(--status-attention)' }}>Ojo: el precio vigente es {mxn(config.precio_vigente)}</span></>
                )}
              </p>
            </div>

            {/* Checklist de cierre */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {siNo(aTiempo, setATiempo, 'Instructor llegó a tiempo')}
              {siNo(limpio, setLimpio, 'Espacio limpio y cerrado')}
            </div>
            <div>
              <label style={lbl}>Incidencias / comentarios</label>
              <textarea value={inc} onChange={e => setInc(e.target.value)} rows={3}
                placeholder="Qué pasó en el turno: una alumna preguntó por paquetes, faltó agua, el aire no enfrió…"
                style={{ ...inp, minHeight: 70, padding: '9px 10px', resize: 'vertical' }} />
            </div>
          </div>
        </div>

        <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
          <button onClick={() => guardar(true)} disabled={busy}
            style={{ flex: 1, minHeight: 46, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Guardando…' : sesion?.cerrado_at ? 'Guardar cambios' : 'Cerrar turno'}
          </button>
          {!sesion?.cerrado_at && (
            <button onClick={() => guardar(false)} disabled={busy} title="Guarda lo capturado sin marcar el turno como cerrado"
              style={{ minHeight: 46, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Guardar sin cerrar
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLERO — se calcula solo desde los cierres
// ═══════════════════════════════════════════════════════════════════════════
export function TableroTab({ config, gente, instructors, canWrite, onConfig }: {
  config: OpConfig | null; gente: Persona[]; instructors: OpInstructor[]
  canWrite: boolean; onConfig: () => void
}) {
  const inicioMes = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)) }
  const finMes = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
  const [desde, setDesde] = useState(inicioMes)
  const [hasta, setHasta] = useState(finMes)
  const [ses, setSes] = useState<OpSession[]>([])
  const [falta, setFalta] = useState(false)

  useEffect(() => {
    supabase.from('wellness_sessions').select('*').gte('class_date', desde).lte('class_date', hasta).order('class_date')
      .then(({ data, error }) => { if (error) { setFalta(true); return } setFalta(false); setSes((data ?? []) as OpSession[]) })
  }, [desde, hasta])

  const k = useMemo(() => {
    const clases = ses.length
    const cobrados = ses.reduce((n, s) => n + s.total_cobrados, 0)
    const asistieron = ses.reduce((n, s) => n + s.asistieron, 0)
    const regLink = ses.reduce((n, s) => n + s.registrados_link, 0)
    const walk = ses.reduce((n, s) => n + s.walk_ins, 0)
    const ingresos = ses.reduce((n, s) => n + Number(s.ingresos || 0), 0)
    const meta = Number(config?.meta_mensual ?? 0)
    return {
      clases, cobrados, asistieron, regLink, walk, ingresos, meta,
      promAlumnos: clases ? cobrados / clases : 0,
      promIngreso: clases ? ingresos / clases : 0,
      avance: meta > 0 ? (ingresos / meta) * 100 : null,
      sinCerrar: ses.filter(s => !s.cerrado_at).length,
      noShows: Math.max(0, regLink - asistieron),
      incidencias: ses.filter(s => s.incidencias?.trim()).length,
      alertas: ses.filter(s => s.instructor_a_tiempo === false || s.espacio_ok === false).length,
    }
  }, [ses, config])

  const agrupar = <T,>(key: (s: OpSession) => string, etiqueta: (k: string) => T) => {
    const m = new Map<string, { clases: number; alumnos: number; ingresos: number }>()
    for (const s of ses) {
      const kk = key(s)
      const a = m.get(kk) ?? { clases: 0, alumnos: 0, ingresos: 0 }
      a.clases++; a.alumnos += s.total_cobrados; a.ingresos += Number(s.ingresos || 0)
      m.set(kk, a)
    }
    return [...m.entries()].map(([kk, v]) => ({ k: etiqueta(kk), ...v })).sort((x, y) => y.ingresos - x.ingresos)
  }
  const porTurno = agrupar(s => s.turno, kk => TURNOS.find(t => t.id === kk)?.label ?? kk)
  const porClase = agrupar(s => s.class_name, kk => kk)
  const porResp = agrupar(s => s.responsable_id ?? '—', kk => nombreDe(kk === '—' ? null : kk, gente) ?? 'Sin responsable')
  const porInstructor = agrupar(s => s.instructor_id ?? '—', kk => instructors.find(i => i.id === kk)?.full_name ?? 'Sin instructor')

  if (falta) return <FaltaSQL que="el tablero" />

  const tile = (label: string, valor: React.ReactNode, pie?: React.ReactNode, tone?: 'ok' | 'warn' | 'bad') => {
    const col = tone === 'bad' ? 'var(--status-risk)' : tone === 'warn' ? 'var(--status-attention)' : tone === 'ok' ? 'var(--status-healthy)' : 'var(--border-default)'
    return (
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 11px', display: 'grid', gap: 2, borderTop: `3px solid ${col}`, minWidth: 0 }}>
        <span style={{ ...mono, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{label}</span>
        <span className="num" style={{ ...mono, fontSize: 19, fontWeight: 800, lineHeight: 1.1, color: tone ? col : 'var(--text-primary)' }}>{valor}</span>
        {pie && <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pie}</span>}
      </div>
    )
  }
  const tabla = (titulo: string, filas: { k: string; clases: number; alumnos: number; ingresos: number }[]) => (
    <div style={caja}>
      <div style={{ ...mono, fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>{titulo}</div>
      {filas.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: 0 }}>Sin datos en el periodo.</p>}
      {filas.map(f => {
        const pct = k.ingresos > 0 ? (f.ingresos / k.ingresos) * 100 : 0
        return (
          <div key={f.k} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 46px 90px', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.k}</span>
            <span className="num" style={{ ...mono, fontSize: 10.5, color: 'var(--text-tertiary)', textAlign: 'right' }}>{f.clases} ses</span>
            <span className="num" style={{ ...mono, fontSize: 10.5, color: 'var(--text-tertiary)', textAlign: 'right' }}>{f.alumnos}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <span style={{ width: 34, height: 4, borderRadius: 2, background: 'var(--bg-base)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round(pct)}%`, background: 'var(--accent)' }} />
              </span>
              <span className="num" style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>{mxn(f.ingresos)}</span>
            </span>
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ ...lbl, marginBottom: 0 }}>Periodo</span>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="num" style={{ ...inp, width: 152, minHeight: 36 }} />
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="num" style={{ ...inp, width: 152, minHeight: 36 }} />
        <button onClick={() => { setDesde(inicioMes()); setHasta(finMes()) }}
          style={{ minHeight: 36, padding: '0 12px', border: '1px solid var(--border-default)', borderRadius: 999, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Este mes</button>
        <div style={{ flex: 1 }} />
        {canWrite && (
          <button onClick={onConfig} title="Precio regular, descuento y meta del mes"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 36, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Settings size={13} /> Configuración
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {tile('Ingresos', mxn(k.ingresos), k.meta > 0 ? `meta ${mxn(k.meta)}` : 'sin meta definida', k.avance != null && k.avance >= 100 ? 'ok' : undefined)}
        {tile('Avance vs meta', k.avance != null ? `${k.avance.toFixed(0)}%` : '—',
          k.meta > 0 ? `faltan ${mxn(Math.max(0, k.meta - k.ingresos))}` : 'define la meta en Configuración',
          k.avance == null ? undefined : k.avance >= 100 ? 'ok' : k.avance >= 60 ? undefined : 'warn')}
        {tile('Clases impartidas', k.clases, `${k.promAlumnos.toFixed(1)} alumnos por clase`)}
        {tile('Alumnos cobrados', k.cobrados, `${k.regLink} por link · ${k.walk} walk-in`)}
        {tile('Ingreso por clase', mxn(k.promIngreso), 'promedio del periodo')}
        {tile('No-shows', k.noShows, k.regLink > 0 ? `${((k.noShows / k.regLink) * 100).toFixed(0)}% de los registrados` : 'sin registros por link', k.noShows > 0 ? 'warn' : undefined)}
        {tile('Sin cerrar', k.sinCerrar, k.sinCerrar ? 'turnos con la bitácora incompleta' : 'todo al día', k.sinCerrar > 0 ? 'bad' : 'ok')}
        {tile('Para revisar', k.alertas + k.incidencias, `${k.alertas} alertas · ${k.incidencias} incidencias`, k.alertas > 0 ? 'bad' : k.incidencias > 0 ? 'warn' : undefined)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
        {tabla('Por turno', porTurno)}
        {tabla('Por clase', porClase)}
        {tabla('Por responsable de piso', porResp)}
        {tabla('Por instructor', porInstructor)}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0 }}>
        Todo esto sale de los cierres de turno. No hay un solo número que alguien tenga que actualizar a mano.
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN — precio y meta
// ═══════════════════════════════════════════════════════════════════════════
export function ConfigSheet({ config, buList, userId, onClose, onSaved }: {
  config: OpConfig | null; buList: { id: string; code: string; name: string }[]
  userId?: string; onClose: () => void; onSaved: () => void
}) {
  const [buId, setBuId] = useState(config?.bu_id ?? buList[0]?.id ?? '')
  const [regular, setRegular] = useState(String(config?.precio_regular ?? 0))
  const [desc, setDesc] = useState(String(config?.descuento ?? 0))
  const [meta, setMeta] = useState(String(config?.meta_mensual ?? 0))
  const [busy, setBusy] = useState(false)
  const vigente = Math.max(0, Number(regular || 0) - Number(desc || 0))

  async function guardar() {
    if (!buId) { showToast('Elige el venue.', 'error'); return }
    setBusy(true)
    const { error } = await supabase.from('wellness_config').upsert({
      bu_id: buId, precio_regular: Number(regular || 0), descuento: Number(desc || 0),
      meta_mensual: Number(meta || 0), updated_by: userId ?? null,
    }, { onConflict: 'bu_id' })
    setBusy(false)
    if (error) {
      showToast(/schema cache|does not exist/i.test(error.message)
        ? 'Falta correr wellness_operacion.sql en Supabase.'
        : `No se pudo guardar: ${error.message}`, 'error')
      return
    }
    showToast('Configuración guardada.', 'success')
    onSaved()
  }

  return (
    <Sheet open onClose={onClose} isMobile={false} width={480}>
      <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Settings size={15} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, flex: 1 }}>Configuración de Wellness</h3>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div>
          <label style={lbl}>Venue</label>
          <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><label style={lbl}>Precio regular</label><input type="number" inputMode="decimal" min={0} value={regular} onChange={e => setRegular(e.target.value)} className="num" style={inp} /></div>
          <div><label style={lbl}>Descuento de apertura</label><input type="number" inputMode="decimal" min={0} value={desc} onChange={e => setDesc(e.target.value)} className="num" style={inp} /></div>
        </div>
        <div style={{ ...caja, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ ...lbl, marginBottom: 0 }}>Precio vigente</span>
          <span className="num" style={{ ...mono, fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{mxn(vigente)}</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>se calcula solo · es el que se propone al cerrar cada turno</span>
        </div>
        <div>
          <label style={lbl}>Meta de ingresos del mes</label>
          <input type="number" inputMode="decimal" min={0} value={meta} onChange={e => setMeta(e.target.value)} className="num" style={inp} />
        </div>
        <button onClick={guardar} disabled={busy}
          style={{ minHeight: 44, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {busy ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </div>
    </Sheet>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAESTROS — directorio
// ═══════════════════════════════════════════════════════════════════════════
export function MaestrosTab({ instructors, classes, buList, canWrite, onChange }: {
  instructors: OpInstructor[]; classes: OpClass[]; buList: { id: string; code: string; name: string }[]
  canWrite: boolean; onChange: () => void
}) {
  const [edit, setEdit] = useState<OpInstructor | 'new' | null>(null)
  const [imparte, setImparte] = useState<Record<string, string[]>>({})
  const [faltaTabla, setFaltaTabla] = useState(false)

  const load = useCallback(() => {
    supabase.from('wellness_instructor_classes').select('instructor_id, class_id').then(({ data, error }) => {
      if (error) { setFaltaTabla(true); return }
      setFaltaTabla(false)
      const m: Record<string, string[]> = {}
      for (const r of data ?? []) (m[r.instructor_id as string] ??= []).push(r.class_id as string)
      setImparte(m)
    })
  }, [])
  useEffect(() => { load() }, [load])

  const porEstatus = (e: string) => instructors.filter(i => (i.estatus ?? 'confirmado') === e).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {Object.entries(EST_MAESTRO).map(([kk, v]) => porEstatus(kk) > 0 && (
          <span key={kk} className="num" style={{ ...mono, fontSize: 11, color: v.color }}>{porEstatus(kk)} {v.label.toLowerCase()}</span>
        ))}
        <div style={{ flex: 1 }} />
        {canWrite && (
          <button onClick={() => setEdit('new')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 36, padding: '0 12px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={13} /> Maestro
          </button>
        )}
      </div>

      <div style={{ ...caja, padding: 0, overflow: 'hidden' }}>
        {instructors.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: 0, padding: 14 }}>Sin maestros todavía.</p>}
        {instructors.map((i, n) => {
          const est = EST_MAESTRO[i.estatus ?? 'confirmado'] ?? EST_MAESTRO.confirmado
          const sus = (imparte[i.id] ?? []).map(cid => classes.find(c => c.id === cid)?.name).filter(Boolean)
          return (
            <div key={i.id} role={canWrite ? 'button' : undefined} tabIndex={canWrite ? 0 : undefined}
              onClick={() => canWrite && setEdit(i)} onKeyDown={e => { if (canWrite && e.key === 'Enter') setEdit(i) }}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '9px 12px', borderTop: n ? '1px solid var(--border-subtle)' : 'none', cursor: canWrite ? 'pointer' : 'default', minHeight: 48 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{i.full_name}</span>
                  <span className="num" style={{ ...mono, fontSize: 9.5, fontWeight: 800, color: est.color }}>{est.label}</span>
                  {i.phone && <span className="num" style={{ ...mono, fontSize: 10.5, color: 'var(--text-tertiary)' }}>{i.phone}</span>}
                </div>
                {(sus.length > 0 || i.notas) && (
                  <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sus.join(' · ')}{sus.length && i.notas ? ' — ' : ''}{i.notas}
                  </div>
                )}
              </div>
              <span className="num" style={{ ...mono, fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {i.honorario != null ? `${mxn(i.honorario)} / clase` : `${i.revenue_pct}% del ingreso`}
              </span>
            </div>
          )
        })}
      </div>
      {faltaTabla && <FaltaSQL que="qué clases imparte cada maestro" />}

      {edit && (
        <MaestroSheet maestro={edit === 'new' ? null : edit} classes={classes} buList={buList}
          imparte={edit === 'new' ? [] : (imparte[edit.id] ?? [])}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); onChange() }} />
      )}
    </div>
  )
}

function MaestroSheet({ maestro, classes, buList, imparte, onClose, onSaved }: {
  maestro: OpInstructor | null; classes: OpClass[]; buList: { id: string; code: string; name: string }[]
  imparte: string[]; onClose: () => void; onSaved: () => void
}) {
  const [nombre, setNombre] = useState(maestro?.full_name ?? '')
  const [bu, setBu] = useState(maestro?.bu_id ?? buList[0]?.id ?? '')
  const [tel, setTel] = useState(maestro?.phone ?? '')
  const [mail, setMail] = useState(maestro?.email ?? '')
  const [estatus, setEstatus] = useState(maestro?.estatus ?? 'confirmado')
  const [modo, setModo] = useState<'honorario' | 'pct'>(maestro?.honorario != null ? 'honorario' : 'pct')
  const [honorario, setHonorario] = useState(maestro?.honorario != null ? String(maestro.honorario) : '')
  const [pct, setPct] = useState(String(maestro?.revenue_pct ?? 60))
  const [notas, setNotas] = useState(maestro?.notas ?? '')
  const [sus, setSus] = useState<string[]>(imparte)
  const [busy, setBusy] = useState(false)

  async function guardar() {
    if (nombre.trim().length < 3) { showToast('Ponle el nombre completo.', 'error'); return }
    if (!bu) { showToast('Elige el venue.', 'error'); return }
    setBusy(true)
    const row = {
      bu_id: bu, full_name: nombre.trim(), phone: tel.trim() || null, email: mail.trim() || null,
      estatus, notas: notas.trim() || null,
      honorario: modo === 'honorario' && honorario !== '' ? Number(honorario) : null,
      revenue_pct: modo === 'pct' ? Number(pct || 0) : (maestro?.revenue_pct ?? 60),
      active: estatus !== 'baja',
    }
    const basico = { bu_id: row.bu_id, full_name: row.full_name, phone: row.phone, email: row.email, revenue_pct: row.revenue_pct, active: row.active }
    let id = maestro?.id
    let error
    if (maestro) {
      ;({ error } = await supabase.from('wellness_instructors').update(row).eq('id', maestro.id))
      if (error && /column|schema cache/i.test(error.message)) ({ error } = await supabase.from('wellness_instructors').update(basico).eq('id', maestro.id))
    } else {
      let data
      ;({ data, error } = await supabase.from('wellness_instructors').insert(row).select('id').single())
      if (error && /column|schema cache/i.test(error.message)) ({ data, error } = await supabase.from('wellness_instructors').insert(basico).select('id').single())
      id = data?.id
    }
    if (error) { setBusy(false); showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    // Qué clases imparte: se reescribe el conjunto completo
    if (id) {
      await supabase.from('wellness_instructor_classes').delete().eq('instructor_id', id)
      if (sus.length) await supabase.from('wellness_instructor_classes').insert(sus.map(c => ({ instructor_id: id!, class_id: c })))
    }
    setBusy(false)
    showToast('Maestro guardado.', 'success')
    onSaved()
  }

  return (
    <Sheet open onClose={onClose} isMobile={false} width={520}>
      <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pencil size={14} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, flex: 1 }}>{maestro ? 'Maestro' : 'Nuevo maestro'}</h3>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div><label style={lbl}>Nombre</label><input value={nombre} onChange={e => setNombre(e.target.value)} style={inp} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><label style={lbl}>Teléfono</label><input value={tel} onChange={e => setTel(e.target.value)} className="num" style={inp} /></div>
          <div><label style={lbl}>Email</label><input value={mail} onChange={e => setMail(e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={lbl}>Venue</label>
            <select value={bu} onChange={e => setBu(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Estatus</label>
            <select value={estatus} onChange={e => setEstatus(e.target.value)} style={{ ...inp, cursor: 'pointer', color: (EST_MAESTRO[estatus] ?? EST_MAESTRO.confirmado).color, fontWeight: 700 }}>
              {Object.entries(EST_MAESTRO).map(([kk, v]) => <option key={kk} value={kk}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Cómo se le paga</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {([['honorario', 'Honorario fijo por clase'], ['pct', '% del ingreso']] as const).map(([id, txt]) => (
              <button key={id} onClick={() => setModo(id)}
                style={{ flex: 1, minHeight: 36, borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: modo === id ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${modo === id ? 'var(--accent)' : 'var(--border-default)'}`, color: modo === id ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {txt}
              </button>
            ))}
          </div>
          {modo === 'honorario'
            ? <input type="number" inputMode="decimal" min={0} value={honorario} onChange={e => setHonorario(e.target.value)} placeholder="MXN por clase impartida" className="num" style={inp} />
            : <input type="number" inputMode="decimal" min={0} max={100} value={pct} onChange={e => setPct(e.target.value)} placeholder="% del ingreso de sus clases" className="num" style={inp} />}
        </div>
        <div>
          <label style={lbl}>Clases que imparte</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {classes.map(c => {
              const on = sus.includes(c.id)
              return (
                <button key={c.id} onClick={() => setSus(s => on ? s.filter(x => x !== c.id) : [...s, c.id])}
                  style={{ minHeight: 32, padding: '0 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: on ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, color: on ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {c.name}
                </button>
              )
            })}
            {classes.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>Primero crea las clases.</span>}
          </div>
        </div>
        <div><label style={lbl}>Notas</label><input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Disponibilidad, pendientes, acuerdos…" style={inp} /></div>
        <button onClick={guardar} disabled={busy}
          style={{ minHeight: 44, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {busy ? 'Guardando…' : 'Guardar maestro'}
        </button>
      </div>
    </Sheet>
  )
}
