import { useCallback, useEffect, useMemo, useState } from 'react'
import { Receipt, LogOut, Undo2, X, GripHorizontal, Armchair } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { showToast, StatusBadgeV2 } from '../v2'

// ─────────────────────────────────────────────────────────────────────────────
// PISO OPERATIVO (Fase 2) — el mismo plano del editor, pero en vivo:
// cada mesa muestra su estado (libre / reservada / sentada / en cuenta) y el
// host sienta, pide cuenta y cierra desde aquí. table_sessions guarda las
// horas REALES (sentada / cuenta / salida) para la calibración de Fase 5.
// Se actualiza solo vía realtime en todas las tablets del venue.
// ─────────────────────────────────────────────────────────────────────────────

interface Zone {
  id: string; name: string; kind: 'mesas' | 'barra'
  status: 'active' | 'closed'; bar_seats: number; priority: number
}
interface TableRow {
  id: string; zone_id: string; name: string; min_pax: number; max_pax: number
  shape: 'square' | 'round' | 'booth' | 'lounge' | 'high'
  x: number; y: number; w: number; h: number; active: boolean
  section: string | null
}
interface Session {
  id: string; zone_id: string; table_id: string | null; reservation_id: string | null
  guest_name: string | null; party_size: number
  status: 'seated' | 'billing' | 'closed'
  seated_at: string; billing_at: string | null
}
interface ResRow {
  id: string; guest_id: string; time_slot: string; party_size: number
  status: string; table_id: string | null; zone_id: string | null
}

function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function FloorLive({ buId, canWrite, userId }: { buId: string; canWrite: boolean; userId?: string }) {
  const [zones, setZones] = useState<Zone[]>([])
  const [tables, setTables] = useState<TableRow[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [resToday, setResToday] = useState<ResRow[]>([])
  const [guestNames, setGuestNames] = useState<Record<string, string>>({})
  const [zoneId, setZoneId] = useState('')
  // "Mis mesas": el mesero filtra por su sección/estación
  const [sectionFilter, setSectionFilter] = useState('')
  const [durations, setDurations] = useState<{ max_pax: number; minutes: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [selTable, setSelTable] = useState<TableRow | null>(null)
  const [barPanel, setBarPanel] = useState(false)
  const [wiName, setWiName] = useState('')
  const [wiPax, setWiPax] = useState(2)
  const [tick, setTick] = useState(Date.now())

  const load = useCallback(async () => {
    const today = isoToday()
    const [{ data: z }, { data: t }, { data: s }, { data: r }, { data: cfg }] = await Promise.all([
      supabase.from('venue_zones').select('id, name, kind, status, bar_seats, priority').eq('bu_id', buId).order('priority').order('created_at'),
      supabase.from('venue_tables').select('*').eq('bu_id', buId).eq('active', true),
      supabase.from('table_sessions').select('*').eq('bu_id', buId).in('status', ['seated', 'billing']),
      supabase.from('reservations').select('id, guest_id, time_slot, party_size, status, table_id, zone_id').eq('bu_id', buId).eq('date', today).in('status', ['requested', 'confirmed', 'seated']),
      supabase.from('venue_reservation_settings').select('durations').eq('bu_id', buId).maybeSingle(),
    ])
    setDurations((cfg?.durations ?? []) as { max_pax: number; minutes: number }[])
    setZones((z ?? []) as Zone[])
    setTables((t ?? []) as TableRow[])
    setSessions((s ?? []) as Session[])
    const rows = (r ?? []) as ResRow[]
    setResToday(rows)
    const ids = [...new Set(rows.map(x => x.guest_id))]
    if (ids.length) {
      const { data: g } = await supabase.from('guests').select('id, full_name').in('id', ids)
      setGuestNames(Object.fromEntries((g ?? []).map(x => [x.id, x.full_name ?? 'Cliente'])))
    }
    setZoneId(prev => prev || (z ?? [])[0]?.id || '')
    setLoading(false)
  }, [buId])

  useEffect(() => { setLoading(true); load() }, [load])

  // Realtime: cualquier cambio de sesión o reserva refresca el piso
  useEffect(() => {
    const ch = supabase.channel(`floor-${buId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [buId, load])

  // Cronómetro de mesas (elapsed) — refresca cada minuto
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 60_000)
    return () => clearInterval(iv)
  }, [])

  const zone = zones.find(z => z.id === zoneId) ?? null
  const zoneTablesAll = tables.filter(t => t.zone_id === zoneId)
  const sections = useMemo(() => [...new Set(zoneTablesAll.map(t => t.section).filter(Boolean))] as string[], [zoneTablesAll])
  const zoneTables = sectionFilter ? zoneTablesAll.filter(t => t.section === sectionFilter) : zoneTablesAll

  // Mesa EXCEDIDA: sentada (sin pedir cuenta) más allá de su duración + 20 min
  const durFor = useCallback((p: number) => {
    const hit = [...durations].sort((a, b) => a.max_pax - b.max_pax).find(d => d.max_pax >= p)
    return hit?.minutes ?? 120
  }, [durations])
  const isExceeded = useCallback((s: Session) =>
    s.status === 'seated' && (tick - Date.parse(s.seated_at)) / 60000 > durFor(s.party_size) + 20,
    [tick, durFor])
  const exceededCount = useMemo(() => sessions.filter(isExceeded).length, [sessions, isExceeded])

  const sessionByTable = useMemo(() => {
    const m: Record<string, Session> = {}
    for (const s of sessions) if (s.table_id) m[s.table_id] = s
    return m
  }, [sessions])

  // Reserva de hoy asignada a una mesa pero aún sin sentar → "reservada"
  const holdByTable = useMemo(() => {
    const m: Record<string, ResRow> = {}
    for (const r of resToday) if (r.table_id && ['requested', 'confirmed'].includes(r.status)) m[r.table_id] = r
    return m
  }, [resToday])

  // Reservas de hoy listas para sentar (sin mesa aún)
  const pending = useMemo(() =>
    resToday
      .filter(r => ['requested', 'confirmed'].includes(r.status) || (r.status === 'seated' && !sessions.some(s => s.reservation_id === r.id)))
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
    [resToday, sessions])

  const barSessions = (z: Zone) => sessions.filter(s => s.zone_id === z.id && !s.table_id)
  const barPax = (z: Zone) => barSessions(z).reduce((sum, s) => sum + s.party_size, 0)

  const elapsedMin = (s: Session) => Math.max(0, Math.floor((tick - Date.parse(s.seated_at)) / 60_000))
  const sessionName = (s: Session) => s.guest_name
    || (s.reservation_id ? guestNames[resToday.find(r => r.id === s.reservation_id)?.guest_id ?? ''] : null)
    || 'Walk-in'

  // ── Acciones ───────────────────────────────────────────────────────────────
  async function seatReservation(r: ResRow, t: TableRow | null, barZone?: Zone) {
    const zid = t?.zone_id ?? barZone?.id
    if (!zid) return
    const { error } = await supabase.from('table_sessions').insert({
      bu_id: buId, zone_id: zid, table_id: t?.id ?? null, reservation_id: r.id,
      guest_name: guestNames[r.guest_id] ?? null, party_size: r.party_size, created_by: userId ?? null,
    })
    if (error) { showToast(`No se pudo sentar: ${error.message}`, 'error'); return }
    await supabase.from('reservations').update({ status: 'seated', table_id: t?.id ?? null, zone_id: zid }).eq('id', r.id)
    setSelTable(null); setBarPanel(false); load()
  }
  async function seatWalkIn(t: TableRow | null, barZone?: Zone) {
    const zid = t?.zone_id ?? barZone?.id
    if (!zid) return
    const { error } = await supabase.from('table_sessions').insert({
      bu_id: buId, zone_id: zid, table_id: t?.id ?? null,
      guest_name: wiName.trim() || null, party_size: Math.max(1, wiPax), created_by: userId ?? null,
    })
    if (error) { showToast(`No se pudo sentar: ${error.message}`, 'error'); return }
    setWiName(''); setWiPax(2); setSelTable(null); setBarPanel(false); load()
  }
  async function toBilling(s: Session) {
    const { error } = await supabase.from('table_sessions').update({ status: 'billing', billing_at: new Date().toISOString() }).eq('id', s.id)
    if (error) { showToast(`No se pudo: ${error.message}`, 'error'); return }
    load()
  }
  async function closeSession(s: Session) {
    const { error } = await supabase.from('table_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', s.id)
    if (error) { showToast(`No se pudo cerrar: ${error.message}`, 'error'); return }
    if (s.reservation_id) await supabase.from('reservations').update({ status: 'completed' }).eq('id', s.reservation_id)
    setSelTable(null); load()
  }
  async function undoSeat(s: Session) {
    await supabase.from('table_sessions').delete().eq('id', s.id)
    if (s.reservation_id) await supabase.from('reservations').update({ status: 'confirmed', table_id: null }).eq('id', s.reservation_id)
    setSelTable(null); setBarPanel(false); load()
  }

  // ── Estilos por estado ─────────────────────────────────────────────────────
  const tableVisual = (t: TableRow): { style: React.CSSProperties; state: 'libre' | 'reservada' | 'sentada' | 'cuenta' } => {
    const s = sessionByTable[t.id]
    const hold = holdByTable[t.id]
    const state = s ? (s.status === 'billing' ? 'cuenta' : 'sentada') : hold ? 'reservada' : 'libre'
    const colors: Record<typeof state, { bg: string; border: string }> = {
      libre:     { bg: 'var(--bg-elevated)', border: 'var(--border-strong)' },
      reservada: { bg: 'color-mix(in srgb, var(--accent) 12%, var(--bg-elevated))', border: 'var(--accent)' },
      sentada:   { bg: 'color-mix(in srgb, var(--status-healthy) 18%, var(--bg-elevated))', border: 'var(--status-healthy)' },
      cuenta:    { bg: 'color-mix(in srgb, var(--status-attention) 20%, var(--bg-elevated))', border: 'var(--status-attention)' },
    }
    return {
      state,
      style: {
        position: 'absolute', left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%`,
        borderRadius: t.shape === 'round' ? '50%' : t.shape === 'booth' ? '10px 10px 3px 3px' : t.shape === 'lounge' ? 14 : 6,
        background: colors[state].bg, border: `2px solid ${colors[state].border}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', userSelect: 'none', padding: 0,
      },
    }
  }

  const actionBtn: React.CSSProperties = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46,
    borderRadius: 999, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  }
  const inp: React.CSSProperties = {
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', padding: '8px 10px', fontSize: 13, outline: 'none', minHeight: 42, boxSizing: 'border-box',
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[220, 60].map((h, i) => <div key={i} className="animate-pulse-green" style={{ height: h, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }} />)}
    </div>
  )

  if (zones.length === 0) return (
    <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 32 }}>
      Este venue aún no tiene piso configurado.<br />El gerente lo arma en el Editor de piso (botón de cuadrícula arriba).
    </p>
  )

  const occTables = zoneTables.filter(t => sessionByTable[t.id]).length
  const occPax = sessions.reduce((sum, s) => sum + s.party_size, 0)

  const seatList = (t: TableRow | null, barZone?: Zone) => (
    <>
      {pending.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Reservas de hoy por sentar</span>
          {pending.map(r => (
            <button key={r.id} onClick={() => seatReservation(r, t, barZone)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left', minHeight: 46 }}>
              <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{r.time_slot}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guestNames[r.guest_id] ?? 'Cliente'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.party_size} pax</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Walk-in</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={wiName} onChange={e => setWiName(e.target.value)} placeholder="Nombre (opcional)" style={{ ...inp, flex: 1 }} />
          <input type="number" inputMode="numeric" min={1} value={wiPax} onChange={e => setWiPax(Math.max(1, Number(e.target.value)))} className="num" style={{ ...inp, width: 64, textAlign: 'center' }} />
        </div>
        <button onClick={() => seatWalkIn(t, barZone)}
          style={{ ...actionBtn, background: 'var(--status-healthy)', color: '#04210f', fontWeight: 800 }}>
          <Armchair size={15} /> Sentar walk-in
        </button>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Resumen + zonas */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {zones.map(z => {
          const zTabs = tables.filter(t => t.zone_id === z.id)
          const occ = z.kind === 'barra' ? `${barPax(z)}/${z.bar_seats}` : `${zTabs.filter(t => sessionByTable[t.id]).length}/${zTabs.length}`
          return (
            <button key={z.id} onClick={() => { setZoneId(z.id); if (z.kind === 'barra') setBarPanel(true) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
                background: zoneId === z.id ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                border: `1px solid ${zoneId === z.id ? 'var(--accent-border)' : 'var(--border-default)'}`,
                color: zoneId === z.id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700,
                opacity: z.status === 'closed' ? 0.55 : 1,
              }}>
              {z.name} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{occ}</span>
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {occTables} mesas ocupadas · <strong style={{ color: 'var(--text-primary)' }}>{occPax} pax</strong> en piso
          {exceededCount > 0 && <> · <strong style={{ color: 'var(--status-risk)' }}>⚠ {exceededCount} excedida{exceededCount > 1 ? 's' : ''}</strong></>}
        </span>
      </div>

      {/* "Mis mesas": filtro por sección/estación del mesero */}
      {sections.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Sección</span>
          <button onClick={() => setSectionFilter('')}
            style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: !sectionFilter ? 'var(--accent)' : 'var(--bg-elevated)', border: 'none', color: !sectionFilter ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
            Todas
          </button>
          {sections.map(s => (
            <button key={s} onClick={() => setSectionFilter(prev => prev === s ? '' : s)}
              style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: sectionFilter === s ? 'var(--accent)' : 'var(--bg-elevated)', border: 'none', color: sectionFilter === s ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {([['libre', 'var(--border-strong)'], ['reservada', 'var(--accent)'], ['sentada', 'var(--status-healthy)'], ['en cuenta', 'var(--status-attention)']] as const).map(([lbl, c]) => (
          <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, border: `2px solid ${c}`, display: 'inline-block' }} /> {lbl}
          </span>
        ))}
      </div>

      {/* Lienzo en vivo */}
      {zone && zone.kind === 'mesas' && (
        <div style={{
          position: 'relative', width: '100%', aspectRatio: '4 / 3',
          background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
          backgroundImage: 'radial-gradient(circle, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '24px 24px',
          overflow: 'hidden', opacity: zone.status === 'closed' ? 0.5 : 1,
        }}>
          {zoneTables.map(t => {
            const v = tableVisual(t)
            const s = sessionByTable[t.id]
            const exceeded = s ? isExceeded(s) : false
            return (
              <button key={t.id} style={{ ...v.style, ...(exceeded ? { border: '2px solid var(--status-risk)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--status-risk) 30%, transparent)' } : {}) }} onClick={() => canWrite && setSelTable(t)}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)' }}>{exceeded && '⚠ '}{t.name}</span>
                {s ? (
                  <span className="num" style={{ fontSize: 9, color: exceeded ? 'var(--status-risk)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: exceeded ? 800 : 400 }}>{s.party_size}p · {elapsedMin(s)}′</span>
                ) : (
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{t.min_pax}–{t.max_pax}</span>
                )}
              </button>
            )
          })}
          {zoneTables.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Sin mesas en esta zona — se configuran en el Editor de piso.
            </div>
          )}
        </div>
      )}

      {/* Por llegar */}
      {pending.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
            Por sentar hoy ({pending.length}) — toca una mesa libre para asignar
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pending.map(r => (
              <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)' }}>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>{r.time_slot}</span>
                {guestNames[r.guest_id] ?? 'Cliente'} · {r.party_size}p
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Panel de mesa */}
      {selTable && (() => {
        const s = sessionByTable[selTable.id]
        const hold = holdByTable[selTable.id]
        return (
          <div onClick={() => setSelTable(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 18, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: 15, flex: 1 }}>Mesa {selTable.name} · {selTable.min_pax}–{selTable.max_pax} pax</strong>
                {s && <StatusBadgeV2 tone={s.status === 'billing' ? 'attention' : 'healthy'} label={s.status === 'billing' ? 'En cuenta' : 'Sentada'} />}
                {!s && hold && <StatusBadgeV2 tone="accent" label={`Reservada ${hold.time_slot}`} />}
                {!s && !hold && <StatusBadgeV2 tone="neutral" label="Libre" />}
                <button onClick={() => setSelTable(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 6 }}><X size={16} /></button>
              </div>

              {s ? (
                <>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{sessionName(s)}</div>
                    <div className="num" style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {s.party_size} pax · sentada hace {elapsedMin(s)} min
                      {s.status === 'billing' && s.billing_at && ` · cuenta pedida ${new Date(s.billing_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {s.status === 'seated' && (
                      <button onClick={() => toBilling(s)} style={{ ...actionBtn, background: 'color-mix(in srgb, var(--status-attention) 18%, transparent)', color: 'var(--status-attention)' }}>
                        <Receipt size={15} /> En cuenta
                      </button>
                    )}
                    <button onClick={() => closeSession(s)} style={{ ...actionBtn, background: 'var(--accent)', color: 'var(--on-accent)' }}>
                      <LogOut size={15} /> Cerrar mesa
                    </button>
                  </div>
                  <button onClick={() => undoSeat(s)} style={{ ...actionBtn, background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)', minHeight: 40 }}>
                    <Undo2 size={13} /> Deshacer sentada (error)
                  </button>
                </>
              ) : (
                seatList(selTable)
              )}
            </div>
          </div>
        )
      })()}

      {/* Panel de barra */}
      {barPanel && zone && zone.kind === 'barra' && (
        <div onClick={() => setBarPanel(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', padding: 18, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GripHorizontal size={16} style={{ color: 'var(--accent)' }} />
              <strong style={{ color: 'var(--text-primary)', fontSize: 15, flex: 1 }}>{zone.name} · {barPax(zone)}/{zone.bar_seats} asientos</strong>
              <button onClick={() => setBarPanel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 6 }}><X size={16} /></button>
            </div>
            {barSessions(zone).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{sessionName(s)}</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.party_size}p · {elapsedMin(s)}′</span>
                {canWrite && (
                  <button onClick={() => closeSession(s)} title="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 6 }}><LogOut size={14} /></button>
                )}
              </div>
            ))}
            {canWrite && seatList(null, zone)}
          </div>
        </div>
      )}
    </div>
  )
}
