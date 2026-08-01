import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'

// ─────────────────────────────────────────────────────────────────────────────
// CURVA DE OCUPACIÓN — carga simultánea del día en slots de 30 min.
// Una reserva ocupa desde su hora de llegada hasta llegada + duración
// (duration_min de la reserva, o la duración configurada del venue por tamaño
// de grupo — nunca un número fijo en código). Dos vistas:
//  · Pax vs aforo (aforo = mobiliario activo, autocalculado)
//  · Mesas requeridas vs mesas disponibles (detecta la sobreventa real)
// Rojo = excede capacidad · Ámbar = pacing de cocina excedido · Azul = ok.
// Tocar una barra lista las reservas activas en ese slot.
// ─────────────────────────────────────────────────────────────────────────────

interface ResLite {
  id: string
  guest_id: string
  time_slot: string
  party_size: number
  status: string
  zone: string | null
  zone_id?: string | null
  table_id?: string | null
  duration_min?: number | null
}
interface CapacityRow { open_time: string | null; close_time: string | null; max_pax: number }

const LIVE = ['requested', 'confirmed', 'seated']
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
const toLabel = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function OccupancyCurve({ buId, date, reservations, capacity, guestMap }: {
  buId: string
  date?: string
  reservations: ResLite[]
  capacity: CapacityRow | null
  guestMap: Record<string, { full_name: string }>
}) {
  const isMobile = useIsMobile()
  const [tables, setTables] = useState<{ id: string; name: string; max_pax: number; zone_id: string; active: boolean }[]>([])
  const [zones, setZones] = useState<{ id: string; kind: string; status: string; bar_seats: number }[]>([])
  const [settings, setSettings] = useState<{ durations: { max_pax: number; minutes: number }[]; buffer_minutes: number; pacing_max_pax: number } | null>(null)
  const [mode, setMode] = useState<'pax' | 'mesas'>('pax')
  const [selSlot, setSelSlot] = useState<number | null>(null)
  // En teléfono inicia colapsada: una línea con el pico; expandir a demanda
  const [collapsed, setCollapsed] = useState<boolean | null>(null)
  useEffect(() => { setCollapsed(prev => prev === null ? isMobile : prev) }, [isMobile])
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('venue_tables').select('id, name, max_pax, zone_id, active').eq('bu_id', buId).eq('active', true),
      supabase.from('venue_zones').select('id, kind, status, bar_seats').eq('bu_id', buId),
      supabase.from('venue_reservation_settings').select('durations, buffer_minutes, pacing_max_pax').eq('bu_id', buId).maybeSingle(),
    ]).then(([{ data: t }, { data: z }, { data: s }]) => {
      setTables((t ?? []) as typeof tables)
      setZones((z ?? []) as typeof zones)
      setSettings(s as typeof settings)
    })
  }, [buId]) // eslint-disable-line react-hooks/exhaustive-deps

  const barZoneIds = useMemo(() => new Set(zones.filter(z => z.kind === 'barra').map(z => z.id)), [zones])
  const activeZoneIds = useMemo(() => new Set(zones.filter(z => z.status === 'active').map(z => z.id)), [zones])
  const tableMap = useMemo(() => Object.fromEntries(tables.map(t => [t.id, t.name])), [tables])

  // Aforo autocalculado del mobiliario activo; fallback al cupo del día
  const aforo = useMemo(() => {
    const fromTables = tables.filter(t => activeZoneIds.has(t.zone_id)).reduce((s, t) => s + t.max_pax, 0)
    const fromBars = zones.filter(z => z.kind === 'barra' && z.status === 'active').reduce((s, z) => s + z.bar_seats, 0)
    return (fromTables + fromBars) || (capacity?.max_pax ?? 0)
  }, [tables, zones, activeZoneIds, capacity])
  const mesasDisp = useMemo(() => tables.filter(t => activeZoneIds.has(t.zone_id) && !barZoneIds.has(t.zone_id)).length, [tables, activeZoneIds, barZoneIds])

  const durOf = (pax: number, override?: number | null) => {
    if (override) return override
    const ds = settings?.durations ?? []
    const hit = [...ds].sort((a, b) => a.max_pax - b.max_pax).find(d => d.max_pax >= pax)
    return hit?.minutes ?? 120
  }
  // Mesas que consume un grupo: 1-4 → 1, 5-8 → 2, 9-12 → 3…
  const mesasDe = (pax: number) => Math.max(1, Math.ceil(pax / 4))
  const esBarra = (r: ResLite) => (r.zone ?? '').toLowerCase() === 'barra' || (r.zone_id ? barZoneIds.has(r.zone_id) : false)

  const curve = useMemo(() => {
    const live = reservations.filter(r => LIVE.includes(r.status))
    if (!live.length && !capacity?.open_time) return null
    // Ventana: horario del día; sin horario, del rango de reservas
    let openM: number, closeM: number
    if (capacity?.open_time && capacity?.close_time) {
      openM = toMin(capacity.open_time); closeM = toMin(capacity.close_time)
      if (closeM <= openM) closeM += 1440
    } else if (live.length) {
      const starts = live.map(r => toMin(r.time_slot))
      openM = Math.min(...starts); closeM = Math.max(...live.map(r => toMin(r.time_slot) + durOf(r.party_size, r.duration_min)))
    } else return null
    const norm = (t: string) => { let v = toMin(t); if (v < openM) v += 1440; return v }
    const slots: { m: number; pax: number; mesas: number; barra: number; llegadas: number; ids: string[] }[] = []
    for (let m = openM; m < closeM; m += 30) {
      let pax = 0, mesas = 0, barra = 0, llegadas = 0
      const ids: string[] = []
      for (const r of live) {
        const start = norm(r.time_slot)
        const end = start + durOf(r.party_size, r.duration_min)
        if (start <= m && m < end) {
          pax += r.party_size
          if (esBarra(r)) barra += r.party_size
          else mesas += mesasDe(r.party_size)
          ids.push(r.id)
        }
        if (start >= m && start < m + 30) llegadas += r.party_size
      }
      slots.push({ m, pax, mesas, barra, llegadas, ids })
    }
    return { openM, closeM, slots }
  }, [reservations, capacity, settings, barZoneIds]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!curve || curve.slots.every(s => s.pax === 0)) return null

  const pacing = settings?.pacing_max_pax ?? 0
  const limit = mode === 'pax' ? aforo : mesasDisp
  const values = curve.slots.map(s => mode === 'pax' ? s.pax : s.mesas)
  // Escala FIJA anclada al aforo: la línea de cupo siempre queda a la misma
  // altura y las barras se leen contra ella — no contra el pico del momento
  const maxScale = Math.max((limit || 0) * 1.15, Math.max(...values, 1) * 1.08)
  // El color lo determina el conflicto de MESAS (detecta la sobreventa real),
  // aunque la altura muestre pax. Sin piso configurado, aplica el aforo en pax.
  const isOver = (s: { pax: number; mesas: number }) =>
    mesasDisp > 0 ? s.mesas > mesasDisp : (aforo > 0 && s.pax > aforo)
  const overSlots = curve.slots.filter(s => isOver(s))

  // Línea de "ahora": lo pasado se atenúa — el foco es lo que viene
  const today = (() => { const d = new Date(nowTick); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const isToday = !date || date === today
  const nowD = new Date(nowTick)
  let nowMin = nowD.getHours() * 60 + nowD.getMinutes()
  if (nowMin < curve.openM) nowMin += 1440
  const nowInWindow = isToday && nowMin >= curve.openM && nowMin < curve.closeM

  // Pico del día (para el resumen colapsado)
  const peakIdx = values.reduce((best, v, i) => v > values[best] ? i : best, 0)
  const peak = curve.slots[peakIdx]
  const peakOver = isOver(peak)

  const sel = selSlot != null ? curve.slots.find(s => s.m === selSlot) : null
  const selRes = sel ? reservations.filter(r => sel.ids.includes(r.id)).sort((a, b) => a.time_slot.localeCompare(b.time_slot)) : []

  // Colapsada (teléfono): resumen de una línea con el pico
  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'var(--bg-surface)', border: `1px solid ${peakOver ? 'color-mix(in srgb, var(--status-risk) 40%, transparent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12, cursor: 'pointer', minHeight: 44 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: peakOver ? 'var(--status-risk)' : 'var(--text-secondary)' }}>
          Pico {mode === 'pax' ? `${peak.pax}/${aforo || '—'} pax` : `${peak.mesas}/${mesasDisp} mesas`} a las {toLabel(peak.m)}
          {peakOver && ' — sobreventa'}
        </span>
        <ChevronDown size={15} style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }} />
      </button>
    )
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Banner de sobreventa anticipada */}
      {overSlots.length > 0 && (
        <button onClick={() => setSelSlot(overSlots[0].m)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'color-mix(in srgb, var(--status-risk) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-risk) 35%, transparent)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 8, cursor: 'pointer' }}>
          <AlertTriangle size={14} style={{ color: 'var(--status-risk)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--status-risk)', fontWeight: 700 }}>
            Sobreventa {toLabel(overSlots[0].m)}–{toLabel(overSlots[overSlots.length - 1].m + 30)}
            {mesasDisp > 0
              ? ` · faltan ${Math.max(...overSlots.map(s => s.mesas)) - mesasDisp} mesas`
              : ` · ${Math.max(...overSlots.map(s => s.pax))} pax, aforo ${aforo}`}
            {' '}· Ver {[...new Set(overSlots.flatMap(s => s.ids))].length} reservas en conflicto
          </span>
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', flex: 1 }}>
          Curva de ocupación · {mode === 'pax' ? `aforo ${aforo}` : `${mesasDisp} mesas`}
        </span>
        <button onClick={() => setCollapsed(true)} aria-label="Colapsar curva"
          style={{ width: 32, height: 32, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
          <ChevronUp size={14} />
        </button>
        {mesasDisp > 0 && (
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-elevated)', borderRadius: 999, padding: 2 }}>
            {(['pax', 'mesas'] as const).map(mo => (
              <button key={mo} onClick={() => setMode(mo)}
                style={{ minHeight: 28, padding: '0 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', background: mode === mo ? 'var(--accent)' : 'transparent', color: mode === mo ? 'var(--on-accent)' : 'var(--text-tertiary)' }}>
                {mo === 'pax' ? 'Pax' : 'Mesas'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Gráfica: escala fija, riel de cupo por columna y línea de aforo */}
      <div style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '10px 8px 4px' }}>
        {limit > 0 && (
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: `${4 + 16 + (limit / maxScale) * 110}px`, borderTop: '2px dashed color-mix(in srgb, var(--text-tertiary) 55%, transparent)', pointerEvents: 'none', zIndex: 1 }}>
            <span style={{ position: 'absolute', right: 0, top: -14, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{limit}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 3, overflowX: 'auto' }}>
          {curve.slots.map((s, i) => {
            const v = values[i]
            // Rojo por conflicto de MESAS (o pax sin piso); ámbar por pacing
            const over = isOver(s)
            const pacingHit = pacing > 0 && s.llegadas > pacing
            const color = over ? 'var(--status-risk)' : pacingHit ? 'var(--status-attention)' : 'color-mix(in srgb, var(--accent) 65%, var(--text-tertiary))'
            const isSel = selSlot === s.m
            const isPast = nowInWindow && s.m + 30 <= nowMin
            const isNowSlot = nowInWindow && nowMin >= s.m && nowMin < s.m + 30
            const hFill = Math.min(100, (v / maxScale) * 100)
            const hTrack = limit > 0 ? Math.min(100, (limit / maxScale) * 100) : 0
            return (
              <button key={s.m} onClick={() => setSelSlot(isSel ? null : s.m)}
                title={`${toLabel(s.m)} · ${s.pax} pax · ${s.mesas} mesas · ${s.barra} en barra${pacingHit ? ` · llegadas ${s.llegadas} > pacing ${pacing}` : ''}`}
                style={{ flex: '1 0 28px', minWidth: 28, display: 'flex', flexDirection: 'column', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: isPast ? 0.4 : 1 }}>
                <div style={{ position: 'relative', width: '100%', height: 110 }}>
                  {/* Riel de cupo: hasta aquí llega el aforo — barra baja = poca ocupación DEL cupo */}
                  {hTrack > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: '14%', right: '14%', height: `${hTrack}%`, background: 'color-mix(in srgb, var(--bg-elevated) 85%, transparent)', borderRadius: '3px 3px 0 0' }} />
                  )}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${hFill}%`, minHeight: v > 0 ? 3 : 0, background: v > 0 ? color : 'transparent', borderRadius: '3px 3px 0 0', outline: isSel ? '2px solid var(--text-primary)' : 'none' }} />
                  {v > 0 && (
                    <span className="num" style={{ position: 'absolute', bottom: `calc(${hFill}% + 2px)`, left: -6, right: -6, textAlign: 'center', fontSize: 13, fontWeight: 700, color: over ? 'var(--status-risk)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>{v}</span>
                  )}
                  {isNowSlot && (
                    <div style={{ position: 'absolute', top: -6, bottom: 0, left: '50%', borderLeft: '2px dashed var(--text-primary)', opacity: 0.75, pointerEvents: 'none' }} />
                  )}
                </div>
                <span style={{ fontSize: 10, height: 14, color: isNowSlot ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: isNowSlot ? 700 : 400, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', textAlign: 'center', width: '100%' }}>
                  {isNowSlot ? toLabel(nowMin) : s.m % 60 === 0 ? toLabel(s.m) : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Detalle del slot: reservas activas en ese momento */}
      {sel && (
        <div style={{ marginTop: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            {toLabel(sel.m)}–{toLabel(sel.m + 30)} · {sel.pax} pax · {sel.mesas} mesas · {sel.barra} en barra
          </div>
          {selRes.map(r => {
            const dur = durOf(r.party_size, r.duration_min)
            const salida = toLabel((toMin(r.time_slot) < curve.openM ? toMin(r.time_slot) + 1440 : toMin(r.time_slot)) + dur)
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700, width: 40 }}>{r.time_slot}</span>
                <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guestMap[r.guest_id]?.full_name ?? 'Cliente'}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{r.party_size}p</span>
                {r.table_id && tableMap[r.table_id] && <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{tableMap[r.table_id]}</span>}
                {esBarra(r) && <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>barra</span>}
                <span className="num" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>sale ~{salida}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
