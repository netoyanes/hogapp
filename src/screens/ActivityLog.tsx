import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, List, Users, PieChart, Search, X, ChevronDown,
  TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, Download, HardDrive,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { APP_VERSION } from '../config/version'
import { ChangelogModal } from '../components/ui/ChangelogModal'
import { TeamAnalytics } from '../components/ui/TeamAnalytics'
import { PersonSheet } from '../components/ui/ActivityPersonSheet'
import { describeAction, moduleOf, MODULES, MODULE_ORDER, type ModuleId } from '../lib/activityCatalog'
import { useIsMobile } from '../hooks/useIsMobile'

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVIDAD v2 — no solo "qué pasó", sino CUÁNTO SE USA cada área de HOG APP.
//   · Cronología: filtrable por módulo/persona/venue, con búsqueda y paginación
//   · Uso por área: acciones y personas por módulo, con tendencia vs. periodo
//     anterior, venues vivos, y las áreas dormidas (el dato más accionable)
//   · Personas: qué trae encima y qué ha hecho cada quien; ficha al abrir
//   · Analítica: la vista de equipo que ya existía
// Los conteos salen de RPCs sobre la tabla COMPLETA — antes se contaban las
// 300 filas traídas al navegador y "Total" era en realidad el tope.
// ─────────────────────────────────────────────────────────────────────────────

type LogEntry = {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
  bu_id?: string | null
  profiles: { full_name: string | null; email: string | null } | null
}
type StatRow = { action: string; periodo: 'actual' | 'previo'; acciones: number; personas: number }
type VenueRow = { bu_code: string; bu_name: string; acciones: number; personas: number }
type IdleRow = { user_id: string; nombre: string; rol: string; ultima: string | null; dias_sin_usar: number }
type HeatRow = { dow: number; hora: number; acciones: number }
type StorageRow = { bucket: string; archivos: number; bytes: number; ultimo: string | null }

const GB = 1024 ** 3
const fmtBytes = (b: number) =>
  b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`
// Plan gratuito de Supabase: 1 GB de Storage. Sirve de referencia visual.
const CUOTA_GB = 1

const PAGE = 100
const RANGOS = [
  { id: '7',  label: '7 días' },
  { id: '30', label: '30 días' },
  { id: '90', label: '90 días' },
] as const

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return `hace ${Math.floor(hrs / 24)} d`
}
function dayLabel(dateStr: string) {
  const d = new Date(dateStr), hoy = new Date(), ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}
function userName(e: LogEntry) {
  const actor = typeof e.details?.actor === 'string' ? e.details.actor : null
  return e.profiles?.full_name ?? e.profiles?.email ?? actor ?? 'Sistema'
}
function userInitials(e: LogEntry) {
  const name = e.profiles?.full_name ?? (typeof e.details?.actor === 'string' ? e.details.actor : null)
  if (name) return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  return (e.profiles?.email?.[0] ?? '·').toUpperCase()
}

export function ActivityLog() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<'timeline' | 'uso' | 'personas' | 'analytics'>('timeline')
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [rango, setRango] = useState<'7' | '30' | '90'>('30')

  // ── Cronología ──
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fModule, setFModule] = useState<ModuleId | 'todos'>('todos')
  const [fUser, setFUser] = useState('todos')
  const [q, setQ] = useState('')

  // ── Agregados ──
  const [stats, setStats] = useState<StatRow[]>([])
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [idle, setIdle] = useState<IdleRow[]>([])
  const [heat, setHeat] = useState<HeatRow[]>([])
  const [storage, setStorage] = useState<StorageRow[]>([])
  const [people, setPeople] = useState<{ id: string; full_name: string | null; email: string | null; role: string }[]>([])
  const [openPerson, setOpenPerson] = useState<{ id: string; nombre: string } | null>(null)
  const [statsMissing, setStatsMissing] = useState(false)

  const { desde, hasta } = useMemo(() => {
    const h = new Date()
    const d = new Date(h.getTime() - Number(rango) * 86400000)
    return { desde: d.toISOString(), hasta: h.toISOString() }
  }, [rango])

  const loadPage = useCallback(async (offset: number) => {
    const { data } = await supabase.from('activity_log')
      .select('*, profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1)
    const rows = (data as LogEntry[]) ?? []
    setHasMore(rows.length === PAGE)
    return rows
  }, [])

  useEffect(() => {
    loadPage(0).then(rows => { setEntries(rows); setLoading(false) })
    supabase.from('profiles').select('id, full_name, email, role').order('full_name')
      .then(({ data }) => setPeople(data ?? []))
    // Realtime: se inserta la fila nueva arriba en vez de recargar todo — antes
    // cada acción de cualquiera disparaba un refetch completo.
    const ch = supabase.channel('activity-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, async payload => {
        const nuevo = payload.new as LogEntry
        const { data: pf } = nuevo.user_id
          ? await supabase.from('profiles').select('full_name, email').eq('id', nuevo.user_id).maybeSingle()
          : { data: null }
        setEntries(prev => prev.some(e => e.id === nuevo.id) ? prev : [{ ...nuevo, profiles: pf }, ...prev])
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadPage])

  useEffect(() => {
    Promise.all([
      supabase.rpc('fn_activity_stats', { p_desde: desde, p_hasta: hasta }),
      supabase.rpc('fn_activity_by_venue', { p_desde: desde, p_hasta: hasta }),
      supabase.rpc('fn_activity_idle_users', { p_dias: 14 }),
      supabase.rpc('fn_activity_heatmap', { p_desde: desde, p_hasta: hasta }),
    ]).then(([s, v, i, h]) => {
      if (s.error) { setStatsMissing(true); return }
      setStatsMissing(false)
      setStats((s.data ?? []) as StatRow[])
      setVenues((v.data ?? []) as VenueRow[])
      setIdle((i.data ?? []) as IdleRow[])
      setHeat((h.data ?? []) as HeatRow[])
    })
  }, [desde, hasta])

  // El almacenamiento no depende del rango: es una foto de hoy
  useEffect(() => {
    supabase.rpc('fn_storage_usage').then(({ data }) => setStorage((data ?? []) as StorageRow[]))
  }, [])

  async function loadMore() {
    setLoadingMore(true)
    const rows = await loadPage(entries.length)
    setEntries(prev => [...prev, ...rows])
    setLoadingMore(false)
  }

  // ── Uso por módulo (agrupa el catálogo sobre lo que devolvió la RPC) ──
  const uso = useMemo(() => {
    const acc: Record<string, { actual: number; previo: number; personas: number }> = {}
    for (const m of MODULE_ORDER) acc[m] = { actual: 0, previo: 0, personas: 0 }
    const personasPorMod: Record<string, number> = {}
    for (const r of stats) {
      const m = moduleOf(r.action)
      acc[m][r.periodo] += Number(r.acciones)
      if (r.periodo === 'actual') personasPorMod[m] = Math.max(personasPorMod[m] ?? 0, Number(r.personas))
    }
    for (const m of MODULE_ORDER) acc[m].personas = personasPorMod[m] ?? 0
    return MODULE_ORDER.map(id => ({ id, ...acc[id] })).sort((a, b) => b.actual - a.actual)
  }, [stats])
  const totalActual = uso.reduce((s, u) => s + u.actual, 0)
  const totalPrevio = uso.reduce((s, u) => s + u.previo, 0)
  const dormidas = uso.filter(u => u.actual === 0)

  // ── Cronología filtrada ──
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return entries.filter(e => {
      if (fModule !== 'todos' && moduleOf(e.action) !== fModule) return false
      if (fUser !== 'todos' && e.user_id !== fUser) return false
      if (needle) {
        const txt = `${userName(e)} ${describeAction(e.action, e.details).text}`.toLowerCase()
        if (!txt.includes(needle)) return false
      }
      return true
    })
  }, [entries, fModule, fUser, q])

  const grouped = useMemo(() => {
    const out: { label: string; entries: LogEntry[] }[] = []
    for (const e of filtered) {
      const label = dayLabel(e.created_at)
      if (out[out.length - 1]?.label !== label) out.push({ label, entries: [] })
      out[out.length - 1].entries.push(e)
    }
    return out
  }, [filtered])

  // Abrir la entidad de la acción — la cronología deja de ser inerte
  function openEntity(e: LogEntry) {
    if (!e.entity_id) return
    if (e.entity_type === 'task') window.dispatchEvent(new CustomEvent('hog:open-task', { detail: e.entity_id }))
    else if (e.entity_type === 'deal') window.dispatchEvent(new CustomEvent('hog:open-deal', { detail: e.entity_id }))
    else if (e.entity_type === 'event') {
      localStorage.setItem('hog_pending_project', e.entity_id)
      window.dispatchEvent(new CustomEvent('hog:goto-projects'))
    }
  }

  function exportCSV() {
    const filas = [['fecha', 'persona', 'modulo', 'accion', 'descripcion'].join(',')]
    for (const e of filtered) {
      const d = describeAction(e.action, e.details)
      filas.push([
        new Date(e.created_at).toISOString(),
        `"${userName(e).replace(/"/g, '""')}"`,
        MODULES[d.module].label,
        e.action,
        `"${d.text.replace(/"/g, '""')}"`,
      ].join(','))
    }
    const url = URL.createObjectURL(new Blob([filas.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `actividad-hogapp-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14 }
  const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 17, margin: 0 }}>Actividad</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '2px 0 0' }}>Qué pasa en la plataforma y cuánto se usa cada área · en vivo</p>
          </div>
          <Activity size={18} style={{ color: 'var(--text-tertiary)' }} />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {([['timeline', 'Cronología', List], ['uso', 'Uso por área', PieChart], ['personas', 'Personas', Users], ['analytics', 'Analítica', BarChart3]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: tab === id ? 'var(--accent-bg)' : 'transparent',
                border: `1px solid ${tab === id ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                color: tab === id ? 'var(--accent)' : 'var(--text-secondary)' }}>
              <Icon size={13} /> {label}
            </button>
          ))}
          {(tab === 'uso' || tab === 'personas') && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {RANGOS.map(r => (
                <button key={r.id} onClick={() => setRango(r.id)}
                  style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    background: rango === r.id ? 'var(--accent-bg)' : 'transparent',
                    border: `1px solid ${rango === r.id ? 'var(--accent)' : 'var(--border-default)'}`,
                    color: rango === r.id ? 'var(--accent)' : 'var(--text-tertiary)' }}>{r.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ CRONOLOGÍA ══ */}
      {tab === 'timeline' && (
        <>
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en la actividad…"
                style={{ width: '100%', minHeight: 36, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px 0 30px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <select value={fModule} onChange={e => setFModule(e.target.value as ModuleId | 'todos')} style={selStyle}>
              <option value="todos">Todos los módulos</option>
              {MODULE_ORDER.map(m => <option key={m} value={m}>{MODULES[m].label}</option>)}
            </select>
            <select value={fUser} onChange={e => setFUser(e.target.value)} style={selStyle}>
              <option value="todos">Todas las personas</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
            </select>
            {(fModule !== 'todos' || fUser !== 'todos' || q) && (
              <button onClick={() => { setFModule('todos'); setFUser('todos'); setQ('') }}
                style={{ ...selStyle, cursor: 'pointer', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={12} /> Limpiar</button>
            )}
            <button onClick={exportCSV} title="Descargar lo que estás viendo" style={{ ...selStyle, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Download size={12} /> CSV
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ height: 44, background: 'var(--bg-surface)', borderRadius: 8 }} className="animate-pulse-green" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
                {entries.length ? 'Nada coincide con estos filtros.' : 'Sin actividad todavía.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {grouped.map(group => (
                  <div key={group.label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{group.label.toUpperCase()}</span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>{group.entries.length} {group.entries.length === 1 ? 'acción' : 'acciones'}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {group.entries.map(entry => {
                        const d = describeAction(entry.action, entry.details)
                        const Icon = d.icon
                        const clickable = !!entry.entity_id && ['task', 'deal', 'event'].includes(entry.entity_type ?? '')
                        return (
                          <div key={entry.id} onClick={() => clickable && openEntity(entry)}
                            title={clickable ? 'Abrir' : undefined}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${d.notable ? d.color : 'transparent'}`, borderRadius: 8, cursor: clickable ? 'pointer' : 'default' }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: `${d.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon size={13} style={{ color: d.color }} />
                            </div>
                            <button onClick={ev => { ev.stopPropagation(); entry.user_id && setOpenPerson({ id: entry.user_id, nombre: userName(entry) }) }}
                              title={entry.user_id ? `Ver ficha de ${userName(entry)}` : undefined}
                              style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: entry.user_id ? 'pointer' : 'default', padding: 0 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{userInitials(entry)}</span>
                            </button>
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{userName(entry)}</span>{' '}
                              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{d.text}</span>
                            </div>
                            {!isMobile && (
                              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: MODULES[d.module].color, border: `1px solid ${MODULES[d.module].color}44`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                                {MODULES[d.module].label}
                              </span>
                            )}
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{timeAgo(entry.created_at)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <button onClick={loadMore} disabled={loadingMore}
                    style={{ alignSelf: 'center', minHeight: 40, padding: '0 20px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: loadingMore ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ChevronDown size={13} /> {loadingMore ? 'Cargando…' : 'Cargar más'}
                  </button>
                )}
              </div>
            )}
            <div style={{ marginTop: 32, paddingBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => setChangelogOpen(true)}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>
                v{APP_VERSION}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══ USO POR ÁREA ══ */}
      {tab === 'uso' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {statsMissing ? (
              <p style={{ fontSize: 12, color: 'var(--status-attention)' }}>Falta correr el SQL de Actividad v2 (activity_v2.sql) en Supabase para activar esta vista.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8 }}>
                  <Tile label={`Acciones · ${rango} d`} value={String(totalActual)} delta={delta(totalActual, totalPrevio)} />
                  <Tile label="Módulos en uso" value={`${uso.filter(u => u.actual > 0).length}/${MODULE_ORDER.length}`} />
                  <Tile label="Áreas dormidas" value={String(dormidas.length)} color={dormidas.length ? 'var(--status-attention)' : undefined} />
                  <Tile label="Sin usar la app" value={String(idle.length)} color={idle.length ? 'var(--status-risk)' : undefined} hint="Personas sin actividad en 14 días" />
                </div>

                <div style={card}>
                  <p style={secTitle}><PieChart size={12} /> Uso por módulo</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {uso.map(u => {
                      const M = MODULES[u.id]
                      const pct = totalActual ? (u.actual / Math.max(...uso.map(x => x.actual), 1)) * 100 : 0
                      const dl = delta(u.actual, u.previo)
                      return (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: isMobile ? 78 : 96, flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: u.actual ? 'var(--text-primary)' : 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <M.icon size={11} style={{ color: M.color, flexShrink: 0 }} /> {M.label}
                          </span>
                          <div style={{ flex: 1, height: 18, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: `color-mix(in srgb, ${M.color} 55%, transparent)`, transition: 'width .3s' }} />
                          </div>
                          <span className="num" style={{ width: 46, textAlign: 'right', fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: u.actual ? 'var(--text-primary)' : 'var(--text-tertiary)', flexShrink: 0 }}>{u.actual}</span>
                          <span className="num" title="Personas distintas que usaron el módulo" style={{ width: 34, textAlign: 'right', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                            {u.personas ? `${u.personas}p` : '—'}
                          </span>
                          {!isMobile && (
                            <span className="num" style={{ width: 60, textAlign: 'right', fontSize: 10, fontFamily: 'var(--font-mono)', color: dl.color, flexShrink: 0 }}>{dl.text}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>
                    La barra son acciones; el número gris a la derecha, cuántas personas distintas lo usaron. Mucha acción de una sola persona no es adopción.
                  </p>
                </div>

                {dormidas.length > 0 && (
                  <div style={{ ...card, borderColor: 'color-mix(in srgb, var(--status-attention) 35%, transparent)' }}>
                    <p style={secTitle}><AlertTriangle size={12} style={{ color: 'var(--status-attention)' }} /> Áreas sin uso en {rango} días</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {dormidas.map(u => (
                        <span key={u.id} style={{ fontSize: 11, fontWeight: 700, color: MODULES[u.id].color, border: `1px solid ${MODULES[u.id].color}55`, borderRadius: 999, padding: '4px 10px' }}>{MODULES[u.id].label}</span>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '9px 0 0', lineHeight: 1.5 }}>
                      Nadie las tocó en este periodo. O no se necesitan, o no se sabe que existen — vale la pena decidir cuál de las dos.
                    </p>
                  </div>
                )}

                {venues.length > 0 && (
                  <div style={card}>
                    <p style={secTitle}>Venues activos en la app</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {venues.map(v => (
                        <div key={v.bu_code} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--accent)', width: 30, flexShrink: 0 }}>{v.bu_code}</span>
                          <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.bu_name}</span>
                          <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{v.personas}p</span>
                          <span className="num" style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', width: 44, textAlign: 'right' }}>{v.acciones}</span>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '9px 0 0' }}>
                      Solo cuenta lo que trae venue asociado; las acciones sin venue (corporativas o previas a esta versión) no aparecen aquí.
                    </p>
                  </div>
                )}

                <Heatmap rows={heat} />

                {storage.length > 0 && (() => {
                  const total = storage.reduce((s, r) => s + Number(r.bytes), 0)
                  const pct = Math.min((total / (CUOTA_GB * GB)) * 100, 100)
                  const tono = pct > 85 ? 'var(--status-risk)' : pct > 60 ? 'var(--status-attention)' : 'var(--status-healthy)'
                  return (
                    <div style={card}>
                      <p style={secTitle}><HardDrive size={12} /> Almacenamiento de archivos adjuntos</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                        <span className="num" style={{ fontSize: 26, fontWeight: 800, color: tono, lineHeight: 1 }}>{fmtBytes(total)}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          de {CUOTA_GB} GB · {storage.reduce((s, r) => s + Number(r.archivos), 0)} archivos
                        </span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: tono, transition: 'width .3s' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {storage.map(r => (
                          <div key={r.bucket} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                            <span style={{ flex: 1, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{r.bucket}</span>
                            <span className="num" style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{r.archivos} arch.</span>
                            <span className="num" style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', width: 72, textAlign: 'right' }}>{fmtBytes(Number(r.bytes))}</span>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '9px 0 0', lineHeight: 1.5 }}>
                        La referencia de {CUOTA_GB} GB es la del plan gratuito de Supabase — si tu proyecto está en un plan de pago, el límite real es mayor y esta barra solo sirve como escala.
                      </p>
                    </div>
                  )
                })()}

                {idle.length > 0 && (
                  <div style={card}>
                    <p style={secTitle}><Clock size={12} /> Sin usar la app · 14 días o más</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {idle.map(u => (
                        <button key={u.user_id} onClick={() => setOpenPerson({ id: u.user_id, nombre: u.nombre })}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{u.nombre}</span>
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{u.rol}</span>
                          <span className="num" style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: u.dias_sin_usar > 900 ? 'var(--status-risk)' : 'var(--status-attention)' }}>
                            {u.dias_sin_usar > 900 ? 'nunca' : `${u.dias_sin_usar} d`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ PERSONAS ══ */}
      {tab === 'personas' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={card}>
              <p style={secTitle}><Users size={12} /> Equipo · toca a alguien para ver su ficha</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {people.map(p => {
                  const nombre = p.full_name ?? p.email ?? 'Sin nombre'
                  const n = entries.filter(e => e.user_id === p.id).length
                  return (
                    <button key={p.id} onClick={() => setOpenPerson({ id: p.id, nombre })}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '9px 11px', cursor: 'pointer', textAlign: 'left', minHeight: 44 }}>
                      <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {nombre.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{nombre}</span>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{p.role}</span>
                      {n > 0 && <span className="num" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{n} recientes</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'analytics' && <div style={{ flex: 1, overflowY: 'auto' }}><TeamAnalytics /></div>}

      {openPerson && (
        <PersonSheet userId={openPerson.id} nombre={openPerson.nombre} desde={desde} hasta={hasta}
          rangoLabel={`${rango} días`} isMobile={isMobile} onClose={() => setOpenPerson(null)} />
      )}
      {changelogOpen && <ChangelogModal onClose={() => setChangelogOpen(false)} />}
    </div>
  )
}

const selStyle: React.CSSProperties = {
  minHeight: 36, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 12,
  color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer', flexShrink: 0,
}

function delta(actual: number, previo: number) {
  if (!previo) return { text: actual ? 'nuevo' : '—', color: 'var(--text-tertiary)' }
  const pct = Math.round(((actual - previo) / previo) * 100)
  if (pct === 0) return { text: '=', color: 'var(--text-tertiary)' }
  return { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, color: pct > 0 ? 'var(--status-healthy)' : 'var(--status-risk)' }
}

function Tile({ label, value, delta: d, color, hint }: { label: string; value: string; delta?: { text: string; color: string }; color?: string; hint?: string }) {
  const Icon = d ? (d.text.startsWith('+') ? TrendingUp : d.text.startsWith('−') ? TrendingDown : Minus) : null
  return (
    <div title={hint} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '11px 13px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{label}</div>
      <div className="num" style={{ fontSize: 21, fontWeight: 800, color: color ?? 'var(--text-primary)', lineHeight: 1.15, marginTop: 3 }}>{value}</div>
      {d && Icon && (
        <div className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: d.color, marginTop: 2 }}>
          <Icon size={10} /> {d.text}
        </div>
      )}
    </div>
  )
}

// Cuándo se usa la app: 7 filas (día) × 24 columnas (hora), en hora de México
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
function Heatmap({ rows }: { rows: HeatRow[] }) {
  if (!rows.length) return null
  const max = Math.max(...rows.map(r => Number(r.acciones)), 1)
  const map = new Map(rows.map(r => [`${r.dow}-${r.hora}`, Number(r.acciones)]))
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14 }}>
      <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', margin: '0 0 10px' }}>
        Cuándo se usa · hora de México
      </p>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 420 }}>
          {DOW.map((d, i) => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2 }}>
              <span style={{ width: 26, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{d}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const v = map.get(`${i}-${h}`) ?? 0
                return <div key={h} title={`${d} ${String(h).padStart(2, '0')}:00 · ${v} ${v === 1 ? 'acción' : 'acciones'}`}
                  style={{ flex: 1, height: 13, borderRadius: 2, background: v ? `color-mix(in srgb, var(--accent) ${Math.round(12 + (v / max) * 88)}%, transparent)` : 'var(--bg-elevated)' }} />
              })}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 3, marginTop: 3, paddingLeft: 29 }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ flex: 1, fontSize: 7.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{h % 3 === 0 ? h : ''}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
