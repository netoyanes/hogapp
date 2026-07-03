import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Target, Plus, ChevronDown, ChevronRight, Star, Check, X, Trash2, Building2, User as UserIcon, Users } from 'lucide-react'
import { Avatar } from '../components/ui/Avatar'
import { KPITile, SegmentedControl } from '../components/v2'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import type { Profile } from '../types'

type Level = 'COMPANY' | 'MANAGER' | 'INDIVIDUAL'

interface Objective {
  id: string
  title: string
  description: string | null
  level: Level
  owner_id: string | null
  created_by: string | null
  year: number
  quarter: number
  target_value: number
  current_value: number
  unit: string | null
}
interface MonthRow { id: string; objective_id: string; month: number; target_value: number; current_value: number }
interface SelfEval { id: string; objective_id: string; user_id: string; score: number | null; note: string | null; created_at: string }

interface Props {
  profile?: Profile | null
  userId?: string
  userRole?: string
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const quarterMonths = (q: number) => [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3]

const LEVEL_META: Record<Level, { label: string; color: string; icon: React.ElementType }> = {
  COMPANY:    { label: 'Compañía',   color: '#A785C9', icon: Building2 },
  MANAGER:    { label: 'Manager',    color: '#7FA3C2', icon: Users },
  INDIVIDUAL: { label: 'Individual', color: 'var(--status-healthy)', icon: UserIcon },
}

function pct(cur: number, tgt: number) {
  if (!tgt) return 0
  return Math.min(100, Math.round((cur / tgt) * 100))
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
}

export function Objectives({ userId, userRole }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1)
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [months, setMonths] = useState<MonthRow[]>([])
  const [evals, setEvals] = useState<SelfEval[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const isMaster = userRole === 'MASTER'
  const canCreateCompany = isMaster || userRole === 'C_LEVEL'
  const canCreateForOthers = canCreateCompany || userRole === 'OPS_MANAGER'

  const load = useCallback(async () => {
    const [{ data: obj }, { data: mo }, { data: ev }, { data: members }] = await Promise.all([
      supabase.from('objectives').select('*').eq('year', year).eq('quarter', quarter).order('created_at'),
      supabase.from('objective_months').select('*'),
      supabase.from('self_evaluations').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, role').not('full_name', 'is', null).order('full_name'),
    ])
    setObjectives((obj ?? []) as Objective[])
    setMonths((mo ?? []) as MonthRow[])
    setEvals((ev ?? []) as SelfEval[])
    if (members) {
      const n: Record<string, string> = {}
      for (const m of members) n[m.id] = m.full_name ?? m.email ?? 'Unknown'
      setNames(n)
      setTeamMembers(members.map(m => ({ id: m.id, name: m.full_name ?? m.email ?? 'Unknown' })))
    }
  }, [year, quarter])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  async function updateCurrent(obj: Objective, value: number) {
    setObjectives(prev => prev.map(o => o.id === obj.id ? { ...o, current_value: value } : o))
    await supabase.from('objectives').update({ current_value: value, updated_at: new Date().toISOString() }).eq('id', obj.id)
  }

  async function deleteObjective(id: string) {
    setObjectives(prev => prev.filter(o => o.id !== id))
    await supabase.from('objectives').delete().eq('id', id)
  }

  async function toggleExpand(obj: Objective) {
    const next = new Set(expanded)
    if (next.has(obj.id)) { next.delete(obj.id); setExpanded(next); return }
    next.add(obj.id); setExpanded(next)
    // Lazily create the 3 monthly rows for this quarter
    const existing = months.filter(m => m.objective_id === obj.id)
    if (existing.length === 0) {
      const qm = quarterMonths(obj.quarter)
      const rows = qm.map(m => ({ objective_id: obj.id, month: m, target_value: 0, current_value: 0 }))
      const { data } = await supabase.from('objective_months').insert(rows).select('*')
      if (data) setMonths(prev => [...prev, ...(data as MonthRow[])])
    }
  }

  async function updateMonth(row: MonthRow, field: 'target_value' | 'current_value', value: number) {
    setMonths(prev => prev.map(m => m.id === row.id ? { ...m, [field]: value } : m))
    await supabase.from('objective_months').update({ [field]: value }).eq('id', row.id)
  }

  async function saveSelfEval(obj: Objective, score: number, note: string) {
    if (!userId) return
    const { data } = await supabase.from('self_evaluations').insert({
      objective_id: obj.id, user_id: userId, score, note: note || null,
    }).select('*').single()
    if (data) setEvals(prev => [data as SelfEval, ...prev])
  }

  function canEdit(obj: Objective) {
    return isMaster || obj.created_by === userId || obj.owner_id === userId || canCreateForOthers
  }

  const company = objectives.filter(o => o.level === 'COMPANY')
  const mine = objectives.filter(o => o.level !== 'COMPANY' && o.owner_id === userId)
  const team = objectives.filter(o => o.level !== 'COMPANY' && o.owner_id !== userId)

  const overall = (list: Objective[]) => {
    if (!list.length) return 0
    return Math.round(list.reduce((s, o) => s + pct(o.current_value, o.target_value), 0) / list.length)
  }

  const renderSection = (title: string, objs: Objective[]) => {
    if (objs.length === 0) return null
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{title.toUpperCase()}</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
          <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>{objs.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {objs.map(obj => (
            <ObjectiveCard
              key={obj.id}
              obj={obj}
              months={months.filter(m => m.objective_id === obj.id).sort((a, b) => a.month - b.month)}
              evals={evals.filter(e => e.objective_id === obj.id)}
              names={names}
              userId={userId}
              editable={canEdit(obj)}
              isOpen={expanded.has(obj.id)}
              onToggleExpand={() => toggleExpand(obj)}
              onUpdateCurrent={(v) => updateCurrent(obj, v)}
              onUpdateMonth={updateMonth}
              onDelete={() => deleteObjective(obj.id)}
              onSaveEval={(score, note) => saveSelfEval(obj, score, note)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <Target size={18} style={{ color: 'var(--accent)' }} />
            <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '17px' }}>Objetivos</h1>
          </div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ ...inputStyle, width: 'auto', minHeight: '36px', cursor: 'pointer' }}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', minHeight: 'var(--touch-target)', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 999, cursor: 'pointer', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
            <Plus size={14} /> Crear objetivo
          </button>
        </div>

        {/* Quarter as segmented control */}
        <SegmentedControl
          options={[1, 2, 3, 4].map(q => ({ id: String(q), label: `Q${q}` }))}
          value={String(quarter)}
          onChange={(id) => setQuarter(Number(id))}
        />

        {/* Summary tiles */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
          <KPITile label="Compañía" value={`${overall(company)}%`} color="#A785C9" />
          <KPITile label="Míos" value={`${overall(mine)}%`} color="var(--status-healthy)" />
          <KPITile label="Objetivos" value={String(objectives.length)} />
        </div>
      </div>

      {/* Lists */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {objectives.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', paddingTop: '40px' }}>
            No hay objetivos para Q{quarter} {year}. Crea el primero.
          </div>
        )}
        {renderSection('Objetivos de compañía', company)}
        {renderSection('Mis objetivos', mine)}
        {(canCreateForOthers || team.length > 0) && renderSection('Objetivos del equipo', team)}
      </div>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load() }}
          year={year} quarter={quarter}
          userId={userId}
          canCreateCompany={canCreateCompany}
          canCreateForOthers={canCreateForOthers}
          teamMembers={teamMembers}
        />
      )}
    </div>
  )
}

// ── Objective card (top-level so self-eval draft state survives re-renders) ──
function ObjectiveCard({ obj, months, evals, names, userId, editable, isOpen, onToggleExpand, onUpdateCurrent, onUpdateMonth, onDelete, onSaveEval }: {
  obj: Objective
  months: MonthRow[]
  evals: SelfEval[]
  names: Record<string, string>
  userId?: string
  editable: boolean
  isOpen: boolean
  onToggleExpand: () => void
  onUpdateCurrent: (value: number) => void
  onUpdateMonth: (row: MonthRow, field: 'target_value' | 'current_value', value: number) => void
  onDelete: () => void
  onSaveEval: (score: number, note: string) => void
}) {
  const meta = LEVEL_META[obj.level]
  const LevelIcon = meta.icon
  const progress = pct(obj.current_value, obj.target_value)
  const myEval = evals.find(e => e.user_id === userId)
  const isOwner = obj.owner_id === userId
  const ownerName = obj.owner_id ? names[obj.owner_id] : null
  const done = progress >= 100

  const [evalOpen, setEvalOpen] = useState(false)
  const [score, setScore] = useState(myEval?.score ?? 0)
  const [note, setNote] = useState('')

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
      {/* Title row + % hero */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{obj.title}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)`, borderRadius: '4px', padding: '1px 6px' }}>
              <LevelIcon size={10} /> {meta.label}
            </span>
            {ownerName && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{ownerName}</span>}
          </div>
          {obj.description && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>{obj.description}</p>}
          <p className="num" style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '6px 0 0' }}>
            {obj.current_value} / {obj.target_value} {obj.unit ?? ''}
          </p>
        </div>
        {/* Progress is the hero */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="num" style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1, color: done ? 'var(--status-healthy)' : 'var(--accent)' }}>
            {progress}<span style={{ fontSize: '14px' }}>%</span>
          </div>
          {editable && (
            <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px 0 0', marginLeft: 'auto', display: 'block' }} title="Eliminar objetivo">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Thin progress bar */}
      <div style={{ marginTop: '10px', height: '4px', background: 'var(--bg-base)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: done ? 'var(--status-healthy)' : 'var(--accent)', transition: 'width 0.3s' }} />
      </div>

      {editable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Progreso actual:</span>
          <input
            type="number" defaultValue={obj.current_value}
            onBlur={e => { const v = Number(e.target.value); if (v !== obj.current_value) onUpdateCurrent(v) }}
            className="num"
            style={{ ...inputStyle, width: '90px', padding: '4px 8px' }}
          />
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
        <button onClick={onToggleExpand} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '11px', minHeight: '32px' }}>
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Desglose mensual
        </button>
        {isOwner && (
          <button onClick={() => setEvalOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: myEval ? 'var(--status-attention)' : 'var(--text-secondary)', fontSize: '11px', minHeight: '32px' }}>
            <Star size={13} style={{ fill: myEval ? 'var(--status-attention)' : 'none' }} /> {myEval ? `Autoeval: ${myEval.score}/5` : 'Autoevaluar'}
          </button>
        )}
      </div>

      {/* Monthly breakdown — 3-cell mini table: meta vs real per month */}
      {isOpen && (
        <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {months.map(m => {
            const mp = pct(m.current_value, m.target_value)
            return (
              <div key={m.id} style={{ background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{MONTHS[m.month - 1]}</span>
                  <span className="num" style={{ fontSize: '11px', fontWeight: 700, color: mp >= 100 ? 'var(--status-healthy)' : 'var(--text-tertiary)' }}>{mp}%</span>
                </div>
                {editable ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" defaultValue={m.current_value} onBlur={e => onUpdateMonth(m, 'current_value', Number(e.target.value))} className="num" style={{ ...inputStyle, padding: '4px 6px', fontSize: '11px' }} title="Real" />
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', flexShrink: 0 }}>/</span>
                    <input type="number" defaultValue={m.target_value} onBlur={e => onUpdateMonth(m, 'target_value', Number(e.target.value))} className="num" style={{ ...inputStyle, padding: '4px 6px', fontSize: '11px' }} title="Meta" />
                  </div>
                ) : (
                  <div className="num" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{m.current_value} / {m.target_value}</div>
                )}
                <div style={{ marginTop: '6px', height: '3px', background: 'var(--bg-surface)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${mp}%`, background: mp >= 100 ? 'var(--status-healthy)' : 'var(--accent)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Self-eval */}
      {evalOpen && isOwner && (
        <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Tu autoevaluación:</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setScore(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px' }}>
                <Star size={18} style={{ color: 'var(--status-attention)', fill: n <= score ? 'var(--status-attention)' : 'none' }} />
              </button>
            ))}
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Nota (opcional)…" style={{ ...inputStyle, resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button onClick={() => setEvalOpen(false)} style={{ padding: '8px 12px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
            <button onClick={() => { if (score) { onSaveEval(score, note); setEvalOpen(false); setNote('') } }} disabled={!score} style={{ padding: '8px 12px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, opacity: score ? 1 : 0.5 }}>
              <Check size={12} style={{ display: 'inline', marginRight: '4px' }} />Guardar
            </button>
          </div>
          {/* Past evals */}
          {evals.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
              <Avatar name={names[e.user_id] ?? 'Unknown'} size={20} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{names[e.user_id] ?? 'Unknown'}</span>
              <span className="num" style={{ fontSize: '11px', color: 'var(--status-attention)' }}>{e.score}/5</span>
              {e.note && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>· {e.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Create modal ─────────────────────────────────────────────────────────────
function CreateModal({ onClose, onCreated, year, quarter, userId, canCreateCompany, canCreateForOthers, teamMembers }: {
  onClose: () => void
  onCreated: () => void
  year: number
  quarter: number
  userId?: string
  canCreateCompany: boolean
  canCreateForOthers: boolean
  teamMembers: { id: string; name: string }[]
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [level, setLevel] = useState<Level>(canCreateCompany ? 'COMPANY' : 'INDIVIDUAL')
  const [ownerId, setOwnerId] = useState<string>(userId ?? '')
  const [target, setTarget] = useState('100')
  const [unit, setUnit] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    await supabase.from('objectives').insert({
      title: title.trim(),
      description: description.trim() || null,
      level,
      owner_id: level === 'COMPANY' ? null : (ownerId || userId || null),
      created_by: userId ?? null,
      year, quarter,
      target_value: Number(target) || 0,
      current_value: 0,
      unit: unit.trim() || null,
    })
    setSaving(false)
    onCreated()
  }

  const levelOptions: Level[] = canCreateCompany
    ? ['COMPANY', 'MANAGER', 'INDIVIDUAL']
    : canCreateForOthers ? ['MANAGER', 'INDIVIDUAL'] : ['INDIVIDUAL']

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: '20px', width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700 }}>Crear objetivo — Q{quarter} {year}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del objetivo *" style={inputStyle} autoFocus />
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Descripción (opcional)…" style={{ ...inputStyle, resize: 'vertical' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Nivel</label>
              <select value={level} onChange={e => setLevel(e.target.value as Level)} style={inputStyle}>
                {levelOptions.map(l => <option key={l} value={l}>{LEVEL_META[l].label}</option>)}
              </select>
            </div>
            {level !== 'COMPANY' && canCreateForOthers && (
              <div>
                <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Dueño</label>
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} style={inputStyle}>
                  {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Meta (número)</label>
              <input type="number" value={target} onChange={e => setTarget(e.target.value)} className="num" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Unidad</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="deals, $, %, posts…" style={inputStyle} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button onClick={onClose} style={{ padding: '10px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !title.trim()} style={{ padding: '10px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '13px', fontWeight: 700, opacity: saving || !title.trim() ? 0.5 : 1 }}>
            {saving ? 'Guardando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}
