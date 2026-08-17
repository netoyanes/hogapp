import { useCallback, useEffect, useMemo, useState } from 'react'
import { Flower2, Plus, Trash2, ChevronLeft, ChevronRight, Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { SegmentedControl, StatusBadgeV2, Sheet, showToast } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// WELLNESS (admin) — el otro lado del portal público (?wellness=CODIGO)
//
// Dos niveles con el MISMO login de HOG APP:
//  · INSTRUCTOR (app 'wellness'): entra y ve una sola cosa — cuántos alumnos
//    hay por horario en sus clases, con nombres. Su pregunta es "¿cuánta gente
//    tengo mañana a las 7:30?", no la caja del negocio.
//  · GERENTE (app 'wellness' + capability 'wellness_admin', o Master): además
//    administra clases/horarios/precios, ve la base de alumnos y los ingresos
//    (semana / quincena / mes) con proyección sobre reservas ya hechas.
// ─────────────────────────────────────────────────────────────────────────────

interface Instructor { id: string; bu_id: string; full_name: string; profile_id: string | null; active: boolean }
interface WClass {
  id: string; bu_id: string; name: string; description: string | null
  instructor_id: string | null; price: number; capacity: number; duration_min: number; color: string; active: boolean
}
interface WSlot { id: string; class_id: string; weekday: number; start_time: string; active: boolean }
interface Student { id: string; full_name: string; phone: string; email: string | null; created_at: string }
interface Booking {
  id: string; slot_id: string; class_date: string; student_id: string
  status: string; paid: boolean; paid_via: string | null; amount: number | null
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const mxn = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hhmm = (t: string) => t.slice(0, 5)

export function Wellness({ userId, isManager }: { userId?: string; isManager: boolean }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('horarios')
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [classes, setClasses] = useState<WClass[]>([])
  const [slots, setSlots] = useState<WSlot[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [classSheet, setClassSheet] = useState<WClass | 'new' | null>(null)
  // Semana visible del reporte (lunes)
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); const dow = (d.getDay() + 6) % 7
    return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow))
  })

  const load = useCallback(async () => {
    const desde = new Date(); desde.setMonth(desde.getMonth() - 3)
    const [{ data: bus }, { data: ins, error: insErr }, { data: cls }, { data: sl }, { data: st }, { data: bk }] = await Promise.all([
      supabase.from('business_units').select('id, code, name').order('name'),
      supabase.from('wellness_instructors').select('*'),
      supabase.from('wellness_classes').select('*').order('name'),
      supabase.from('wellness_slots').select('*'),
      supabase.from('wellness_students').select('id, full_name, phone, email, created_at').order('created_at', { ascending: false }),
      supabase.from('wellness_bookings').select('*').gte('class_date', iso(desde)),
    ])
    if (insErr) { setMissing(true); setLoading(false); return }
    setMissing(false)
    setBuList(bus ?? []); setInstructors((ins ?? []) as Instructor[])
    setClasses((cls ?? []) as WClass[]); setSlots((sl ?? []) as WSlot[])
    setStudents((st ?? []) as Student[]); setBookings((bk ?? []) as Booking[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // El instructor solo ve SUS clases; el gerente ve todas
  const misClases = useMemo(() => {
    if (isManager) return classes
    const yo = instructors.find(i => i.profile_id === userId)
    return yo ? classes.filter(c => c.instructor_id === yo.id) : []
  }, [classes, instructors, isManager, userId])

  if (missing) return <p style={{ padding: 24, fontSize: 13, color: 'var(--status-attention)' }}>Falta correr wellness.sql en Supabase.</p>
  if (loading) return <p style={{ padding: 24, fontSize: 13, color: 'var(--text-tertiary)' }}>Cargando…</p>

  const tabs = [
    { id: 'horarios', label: 'Alumnos por horario' },
    ...(isManager ? [
      { id: 'clases',  label: 'Clases y precios' },
      { id: 'alumnos', label: `Alumnos · ${students.length}` },
      { id: 'ingresos', label: 'Ingresos' },
    ] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, padding: '14px 20px 0', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <Flower2 size={17} style={{ color: 'var(--accent)' }} />
          <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 17, margin: 0 }}>Wellness</h1>
          {!isManager && <StatusBadgeV2 tone="neutral" label="Vista de instructor" />}
          {isManager && buList.length > 0 && (
            <a href={`${window.location.origin}${window.location.pathname}?wellness=${buList.find(b => classes.some(c => c.bu_id === b.id))?.code ?? buList[0].code}`}
              target="_blank" rel="noreferrer" onClick={() => {}}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none', border: '1px solid var(--accent-border)', borderRadius: 999, padding: '6px 12px', fontWeight: 700 }}>
              <Link2 size={12} /> Ver portal público
            </a>
          )}
        </div>
        <SegmentedControl scrollable value={tab} onChange={setTab} options={tabs} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px' }}>
        {tab === 'horarios' && (
          <ReporteHorarios clases={misClases} slots={slots} bookings={bookings} students={students}
            instructors={instructors} weekStart={weekStart} setWeekStart={setWeekStart}
            isManager={isManager} onChange={load} />
        )}
        {tab === 'clases' && isManager && (
          <ClasesTab classes={classes} slots={slots} instructors={instructors} buList={buList}
            onNew={() => setClassSheet('new')} onEdit={c => setClassSheet(c)} onChange={load} />
        )}
        {tab === 'alumnos' && isManager && <AlumnosTab students={students} bookings={bookings} />}
        {tab === 'ingresos' && isManager && <IngresosTab bookings={bookings} classes={classes} slots={slots} />}
      </div>

      {classSheet && (
        <ClassSheet cls={classSheet === 'new' ? null : classSheet} buList={buList} instructors={instructors}
          slots={slots} isMobile={isMobile} onClose={() => setClassSheet(null)}
          onSaved={() => { setClassSheet(null); load() }} />
      )}
    </div>
  )
}

const inp: React.CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none', minHeight: 40, boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border-default)', background: 'none',
  color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

// ── REPORTE — la vista del instructor: cuántos y quiénes, por horario ────────
function ReporteHorarios({ clases, slots, bookings, students, instructors, weekStart, setWeekStart, isManager, onChange }: {
  clases: WClass[]; slots: WSlot[]; bookings: Booking[]; students: Student[]
  instructors: Instructor[]; weekStart: string; setWeekStart: (v: string) => void
  isManager: boolean; onChange: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const week = [...Array(7)].map((_, i) => {
    const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + i); return d
  })
  function moveWeek(dir: 1 | -1) {
    const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + dir * 7); setWeekStart(iso(d))
  }
  const nameOf = (id: string) => students.find(s => s.id === id)?.full_name ?? '¿?'
  const phoneOf = (id: string) => students.find(s => s.id === id)?.phone ?? ''

  // Marcar asistencia — también el instructor puede: es SU pase de lista
  async function marcar(b: Booking, status: string) {
    const { error } = await supabase.from('wellness_bookings').update({ status }).eq('id', b.id)
    if (error) showToast(`No se pudo: ${error.message}`, 'error'); else onChange()
  }

  const ocurrencias = week.flatMap(d => {
    const dia = iso(d)
    return slots.filter(s => s.active && s.weekday === d.getDay() && clases.some(c => c.id === s.class_id))
      .map(s => {
        const c = clases.find(x => x.id === s.class_id)!
        const bs = bookings.filter(b => b.slot_id === s.id && b.class_date === dia && b.status !== 'cancelada')
        return { key: s.id + dia, date: d, dia, slot: s, cls: c, bs }
      })
  }).sort((a, b) => a.dia.localeCompare(b.dia) || a.slot.start_time.localeCompare(b.slot.start_time))

  if (clases.length === 0) return (
    <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
      {isManager ? 'Sin clases todavía — créalas en "Clases y precios".' : 'Tu cuenta aún no está ligada a ninguna clase — pide al gerente que te asigne.'}
    </p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => moveWeek(-1)} aria-label="Semana anterior" style={navBtn}><ChevronLeft size={15} /></button>
        <span className="num" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', minWidth: 150, textAlign: 'center' }}>
          {week[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – {week[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
        </span>
        <button onClick={() => moveWeek(1)} aria-label="Semana siguiente" style={navBtn}><ChevronRight size={15} /></button>
      </div>

      {ocurrencias.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Sin clases esta semana.</p>}
      {ocurrencias.map(o => {
        const abierto = open === o.key
        const pagados = o.bs.filter(b => b.paid).length
        return (
          <div key={o.key} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${o.cls.color}`, overflow: 'hidden' }}>
            <button onClick={() => setOpen(abierto ? null : o.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer' }}>
              <span className="num" style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', minWidth: 46 }}>{hhmm(o.slot.start_time)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{o.cls.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                  {DIAS[o.date.getDay()]} {o.date.getDate()} · {instructors.find(i => i.id === o.cls.instructor_id)?.full_name ?? 'sin instructor'}
                </span>
              </span>
              {/* El número que el instructor vino a ver, grande */}
              <span className="num" style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-mono)', color: o.bs.length >= o.cls.capacity ? 'var(--status-risk)' : 'var(--text-primary)' }}>
                {o.bs.length}<span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontWeight: 400 }}>/{o.cls.capacity}</span>
              </span>
              {isManager && <span className="num" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{pagados} pag.</span>}
            </button>
            {abierto && (
              <div style={{ padding: '0 14px 12px' }}>
                {o.bs.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Nadie reservado todavía.</p>}
                {o.bs.map(b => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: 'var(--text-primary)' }}>
                      {nameOf(b.student_id)}
                      {isManager && <span className="num" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{phoneOf(b.student_id)}</span>}
                    </span>
                    {b.paid
                      ? <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--status-healthy)' }}>PAGADA{b.paid_via ? ` · ${b.paid_via}` : ''}</span>
                      : Number(b.amount) > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--status-attention)' }}>por pagar</span>}
                    {/* Pase de lista */}
                    {(['asistio', 'no_show'] as const).map(st => (
                      <button key={st} onClick={() => marcar(b, b.status === st ? 'reservada' : st)}
                        title={st === 'asistio' ? 'Asistió' : 'No llegó'}
                        style={{ minHeight: 30, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${b.status === st ? (st === 'asistio' ? 'var(--status-healthy)' : 'var(--status-risk)') : 'var(--border-default)'}`, background: b.status === st ? (st === 'asistio' ? 'color-mix(in srgb, var(--status-healthy) 14%, transparent)' : 'color-mix(in srgb, var(--status-risk) 12%, transparent)') : 'none', color: b.status === st ? (st === 'asistio' ? 'var(--status-healthy)' : 'var(--status-risk)') : 'var(--text-tertiary)' }}>
                        {st === 'asistio' ? '✓' : '✗'}
                      </button>
                    ))}
                    {/* Cobro manual (solo gerente): efectivo o transferencia en el estudio */}
                    {isManager && !b.paid && Number(b.amount) > 0 && (
                      <button onClick={async () => {
                        const { error } = await supabase.from('wellness_bookings').update({ paid: true, paid_via: 'efectivo' }).eq('id', b.id)
                        if (error) showToast(error.message, 'error'); else onChange()
                      }}
                        style={{ minHeight: 30, padding: '0 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                        Cobrar {mxn(Number(b.amount))}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── CLASES Y PRECIOS (gerente) ───────────────────────────────────────────────
function ClasesTab({ classes, slots, instructors, buList, onNew, onEdit, onChange }: {
  classes: WClass[]; slots: WSlot[]; instructors: Instructor[]
  buList: { id: string; code: string; name: string }[]
  onNew: () => void; onEdit: (c: WClass) => void; onChange: () => void
}) {
  async function toggleActive(c: WClass) {
    await supabase.from('wellness_classes').update({ active: !c.active }).eq('id', c.id)
    onChange()
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={onNew}
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
        <Plus size={14} /> Nueva clase
      </button>
      {classes.map(c => {
        const sus = slots.filter(s => s.class_id === c.id && s.active)
        return (
          <div key={c.id} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px 14px', borderLeft: `3px solid ${c.color}`, opacity: c.active ? 1 : 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => onEdit(c)} style={{ flex: 1, minWidth: 140, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}
                  <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{buList.find(b => b.id === c.bu_id)?.code}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {instructors.find(i => i.id === c.instructor_id)?.full_name ?? 'sin instructor'} · cupo {c.capacity} · {c.duration_min} min
                </div>
              </button>
              <span className="num" style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{mxn(c.price)}</span>
              <button onClick={() => toggleActive(c)}
                style={{ minHeight: 30, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 10.5, cursor: 'pointer' }}>
                {c.active ? 'Pausar' : 'Reactivar'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {sus.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)).map(s => (
                <span key={s.id} className="num" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '3px 8px' }}>
                  {DIAS[s.weekday]} {hhmm(s.start_time)}
                </span>
              ))}
              {sus.length === 0 && <span style={{ fontSize: 11, color: 'var(--status-attention)' }}>Sin horarios — no aparece en el portal</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Sheet de clase: datos + horarios en un solo lugar ────────────────────────
function ClassSheet({ cls, buList, instructors, slots, isMobile, onClose, onSaved }: {
  cls: WClass | null; buList: { id: string; code: string; name: string }[]
  instructors: Instructor[]; slots: WSlot[]; isMobile: boolean
  onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(cls?.name ?? '')
  const [desc, setDesc] = useState(cls?.description ?? '')
  const [bu, setBu] = useState(cls?.bu_id ?? buList[0]?.id ?? '')
  const [instr, setInstr] = useState(cls?.instructor_id ?? '')
  const [nuevoInstr, setNuevoInstr] = useState('')
  const [price, setPrice] = useState(String(cls?.price ?? ''))
  const [cap, setCap] = useState(String(cls?.capacity ?? 12))
  const [dur, setDur] = useState(String(cls?.duration_min ?? 60))
  const [busy, setBusy] = useState(false)
  const [misSlots, setMisSlots] = useState<{ id?: string; weekday: number; start_time: string }[]>(
    () => slots.filter(s => s.class_id === cls?.id && s.active).map(s => ({ id: s.id, weekday: s.weekday, start_time: hhmm(s.start_time) })))
  const [nw, setNw] = useState('2'); const [nt, setNt] = useState('07:30')

  async function save() {
    if (!name.trim()) { showToast('Ponle nombre a la clase.', 'error'); return }
    setBusy(true)
    try {
      let instructorId = instr || null
      if (nuevoInstr.trim()) {
        const { data: ni, error } = await supabase.from('wellness_instructors')
          .insert({ bu_id: bu, full_name: nuevoInstr.trim() }).select('id').single()
        if (error) { showToast(`No se pudo crear el instructor: ${error.message}`, 'error'); return }
        instructorId = ni.id
      }
      const row = {
        name: name.trim(), description: desc.trim() || null, bu_id: bu, instructor_id: instructorId,
        price: Number(price) || 0, capacity: Math.max(1, Number(cap) || 12), duration_min: Number(dur) || 60,
      }
      let classId = cls?.id
      if (cls) {
        const { error } = await supabase.from('wellness_classes').update(row).eq('id', cls.id)
        if (error) { showToast(error.message, 'error'); return }
      } else {
        const { data: nc, error } = await supabase.from('wellness_classes').insert(row).select('id').single()
        if (error || !nc) { showToast(error?.message ?? 'No se pudo crear', 'error'); return }
        classId = nc.id
      }
      // Horarios: los quitados se desactivan (las reservas viejas los referencian),
      // los nuevos se insertan
      const previos = slots.filter(s => s.class_id === classId && s.active)
      for (const p of previos) {
        if (!misSlots.some(m => m.id === p.id)) {
          await supabase.from('wellness_slots').update({ active: false }).eq('id', p.id)
        }
      }
      for (const m of misSlots.filter(m => !m.id)) {
        await supabase.from('wellness_slots').upsert(
          { class_id: classId, weekday: m.weekday, start_time: m.start_time, active: true },
          { onConflict: 'class_id,weekday,start_time' })
      }
      showToast(cls ? 'Clase actualizada.' : 'Clase creada — ya aparece en el portal.', 'success')
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={520}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>
          {cls ? 'Editar clase' : 'Nueva clase'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={lbl}>Nombre *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Dharma Yoga, Pilates, Sound Healing…" style={{ ...inp, width: '100%' }} /></div>
          <div><label style={lbl}>Descripción (la ve el alumno)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} style={{ ...inp, width: '100%', minHeight: 56, padding: '9px 10px', resize: 'vertical' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>Venue</label>
              <select value={bu} onChange={e => setBu(e.target.value)} style={{ ...inp, width: '100%', cursor: 'pointer' }}>
                {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select></div>
            <div><label style={lbl}>Instructor</label>
              <select value={instr} onChange={e => setInstr(e.target.value)} style={{ ...inp, width: '100%', cursor: 'pointer' }}>
                <option value="">— elegir —</option>
                {instructors.filter(i => i.active).map(i => <option key={i.id} value={i.id}>{i.full_name}</option>)}
              </select></div>
          </div>
          {!instr && (
            <div><label style={lbl}>…o da de alta un instructor nuevo</label>
              <input value={nuevoInstr} onChange={e => setNuevoInstr(e.target.value)} placeholder="Nombre del instructor" style={{ ...inp, width: '100%' }} /></div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>Precio (MXN)</label><input type="number" inputMode="decimal" min={0} value={price} onChange={e => setPrice(e.target.value)} className="num" style={{ ...inp, width: '100%' }} placeholder="0" /></div>
            <div><label style={lbl}>Cupo</label><input type="number" inputMode="numeric" min={1} value={cap} onChange={e => setCap(e.target.value)} className="num" style={{ ...inp, width: '100%' }} /></div>
            <div><label style={lbl}>Minutos</label><input type="number" inputMode="numeric" min={15} value={dur} onChange={e => setDur(e.target.value)} className="num" style={{ ...inp, width: '100%' }} /></div>
          </div>

          <div>
            <label style={lbl}>Horarios</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {misSlots.map((m, i) => (
                <span key={i} className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 999, padding: '6px 6px 6px 12px' }}>
                  {DIAS[m.weekday]} {m.start_time}
                  <button onClick={() => setMisSlots(prev => prev.filter((_, j) => j !== i))} aria-label="Quitar horario"
                    style={{ width: 22, height: 22, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><Trash2 size={11} /></button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={nw} onChange={e => setNw(e.target.value)} style={{ ...inp, cursor: 'pointer', width: 92 }}>
                {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
              <input type="time" value={nt} onChange={e => setNt(e.target.value)} style={{ ...inp, width: 120 }} />
              <button onClick={() => { if (nt) setMisSlots(prev => [...prev, { weekday: Number(nw), start_time: nt }]) }}
                style={{ minHeight: 40, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, cursor: 'pointer' }}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          <button onClick={save} disabled={busy}
            style={{ minHeight: 48, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// ── ALUMNOS (gerente): la base que se va construyendo sola ───────────────────
function AlumnosTab({ students, bookings }: { students: Student[]; bookings: Booking[] }) {
  const [q, setQ] = useState('')
  const rows = students.filter(s => !q.trim()
    || s.full_name.toLowerCase().includes(q.toLowerCase()) || s.phone.includes(q.trim()))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o teléfono…" style={{ ...inp, maxWidth: 320 }} />
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
        {rows.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Sin alumnos aún — se registran solos desde el portal.</p>}
        {rows.map(s => {
          const suyas = bookings.filter(b => b.student_id === s.id && b.status !== 'cancelada')
          const gastado = suyas.filter(b => b.paid).reduce((sum, b) => sum + Number(b.amount ?? 0), 0)
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 140, fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{s.full_name}</span>
              <span className="num" style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{s.phone}</span>
              {s.email && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.email}</span>}
              <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', width: 66, textAlign: 'right' }}>{suyas.length} clases</span>
              <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--status-healthy)', fontFamily: 'var(--font-mono)', width: 80, textAlign: 'right' }}>{mxn(gastado)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── INGRESOS (gerente): lo cobrado y lo reservado por cobrar ─────────────────
function IngresosTab({ bookings, classes, slots }: { bookings: Booking[]; classes: WClass[]; slots: WSlot[] }) {
  const hoy = new Date()
  const clsOf = (slotId: string) => classes.find(c => c.id === slots.find(s => s.id === slotId)?.class_id)

  const rango = (from: string, to: string) => {
    const en = bookings.filter(b => b.class_date >= from && b.class_date <= to && b.status !== 'cancelada')
    return {
      cobrado: en.filter(b => b.paid).reduce((s, b) => s + Number(b.amount ?? 0), 0),
      porCobrar: en.filter(b => !b.paid).reduce((s, b) => s + Number(b.amount ?? 0), 0),
      clases: en.length,
    }
  }
  const dow = (hoy.getDay() + 6) % 7
  const semIni = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow))
  const semFin = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dow + 6))
  const qIni = hoy.getDate() <= 15 ? iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)) : iso(new Date(hoy.getFullYear(), hoy.getMonth(), 16))
  const qFin = hoy.getDate() <= 15 ? iso(new Date(hoy.getFullYear(), hoy.getMonth(), 15)) : iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))
  const mIni = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const mFin = iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))
  const sem = rango(semIni, semFin), quin = rango(qIni, qFin), mes = rango(mIni, mFin)

  // Por clase, del mes — dónde está el dinero
  const porClase = useMemo(() => {
    const m = new Map<string, { name: string; color: string; cobrado: number; n: number }>()
    for (const b of bookings.filter(b => b.class_date >= mIni && b.class_date <= mFin && b.status !== 'cancelada')) {
      const c = clsOf(b.slot_id); if (!c) continue
      const e = m.get(c.id) ?? { name: c.name, color: c.color, cobrado: 0, n: 0 }
      if (b.paid) e.cobrado += Number(b.amount ?? 0)
      e.n += 1; m.set(c.id, e)
    }
    return [...m.values()].sort((a, b) => b.cobrado - a.cobrado)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, classes, slots])

  const tile = (label: string, r: { cobrado: number; porCobrar: number; clases: number }) => (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '12px 16px', minWidth: 168, flex: 1 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div className="num" style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{mxn(r.cobrado)}</div>
      <div className="num" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>
        {r.porCobrar > 0 && <>+{mxn(r.porCobrar)} reservado por cobrar · </>}{r.clases} reservas
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tile('Esta semana', sem)}
        {tile('Esta quincena', quin)}
        {tile('Este mes', mes)}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
        <strong>Cobrado</strong> = pagos confirmados (Blumon + efectivo). <strong>Por cobrar</strong> = lugares ya reservados sin pagar — es tu proyección: gente que dijo que viene. Incluye clases futuras del periodo.
      </p>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>Por clase (mes)</div>
        {porClase.map(c => (
          <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{c.name}</span>
            <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{c.n} reservas</span>
            <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', width: 90, textAlign: 'right' }}>{mxn(c.cobrado)}</span>
          </div>
        ))}
        {porClase.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Sin movimiento este mes.</p>}
      </div>
    </div>
  )
}
