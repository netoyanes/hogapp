import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users, Plus, Trash2, ChevronLeft, ChevronRight, Send, Check, TrendingUp, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { BUChip, KPITile, SegmentedControl, StatusBadgeV2, EmptyStateV2, Sheet, showToast } from '../components/v2'
import { logActivity } from '../hooks/useActivityLog'

// ─────────────────────────────────────────────────────────────────────────────
// NÓMINA DE TEMPORALES Y EVENTUALES
//
// El personal eventual se contrata contra el volumen operativo que se espera,
// pero esa decisión hoy se toma de memoria. Este módulo junta las dos mitades
// que nunca se ven juntas: lo que CUESTA la plantilla de la quincena y lo que
// PRODUJO el venue en ese mismo periodo. De ahí sale el % de costo laboral,
// que es el número con el que se planea la siguiente.
//
// Flujo: el gerente arma su quincena y la envía → el Master la aprueba. Aparte,
// cada semana el gerente sube la operación de cada persona (turnos, horas,
// venta, incidencias) — eso es lo que hace medible a la gente, no la nómina.
//
// Arranca exclusivo del Master. Al liberar, el gerente solo ve y captura los
// venues que tiene asignados: las políticas del SQL ya lo resuelven.
// ─────────────────────────────────────────────────────────────────────────────

interface Staff {
  id: string; bu_id: string; full_name: string; role: string | null
  kind: 'temporal' | 'eventual'; rate: number; phone: string | null; active: boolean
}
interface Period {
  id: string; bu_id: string; period_start: string; period_end: string
  status: 'draft' | 'submitted' | 'approved' | 'paid'
  submitted_by: string | null; approved_by: string | null; notes: string | null
}
interface Entry {
  id: string; period_id: string; staff_id: string
  shifts: number; rate: number; bonus: number; deduction: number; total: number; notes: string | null
}
interface WeekOp {
  id: string; staff_id: string; bu_id: string; week_start: string
  shifts: number; hours: number; sales: number | null; incidents: number; rating: number | null
}

const mxn = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const pct = (n: number) => `${n.toFixed(1)}%`

const PERIOD_STATUS: Record<Period['status'], { label: string; tone: 'neutral' | 'attention' | 'healthy' | 'risk' }> = {
  draft:     { label: 'Borrador',  tone: 'neutral' },
  submitted: { label: 'Enviada',   tone: 'attention' },
  approved:  { label: 'Aprobada',  tone: 'healthy' },
  paid:      { label: 'Pagada',    tone: 'healthy' },
}

// ── Quincenas a la mexicana: del 1 al 15 y del 16 al fin de mes ──────────────
// No es un rango de 14 días corridos: la nómina quincenal en México se corta
// por calendario, así que febrero tiene una segunda quincena de 13 días.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function quincenaOf(base: Date): { start: string; end: string } {
  const y = base.getFullYear(), m = base.getMonth()
  if (base.getDate() <= 15) return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m, 15)) }
  return { start: iso(new Date(y, m, 16)), end: iso(new Date(y, m + 1, 0)) }
}
// Explícito a propósito: sumar días para "caer" en la quincena vecina se salta
// periodos (desde un día 16, +40 días brinca la 1ª del mes siguiente entero).
// new Date(y, m+1, 0) es el último día del mes m — así febrero cierra solo.
function shiftQuincena(start: string, dir: 1 | -1): { start: string; end: string } {
  const d = new Date(start + 'T00:00:00')
  const y = d.getFullYear(), m = d.getMonth(), primera = d.getDate() <= 15
  if (dir === 1) {
    return primera
      ? { start: iso(new Date(y, m, 16)),    end: iso(new Date(y, m + 1, 0)) }
      : { start: iso(new Date(y, m + 1, 1)), end: iso(new Date(y, m + 1, 15)) }
  }
  return primera
    ? { start: iso(new Date(y, m - 1, 16)), end: iso(new Date(y, m, 0)) }
    : { start: iso(new Date(y, m, 1)),      end: iso(new Date(y, m, 15)) }
}
const quincenaLabel = (start: string, end: string) => {
  const a = new Date(start + 'T00:00:00'), b = new Date(end + 'T00:00:00')
  const mes = a.toLocaleDateString('es-MX', { month: 'long' })
  return `${a.getDate()}–${b.getDate()} ${mes.charAt(0).toUpperCase() + mes.slice(1)} ${a.getFullYear()}`
}
// Semanas de lunes a domingo — el corte natural de la operación de un venue
function mondayOf(base: Date): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const dow = (d.getDay() + 6) % 7 // lunes = 0
  d.setDate(d.getDate() - dow)
  return iso(d)
}
const weekLabel = (start: string) => {
  const a = new Date(start + 'T00:00:00')
  const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6)
  const f = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  return `${f(a)} – ${f(b)}`
}

export function Nomina({ userId, isMaster }: { userId?: string; isMaster: boolean }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('resumen')
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [weekOps, setWeekOps] = useState<WeekOp[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  const [buId, setBuId] = useState('')
  const [qStart, setQStart] = useState(() => quincenaOf(new Date()).start)
  const [qEnd, setQEnd] = useState(() => quincenaOf(new Date()).end)
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  // Revenue por venue de la quincena visible — llega de fn_nomina_revenue_bulk
  const [revenue, setRevenue] = useState<Record<string, number>>({})
  const [staffSheet, setStaffSheet] = useState<Staff | 'new' | null>(null)

  const load = useCallback(async () => {
    const desde = new Date(); desde.setMonth(desde.getMonth() - 12)
    const [{ data: bus }, { data: st, error: stErr }, { data: pe }, { data: wo }] = await Promise.all([
      supabase.from('business_units').select('id, code, name').order('name'),
      supabase.from('payroll_staff').select('*').order('full_name'),
      supabase.from('payroll_periods').select('*').gte('period_start', iso(desde)).order('period_start', { ascending: false }),
      supabase.from('payroll_week_ops').select('*').gte('week_start', iso(desde)).order('week_start', { ascending: false }),
    ])
    if (stErr) { setMissing(true); setLoading(false); return }
    setMissing(false)
    setBuList(bus ?? [])
    setStaff((st ?? []) as Staff[])
    setPeriods((pe ?? []) as Period[])
    setWeekOps((wo ?? []) as WeekOp[])
    if (pe?.length) {
      const { data: en } = await supabase.from('payroll_entries').select('*').in('period_id', pe.map(p => p.id))
      setEntries((en ?? []) as Entry[])
    } else setEntries([])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!buId && buList.length) setBuId(buList[0].id) }, [buList, buId])

  // El revenue vive en Finanzas; aquí solo se pide el TOTAL del rango por venue
  useEffect(() => {
    supabase.rpc('fn_nomina_revenue_bulk', { p_from: qStart, p_to: qEnd }).then(({ data }) => {
      const m: Record<string, number> = {}
      for (const r of (data ?? []) as { bu_id: string; total: number }[]) m[r.bu_id] = Number(r.total)
      setRevenue(m)
    })
  }, [qStart, qEnd])

  const periodOf = (bu: string) => periods.find(p => p.bu_id === bu && p.period_start === qStart) ?? null
  const entriesOf = (periodId: string) => entries.filter(e => e.period_id === periodId)
  const costOf = (bu: string) => {
    const p = periodOf(bu)
    return p ? entriesOf(p.id).reduce((s, e) => s + Number(e.total), 0) : 0
  }

  // El % de costo laboral del holding: la referencia honesta contra la que se
  // compara cada venue. No se inventa un número "de industria" — se usa el
  // propio promedio de la operación.
  const totalCost = buList.reduce((s, b) => s + costOf(b.id), 0)
  const totalRev = buList.reduce((s, b) => s + (revenue[b.id] ?? 0), 0)
  const holdingPct = totalRev > 0 ? (totalCost / totalRev) * 100 : 0
  const headcount = useMemo(() => {
    const ids = new Set<string>()
    for (const p of periods.filter(p => p.period_start === qStart)) entriesOf(p.id).forEach(e => ids.add(e.staff_id))
    return ids.size
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods, entries, qStart])

  function moveQuincena(dir: 1 | -1) {
    const q = shiftQuincena(qStart, dir)
    setQStart(q.start); setQEnd(q.end)
  }

  if (missing) return (
    <Aviso texto="Falta correr nomina.sql en Supabase — es lo que crea las tablas de plantilla, quincenas y operación semanal." />
  )
  if (loading) return <Aviso texto="Cargando…" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Encabezado con el navegador de quincena — fijo: la quincena es el
          contexto de todo lo que se ve abajo */}
      <div style={{ flexShrink: 0, padding: '14px 20px 0', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <Users size={17} style={{ color: 'var(--accent)' }} />
          <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 17, margin: 0 }}>Nómina · temporales y eventuales</h1>
          {isMaster && <StatusBadgeV2 tone="attention" label="Solo Master" />}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => moveQuincena(-1)} aria-label="Quincena anterior" style={navBtn}><ChevronLeft size={15} /></button>
            <span className="num" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', minWidth: 168, textAlign: 'center' }}>
              {quincenaLabel(qStart, qEnd)}
            </span>
            <button onClick={() => moveQuincena(1)} aria-label="Quincena siguiente" style={navBtn}><ChevronRight size={15} /></button>
          </div>
        </div>
        <SegmentedControl scrollable value={tab} onChange={setTab} options={[
          { id: 'resumen',    label: 'Resumen' },
          { id: 'quincena',   label: 'Quincena' },
          { id: 'semanal',    label: 'Operación semanal' },
          { id: 'plantilla',  label: 'Plantilla' },
          { id: 'proyeccion', label: 'Proyección' },
        ]} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px' }}>
        {tab === 'resumen' && (
          <Resumen
            buList={buList} periods={periods} entries={entries} revenue={revenue}
            qStart={qStart} totalCost={totalCost} totalRev={totalRev}
            holdingPct={holdingPct} headcount={headcount}
            onOpenBu={(id) => { setBuId(id); setTab('quincena') }}
          />
        )}

        {tab === 'quincena' && (
          <QuincenaTab
            buList={buList} buId={buId} setBuId={setBuId} staff={staff}
            qStart={qStart} qEnd={qEnd} period={periodOf(buId)} entries={entries}
            revenue={revenue[buId] ?? 0} userId={userId} isMaster={isMaster} onChange={load}
          />
        )}

        {tab === 'semanal' && (
          <SemanalTab
            buList={buList} buId={buId} setBuId={setBuId} staff={staff}
            weekStart={weekStart} setWeekStart={setWeekStart} weekOps={weekOps}
            userId={userId} onChange={load}
          />
        )}

        {tab === 'plantilla' && (
          <PlantillaTab
            buList={buList} buId={buId} setBuId={setBuId} staff={staff}
            onNew={() => setStaffSheet('new')} onEdit={s => setStaffSheet(s)} onChange={load}
          />
        )}

        {tab === 'proyeccion' && (
          <ProyeccionTab buList={buList} periods={periods} entries={entries} staff={staff} />
        )}
      </div>

      {staffSheet && (
        <StaffSheet
          staff={staffSheet === 'new' ? null : staffSheet}
          buId={buId} buList={buList} userId={userId} isMobile={isMobile}
          onClose={() => setStaffSheet(null)}
          onSaved={() => { setStaffSheet(null); load() }}
        />
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border-default)',
  background: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const inp: React.CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none', minHeight: 40, boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

function Aviso({ texto }: { texto: string }) {
  return (
    <div style={{ padding: 24 }}>
      <p style={{ fontSize: 13, color: 'var(--status-attention)', margin: 0 }}>{texto}</p>
    </div>
  )
}

function BuPicker({ buList, buId, setBuId }: { buList: { id: string; code: string; name: string }[]; buId: string; setBuId: (v: string) => void }) {
  return (
    <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inp, cursor: 'pointer', maxWidth: 280 }}>
      {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
    </select>
  )
}

// ── RESUMEN — el tablero del Master: las 13 unidades de un vistazo ───────────
function Resumen({ buList, periods, entries, revenue, qStart, totalCost, totalRev, holdingPct, headcount, onOpenBu }: {
  buList: { id: string; code: string; name: string }[]
  periods: Period[]; entries: Entry[]; revenue: Record<string, number>; qStart: string
  totalCost: number; totalRev: number; holdingPct: number; headcount: number
  onOpenBu: (id: string) => void
}) {
  const rows = buList.map(b => {
    const p = periods.find(x => x.bu_id === b.id && x.period_start === qStart) ?? null
    const cost = p ? entries.filter(e => e.period_id === p.id).reduce((s, e) => s + Number(e.total), 0) : 0
    const rev = revenue[b.id] ?? 0
    const people = p ? entries.filter(e => e.period_id === p.id).length : 0
    return { bu: b, period: p, cost, rev, people, pct: rev > 0 ? (cost / rev) * 100 : null }
  }).sort((a, b) => b.cost - a.cost)

  const conDatos = rows.filter(r => r.cost > 0)
  const sinEnviar = rows.filter(r => !r.period || r.period.status === 'draft').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <KPITile label="Nómina quincena" value={mxn(totalCost)} icon={<Users size={12} />} />
        <KPITile label="Revenue periodo" value={mxn(totalRev)} icon={<TrendingUp size={12} />} color="#3D89C4"
          hint="Sale de Finanzas — de los ingresos capturados en este rango de fechas" />
        <KPITile label="Costo laboral" value={totalRev > 0 ? pct(holdingPct) : '—'}
          color={totalRev > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)'}
          hint="Nómina de eventuales ÷ revenue del mismo periodo. Es el promedio del holding y la referencia contra la que se compara cada venue." />
        <KPITile label="Personas" value={String(headcount)} />
      </div>

      {sinEnviar > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--status-attention) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-attention) 32%, transparent)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--status-attention)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--status-attention)' }}>{sinEnviar}</strong> {sinEnviar === 1 ? 'venue no ha enviado' : 'venues no han enviado'} su quincena.
          </span>
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>Por venue</div>
        {rows.map(r => {
          // Se compara contra el promedio del holding, no contra un número
          // inventado: desviarse 20% arriba del promedio propio es la señal.
          const desvio = r.pct != null && holdingPct > 0 ? (r.pct - holdingPct) / holdingPct : null
          const color = desvio == null ? 'var(--text-tertiary)'
            : desvio > 0.2 ? 'var(--status-risk)' : desvio < -0.2 ? 'var(--status-healthy)' : 'var(--text-secondary)'
          return (
            <button key={r.bu.id} onClick={() => onOpenBu(r.bu.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', cursor: 'pointer', marginBottom: 6, flexWrap: 'wrap' }}>
              <BUChip code={r.bu.code} size="sm" />
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, flex: 1, minWidth: 120 }}>{r.bu.name}</span>
              {r.period
                ? <StatusBadgeV2 tone={PERIOD_STATUS[r.period.status].tone} label={PERIOD_STATUS[r.period.status].label} />
                : <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>sin capturar</span>}
              <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', width: 58, textAlign: 'right' }}>{r.people} pers.</span>
              <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', width: 86, textAlign: 'right' }}>{mxn(r.cost)}</span>
              <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', width: 86, textAlign: 'right' }}>{r.rev > 0 ? mxn(r.rev) : '—'}</span>
              <span className="num" title={r.pct == null ? 'Sin revenue capturado en Finanzas para este periodo' : `Promedio del holding: ${pct(holdingPct)}`}
                style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'var(--font-mono)', width: 60, textAlign: 'right' }}>
                {r.pct != null ? pct(r.pct) : '—'}
              </span>
            </button>
          )
        })}
        {conDatos.length === 0 && (
          <EmptyStateV2 icon="💸" title="Nadie ha capturado su quincena todavía. Empieza en la pestaña Quincena." />
        )}
      </div>
    </div>
  )
}

// ── QUINCENA — la nómina que arma el gerente y aprueba el Master ─────────────
function QuincenaTab({ buList, buId, setBuId, staff, qStart, qEnd, period, entries, revenue, userId, isMaster, onChange }: {
  buList: { id: string; code: string; name: string }[]
  buId: string; setBuId: (v: string) => void; staff: Staff[]
  qStart: string; qEnd: string; period: Period | null; entries: Entry[]
  revenue: number; userId?: string; isMaster: boolean; onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [addId, setAddId] = useState('')
  const míos = entries.filter(e => period && e.period_id === period.id)
  const plantilla = staff.filter(s => s.bu_id === buId && s.active)
  const disponibles = plantilla.filter(s => !míos.some(e => e.staff_id === s.id))
  const total = míos.reduce((s, e) => s + Number(e.total), 0)
  // Aprobada o pagada ya no se toca: es el registro de lo que se dispersó
  const editable = !period || period.status === 'draft' || (isMaster && period.status === 'submitted')

  async function crearPeriodo() {
    setBusy(true)
    const { error } = await supabase.from('payroll_periods').insert({
      bu_id: buId, period_start: qStart, period_end: qEnd, created_by: userId ?? null,
    })
    setBusy(false)
    if (error) { showToast(`No se pudo abrir la quincena: ${error.message}`, 'error'); return }
    onChange()
  }

  async function agregar(staffId: string) {
    if (!period) return
    const s = plantilla.find(x => x.id === staffId)
    if (!s) return
    const { error } = await supabase.from('payroll_entries').insert({
      period_id: period.id, staff_id: s.id, shifts: 0, rate: s.rate, bonus: 0, deduction: 0, total: 0,
    })
    if (error) { showToast(`No se pudo agregar: ${error.message}`, 'error'); return }
    setAddId('')
    onChange()
  }

  // El total se guarda calculado: si mañana sube la tarifa de la persona, lo ya
  // pagado no se reescribe solo.
  async function setCampo(e: Entry, patch: Partial<Entry>) {
    const next = { ...e, ...patch }
    const total = Number(next.shifts) * Number(next.rate) + Number(next.bonus) - Number(next.deduction)
    const { error } = await supabase.from('payroll_entries').update({ ...patch, total }).eq('id', e.id)
    if (error) showToast(`No se pudo guardar: ${error.message}`, 'error')
    else onChange()
  }

  async function quitar(id: string) {
    await supabase.from('payroll_entries').delete().eq('id', id)
    onChange()
  }

  async function enviar() {
    if (!period) return
    if (!míos.length) { showToast('La quincena está vacía — agrega al menos a una persona.', 'error'); return }
    setBusy(true)
    const { error } = await supabase.from('payroll_periods')
      .update({ status: 'submitted', submitted_by: userId ?? null, submitted_at: new Date().toISOString() })
      .eq('id', period.id)
    setBusy(false)
    if (error) { showToast(`No se pudo enviar: ${error.message}`, 'error'); return }
    logActivity('payroll_submitted', 'payroll', period.id, { periodo: quincenaLabel(qStart, qEnd), total, personas: míos.length })
    showToast(`Quincena enviada — ${mxn(total)} de ${míos.length} personas.`, 'success')
    onChange()
  }

  async function decidir(status: 'approved' | 'draft') {
    if (!period) return
    setBusy(true)
    const { error } = await supabase.from('payroll_periods').update(
      status === 'approved'
        ? { status, approved_by: userId ?? null, approved_at: new Date().toISOString() }
        : { status, submitted_by: null, submitted_at: null }
    ).eq('id', period.id)
    setBusy(false)
    if (error) { showToast(`No se pudo: ${error.message}`, 'error'); return }
    logActivity(status === 'approved' ? 'payroll_approved' : 'payroll_returned', 'payroll', period.id, { periodo: quincenaLabel(qStart, qEnd), total })
    showToast(status === 'approved' ? 'Quincena aprobada.' : 'Regresada al gerente para corregir.', 'success')
    onChange()
  }

  const pctLaboral = revenue > 0 ? (total / revenue) * 100 : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <BuPicker buList={buList} buId={buId} setBuId={setBuId} />
        {period && <StatusBadgeV2 tone={PERIOD_STATUS[period.status].tone} label={PERIOD_STATUS[period.status].label} />}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            Revenue {revenue > 0 ? mxn(revenue) : '—'}
          </span>
          <span className="num" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {mxn(total)}
            {pctLaboral != null && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6, fontWeight: 400 }}>{pct(pctLaboral)}</span>}
          </span>
        </div>
      </div>

      {!period ? (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
            No hay quincena abierta para este venue en <strong>{quincenaLabel(qStart, qEnd)}</strong>.
          </p>
          <button onClick={crearPeriodo} disabled={busy}
            style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Abrir quincena
          </button>
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
            {míos.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>
                Sin nadie todavía. Agrega gente de la plantilla; si falta alguien, date de alta en la pestaña Plantilla.
              </p>
            )}
            {míos.map(e => {
              const s = staff.find(x => x.id === e.staff_id)
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 130, fontSize: 13, color: 'var(--text-primary)' }}>
                    {s?.full_name ?? '¿?'}
                    {s?.role && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>· {s.role}</span>}
                    {s && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 6, border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '1px 5px' }}>{s.kind}</span>}
                  </span>
                  <NumCell label="turnos" value={e.shifts} disabled={!editable} onSave={v => setCampo(e, { shifts: v })} width={62} />
                  <NumCell label="tarifa"  value={e.rate}   disabled={!editable} onSave={v => setCampo(e, { rate: v })} width={80} />
                  <NumCell label="bono"    value={e.bonus}  disabled={!editable} onSave={v => setCampo(e, { bonus: v })} width={72} />
                  <NumCell label="descto"  value={e.deduction} disabled={!editable} onSave={v => setCampo(e, { deduction: v })} width={72} />
                  <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', width: 84, textAlign: 'right' }}>{mxn(e.total)}</span>
                  {editable && (
                    <button onClick={() => quitar(e.id)} aria-label="Quitar" style={{ width: 28, height: 28, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><Trash2 size={12} /></button>
                  )}
                </div>
              )
            })}

            {editable && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <select value={addId} onChange={e => { setAddId(e.target.value); if (e.target.value) agregar(e.target.value) }}
                  style={{ ...inp, cursor: 'pointer', flex: 1, minWidth: 200 }}>
                  <option value="">＋ Agregar a alguien de la plantilla…</option>
                  {disponibles.map(s => <option key={s.id} value={s.id}>{s.full_name}{s.role ? ` · ${s.role}` : ''} — {mxn(s.rate)}/turno</option>)}
                </select>
                {disponibles.length === 0 && plantilla.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', alignSelf: 'center' }}>Ya está toda la plantilla en la quincena.</span>
                )}
              </div>
            )}
          </div>

          {/* Flujo: el gerente envía, el Master aprueba */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {period.status === 'draft' && (
              <button onClick={enviar} disabled={busy || !míos.length}
                style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: 999, border: '1px solid var(--accent-border)', background: míos.length ? 'var(--accent-bg)' : 'transparent', color: míos.length ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: míos.length ? 'pointer' : 'not-allowed' }}>
                <Send size={14} /> Enviar quincena a aprobación · {mxn(total)}
              </button>
            )}
            {period.status === 'submitted' && isMaster && (
              <>
                <button onClick={() => decidir('approved')} disabled={busy}
                  style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 46, borderRadius: 999, border: 'none', background: 'var(--status-healthy)', color: '#04210f', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  <Check size={15} /> Aprobar
                </button>
                <button onClick={() => decidir('draft')} disabled={busy}
                  style={{ minHeight: 46, padding: '0 16px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Regresar al gerente
                </button>
              </>
            )}
            {period.status === 'submitted' && !isMaster && (
              <p style={{ fontSize: 12, color: 'var(--status-attention)', fontWeight: 700, margin: 0 }}>⏳ Enviada — esperando aprobación.</p>
            )}
            {(period.status === 'approved' || period.status === 'paid') && (
              <p style={{ fontSize: 12, color: 'var(--status-healthy)', fontWeight: 700, margin: 0 }}>
                ✅ {PERIOD_STATUS[period.status].label} — ya no se edita. {mxn(total)} de {míos.length} personas.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Campo numérico que guarda al salir: escribir dispara una escritura por tecla
function NumCell({ label, value, onSave, width, disabled }: {
  label: string; value: number; onSave: (v: number) => void; width: number; disabled?: boolean
}) {
  return (
    <input type="number" inputMode="decimal" min={0} defaultValue={value} title={label} placeholder={label}
      disabled={disabled} className="num" key={`${label}-${value}`}
      onBlur={e => { const v = Number(e.target.value) || 0; if (v !== value) onSave(v) }}
      style={{ ...inp, width, minHeight: 34, fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', opacity: disabled ? 0.6 : 1 }} />
  )
}

// ── OPERACIÓN SEMANAL — lo que hace medible a cada persona ───────────────────
function SemanalTab({ buList, buId, setBuId, staff, weekStart, setWeekStart, weekOps, userId, onChange }: {
  buList: { id: string; code: string; name: string }[]
  buId: string; setBuId: (v: string) => void; staff: Staff[]
  weekStart: string; setWeekStart: (v: string) => void; weekOps: WeekOp[]
  userId?: string; onChange: () => void
}) {
  const plantilla = staff.filter(s => s.bu_id === buId && s.active)
  const opOf = (staffId: string) => weekOps.find(o => o.staff_id === staffId && o.week_start === weekStart) ?? null

  function moveWeek(dir: 1 | -1) {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(mondayOf(d))
  }

  // Upsert por (staff, semana): capturar dos veces la misma semana corrige, no duplica
  async function save(staffId: string, patch: Partial<WeekOp>) {
    const existing = opOf(staffId)
    const { error } = existing
      ? await supabase.from('payroll_week_ops').update(patch).eq('id', existing.id)
      : await supabase.from('payroll_week_ops').insert({
          staff_id: staffId, bu_id: buId, week_start: weekStart, created_by: userId ?? null, ...patch,
        })
    if (error) showToast(`No se pudo guardar: ${error.message}`, 'error')
    else onChange()
  }

  const totShifts = plantilla.reduce((s, p) => s + Number(opOf(p.id)?.shifts ?? 0), 0)
  const totHours = plantilla.reduce((s, p) => s + Number(opOf(p.id)?.hours ?? 0), 0)
  const totSales = plantilla.reduce((s, p) => s + Number(opOf(p.id)?.sales ?? 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <BuPicker buList={buList} buId={buId} setBuId={setBuId} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => moveWeek(-1)} aria-label="Semana anterior" style={navBtn}><ChevronLeft size={15} /></button>
          <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', minWidth: 128, textAlign: 'center' }}>{weekLabel(weekStart)}</span>
          <button onClick={() => moveWeek(1)} aria-label="Semana siguiente" style={navBtn}><ChevronRight size={15} /></button>
        </div>
        <span className="num" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {totShifts} turnos · {totHours} h{totSales > 0 && ` · ${mxn(totSales)} venta`}
        </span>
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
        Esto es lo que la quincena no dice: la quincena da el <strong>costo</strong>, esto da el <strong>rendimiento</strong>. Se captura cada semana y se acumula por persona.
      </p>

      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
        {plantilla.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Este venue no tiene plantilla todavía — date de alta en la pestaña Plantilla.</p>
        )}
        {plantilla.map(s => {
          const o = opOf(s.id)
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 130, fontSize: 13, color: 'var(--text-primary)' }}>
                {s.full_name}
                {s.role && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>· {s.role}</span>}
              </span>
              <NumCell label="turnos" value={Number(o?.shifts ?? 0)} onSave={v => save(s.id, { shifts: v })} width={62} />
              <NumCell label="horas"  value={Number(o?.hours ?? 0)}  onSave={v => save(s.id, { hours: v })} width={62} />
              <NumCell label="venta"  value={Number(o?.sales ?? 0)}  onSave={v => save(s.id, { sales: v })} width={86} />
              <NumCell label="incid." value={Number(o?.incidents ?? 0)} onSave={v => save(s.id, { incidents: v })} width={58} />
              {/* Calificación de 1 a 5 — el juicio del gerente sobre la semana */}
              <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => save(s.id, { rating: o?.rating === n ? null : n })}
                    title={`${n} de 5`}
                    style={{ width: 18, height: 26, border: 'none', background: 'none', cursor: 'pointer', color: (o?.rating ?? 0) >= n ? 'var(--accent)' : 'var(--border-strong)', fontSize: 13, padding: 0 }}>★</button>
                ))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PLANTILLA — el padrón de eventuales por venue ────────────────────────────
function PlantillaTab({ buList, buId, setBuId, staff, onNew, onEdit, onChange }: {
  buList: { id: string; code: string; name: string }[]
  buId: string; setBuId: (v: string) => void; staff: Staff[]
  onNew: () => void; onEdit: (s: Staff) => void; onChange: () => void
}) {
  const rows = staff.filter(s => s.bu_id === buId)
  async function toggleActive(s: Staff) {
    // Nunca se borra: un eventual que se fue sigue apareciendo en las quincenas
    // que ya se pagaron, y borrarlo dejaría renglones sin nombre.
    await supabase.from('payroll_staff').update({ active: !s.active }).eq('id', s.id)
    onChange()
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <BuPicker buList={buList} buId={buId} setBuId={setBuId} />
        <button onClick={onNew}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={14} /> Dar de alta
        </button>
      </div>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
        {rows.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Sin plantilla en este venue.</p>}
        {rows.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', opacity: s.active ? 1 : 0.5, flexWrap: 'wrap' }}>
            <button onClick={() => onEdit(s)} style={{ flex: 1, minWidth: 150, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{s.full_name}</span>
              {s.role && <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>· {s.role}</span>}
            </button>
            <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-mono)' }}>{s.kind}</span>
            <span className="num" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', width: 96, textAlign: 'right' }}>{mxn(s.rate)}<span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>/turno</span></span>
            <button onClick={() => toggleActive(s)} title={s.active ? 'Dar de baja (no se borra)' : 'Reactivar'}
              style={{ minHeight: 28, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 10.5, cursor: 'pointer' }}>
              {s.active ? 'Baja' : 'Reactivar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function StaffSheet({ staff, buId, buList, userId, isMobile, onClose, onSaved }: {
  staff: Staff | null; buId: string; buList: { id: string; code: string; name: string }[]
  userId?: string; isMobile: boolean; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(staff?.full_name ?? '')
  const [role, setRole] = useState(staff?.role ?? '')
  const [kind, setKind] = useState<'temporal' | 'eventual'>(staff?.kind ?? 'eventual')
  const [rate, setRate] = useState(String(staff?.rate ?? ''))
  const [phone, setPhone] = useState(staff?.phone ?? '')
  const [bu, setBu] = useState(staff?.bu_id ?? buId)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) { showToast('Ponle nombre.', 'error'); return }
    setBusy(true)
    const row = {
      bu_id: bu, full_name: name.trim(), role: role.trim() || null, kind,
      rate: Number(rate) || 0, phone: phone.trim() || null,
    }
    const { error } = staff
      ? await supabase.from('payroll_staff').update(row).eq('id', staff.id)
      : await supabase.from('payroll_staff').insert({ ...row, created_by: userId ?? null })
    setBusy(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    showToast(staff ? 'Actualizado.' : 'Dado de alta.', 'success')
    onSaved()
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={480}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>
          {staff ? 'Editar' : 'Dar de alta'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={lbl}>Nombre *</label><input value={name} onChange={e => setName(e.target.value)} style={{ ...inp, width: '100%' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>Puesto</label><input value={role} onChange={e => setRole(e.target.value)} placeholder="mesero, barback…" style={{ ...inp, width: '100%' }} /></div>
            <div><label style={lbl}>Venue</label>
              <select value={bu} onChange={e => setBu(e.target.value)} style={{ ...inp, width: '100%', cursor: 'pointer' }}>
                {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Tipo</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['eventual', 'temporal'] as const).map(k => (
                <button key={k} onClick={() => setKind(k)}
                  title={k === 'eventual' ? 'Por evento o turno suelto' : 'Recurrente durante una temporada'}
                  style={{ flex: 1, minHeight: 40, borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: kind === k ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--border-default)'}`, color: kind === k ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {k === 'eventual' ? 'Eventual' : 'Temporal'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>Tarifa por turno</label><input type="number" inputMode="decimal" min={0} value={rate} onChange={e => setRate(e.target.value)} className="num" style={{ ...inp, width: '100%' }} placeholder="0" /></div>
            <div><label style={lbl}>Teléfono</label><input value={phone} onChange={e => setPhone(e.target.value)} style={{ ...inp, width: '100%' }} /></div>
          </div>
          <button onClick={save} disabled={busy}
            style={{ minHeight: 48, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// ── PROYECCIÓN — para qué existe todo lo demás ───────────────────────────────
// Con el histórico real de quincenas aprobadas se saca el % de costo laboral
// del venue; con eso, un revenue esperado se traduce en cuánta nómina aguanta
// y en cuántos turnos son. No hay benchmark inventado: todo sale de su historia.
function ProyeccionTab({ buList, periods, entries, staff }: {
  buList: { id: string; code: string; name: string }[]
  periods: Period[]; entries: Entry[]; staff: Staff[]
}) {
  const [rev, setRev] = useState<Record<string, number>>({})
  const [esperado, setEsperado] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)

  // Últimas 6 quincenas cerradas — la base de la proyección
  const cerradas = useMemo(
    () => periods.filter(p => p.status === 'approved' || p.status === 'paid').slice(0, 6 * buList.length),
    [periods, buList.length])

  useEffect(() => {
    if (!cerradas.length) { setCargando(false); return }
    const rangos = [...new Set(cerradas.map(p => `${p.period_start}|${p.period_end}`))]
    Promise.all(rangos.map(async r => {
      const [from, to] = r.split('|')
      const { data } = await supabase.rpc('fn_nomina_revenue_bulk', { p_from: from, p_to: to })
      return { r, rows: (data ?? []) as { bu_id: string; total: number }[] }
    })).then(res => {
      const m: Record<string, number> = {}
      for (const { r, rows } of res) for (const row of rows) m[`${row.bu_id}|${r}`] = Number(row.total)
      setRev(m); setCargando(false)
    })
  }, [cerradas])

  const filas = buList.map(b => {
    const mías = cerradas.filter(p => p.bu_id === b.id)
    let costo = 0, ingreso = 0, turnos = 0
    for (const p of mías) {
      const es = entries.filter(e => e.period_id === p.id)
      costo += es.reduce((s, e) => s + Number(e.total), 0)
      turnos += es.reduce((s, e) => s + Number(e.shifts), 0)
      ingreso += rev[`${b.id}|${p.period_start}|${p.period_end}`] ?? 0
    }
    const pctHist = ingreso > 0 ? (costo / ingreso) * 100 : null
    const costoPorTurno = turnos > 0 ? costo / turnos : null
    const exp = Number(esperado[b.id] ?? '') || 0
    const nominaSugerida = pctHist != null && exp > 0 ? exp * (pctHist / 100) : null
    const turnosSugeridos = nominaSugerida != null && costoPorTurno ? Math.round(nominaSugerida / costoPorTurno) : null
    return { bu: b, n: mías.length, pctHist, costoPorTurno, exp, nominaSugerida, turnosSugeridos, activos: staff.filter(s => s.bu_id === b.id && s.active).length }
  }).filter(f => f.n > 0)

  if (cargando) return <Aviso texto="Calculando con el histórico…" />
  if (!filas.length) return (
    <EmptyStateV2 icon="📈" title="Todavía no hay quincenas aprobadas. En cuanto cierres una, aquí sale cuánta nómina aguanta cada venue según el revenue que esperes." />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.55 }}>
        Cada venue se compara <strong>contra su propia historia</strong>, no contra un promedio de industria: se toma el % de costo laboral de sus quincenas aprobadas y se aplica al revenue que esperes. Escribe el revenue esperado de la siguiente quincena.
      </p>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
        {filas.map(f => (
          <div key={f.bu.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
            <BUChip code={f.bu.code} size="sm" />
            <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600, flex: 1, minWidth: 110 }}>{f.bu.name}</span>
            <span className="num" title={`Promedio de sus últimas ${f.n} quincenas aprobadas`}
              style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', width: 74, textAlign: 'right' }}>
              {f.pctHist != null ? pct(f.pctHist) : '—'}
            </span>
            <span className="num" title="Costo promedio por turno pagado" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', width: 76, textAlign: 'right' }}>
              {f.costoPorTurno ? `${mxn(f.costoPorTurno)}/t` : '—'}
            </span>
            <input type="number" inputMode="decimal" min={0} placeholder="revenue esperado" className="num"
              value={esperado[f.bu.id] ?? ''} onChange={e => setEsperado(p => ({ ...p, [f.bu.id]: e.target.value }))}
              style={{ ...inp, width: 138, minHeight: 34, fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right' }} />
            <span className="num" style={{ fontSize: 13, fontWeight: 800, color: f.nominaSugerida != null ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', width: 96, textAlign: 'right' }}>
              {f.nominaSugerida != null ? mxn(f.nominaSugerida) : '—'}
            </span>
            <span className="num" title={`Plantilla activa: ${f.activos} personas`}
              style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', width: 68, textAlign: 'right' }}>
              {f.turnosSugeridos != null ? `${f.turnosSugeridos} turnos` : '—'}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
          <span>% histórico</span>·<span>costo/turno</span>·<span>revenue esperado</span>·<span>nómina que aguanta</span>·<span>turnos que compra</span>
        </div>
      </div>
    </div>
  )
}
