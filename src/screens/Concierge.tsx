import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Bot, MessageCircle, Camera, Send, Power, X, Plus, Hand, Undo2, CheckCircle2, FlaskConical, TrendingUp, Inbox, Shell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../hooks/useActivityLog'
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

const STATUS_META: Record<ConvStatus, { label: string; tone: StatusTone }> = {
  bot:         { label: 'Bot',        tone: 'accent' },
  needs_human: { label: 'Necesita humano', tone: 'attention' },
  human:       { label: 'Humano',     tone: 'healthy' },
  closed:      { label: 'Cerrada',    tone: 'neutral' },
}
const CHANNEL_ICON: Record<Channel, React.ElementType> = { instagram: Camera, whatsapp: MessageCircle }
const CHANNEL_LABEL: Record<Channel, string> = { instagram: 'Instagram', whatsapp: 'WhatsApp' }
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
    ...(isMaster ? [{ id: 'summary', label: 'Resumen' }, { id: 'config', label: 'Configuración' }] : []),
  ]

  // Reservas y Clientes son pantallas completas con su propio scroll; las demás
  // secciones scrollean dentro del contenedor centrado.
  const fullBleed = tab === 'reservas' || tab === 'clientes'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ padding: isMobile ? '10px 12px 0' : '14px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Shell size={18} style={{ color: 'var(--accent)' }} />
          <h1 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Concierge</h1>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 4, display: isMobile ? 'none' : 'inline' }}>Reservas · Bot · Clientes</span>
        </div>
        <div style={{ maxWidth: isMaster ? 640 : 420, paddingBottom: 10 }}>
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const bu = buList.find(b => b.id === conv.bu_id)

  const loadMessages = useCallback(async () => {
    const { data } = await supabase.from('bot_messages').select('*').eq('conversation_id', conv.id).order('created_at')
    setMessages((data ?? []) as Message[])
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

  async function sendAs(role: 'agent' | 'guest', body: string, clear: () => void) {
    if (!body.trim()) return
    setBusy(true)
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

        {/* Mensajes */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.length === 0 && <p style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>Sin mensajes aún.</p>}
          {messages.map(m => (
            <div key={m.id} style={roleStyle(m.role)}>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 2 }}>
                {m.role === 'guest' ? 'Cliente' : m.role === 'bot' ? 'Bot' : m.role === 'agent' ? 'Equipo' : 'Sistema'}
              </div>
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
        {bu && <BUChip code={bu.code} name={bu.name} />}
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
