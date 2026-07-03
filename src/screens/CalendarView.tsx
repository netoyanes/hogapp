import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TaskDetailPanel } from '../components/ui/TaskDetailPanel'
import { DealOverlay } from '../components/ui/DealOverlay'
import type { Task } from '../types'

interface EventDeal { id: string; title: string; event_date: string | null }
const EVENT_COLOR = '#EC4899'
const RES_COLOR = 'var(--accent)'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: '#EF4444',
  MEDIUM: '#EAB308',
  LOW: '#22C55E',
}

interface Props {
  userRole?: string
  defaultBuFilter?: string
}

export function CalendarView({ userRole, defaultBuFilter }: Props) {
  const today = new Date()
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [tasks, setTasks] = useState<Task[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [filterBu, setFilterBu] = useState(defaultBuFilter ?? '')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [eventDeals, setEventDeals] = useState<EventDeal[]>([])
  const [resCounts, setResCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: taskData }, { data: buses }, { data: deals }] = await Promise.all([
        supabase.from('tasks').select('*').eq('archived', false).not('due_date', 'is', null),
        supabase.from('business_units').select('id, code, name').order('name'),
        supabase.from('crm_deals').select('id, title, event_date').eq('deal_type', 'EVENT').not('event_date', 'is', null),
      ])
      setTasks(taskData ?? [])
      setBuList(buses ?? [])
      setEventDeals((deals ?? []) as EventDeal[])
      setLoading(false)
    }
    load()
  }, [])

  const year = current.getFullYear()
  const month = current.getMonth()

  // Indicador de reservas por día (conteo, sin saturar el grid con reservas individuales)
  useEffect(() => {
    async function loadRes() {
      const first = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const last = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`
      let q = supabase.from('reservations').select('date, bu_id, status').gte('date', first).lte('date', last)
      if (filterBu) q = q.eq('bu_id', filterBu)
      const { data } = await q
      const counts: Record<string, number> = {}
      for (const r of data ?? []) {
        if (r.status === 'cancelled') continue
        counts[r.date] = (counts[r.date] ?? 0) + 1
      }
      setResCounts(counts)
    }
    loadRes()
  }, [year, month, filterBu])

  function goToReservations(day: number) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    sessionStorage.setItem('hog_res_goto', iso)
    window.dispatchEvent(new CustomEvent('hog:open-reservations'))
  }

  function eventsForDay(day: number): EventDeal[] {
    return eventDeals.filter(e => {
      if (!e.event_date) return false
      const d = new Date(e.event_date + 'T00:00:00')
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const filtered = filterBu ? tasks.filter(t => t.bu_id === filterBu) : tasks

  function tasksForDay(day: number): Task[] {
    return filtered.filter(t => {
      if (!t.due_date) return false
      const d = new Date(t.due_date + 'T00:00:00')
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  function isToday(day: number) {
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
  }

  const btnStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    padding: '5px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  }

  const selectStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, padding: '14px 20px' }}>
        <div className="flex items-center justify-between mb-3">
          <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '17px' }}>Calendario</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))}
              style={{ ...selectStyle }}
            >
              Hoy
            </button>
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))} style={btnStyle}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', minWidth: '140px', textAlign: 'center' }}>
              {MONTHS[month]} {year}
            </span>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))} style={btnStyle}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select value={filterBu} onChange={e => setFilterBu(e.target.value)} style={selectStyle}>
            <option value="">Todas las BUs</option>
            {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
          {filterBu && (
            <button onClick={() => setFilterBu('')} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer' }}>
              Limpiar
            </button>
          )}
          <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>{filtered.filter(t => {
              const d = t.due_date ? new Date(t.due_date + 'T00:00:00') : null
              return d && d.getFullYear() === year && d.getMonth() === month
            }).length} tareas</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: EVENT_COLOR }}>
              <PartyPopper size={11} />
              {eventDeals.filter(e => {
                const d = e.event_date ? new Date(e.event_date + 'T00:00:00') : null
                return d && d.getFullYear() === year && d.getMonth() === month
              }).length} eventos
            </span>
          </span>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
          {DAYS.map(d => (
            <div key={d} style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontWeight: 600, textAlign: 'center', padding: '4px 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} style={{ minHeight: '90px' }} />

            const dayTasks = loading ? [] : tasksForDay(day)
            const dayEvents = loading ? [] : eventsForDay(day)
            const visible = dayTasks.slice(0, 3)
            const overflow = dayTasks.length - 3

            return (
              <div
                key={day}
                style={{
                  minHeight: '90px',
                  background: isToday(day) ? 'var(--accent-bg)' : 'var(--bg-surface)',
                  border: `1px solid ${isToday(day) ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                  borderRadius: '8px',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <span style={{
                  color: isToday(day) ? 'var(--accent)' : 'var(--text-tertiary)',
                  fontSize: '11px',
                  fontWeight: isToday(day) ? 700 : 400,
                  fontFamily: 'var(--font-mono)',
                  alignSelf: 'flex-end',
                }}>
                  {day}
                </span>

                {/* Indicador de reservas del día → tap abre Reservas en esa fecha */}
                {(resCounts[`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`] ?? 0) > 0 && (
                  <button
                    onClick={() => goToReservations(day)}
                    title="Abrir Reservas de este día"
                    style={{
                      background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '4px',
                      padding: '2px 5px', fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                      color: RES_COLOR, cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}
                  >
                    🍸 {resCounts[`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`]} reservas
                  </button>
                )}

                {/* CRM events */}
                {dayEvents.map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedDealId(ev.id)}
                    title={`Evento: ${ev.title}`}
                    style={{
                      background: `${EVENT_COLOR}20`,
                      border: `1px solid ${EVENT_COLOR}55`,
                      borderRadius: '4px',
                      padding: '2px 5px',
                      fontSize: '10px',
                      color: EVENT_COLOR,
                      cursor: 'pointer',
                      textAlign: 'left',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 600,
                    }}
                  >
                    <PartyPopper size={10} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
                  </button>
                ))}

                {visible.map(task => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    title={task.title}
                    style={{
                      background: `${PRIORITY_COLORS[task.priority]}18`,
                      border: `1px solid ${PRIORITY_COLORS[task.priority]}40`,
                      borderRadius: '4px',
                      padding: '2px 5px',
                      fontSize: '10px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: PRIORITY_COLORS[task.priority], flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</span>
                  </button>
                ))}

                {overflow > 0 && (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', paddingLeft: '4px' }}>
                    +{overflow} more
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          userRole={userRole}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={() => {
            supabase.from('tasks').select('*').eq('archived', false).not('due_date', 'is', null)
              .then(({ data }) => setTasks(data ?? []))
          }}
        />
      )}

      {selectedDealId && (
        <DealOverlay
          dealId={selectedDealId}
          userRole={userRole}
          onClose={() => setSelectedDealId(null)}
        />
      )}
    </div>
  )
}
