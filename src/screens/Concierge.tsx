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
export function Concierge({ userId, userRole }: { userId?: string; userRole?: string }) {
  const isMobile = useIsMobile()
  const isMaster = userRole === 'MASTER'
  const isOpsPlus = ['MASTER', 'OPS_MANAGER'].includes(userRole ?? '')
  const [tab, setTab] = useState('reservas')
  const [buList, setBuList] = useState<BU[]>([])

  useEffect(() => {
    supabase.from('business_units').select('id, code, name').order('code')
      .then(({ data }) => setBuList((data ?? []) as BU[]))
  }, [])

  const tabs = [
    { id: 'reservas', label: 'Reservas' },
    { id: 'inbox',    label: 'Bandeja' },
    { id: 'clientes', label: 'Clientes' },
    ...(isOpsPlus ? [{ id: 'talento', label: 'Talento' }] : []),   // fees = dato sensible: Ops/Master
    ...(isMaster ? [{ id: 'summary', label: 'Resumen' }, { id: 'config', label: 'Config' }] : []),
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
        <div style={{ maxWidth: isMobile ? undefined : (isMaster ? 640 : 420), paddingBottom: 8 }}>
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
            {tab === 'inbox' && <InboxTab buList={buList} userId={userId} isMobile={isMobile} isMaster={isMaster} />}
            {isOpsPlus && tab === 'talento' && <TalentoTab buList={buList} userId={userId} isMobile={isMobile} />}
            {isMaster && tab === 'summary' && <SummaryTab buList={buList} />}
            {isMaster && tab === 'config' && <ConfigTab buList={buList} />}
          </div>
        </div>
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
// Configuración — kill switch global + perillas por venue (sin deploy)
// ═════════════════════════════════════════════════════════════════════════════
function ConfigTab({ buList }: { buList: BU[] }) {
  const [botEnabled, setBotEnabled] = useState(false)
  const [waNumber, setWaNumber] = useState('')
  const [configs, setConfigs] = useState<VenueConfig[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: settings }, { data: cfgs }] = await Promise.all([
      supabase.from('app_settings').select('key, value').in('key', ['bot_enabled', 'bot_holding_wa_number']),
      supabase.from('bot_venue_config').select('*').order('channel'),
    ])
    for (const s of settings ?? []) {
      if (s.key === 'bot_enabled') setBotEnabled(s.value === 'true')
      if (s.key === 'bot_holding_wa_number') setWaNumber(s.value ?? '')
    }
    setConfigs((cfgs ?? []) as VenueConfig[])
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

  async function addConfig(buId: string, channel: Channel) {
    const { error } = await supabase.from('bot_venue_config').insert({ bu_id: buId, channel, enabled: false })
    if (error) { showToast(`No se pudo crear: ${error.message}`, 'error'); return }
    load()
  }

  // Venue+canal aún sin configurar
  const missing = useMemo(() => {
    const have = new Set(configs.map(c => `${c.bu_id}:${c.channel}`))
    const out: { bu: BU; channel: Channel }[] = []
    for (const bu of buList) for (const ch of ['instagram', 'whatsapp'] as Channel[]) {
      if (!have.has(`${bu.id}:${ch}`)) out.push({ bu, channel: ch })
    }
    return out
  }, [configs, buList])

  if (loading) return <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Cargando…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Global */}
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
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>WhatsApp del holding</label>
            <input value={waNumber} onChange={e => setWaNumber(e.target.value)} placeholder="+52 669 …" inputMode="tel" className="num"
              style={{ width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button onClick={saveWaNumber} style={{ minHeight: 44, padding: '0 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
        </div>
      </div>

      {/* Por venue */}
      {configs.map(cfg => (
        <VenueConfigCard key={cfg.id} cfg={cfg} bu={buList.find(b => b.id === cfg.bu_id)} onSaved={load} />
      ))}

      {/* Onboarding del venue: datos de depósito para apartados (puente manual
          con CLABE en lo que se conecta Stripe). Piloto: Bruma MZT. */}
      <PaymentSection buList={buList} />

      {missing.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Habilitar canal en venue</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {missing.map(m => {
              const Icon = CHANNEL_ICON[m.channel]
              return (
                <button key={`${m.bu.id}-${m.channel}`} onClick={() => addConfig(m.bu.id, m.channel)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 12px', borderRadius: 999, border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={12} /> {m.bu.code} · <Icon size={12} /> {CHANNEL_LABEL[m.channel]}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Onboarding del venue: depósitos para apartados (CLABE → luego Stripe) ───
function PaymentSection({ buList }: { buList: BU[] }) {
  const [rows, setRows] = useState<PaymentConfig[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('venue_payment_config').select('*')
    setRows((data ?? []) as PaymentConfig[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function enable(buId: string) {
    const { error } = await supabase.from('venue_payment_config').insert({ bu_id: buId })
    if (error) { showToast(`No se pudo habilitar: ${error.message}`, 'error'); return }
    load()
  }

  if (loading) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
        Onboarding del venue · Apartados (depósitos)
      </div>
      {rows.map(row => (
        <PaymentCard key={row.bu_id} row={row} bu={buList.find(b => b.id === row.bu_id)} onSaved={load} />
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {buList.filter(b => !rows.some(r => r.bu_id === b.id)).map(b => (
          <button key={b.id} onClick={() => enable(b.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 12px', borderRadius: 999, border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={12} /> Configurar depósitos · {b.code}
          </button>
        ))}
      </div>
    </div>
  )
}

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
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {bu && <BUChip code={bu.code} />}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{bu?.name ?? '—'} · Apartados</span>
        <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
          style={{ marginLeft: 'auto', minHeight: 36, padding: '0 14px', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer', background: form.active ? 'color-mix(in srgb, var(--status-healthy) 15%, transparent)' : 'var(--bg-elevated)', color: form.active ? 'var(--status-healthy)' : 'var(--text-tertiary)' }}>
          {form.active ? 'ACTIVO' : 'INACTIVO'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
        El bot ofrece asegurar reservas grandes con un depósito a esta cuenta. El equipo valida el comprobante — puente manual en lo que se conecta Stripe.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
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
          style={{ marginTop: 12, minHeight: 44, padding: '0 20px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      )}
    </div>
  )
}

function VenueConfigCard({ cfg, bu, onSaved }: { cfg: VenueConfig; bu?: BU; onSaved: () => void }) {
  const [form, setForm] = useState(cfg)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(cfg)
  const ChIcon = CHANNEL_ICON[cfg.channel]

  useEffect(() => { setForm(cfg) }, [cfg])

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('bot_venue_config').update({
      enabled: form.enabled,
      persona_note: form.persona_note,
      first_reply_delay_seconds: form.first_reply_delay_seconds,
      followup_after_minutes: form.followup_after_minutes,
      followup_window_start: form.followup_window_start,
      followup_window_end: form.followup_window_end,
      escalate_over_pax: form.escalate_over_pax,
      external_account: form.external_account,
    }).eq('id', cfg.id)
    setSaving(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    logActivity('concierge_config_saved', 'bot_venue_config', cfg.id, { bu: bu?.code, channel: cfg.channel, enabled: form.enabled })
    showToast(`Config de ${bu?.code ?? ''} ${CHANNEL_LABEL[cfg.channel]} guardada.`, 'success')
    onSaved()
  }

  const numIn = (value: number, onChange: (n: number) => void, suffix: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="number" value={value} min={0} onChange={e => onChange(Math.max(0, Number(e.target.value)))} className="num"
        style={{ width: 72, minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }} />
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{suffix}</span>
    </div>
  )
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {bu && <BUChip code={bu.code} />}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{bu?.name ?? '—'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-tertiary)' }}><ChIcon size={13} /> {CHANNEL_LABEL[cfg.channel]}</span>
        <button onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
          style={{ marginLeft: 'auto', minHeight: 36, padding: '0 14px', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer', background: form.enabled ? 'color-mix(in srgb, var(--status-healthy) 15%, transparent)' : 'var(--bg-elevated)', color: form.enabled ? 'var(--status-healthy)' : 'var(--text-tertiary)' }}>
          {form.enabled ? 'ACTIVO' : 'INACTIVO'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>1a respuesta</label>
          {numIn(form.first_reply_delay_seconds, n => setForm(f => ({ ...f, first_reply_delay_seconds: n })), 'seg')}
        </div>
        <div>
          <label style={lbl}>Seguimiento</label>
          {numIn(form.followup_after_minutes, n => setForm(f => ({ ...f, followup_after_minutes: n })), 'min')}
        </div>
        <div>
          <label style={lbl}>Escalar si pax &gt;</label>
          {numIn(form.escalate_over_pax, n => setForm(f => ({ ...f, escalate_over_pax: n })), 'pax')}
        </div>
        <div>
          <label style={lbl}>Ventana cortesía</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="time" value={form.followup_window_start.slice(0, 5)} onChange={e => setForm(f => ({ ...f, followup_window_start: e.target.value }))} className="num"
              style={{ minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 6px', fontSize: 12, color: 'var(--text-primary)', outline: 'none' }} />
            <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>–</span>
            <input type="time" value={form.followup_window_end.slice(0, 5)} onChange={e => setForm(f => ({ ...f, followup_window_end: e.target.value }))} className="num"
              style={{ minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 6px', fontSize: 12, color: 'var(--text-primary)', outline: 'none' }} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Cuenta conectada ({cfg.channel === 'instagram' ? 'IG account id' : 'número WA'})</label>
        <input value={form.external_account ?? ''} onChange={e => setForm(f => ({ ...f, external_account: e.target.value || null }))} placeholder="Se llena al conectar Meta"
          style={{ width: '100%', minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div>
        <label style={lbl}>Voz del bot (persona)</label>
        <textarea value={form.persona_note ?? ''} onChange={e => setForm(f => ({ ...f, persona_note: e.target.value || null }))} rows={2}
          placeholder="Tono, muletillas, qué ofrecer primero…"
          style={{ width: '100%', minHeight: 56, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>

      {dirty && (
        <button onClick={save} disabled={saving}
          style={{ marginTop: 12, minHeight: 44, padding: '0 20px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
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
      supabase.from('djs').select('*').order('stage_name'),
      supabase.from('dj_bookings').select('*').eq('bu_id', buId).gte('date', weekStart).lte('date', addDaysTal(weekStart, 6)),
      supabase.from('dj_bookings').select('fee, status').eq('bu_id', buId).gte('date', mStart).lte('date', mEnd).in('status', ['confirmed', 'played']),
    ])
    setDjs((d ?? []) as DJ[])
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
        <DJSheet dj={editingDj === 'new' ? null : editingDj} userId={userId} isMobile={isMobile}
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
function DJSheet({ dj, userId, isMobile, onClose, onSaved }: {
  dj: DJ | null
  userId?: string
  isMobile: boolean
  onClose: () => void
  onSaved: () => void
}) {
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
      stage_name: form.stage_name.trim(), real_name: form.real_name.trim() || null,
      phone: form.phone.trim() || null, instagram: form.instagram.trim().replace(/^@/, '') || null,
      city: form.city.trim() || null,
      genres: form.genres.split(',').map(g => g.trim()).filter(Boolean),
      base_fee: form.base_fee ? Number(form.base_fee) : null, fee_notes: form.fee_notes.trim() || null,
      rider: form.rider.trim() || null, links: form.links.trim() || null,
      rating: form.rating, status: form.status,
    }
    const { error } = dj
      ? await supabase.from('djs').update(row).eq('id', dj.id)
      : await supabase.from('djs').insert({ ...row, created_by: userId ?? null })
    setSaving(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    logActivity(dj ? 'dj_updated' : 'dj_created', 'dj', dj?.id, { stage_name: row.stage_name, fee: row.base_fee })
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

  const dj = djs.find(d => d.id === djId)
  const matches = useMemo(() => {
    const q = djQuery.trim().toLowerCase()
    if (!q) return djs.filter(d => d.status === 'active').slice(0, 6)
    return djs.filter(d => d.status === 'active' && (d.stage_name.toLowerCase().includes(q) || d.genres.some(g => g.toLowerCase().includes(q)))).slice(0, 6)
  }, [djs, djQuery])

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
                  {matches.length === 0 && <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: 0 }}>Sin resultados — dalo de alta primero en el directorio (abajo).</p>}
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
