import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Bot, MessageCircle, Camera, Send, Power, X, Plus, Hand, Undo2, CheckCircle2, FlaskConical, TrendingUp, Inbox, Shell, ChevronLeft, ChevronRight, Music, Search, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../hooks/useActivityLog'
import { notifySlack } from '../hooks/useSlack'
import { useIsMobile } from '../hooks/useIsMobile'
import { BUChip, KPITile, SegmentedControl, FilterChips, Sheet, StatusBadgeV2, EmptyStateV2, showToast, type StatusTone } from '../components/v2'
import { Reservations } from './Reservations'
import { Guests } from './Guests'

// ── Types ────────────────────────────────────────────────────────────────────
type ConvStatus = 'bot' | 'needs_human' | 'human' | 'closed'
type Channel = 'instagram' | 'whatsapp'

interface Conversation {
  id: string
  channel: Channel
  external_id: string
  bu_id: string | null
  guest_id: string | null
  status: ConvStatus
  assigned_to: string | null
  escalation_reason: string | null
  last_sender: 'guest' | 'bot' | 'agent' | null
  pending_fields: string[]
  display_name: string | null
  is_simulated: boolean
  first_seen_at: string
  last_message_at: string
  first_replied_at: string | null
  followups_sent: number
  created_at: string
}
interface Message {
  id: string
  conversation_id: string
  role: 'guest' | 'bot' | 'agent' | 'system'
  body: string | null
  meta: { image_url?: string } | null
  created_at: string
}
interface VenueConfig {
  id: string
  bu_id: string
  channel: Channel
  external_account: string | null
  enabled: boolean
  persona_note: string | null
  first_reply_delay_seconds: number
  followup_after_minutes: number
  followup_window_start: string
  followup_window_end: string
  escalate_over_pax: number
}
interface BU { id: string; code: string; name: string }
interface PaymentConfig {
  bu_id: string
  clabe: string | null
  bank_name: string | null
  beneficiary: string | null
  deposit_over_pax: number
  deposit_per_person: number | null
  deposit_fixed: number | null
  instructions: string | null
  stripe_account_id: string | null
  active: boolean
}

const STATUS_META: Record<ConvStatus, { label: string; tone: StatusTone }> = {
  bot:         { label: 'Bot',        tone: 'accent' },
  needs_human: { label: 'Necesita humano', tone: 'attention' },
  human:       { label: 'Humano',     tone: 'healthy' },
  closed:      { label: 'Cerrada',    tone: 'neutral' },
}
const CHANNEL_ICON: Record<Channel, React.ElementType> = { instagram: Camera, whatsapp: MessageCircle }
const CHANNEL_LABEL: Record<Channel, string> = { instagram: 'Instagram', whatsapp: 'WhatsApp' }

interface ResPreview {
  id: string
  date: string
  time_slot: string
  party_size: number
  status: string
  notes: string | null
  guests: { full_name: string } | null
}
const RES_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  requested: { label: 'Solicitada', tone: 'neutral' },
  confirmed: { label: 'Confirmada', tone: 'accent' },
  seated:    { label: 'Sentada',    tone: 'attention' },
  completed: { label: 'Completada', tone: 'healthy' },
  no_show:   { label: 'No-show',    tone: 'risk' },
  cancelled: { label: 'Cancelada',  tone: 'neutral' },
}
const PENDING_LABEL: Record<string, string> = { name: 'nombre', phone: 'teléfono', date: 'fecha', time: 'hora', pax: 'pax' }

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return `hace ${Math.floor(hrs / 24)} d`
}

// ═════════════════════════════════════════════════════════════════════════════
// Concierge — la app de hospitalidad del holding: el cliente pide (Bot) →
// se agenda (Reservas) → queda su historia (Clientes). Secciones por rol:
// Team/Ops: Reservas · Bandeja · Clientes / Master: + Resumen · Configuración.
// ═════════════════════════════════════════════════════════════════════════════
export function Concierge({ userId, userRole, caps }: { userId?: string; userRole?: string; caps?: Set<string> }) {
  const isMobile = useIsMobile()
  const isMaster = userRole === 'MASTER'
  // Talento se libera por rol (Ops/Master), por función 'talento' (ej. el
  // booker que vive en Marketing), o para DEV en modo auditoría (solo lectura
  // — las policies bloquean sus escrituras)
  const isOpsPlus = ['MASTER', 'OPS_MANAGER', 'DEV'].includes(userRole ?? '') || !!caps?.has('talento')
  // DEV audita el Resumen del bot; Config (toggles vivos) sigue solo Master
  const canSeeSummary = isMaster || userRole === 'DEV'
  // Hoy es el landing para todos: la cabina de triage — qué necesita atención
  // y cómo van las reservas, todo accionable en ≤2 taps.
  const [tab, setTab] = useState('hoy')
  const [buList, setBuList] = useState<BU[]>([])

  useEffect(() => {
    supabase.from('business_units').select('id, code, name').order('code')
      .then(({ data }) => setBuList((data ?? []) as BU[]))
  }, [])

  const tabs = [
    { id: 'hoy',      label: 'Hoy' },
    { id: 'reservas', label: 'Reservas' },
    { id: 'inbox',    label: 'Bandeja' },
    { id: 'clientes', label: 'Clientes' },
    ...(isOpsPlus ? [{ id: 'talento', label: 'Talento' }] : []),   // fees = dato sensible: Ops/Master
    ...(canSeeSummary ? [{ id: 'summary', label: 'Resumen' }] : []),
    ...(isMaster ? [{ id: 'config', label: 'Config' }] : []),
  ]

  // Reservas y Clientes son pantallas completas con su propio scroll; las demás
  // secciones scrollean dentro del contenedor centrado.
  const fullBleed = tab === 'reservas' || tab === 'clientes'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ padding: isMobile ? '8px 12px 0' : '14px 20px 0', flexShrink: 0 }}>
        {/* En móvil el top bar ya dice "Concierge" — el título aquí solo roba pantalla */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Shell size={18} style={{ color: 'var(--accent)' }} />
            <h1 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Concierge</h1>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 4 }}>Reservas · Bot · Clientes</span>
          </div>
        )}
        <div style={{ maxWidth: isMobile ? undefined : (isMaster ? 720 : 500), paddingBottom: 8 }}>
          <SegmentedControl scrollable value={tab} onChange={setTab} options={tabs} />
        </div>
      </div>

      {fullBleed ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {tab === 'reservas' && <Reservations userRole={userRole} userId={userId} />}
          {tab === 'clientes' && <Guests userRole={userRole} userId={userId} />}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: isMobile ? 'var(--space-3)' : 'var(--space-5)', paddingTop: 4, maxWidth: 1100, margin: '0 auto' }}>
            {tab === 'hoy' && <HoyTab buList={buList} userId={userId} isMobile={isMobile} onGoReservas={() => setTab('reservas')} />}
            {tab === 'inbox' && <InboxTab buList={buList} userId={userId} isMobile={isMobile} isMaster={isMaster} />}
            {isOpsPlus && tab === 'talento' && <TalentoTab buList={buList} userId={userId} isMobile={isMobile} />}
            {canSeeSummary && tab === 'summary' && <SummaryTab buList={buList} />}
            {isMaster && tab === 'config' && <ConfigTab buList={buList} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// HOY — cabina de triage: la cola de lo que necesita atención (accionable en
// ≤2 taps), la ocupación de la noche por venue, y el pulso de calidad del día.
// Meta operativa del turno: cola en cero, nada en rojo.
// ═════════════════════════════════════════════════════════════════════════════
interface HoyRes {
  id: string; bu_id: string; date: string; time_slot: string; party_size: number
  status: string; bot_conversation_id: string | null
  guests: { full_name: string } | null
}

// Semáforo de espera: verde <5 min · ámbar 5–15 · rojo >15
function esperaColor(iso: string): string {
  const mins = (Date.now() - new Date(iso).getTime()) / 60000
  return mins > 15 ? 'var(--status-risk)' : mins > 5 ? 'var(--status-attention)' : 'var(--status-healthy)'
}

function HoyTab({ buList, userId, isMobile, onGoReservas }: {
  buList: BU[]; userId?: string; isMobile: boolean; onGoReservas: () => void
}) {
  const [queue, setQueue] = useState<Conversation[]>([])
  const [resDias, setResDias] = useState<HoyRes[]>([])
  const [caps, setCaps] = useState<Record<string, { max_reservations: number; max_pax: number }>>({})
  const [convsHoy, setConvsHoy] = useState<{ created_at: string; first_replied_at: string | null }[]>([])
  const [openConv, setOpenConv] = useState<Conversation | null>(null)
  const [busyRes, setBusyRes] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const hoy = new Date()
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const man = new Date(hoy.getTime() + 86400000)
  const manISO = `${man.getFullYear()}-${String(man.getMonth() + 1).padStart(2, '0')}-${String(man.getDate()).padStart(2, '0')}`

  const load = useCallback(async () => {
    const [{ data: q }, { data: rs }, { data: cp }, { data: ch }] = await Promise.all([
      supabase.from('bot_conversations').select('*').eq('status', 'needs_human').eq('is_simulated', false).order('last_message_at'),
      supabase.from('reservations').select('id, bu_id, date, time_slot, party_size, status, bot_conversation_id, guests(full_name)')
        .gte('date', hoyISO).lte('date', manISO),
      supabase.from('venue_capacity').select('bu_id, max_reservations, max_pax').eq('day_of_week', hoy.getDay()).eq('active', true),
      supabase.from('bot_conversations').select('created_at, first_replied_at').eq('is_simulated', false).gte('last_message_at', hoyISO),
    ])
    setQueue((q ?? []) as Conversation[])
    setResDias((rs ?? []) as unknown as HoyRes[])
    setCaps(Object.fromEntries((cp ?? []).map(c => [c.bu_id, { max_reservations: c.max_reservations, max_pax: c.max_pax }])))
    setConvsHoy(ch ?? [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoyISO, manISO])

  useEffect(() => { load() }, [load])

  // La cola se prioriza: quejas 🚨 → comprobantes 🧾 → el resto por antigüedad
  const esQueja = (c: Conversation) => /^queja/i.test(c.escalation_reason ?? '')
  const esComprobante = (c: Conversation) => /(comprobante|apartado)/i.test(c.escalation_reason ?? '')
  const cola = [...queue].sort((a, b) => {
    const pa = esQueja(a) ? 0 : esComprobante(a) ? 1 : 2
    const pb = esQueja(b) ? 0 : esComprobante(b) ? 1 : 2
    return pa !== pb ? pa - pb : a.last_message_at.localeCompare(b.last_message_at)
  })
  const sinConfirmar = resDias.filter(r => r.status === 'requested')

  // Confirmar directo desde la tarjeta: reserva confirmada + aviso automático
  // al cliente por su canal (misma mecánica que el botón del hilo).
  async function confirmar(r: HoyRes) {
    setBusyRes(r.id)
    const { error } = await supabase.from('reservations').update({
      status: 'confirmed', confirmed_at: new Date().toISOString(), status_changed_by: userId ?? null,
    }).eq('id', r.id)
    if (error) { setBusyRes(null); showToast(`No se pudo confirmar: ${error.message}`, 'error'); return }
    logActivity('reservation_confirmed', 'reservation', r.id, { via: 'concierge_hoy', guest: r.guests?.full_name })
    if (r.bot_conversation_id) {
      const { data: conv } = await supabase.from('bot_conversations').select('id, is_simulated').eq('id', r.bot_conversation_id).maybeSingle()
      if (conv) {
        const bu = buList.find(b => b.id === r.bu_id)
        const fecha = new Date(r.date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
        const aviso = `✅ ¡Reserva confirmada! Te esperamos el ${fecha}, ${r.time_slot}, ${r.party_size} ${r.party_size === 1 ? 'persona' : 'personas'}${bu ? ` en ${bu.name}` : ''}. Cualquier cambio, escríbenos por aquí.`
        if (conv.is_simulated) await supabase.from('bot_messages').insert({ conversation_id: conv.id, role: 'agent', body: aviso })
        else {
          const { data, error: sendErr } = await supabase.functions.invoke('concierge-send', { body: { conversationId: conv.id, body: aviso } })
          if (sendErr || data?.error) showToast('Confirmada, pero el aviso al cliente falló — mándaselo desde la Bandeja', 'error')
        }
      }
    }
    setBusyRes(null)
    showToast('Reserva confirmada y cliente avisado ✅', 'success')
    load()
  }

  // KPIs de calidad del día
  const frMins = convsHoy.filter(c => c.first_replied_at)
    .map(c => (new Date(c.first_replied_at!).getTime() - new Date(c.created_at).getTime()) / 60000)
    .filter(m => m >= 0).sort((a, b) => a - b)
  const frMediana = frMins.length ? frMins[Math.floor(frMins.length / 2)] : null
  const resHoy = resDias.filter(r => r.date === hoyISO && r.status !== 'cancelled')
  const confirmadasPct = resHoy.length
    ? Math.round((resHoy.filter(r => ['confirmed', 'seated', 'completed'].includes(r.status)).length / resHoy.length) * 100)
    : null

  const nowHM = `${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`
  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)', padding: '12px 14px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* ── Pulso de calidad ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <KPITile label="1ª respuesta hoy" value={frMediana != null ? `${Math.round(frMediana)} min` : '—'}
          color={frMediana != null && frMediana > 10 ? 'var(--status-attention)' : undefined} hint="Mediana del día" />
        <KPITile label="Esperando humano" value={String(cola.length)}
          color={cola.length ? 'var(--status-risk)' : 'var(--status-healthy)'} />
        <KPITile label="Confirmadas hoy" value={confirmadasPct != null ? `${confirmadasPct}%` : '—'}
          color={confirmadasPct != null && confirmadasPct < 60 ? 'var(--status-attention)' : undefined} />
        <KPITile label="Conversaciones hoy" value={String(convsHoy.length)} />
      </div>

      {/* ── Atiende ahora ── */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Atiende ahora {cola.length + sinConfirmar.length > 0 && `· ${cola.length + sinConfirmar.length}`}
        </div>
        {loading ? null : cola.length === 0 && sinConfirmar.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600 }}>
            Todo atendido ✅ — cola en cero
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cola.map(c => {
              const bu = buList.find(b => b.id === c.bu_id)
              return (
                <button key={c.id} onClick={() => setOpenConv(c)}
                  style={{ ...cardStyle, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{esQueja(c) ? '🚨' : esComprobante(c) ? '🧾' : '🙋'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {c.display_name ?? c.external_id.slice(-6)}
                      {bu && <BUChip code={bu.code} size="sm" />}
                      <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-tertiary)' }}>{c.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {c.escalation_reason ?? 'Esperando atención humana'}
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: esperaColor(c.last_message_at) }} />
                    {timeAgo(c.last_message_at)}
                  </span>
                </button>
              )
            })}
            {sinConfirmar.map(r => {
              const bu = buList.find(b => b.id === r.bu_id)
              return (
                <div key={r.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>📅</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {r.guests?.full_name ?? 'Cliente'}
                      {bu && <BUChip code={bu.code} size="sm" />}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Sin confirmar · {r.date === hoyISO ? 'HOY' : 'mañana'} {r.time_slot} · {r.party_size} pax
                    </div>
                  </div>
                  <button onClick={() => confirmar(r)} disabled={busyRes === r.id}
                    style={{
                      background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius-sm)',
                      padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 40, flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busyRes === r.id ? 0.6 : 1,
                    }}>
                    <CheckCircle2 size={13} /> Confirmar
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Reservas de hoy por venue ── */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          La noche de hoy
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {buList.filter(bu => caps[bu.id] || resDias.some(r => r.bu_id === bu.id && r.date === hoyISO)).map(bu => {
            const vivas = resDias.filter(r => r.bu_id === bu.id && r.date === hoyISO && ['requested', 'confirmed', 'seated', 'completed'].includes(r.status))
            const pax = vivas.reduce((s, r) => s + r.party_size, 0)
            const cap = caps[bu.id]
            const pct = cap ? Math.max(vivas.length / cap.max_reservations, pax / cap.max_pax) : null
            const barColor = pct == null ? 'var(--status-none)' : pct >= 1 ? 'var(--status-risk)' : pct >= 0.85 ? 'var(--status-attention)' : 'var(--status-healthy)'
            const llegadas = vivas.filter(r => ['requested', 'confirmed'].includes(r.status) && r.time_slot >= nowHM)
              .sort((a, b) => a.time_slot.localeCompare(b.time_slot)).slice(0, 3)
            return (
              <button key={bu.id}
                onClick={() => { localStorage.setItem('hog_res_last_bu', bu.id); onGoReservas() }}
                style={{ ...cardStyle, textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <BUChip code={bu.code} size="sm" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{bu.name}</span>
                  <span className="num" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {cap ? `${vivas.length}/${cap.max_reservations} res · ${pax}/${cap.max_pax} pax` : `${vivas.length} res · ${pax} pax`}
                  </span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-elevated)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.round((pct ?? 0) * 100))}%`, background: barColor, borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  {llegadas.length
                    ? `Próximas llegadas: ${llegadas.map(l => `${l.time_slot} ${(l.guests?.full_name ?? '').split(' ')[0]} ×${l.party_size}`).join(' · ')}`
                    : vivas.length ? 'Sin llegadas pendientes en lo que resta de la noche' : 'Sin reservas para hoy — toca para agendar'}
                </div>
              </button>
            )
          })}
          {buList.every(bu => !caps[bu.id] && !resDias.some(r => r.bu_id === bu.id && r.date === hoyISO)) && !loading && (
            <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Sin reservas ni capacidad configurada para hoy.
            </div>
          )}
        </div>
      </div>

      {openConv && (
        <ThreadSheet conv={openConv} buList={buList} userId={userId} isMobile={isMobile}
          onClose={() => { setOpenConv(null); load() }} onChanged={load} />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Resumen — productividad + ventas por venue
// ═════════════════════════════════════════════════════════════════════════════
function SummaryTab({ buList }: { buList: BU[] }) {
  const [period, setPeriod] = useState('7d')
  const [convs, setConvs] = useState<Conversation[]>([])
  const [botResCount, setBotResCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const days = period === 'today' ? 1 : period === '7d' ? 7 : 30
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const [{ data: cs }, { count }] = await Promise.all([
        supabase.from('bot_conversations').select('*').gte('created_at', since).order('created_at', { ascending: false }),
        supabase.from('reservations').select('id', { count: 'exact', head: true }).not('bot_conversation_id', 'is', null).gte('created_at', since),
      ])
      setConvs((cs ?? []) as Conversation[])
      setBotResCount(count ?? 0)
      setLoading(false)
    }
    load()
  }, [period])

  const stats = useMemo(() => {
    const total = convs.length
    const escalated = convs.filter(c => c.status === 'needs_human' || c.status === 'human' || (c.status === 'closed' && c.assigned_to)).length
    const byBot = total - escalated
    const conversion = total > 0 ? Math.round((botResCount / total) * 100) : 0
    return { total, byBot, botPct: total > 0 ? Math.round((byBot / total) * 100) : 0, escalated, conversion }
  }, [convs, botResCount])

  const perVenue = useMemo(() => {
    const map = new Map<string, { convs: number; escalated: number }>()
    for (const c of convs) {
      const key = c.bu_id ?? 'none'
      const e = map.get(key) ?? { convs: 0, escalated: 0 }
      e.convs++
      if (c.status === 'needs_human' || c.status === 'human') e.escalated++
      map.set(key, e)
    }
    return map
  }, [convs])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <FilterChips
        active={period} onChange={setPeriod}
        options={[{ id: 'today', label: 'Hoy' }, { id: '7d', label: '7 días' }, { id: '30d', label: '30 días' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
        <KPITile label="Conversaciones" value={String(stats.total)} icon={<MessageCircle size={13} />} />
        <KPITile label="Resueltas por bot" value={`${stats.botPct}%`} icon={<Bot size={13} />} color="var(--accent)" hint="Sin intervención humana" />
        <KPITile label="Escalaciones" value={String(stats.escalated)} icon={<Hand size={13} />} color={stats.escalated > 0 ? 'var(--status-attention)' : 'var(--text-primary)'} />
        <KPITile label="Reservas por bot" value={String(botResCount)} icon={<CheckCircle2 size={13} />} color="var(--status-healthy)" />
        <KPITile label="Conversión" value={`${stats.conversion}%`} icon={<TrendingUp size={13} />} hint="Conversaciones que terminan en reserva" />
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Por venue</div>
        {loading ? (
          <p style={{ padding: 14, color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>Cargando…</p>
        ) : buList.filter(b => perVenue.has(b.id)).length === 0 ? (
          <EmptyStateV2 icon={<Bot size={26} />} title="Sin conversaciones en este periodo. Usa el simulador en la Bandeja para probar el flujo." />
        ) : (
          buList.filter(b => perVenue.has(b.id)).map(b => {
            const v = perVenue.get(b.id)!
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                <BUChip code={b.code} name={b.name} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{b.name}</span>
                <span className="num" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-secondary)' }}>{v.convs} conv.</span>
                {v.escalated > 0 && <StatusBadgeV2 tone="attention" label={`${v.escalated} escaladas`} />}
              </div>
            )
          })
        )}
        {perVenue.has('none') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Sin venue identificado</span>
            <span className="num" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-secondary)' }}>{perVenue.get('none')!.convs} conv.</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Bandeja — conversaciones en vivo + simulador
// ═════════════════════════════════════════════════════════════════════════════
function InboxTab({ buList, userId, isMobile, isMaster }: { buList: BU[]; userId?: string; isMobile: boolean; isMaster: boolean }) {
  const [convs, setConvs] = useState<Conversation[]>([])
  const [statusFilter, setStatusFilter] = useState('open')
  const [openConv, setOpenConv] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('bot_conversations').select('*').order('last_message_at', { ascending: false }).limit(200)
    setConvs((data ?? []) as Conversation[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('concierge-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_conversations' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // Mantener la conversación abierta sincronizada con la lista
  useEffect(() => {
    if (!openConv) return
    const fresh = convs.find(c => c.id === openConv.id)
    if (fresh) setOpenConv(fresh)
  }, [convs]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = convs.filter(c => {
    if (statusFilter === 'open') return c.status !== 'closed'
    if (statusFilter === 'all') return true
    return c.status === statusFilter
  })

  async function simulate() {
    const bu = buList.find(b => b.code === 'BM') ?? buList[0]
    const { data: conv, error } = await supabase.from('bot_conversations').insert({
      channel: 'instagram', external_id: `sim-${crypto.randomUUID().slice(0, 8)}`,
      bu_id: bu?.id ?? null, status: 'bot', last_sender: 'guest',
      display_name: 'Cliente de prueba', is_simulated: true,
      pending_fields: ['phone', 'date', 'pax'],
    }).select('*').single()
    if (error) { showToast(`No se pudo simular: ${error.message}`, 'error'); return }
    await supabase.from('bot_messages').insert([
      { conversation_id: conv.id, role: 'guest', body: '¡Hola! ¿Tienen mesa para el sábado en la noche?' },
      { conversation_id: conv.id, role: 'bot', body: '¡Hola! Claro que sí 🙌 ¿Para cuántas personas sería y a qué hora les gustaría llegar?' },
    ])
    logActivity('concierge_simulated', 'bot_conversation', conv.id, { bu: bu?.code })
    setOpenConv(conv as Conversation)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <FilterChips
          active={statusFilter} onChange={setStatusFilter}
          options={[
            { id: 'open', label: 'Abiertas' },
            { id: 'needs_human', label: 'Necesitan humano', color: 'var(--status-attention)' },
            { id: 'human', label: 'Con humano', color: 'var(--status-healthy)' },
            { id: 'bot', label: 'Con bot', color: 'var(--accent)' },
            { id: 'closed', label: 'Cerradas' },
            { id: 'all', label: 'Todas' },
          ]}
        />
        {isMaster && (
          <button onClick={simulate}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px dashed var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <FlaskConical size={13} /> Simular conversación
          </button>
        )}
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: 14, color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>Cargando…</p>
        ) : filtered.length === 0 ? (
          <EmptyStateV2 icon={<Inbox size={26} />} title="Sin conversaciones aquí. Los DMs de Instagram y WhatsApp de tus venues caen en esta bandeja." actionLabel={isMaster ? 'Simular una conversación' : undefined} onAction={isMaster ? simulate : undefined} />
        ) : (
          filtered.map(c => {
            const ChIcon = CHANNEL_ICON[c.channel]
            const bu = buList.find(b => b.id === c.bu_id)
            return (
              <button key={c.id} onClick={() => setOpenConv(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '8px 14px', border: 'none', borderBottom: '1px solid var(--border-subtle)', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <ChIcon size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.display_name || c.external_id}
                    </span>
                    {c.is_simulated && <StatusBadgeV2 tone="neutral" label="SIM" />}
                    {bu && <BUChip code={bu.code} size="sm" />}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {CHANNEL_LABEL[c.channel]} · {timeAgo(c.last_message_at)}
                    {c.pending_fields.length > 0 && ` · falta: ${c.pending_fields.map(f => PENDING_LABEL[f] ?? f).join(', ')}`}
                  </div>
                </div>
                <StatusBadgeV2 tone={STATUS_META[c.status].tone} label={STATUS_META[c.status].label} />
              </button>
            )
          })
        )}
      </div>

      {openConv && (
        <ThreadSheet conv={openConv} buList={buList} userId={userId} isMobile={isMobile}
          onClose={() => setOpenConv(null)} onChanged={load} />
      )}
    </div>
  )
}

// ─── Hilo de conversación: tomar / devolver / cerrar / responder ─────────────
function ThreadSheet({ conv, buList, userId, isMobile, onClose, onChanged }: {
  conv: Conversation
  buList: BU[]
  userId?: string
  isMobile: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [reply, setReply] = useState('')
  const [guestReply, setGuestReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [resPreview, setResPreview] = useState<ResPreview | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bu = buList.find(b => b.id === conv.bu_id)

  const loadMessages = useCallback(async () => {
    const [{ data }, { data: res }] = await Promise.all([
      supabase.from('bot_messages').select('*').eq('conversation_id', conv.id).order('created_at'),
      supabase.from('reservations').select('id, date, time_slot, party_size, status, notes, guests(full_name)')
        .eq('bot_conversation_id', conv.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    setMessages((data ?? []) as Message[])
    setResPreview((res as unknown as ResPreview) ?? null)
  }, [conv.id])

  useEffect(() => {
    loadMessages()
    const ch = supabase.channel(`concierge-thread-${conv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_messages', filter: `conversation_id=eq.${conv.id}` }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [conv.id, loadMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function setStatus(status: ConvStatus, extra: Record<string, unknown> = {}) {
    setBusy(true)
    const { error } = await supabase.from('bot_conversations').update({ status, ...extra }).eq('id', conv.id)
    setBusy(false)
    if (error) { showToast(`No se pudo actualizar: ${error.message}`, 'error'); return }
    logActivity(`concierge_${status}`, 'bot_conversation', conv.id, { name: conv.display_name, bu: bu?.code })
    onChanged()
  }

  const take = () => setStatus('human', { assigned_to: userId ?? null, taken_at: new Date().toISOString() })
  const giveBack = () => setStatus('bot', { assigned_to: null })
  const close = () => setStatus('closed', { closed_at: new Date().toISOString() })

  // Confirmar la reserva solicitada directo desde el hilo — sin ir a buscarla
  // al board. Al confirmar, el cliente recibe su confirmación automática por
  // el mismo canal (nada de "confirmada pero nadie le avisó").
  async function confirmRes() {
    if (!resPreview) return
    setBusy(true)
    const { error } = await supabase.from('reservations').update({
      status: 'confirmed', confirmed_at: new Date().toISOString(),
      status_changed_by: userId ?? null, confirmed_via: conv.channel,
    }).eq('id', resPreview.id)
    if (error) { setBusy(false); showToast(`No se pudo confirmar: ${error.message}`, 'error'); return }
    logActivity('reservation_confirmed', 'reservation', resPreview.id, { via: 'concierge_inbox', guest: resPreview.guests?.full_name, bu: bu?.code })

    const fecha = new Date(resPreview.date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    const aviso = `✅ ¡Reserva confirmada! Te esperamos el ${fecha}, ${resPreview.time_slot}, ${resPreview.party_size} ${resPreview.party_size === 1 ? 'persona' : 'personas'}${bu ? ` en ${bu.name}` : ''}. Cualquier cambio, escríbenos por aquí.`
    if (conv.is_simulated) {
      await supabase.from('bot_messages').insert({ conversation_id: conv.id, role: 'agent', body: aviso })
    } else {
      const { data, error: sendErr } = await supabase.functions.invoke('concierge-send', {
        body: { conversationId: conv.id, body: aviso },
      })
      if (sendErr || data?.error) {
        setBusy(false)
        showToast('Reserva confirmada, pero el aviso al cliente falló — mándaselo manual 👇', 'error')
        loadMessages(); onChanged(); return
      }
    }
    setBusy(false)
    showToast('Reserva confirmada y cliente avisado ✅', 'success')
    loadMessages()
    onChanged()
  }

  async function sendAs(role: 'agent' | 'guest', body: string, clear: () => void) {
    if (!body.trim()) return
    setBusy(true)

    // Respuesta humana a un cliente REAL → va por el servidor (concierge-send),
    // que envía a WhatsApp/Instagram, guarda el mensaje y toma la conversación.
    if (role === 'agent' && !conv.is_simulated) {
      const { data, error } = await supabase.functions.invoke('concierge-send', {
        body: { conversationId: conv.id, body: body.trim() },
      })
      setBusy(false)
      if (error || data?.error) { showToast(`No se pudo enviar: ${error?.message ?? data?.error}`, 'error'); return }
      clear()
      loadMessages()
      onChanged()
      return
    }

    // Simuladas (y "responder como cliente"): solo tocan la base, nunca Meta
    const { error } = await supabase.from('bot_messages').insert({ conversation_id: conv.id, role, body: body.trim() })
    if (error) { setBusy(false); showToast(`No se pudo enviar: ${error.message}`, 'error'); return }
    const patch: Record<string, unknown> = { last_sender: role, last_message_at: new Date().toISOString() }
    // Responder como agente TOMA la conversación: el bot se calla (regla dura del handoff)
    if (role === 'agent' && conv.status !== 'human') Object.assign(patch, { status: 'human', assigned_to: userId ?? null, taken_at: new Date().toISOString() })
    await supabase.from('bot_conversations').update(patch).eq('id', conv.id)
    setBusy(false)
    clear()
    onChanged()
  }

  const roleStyle = (role: Message['role']): React.CSSProperties => {
    const mine = role !== 'guest'
    return {
      alignSelf: mine ? 'flex-end' : 'flex-start',
      maxWidth: '78%',
      background: role === 'guest' ? 'var(--bg-elevated)' : role === 'agent' ? 'color-mix(in srgb, var(--status-healthy) 14%, transparent)' : 'var(--accent-bg)',
      border: `1px solid ${role === 'guest' ? 'var(--border-subtle)' : role === 'agent' ? 'color-mix(in srgb, var(--status-healthy) 30%, transparent)' : 'var(--accent-border)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45,
    }
  }

  const actionBtn = (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px',
    borderRadius: 999, border: 'none', background: bg, color, fontSize: 12, fontWeight: 700,
    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
  })

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{conv.display_name || conv.external_id}</span>
            {conv.is_simulated && <StatusBadgeV2 tone="neutral" label="SIMULACIÓN" />}
            <button onClick={onClose} aria-label="Cerrar" style={{ marginLeft: 'auto', width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <StatusBadgeV2 tone={STATUS_META[conv.status].tone} label={STATUS_META[conv.status].label} />
            {bu && <BUChip code={bu.code} name={bu.name} size="sm" />}
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{CHANNEL_LABEL[conv.channel]}</span>
            {conv.escalation_reason && <span style={{ fontSize: 11, color: 'var(--status-attention)' }}>Motivo: {conv.escalation_reason}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {(conv.status === 'bot' || conv.status === 'needs_human') && (
              <button onClick={take} disabled={busy} style={actionBtn('var(--accent)', 'var(--on-accent)')}><Hand size={13} /> Tomar</button>
            )}
            {conv.status === 'human' && (
              <button onClick={giveBack} disabled={busy} style={actionBtn('var(--bg-elevated)', 'var(--accent)')}><Undo2 size={13} /> Devolver al bot</button>
            )}
            {conv.status !== 'closed' && (
              <button onClick={close} disabled={busy} style={actionBtn('var(--bg-elevated)', 'var(--text-secondary)')}><CheckCircle2 size={13} /> Cerrar</button>
            )}
            {conv.status === 'closed' && (
              <button onClick={() => setStatus('bot')} disabled={busy} style={actionBtn('var(--bg-elevated)', 'var(--accent)')}><Undo2 size={13} /> Reabrir con bot</button>
            )}
          </div>
        </div>

        {/* Preview de la reserva solicitada: confirmable sin salir del hilo */}
        {resPreview && (
          <div style={{ margin: '10px var(--space-4) 0', background: 'var(--bg-elevated)', border: `1px solid ${resPreview.status === 'requested' ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', padding: '10px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Solicitud de reserva</span>
              <StatusBadgeV2 tone={RES_STATUS[resPreview.status]?.tone ?? 'neutral'} label={RES_STATUS[resPreview.status]?.label ?? resPreview.status} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {resPreview.guests?.full_name ?? 'Cliente'}
              <span className="num" style={{ fontWeight: 700 }}> · {new Date(resPreview.date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} · {resPreview.time_slot} · {resPreview.party_size} pax</span>
            </div>
            {resPreview.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{resPreview.notes}</div>}
            {resPreview.status === 'requested' && (
              <button onClick={confirmRes} disabled={busy}
                style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                <CheckCircle2 size={13} /> Confirmar reserva
              </button>
            )}
          </div>
        )}

        {/* Mensajes */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.length === 0 && <p style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>Sin mensajes aún.</p>}
          {messages.map(m => (
            <div key={m.id} style={roleStyle(m.role)}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 2 }}>
                {m.role === 'guest' ? 'Cliente' : m.role === 'bot' ? 'Bot' : m.role === 'agent' ? 'Equipo' : 'Sistema'}
              </div>
              {/* Imágenes (comprobantes de depósito, fotos): tap → abre completa */}
              {m.meta?.image_url && (
                <a href={m.meta.image_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: m.body ? 6 : 0 }}>
                  <img src={m.meta.image_url} alt="Imagen del cliente" loading="lazy"
                    style={{ maxWidth: 220, maxHeight: 280, borderRadius: 'var(--radius-sm)', display: 'block' }} />
                </a>
              )}
              {m.body}
            </div>
          ))}
        </div>

        {/* Composer */}
        <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conv.status !== 'closed' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendAs('agent', reply, () => setReply('')) }}
                placeholder={conv.status === 'human' ? 'Responder como equipo…' : 'Responder (esto toma la conversación)…'}
                style={{ flex: 1, minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }} />
              <button onClick={() => sendAs('agent', reply, () => setReply(''))} disabled={busy || !reply.trim()} aria-label="Enviar"
                style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', border: 'none', background: reply.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: reply.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', cursor: reply.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={15} />
              </button>
            </div>
          )}
          {conv.is_simulated && conv.status !== 'closed' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={guestReply} onChange={e => setGuestReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendAs('guest', guestReply, () => setGuestReply('')) }}
                placeholder="Simular respuesta del cliente…"
                style={{ flex: 1, minHeight: 40, background: 'var(--bg-base)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 12, color: 'var(--text-secondary)', outline: 'none' }} />
              <button onClick={() => sendAs('guest', guestReply, () => setGuestReply(''))} disabled={busy || !guestReply.trim()} aria-label="Enviar como cliente"
                style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-tertiary)', cursor: guestReply.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FlaskConical size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Configuración — kill switch global + UNA caja por venue con bullets.
// Cada bullet (Canales, Voz, Ritmo, Info bancaria, FAQ) muestra de un vistazo
// qué información YA tiene el Concierge (punto brass ●) y qué falta (○). Al
// picarlo, la sección se expande — cero espacio muerto por secciones vacías.
// ═════════════════════════════════════════════════════════════════════════════
interface VenueBotInfo { bu_id: string; faq: string | null }
interface ChanHealth { lastIn: string | null; lastOut: string | null }

// Semáforo de conexión live por canal: se basa en tráfico REAL (webhook
// recibiendo + bot/equipo respondiendo), no en configuración.
function chanStatus(h: ChanHealth | undefined, enabled: boolean): { color: string; label: string } {
  if (!enabled) return { color: 'var(--border-strong)', label: 'Canal apagado' }
  if (!h?.lastIn) return { color: 'var(--status-attention)', label: 'Sin tráfico aún — manda un mensaje de prueba' }
  const hrs = (Date.now() - new Date(h.lastIn).getTime()) / 3600000
  const out = h.lastOut ? ` · últ. respuesta ${timeAgo(h.lastOut)}` : ' · sin respuestas aún'
  return { color: hrs <= 72 ? 'var(--status-healthy)' : 'var(--status-attention)', label: `en vivo · últ. mensaje ${timeAgo(h.lastIn)}${out}` }
}

function ConfigTab({ buList }: { buList: BU[] }) {
  const [botEnabled, setBotEnabled] = useState(false)
  const [waNumber, setWaNumber] = useState('')
  const [configs, setConfigs] = useState<VenueConfig[]>([])
  const [payments, setPayments] = useState<PaymentConfig[]>([])
  const [infos, setInfos] = useState<VenueBotInfo[]>([])
  const [faqTableMissing, setFaqTableMissing] = useState(false)
  const [health, setHealth] = useState<Record<string, ChanHealth>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: settings }, { data: cfgs }, { data: pays }, infoRes, { data: convs }] = await Promise.all([
      supabase.from('app_settings').select('key, value').in('key', ['bot_enabled', 'bot_holding_wa_number']),
      supabase.from('bot_venue_config').select('*').order('channel'),
      supabase.from('venue_payment_config').select('*'),
      supabase.from('venue_bot_info').select('*'),
      supabase.from('bot_conversations').select('bu_id, channel, last_message_at, last_sender, updated_at').eq('is_simulated', false).order('last_message_at', { ascending: false }).limit(300),
    ])
    for (const s of settings ?? []) {
      if (s.key === 'bot_enabled') setBotEnabled(s.value === 'true')
      if (s.key === 'bot_holding_wa_number') setWaNumber(s.value ?? '')
    }
    setConfigs((cfgs ?? []) as VenueConfig[])
    setPayments((pays ?? []) as PaymentConfig[])
    if (infoRes.error) setFaqTableMissing(true)
    else setInfos((infoRes.data ?? []) as VenueBotInfo[])
    // Salud por canal: última entrada y última respuesta, por venue y global
    const h: Record<string, ChanHealth> = {}
    const bump = (key: string, field: 'lastIn' | 'lastOut', val: string | null) => {
      if (!val) return
      const e = (h[key] ??= { lastIn: null, lastOut: null })
      if (!e[field] || val > e[field]!) e[field] = val
    }
    for (const c of convs ?? []) {
      for (const key of [`${c.bu_id ?? 'any'}:${c.channel}`, `any:${c.channel}`]) {
        bump(key, 'lastIn', c.last_message_at)
        if (c.last_sender === 'bot' || c.last_sender === 'agent') bump(key, 'lastOut', c.updated_at)
      }
    }
    setHealth(h)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleGlobal() {
    const next = !botEnabled
    setBotEnabled(next)
    const { error } = await supabase.from('app_settings').upsert({ key: 'bot_enabled', value: String(next) }, { onConflict: 'key' })
    if (error) { setBotEnabled(!next); showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    logActivity(next ? 'concierge_enabled' : 'concierge_disabled', 'app_settings', 'bot_enabled', {})
    showToast(next ? 'Concierge encendido (global).' : 'Concierge apagado (kill switch).', next ? 'success' : 'info')
  }

  async function saveWaNumber() {
    const { error } = await supabase.from('app_settings').upsert({ key: 'bot_holding_wa_number', value: waNumber.trim() }, { onConflict: 'key' })
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    showToast('Número de WhatsApp guardado.', 'success')
  }

  if (loading) return <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Cargando…</p>

  const anyEnabled = (ch: Channel) => configs.some(c => c.channel === ch && c.enabled)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Global: kill switch + conexión live por canal */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Power size={16} style={{ color: botEnabled ? 'var(--status-healthy)' : 'var(--status-risk)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Kill switch global</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Apaga el bot en TODOS los venues y canales al instante.</div>
          </div>
          <button onClick={toggleGlobal}
            style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: botEnabled ? 'color-mix(in srgb, var(--status-healthy) 15%, transparent)' : 'var(--bg-elevated)', color: botEnabled ? 'var(--status-healthy)' : 'var(--text-tertiary)' }}>
            {botEnabled ? 'ENCENDIDO' : 'APAGADO'}
          </button>
        </div>

        {/* Conexión live: tráfico real por canal (webhook entrando + bot respondiendo) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
          {(['whatsapp', 'instagram'] as Channel[]).map(ch => {
            const Icon = CHANNEL_ICON[ch]
            const st = chanStatus(health[`any:${ch}`], botEnabled && anyEnabled(ch))
            return (
              <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                <Icon size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', width: 82 }}>{CHANNEL_LABEL[ch]}</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{st.label}</span>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>WhatsApp del holding</label>
            <input value={waNumber} onChange={e => setWaNumber(e.target.value)} placeholder="+52 669 …" inputMode="tel" className="num"
              style={{ width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button onClick={saveWaNumber} style={{ minHeight: 44, padding: '0 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
        </div>
      </div>

      {/* Una caja por venue */}
      {buList.map(bu => (
        <VenueBox key={bu.id} bu={bu}
          cfgs={configs.filter(c => c.bu_id === bu.id)}
          pay={payments.find(p => p.bu_id === bu.id) ?? null}
          info={infos.find(i => i.bu_id === bu.id) ?? null}
          health={health} botEnabled={botEnabled} faqTableMissing={faqTableMissing}
          onReload={load} />
      ))}
    </div>
  )
}

// ─── Caja de venue: header slim + bullets expandibles ────────────────────────
function VenueBox({ bu, cfgs, pay, info, health, botEnabled, faqTableMissing, onReload }: {
  bu: BU
  cfgs: VenueConfig[]
  pay: PaymentConfig | null
  info: VenueBotInfo | null
  health: Record<string, ChanHealth>
  botEnabled: boolean
  faqTableMissing: boolean
  onReload: () => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const first = cfgs[0]
  const [voz, setVoz] = useState('')
  const [ritmo, setRitmo] = useState({ delay: 45, followup: 5, escalate: 12, winStart: '11:00', winEnd: '23:00' })
  const [faq, setFaq] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVoz(cfgs.find(c => c.persona_note)?.persona_note ?? '')
    if (first) setRitmo({
      delay: first.first_reply_delay_seconds, followup: first.followup_after_minutes,
      escalate: first.escalate_over_pax, winStart: first.followup_window_start.slice(0, 5), winEnd: first.followup_window_end.slice(0, 5),
    })
    setFaq(info?.faq ?? '')
  }, [cfgs.length, first?.id, info?.bu_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  // Estado de cada bullet: ● = el Concierge YA tiene esta info · ○ = falta
  const bullets: { key: string; label: string; filled: boolean }[] = [
    { key: 'canales', label: 'Canales', filled: cfgs.some(c => c.enabled) },
    { key: 'voz', label: 'Voz', filled: cfgs.some(c => (c.persona_note ?? '').trim().length > 0) },
    { key: 'ritmo', label: 'Ritmo', filled: cfgs.length > 0 },
    { key: 'apartados', label: 'Info bancaria', filled: !!pay?.clabe && !!pay?.active },
    { key: 'faq', label: 'FAQ', filled: !!info?.faq?.trim() },
  ]

  // Semáforo del venue: verde si algún canal activo tiene tráfico reciente
  const liveColors = (['instagram', 'whatsapp'] as Channel[]).map(ch => {
    const cfg = cfgs.find(c => c.channel === ch)
    return chanStatus(health[`${bu.id}:${ch}`] ?? (ch === 'whatsapp' ? health['any:whatsapp'] : undefined), botEnabled && !!cfg?.enabled).color
  })
  const venueDot = liveColors.includes('var(--status-healthy)') ? 'var(--status-healthy)'
    : liveColors.includes('var(--status-attention)') ? 'var(--status-attention)' : 'var(--border-strong)'

  const ids = cfgs.map(c => c.id)

  async function toggleChannel(ch: Channel) {
    const cfg = cfgs.find(c => c.channel === ch)
    if (cfg) {
      const { error } = await supabase.from('bot_venue_config').update({ enabled: !cfg.enabled }).eq('id', cfg.id)
      if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
      logActivity('concierge_config_saved', 'bot_venue_config', cfg.id, { bu: bu.code, channel: ch, enabled: !cfg.enabled })
    } else {
      const { error } = await supabase.from('bot_venue_config').insert({ bu_id: bu.id, channel: ch, enabled: true })
      if (error) { showToast(`No se pudo habilitar: ${error.message}`, 'error'); return }
      logActivity('concierge_config_saved', 'bot_venue_config', undefined, { bu: bu.code, channel: ch, enabled: true })
    }
    onReload()
  }

  async function saveAccount(cfg: VenueConfig, value: string) {
    const v = value.trim() || null
    if (v === cfg.external_account) return
    const { error } = await supabase.from('bot_venue_config').update({ external_account: v }).eq('id', cfg.id)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    showToast('Cuenta conectada guardada.', 'success')
    onReload()
  }

  // Voz y Ritmo se editan a nivel venue y se escriben en TODOS sus canales
  async function saveVoz() {
    if (!ids.length) { showToast('Primero habilita un canal en este venue.', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('bot_venue_config').update({ persona_note: voz.trim() || null }).in('id', ids)
    setSaving(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    logActivity('concierge_config_saved', 'bot_venue_config', first?.id, { bu: bu.code, campo: 'voz' })
    showToast('Voz del venue guardada — el Concierge ya la usa.', 'success')
    onReload()
  }

  async function saveRitmo() {
    if (!ids.length) { showToast('Primero habilita un canal en este venue.', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('bot_venue_config').update({
      first_reply_delay_seconds: ritmo.delay, followup_after_minutes: ritmo.followup,
      escalate_over_pax: ritmo.escalate, followup_window_start: ritmo.winStart, followup_window_end: ritmo.winEnd,
    }).in('id', ids)
    setSaving(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    logActivity('concierge_config_saved', 'bot_venue_config', first?.id, { bu: bu.code, campo: 'ritmo' })
    showToast('Ritmo guardado — el Concierge ya lo usa.', 'success')
    onReload()
  }

  async function saveFaq() {
    const { error } = await supabase.from('venue_bot_info').upsert({ bu_id: bu.id, faq: faq.trim() || null }, { onConflict: 'bu_id' })
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    logActivity('venue_faq_saved', 'venue_bot_info', bu.id, { bu: bu.code })
    showToast('FAQ guardado.', 'success')
    onReload()
  }

  async function enablePayments() {
    const { error } = await supabase.from('venue_payment_config').insert({ bu_id: bu.id })
    if (error) { showToast(`No se pudo habilitar: ${error.message}`, 'error'); return }
    onReload()
  }

  const inp: React.CSSProperties = { width: '100%', minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
  const okLine = (txt: string) => (
    <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent)', margin: '8px 0 0' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} /> {txt}
    </p>
  )

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
      {/* Header slim del venue */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span title="Conexión del venue" style={{ width: 9, height: 9, borderRadius: '50%', background: venueDot, flexShrink: 0 }} />
        <BUChip code={bu.code} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{bu.name}</span>
      </div>

      {/* Bullets: ● info que el Concierge ya tiene · ○ pendiente — tap expande */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {bullets.map(b => {
          const isOpen = open.has(b.key)
          return (
            <button key={b.key} onClick={() => toggle(b.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: isOpen ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border-default)'}`, color: isOpen ? 'var(--accent)' : b.filled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.filled ? 'var(--accent)' : 'transparent', border: b.filled ? 'none' : '1px solid var(--border-strong)', flexShrink: 0 }} />
              {b.label}
            </button>
          )
        })}
      </div>

      {/* ── Canales: toggle por canal + conexión live + cuenta conectada ── */}
      {open.has('canales') && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
          {(['instagram', 'whatsapp'] as Channel[]).map(ch => {
            const cfg = cfgs.find(c => c.channel === ch)
            const Icon = CHANNEL_ICON[ch]
            const st = chanStatus(health[`${bu.id}:${ch}`] ?? (ch === 'whatsapp' ? health['any:whatsapp'] : undefined), botEnabled && !!cfg?.enabled)
            return (
              <div key={ch} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{CHANNEL_LABEL[ch]}</span>
                  <button onClick={() => toggleChannel(ch)}
                    style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer', background: cfg?.enabled ? 'color-mix(in srgb, var(--status-healthy) 15%, transparent)' : 'var(--bg-base)', color: cfg?.enabled ? 'var(--status-healthy)' : 'var(--text-tertiary)' }}>
                    {cfg?.enabled ? 'ACTIVO' : cfg ? 'INACTIVO' : 'HABILITAR'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 22 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                  <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{st.label}</span>
                </div>
                {cfg && ch === 'instagram' && (
                  <div style={{ paddingLeft: 22 }}>
                    <label style={lbl}>Cuenta conectada (IG account id)</label>
                    <input defaultValue={cfg.external_account ?? ''} placeholder="Se llena al conectar Meta" className="num"
                      onBlur={e => saveAccount(cfg, e.target.value)} style={inp} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Voz del venue (aplica a todos sus canales) ── */}
      {open.has('voz') && (
        <div style={{ marginTop: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
          <label style={lbl}>Voz del bot — personalidad de {bu.name}</label>
          <textarea value={voz} onChange={e => setVoz(e.target.value)} rows={4}
            placeholder="Tono, muletillas, qué ofrecer primero…"
            style={{ ...inp, minHeight: 90, padding: '10px 12px', resize: 'vertical' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <button onClick={saveVoz} disabled={saving}
              style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
            {bullets[1].filled && okLine('El Concierge ya tiene esta información')}
          </div>
        </div>
      )}

      {/* ── Ritmo (aplica a todos sus canales) ── */}
      {open.has('ritmo') && (
        <div style={{ marginTop: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div><label style={lbl}>1a respuesta (seg)</label>
              <input type="number" min={0} value={ritmo.delay} onChange={e => setRitmo(r => ({ ...r, delay: Math.max(0, Number(e.target.value)) }))} className="num" style={inp} /></div>
            <div><label style={lbl}>Seguimiento (min)</label>
              <input type="number" min={0} value={ritmo.followup} onChange={e => setRitmo(r => ({ ...r, followup: Math.max(0, Number(e.target.value)) }))} className="num" style={inp} /></div>
            <div><label style={lbl}>Escalar si pax &gt;</label>
              <input type="number" min={1} value={ritmo.escalate} onChange={e => setRitmo(r => ({ ...r, escalate: Math.max(1, Number(e.target.value)) }))} className="num" style={inp} /></div>
            <div><label style={lbl}>Ventana cortesía</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="time" value={ritmo.winStart} onChange={e => setRitmo(r => ({ ...r, winStart: e.target.value }))} className="num" style={{ ...inp, width: 'auto', flex: 1 }} />
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>–</span>
                <input type="time" value={ritmo.winEnd} onChange={e => setRitmo(r => ({ ...r, winEnd: e.target.value }))} className="num" style={{ ...inp, width: 'auto', flex: 1 }} />
              </div></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button onClick={saveRitmo} disabled={saving}
              style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
            {cfgs.length > 0 && okLine('El Concierge ya tiene esta información')}
          </div>
        </div>
      )}

      {/* ── Info bancaria / Apartados ── */}
      {open.has('apartados') && (
        <div style={{ marginTop: 12 }}>
          {pay ? (
            <>
              <PaymentCard row={pay} bu={bu} onSaved={onReload} />
              {bullets[3].filled && okLine('El Concierge ya cobra apartados con estos datos')}
            </>
          ) : (
            <button onClick={enablePayments}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 42, padding: '0 14px', borderRadius: 999, border: '1px dashed var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={13} /> Configurar info bancaria de {bu.code}
            </button>
          )}
        </div>
      )}

      {/* ── FAQ del venue (el bot la usará a partir del próximo deploy) ── */}
      {open.has('faq') && (
        <div style={{ marginTop: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
          {faqTableMissing ? (
            <p style={{ fontSize: 12, color: 'var(--status-attention)', margin: 0 }}>Falta correr el SQL de venue_bot_info en Supabase para activar esta sección.</p>
          ) : (
            <>
              <label style={lbl}>FAQ del venue — horarios, ubicación, estacionamiento, dress code, menores…</label>
              <textarea value={faq} onChange={e => setFaq(e.target.value)} rows={5}
                placeholder={'Ej.\nHorario: mié–sáb 6pm–2am\nUbicación: Av. del Mar 123, con estacionamiento\nDress code: casual elegante\nMenores: no después de las 8pm'}
                style={{ ...inp, minHeight: 110, padding: '10px 12px', resize: 'vertical' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={saveFaq}
                  style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>El bot la usará a partir del próximo deploy (fase del viernes).</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Apartados (embebido en la caja del venue) ───────────────────────────────
function PaymentCard({ row, bu, onSaved }: { row: PaymentConfig; bu?: BU; onSaved: () => void }) {
  const [form, setForm] = useState(row)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(row)
  useEffect(() => { setForm(row) }, [row])

  const clabeOk = !form.clabe || /^\d{18}$/.test(form.clabe)

  async function save() {
    if (!clabeOk) { showToast('La CLABE debe tener 18 dígitos.', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('venue_payment_config').update({
      clabe: form.clabe || null, bank_name: form.bank_name || null, beneficiary: form.beneficiary || null,
      deposit_over_pax: form.deposit_over_pax, deposit_per_person: form.deposit_per_person,
      deposit_fixed: form.deposit_fixed, instructions: form.instructions || null, active: form.active,
    }).eq('bu_id', row.bu_id)
    setSaving(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    logActivity('venue_payment_config_saved', 'venue_payment_config', row.bu_id, { bu: bu?.code, active: form.active })
    showToast(`Depósitos de ${bu?.code ?? ''} guardados.`, 'success')
    onSaved()
  }

  const inp: React.CSSProperties = { width: '100%', minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Apartados (depósitos)</span>
        <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
          style={{ marginLeft: 'auto', minHeight: 34, padding: '0 12px', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer', background: form.active ? 'color-mix(in srgb, var(--status-healthy) 15%, transparent)' : 'var(--bg-base)', color: form.active ? 'var(--status-healthy)' : 'var(--text-tertiary)' }}>
          {form.active ? 'ACTIVO' : 'INACTIVO'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>CLABE (18 dígitos)</label>
          <input value={form.clabe ?? ''} inputMode="numeric" maxLength={18} className="num"
            onChange={e => setForm(f => ({ ...f, clabe: e.target.value.replace(/\D/g, '') || null }))}
            style={{ ...inp, borderColor: clabeOk ? 'var(--border-subtle)' : 'var(--status-risk)' }} />
        </div>
        <div>
          <label style={lbl}>Banco</label>
          <input value={form.bank_name ?? ''} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value || null }))} style={inp} />
        </div>
        <div>
          <label style={lbl}>Beneficiario</label>
          <input value={form.beneficiary ?? ''} onChange={e => setForm(f => ({ ...f, beneficiary: e.target.value || null }))} style={inp} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Apartado desde (pax)</label>
          <input type="number" min={1} value={form.deposit_over_pax} className="num"
            onChange={e => setForm(f => ({ ...f, deposit_over_pax: Math.max(1, Number(e.target.value)) }))} style={inp} />
        </div>
        <div>
          <label style={lbl}>$ MXN por persona</label>
          <input type="number" min={0} value={form.deposit_per_person ?? ''} placeholder="—" className="num"
            onChange={e => setForm(f => ({ ...f, deposit_per_person: e.target.value ? Number(e.target.value) : null }))} style={inp} />
        </div>
        <div>
          <label style={lbl}>$ MXN fijo por reserva</label>
          <input type="number" min={0} value={form.deposit_fixed ?? ''} placeholder="—" className="num"
            onChange={e => setForm(f => ({ ...f, deposit_fixed: e.target.value ? Number(e.target.value) : null }))} style={inp} />
        </div>
      </div>
      <div>
        <label style={lbl}>Instrucciones extra para el bot (opcional)</label>
        <input value={form.instructions ?? ''} placeholder='Ej. "El apartado se descuenta de la cuenta"'
          onChange={e => setForm(f => ({ ...f, instructions: e.target.value || null }))} style={inp} />
      </div>

      {dirty && (
        <button onClick={save} disabled={saving}
          style={{ marginTop: 10, minHeight: 42, padding: '0 18px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Talento — booking interno de DJs por venue (Ops/Master).
// Agenda semanal + directorio con fee registrado. El Concierge la usa para
// vender la programación y para reclutar DJs que escriben por DM.
// ═════════════════════════════════════════════════════════════════════════════
interface DJ {
  id: string
  stage_name: string
  real_name: string | null
  phone: string | null
  instagram: string | null
  city: string | null
  genres: string[]
  base_fee: number | null
  fee_notes: string | null
  rider: string | null
  links: string | null
  rating: number | null
  status: 'active' | 'vetoed'
  source: 'manual' | 'concierge'
}

// Directorio unificado: un DJ es un crm_contact con contact_type='DJ'.
// La UI de Talento conserva su lenguaje (stage_name, status) vía este adaptador.
const DJ_SELECT = 'id, full_name, real_name, phone, instagram, city, genres, base_fee, fee_notes, rider, links, rating, vetoed, source'
// deno-lint-ignore no-explicit-any
function contactToDj(r: any): DJ {
  return {
    id: r.id, stage_name: r.full_name, real_name: r.real_name, phone: r.phone,
    instagram: r.instagram, city: r.city, genres: r.genres ?? [], base_fee: r.base_fee,
    fee_notes: r.fee_notes, rider: r.rider, links: r.links, rating: r.rating,
    status: r.vetoed ? 'vetoed' : 'active', source: r.source ?? 'manual',
  }
}
interface DJBooking {
  id: string
  dj_id: string
  bu_id: string
  date: string
  start_time: string
  end_time: string | null
  fee: number
  paid: boolean
  special_requests: string | null
  status: 'tentative' | 'confirmed' | 'played' | 'cancelled' | 'no_show'
  notes: string | null
}
const BOOKING_META: Record<DJBooking['status'], { label: string; tone: StatusTone }> = {
  tentative: { label: 'Tentativo', tone: 'neutral' },
  confirmed: { label: 'Confirmado', tone: 'accent' },
  played:    { label: 'Tocó',       tone: 'healthy' },
  cancelled: { label: 'Cancelado',  tone: 'neutral' },
  no_show:   { label: 'No llegó',   tone: 'risk' },
}
const DAYS_TAL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const mxnTal = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

function isoTal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysTal(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoTal(d)
}

function TalentoTab({ buList, userId, isMobile }: { buList: BU[]; userId?: string; isMobile: boolean }) {
  const today = isoTal(new Date())
  const [buId, setBuId] = useState(() => localStorage.getItem('hog_res_last_bu') ?? '')
  const [weekStart, setWeekStart] = useState(() => addDaysTal(today, -new Date(today + 'T00:00:00').getDay()))
  const [djs, setDjs] = useState<DJ[]>([])
  const [bookings, setBookings] = useState<DJBooking[]>([])
  const [monthSpend, setMonthSpend] = useState(0)
  const [monthCount, setMonthCount] = useState(0)
  const [search, setSearch] = useState('')
  const [editingDj, setEditingDj] = useState<DJ | 'new' | null>(null)
  const [bookingFor, setBookingFor] = useState<{ date: string; booking?: DJBooking } | null>(null)

  useEffect(() => {
    if (!buId && buList.length) setBuId(buList[0].id)
  }, [buList, buId])

  const load = useCallback(async () => {
    if (!buId) return
    const monthIni = new Date()
    const mStart = `${monthIni.getFullYear()}-${String(monthIni.getMonth() + 1).padStart(2, '0')}-01`
    const mEnd = isoTal(new Date(monthIni.getFullYear(), monthIni.getMonth() + 1, 0))
    const [{ data: d }, { data: b }, { data: m }] = await Promise.all([
      supabase.from('crm_contacts').select(DJ_SELECT).eq('contact_type', 'DJ').order('full_name'),
      supabase.from('dj_bookings').select('*').eq('bu_id', buId).gte('date', weekStart).lte('date', addDaysTal(weekStart, 6)),
      supabase.from('dj_bookings').select('fee, status').eq('bu_id', buId).gte('date', mStart).lte('date', mEnd).in('status', ['confirmed', 'played']),
    ])
    setDjs((d ?? []).map(contactToDj))
    setBookings((b ?? []) as DJBooking[])
    setMonthSpend((m ?? []).reduce((s, r) => s + Number(r.fee ?? 0), 0))
    setMonthCount((m ?? []).length)
  }, [buId, weekStart])

  useEffect(() => { load() }, [load])

  const djMap = useMemo(() => Object.fromEntries(djs.map(d => [d.id, d])), [djs])
  const filteredDjs = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return djs
    return djs.filter(d => d.stage_name.toLowerCase().includes(q) || d.genres.some(g => g.toLowerCase().includes(q)) || (d.city ?? '').toLowerCase().includes(q))
  }, [djs, search])

  const buCode = buList.find(b => b.id === buId)?.code ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Venue + semana */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select value={buId} onChange={e => setBuId(e.target.value)}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: 13, fontWeight: 600, minHeight: 44, outline: 'none', cursor: 'pointer' }}>
          {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <button onClick={() => setWeekStart(addDaysTal(weekStart, -7))} aria-label="Semana anterior" style={talBtn}><ChevronLeft size={15} /></button>
          <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 6px', whiteSpace: 'nowrap' }}>
            {new Date(weekStart + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – {new Date(addDaysTal(weekStart, 6) + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
          </span>
          <button onClick={() => setWeekStart(addDaysTal(weekStart, 7))} aria-label="Semana siguiente" style={talBtn}><ChevronRight size={15} /></button>
        </div>
      </div>

      {/* KPIs de gasto */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        <KPITile label={`Gasto ${buCode} (mes)`} value={mxnTal.format(monthSpend)} color="var(--accent)" />
        <KPITile label="Tocadas (mes)" value={String(monthCount)} />
        <KPITile label="Fee promedio" value={monthCount ? mxnTal.format(monthSpend / monthCount) : '—'} />
        <KPITile label="DJs en base" value={String(djs.length)} />
      </div>

      {/* Agenda semanal */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(7, 1fr)', gap: 8 }}>
        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDaysTal(weekStart, i)
          const rows = bookings.filter(b => b.date === d && b.status !== 'cancelled')
          const isToday = d === today
          return (
            <div key={d} style={{ background: 'var(--bg-surface)', border: isToday ? '1px solid var(--accent-border)' : 'none', borderRadius: 'var(--radius-md)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 96 }}>
              <div className="num" style={{ fontSize: 11, color: isToday ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: 700 }}>
                {DAYS_TAL[new Date(d + 'T00:00:00').getDay()]} {new Date(d + 'T00:00:00').getDate()}
              </div>
              {rows.map(b => (
                <button key={b.id} onClick={() => setBookingFor({ date: d, booking: b })}
                  style={{ textAlign: 'left', background: 'var(--bg-elevated)', border: `1px solid ${b.status === 'confirmed' ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-sm)', padding: '6px 8px', cursor: 'pointer', opacity: b.status === 'no_show' ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Music size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{djMap[b.dj_id]?.stage_name ?? 'DJ'}</span>
                  </div>
                  <div className="num" style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {b.start_time} · {mxnTal.format(b.fee)}{b.paid ? ' ✓' : ''}
                  </div>
                </button>
              ))}
              <button onClick={() => setBookingFor({ date: d })}
                style={{ marginTop: 'auto', minHeight: 32, borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer' }}>
                + DJ
              </button>
            </div>
          )
        })}
      </div>

      {/* Directorio */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Directorio de DJs</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        <button onClick={() => setEditingDj('new')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 40, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={13} /> DJ
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, género o ciudad…"
          style={{ width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px 0 32px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredDjs.length === 0 ? (
          <EmptyStateV2 icon={<Music size={26} />} title="Sin DJs aún. Da de alta al primero — o deja que el Concierge los recolecte de los DMs." actionLabel="+ Agregar DJ" onAction={() => setEditingDj('new')} />
        ) : filteredDjs.map(d => (
          <button key={d.id} onClick={() => setEditingDj(d)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--bg-surface)', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 12px', cursor: 'pointer', minHeight: 44, opacity: d.status === 'vetoed' ? 0.5 : 1 }}>
            <Music size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{d.stage_name}</span>
                {d.rating != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--accent)' }}><Star size={10} /> {d.rating}</span>}
                {d.source === 'concierge' && <StatusBadgeV2 tone="accent" label="vía Concierge" />}
                {d.status === 'vetoed' && <StatusBadgeV2 tone="risk" label="Vetado" />}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[d.genres.join(', '), d.city, d.instagram ? `@${d.instagram.replace(/^@/, '')}` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className="num" style={{ fontSize: 13, fontWeight: 700, color: d.base_fee ? 'var(--status-healthy)' : 'var(--text-tertiary)', flexShrink: 0 }}>
              {d.base_fee ? mxnTal.format(d.base_fee) : 'sin fee'}
            </span>
          </button>
        ))}
      </div>

      {editingDj && (
        <DJSheet dj={editingDj === 'new' ? null : editingDj} buList={buList} userId={userId} isMobile={isMobile}
          onClose={() => setEditingDj(null)} onSaved={() => { setEditingDj(null); load() }} />
      )}
      {bookingFor && buId && (
        <BookingSheet date={bookingFor.date} booking={bookingFor.booking} buId={buId} buCode={buCode} djs={djs} userId={userId} isMobile={isMobile}
          onClose={() => setBookingFor(null)} onSaved={() => { setBookingFor(null); load() }} />
      )}
    </div>
  )
}

const talBtn: React.CSSProperties = {
  width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)', cursor: 'pointer',
}

// ─── Alta/edición de DJ — lo esencial en 20 segundos, lo demás opcional ──────
function DJSheet({ dj, buList, userId, isMobile, onClose, onSaved }: {
  dj: DJ | null
  buList: BU[]
  userId?: string
  isMobile: boolean
  onClose: () => void
  onSaved: () => void
}) {
  // Log interno del DJ: cuántas veces tocó y cuánto cobró por cada fecha
  const [history, setHistory] = useState<(DJBooking & { buCode: string })[]>([])
  useEffect(() => {
    if (!dj) return
    supabase.from('dj_bookings').select('*').eq('dj_id', dj.id).order('date', { ascending: false }).limit(40)
      .then(({ data }) => {
        const buMapL = Object.fromEntries(buList.map(b => [b.id, b.code]))
        setHistory(((data ?? []) as DJBooking[]).map(b => ({ ...b, buCode: buMapL[b.bu_id] ?? '—' })))
      })
  }, [dj, buList])
  const played = history.filter(h => h.status === 'played')
  const totalCobrado = played.reduce((s, h) => s + Number(h.fee ?? 0), 0)
  const [form, setForm] = useState({
    stage_name: dj?.stage_name ?? '', real_name: dj?.real_name ?? '', phone: dj?.phone ?? '',
    instagram: dj?.instagram ?? '', city: dj?.city ?? '', genres: dj?.genres.join(', ') ?? '',
    base_fee: dj?.base_fee != null ? String(dj.base_fee) : '', fee_notes: dj?.fee_notes ?? '',
    rider: dj?.rider ?? '', links: dj?.links ?? '', rating: dj?.rating ?? null as number | null,
    status: dj?.status ?? 'active' as DJ['status'],
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.stage_name.trim()) { showToast('El nombre artístico es obligatorio.', 'error'); return }
    setSaving(true)
    const row = {
      full_name: form.stage_name.trim(), real_name: form.real_name.trim() || null,
      phone: form.phone.trim() || null, instagram: form.instagram.trim().replace(/^@/, '') || null,
      city: form.city.trim() || null,
      genres: form.genres.split(',').map(g => g.trim()).filter(Boolean),
      base_fee: form.base_fee ? Number(form.base_fee) : null, fee_notes: form.fee_notes.trim() || null,
      rider: form.rider.trim() || null, links: form.links.trim() || null,
      rating: form.rating, vetoed: form.status === 'vetoed', contact_type: 'DJ',
    }
    const { error } = dj
      ? await supabase.from('crm_contacts').update(row).eq('id', dj.id)
      : await supabase.from('crm_contacts').insert({ ...row, created_by: userId ?? null })
    setSaving(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    logActivity(dj ? 'dj_updated' : 'dj_created', 'dj', dj?.id, { stage_name: row.full_name, fee: row.base_fee })
    showToast(dj ? 'DJ actualizado.' : 'DJ agregado a la base.', 'success')
    onSaved()
  }

  const inp: React.CSSProperties = { width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }
  const lb: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={440}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>{dj ? dj.stage_name : 'Nuevo DJ'}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={lb}>Nombre artístico *</label><input value={form.stage_name} autoFocus={!dj} onChange={e => setForm(f => ({ ...f, stage_name: e.target.value }))} style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lb}>Fee base (MXN)</label><input type="number" inputMode="numeric" value={form.base_fee} onChange={e => setForm(f => ({ ...f, base_fee: e.target.value }))} className="num" style={inp} /></div>
            <div><label style={lb}>Teléfono</label><input value={form.phone} inputMode="tel" onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="num" style={inp} /></div>
          </div>
          <div><label style={lb}>Géneros (separados por coma)</label><input value={form.genres} placeholder="house, techno" onChange={e => setForm(f => ({ ...f, genres: e.target.value }))} style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lb}>Instagram</label><input value={form.instagram} placeholder="@dj" onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} style={inp} /></div>
            <div><label style={lb}>Ciudad</label><input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={inp} /></div>
          </div>
          <div><label style={lb}>Nombre real</label><input value={form.real_name} onChange={e => setForm(f => ({ ...f, real_name: e.target.value }))} style={inp} /></div>
          <div><label style={lb}>Notas de fee</label><input value={form.fee_notes} placeholder='"negociable entre semana"' onChange={e => setForm(f => ({ ...f, fee_notes: e.target.value }))} style={inp} /></div>
          <div><label style={lb}>Rider / peticiones típicas</label><textarea value={form.rider} rows={2} onChange={e => setForm(f => ({ ...f, rider: e.target.value }))} style={{ ...inp, minHeight: 52, padding: '8px 10px', resize: 'vertical' }} /></div>
          <div><label style={lb}>Links (mixes, press kit)</label><input value={form.links} onChange={e => setForm(f => ({ ...f, links: e.target.value }))} style={inp} /></div>
          <div>
            <label style={lb}>Rating interno</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setForm(f => ({ ...f, rating: f.rating === n ? null : n }))} aria-label={`${n} estrellas`}
                  style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', border: 'none', background: 'none', cursor: 'pointer', color: form.rating != null && n <= form.rating ? 'var(--accent)' : 'var(--border-strong)' }}>
                  <Star size={18} fill={form.rating != null && n <= form.rating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </div>
          {dj && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 40 }}>
              <input type="checkbox" checked={form.status === 'vetoed'} onChange={e => setForm(f => ({ ...f, status: e.target.checked ? 'vetoed' : 'active' }))} style={{ accentColor: 'var(--status-risk)', width: 16, height: 16 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Vetado (no volver a bookear)</span>
            </label>
          )}

          {/* Log interno: cuántas tocó y cuánto cobró por fecha */}
          {dj && history.length > 0 && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Historial</span>
                <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{played.length} {played.length === 1 ? 'tocada' : 'tocadas'}</span>
                <span className="num" style={{ fontSize: 12, color: 'var(--status-healthy)', fontWeight: 700 }}>{mxnTal.format(totalCobrado)} cobrado</span>
                {played.length > 0 && <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>~{mxnTal.format(totalCobrado / played.length)} c/u</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto' }}>
                {history.map(h => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, opacity: h.status === 'cancelled' || h.status === 'no_show' ? 0.55 : 1 }}>
                    <span className="num" style={{ color: 'var(--text-secondary)', width: 78, flexShrink: 0 }}>
                      {new Date(h.date + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                    <BUChip code={h.buCode} size="sm" />
                    <span className="num" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{mxnTal.format(Number(h.fee ?? 0))}</span>
                    {h.paid && <span style={{ color: 'var(--status-healthy)', fontSize: 10 }}>✓ pagado</span>}
                    <span style={{ marginLeft: 'auto' }}><StatusBadgeV2 tone={BOOKING_META[h.status].tone} label={BOOKING_META[h.status].label} /></span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={save} disabled={saving || !form.stage_name.trim()}
            style={{ minHeight: 46, borderRadius: 999, border: 'none', background: form.stage_name.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: form.stage_name.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Guardando…' : dj ? 'Guardar cambios' : 'Agregar DJ'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// ─── Booking de una tocada: DJ + fee (prellenado) + rider de la fecha ────────
function BookingSheet({ date, booking, buId, buCode, djs, userId, isMobile, onClose, onSaved }: {
  date: string
  booking?: DJBooking
  buId: string
  buCode: string
  djs: DJ[]
  userId?: string
  isMobile: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [djId, setDjId] = useState(booking?.dj_id ?? '')
  const [djQuery, setDjQuery] = useState('')
  const [startTime, setStartTime] = useState(booking?.start_time ?? '22:00')
  const [fee, setFee] = useState(booking ? String(booking.fee) : '')
  const [paid, setPaid] = useState(booking?.paid ?? false)
  const [status, setStatus] = useState<DJBooking['status']>(booking?.status ?? 'confirmed')
  const [requests, setRequests] = useState(booking?.special_requests ?? '')
  const [saving, setSaving] = useState(false)
  // Alta de DJ sin salir del booking: el DJ nuevo se crea aquí mismo
  const [localDjs, setLocalDjs] = useState<DJ[]>(djs)
  const [quickCreating, setQuickCreating] = useState(false)
  const [quickFee, setQuickFee] = useState('')
  const [quickGenres, setQuickGenres] = useState('')

  const dj = localDjs.find(d => d.id === djId)
  const matches = useMemo(() => {
    const q = djQuery.trim().toLowerCase()
    if (!q) return localDjs.filter(d => d.status === 'active').slice(0, 6)
    return localDjs.filter(d => d.status === 'active' && (d.stage_name.toLowerCase().includes(q) || d.genres.some(g => g.toLowerCase().includes(q)))).slice(0, 6)
  }, [localDjs, djQuery])

  async function quickCreateDj() {
    const name = djQuery.trim()
    if (!name) return
    const { data: nuevo, error } = await supabase.from('crm_contacts').insert({
      full_name: name, contact_type: 'DJ',
      base_fee: quickFee ? Number(quickFee) : null,
      genres: quickGenres.split(',').map(g => g.trim()).filter(Boolean),
      created_by: userId ?? null,
    }).select(DJ_SELECT).single()
    if (error) { showToast(`No se pudo crear: ${error.message}`, 'error'); return }
    logActivity('dj_created', 'dj', nuevo.id, { stage_name: name, fee: quickFee ? Number(quickFee) : null, via: 'booking' })
    setLocalDjs(prev => [...prev, contactToDj(nuevo)])
    setDjId(nuevo.id)
    if (quickFee && !fee) setFee(quickFee)
    setQuickCreating(false); setQuickFee(''); setQuickGenres('')
    showToast(`${name} agregado a la base.`, 'success')
  }

  // Al elegir DJ, el fee se prellena con su base (editable — cada fecha se negocia)
  useEffect(() => {
    if (!booking && dj?.base_fee != null && !fee) setFee(String(dj.base_fee))
  }, [djId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!djId) { showToast('Elige al DJ.', 'error'); return }
    setSaving(true)
    const row = {
      dj_id: djId, bu_id: buId, date, start_time: startTime, fee: Number(fee || 0),
      paid, status, special_requests: requests.trim() || null,
    }
    const { error } = booking
      ? await supabase.from('dj_bookings').update(row).eq('id', booking.id)
      : await supabase.from('dj_bookings').insert({ ...row, created_by: userId ?? null })
    setSaving(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    const djName = dj?.stage_name ?? 'DJ'
    logActivity(booking ? 'dj_booking_updated' : 'dj_booking_created', 'dj_booking', booking?.id, { dj: djName, bu: buCode, date, fee: Number(fee || 0), status })
    if (!booking && status === 'confirmed') {
      notifySlack(`🎧 *DJ confirmado* — ${buCode}\n${djName} · ${new Date(date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} · ${startTime} · ${mxnTal.format(Number(fee || 0))}${requests.trim() ? `\nPeticiones: ${requests.trim()}` : ''}`)
    }
    showToast(booking ? 'Tocada actualizada.' : 'Tocada agendada.', 'success')
    onSaved()
  }

  const inp: React.CSSProperties = { width: '100%', minHeight: 42, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }
  const lb: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={440}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>
            {booking ? 'Editar tocada' : 'Bookear DJ'} · {new Date(date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* DJ */}
          <div>
            <label style={lb}>DJ *</label>
            {dj ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                <Music size={14} style={{ color: 'var(--accent)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{dj.stage_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{dj.genres.join(', ')}{dj.base_fee != null ? ` · base ${mxnTal.format(dj.base_fee)}` : ''}</div>
                </div>
                {!booking && <button onClick={() => { setDjId(''); setFee('') }} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', width: 32, height: 32 }}><X size={13} /></button>}
              </div>
            ) : (
              <>
                <input value={djQuery} onChange={e => setDjQuery(e.target.value)} autoFocus placeholder="Buscar DJ por nombre o género…" style={inp} />
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {matches.map(d => (
                    <button key={d.id} onClick={() => setDjId(d.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{d.stage_name}</span>
                      <span className="num" style={{ fontSize: 11, color: 'var(--status-healthy)' }}>{d.base_fee != null ? mxnTal.format(d.base_fee) : ''}</span>
                    </button>
                  ))}
                  {/* Crear al DJ aquí mismo, sin salir del booking */}
                  {djQuery.trim().length >= 2 && !quickCreating && (
                    <button onClick={() => setQuickCreating(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 42, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Plus size={13} /> Crear DJ "{djQuery.trim()}"
                    </button>
                  )}
                  {quickCreating && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>Nuevo: {djQuery.trim()}</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <input type="number" inputMode="numeric" value={quickFee} onChange={e => setQuickFee(e.target.value)} placeholder="Fee base MXN" className="num"
                          style={{ minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
                        <input value={quickGenres} onChange={e => setQuickGenres(e.target.value)} placeholder="Géneros (coma)"
                          style={{ minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={quickCreateDj}
                          style={{ flex: 1, minHeight: 40, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Crear y usar</button>
                        <button onClick={() => setQuickCreating(false)}
                          style={{ minHeight: 40, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                      </div>
                    </div>
                  )}
                  {matches.length === 0 && djQuery.trim().length < 2 && <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: 0 }}>Escribe el nombre del DJ para buscarlo o crearlo.</p>}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lb}>Empieza</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="num" style={inp} /></div>
            <div><label style={lb}>Fee de esta tocada (MXN)</label><input type="number" inputMode="numeric" value={fee} onChange={e => setFee(e.target.value)} className="num" style={inp} /></div>
          </div>

          <div>
            <label style={lb}>Peticiones especiales de la fecha</label>
            <textarea value={requests} rows={2} placeholder="CDJ-3000, hospedaje, botella, transporte…" onChange={e => setRequests(e.target.value)} style={{ ...inp, minHeight: 52, padding: '8px 10px', resize: 'vertical' }} />
          </div>

          <div>
            <label style={lb}>Estado</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(BOOKING_META) as DJBooking['status'][]).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  style={{ minHeight: 38, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: status === s ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${status === s ? 'var(--accent)' : 'var(--border-default)'}`, color: status === s ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {BOOKING_META[s].label}
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 40 }}>
            <input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} style={{ accentColor: 'var(--status-healthy)', width: 16, height: 16 }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fee pagado</span>
          </label>

          <button onClick={save} disabled={saving || !djId}
            style={{ minHeight: 46, borderRadius: 999, border: 'none', background: djId ? 'var(--accent)' : 'var(--bg-elevated)', color: djId ? 'var(--on-accent)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Guardando…' : booking ? 'Guardar cambios' : 'Agendar tocada'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
