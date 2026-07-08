import { useEffect, useState, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, Phone, MessageCircle, Camera, Footprints, Building2, AlertTriangle, MoreHorizontal, X, Search, Check, Settings2, Handshake } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatPhone } from '../lib/phone'
import { logActivity } from '../hooks/useActivityLog'
import { notifySlack, reservationCreatedMessage, reservationLostMessage, dealCreatedMessage, dealLink } from '../hooks/useSlack'
import { useIsMobile } from '../hooks/useIsMobile'
import { Avatar } from '../components/ui/Avatar'
import { GuestProfile } from '../components/ui/GuestProfile'
import { GuestCreateSheet } from './Guests'
import { CapacityEditor } from '../components/ui/CapacityEditor'
import { KPITile, SegmentedControl, Sheet, StatusBadgeV2, showToast, type StatusTone } from '../components/v2'

// ── Types ────────────────────────────────────────────────────────────────────
type ResStatus = 'requested' | 'confirmed' | 'seated' | 'completed' | 'no_show' | 'cancelled'
type ResSource = 'phone' | 'whatsapp' | 'instagram' | 'walk_in' | 'internal'

interface Reservation {
  id: string
  guest_id: string
  bu_id: string
  date: string
  time_slot: string
  party_size: number
  zone: string | null
  status: ResStatus
  source: ResSource
  notes: string | null
  created_at: string
  created_by: string | null
  bot_conversation_id: string | null
}
interface GuestLite { id: string; full_name: string; phone: string; tags: string[] }
interface CapacityRow { id: string; day_of_week: number; time_slot: string; max_reservations: number; max_pax: number; active: boolean }

const STATUS_META: Record<ResStatus, { label: string; tone: StatusTone; next?: ResStatus; nextLabel?: string }> = {
  requested: { label: 'Solicitada', tone: 'neutral',   next: 'confirmed', nextLabel: 'Confirmar' },
  confirmed: { label: 'Confirmada', tone: 'accent',    next: 'seated',    nextLabel: 'Sentar' },
  seated:    { label: 'Sentada',    tone: 'attention', next: 'completed', nextLabel: 'Completar' },
  completed: { label: 'Completada', tone: 'healthy' },
  no_show:   { label: 'No-show',    tone: 'risk' },
  cancelled: { label: 'Cancelada',  tone: 'neutral' },
}
const SOURCE_ICON: Record<ResSource, React.ElementType> = {
  phone: Phone, whatsapp: MessageCircle, instagram: Camera, walk_in: Footprints, internal: Building2,
}
const SOURCE_LABEL: Record<ResSource, string> = {
  phone: 'Teléfono', whatsapp: 'WhatsApp', instagram: 'Instagram', walk_in: 'Walk-in', internal: 'Interno',
}
const ZONES = ['Terraza', 'Barra', 'Salón', 'VIP']
const DEFAULT_SLOTS = ['19:00–20:30', '20:30–22:00', '22:00–23:30']
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLocal(d)
}
const ACTIVE_STATUSES: ResStatus[] = ['requested', 'confirmed', 'seated', 'completed']

interface Props {
  userRole?: string
  userId?: string
}

export function Reservations({ userRole, userId }: Props) {
  const isMobile = useIsMobile()
  const today = isoLocal(new Date())
  const [view, setView] = useState<'day' | 'week'>('day')
  const [date, setDate] = useState(() => {
    // Salto desde el Calendario mensual (indicador de reservas)
    const goto = sessionStorage.getItem('hog_res_goto')
    if (goto) { sessionStorage.removeItem('hog_res_goto'); return goto }
    return today
  })
  const [eventPaxThreshold, setEventPaxThreshold] = useState(15)
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [myVenues, setMyVenues] = useState<string[] | null>(null)   // null = sin restricción
  const [buId, setBuId] = useState('')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [weekRows, setWeekRows] = useState<Reservation[]>([])
  const [guestMap, setGuestMap] = useState<Record<string, GuestLite>>({})
  const [noShowMap, setNoShowMap] = useState<Record<string, number>>({})
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})

  // Quién reservó: nombres del equipo para el byline de cada tarjeta
  useEffect(() => {
    supabase.from('profiles').select('id, full_name').then(({ data }) =>
      setProfileMap(Object.fromEntries((data ?? []).map(p => [p.id, p.full_name ?? '—']))))
  }, [])

  // El bot reserva sin usuario; los canales del bot sin conversación ligada
  // (reservas viejas) también se atribuyen al Concierge.
  const bookedBy = useCallback((r: Reservation) => {
    if (r.bot_conversation_id) return 'Concierge HOG'
    if (r.created_by) return profileMap[r.created_by] ?? '—'
    return (r.source === 'whatsapp' || r.source === 'instagram') ? 'Concierge HOG' : '—'
  }, [profileMap])
  const [capacity, setCapacity] = useState<CapacityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [openGuestId, setOpenGuestId] = useState<string | null>(null)
  const [menuRes, setMenuRes] = useState<Reservation | null>(null)
  const [capOpen, setCapOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const canWrite = ['MASTER', 'OPS_MANAGER', 'TEAM'].includes(userRole ?? '')
  const isTeam = userRole === 'TEAM'
  const canManageCapacity = ['MASTER', 'OPS_MANAGER'].includes(userRole ?? '')
  const buMap = useMemo(() => Object.fromEntries(buList.map(b => [b.id, b.code])), [buList])

  // Venues disponibles (Team queda bloqueado a los suyos si tiene asignación)
  const allowedBuList = useMemo(() => {
    if (!myVenues) return buList
    const set = new Set(myVenues)
    const mine = buList.filter(b => set.has(b.id))
    return mine.length ? mine : buList
  }, [buList, myVenues])

  useEffect(() => {
    async function boot() {
      const [{ data: buses }, { data: uv }] = await Promise.all([
        supabase.from('business_units').select('id, code, name').order('code'),
        userId ? supabase.from('user_venues').select('bu_id').eq('user_id', userId) : Promise.resolve({ data: null }),
      ])
      setBuList(buses ?? [])
      supabase.from('app_settings').select('value').eq('key', 'reservation_event_pax_threshold').maybeSingle()
        .then(({ data }) => { const n = Number(data?.value); if (n > 0) setEventPaxThreshold(n) })
      const venueIds = (uv ?? [])?.map((r: { bu_id: string }) => r.bu_id) ?? []
      setMyVenues(venueIds.length > 0 ? venueIds : null)
      const first = venueIds.length > 0
        ? (buses ?? []).find(b => venueIds.includes(b.id))?.id
        : (buses ?? [])[0]?.id
      setBuId(prev => prev || first || '')
    }
    boot()
  }, [userId])

  const load = useCallback(async () => {
    if (!buId) return
    const dow = new Date(date + 'T00:00:00').getDay()
    const weekStart = addDays(date, -new Date(date + 'T00:00:00').getDay())
    const [{ data: res, error }, { data: wk }, { data: cap }] = await Promise.all([
      supabase.from('reservations').select('*').eq('bu_id', buId).eq('date', date).order('time_slot').order('created_at'),
      supabase.from('reservations').select('*').eq('bu_id', buId).gte('date', weekStart).lte('date', addDays(weekStart, 6)),
      supabase.from('venue_capacity').select('*').eq('bu_id', buId).eq('day_of_week', dow).eq('active', true).order('time_slot'),
    ])
    if (error) { setLoadError(true); setLoading(false); return }
    setReservations((res ?? []) as Reservation[])
    setWeekRows((wk ?? []) as Reservation[])
    setCapacity((cap ?? []) as CapacityRow[])
    // Guests involucrados + su historial de no-shows
    const ids = [...new Set([...(res ?? []), ...(wk ?? [])].map(r => r.guest_id))]
    if (ids.length) {
      const [{ data: gs }, { data: st }] = await Promise.all([
        supabase.from('guests').select('id, full_name, phone, tags').in('id', ids),
        supabase.from('guest_stats').select('guest_id, no_shows').in('guest_id', ids),
      ])
      setGuestMap(Object.fromEntries((gs ?? []).map(g => [g.id, g as GuestLite])))
      setNoShowMap(Object.fromEntries((st ?? []).map(s => [s.guest_id, s.no_shows])))
    }
    setLoadError(false)
    setLoading(false)
  }, [buId, date])

  useEffect(() => { setLoading(true); load() }, [load])

  // Realtime: la tablet del host y el teléfono del manager se sincronizan solos
  useEffect(() => {
    const channel = supabase
      .channel(`res-${buId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [buId, load])

  // ── Status machine (optimista con rollback; el trigger DB sella tiempos y crea la visita) ──
  // Puente CRM (one-way, opcional): reserva grande → deal tipo Evento pre-llenado.
  // Crea el contacto B2B desde el guest si no existe (match por teléfono) y abre
  // el deal recién creado para editarlo.
  async function convertToDeal(res: Reservation) {
    setMenuRes(null)
    const g = guestMap[res.guest_id]
    if (!g) { showToast('No encontramos al cliente de esta reserva.', 'error'); return }
    // contacto existente por teléfono → si no, crear
    let contactId: string | null = null
    const { data: found } = await supabase.from('crm_contacts').select('id').eq('phone', g.phone).maybeSingle()
    if (found) contactId = found.id
    else {
      const { data: nc, error: cErr } = await supabase.from('crm_contacts').insert({
        full_name: g.full_name, phone: g.phone, contact_type: 'PROSPECT', created_by: userId ?? null,
        notes: 'Creado desde una reserva grande (puente Reservas → CRM)',
      }).select('id').single()
      if (cErr) { showToast(`No se pudo crear el contacto: ${cErr.message}`, 'error'); return }
      contactId = nc.id
    }
    const title = `Evento — ${g.full_name} (${res.party_size} pax)`
    const { data: deal, error: dErr } = await supabase.from('crm_deals').insert({
      title, deal_type: 'EVENT', stage: 'LEAD', probability: 50,
      event_date: res.date, close_date: res.date,
      bu_id: res.bu_id, contact_id: contactId,
      description: res.notes ? `Notas de la reserva: ${res.notes}` : `Origen: reserva del ${res.date} · ${res.time_slot}`,
      created_by: userId ?? null,
    }).select('id').single()
    if (dErr) { showToast(`No se pudo crear el deal: ${dErr.message}`, 'error'); return }
    notifySlack(dealCreatedMessage(title, 'EVENT', null, g.full_name, dealLink(deal.id)))
    showToast('Deal Evento creado — ábrelo para completar valor y detalles.', 'success')
    window.dispatchEvent(new CustomEvent('hog:open-deal', { detail: deal.id }))
  }

  async function setStatus(res: Reservation, status: ResStatus, reason?: string) {
    const prev = res.status
    setReservations(rs => rs.map(r => r.id === res.id ? { ...r, status } : r))
    setMenuRes(null)
    const patch: Record<string, unknown> = { status, status_changed_by: userId ?? null }
    if (status === 'cancelled' && reason?.trim()) patch.cancel_reason = reason.trim()
    const { error } = await supabase.from('reservations').update(patch).eq('id', res.id)
    if (error) {
      setReservations(rs => rs.map(r => r.id === res.id ? { ...r, status: prev } : r))
      showToast(`No se pudo actualizar: ${error.message}`, 'error')
      return
    }
    const gname = guestMap[res.guest_id]?.full_name ?? 'cliente'
    logActivity('reservation_status', 'reservation', res.id, { guest: gname, bu: buMap[res.bu_id], to: STATUS_META[status].label })
    // Slack al canal: pérdidas grandes (pax ≥ 8)
    if ((status === 'no_show' || status === 'cancelled') && res.party_size >= 8) {
      notifySlack(reservationLostMessage(status, gname, buMap[res.bu_id] ?? '', res.date, res.time_slot, res.party_size, reason))
    }
    if (status === 'completed') showToast('Reserva completada — visita registrada.', 'success')
    else showToast(`Reserva ${STATUS_META[status].label.toLowerCase()}.`, 'success')
  }

  // ── Día: agrupar por slot (capacidad primero, luego slots ad-hoc) ──
  const daySlots = useMemo(() => {
    const active = reservations.filter(r => r.status !== 'cancelled')
    const slotNames = [...new Set([...capacity.map(c => c.time_slot), ...active.map(r => r.time_slot)])].sort()
    return slotNames.map(slot => {
      const rows = reservations.filter(r => r.time_slot === slot)
      const activeRows = rows.filter(r => ACTIVE_STATUSES.includes(r.status))
      const cap = capacity.find(c => c.time_slot === slot)
      return { slot, rows, count: activeRows.length, pax: activeRows.reduce((s, r) => s + r.party_size, 0), cap }
    }).filter(s => s.rows.length > 0 || s.cap)
  }, [reservations, capacity])

  const kpis = useMemo(() => {
    const act = reservations.filter(r => ACTIVE_STATUSES.includes(r.status))
    return {
      total: act.length,
      pax: act.reduce((s, r) => s + r.party_size, 0),
      confirmed: reservations.filter(r => r.status === 'confirmed').length,
      seated: reservations.filter(r => r.status === 'seated').length,
    }
  }, [reservations])

  const weekStart = addDays(date, -new Date(date + 'T00:00:00').getDay())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={buId}
            onChange={e => setBuId(e.target.value)}
            disabled={isTeam && allowedBuList.length === 1}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: 14, fontWeight: 600, minHeight: 44, outline: 'none', cursor: 'pointer' }}
          >
            {allowedBuList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <button onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior" style={navBtn}><ChevronLeft size={16} /></button>
            <button onClick={() => setDate(today)} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontWeight: date === today ? 700 : 400, color: date === today ? 'var(--accent)' : 'var(--text-secondary)' }}>Hoy</button>
            <button onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente" style={navBtn}><ChevronRight size={16} /></button>
          </div>

          {canManageCapacity && (
            <button onClick={() => setCapOpen(true)} title="Configurar capacidad" aria-label="Configurar capacidad"
              style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <Settings2 size={17} />
            </button>
          )}
          {canWrite && (
            <button onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
              <Plus size={15} /> {!isMobile && 'Nueva reserva'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
            {new Date(date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <div style={{ marginLeft: 'auto', maxWidth: 200, flex: 1 }}>
            <SegmentedControl options={[{ id: 'day', label: 'Día' }, { id: 'week', label: 'Semana' }]} value={view} onChange={id => setView(id as 'day' | 'week')} />
          </div>
        </div>

        {view === 'day' && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            <KPITile label="Reservas" value={String(kpis.total)} />
            <KPITile label="Pax" value={String(kpis.pax)} color="var(--accent)" />
            <KPITile label="Confirmadas" value={String(kpis.confirmed)} />
            <KPITile label="Sentadas" value={String(kpis.seated)} color="var(--status-attention)" />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse-green" style={{ height: 76, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />)}
          </div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No pudimos cargar las reservas. Revisa tu conexión.</p>
            <button onClick={() => { setLoading(true); load() }} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}>Reintentar</button>
          </div>
        ) : view === 'week' ? (
          /* ── Semana: 7 columnas con totales; tap → día ── */
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(7, 1fr)', gap: 8 }}>
            {Array.from({ length: 7 }).map((_, i) => {
              const d = addDays(weekStart, i)
              const rows = weekRows.filter(r => r.date === d && ACTIVE_STATUSES.includes(r.status))
              const pax = rows.reduce((s, r) => s + r.party_size, 0)
              const isToday = d === today
              return (
                <button key={d} onClick={() => { setDate(d); setView('day') }}
                  style={{ background: 'var(--bg-surface)', border: isToday ? '1px solid var(--accent-border)' : 'none', borderRadius: 'var(--radius-md)', padding: 12, cursor: 'pointer', textAlign: 'left', minHeight: 44 }}>
                  <div className="num" style={{ fontSize: 11, color: isToday ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: 700 }}>
                    {DAYS_ES[new Date(d + 'T00:00:00').getDay()]} {new Date(d + 'T00:00:00').getDate()}
                  </div>
                  <div className="num" style={{ fontSize: 20, fontWeight: 700, color: rows.length ? 'var(--text-primary)' : 'var(--text-tertiary)', marginTop: 4 }}>{rows.length}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{rows.length === 1 ? 'reserva' : 'reservas'} · {pax} pax</div>
                </button>
              )
            })}
          </div>
        ) : daySlots.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>🍸</span>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 300, margin: 0 }}>
              Sin reservas para este día en {buMap[buId] ?? 'este venue'}. Crea la primera.
            </p>
            {canWrite && (
              <button onClick={() => setCreating(true)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Nueva reserva</button>
            )}
          </div>
        ) : (
          /* ── Día: grupos por slot con indicador de capacidad ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {daySlots.map(({ slot, rows, count, pax, cap }) => {
              const overRes = cap && count > cap.max_reservations
              const overPax = cap && pax > cap.max_pax
              return (
                <div key={slot}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{slot}</span>
                    {cap ? (
                      <span className="num" style={{ fontSize: 11, color: (overRes || overPax) ? 'var(--status-attention)' : 'var(--text-tertiary)' }}>
                        {count}/{cap.max_reservations} reservas · {pax}/{cap.max_pax} pax{(overRes || overPax) && ' · sobrecupo'}
                      </span>
                    ) : (
                      <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{count} reservas · {pax} pax</span>
                    )}
                    <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {rows.length === 0 ? (
                      <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: 0, padding: '2px 0 2px 4px' }}>Slot libre.</p>
                    ) : rows.map(r => {
                      const g = guestMap[r.guest_id]
                      const meta = STATUS_META[r.status]
                      const SrcIcon = SOURCE_ICON[r.source]
                      const terminal = !meta.next
                      return (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '10px 12px', flexShrink: 0, opacity: r.status === 'cancelled' || r.status === 'no_show' ? 0.6 : 1 }}>
                          <button onClick={() => setOpenGuestId(r.guest_id)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flex: 1, minWidth: 0, textAlign: 'left', minHeight: 44 }}>
                            <Avatar name={g?.full_name ?? '?'} size={34} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{g?.full_name ?? 'Cliente'}</span>
                                {(noShowMap[r.guest_id] ?? 0) >= 2 && (
                                  <span title={`${noShowMap[r.guest_id]} no-shows previos`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9, color: 'var(--status-attention)', fontFamily: 'var(--font-mono)' }}>
                                    <AlertTriangle size={10} /> {noShowMap[r.guest_id]}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700 }}>{r.party_size} pax</span>
                                {r.zone && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{r.zone}</span>}
                                <SrcIcon size={11} style={{ color: 'var(--text-tertiary)' }} aria-label={SOURCE_LABEL[r.source]} />
                                <span title={`Reservó: ${bookedBy(r)}`} style={{ fontSize: 10, color: bookedBy(r) === 'Concierge HOG' ? 'var(--accent)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>· {bookedBy(r)}</span>
                                {r.notes && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>· {r.notes}</span>}
                              </div>
                            </div>
                          </button>
                          <StatusBadgeV2 tone={meta.tone} label={meta.label} />
                          {canWrite && !terminal && meta.next && (
                            <button onClick={() => setStatus(r, meta.next!)}
                              style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {meta.nextLabel}
                            </button>
                          )}
                          {canWrite && !terminal && (
                            <button onClick={() => { setMenuRes(r); setCancelReason('') }} aria-label="Más acciones"
                              style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <MoreHorizontal size={16} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Menú secundario: no-show / cancelar */}
      <Sheet open={!!menuRes} onClose={() => setMenuRes(null)} isMobile={isMobile} width={400}>
        {menuRes && (
          <div style={{ padding: '0 var(--space-4) var(--space-6)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
              <h3 style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, margin: 0 }}>
                {guestMap[menuRes.guest_id]?.full_name ?? 'Reserva'} · {menuRes.time_slot}
              </h3>
              <button onClick={() => setMenuRes(null)} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {menuRes.party_size >= eventPaxThreshold && (
                <button onClick={() => convertToDeal(menuRes)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <Handshake size={15} /> Convertir en deal (Evento) · {menuRes.party_size} pax
                </button>
              )}
              <button onClick={() => setStatus(menuRes, 'no_show')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 14px', borderRadius: 'var(--radius-sm)', border: '1px solid color-mix(in srgb, var(--status-risk) 30%, transparent)', background: 'color-mix(in srgb, var(--status-risk) 8%, transparent)', color: 'var(--status-risk)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <AlertTriangle size={15} /> Marcar no-show
              </button>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>Cancelar reserva</label>
                <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Motivo (opcional)…"
                  style={{ width: '100%', minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                <button onClick={() => setStatus(menuRes, 'cancelled', cancelReason)}
                  style={{ width: '100%', minHeight: 44, borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar reserva
                </button>
              </div>
            </div>
          </div>
        )}
      </Sheet>

      {capOpen && buId && (
        <CapacityEditor buId={buId} buCode={buMap[buId] ?? ''} onClose={() => setCapOpen(false)} onSaved={load} />
      )}

      {creating && buId && (
        <CreateReservationSheet
          buId={buId}
          buList={allowedBuList}
          defaultDate={date}
          userId={userId}
          userRole={userRole}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load() }}
        />
      )}

      {openGuestId && (
        <GuestProfile guestId={openGuestId} buMap={buMap} userRole={userRole} onClose={() => setOpenGuestId(null)} onChanged={load} />
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
}

// ── Alta de reserva — flujo del host, ≤30 segundos ──────────────────────────
function CreateReservationSheet({ buId, buList, defaultDate, userId, userRole, onClose, onCreated }: {
  buId: string
  buList: { id: string; code: string; name: string }[]
  defaultDate: string
  userId?: string
  userRole?: string
  onClose: () => void
  onCreated: () => void
}) {
  const canOverride = ['MASTER', 'OPS_MANAGER'].includes(userRole ?? '')
  const isMobile = useIsMobile()
  const [venue, setVenue] = useState(buId)
  const [guest, setGuest] = useState<GuestLite | null>(null)
  const [gQuery, setGQuery] = useState('')
  const [gResults, setGResults] = useState<GuestLite[]>([])
  const [creatingGuest, setCreatingGuest] = useState(false)
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [date, setDate] = useState(defaultDate)
  const [slots, setSlots] = useState<{ slot: string; used: number; max: number | null; paxUsed: number; maxPax: number | null; custom?: boolean }[]>([])
  const [overrideCap, setOverrideCap] = useState(false)
  const [slot, setSlot] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [customSlot, setCustomSlot] = useState('')
  const [pax, setPax] = useState(2)
  const [zone, setZone] = useState('')
  const [source, setSource] = useState<ResSource>('phone')
  const [notes, setNotes] = useState('')
  const [confirmNow, setConfirmNow] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // La autorización de sobrecupo no sobrevive a un cambio de slot/fecha/venue/pax
  useEffect(() => { setOverrideCap(false) }, [slot, date, venue, pax])

  useEffect(() => {
    supabase.from('guest_tag_options').select('label').eq('active', true).then(({ data }) => setTagOptions((data ?? []).map(t => t.label)))
  }, [])

  // Buscar guest por teléfono o nombre
  useEffect(() => {
    if (guest || gQuery.trim().length < 2) { setGResults([]); return }
    const t = setTimeout(async () => {
      const digits = gQuery.replace(/\D/g, '')
      let q = supabase.from('guests').select('id, full_name, phone, tags').eq('status', 'active').limit(8)
      q = digits.length >= 3 ? q.ilike('phone', `%${digits}%`) : q.ilike('full_name', `%${gQuery.trim()}%`)
      const { data } = await q
      setGResults((data ?? []) as GuestLite[])
    }, 220)
    return () => clearTimeout(t)
  }, [gQuery, guest])

  // Slots activos con disponibilidad para venue+fecha
  useEffect(() => {
    async function loadSlots() {
      const dow = new Date(date + 'T00:00:00').getDay()
      const [{ data: cap }, { data: res }] = await Promise.all([
        supabase.from('venue_capacity').select('time_slot, max_reservations, max_pax').eq('bu_id', venue).eq('day_of_week', dow).eq('active', true).order('time_slot'),
        supabase.from('reservations').select('time_slot, status, party_size').eq('bu_id', venue).eq('date', date),
      ])
      const used: Record<string, number> = {}
      const paxUsed: Record<string, number> = {}
      for (const r of res ?? []) if (['requested', 'confirmed', 'seated', 'completed'].includes(r.status)) {
        used[r.time_slot] = (used[r.time_slot] ?? 0) + 1
        paxUsed[r.time_slot] = (paxUsed[r.time_slot] ?? 0) + (r.party_size ?? 0)
      }
      const rows = (cap && cap.length > 0)
        ? cap.map(c => ({ slot: c.time_slot, used: used[c.time_slot] ?? 0, max: c.max_reservations, paxUsed: paxUsed[c.time_slot] ?? 0, maxPax: c.max_pax }))
        : DEFAULT_SLOTS.map(s => ({ slot: s, used: used[s] ?? 0, max: null, paxUsed: paxUsed[s] ?? 0, maxPax: null }))   // sin capacidad configurada → slots default
      setSlots(rows)
      setSlot(prev => rows.some(r => r.slot === prev) ? prev : (rows[0]?.slot ?? ''))
    }
    loadSlots()
  }, [venue, date])

  // Regla de sobrecupo: lleno por número de reservas o porque el pax no cabe
  const selectedSlot = slots.find(s => s.slot === slot)
  const slotFull = !!selectedSlot && (
    (selectedSlot.max !== null && selectedSlot.used >= selectedSlot.max) ||
    (selectedSlot.maxPax !== null && selectedSlot.paxUsed + pax > selectedSlot.maxPax)
  )
  const blockedByCapacity = slotFull && !(canOverride && overrideCap)
  const valid = !!guest && !!venue && !!date && !!slot && pax > 0 && !blockedByCapacity

  function applyCustomSlot() {
    const v = customSlot.trim()
    if (!v) return
    setSlots(prev => prev.some(s => s.slot === v) ? prev : [...prev, { slot: v, used: 0, max: null, paxUsed: 0, maxPax: null, custom: true }])
    setSlot(v)
    setShowCustom(false)
    setCustomSlot('')
  }

  async function save() {
    if (!valid || !guest) return
    setSaving(true); setError(null)
    const status = confirmNow ? 'confirmed' : 'requested'
    const overbooking = slotFull && canOverride && overrideCap
    const { data, error: err } = await supabase.from('reservations').insert({
      guest_id: guest.id, bu_id: venue, date, time_slot: slot, party_size: pax,
      zone: zone.trim() || null, status, source, notes: notes.trim() || null,
      created_by: userId ?? null, status_changed_by: userId ?? null,
      confirmed_at: confirmNow ? new Date().toISOString() : null,
      overbooked_by: overbooking ? (userId ?? null) : null,
    }).select('id').single()
    setSaving(false)
    if (err) { setError(`No se pudo crear: ${err.message}`); return }
    const buCode = buList.find(b => b.id === venue)?.code
    logActivity('reservation_created', 'reservation', data.id, { guest: guest.full_name, bu: buCode, date, slot, pax })
    notifySlack(reservationCreatedMessage(guest.full_name, buCode ?? '', date, slot, pax))
    if (overbooking) logActivity('reservation_overbooked', 'reservation', data.id, { guest: guest.full_name, bu: buCode, slot, pax })
    showToast(overbooking ? 'Reserva creada con sobrecupo autorizado.' : 'Reserva creada.', 'success')
    onCreated()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={460}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Nueva reserva</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 1. Guest */}
          <div>
            <label style={lbl}>Cliente *</label>
            {guest ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                <Avatar name={guest.full_name} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{guest.full_name}</div>
                  <div className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatPhone(guest.phone)}</div>
                </div>
                <button onClick={() => { setGuest(null); setGQuery('') }} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', width: 36, height: 36 }}><X size={14} /></button>
              </div>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input value={gQuery} onChange={e => setGQuery(e.target.value)} inputMode="tel" autoFocus placeholder="Teléfono o nombre del cliente…" style={{ ...inputStyle, paddingLeft: 34 }} />
                </div>
                {gResults.length > 0 && (
                  <div style={{ marginTop: 6, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    {gResults.map(g => (
                      <button key={g.id} onClick={() => setGuest(g)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '0 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                        <Avatar name={g.full_name} size={26} />
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{g.full_name}</span>
                        <span className="num" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>{formatPhone(g.phone)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {gQuery.trim().length >= 2 && gResults.length === 0 && (
                  <button onClick={() => setCreatingGuest(true)}
                    style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 999, border: '1px dashed var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={14} /> Crear cliente "{gQuery.trim()}"
                  </button>
                )}
              </>
            )}
          </div>

          {/* 2. Venue + fecha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Venue *</label>
              <select value={venue} onChange={e => setVenue(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {buList.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Fecha *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="num" style={inputStyle} />
            </div>
          </div>

          {/* 3. Slot con disponibilidad */}
          <div>
            <label style={lbl}>Horario *</label>
            {slots.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>Cargando horarios…</p>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {slots.map(s => {
                  const full = s.max !== null && s.used >= s.max
                  const on = slot === s.slot
                  const custom = !!s.custom
                  return (
                    <button key={s.slot} onClick={() => setSlot(s.slot)}
                      style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', background: on ? 'var(--accent-bg)' : 'var(--bg-elevated)', border: `1px solid ${on ? 'var(--accent)' : custom ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : full ? 'color-mix(in srgb, var(--status-attention) 40%, transparent)' : 'var(--border-default)'}`, color: on ? 'var(--accent)' : full ? 'var(--status-attention)' : 'var(--text-secondary)' }}>
                      {s.slot}{s.max !== null && <span style={{ fontSize: 10, marginLeft: 6 }}>{s.used}/{s.max}</span>}
                    </button>
                  )
                })}
                {showCustom ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexBasis: '100%' }}>
                    <input value={customSlot} onChange={e => setCustomSlot(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCustomSlot() } }}
                      placeholder="17:00–19:00" className="num"
                      style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)' }} />
                    <button onClick={applyCustomSlot} disabled={!customSlot.trim()}
                      style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: customSlot.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, background: customSlot.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: customSlot.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)' }}>Usar</button>
                    <button onClick={() => { setShowCustom(false); setCustomSlot('') }} aria-label="Cancelar"
                      style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={14} /></button>
                  </div>
                ) : (
                  <button onClick={() => setShowCustom(true)}
                    style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'transparent', border: '1px dashed var(--accent-border)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Plus size={13} /> Otro horario
                  </button>
                )}
              </div>
            )}
            {showCustom && <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '6px 0 0' }}>Para eventos especiales o apertura anticipada. Sin límite de cupo.</p>}
          </div>

          {/* 4. Pax + zona */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Pax *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setPax(p => Math.max(1, p - 1))} style={navBtn}>−</button>
                <span className="num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', minWidth: 32, textAlign: 'center' }}>{pax}</span>
                <button onClick={() => setPax(p => p + 1)} style={navBtn}>+</button>
              </div>
            </div>
            <div>
              <label style={lbl}>Zona</label>
              <select value={zone} onChange={e => setZone(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Sin zona</option>
                {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>

          {/* 5. Fuente */}
          <div>
            <label style={lbl}>Fuente</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(SOURCE_LABEL) as ResSource[]).map(s => {
                const Icon = SOURCE_ICON[s]
                const on = source === s
                return (
                  <button key={s} onClick={() => setSource(s)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 40, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: on ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, color: on ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    <Icon size={13} /> {SOURCE_LABEL[s]}
                  </button>
                )
              })}
            </div>
          </div>

          {slotFull && (
            <div style={{ background: 'color-mix(in srgb, var(--status-attention) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-attention) 35%, transparent)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--status-attention)', fontSize: 13, fontWeight: 700, margin: 0 }}>
                <AlertTriangle size={14} /> Slot lleno
                {selectedSlot?.max !== null && ` — ${selectedSlot?.used}/${selectedSlot?.max} reservas`}
                {selectedSlot?.maxPax !== null && ` · ${selectedSlot ? selectedSlot.paxUsed + pax : 0}/${selectedSlot?.maxPax} pax con esta reserva`}
              </p>
              {canOverride ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', minHeight: 36 }}>
                  <input type="checkbox" checked={overrideCap} onChange={e => setOverrideCap(e.target.checked)} style={{ accentColor: 'var(--status-attention)', width: 18, height: 18 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Autorizar sobrecupo — queda registrado a tu nombre en Actividad.</span>
                </label>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0' }}>Solo un Ops Manager o Master puede autorizar sobrecupo. Elige otro slot.</p>
              )}
            </div>
          )}

          <div>
            <label style={lbl}>Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Ocasión, alergias, mesa solicitada…" style={{ ...inputStyle, minHeight: 56, padding: '10px 12px', resize: 'vertical' }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 44 }}>
            <input type="checkbox" checked={confirmNow} onChange={e => setConfirmNow(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 18, height: 18 }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Confirmar de inmediato (si no, queda como solicitada)</span>
          </label>

          {error && <p style={{ color: 'var(--status-risk)', fontSize: 13, background: 'color-mix(in srgb, var(--status-risk) 10%, transparent)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', margin: 0 }}>{error}</p>}

          <button onClick={save} disabled={!valid || saving}
            style={{ minHeight: 48, borderRadius: 999, border: 'none', background: valid ? 'var(--accent)' : 'var(--bg-elevated)', color: valid ? 'var(--on-accent)' : 'var(--text-tertiary)', fontSize: 14, fontWeight: 700, cursor: valid ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Check size={15} /> {saving ? 'Creando…' : confirmNow ? 'Crear y confirmar' : 'Crear solicitud'}
          </button>
        </div>
      </div>

      {creatingGuest && (
        <GuestCreateSheet
          buList={buList}
          tagOptions={tagOptions}
          userId={userId}
          defaultBuId={venue}
          onClose={() => setCreatingGuest(false)}
          onCreated={async (id) => {
            setCreatingGuest(false)
            const { data } = await supabase.from('guests').select('id, full_name, phone, tags').eq('id', id).single()
            if (data) setGuest(data as GuestLite)
          }}
          onOpenExisting={async (id) => {
            setCreatingGuest(false)
            const { data } = await supabase.from('guests').select('id, full_name, phone, tags').eq('id', id).single()
            if (data) setGuest(data as GuestLite)
          }}
        />
      )}
    </Sheet>
  )
}
