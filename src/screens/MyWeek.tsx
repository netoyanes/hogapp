import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Clock, MessageCircle, CalendarDays, Handshake, Banknote, Timer, MailOpen, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { BUChip, KPITile } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// MI RESUMEN — el dashboard personal orientado a PRODUCTIVIDAD.
//  · Hoy: tareas de la semana + mensajes sin leer (accionable ya)
//  · Mes: deals activos y $ en juego, tiempo de respuesta a actividades y a
//    mensajes — todos con variación vs el mes anterior (▲/▼)
//  · Las horas estimadas/trabajadas NO se muestran aquí: son el indicador
//    con el que el Master mide al equipo, no un dato de autogestión.
// ─────────────────────────────────────────────────────────────────────────────

interface MyTask {
  id: string; title: string; status: string; priority: string
  due_date: string | null; estimated_hours: number | null; bu_id: string | null
}
interface UnreadRow { scope: 'task' | 'event' | 'deal'; entity_id: string; title: string; unread: number; last_at: string }
interface MyPlan { id: string; name: string; date: string | null; end_date: string | null; bu_id: string; status: string }
interface MonthMetrics {
  dealsNow: number; dealsPrev: number
  moneyNow: number; moneyPrev: number
  taskRespNow: number | null; taskRespPrev: number | null // horas promedio creada→cerrada
  msgRespNow: number | null; msgRespPrev: number | null   // horas promedio recibido→leído
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const SCOPE_META: Record<UnreadRow['scope'], { label: string; color: string }> = {
  task:  { label: 'Tarea',    color: '#7FA3C2' },
  event: { label: 'Proyecto', color: '#E8A33D' },
  deal:  { label: 'Deal',     color: '#8FBF9F' },
}
const DEAL_TERMINAL = new Set(['WON', 'LOST'])
// Dónde vive cada chat (mismo mapa que EntityChat) — para medir recibido→leído
const CMT_CFG: Record<string, { table: string; author: string }> = {
  task:  { table: 'task_comments',  author: 'author_id' },
  event: { table: 'event_comments', author: 'author_id' },
  deal:  { table: 'crm_activities', author: 'created_by' },
}

const fmtMoney = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)} M` : n >= 1000 ? `$${Math.round(n / 1000)} k` : `$${Math.round(n)}`
const fmtDur = (h: number | null) =>
  h == null ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h < 10 ? h.toFixed(1) : Math.round(h)} h` : `${(h / 24).toFixed(1)} d`
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

// ── Tile mensual con variación vs mes anterior ───────────────────────────────
// dir: 'up' cuando subir es bueno (deals, $) · 'down' cuando bajar es bueno
// (tiempos de respuesta). El color premia la dirección correcta, no el signo.
function MetricTile({ label, value, icon, delta, hint }: {
  label: string; value: string; icon: React.ReactNode
  delta: { text: string; good: boolean | null } | null
  hint?: string
}) {
  const deltaColor = delta?.good == null ? 'var(--text-tertiary)' : delta.good ? 'var(--status-healthy)' : 'var(--status-risk)'
  const DeltaIcon = delta?.good == null ? Minus : delta.text.startsWith('−') || delta.text.startsWith('-') ? TrendingDown : TrendingUp
  return (
    <div title={hint} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
        {icon} {label}
      </span>
      <span className="num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</span>
      {delta ? (
        <span className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: deltaColor }}>
          <DeltaIcon size={11} /> {delta.text}
        </span>
      ) : (
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>sin datos del mes pasado</span>
      )}
    </div>
  )
}

export function MyWeek({ userId, userName, onOpenTask, onNavigate }: {
  userId?: string
  userName?: string
  onOpenTask: (id: string) => void
  onNavigate: (view: string) => void
}) {
  const isMobile = useIsMobile()
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [unread, setUnread] = useState<UnreadRow[]>([])
  const [plans, setPlans] = useState<MyPlan[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string }[]>([])
  const [metrics, setMetrics] = useState<MonthMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  // Semana actual (lun-dom) + fronteras de mes actual y anterior
  const { monday, sunday, monthStart, prevMonthStart, mesLabel, prevMesShort } = useMemo(() => {
    const now = new Date()
    const mon = new Date(now); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6)
    const ms = new Date(now.getFullYear(), now.getMonth(), 1)
    const pms = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return {
      monday: iso(mon), sunday: iso(sun),
      monthStart: iso(ms), prevMonthStart: iso(pms),
      mesLabel: now.toLocaleDateString('es-MX', { month: 'long' }),
      prevMesShort: pms.toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''),
    }
  }, [])
  const todayISO = iso(new Date())

  const load = useCallback(async () => {
    if (!userId) return
    const [{ data: tk }, { data: pl }, { data: bus }, rpc, { data: myActs }, { data: allDeals }, { data: doneTasks }, { data: reads }] = await Promise.all([
      supabase.from('tasks').select('id, title, status, priority, due_date, estimated_hours, bu_id')
        .eq('assigned_to', userId).eq('archived', false).neq('status', 'APPROVED').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('event_plans').select('id, name, date, end_date, bu_id, status')
        .or(`responsible.eq.${userId},created_by.eq.${userId}`).neq('status', 'cancelled').order('date', { ascending: true, nullsFirst: false }),
      supabase.from('business_units').select('id, code'),
      supabase.rpc('fn_unread_messages', { p_user: userId }),
      // Deals "tuyos": los que creaste o donde ya participaste en la actividad
      supabase.from('crm_activities').select('deal_id').eq('created_by', userId),
      supabase.from('crm_deals').select('id, value, stage, created_by, created_at, updated_at'),
      // Respuesta a actividades: tus tareas cerradas en este mes y el anterior
      supabase.from('tasks').select('created_at, completed_at').eq('assigned_to', userId)
        .eq('status', 'APPROVED').gte('completed_at', prevMonthStart + 'T00:00:00'),
      // Respuesta a mensajes: tus recibos de lectura (✓✓) del bimestre
      supabase.from('comment_reads').select('scope, comment_id, read_at').eq('user_id', userId)
        .gte('read_at', prevMonthStart + 'T00:00:00').order('read_at', { ascending: false }).limit(600),
    ])
    setTasks((tk ?? []) as MyTask[])
    setPlans(((pl ?? []) as MyPlan[]).filter(p => p.date && (p.end_date ?? p.date)! >= todayISO).slice(0, 6))
    setBuList(bus ?? [])
    setUnread(((rpc.data ?? []) as UnreadRow[]))

    // ── Deals activos + $ en juego, hoy vs arranque de mes ──
    const monthT = monthStart + 'T00:00:00'
    const participated = new Set((myActs ?? []).map(a => a.deal_id))
    const mine = (allDeals ?? []).filter(d => d.created_by === userId || participated.has(d.id))
    const activeNow = mine.filter(d => !DEAL_TERMINAL.has(d.stage))
    // "Activos el mes pasado": ya existían al iniciar el mes y seguían vivos
    // entonces (si cerraron, fue ya entrado este mes → updated_at lo delata)
    const activePrev = mine.filter(d => d.created_at < monthT && (!DEAL_TERMINAL.has(d.stage) || (d.updated_at ?? '') >= monthT))
    const sumVal = (ds: typeof mine) => ds.reduce((s, d) => s + Number(d.value ?? 0), 0)

    // ── Tiempo de respuesta de actividades: creada → cerrada (horas) ──
    const tNow: number[] = [], tPrev: number[] = []
    for (const t of doneTasks ?? []) {
      if (!t.created_at || !t.completed_at) continue
      const hrs = (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / 3600000
      if (hrs < 0) continue
      ;(t.completed_at >= monthT ? tNow : tPrev).push(hrs)
    }

    // ── Tiempo de respuesta a mensajes: recibido → leído (horas) ──
    // El created_at del mensaje vive en la tabla de cada scope; se resuelve por
    // lotes y se ignoran mensajes propios y lecturas de arranque (>30 días).
    const byScope: Record<string, string[]> = {}
    for (const r of reads ?? []) (byScope[r.scope] ??= []).push(r.comment_id)
    const createdMap = new Map<string, string>()
    await Promise.all(Object.entries(byScope).map(async ([scope, ids]) => {
      const cfg = CMT_CFG[scope]
      if (!cfg) return
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from(cfg.table).select(`id, created_at, ${cfg.author}`)
          .in('id', ids.slice(i, i + 200)).neq(cfg.author, userId)
        for (const c of (data ?? []) as unknown as { id: string; created_at: string }[]) {
          createdMap.set(`${scope}:${c.id}`, c.created_at)
        }
      }
    }))
    const mNow: number[] = [], mPrev: number[] = []
    for (const r of reads ?? []) {
      const created = createdMap.get(`${r.scope}:${r.comment_id}`)
      if (!created) continue
      const hrs = (new Date(r.read_at).getTime() - new Date(created).getTime()) / 3600000
      if (hrs < 0 || hrs > 24 * 30) continue
      ;(r.read_at >= monthT ? mNow : mPrev).push(hrs)
    }

    setMetrics({
      dealsNow: activeNow.length, dealsPrev: activePrev.length,
      moneyNow: sumVal(activeNow), moneyPrev: sumVal(activePrev),
      taskRespNow: avg(tNow), taskRespPrev: avg(tPrev),
      msgRespNow: avg(mNow), msgRespPrev: avg(mPrev),
    })
    setLoading(false)
  }, [userId, monthStart, prevMonthStart, todayISO])
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
  const totalUnread = unread.reduce((s, u) => s + Number(u.unread), 0)

  // Deltas del mes: en deals/$ subir es bueno; en tiempos, bajar es bueno
  const dealDelta = useMemo(() => {
    if (!metrics) return null
    const d = metrics.dealsNow - metrics.dealsPrev
    return { text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} vs ${prevMesShort}`, good: d === 0 ? null : d > 0 }
  }, [metrics, prevMesShort])
  const moneyDelta = useMemo(() => {
    if (!metrics) return null
    const d = metrics.moneyNow - metrics.moneyPrev
    return { text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtMoney(Math.abs(d))} vs ${prevMesShort}`, good: d === 0 ? null : d > 0 }
  }, [metrics, prevMesShort])
  const timeDelta = (now: number | null, prev: number | null) => {
    if (now == null || prev == null || prev === 0) return null
    const pct = Math.round(((now - prev) / prev) * 100)
    return { text: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}% vs ${prevMesShort}`, good: pct === 0 ? null : pct < 0 }
  }

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

        {/* HOY — lo accionable ahora mismo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <KPITile label="Tareas esta semana" value={loading ? '…' : String(weekTasks.length)} hint={`${tasks.length} abiertas en total`} icon={<CheckSquare size={12} style={{ color: 'var(--accent)' }} />} />
          <KPITile label="Mensajes sin leer" value={loading ? '…' : String(totalUnread)} color={totalUnread > 0 ? 'var(--accent)' : undefined} hint="En tareas, proyectos y deals donde estás relacionado" icon={<MessageCircle size={12} style={{ color: totalUnread > 0 ? 'var(--accent)' : 'var(--text-tertiary)' }} />} />
        </div>

        {/* PRODUCTIVIDAD DEL MES — con variación vs mes anterior */}
        <div>
          <p style={{ ...secTitle, margin: '0 0 8px' }}><TrendingUp size={12} /> Productividad · {mesLabel}</p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8 }}>
            <MetricTile label="Deals activos" value={loading || !metrics ? '…' : String(metrics.dealsNow)}
              icon={<Handshake size={12} style={{ color: '#8FBF9F' }} />} delta={dealDelta}
              hint="Oportunidades vivas que creaste o donde has participado" />
            <MetricTile label="$ en juego" value={loading || !metrics ? '…' : fmtMoney(metrics.moneyNow)}
              icon={<Banknote size={12} style={{ color: '#8FBF9F' }} />} delta={moneyDelta}
              hint="Valor total de tus deals activos (MXN)" />
            <MetricTile label="Resp. actividades" value={loading || !metrics ? '…' : fmtDur(metrics.taskRespNow)}
              icon={<Timer size={12} style={{ color: '#E8A33D' }} />} delta={metrics ? timeDelta(metrics.taskRespNow, metrics.taskRespPrev) : null}
              hint="Promedio de tus tareas cerradas este mes: de creada a cerrada. Menos es mejor." />
            <MetricTile label="Resp. mensajes" value={loading || !metrics ? '…' : fmtDur(metrics.msgRespNow)}
              icon={<MailOpen size={12} style={{ color: '#7FA3C2' }} />} delta={metrics ? timeDelta(metrics.msgRespNow, metrics.msgRespPrev) : null}
              hint="Promedio este mes: de que te llega un mensaje a que lo lees. Menos es mejor." />
          </div>
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
