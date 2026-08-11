import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Clock, MessageCircle, CalendarDays, History } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { BUChip, KPITile } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// MI RESUMEN — el dashboard personal: todo lo que sucede alrededor de ti.
//  · Tareas asignadas para la semana (y vencidas), con horas estimadas
//  · Horas por trabajar esta semana vs horas trabajadas la semana pasada
//  · Mensajes sin leer en tareas / proyectos / deals donde estás relacionado
//  · Tus proyectos próximos
// ─────────────────────────────────────────────────────────────────────────────

interface MyTask {
  id: string; title: string; status: string; priority: string
  due_date: string | null; estimated_hours: number | null; bu_id: string | null
}
interface UnreadRow { scope: 'task' | 'event' | 'deal'; entity_id: string; title: string; unread: number; last_at: string }
interface MyPlan { id: string; name: string; date: string | null; end_date: string | null; bu_id: string; status: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const SCOPE_META: Record<UnreadRow['scope'], { label: string; color: string }> = {
  task:  { label: 'Tarea',    color: '#7FA3C2' },
  event: { label: 'Proyecto', color: '#E8A33D' },
  deal:  { label: 'Deal',     color: '#8FBF9F' },
}

export function MyWeek({ userId, userName, onOpenTask, onNavigate }: {
  userId?: string
  userName?: string
  onOpenTask: (id: string) => void
  onNavigate: (view: string) => void
}) {
  const isMobile = useIsMobile()
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [doneLastWeek, setDoneLastWeek] = useState<MyTask[]>([])
  const [unread, setUnread] = useState<UnreadRow[]>([])
  const [plans, setPlans] = useState<MyPlan[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Semana actual (lun-dom) y semana pasada
  const { monday, sunday, lastMonday } = useMemo(() => {
    const now = new Date()
    const mon = new Date(now); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6)
    const lmon = new Date(mon); lmon.setDate(lmon.getDate() - 7)
    return { monday: iso(mon), sunday: iso(sun), lastMonday: iso(lmon) }
  }, [])
  const todayISO = iso(new Date())

  const load = useCallback(async () => {
    if (!userId) return
    const [{ data: tk }, { data: dn }, { data: pl }, { data: bus }, rpc] = await Promise.all([
      supabase.from('tasks').select('id, title, status, priority, due_date, estimated_hours, bu_id')
        .eq('assigned_to', userId).eq('archived', false).neq('status', 'APPROVED').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('tasks').select('id, title, status, priority, due_date, estimated_hours, bu_id')
        .eq('assigned_to', userId).eq('status', 'APPROVED').gte('completed_at', lastMonday + 'T00:00:00').lt('completed_at', monday + 'T00:00:00'),
      supabase.from('event_plans').select('id, name, date, end_date, bu_id, status')
        .or(`responsible.eq.${userId},created_by.eq.${userId}`).neq('status', 'cancelled').order('date', { ascending: true, nullsFirst: false }),
      supabase.from('business_units').select('id, code'),
      supabase.rpc('fn_unread_messages', { p_user: userId }),
    ])
    setTasks((tk ?? []) as MyTask[])
    setDoneLastWeek((dn ?? []) as MyTask[])
    setPlans(((pl ?? []) as MyPlan[]).filter(p => p.date && (p.end_date ?? p.date)! >= todayISO).slice(0, 6))
    setBuList(bus ?? [])
    setUnread(((rpc.data ?? []) as UnreadRow[]))
    setLoading(false)
  }, [userId, monday, lastMonday, todayISO])
  useEffect(() => { load() }, [load])

  // Se refresca solo: cambios de tareas, mensajes leídos y al volver a la pestaña
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('hog:task-updated', onFocus)
    window.addEventListener('hog:msgs-read', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('hog:task-updated', onFocus)
      window.removeEventListener('hog:msgs-read', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const buCode = useMemo(() => Object.fromEntries(buList.map(b => [b.id, b.code])), [buList])
  const unreadByEntity = useMemo(() => Object.fromEntries(unread.map(u => [`${u.scope}:${u.entity_id}`, u.unread])), [unread])

  // Tareas de la semana: con fecha dentro de la semana o ya vencidas
  const weekTasks = useMemo(() =>
    tasks.filter(t => t.due_date && t.due_date <= sunday)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
    [tasks, sunday])
  const hoursToWork = weekTasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0)
  const hoursWorked = doneLastWeek.reduce((s, t) => s + (t.estimated_hours ?? 0), 0)
  const totalUnread = unread.reduce((s, u) => s + Number(u.unread), 0)

  const openUnread = (u: UnreadRow) => {
    if (u.scope === 'task') onOpenTask(u.entity_id)
    else if (u.scope === 'deal') window.dispatchEvent(new CustomEvent('hog:open-deal', { detail: u.entity_id }))
    else { localStorage.setItem('hog_pending_project', u.entity_id); onNavigate('events') }
  }
  const openPlan = (id: string) => { localStorage.setItem('hog_pending_project', id); onNavigate('events') }

  const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  const fmtRel = (ts: string) => {
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
    if (mins < 60) return `hace ${Math.max(mins, 1)} min`
    if (mins < 1440) return `hace ${Math.round(mins / 60)} h`
    return `hace ${Math.round(mins / 1440)} d`
  }

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14 }
  const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '16px', maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800, margin: 0 }}>
            {userName ? `Hola, ${userName.split(' ')[0]}` : 'Mi resumen'}
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: '2px 0 0' }} className="num">
            Semana del {fmtDay(monday)} al {fmtDay(sunday)}
          </p>
        </div>

        {/* KPIs de la semana */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8 }}>
          <KPITile label="Tareas esta semana" value={loading ? '…' : String(weekTasks.length)} hint={`${tasks.length} abiertas en total`} icon={<CheckSquare size={12} style={{ color: 'var(--accent)' }} />} />
          <KPITile label="Horas por trabajar" value={loading ? '…' : `${hoursToWork} h`} hint="Suma de horas estimadas de tus tareas de la semana" icon={<Clock size={12} style={{ color: '#E8A33D' }} />} />
          <KPITile label="Horas sem. pasada" value={loading ? '…' : `${hoursWorked} h`} hint={`${doneLastWeek.length} tareas cerradas la semana pasada`} icon={<History size={12} style={{ color: '#8FBF9F' }} />} />
          <KPITile label="Mensajes sin leer" value={loading ? '…' : String(totalUnread)} color={totalUnread > 0 ? 'var(--accent)' : undefined} hint="En tareas, proyectos y deals donde estás relacionado" icon={<MessageCircle size={12} style={{ color: totalUnread > 0 ? 'var(--accent)' : 'var(--text-tertiary)' }} />} />
        </div>

        {/* Mensajes pendientes */}
        <div style={card}>
          <p style={secTitle}><MessageCircle size={12} /> Mensajes pendientes {totalUnread > 0 && `· ${totalUnread}`}</p>
          {unread.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>Estás al día — sin mensajes por leer. ✓✓</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {unread.map(u => (
                <button key={`${u.scope}:${u.entity_id}`} onClick={() => openUnread(u)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', color: SCOPE_META[u.scope].color, border: `1px solid ${SCOPE_META[u.scope].color}`, borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>{SCOPE_META[u.scope].label}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.title}</span>
                  <span className="num" style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtRel(u.last_at)}</span>
                  <span className="num" style={{ minWidth: 22, height: 22, borderRadius: 11, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0 }}>{u.unread}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mis tareas de la semana */}
        <div style={card}>
          <p style={secTitle}><CheckSquare size={12} /> Mis tareas de la semana {weekTasks.length > 0 && `· ${weekTasks.length}`}</p>
          {weekTasks.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>Sin tareas con fecha esta semana.{tasks.length > 0 ? ` Tienes ${tasks.length} abiertas sin fecha próxima.` : ''}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {weekTasks.map(t => {
                const overdue = t.due_date! < todayISO
                return (
                  <button key={t.id} onClick={() => onOpenTask(t.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
                    <span className="num" style={{ fontSize: 10, fontWeight: overdue ? 800 : 600, fontFamily: 'var(--font-mono)', color: overdue ? 'var(--status-risk)' : 'var(--text-tertiary)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <CalendarDays size={10} /> {fmtDay(t.due_date!)}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    {t.estimated_hours != null && (
                      <span className="num" style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}><Clock size={10} /> {t.estimated_hours}h</span>
                    )}
                    {t.bu_id && buCode[t.bu_id] && <BUChip code={buCode[t.bu_id]} size="sm" />}
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', flexShrink: 0 }}>{t.status}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Mis proyectos próximos */}
        <div style={card}>
          <p style={secTitle}><CalendarDays size={12} /> Mis proyectos próximos</p>
          {plans.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>Sin proyectos próximos donde seas responsable o creador.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {plans.map(p => {
                const msgs = unreadByEntity[`event:${p.id}`]
                return (
                  <button key={p.id} onClick={() => openPlan(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
                    <span className="num" style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {p.date ? fmtDay(p.date) : '—'}{p.end_date && p.end_date !== p.date ? ` – ${fmtDay(p.end_date)}` : ''}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {buCode[p.bu_id] && <BUChip code={buCode[p.bu_id]} size="sm" />}
                    {msgs && <span className="num" style={{ minWidth: 20, height: 20, borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{msgs}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
