import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, Phone, MessageCircle, Camera, Footprints, Building2, AlertTriangle, MoreHorizontal, X, Search, Check, Settings2, Handshake, Share2, Copy, LayoutGrid, Armchair } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatPhone } from '../lib/phone'
import { logActivity } from '../hooks/useActivityLog'
import { notifySlack, reservationCreatedMessage, reservationLostMessage, dealCreatedMessage, dealLink } from '../hooks/useSlack'
import { useIsMobile } from '../hooks/useIsMobile'
import { Avatar } from '../components/ui/Avatar'
import { GuestProfile } from '../components/ui/GuestProfile'
import { GuestCreateSheet } from './Guests'
import { CapacityEditor } from '../components/ui/CapacityEditor'
import { FloorEditor } from '../components/ui/FloorEditor'
import { FloorLive } from '../components/ui/FloorLive'
import { OccupancyCurve } from '../components/ui/OccupancyCurve'
import { SegmentedControl, Sheet, StatusBadgeV2, showToast, type StatusTone } from '../components/v2'

// ── Types ────────────────────────────────────────────────────────────────────
type ResStatus = 'requested' | 'confirmed' | 'seated' | 'completed' | 'no_show' | 'cancelled'
type ResSource = 'phone' | 'whatsapp' | 'instagram' | 'walk_in' | 'internal' | 'web'

interface Reservation {
  id: string
  guest_id: string
  bu_id: string
  date: string
  time_slot: string
  party_size: number
  zone: string | null
  zone_id?: string | null
  table_id?: string | null
  combo_id?: string | null
  duration_min?: number | null
  proposed_time?: string | null
  status: ResStatus
  source: ResSource
  notes: string | null
  created_at: string
  created_by: string | null
  bot_conversation_id: string | null
  manage_token?: string | null
  // Sellos del ciclo de vida (el trigger de status los pone; confirm_sent_at
  // lo pone reservation-notify al mandar el WhatsApp)
  confirmed_at?: string | null
  seated_at?: string | null
  completed_at?: string | null
  confirm_sent_at?: string | null
  cancel_reason?: string | null
}
interface GuestLite { id: string; full_name: string; phone: string; tags: string[] }
interface CapacityRow { id: string; day_of_week: number; max_reservations: number; max_pax: number; open_time: string | null; close_time: string | null; active: boolean }

// La curva de ocupación (OccupancyCurve) reemplazó al cálculo acumulado por
// hora: ahora cada reserva ocupa llegada → llegada + duración configurada.

const STATUS_META: Record<ResStatus, { label: string; tone: StatusTone; next?: ResStatus; nextLabel?: string }> = {
  requested: { label: 'Solicitada', tone: 'neutral',   next: 'confirmed', nextLabel: 'Confirmar' },
  confirmed: { label: 'Confirmada', tone: 'accent',    next: 'seated',    nextLabel: 'Sentar' },
  seated:    { label: 'Sentada',    tone: 'attention', next: 'completed', nextLabel: 'Completar' },
  completed: { label: 'Completada', tone: 'healthy' },
  no_show:   { label: 'No-show',    tone: 'risk' },
  cancelled: { label: 'Cancelada',  tone: 'neutral' },
}
const SOURCE_ICON: Record<ResSource, React.ElementType> = {
  phone: Phone, whatsapp: MessageCircle, instagram: Camera, walk_in: Footprints, internal: Building2, web: Share2,
}
const SOURCE_LABEL: Record<ResSource, string> = {
  phone: 'Teléfono', whatsapp: 'WhatsApp', instagram: 'Instagram', walk_in: 'Walk-in', internal: 'Interno', web: 'Reserva web',
}
const ZONES = ['Terraza', 'Barra', 'Salón', 'VIP']
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// ── Línea de tiempo de la reserva: de la creación al fin de la estancia ──────
// Los hitos viven en la propia reserva (created_at, confirm_sent_at,
// confirmed_at, seated_at, completed_at — el trigger de status los sella) y
// los sucesos intermedios —avisos del cliente desde su link personalizado,
// ediciones, cambios de hora— salen del activity_log. Un solo riel cuenta
// toda la historia sin que nadie tenga que reconstruirla de memoria.
interface TLItem { t: string | null; label: string; sub?: string; state: 'done' | 'pending' | 'note' | 'bad' }

const fmtTL = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

function ResTimeline({ res, bookedByName }: { res: Reservation; bookedByName: string }) {
  const [eventos, setEventos] = useState<TLItem[]>([])
  // Fallback para reservas viejas sin confirm_sent_at: la actividad registró el envío
  const [envioFallback, setEnvioFallback] = useState<string | null>(null)

  useEffect(() => {
    setEventos([]); setEnvioFallback(null)
    supabase.from('activity_log').select('created_at, action, details')
      .eq('entity_type', 'reservation').eq('entity_id', res.id)
      .order('created_at', { ascending: true }).limit(60)
      .then(({ data }) => {
        const out: TLItem[] = []
        for (const ev of data ?? []) {
          const d = (ev.details ?? {}) as Record<string, unknown>
          const delCliente = d.actor === 'Cliente (mi reserva)'
          if (typeof d.aviso === 'string') {
            out.push({ t: ev.created_at, label: `El cliente avisó: ${d.aviso}`, sub: 'desde su link personalizado', state: 'note' })
          } else if (ev.action === 'reservation_status' && delCliente) {
            out.push({ t: ev.created_at, label: `El cliente canceló desde su link${d.motivo ? ` — ${d.motivo}` : ''}`, state: 'bad' })
          } else if (ev.action === 'reservation_updated' && d.via === 'propuesta_aceptada') {
            out.push({ t: ev.created_at, label: `Cambio de hora aceptado: ${d.antes} → ${d.ahora}`, state: 'note' })
          } else if (ev.action === 'reservation_updated' && d.via === 'edicion' && Array.isArray(d.cambios)) {
            out.push({ t: ev.created_at, label: `Reserva editada: ${(d.cambios as string[]).join(', ')}`, state: 'note' })
          } else if (ev.action === 'reservation_updated' && String(d.via ?? '').startsWith('confirmacion_whatsapp')) {
            setEnvioFallback(prev => prev ?? ev.created_at)
          }
        }
        setEventos(out)
      })
  }, [res.id])

  const cerradaMal = res.status === 'cancelled' || res.status === 'no_show'
  const enviadaEn = res.confirm_sent_at ?? envioFallback
  const confirmada = !!res.confirmed_at || ['confirmed', 'seated', 'completed'].includes(res.status)
  const sentada = !!res.seated_at || ['seated', 'completed'].includes(res.status)
  const finalizada = !!res.completed_at || res.status === 'completed'

  const hitos: TLItem[] = [
    { t: res.created_at, label: 'Reserva creada', sub: `${SOURCE_LABEL[res.source]} · ${bookedByName}`, state: 'done' },
    { t: enviadaEn, label: 'Confirmación enviada por WhatsApp', sub: enviadaEn ? 'con su link personalizado' : undefined, state: enviadaEn ? 'done' : 'pending' },
    { t: res.confirmed_at ?? null, label: 'Confirmada', state: confirmada ? 'done' : 'pending' },
    ...eventos,
    { t: res.seated_at ?? null, label: 'Sentada — el cliente llegó', state: sentada ? 'done' : 'pending' },
    { t: res.completed_at ?? null, label: 'Estancia finalizada', state: finalizada ? 'done' : 'pending' },
  ]
  // Cancelada / no-show: lo que no pasó ya no va a pasar — el riel termina ahí.
  // Si el cliente canceló desde su link, ese evento YA es el nodo final.
  const yaCanceloCliente = eventos.some(e => e.state === 'bad')
  const lista = cerradaMal
    ? [
        ...hitos.filter(i => i.state !== 'pending'),
        ...(yaCanceloCliente ? [] : [{
          t: null,
          label: res.status === 'no_show' ? 'No-show — el cliente nunca llegó' : `Cancelada${res.cancel_reason ? ` — ${res.cancel_reason}` : ''}`,
          state: 'bad' as const,
        }]),
      ]
    : hitos
  // Lo vivido se ordena por hora real (los avisos del cliente caen donde
  // ocurrieron); lo pendiente se queda al final en orden natural.
  const vividos = lista.filter(i => i.state !== 'pending').sort((a, b) => (a.t ?? '9999').localeCompare(b.t ?? '9999'))
  const porVenir = lista.filter(i => i.state === 'pending')
  const riel = [...vividos, ...porVenir]

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 10 }}>Línea de tiempo</label>
      {riel.map((i, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: idx === riel.length - 1 ? 0 : 13 }}>
          {idx < riel.length - 1 && <div style={{ position: 'absolute', left: 5, top: 15, bottom: -2, width: 2, background: 'var(--border-subtle)' }} />}
          <div style={{
            width: 12, height: 12, borderRadius: '50%', marginTop: 2, flexShrink: 0, zIndex: 1, boxSizing: 'border-box',
            background: i.state === 'done' ? 'var(--accent)' : i.state === 'note' ? 'var(--status-attention)' : i.state === 'bad' ? 'var(--status-risk)' : 'var(--bg-elevated)',
            border: i.state === 'pending' ? '2px solid var(--border-strong)' : 'none',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: i.state === 'pending' ? 500 : 700, color: i.state === 'pending' ? 'var(--text-tertiary)' : i.state === 'bad' ? 'var(--status-risk)' : 'var(--text-primary)' }}>
              {i.label}
            </div>
            {(i.t || i.sub) && (
              <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 1 }}>
                {i.t && <span className="num" style={{ fontFamily: 'var(--font-mono)' }}>{fmtTL(i.t)}</span>}
                {i.t && i.sub ? ' · ' : ''}{i.sub ?? ''}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

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
  const [view, setView] = useState<'day' | 'week' | 'all' | 'floor'>('day')
  const [allRows, setAllRows] = useState<Reservation[]>([])
  const [allSearch, setAllSearch] = useState('')
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
    if (r.source === 'web') return 'Reserva web'
    return (r.source === 'whatsapp' || r.source === 'instagram') ? 'Concierge HOG' : '—'
  }, [profileMap])
  const [capacity, setCapacity] = useState<CapacityRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [openGuestId, setOpenGuestId] = useState<string | null>(null)
  const [menuRes, setMenuRes] = useState<Reservation | null>(null)
  const [capOpen, setCapOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [floorOpen, setFloorOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // Vista operativa (HoH): filtro de excepciones + reloj + config del venue
  const [exFilter, setExFilter] = useState<'all' | 'unconfirmed' | 'no_table' | 'deposit' | 'proposal' | 'no_guarantee'>('all')
  // Lista de espera (Fase 4): walk-ins sin lugar, gestionados por el host
  const [waitOpen, setWaitOpen] = useState(false)
  const [waitCount, setWaitCount] = useState(0)
  const loadWaitCount = useCallback(async () => {
    if (!buId) return
    const { count } = await supabase.from('reservation_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('bu_id', buId).eq('date', today).eq('status', 'waiting')
    setWaitCount(count ?? 0)
  }, [buId, today])
  useEffect(() => { loadWaitCount() }, [loadWaitCount])
  const [opsCfg, setOpsCfg] = useState<{ hasTables: boolean; holdMin: number; durations: { max_pax: number; minutes: number }[] }>({ hasTables: false, holdMin: 15, durations: [] })
  const [nowTick, setNowTick] = useState(Date.now())

  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(iv)
  }, [])
  useEffect(() => { setExFilter('all') }, [buId, date])
  // Panel único de la reserva: edición de la reserva Y del cliente en la
  // misma ventana (host/HoH incluido)
  const [editForm, setEditForm] = useState<{ date: string; time: string; pax: number; zone: string; notes: string } | null>(null)
  const [guestEdit, setGuestEdit] = useState<{ name: string; phone: string; notes: string } | null>(null)
  const [guestNotes0, setGuestNotes0] = useState('')
  useEffect(() => {
    setEditForm(menuRes ? { date: menuRes.date, time: menuRes.time_slot, pax: menuRes.party_size, zone: menuRes.zone ?? '', notes: menuRes.notes ?? '' } : null)
    const g = menuRes ? guestMap[menuRes.guest_id] : null
    setGuestEdit(menuRes ? { name: g?.full_name ?? '', phone: g?.phone ?? '', notes: '' } : null)
    setGuestNotes0('')
    setCancelOpen(false); setCancelReason('')
    // Notas del cliente (persisten entre visitas) — se cargan al abrir el panel
    if (menuRes) {
      supabase.from('guests').select('notes').eq('id', menuRes.guest_id).maybeSingle().then(({ data }) => {
        setGuestEdit(prev => prev ? { ...prev, notes: data?.notes ?? '' } : prev)
        setGuestNotes0(data?.notes ?? '')
      })
    }
  }, [menuRes?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // VIP / Socio: se marca con un toque y se guarda al instante en el cliente
  async function toggleGuestTag(tag: string) {
    if (!menuRes) return
    const g = guestMap[menuRes.guest_id]
    if (!g) return
    const has = (g.tags ?? []).includes(tag)
    const tags = has ? (g.tags ?? []).filter(t => t !== tag) : [...(g.tags ?? []), tag]
    setGuestMap(m => ({ ...m, [g.id]: { ...g, tags } }))
    const { error } = await supabase.from('guests').update({ tags }).eq('id', g.id)
    if (error) { showToast(`No se pudo: ${error.message}`, 'error'); load(); return }
    logActivity('guest_updated', 'guest', g.id, { guest: g.full_name, [has ? 'quita' : 'agrega']: tag })
  }

  async function saveResEdit() {
    if (!menuRes || !editForm) return
    const g = guestMap[menuRes.guest_id]
    const cambios: string[] = []
    if (editForm.date !== menuRes.date) cambios.push(`fecha ${menuRes.date} → ${editForm.date}`)
    if (editForm.time !== menuRes.time_slot) cambios.push(`hora ${menuRes.time_slot} → ${editForm.time}`)
    if (editForm.pax !== menuRes.party_size) cambios.push(`pax ${menuRes.party_size} → ${editForm.pax}`)
    if (editForm.zone !== (menuRes.zone ?? '')) cambios.push(`zona → ${editForm.zone || 'sin zona'}`)
    if (editForm.notes !== (menuRes.notes ?? '')) cambios.push('notas')
    const guestChanged = guestEdit && g && (
      guestEdit.name.trim() !== (g.full_name ?? '') ||
      guestEdit.phone.trim() !== (g.phone ?? '') ||
      guestEdit.notes.trim() !== guestNotes0.trim()
    )
    if (!cambios.length && !guestChanged) { setMenuRes(null); return }

    // Cliente primero (nombre/teléfono/notas persistentes) — si el teléfono
    // choca con otro cliente, se avisa y no se pierde el resto
    if (guestChanged && guestEdit && g) {
      const { error: gErr } = await supabase.from('guests').update({
        full_name: guestEdit.name.trim() || g.full_name, phone: guestEdit.phone.trim() || g.phone,
        notes: guestEdit.notes.trim() || null,
      }).eq('id', g.id)
      if (gErr) { showToast(`Cliente: ${gErr.message.includes('duplicate') ? 'ese teléfono ya es de otro cliente.' : gErr.message}`, 'error'); return }
      cambios.push('datos del cliente')
    }
    if (cambios.length) {
      const { error } = await supabase.from('reservations').update({
        date: editForm.date, time_slot: editForm.time, party_size: Math.max(1, editForm.pax),
        zone: editForm.zone.trim() || null, notes: editForm.notes.trim() || null,
      }).eq('id', menuRes.id)
      if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
      logActivity('reservation_updated', 'reservation', menuRes.id, {
        guest: guestEdit?.name || g?.full_name, bu: buMap[menuRes.bu_id], cambios, via: 'edicion',
      })
    }
    showToast('Cambios guardados.', 'success')
    setMenuRes(null); load()
  }
  useEffect(() => {
    if (!buId) return
    Promise.all([
      supabase.from('venue_tables').select('id', { count: 'exact', head: true }).eq('bu_id', buId).eq('active', true),
      supabase.from('venue_reservation_settings').select('no_show_hold_minutes, durations').eq('bu_id', buId).maybeSingle(),
    ]).then(([t, s]) => setOpsCfg({
      hasTables: (t.count ?? 0) > 0,
      holdMin: s.data?.no_show_hold_minutes ?? 15,
      durations: (s.data?.durations ?? []) as { max_pax: number; minutes: number }[],
    }))
  }, [buId])
  const [cancelReason, setCancelReason] = useState('')
  // La cancelación vive plegada: cancelar es la excepción, no el camino
  const [cancelOpen, setCancelOpen] = useState(false)

  const canWrite = ['MASTER', 'OPS_MANAGER', 'TEAM', 'MARKETING', 'HEART_OF_HOUSE'].includes(userRole ?? '')
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
        supabase.from('business_units').select('id, code, name').order('name'),
        userId ? supabase.from('user_venues').select('bu_id').eq('user_id', userId) : Promise.resolve({ data: null }),
      ])
      setBuList(buses ?? [])
      supabase.from('app_settings').select('value').eq('key', 'reservation_event_pax_threshold').maybeSingle()
        .then(({ data }) => { const n = Number(data?.value); if (n > 0) setEventPaxThreshold(n) })
      const venueIds = (uv ?? [])?.map((r: { bu_id: string }) => r.bu_id) ?? []
      setMyVenues(venueIds.length > 0 ? venueIds : null)
      // Recordar el último venue usado (si sigue permitido); si no, el primero permitido
      const remembered = localStorage.getItem('hog_res_last_bu')
      const allowed = venueIds.length > 0 ? (buses ?? []).filter(b => venueIds.includes(b.id)) : (buses ?? [])
      const first = (remembered && allowed.some(b => b.id === remembered)) ? remembered : allowed[0]?.id
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
      supabase.from('venue_capacity').select('*').eq('bu_id', buId).eq('day_of_week', dow).eq('active', true).maybeSingle(),
    ])
    if (error) { setLoadError(true); setLoading(false); return }
    setReservations((res ?? []) as Reservation[])
    setWeekRows((wk ?? []) as Reservation[])
    setCapacity((cap ?? null) as CapacityRow | null)
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

  // Vista "Todas": reservas del venue de los últimos 30 días en adelante,
  // buscables por cliente. Los guests se cargan al mismo guestMap.
  const loadAll = useCallback(async () => {
    if (!buId) return
    const desde = addDays(today, -30)
    const { data } = await supabase.from('reservations').select('*')
      .eq('bu_id', buId).gte('date', desde).order('date', { ascending: false }).order('time_slot')
    const rows = (data ?? []) as Reservation[]
    setAllRows(rows)
    const ids = [...new Set(rows.map(r => r.guest_id))].filter(id => !guestMap[id])
    if (ids.length) {
      const { data: gs } = await supabase.from('guests').select('id, full_name, phone, tags').in('id', ids)
      setGuestMap(prev => ({ ...prev, ...Object.fromEntries((gs ?? []).map(g => [g.id, g as GuestLite])) }))
    }
  }, [buId, today, guestMap])

  useEffect(() => { if (view === 'all') loadAll() }, [view, buId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Confirmación automática por WhatsApp: el servidor (reservation-notify)
  // decide la vía — chat del concierge (24 h) o plantilla aprobada — y hace
  // dedup con confirm_sent_at. Devuelve si logró enviar.
  // quiet solo silencia los "no aplica" (walk-in, ya enviada). Los ERRORES
  // siempre se muestran: callarlos deja creyendo que al cliente se le avisó
  // cuando nunca le llegó nada.
  async function autoNotify(resId: string, quiet = false): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke('reservation-notify', { body: { reservationId: resId } })
    if (error) {
      showToast('No se pudo contactar al servicio de confirmación. Revisa que la función reservation-notify esté desplegada en Supabase.', 'error')
      return false
    }
    if (data?.ok) {
      showToast(data.method === 'chat' ? 'Confirmación enviada por el chat del concierge ✅' : 'Confirmación enviada por WhatsApp ✅', 'success')
      return true
    }
    if (data?.error) { showToast(`No se envió la confirmación: ${data.error}`, 'error'); return false }
    // Casos legítimos de "no aplica" — informativos, no errores
    if (data?.skipped && !quiet) {
      const motivo = data.skipped === 'ya enviada' ? 'Esta reserva ya tenía su confirmación enviada.'
        : data.skipped === 'walk-in' ? 'Los walk-in no reciben confirmación.'
        : 'La reserva aún no está confirmada.'
      showToast(motivo, 'info')
    }
    return false
  }

  async function setStatus(res: Reservation, status: ResStatus, reason?: string, opts?: { notify?: boolean }) {
    const prev = res.status
    setReservations(rs => rs.map(r => r.id === res.id ? { ...r, status } : r))
    setMenuRes(null)
    const patch: Record<string, unknown> = { status, status_changed_by: userId ?? null }
    if (status === 'cancelled' && reason?.trim()) patch.cancel_reason = reason.trim()
    if (status === 'confirmed') patch.confirmed_at = new Date().toISOString()
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
    // Al confirmar, el cliente recibe su confirmación solo (salvo que el
    // llamador la mande él mismo, como el botón manual de WhatsApp).
    if (status === 'confirmed' && (opts?.notify ?? true)) autoNotify(res.id, true)
  }

  // Confirmación por WhatsApp: confirma la reserva y envía el mensaje con el
  // mini-link "mi reserva" (avisar retraso / cancelar). Si la reserva nació en
  // el bot, la manda el concierge por su canal; si no, se abre WhatsApp con el
  // mensaje listo para enviar desde el teléfono del venue.
  async function confirmWhatsApp(res: Reservation) {
    const g = guestMap[res.guest_id]
    let token = res.manage_token ?? null
    if (!token) {
      token = crypto.randomUUID()
      const { error } = await supabase.from('reservations').update({ manage_token: token }).eq('id', res.id)
      if (error) { showToast(`No se pudo generar el link: ${error.message}`, 'error'); return }
    }
    if (res.status === 'requested') await setStatus(res, 'confirmed', undefined, { notify: false })
    // Primero la vía automática (chat del concierge o plantilla); si el
    // servidor no pudo (sin plantilla aprobada, ya enviada, etc.), cae al
    // WhatsApp manual con el mensaje listo — este botón siempre resuelve.
    if (await autoNotify(res.id, true)) return
    const venueName = buList.find(b => b.id === res.bu_id)?.name ?? buMap[res.bu_id] ?? ''
    const fechaTxt = new Date(res.date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    const link = `${window.location.origin}/?mireserva=${token}`
    // Texto plano SIN emojis: el prefill de wa.me corrompe los caracteres
    // fuera de ASCII en algunos teléfonos (salen "�" y hasta rompe el link).
    const msg = `¡Tu reserva está confirmada!\n\n${venueName}\n${fechaTxt}\n${res.time_slot.slice(0, 5)} hrs · ${res.party_size} ${res.party_size === 1 ? 'persona' : 'personas'}\nA nombre de ${g?.full_name ?? ''}\n\nSi llegas un poco tarde o te surge un imprevisto, avísanos aquí:\n${link}\n\n¡Te esperamos!`
    // Los envíos manuales también sellan confirm_sent_at: la línea de tiempo
    // y el dedup cuentan la MISMA historia venga por donde venga el mensaje.
    // Si la columna aún no existe (falta reclutamiento_confirmacion.sql), el
    // update falla en silencio y el fallback por actividad cubre el hueco.
    const sellarEnvio = () => supabase.from('reservations').update({ confirm_sent_at: new Date().toISOString() }).eq('id', res.id).then(() => {})
    if (res.bot_conversation_id) {
      const { error } = await supabase.functions.invoke('concierge-send', { body: { conversationId: res.bot_conversation_id, body: msg } })
      if (!error) {
        logActivity('reservation_updated', 'reservation', res.id, { via: 'confirmacion_whatsapp_concierge' })
        void sellarEnvio()
        showToast('Confirmación enviada por el concierge ✅', 'success')
        return
      }
      // si el canal del bot falla, cae al WhatsApp manual
    }
    const digits = (g?.phone ?? '').replace(/\D/g, '')
    if (!digits) { showToast('El cliente no tiene teléfono guardado — agrégalo en su ficha.', 'error'); return }
    const wa = digits.length === 10 ? `52${digits}` : digits
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank')
    logActivity('reservation_updated', 'reservation', res.id, { via: 'confirmacion_whatsapp_manual' })
    void sellarEnvio()
    showToast('WhatsApp abierto con la confirmación lista — solo envíala.', 'success')
  }

  // ── Día: horarios libres — agenda ordenada por hora de llegada, sin turnos ──
  const dayRows = useMemo(() => {
    return [...reservations].sort((a, b) => a.time_slot.localeCompare(b.time_slot) || a.created_at.localeCompare(b.created_at))
  }, [reservations])


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
            onChange={e => { setBuId(e.target.value); localStorage.setItem('hog_res_last_bu', e.target.value) }}
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
            <button onClick={() => setShareOpen(true)} title="Link público de reservas" aria-label="Link público de reservas"
              style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <Share2 size={17} />
            </button>
          )}
          {canManageCapacity && (
            <button onClick={() => setFloorOpen(true)} title="Editor de piso (zonas y mesas)" aria-label="Editor de piso"
              style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <LayoutGrid size={17} />
            </button>
          )}
          {canManageCapacity && (
            <button onClick={() => setCapOpen(true)} title="Configurar capacidad" aria-label="Configurar capacidad"
              style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <Settings2 size={17} />
            </button>
          )}
        </div>

        {/* Barra buscadora (todos los venues y fechas) + Nueva reserva en la misma fila */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setSearchOpen(true)}
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, minHeight: 46, padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-tertiary)', cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box' }}>
            <Search size={16} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Buscar cliente o reserva…</span>
          </button>
          {canWrite && (
            <button onClick={() => setCreating(true)} aria-label="Nueva reserva"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, width: isMobile ? 46 : 'auto', padding: isMobile ? 0 : '0 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: isMobile ? 'var(--radius-md)' : 999, cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Plus size={17} /> {!isMobile && 'Nueva reserva'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {(() => { const s = new Date(date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1) })()}
          </span>
          <div style={{ marginLeft: 'auto', maxWidth: 280, flex: 1 }}>
            <SegmentedControl options={[{ id: 'day', label: 'Día' }, { id: 'week', label: 'Semana' }, { id: 'all', label: 'Todas' }, { id: 'floor', label: 'Piso' }]} value={view} onChange={id => setView(id as 'day' | 'week' | 'all' | 'floor')} />
          </div>
        </div>

        {view === 'day' && (() => {
          // Barra de excepciones: lo que requiere acción, no lo que va bien.
          // Cada chip filtra la lista; los totales del día van en discreto.
          const unconf = reservations.filter(r => r.status === 'requested').length
          const noTable = opsCfg.hasTables
            ? reservations.filter(r => ['requested', 'confirmed'].includes(r.status) && !r.table_id && !r.combo_id && (r.zone ?? '') !== 'Barra').length
            : 0
          const deposit = reservations.filter(r => ['requested', 'confirmed', 'seated'].includes(r.status) && (r.notes ?? '').toLowerCase().includes('depósito requerido')).length
          const proposals = reservations.filter(r => !!r.proposed_time && ['requested', 'confirmed'].includes(r.status)).length
          const noGuarantee = reservations.filter(r => ['requested', 'confirmed'].includes(r.status) && (r.notes ?? '').includes('SIN GARANTÍA')).length
          const chips = [
            { id: 'unconfirmed' as const, n: unconf, label: unconf === 1 ? 'sin confirmar' : 'sin confirmar' },
            { id: 'no_table' as const, n: noTable, label: 'sin mesa' },
            { id: 'no_guarantee' as const, n: noGuarantee, label: 'sin garantía' },
            { id: 'deposit' as const, n: deposit, label: deposit === 1 ? 'depósito pendiente' : 'depósitos pendientes' },
            { id: 'proposal' as const, n: proposals, label: 'horario por confirmar' },
          ].filter(c => c.n > 0)
          const totales = `${kpis.total} reservas · ${kpis.pax} pax`
          return (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', paddingBottom: 2 }}>
              {chips.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ color: 'var(--status-healthy)', fontWeight: 700 }}>Todo en orden</span> · {totales}
                </span>
              ) : (
                chips.map(c => {
                  const on = exFilter === c.id
                  return (
                    <button key={c.id} onClick={() => setExFilter(on ? 'all' : c.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, background: on ? 'var(--status-attention)' : 'color-mix(in srgb, var(--status-attention) 12%, transparent)', border: `1px solid color-mix(in srgb, var(--status-attention) ${on ? '100' : '40'}%, transparent)`, color: on ? '#000' : 'var(--status-attention)' }}>
                      <span className="num" style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>{c.n}</span> {c.label}
                    </button>
                  )
                })
              )}
              {date === today && (
                <button onClick={() => setView('floor')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                  <Footprints size={13} /> Walk-in
                </button>
              )}
              {date === today && (
                <button onClick={() => setWaitOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, background: waitCount ? 'var(--accent-bg)' : 'var(--bg-elevated)', border: `1px solid ${waitCount ? 'var(--accent)' : 'var(--border-default)'}`, color: waitCount ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  ⏳ Espera{waitCount ? ` (${waitCount})` : ''}
                </button>
              )}
              {chips.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0, paddingLeft: 8 }}>{totales}</span>
              )}
            </div>
          )
        })()}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {view === 'floor' ? (
          /* ── Piso: plano operativo en vivo (siempre HOY) ── */
          buId ? <FloorLive buId={buId} canWrite={canWrite} userId={userId} /> : null
        ) : loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse-green" style={{ height: 76, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />)}
          </div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No pudimos cargar las reservas. Revisa tu conexión.</p>
            <button onClick={() => { setLoading(true); load() }} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}>Reintentar</button>
          </div>
        ) : view === 'all' ? (
          /* ── Todas: lista buscable del venue (últimos 30 días en adelante) ── */
          (() => {
            const q = allSearch.trim().toLowerCase()
            const rows = allRows.filter(r => {
              if (!q) return true
              const g = guestMap[r.guest_id]
              return (g?.full_name ?? '').toLowerCase().includes(q) || (g?.phone ?? '').includes(q) || r.date.includes(q)
            })
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={allSearch} onChange={e => setAllSearch(e.target.value)}
                  placeholder="Buscar por nombre, teléfono o fecha…"
                  style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box', minHeight: 42 }} />
                {rows.length === 0 ? (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>
                    {allRows.length === 0 ? 'Sin reservas en este venue.' : 'Sin resultados.'}
                  </p>
                ) : rows.map(r => {
                  const g = guestMap[r.guest_id]
                  const meta = STATUS_META[r.status]
                  return (
                    <button key={r.id} onClick={() => { setDate(r.date); setView('day') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px', cursor: 'pointer', textAlign: 'left', minHeight: 56 }}>
                      <div style={{ textAlign: 'center', flexShrink: 0, width: 52 }}>
                        <div className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(r.date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </div>
                        <div className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.time_slot}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g?.full_name ?? 'Cliente'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.party_size} pax · {SOURCE_LABEL[r.source]}</div>
                      </div>
                      <StatusBadgeV2 tone={meta.tone} label={meta.label} />
                    </button>
                  )
                })}
              </div>
            )
          })()
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
        ) : (
        <>
          {/* Curva de ocupación — carga simultánea del día (pax/mesas vs capacidad) */}
          {buId && (
            <OccupancyCurve buId={buId} date={date} reservations={reservations} capacity={capacity ?? null} guestMap={guestMap} />
          )}
          {dayRows.length === 0 ? (
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
          /* ── Día operativo (HoH): agrupado por momento con acción contextual ── */
          (() => {
            const isToday = date === today
            const now = new Date(nowTick)
            const nowMin = now.getHours() * 60 + now.getMinutes()
            const startMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
            const toLbl = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
            const durOf = (r: Reservation) => r.duration_min
              ?? ([...opsCfg.durations].sort((a, b) => a.max_pax - b.max_pax).find(d => d.max_pax >= r.party_size)?.minutes ?? 120)
            const matchEx = (r: Reservation) => {
              if (exFilter === 'unconfirmed') return r.status === 'requested'
              if (exFilter === 'no_table') return ['requested', 'confirmed'].includes(r.status) && !r.table_id && !r.combo_id && (r.zone ?? '') !== 'Barra'
              if (exFilter === 'deposit') return (r.notes ?? '').toLowerCase().includes('depósito requerido')
              if (exFilter === 'proposal') return !!r.proposed_time
              if (exFilter === 'no_guarantee') return (r.notes ?? '').includes('SIN GARANTÍA')
              return true
            }
            type Ctx = 'now' | 'soon' | 'later' | 'done'
            const ctxOf = (r: Reservation): Ctx => {
              if (['completed', 'no_show', 'cancelled'].includes(r.status)) return 'done'
              if (!isToday) return r.status === 'requested' ? 'soon' : 'later'
              if (r.status === 'seated') return 'now'
              const s = startMin(r.time_slot)
              if (s <= nowMin + 20) return 'now'
              if (s <= nowMin + 120) return 'soon'
              return 'later'
            }
            const rows = dayRows.filter(matchEx)
            let groups = ([
              { key: 'now', label: 'Ahora' }, { key: 'soon', label: 'Próximas' },
              { key: 'later', label: 'Más tarde' }, { key: 'done', label: 'Cerradas' },
            ] as { key: Ctx; label: string }[])
              .map(gr => ({ ...gr, rows: rows.filter(r => ctxOf(r) === gr.key) }))
              .filter(gr => gr.rows.length > 0)
            // Un solo grupo "Más tarde" (mañana temprano) o día futuro: el
            // encabezado por momento no aporta — se etiqueta como el día
            if (!isToday) {
              groups = rows.length ? [{ key: 'later' as Ctx, label: '', rows }] : []
            } else if (groups.length === 1 && groups[0].key === 'later') {
              groups = [{ ...groups[0], label: 'Hoy' }]
            }

            const chipStyle = (tone: 'amber' | 'red' | 'gold' | 'neutral'): React.CSSProperties => {
              const c = tone === 'amber' ? 'var(--status-attention)' : tone === 'red' ? 'var(--status-risk)' : tone === 'gold' ? 'var(--accent)' : 'var(--text-tertiary)'
              return { fontSize: 10, fontWeight: 700, color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }
            }

            const renderRow = (r: Reservation, ctx: Ctx) => {
              const g = guestMap[r.guest_id]
              const meta = STATUS_META[r.status]
              const SrcIcon = SOURCE_ICON[r.source]
              const s = startMin(r.time_slot)
              const notes = r.notes ?? ''
              const pending = ['requested', 'confirmed'].includes(r.status)
              const overdue = isToday && pending ? nowMin - s : 0
              const holdLeft = opsCfg.holdMin - overdue
              const sinMesa = opsCfg.hasTables && pending && !r.table_id && !r.combo_id && (r.zone ?? '') !== 'Barra'
              const gname = g?.full_name ?? 'Cliente'
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '8px 12px', flexShrink: 0, minHeight: 56, opacity: ctx === 'done' ? 0.55 : 1 }}>
                  <span className="num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', width: 44, flexShrink: 0, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{r.time_slot}</span>
                  <button onClick={() => { setMenuRes(r); setCancelReason('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flex: 1, minWidth: 0, textAlign: 'left', minHeight: 44 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{gname}</span>
                      <span className="num" style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 700 }}>{r.party_size}p</span>
                      {(noShowMap[r.guest_id] ?? 0) >= 2 && (
                        <span title={`${noShowMap[r.guest_id]} no-shows previos`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--status-attention)', fontFamily: 'var(--font-mono)' }}>
                          <AlertTriangle size={11} /> {noShowMap[r.guest_id]}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      {sinMesa ? <span style={chipStyle('amber')}>Sin mesa</span>
                        : r.zone ? <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.zone}</span> : null}
                      {r.status === 'seated' && <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>sale ~{toLbl(s + durOf(r))}</span>}
                      {isToday && pending && overdue > 0 && holdLeft > 0 && (
                        <span style={chipStyle('amber')}>No-show en {holdLeft} min</span>
                      )}
                      {r.proposed_time && <span style={chipStyle('amber')}>→ {r.proposed_time} por confirmar</span>}
                      {notes.includes('SIN GARANTÍA')
                        ? <span style={chipStyle('red')}>Sin garantía</span>
                        : notes.toLowerCase().includes('depósito requerido') && <span style={chipStyle('amber')}>Depósito pendiente</span>}
                      {(g?.tags ?? []).some(t => t.toLowerCase() === 'vip') && <span style={chipStyle('gold')}>VIP</span>}
                      {(g?.tags ?? []).some(t => t.toLowerCase() === 'socio') && <span style={chipStyle('gold')}>Socio</span>}
                      {/\bPR\b/.test(notes) && <span style={chipStyle('neutral')}>PR</span>}
                      {/alerg/i.test(notes) && <span style={chipStyle('red')}>Alergia</span>}
                      <SrcIcon size={12} style={{ color: 'var(--text-tertiary)' }} aria-label={SOURCE_LABEL[r.source]} />
                      {ctx !== 'now' && notes && !notes.toLowerCase().includes('depósito requerido') && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{notes}</span>
                      )}
                    </div>
                  </button>
                  {(ctx === 'later' || ctx === 'done') && <StatusBadgeV2 tone={meta.tone} label={meta.label} />}
                  {/* Acción contextual: la correcta en el momento correcto */}
                  {canWrite && ctx === 'now' && pending && (
                    isToday && overdue > opsCfg.holdMin ? (
                      <>
                        <button onClick={() => { if (window.confirm(`¿Marcar no-show a ${gname} (${r.party_size} pax, ${r.time_slot})?`)) setStatus(r, 'no_show') }}
                          style={{ minHeight: 44, padding: '0 12px', borderRadius: 999, border: 'none', background: 'color-mix(in srgb, var(--status-risk) 18%, transparent)', color: 'var(--status-risk)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          No-show
                        </button>
                        <button onClick={async () => {
                          const nt = toLbl(s + 10)
                          const { error } = await supabase.from('reservations').update({ time_slot: nt }).eq('id', r.id)
                          if (error) { showToast(`No se pudo: ${error.message}`, 'error'); return }
                          logActivity('reservation_updated', 'reservation', r.id, { guest: gname, antes: r.time_slot, ahora: nt, via: 'gracia_10min' })
                          load()
                        }}
                          style={{ minHeight: 44, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          +10 min
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { if (window.confirm(`¿Sentar a ${gname}, ${r.party_size} pax?`)) setStatus(r, 'seated') }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--status-healthy)', color: '#04210f', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 0 0 2px color-mix(in srgb, var(--status-healthy) 30%, transparent)' }}>
                        <Armchair size={15} /> Sentar
                      </button>
                    )
                  )}
                  {canWrite && ctx === 'now' && r.status === 'seated' && (
                    <button onClick={() => setStatus(r, 'completed')}
                      style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Completar
                    </button>
                  )}
                  {canWrite && ctx === 'soon' && (
                    r.status === 'requested' ? (
                      <button onClick={() => setStatus(r, 'confirmed')}
                        style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Confirmar
                      </button>
                    ) : g?.phone ? (
                      <a href={`tel:${g.phone}`} title={`Llamar a ${gname}`}
                        style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <Phone size={16} />
                      </a>
                    ) : null
                  )}
                  {canWrite && (
                    <button onClick={() => { setMenuRes(r); setCancelReason('') }} aria-label="Editar / más acciones"
                      style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MoreHorizontal size={16} />
                    </button>
                  )}
                </div>
              )
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {exFilter !== 'all' && (
                  <button onClick={() => setExFilter('all')}
                    style={{ alignSelf: 'flex-start', minHeight: 36, padding: '0 12px', borderRadius: 999, border: '1px solid var(--status-attention)', background: 'color-mix(in srgb, var(--status-attention) 12%, transparent)', color: 'var(--status-attention)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Filtro activo · mostrar todas ×
                  </button>
                )}
                {groups.map(gr => (
                  <div key={gr.key}>
                    {gr.label && (
                      <div style={{ position: 'sticky', top: -12, zIndex: 2, background: 'var(--bg-base)', padding: '8px 0 6px', fontSize: 11, fontWeight: 800, color: gr.key === 'now' ? 'var(--text-primary)' : 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
                        {gr.label} · {gr.rows.length}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {gr.rows.map(r => renderRow(r, isToday ? gr.key : ctxOf(r)))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()
          )}
        </>
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
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>
              {menuRes.party_size} pax · {SOURCE_LABEL[menuRes.source]} · Reservó: {bookedBy(menuRes)}
              {menuRes.notes ? ` · ${menuRes.notes}` : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* ORDEN PARA EL EQUIPO EN PISO: lo urgente y lo accionable
                  primero (alerta de cambio de hora → siguiente paso → datos
                  de la reserva editables), el cliente después, y la línea de
                  tiempo al final — es consulta, no gestión. */}
              {menuRes.proposed_time && (
                <div style={{ background: 'color-mix(in srgb, var(--status-attention) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--status-attention) 30%, transparent)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <p style={{ fontSize: 12, color: 'var(--status-attention)', fontWeight: 700, margin: '0 0 8px' }}>
                    Propuesta de cambio: {menuRes.time_slot} → {menuRes.proposed_time} (esperando al cliente)
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={async () => {
                      const { error } = await supabase.from('reservations').update({ time_slot: menuRes.proposed_time, proposed_time: null }).eq('id', menuRes.id)
                      if (error) { showToast(`No se pudo aplicar: ${error.message}`, 'error'); return }
                      logActivity('reservation_updated', 'reservation', menuRes.id, { antes: menuRes.time_slot, ahora: menuRes.proposed_time, via: 'propuesta_aceptada' })
                      showToast(`Reserva movida a las ${menuRes.proposed_time}.`, 'success')
                      setMenuRes(null); load()
                    }}
                      style={{ flex: 1, minHeight: 44, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Cliente aceptó → mover
                    </button>
                    <button onClick={async () => {
                      const { error } = await supabase.from('reservations').update({ proposed_time: null }).eq('id', menuRes.id)
                      if (error) { showToast(`No se pudo: ${error.message}`, 'error'); return }
                      logActivity('reservation_updated', 'reservation', menuRes.id, { mantiene: menuRes.time_slot, via: 'propuesta_rechazada' })
                      showToast(`Se mantiene a las ${menuRes.time_slot} — resuelve el conflicto en la curva.`, 'success')
                      setMenuRes(null); load()
                    }}
                      style={{ flex: 1, minHeight: 44, borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      No aceptó → mantener
                    </button>
                  </div>
                </div>
              )}

              {/* UNA acción primaria según el momento de la reserva — sin
                  scroll: es lo primero que toca el equipo en piso */}
              {menuRes.status === 'requested' && (
                <button onClick={() => confirmWhatsApp(menuRes)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, padding: '0 14px', borderRadius: 999, border: 'none', background: '#1fa855', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                  <MessageCircle size={17} /> Confirmar y enviar WhatsApp
                </button>
              )}
              {menuRes.status === 'confirmed' && (
                <button onClick={() => { if (window.confirm(`¿Sentar a ${guestMap[menuRes.guest_id]?.full_name ?? 'cliente'}, ${menuRes.party_size} pax?`)) setStatus(menuRes, 'seated') }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--status-healthy)', color: '#04210f', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                  <Armchair size={17} /> Sentar
                </button>
              )}
              {menuRes.status === 'confirmed' && !menuRes.confirm_sent_at && (
                /* Confirmada pero sin mensaje enviado: el hueco se ve en la
                   línea de tiempo y este botón discreto lo cierra */
                <button onClick={() => confirmWhatsApp(menuRes)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, padding: '0 14px', borderRadius: 999, border: '1px solid #1fa855', background: 'none', color: '#1fa855', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <MessageCircle size={15} /> Enviar confirmación por WhatsApp
                </button>
              )}
              {menuRes.status === 'seated' && (
                <button onClick={() => setStatus(menuRes, 'completed')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--status-healthy)', color: '#04210f', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                  <Check size={17} /> Completar visita — terminó su estancia
                </button>
              )}

              {/* Edición completa — cualquier rol con escritura (HoH incluido) */}
              {canWrite && editForm && (
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Reserva</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.8fr', gap: 8, marginBottom: 8 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Fecha
                      <input type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} className="num"
                        style={{ width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginTop: 3 }} /></label>
                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Hora
                      <input type="time" value={editForm.time} onChange={e => setEditForm({ ...editForm, time: e.target.value })} className="num"
                        style={{ width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginTop: 3, fontFamily: 'var(--font-mono)' }} /></label>
                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Pax
                      <input type="number" inputMode="numeric" min={1} value={editForm.pax} onChange={e => setEditForm({ ...editForm, pax: Math.max(1, Number(e.target.value)) })} className="num"
                        style={{ width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginTop: 3, textAlign: 'center' }} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Zona
                      <select value={editForm.zone} onChange={e => setEditForm({ ...editForm, zone: e.target.value })}
                        style={{ width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginTop: 3, cursor: 'pointer' }}>
                        <option value="">Sin zona</option>
                        {[...new Set([...ZONES, ...(editForm.zone ? [editForm.zone] : [])])].map(z => <option key={z} value={z}>{z}</option>)}
                      </select></label>
                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Notas
                      <input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Alergias, ocasión, mesa pedida…"
                        style={{ width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginTop: 3 }} /></label>
                  </div>
                  <button onClick={saveResEdit}
                    style={{ width: '100%', minHeight: 50, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Guardar cambios (reserva y cliente)
                  </button>
                </div>
              )}

              {/* Cliente — datos editables en la misma ventana */}
              {canWrite && guestEdit && (
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', flex: 1 }}>Cliente</label>
                    {(noShowMap[menuRes.guest_id] ?? 0) > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--status-attention)', fontFamily: 'var(--font-mono)' }}>{noShowMap[menuRes.guest_id]} no-show{noShowMap[menuRes.guest_id] > 1 ? 's' : ''} previos</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8, marginBottom: 8 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Nombre
                      <input value={guestEdit.name} onChange={e => setGuestEdit({ ...guestEdit, name: e.target.value })}
                        style={{ width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginTop: 3 }} /></label>
                    <label style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Teléfono
                      <input value={guestEdit.phone} onChange={e => setGuestEdit({ ...guestEdit, phone: e.target.value })} inputMode="tel" className="num"
                        style={{ width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginTop: 3, fontFamily: 'var(--font-mono)' }} /></label>
                  </div>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>Notas del cliente — se recuerdan en cada visita
                    <textarea value={guestEdit.notes} onChange={e => setGuestEdit({ ...guestEdit, notes: e.target.value })} rows={2}
                      placeholder="Mesa favorita, alergias, cómo le gusta su bebida, aniversario…"
                      style={{ width: '100%', minHeight: 52, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginTop: 3, resize: 'vertical' }} /></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {(['VIP', 'Socio'] as const).map(tag => {
                      const on = (guestMap[menuRes.guest_id]?.tags ?? []).includes(tag)
                      return (
                        <button key={tag} onClick={() => toggleGuestTag(tag)}
                          style={{ minHeight: 38, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: on ? 'var(--accent)' : 'transparent', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, color: on ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
                          {on ? '★ ' : ''}{tag}
                        </button>
                      )
                    })}
                    {(guestMap[menuRes.guest_id]?.tags ?? []).filter(t => !['VIP', 'Socio'].includes(t)).map(t => (
                      <span key={t} style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 6px' }}>{t}</span>
                    ))}
                    <button onClick={() => { const gid = menuRes.guest_id; setMenuRes(null); setOpenGuestId(gid) }}
                      style={{ marginLeft: 'auto', minHeight: 36, padding: '0 10px', borderRadius: 999, border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      Perfil completo →
                    </button>
                  </div>
                </div>
              )}

              {menuRes.party_size >= eventPaxThreshold && !['completed', 'no_show', 'cancelled'].includes(menuRes.status) && (
                <button onClick={() => convertToDeal(menuRes)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, padding: '0 14px', borderRadius: 999, border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <Handshake size={15} /> Convertir en deal (Evento) · {menuRes.party_size} pax
                </button>
              )}
              {['completed', 'no_show', 'cancelled'].includes(menuRes.status) ? (
                /* Reserva cerrada por error → se puede reactivar */
                <button onClick={() => { if (window.confirm(`¿Reactivar la reserva de ${guestMap[menuRes.guest_id]?.full_name ?? 'cliente'} como confirmada?`)) setStatus(menuRes, 'confirmed') }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  <Check size={16} /> Reactivar como confirmada
                </button>
              ) : (
                <>
                  {/* Los caminos malos, juntos y en voz baja: son la excepción */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { if (window.confirm(`¿Marcar no-show a ${guestMap[menuRes.guest_id]?.full_name ?? 'cliente'} (${menuRes.party_size} pax)?`)) setStatus(menuRes, 'no_show') }}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, padding: '0 10px', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--status-risk) 30%, transparent)', background: 'none', color: 'var(--status-risk)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                      <AlertTriangle size={14} /> No-show
                    </button>
                    <button onClick={() => setCancelOpen(o => !o)}
                      style={{ flex: 1, minHeight: 44, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-default)', background: cancelOpen ? 'var(--bg-elevated)' : 'none', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                      Cancelar reserva…
                    </button>
                  </div>
                  {cancelOpen && (
                    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                      <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Motivo (opcional)…" autoFocus
                        style={{ width: '100%', minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                      <button onClick={() => setStatus(menuRes, 'cancelled', cancelReason)}
                        style={{ width: '100%', minHeight: 46, borderRadius: 999, border: '1px solid color-mix(in srgb, var(--status-risk) 35%, transparent)', background: 'color-mix(in srgb, var(--status-risk) 10%, transparent)', color: 'var(--status-risk)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        Confirmar cancelación
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* La historia completa de la reserva — al final: es consulta,
                  no gestión. Lo operativo ya quedó arriba. */}
              <ResTimeline res={menuRes} bookedByName={bookedBy(menuRes)} />
            </div>
          </div>
        )}
      </Sheet>

      {capOpen && buId && (
        <CapacityEditor buId={buId} buCode={buMap[buId] ?? ''} onClose={() => setCapOpen(false)} onSaved={load} />
      )}

      {floorOpen && buId && (
        <FloorEditor buId={buId} buCode={buMap[buId] ?? ''} onClose={() => setFloorOpen(false)} />
      )}

      {shareOpen && buId && (
        <ShareBookingSheet buId={buId} code={buMap[buId] ?? ''}
          venueName={allowedBuList.find(b => b.id === buId)?.name ?? ''}
          isMobile={isMobile} onClose={() => setShareOpen(false)} />
      )}

      {searchOpen && (
        <ReservationSearchSheet
          buList={allowedBuList}
          isMobile={isMobile}
          onClose={() => setSearchOpen(false)}
          onPick={r => { setSearchOpen(false); setBuId(r.bu_id); setDate(r.date); setView('day') }}
        />
      )}

      {waitOpen && buId && (
        <WaitlistSheet buId={buId} buCode={buMap[buId] ?? ''} today={today} userId={userId}
          isMobile={isMobile}
          onClose={() => { setWaitOpen(false); loadWaitCount() }}
          onConverted={() => { load(); loadWaitCount() }} />
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
  // Detector de horario: aforo SIMULTÁNEO a la hora elegida (no acumulado del
  // día — la gente rota). max_pax del día = aforo del venue en un momento dado.
  const [dayCap, setDayCap] = useState<{ maxPax: number | null; open: string | null; close: string | null }>({ maxPax: null, open: null, close: null })
  const [dayRes, setDayRes] = useState<{ time_slot: string; party_size: number; status: string; duration_min: number | null }[]>([])
  const [venueDurations, setVenueDurations] = useState<{ max_pax: number; minutes: number }[]>([])
  const [overrideCap, setOverrideCap] = useState(false)
  const [time, setTime] = useState('21:00')
  const [pax, setPax] = useState(2)
  const [zone, setZone] = useState('')
  const [source, setSource] = useState<ResSource>('phone')
  const [notes, setNotes] = useState('')
  const [confirmNow, setConfirmNow] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Motor por mesas (Fase 3): slots del motor + mesa auto-asignada al guardar
  const [tableEngine, setTableEngine] = useState(false)
  const [slots, setSlots] = useState<{ slot: string; libres: number }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  // Cuando el motor no regresa horarios, diagnostica POR QUÉ (horario del día
  // sin configurar vs mesas sin rango para el grupo vs ocupación real)
  const [slotsHint, setSlotsHint] = useState<string | null>(null)
  const [manualTime, setManualTime] = useState(false)

  useEffect(() => {
    supabase.from('venue_reservation_settings').select('engine, durations').eq('bu_id', venue).maybeSingle()
      .then(({ data }) => {
        setTableEngine(data?.engine === 'tables')
        setVenueDurations((data?.durations ?? []) as { max_pax: number; minutes: number }[])
      })
  }, [venue])

  useEffect(() => {
    if (!tableEngine || !date || !(pax > 0)) { setSlots([]); setSlotsHint(null); return }
    setSlotsLoading(true)
    supabase.rpc('fn_available_slots', { p_bu: venue, p_date: date, p_pax: pax, p_online: false })
      .then(async ({ data }) => {
        const rows = (data ?? []) as { slot: string; libres: number }[]
        setSlots(rows)
        // Si la hora elegida ya no está disponible, brinca a la primera libre
        if (!manualTime && rows.length && !rows.some(s => s.slot === time)) setTime(rows[0].slot)
        if (rows.length === 0) {
          // Diagnóstico: ¿falta horario del día, faltan mesas para el grupo, o es ocupación?
          const dow = new Date(date + 'T00:00:00').getDay()
          const [{ data: cap }, { count: fit }] = await Promise.all([
            supabase.from('venue_capacity').select('open_time, close_time').eq('bu_id', venue).eq('day_of_week', dow).eq('active', true).maybeSingle(),
            supabase.from('venue_tables').select('id', { count: 'exact', head: true }).eq('bu_id', venue).eq('active', true).lte('min_pax', pax).gte('max_pax', pax),
          ])
          setSlotsHint(!cap?.open_time || !cap?.close_time
            ? 'Causa: este día de la semana no tiene horario de apertura/cierre en Capacidad y horario — el motor necesita ese rango para ofrecer slots.'
            : (fit ?? 0) === 0
              ? `Causa: ninguna mesa activa acepta ${pax} pax (revisa mín/máx por mesa en el editor de Piso, o crea una combinación).`
              : 'Las mesas para ese tamaño ya están ocupadas todo el día — usa sobrecupo o mueve la fecha.')
        } else setSlotsHint(null)
        setSlotsLoading(false)
      })
  }, [tableEngine, venue, date, pax]) // eslint-disable-line react-hooks/exhaustive-deps

  // La autorización de sobrecupo no sobrevive a un cambio de fecha/venue/pax/hora
  useEffect(() => { setOverrideCap(false) }, [date, venue, pax, time])

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

  // Cupo de la noche para venue+fecha (capacidad total, sin horarios fijos)
  useEffect(() => {
    async function loadDayCap() {
      const dow = new Date(date + 'T00:00:00').getDay()
      const [{ data: cap }, { data: res }] = await Promise.all([
        supabase.from('venue_capacity').select('max_pax, open_time, close_time').eq('bu_id', venue).eq('day_of_week', dow).eq('active', true).maybeSingle(),
        supabase.from('reservations').select('time_slot, party_size, status, duration_min').eq('bu_id', venue).eq('date', date),
      ])
      setDayCap({ maxPax: cap?.max_pax ?? null, open: cap?.open_time ?? null, close: cap?.close_time ?? null })
      setDayRes((res ?? []) as typeof dayRes)
    }
    loadDayCap()
  }, [venue, date]) // eslint-disable-line react-hooks/exhaustive-deps

  // Detector de horario: pax SIMULTÁNEOS en [hora, hora + duración) usando las
  // duraciones configuradas — la ocupación rota, no se acumula toda la noche.
  const capToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  const durFor = useCallback((p: number) => {
    const hit = [...venueDurations].sort((a, b) => a.max_pax - b.max_pax).find(d => d.max_pax >= p)
    return hit?.minutes ?? 120
  }, [venueDurations])
  const simulAt = useCallback((tMin: number, forPax: number) => {
    const openM = dayCap.open ? capToMin(dayCap.open) : 0
    const norm = (t: string) => { let v = capToMin(t); if (dayCap.open && v < openM) v += 1440; return v }
    const t1 = tMin + durFor(forPax)
    let s = 0
    for (const r of dayRes) {
      if (!['requested', 'confirmed', 'seated'].includes(r.status)) continue
      const s0 = norm(r.time_slot), s1 = s0 + (r.duration_min ?? durFor(r.party_size))
      if (s0 < t1 && s1 > tMin) s += r.party_size
    }
    return s
  }, [dayRes, dayCap.open, durFor])
  const timeMin = useMemo(() => {
    if (!time) return null
    const openM = dayCap.open ? capToMin(dayCap.open) : 0
    let v = capToMin(time); if (dayCap.open && v < openM) v += 1440
    return v
  }, [time, dayCap.open])
  const simul = timeMin != null ? simulAt(timeMin, pax) : 0
  const overCap = dayCap.maxPax !== null && timeMin != null && simul + pax > dayCap.maxPax
  // Horarios cercanos donde SÍ cabe (3 sugerencias alrededor de la hora pedida)
  const sugerencias = useMemo(() => {
    if (!overCap || dayCap.maxPax == null || timeMin == null) return []
    const openM = dayCap.open ? capToMin(dayCap.open) : 12 * 60
    let closeM = dayCap.close ? capToMin(dayCap.close) : 23 * 60 + 30
    if (closeM <= openM) closeM += 1440
    const cands: number[] = []
    for (let m = openM; m <= closeM - durFor(pax); m += 30) {
      if (simulAt(m, pax) + pax <= dayCap.maxPax) cands.push(m)
    }
    return cands.sort((a, b) => Math.abs(a - timeMin) - Math.abs(b - timeMin)).slice(0, 3).sort((a, b) => a - b)
      .map(m => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }, [overCap, dayCap, timeMin, pax, simulAt, durFor])

  const blockedByCapacity = overCap && !(canOverride && overrideCap)
  const valid = !!guest && !!venue && !!date && !!time && pax > 0 && !blockedByCapacity

  async function save() {
    if (!valid || !guest) return
    setSaving(true); setError(null)
    const status = confirmNow ? 'confirmed' : 'requested'
    const overbooking = overCap && canOverride && overrideCap

    // Motor por mesas: pedirle al motor la mejor mesa/combinación para el slot.
    // Sin mesa disponible solo se crea con autorización de sobrecupo (Ops+).
    type Assigned = { table_id: string | null; combo_id: string | null; zone_id: string | null; nombre: string | null }
    let assigned: Assigned | null = null
    if (tableEngine) {
      const { data: asg } = await supabase.rpc('fn_assign_table', { p_bu: venue, p_date: date, p_slot: time, p_pax: pax, p_online: false })
      assigned = (asg as Assigned[] | null)?.[0] ?? null
      if (!assigned && !(canOverride && overrideCap)) {
        setSaving(false)
        setError('Ese horario ya no tiene mesa para este grupo. Elige otro horario, o autoriza sobrecupo (Ops/Master).')
        return
      }
    }

    const { data, error: err } = await supabase.from('reservations').insert({
      guest_id: guest.id, bu_id: venue, date, time_slot: time, party_size: pax,
      zone: zone.trim() || null, status, source, notes: notes.trim() || null,
      zone_id: assigned?.zone_id ?? null, table_id: assigned?.table_id ?? null, combo_id: assigned?.combo_id ?? null,
      created_by: userId ?? null, status_changed_by: userId ?? null,
      confirmed_at: confirmNow ? new Date().toISOString() : null,
      overbooked_by: overbooking || (tableEngine && !assigned) ? (userId ?? null) : null,
    }).select('id').single()
    setSaving(false)
    if (err) { setError(`No se pudo crear: ${err.message}`); return }
    const buCode = buList.find(b => b.id === venue)?.code
    logActivity('reservation_created', 'reservation', data.id, { guest: guest.full_name, bu: buCode, date, time, pax, mesa: assigned?.nombre ?? undefined })
    notifySlack(reservationCreatedMessage(guest.full_name, buCode ?? '', date, time, pax))
    if (overbooking) logActivity('reservation_overbooked', 'reservation', data.id, { guest: guest.full_name, bu: buCode, time, pax })
    showToast(assigned ? `Reserva creada · ${assigned.nombre}.` : overbooking || (tableEngine && !assigned) ? 'Reserva creada con sobrecupo autorizado.' : 'Reserva creada.', 'success')
    // Confirmación automática al cliente por WhatsApp (el servidor decide la
    // vía: chat del concierge o plantilla; nunca duplica). Fire-and-forget.
    if (confirmNow) {
      supabase.functions.invoke('reservation-notify', { body: { reservationId: data.id } }).then(({ data: n, error: nErr }) => {
        if (nErr) showToast('No se pudo contactar al servicio de confirmación. Revisa que la función reservation-notify esté desplegada en Supabase.', 'error')
        else if (n?.ok) showToast(n.method === 'chat' ? 'Confirmación enviada por el chat del concierge ✅' : 'Confirmación enviada por WhatsApp ✅', 'success')
        else if (n?.error) showToast(`No se envió la confirmación: ${n.error}`, 'error')
      })
    }
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
                  {/* Teclado NORMAL (no tel): se busca por nombre o teléfono */}
                  <input value={gQuery} onChange={e => setGQuery(e.target.value)} autoFocus placeholder="Nombre o teléfono del cliente…" style={{ ...inputStyle, paddingLeft: 34 }} />
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

          {/* 3. Hora de llegada — motor por mesas: slots; si no: hora libre */}
          <div>
            <label style={lbl}>Hora de llegada *</label>
            {tableEngine && !manualTime ? (
              slotsLoading ? (
                <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>Buscando horarios…</p>
              ) : slots.length === 0 ? (
                <div>
                  <p style={{ color: 'var(--status-attention)', fontSize: 13, margin: 0 }}>Sin horarios disponibles para {pax} pax ese día.</p>
                  {slotsHint && <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: '6px 0 0', lineHeight: 1.5 }}>💡 {slotsHint}</p>}
                  {canOverride && (
                    <button onClick={() => setManualTime(true)} style={{ marginTop: 6, minHeight: 36, padding: '0 12px', borderRadius: 999, border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer' }}>
                      Capturar hora manual (sobrecupo)
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {slots.map(s => (
                    <button key={s.slot} onClick={() => setTime(s.slot)}
                      style={{ minHeight: 40, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', background: time === s.slot ? 'var(--accent)' : 'var(--bg-elevated)', border: `1px solid ${time === s.slot ? 'var(--accent)' : 'var(--border-default)'}`, color: time === s.slot ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
                      {s.slot}
                    </button>
                  ))}
                </div>
              )
            ) : (
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="num" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
            )}
            {tableEngine && manualTime && (
              <button onClick={() => setManualTime(false)} style={{ marginTop: 6, minHeight: 32, padding: '0 10px', borderRadius: 999, border: 'none', background: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer' }}>
                ← Volver a horarios del motor
              </button>
            )}
            {tableEngine && !manualTime && slots.length > 0 && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '6px 0 0' }}>La mesa se asigna sola al crear (mejor zona y capacidad).</p>
            )}
            {dayCap.maxPax !== null && timeMin != null && (
              <p style={{ color: overCap ? 'var(--status-attention)' : 'var(--text-tertiary)', fontSize: 11, margin: '6px 0 0' }}>
                A esa hora: {simul + pax}/{dayCap.maxPax} pax simultáneos (con esta reserva)
              </p>
            )}
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
            {tableEngine ? (
              <div>
                <label style={lbl}>Mesa</label>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, paddingTop: 12 }}>Auto-asignada por el motor</p>
              </div>
            ) : (
              <div>
                <label style={lbl}>Zona</label>
                <select value={zone} onChange={e => setZone(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Sin zona</option>
                  {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
            )}
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

          {overCap && (
            <div style={{ background: 'color-mix(in srgb, var(--status-attention) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-attention) 35%, transparent)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--status-attention)', fontSize: 13, fontWeight: 700, margin: 0 }}>
                <AlertTriangle size={14} /> A las {time} no cabe — {simul + pax}/{dayCap.maxPax} pax simultáneos con esta reserva
              </p>
              {sugerencias.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sí hay lugar a las:</span>
                  {sugerencias.map(s => (
                    <button key={s} onClick={() => setTime(s)}
                      style={{ minHeight: 38, padding: '0 12px', borderRadius: 999, border: '1px solid var(--status-healthy)', background: 'color-mix(in srgb, var(--status-healthy) 12%, transparent)', color: 'var(--status-healthy)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {canOverride ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', minHeight: 36 }}>
                  <input type="checkbox" checked={overrideCap} onChange={e => setOverrideCap(e.target.checked)} style={{ accentColor: 'var(--status-attention)', width: 18, height: 18 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Autorizar sobrecupo — queda registrado a tu nombre en Actividad.</span>
                </label>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0' }}>Solo un Ops Manager o Master puede autorizar sobrecupo.</p>
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

// ─────────────────────────────────────────────────────────────────────────────
// Compartir el link público de reservas de un venue. Master/Ops activa el link
// y lo copia; el cliente reserva en ?reservar=<CÓDIGO> respetando las reglas
// del venue (cupo, apartado) vía el Edge Function public-reservation.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Lista de espera (Fase 4): walk-ins sin lugar. El host los anota en segundos
// y cuando se libera espacio los convierte en reserva (con teléfono) o los
// manda al Piso como walk-in. Los que se cansaron se marcan y salen.
// ─────────────────────────────────────────────────────────────────────────────
function WaitlistSheet({ buId, buCode, today, userId, isMobile, onClose, onConverted }: {
  buId: string
  buCode: string
  today: string
  userId?: string
  isMobile: boolean
  onClose: () => void
  onConverted: () => void
}) {
  interface WaitRow { id: string; guest_name: string; phone: string | null; party_size: number; notes: string | null; created_at: string }
  const [rows, setRows] = useState<WaitRow[]>([])
  const [nName, setNName] = useState('')
  const [nPax, setNPax] = useState('2')
  const [nPhone, setNPhone] = useState('')
  const [nNotes, setNNotes] = useState('')

  const loadList = useCallback(async () => {
    const { data } = await supabase.from('reservation_waitlist')
      .select('id, guest_name, phone, party_size, notes, created_at')
      .eq('bu_id', buId).eq('date', today).eq('status', 'waiting').order('created_at')
    setRows((data ?? []) as WaitRow[])
  }, [buId, today])
  useEffect(() => { loadList() }, [loadList])

  async function add() {
    if (!nName.trim()) return
    const { error } = await supabase.from('reservation_waitlist').insert({
      bu_id: buId, date: today, guest_name: nName.trim(), phone: nPhone.trim() || null,
      party_size: Math.max(1, Number(nPax) || 1), notes: nNotes.trim() || null, created_by: userId ?? null,
    })
    if (error) { showToast(`No se pudo anotar: ${error.message}`, 'error'); return }
    setNName(''); setNPax('2'); setNPhone(''); setNNotes('')
    loadList()
  }

  async function setRowStatus(row: WaitRow, status: 'seated' | 'expired' | 'converted') {
    await supabase.from('reservation_waitlist').update({ status }).eq('id', row.id)
    setRows(rs => rs.filter(r => r.id !== row.id))
  }

  // Con teléfono → cliente + reserva confirmada a la media hora siguiente
  async function convert(row: WaitRow) {
    if (!row.phone) return
    const digits = row.phone.replace(/\D/g, '')
    const tel = digits.length === 10 ? `+52${digits}` : row.phone.startsWith('+') ? row.phone : `+${digits}`
    const { data: guest, error: gErr } = await supabase.from('guests')
      .upsert({ phone: tel, full_name: row.guest_name, origin_bu: buId }, { onConflict: 'phone', ignoreDuplicates: false })
      .select('id').single()
    if (gErr || !guest) { showToast(`Cliente: ${gErr?.message}`, 'error'); return }
    const now = new Date()
    const mins = now.getMinutes() < 30 ? 30 : 60
    const t = new Date(now.getTime()); t.setMinutes(mins === 60 ? 0 : 30, 0, 0); if (mins === 60) t.setHours(t.getHours() + 1)
    const slot = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    const { data: res, error } = await supabase.from('reservations').insert({
      guest_id: guest.id, bu_id: buId, date: today, time_slot: slot, party_size: row.party_size,
      notes: row.notes ? `Lista de espera · ${row.notes}` : 'Desde lista de espera',
      status: 'confirmed', source: 'walk_in', created_by: userId ?? null, confirmed_at: new Date().toISOString(),
    }).select('id').single()
    if (error || !res) { showToast(`No se pudo crear la reserva: ${error?.message}`, 'error'); return }
    await setRowStatus(row, 'converted')
    logActivity('reservation_created', 'reservation', res.id, { guest: row.guest_name, bu: buCode, date: today, time: slot, pax: row.party_size, via: 'lista_espera' })
    showToast(`${row.guest_name} convertido en reserva a las ${slot}.`, 'success')
    onConverted()
  }

  const waitMin = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000))
  const inp: React.CSSProperties = {
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none', minHeight: 42, boxSizing: 'border-box',
  }
  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={460}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Lista de espera · {buCode}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {/* Anotar en segundos: nombre + pax (tel y nota opcionales) */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input value={nName} onChange={e => setNName(e.target.value)} placeholder="Nombre *" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') add() }} style={{ ...inp, flex: 1 }} />
            <input type="number" inputMode="numeric" min={1} value={nPax} onChange={e => setNPax(e.target.value)} className="num" style={{ ...inp, width: 60, textAlign: 'center' }} aria-label="Pax" />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={nPhone} onChange={e => setNPhone(e.target.value)} inputMode="tel" placeholder="Teléfono (para convertir en reserva)" style={{ ...inp, flex: 1 }} />
            <input value={nNotes} onChange={e => setNNotes(e.target.value)} placeholder="Nota" style={{ ...inp, width: 110 }} />
            <button onClick={add} disabled={!nName.trim()}
              style={{ minHeight: 42, padding: '0 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: nName.trim() ? 'var(--accent)' : 'var(--bg-base)', color: nName.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', cursor: nName.trim() ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
              <Plus size={15} />
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>Nadie en espera ahora mismo.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(r => (
              <div key={r.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{r.guest_name}</span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{r.party_size}p</span>
                  <span className="num" style={{ fontSize: 11, color: waitMin(r.created_at) >= 30 ? 'var(--status-attention)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{waitMin(r.created_at)}′ esperando</span>
                </div>
                {(r.phone || r.notes) && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {r.phone && <span className="num">{r.phone}</span>}{r.phone && r.notes && ' · '}{r.notes}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {r.phone ? (
                    <button onClick={() => convert(r)}
                      style={{ flex: 1, minHeight: 40, borderRadius: 999, border: 'none', background: 'var(--status-healthy)', color: '#04210f', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                      🪑 Convertir en reserva
                    </button>
                  ) : (
                    <button onClick={() => setRowStatus(r, 'seated')} title="Siéntalo desde el Piso como walk-in"
                      style={{ flex: 1, minHeight: 40, borderRadius: 999, border: '1px solid var(--status-healthy)', background: 'color-mix(in srgb, var(--status-healthy) 12%, transparent)', color: 'var(--status-healthy)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Ya se sentó (walk-in en Piso)
                    </button>
                  )}
                  <button onClick={() => setRowStatus(r, 'expired')}
                    style={{ minHeight: 40, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Ya no espera
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Buscador general de reservas: todos los venues permitidos y todas las
// fechas, por nombre, teléfono o texto en notas. Tap → salta al día.
// ─────────────────────────────────────────────────────────────────────────────
function ReservationSearchSheet({ buList, isMobile, onClose, onPick }: {
  buList: { id: string; code: string; name: string }[]
  isMobile: boolean
  onClose: () => void
  onPick: (r: { bu_id: string; date: string }) => void
}) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<(Reservation & { guest_name: string; guest_phone: string })[]>([])
  const [searching, setSearching] = useState(false)
  const codeOf = (id: string) => buList.find(b => b.id === id)?.code ?? '?'

  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const term = q.trim()
      const digits = term.replace(/\D/g, '')
      const buIds = buList.map(b => b.id)
      // 1) clientes que coinciden por teléfono o nombre
      let gq = supabase.from('guests').select('id, full_name, phone').limit(25)
      gq = digits.length >= 3 ? gq.ilike('phone', `%${digits}%`) : gq.ilike('full_name', `%${term}%`)
      const { data: gs } = await gq
      const gMap: Record<string, { id: string; full_name: string; phone: string }> = Object.fromEntries((gs ?? []).map(g => [g.id, g]))
      // 2) reservas de esos clientes + reservas cuyo texto en notas coincide
      const [byGuest, byNotes] = await Promise.all([
        (gs ?? []).length
          ? supabase.from('reservations').select('*').in('guest_id', (gs ?? []).map(g => g.id)).in('bu_id', buIds).order('date', { ascending: false }).limit(50)
          : Promise.resolve({ data: [] as Reservation[] }),
        digits.length >= 3
          ? Promise.resolve({ data: [] as Reservation[] })
          : supabase.from('reservations').select('*').ilike('notes', `%${term}%`).in('bu_id', buIds).order('date', { ascending: false }).limit(25),
      ])
      const merged: Record<string, Reservation> = {}
      for (const r of [...((byGuest.data ?? []) as Reservation[]), ...((byNotes.data ?? []) as Reservation[])]) merged[r.id] = r
      const missing = [...new Set(Object.values(merged).map(r => r.guest_id).filter(id => !gMap[id]))]
      if (missing.length) {
        const { data: extra } = await supabase.from('guests').select('id, full_name, phone').in('id', missing)
        for (const g of extra ?? []) gMap[g.id] = g
      }
      setRows(Object.values(merged)
        .sort((a, b) => b.date.localeCompare(a.date) || a.time_slot.localeCompare(b.time_slot))
        .slice(0, 50)
        .map(r => ({ ...r, guest_name: gMap[r.guest_id]?.full_name ?? 'Cliente', guest_phone: gMap[r.guest_id]?.phone ?? '' })))
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={480}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Buscar reservas</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, teléfono o texto en notas…"
            style={{ width: '100%', minHeight: 46, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '0 12px 0 34px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>Busca en todos tus venues y todas las fechas.</p>
        {searching ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>Buscando…</p>
        ) : q.trim().length >= 2 && rows.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', paddingTop: 16 }}>Sin resultados para “{q.trim()}”.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(r => {
              const meta = STATUS_META[r.status]
              return (
                <button key={r.id} onClick={() => onPick(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px', cursor: 'pointer', textAlign: 'left', minHeight: 56 }}>
                  <div style={{ textAlign: 'center', flexShrink: 0, width: 54 }}>
                    <div className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(r.date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    </div>
                    <div className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.time_slot}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.guest_name}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>{codeOf(r.bu_id)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.party_size} pax{r.guest_phone ? ` · ${formatPhone(r.guest_phone)}` : ''}{r.notes ? ` · ${r.notes}` : ''}
                    </div>
                  </div>
                  <StatusBadgeV2 tone={meta.tone} label={meta.label} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function ShareBookingSheet({ buId, code, venueName, isMobile, onClose }: {
  buId: string; code: string; venueName: string; isMobile: boolean; onClose: () => void
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  // Preview de compartir/pautar (Open Graph) — configurable por venue
  const [ogTitle, setOgTitle] = useState('')
  const [ogDesc, setOgDesc] = useState('')
  const [ogImage, setOgImage] = useState('')
  const [ogMissing, setOgMissing] = useState(false)
  const [ogSaving, setOgSaving] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const ogFileRef = useRef<HTMLInputElement>(null)
  // /r/CODE en lugar de ?reservar= directo: esa ruta sirve el Open Graph del
  // venue, así una pauta o un compartido en IG/WhatsApp sale con "Reserva tu
  // mesa en {venue}" y no con "HOG APP" (el robot de Meta no ejecuta JS)
  const url = `${window.location.origin}/r/${code}`

  useEffect(() => {
    supabase.from('business_units').select('public_booking_enabled, og_title, og_description, og_image_url').eq('id', buId).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          // Sin og_share.sql las columnas no existen: el toggle sigue vivo,
          // la sección del preview avisa qué falta
          setOgMissing(true)
          supabase.from('business_units').select('public_booking_enabled').eq('id', buId).maybeSingle()
            .then(({ data: d2 }) => setEnabled(!!d2?.public_booking_enabled))
          return
        }
        setEnabled(!!data?.public_booking_enabled)
        setOgTitle(data?.og_title ?? '')
        setOgDesc(data?.og_description ?? '')
        setOgImage(data?.og_image_url ?? '')
      })
  }, [buId])

  // La imagen del preview: JPG/PNG al bucket público; Meta pide ~1200×630
  async function subirOgImagen(file: File) {
    setSubiendo(true)
    const ext = file.name.split('.').pop()
    const path = `og/${code}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, file, { contentType: file.type || 'image/jpeg' })
    setSubiendo(false)
    if (upErr) { showToast(`No se pudo subir la imagen: ${upErr.message}`, 'error'); return }
    const { data: pub } = supabase.storage.from('proofs').getPublicUrl(path)
    setOgImage(pub.publicUrl)
  }

  async function guardarOg() {
    setOgSaving(true)
    const { error } = await supabase.from('business_units').update({
      og_title: ogTitle.trim() || null,
      og_description: ogDesc.trim() || null,
      og_image_url: ogImage || null,
    }).eq('id', buId)
    setOgSaving(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    showToast('Preview guardado — Meta lo relee en unos 5 minutos (o fuérzalo en el Sharing Debugger).', 'success')
  }

  async function toggle() {
    if (enabled === null) return
    setSaving(true)
    const next = !enabled
    const { error } = await supabase.from('business_units').update({ public_booking_enabled: next }).eq('id', buId)
    setSaving(false)
    if (error) { showToast('No se pudo cambiar. Intenta de nuevo.', 'error'); return }
    setEnabled(next)
    showToast(next ? 'Link público activado' : 'Link público desactivado', 'success')
  }

  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={460}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', flex: 1 }}>Link público de reservas</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 8 }}><X size={18} /></button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Comparte este link para que cualquiera reserve en <strong>{venueName}</strong> desde su teléfono. Las reservas entran como <em>Solicitadas</em> respetando el cupo de la noche y el umbral de apartado del venue.
        </p>

        {/* Toggle de activación */}
        <button onClick={toggle} disabled={enabled === null || saving}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '12px 14px', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ width: 42, height: 24, borderRadius: 999, background: enabled ? 'var(--accent)' : 'var(--border-strong)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: enabled ? 21 : 3, transition: 'left .15s' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{enabled ? 'Reservas en línea activadas' : 'Reservas en línea desactivadas'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{enabled ? 'El link ya recibe reservas' : 'Actívalo para que el link funcione'}</div>
          </div>
        </button>

        {/* Link + copiar */}
        <div style={{ display: 'flex', gap: 8, opacity: enabled ? 1 : 0.5 }}>
          <input readOnly value={url}
            style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', padding: '10px 12px', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none' }} />
          <button onClick={copy} disabled={!enabled}
            style={{ background: copied ? 'var(--status-healthy)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius-md)', padding: '0 14px', fontSize: 12, fontWeight: 700, cursor: enabled ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}>
            {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
          </button>
        </div>
        {enabled && (
          <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textAlign: 'center', textDecoration: 'none' }}>
            Ver cómo lo ve el cliente ↗
          </a>
        )}

        {/* ── Cómo se ve al compartir / pautar (Open Graph del venue) ──────── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            Así se ve al compartir o pautar
          </div>
          {ogMissing ? (
            <p style={{ fontSize: 12, color: 'var(--status-attention)', margin: 0, lineHeight: 1.5 }}>
              Falta correr og_share.sql en Supabase para poder configurar el título e imagen del preview.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                El título, texto e imagen que Instagram y WhatsApp muestran cuando alguien comparte <span style={{ fontFamily: 'var(--font-mono)' }}>/r/{code}</span> — y el copy que una pauta hereda si no escribes el suyo.
              </p>

              {/* Mini preview: cómo lo pintaría Meta */}
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {ogImage && (
                  <img src={ogImage} alt="" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', display: 'block' }} />
                )}
                <div style={{ padding: '9px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {ogTitle.trim() || `Reserva tu mesa en ${venueName}`}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {ogDesc.trim() || 'Elige día, hora y cuántos son — tu mesa queda confirmada en minutos.'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{window.location.host}</div>
                </div>
              </div>

              <input value={ogTitle} onChange={e => setOgTitle(e.target.value)} maxLength={70}
                placeholder={`Título — ej. Reserva tu mesa en ${venueName}`}
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13, outline: 'none', minHeight: 42, boxSizing: 'border-box' }} />
              <input value={ogDesc} onChange={e => setOgDesc(e.target.value)} maxLength={160}
                placeholder="Texto — ej. Ostras frescas y la mejor barra de la ciudad. Reserva en un minuto."
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13, outline: 'none', minHeight: 42, boxSizing: 'border-box' }} />

              <input ref={ogFileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirOgImagen(f); e.target.value = '' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => ogFileRef.current?.click()} disabled={subiendo}
                  style={{ flex: 1, minHeight: 42, borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Camera size={13} /> {subiendo ? 'Subiendo…' : ogImage ? 'Cambiar imagen' : 'Subir imagen (1200×630 recomendado)'}
                </button>
                {ogImage && (
                  <button onClick={() => setOgImage('')} title="Quitar imagen"
                    style={{ minHeight: 42, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer' }}>
                    Quitar
                  </button>
                )}
              </div>

              <button onClick={guardarOg} disabled={ogSaving}
                style={{ minHeight: 44, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {ogSaving ? 'Guardando…' : 'Guardar preview'}
              </button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
