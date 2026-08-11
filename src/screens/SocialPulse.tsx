import { useCallback, useEffect, useMemo, useState } from 'react'
import { AtSign, ThumbsUp, MapPin, RefreshCw, Plus, MessageCircle, TrendingUp, TrendingDown, Minus, Star, DollarSign } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { BUChip, Sheet, showToast } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// PULSO SOCIAL — métricas de redes por venue con análisis de emoción:
//  · Seguidores y su tendencia, engagement, alcance
//  · Rating y reseñas de Google Maps / Facebook
//  · DMs del concierge y VENTAS generadas por mensaje (reservas vía bot)
//  · Sentimiento y emoción dominante de comentarios/reseñas (Claude)
// Los datos los extrae la edge function social-pulse (cron diario o manual).
// ─────────────────────────────────────────────────────────────────────────────

interface Account { id: string; bu_id: string; platform: 'instagram' | 'facebook' | 'google'; handle: string | null; external_id: string; active: boolean }
interface Snapshot {
  account_id: string; taken_on: string
  followers: number | null; engagement: number | null; reach: number | null
  rating: number | null; reviews_count: number | null
  dm_in: number | null; dm_out: number | null; dm_sales: number | null
}
interface Mention {
  id: string; account_id: string; kind: 'comment' | 'review' | 'dm'
  author: string | null; text: string; posted_at: string | null; rating: number | null
  sentiment: number | null; emotion: string | null; sales_intent: boolean; analyzed_at: string | null
}

const PLATFORM_META = {
  instagram: { label: 'Instagram', color: '#D98C9F', Icon: AtSign },
  facebook:  { label: 'Facebook',  color: '#7FA3C2', Icon: ThumbsUp },
  google:    { label: 'Google',    color: '#8FBF9F', Icon: MapPin },
} as const

const EMOTION_META: Record<string, { emoji: string; color: string }> = {
  'alegría':    { emoji: '😄', color: 'var(--status-healthy)' },
  'entusiasmo': { emoji: '🔥', color: '#E8A33D' },
  'neutral':    { emoji: '😐', color: 'var(--text-tertiary)' },
  'duda':       { emoji: '🤔', color: '#C9A76B' },
  'decepción':  { emoji: '😕', color: '#D98C9F' },
  'enojo':      { emoji: '😠', color: 'var(--status-risk)' },
}

const sentimentLabel = (s: number) => s > 0.3 ? 'Positivo' : s < -0.3 ? 'Negativo' : 'Neutral'
const sentimentColor = (s: number) => s > 0.3 ? 'var(--status-healthy)' : s < -0.3 ? 'var(--status-risk)' : 'var(--text-tertiary)'

export function SocialPulse({ userRole }: { userRole?: string }) {
  const isMobile = useIsMobile()
  const isMaster = userRole === 'MASTER'
  const [accounts, setAccounts] = useState<Account[]>([])
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const [mentions, setMentions] = useState<Mention[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [buFilter, setBuFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    const [{ data: acc }, { data: sn }, { data: mn }, { data: bus }] = await Promise.all([
      supabase.from('social_accounts').select('*').order('created_at'),
      supabase.from('social_snapshots').select('*').gte('taken_on', since.slice(0, 10)).order('taken_on', { ascending: false }),
      supabase.from('social_mentions').select('*').gte('created_at', since).order('posted_at', { ascending: false }).limit(200),
      supabase.from('business_units').select('id, code, name').order('name'),
    ])
    setAccounts((acc ?? []) as Account[])
    setSnaps((sn ?? []) as Snapshot[])
    setMentions((mn ?? []) as Mention[])
    setBuList(bus ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const buCode = useMemo(() => Object.fromEntries(buList.map(b => [b.id, b.code])), [buList])
  const accountById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts])

  // Último snapshot y el de hace ~7 días, por cuenta (tendencia)
  const latest = useMemo(() => {
    const m: Record<string, { now?: Snapshot; prev?: Snapshot }> = {}
    for (const s of snaps) {
      const e = (m[s.account_id] = m[s.account_id] ?? {})
      if (!e.now) e.now = s
      else if (!e.prev && s.taken_on <= new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)) e.prev = s
    }
    return m
  }, [snaps])

  // Sentimiento por cuenta (30d): promedio + emoción dominante
  const pulse = useMemo(() => {
    const m: Record<string, { avg: number; n: number; emotions: Record<string, number>; sales: number }> = {}
    for (const mn of mentions) {
      if (mn.sentiment == null) continue
      const e = (m[mn.account_id] = m[mn.account_id] ?? { avg: 0, n: 0, emotions: {}, sales: 0 })
      e.avg += mn.sentiment; e.n++
      if (mn.emotion) e.emotions[mn.emotion] = (e.emotions[mn.emotion] ?? 0) + 1
      if (mn.sales_intent) e.sales++
    }
    for (const k of Object.keys(m)) m[k].avg = m[k].avg / m[k].n
    return m
  }, [mentions])

  // Agrupar cuentas por venue
  const byVenue = useMemo(() => {
    const m: Record<string, Account[]> = {}
    for (const a of accounts) {
      if (buFilter && a.bu_id !== buFilter) continue
      ;(m[a.bu_id] = m[a.bu_id] ?? []).push(a)
    }
    return m
  }, [accounts, buFilter])

  const filteredMentions = useMemo(() =>
    mentions.filter(mn => !buFilter || accountById[mn.account_id]?.bu_id === buFilter),
    [mentions, buFilter, accountById])

  async function refreshNow() {
    setRefreshing(true)
    const { data, error } = await supabase.functions.invoke('social-pulse', { body: { action: 'run' } })
    if (error) showToast('No se pudo actualizar — ¿la función social-pulse ya está desplegada?', 'error')
    else showToast(`Actualizado: ${(data?.log ?? []).slice(0, 2).join(' · ')}`, 'success')
    setRefreshing(false)
    load()
  }

  const trend = (now?: number | null, prev?: number | null) => {
    if (now == null || prev == null || now === prev) return { Icon: Minus, color: 'var(--text-tertiary)', diff: 0 }
    return now > prev
      ? { Icon: TrendingUp, color: 'var(--status-healthy)', diff: now - prev }
      : { Icon: TrendingDown, color: 'var(--status-risk)', diff: now - prev }
  }

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14 }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: 16, maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800, margin: 0, flex: 1 }}>Pulso Social</h1>
          <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: 13, minHeight: 40, cursor: 'pointer' }}>
            <option value="">Todos los venues</option>
            {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
          <button onClick={refreshNow} disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            <RefreshCw size={13} className={refreshing ? 'animate-pulse-green' : undefined} /> {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
          {isMaster && (
            <button onClick={() => setConfigOpen(true)} title="Conectar cuenta"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer' }}>
              <Plus size={16} />
            </button>
          )}
        </div>

        {loading ? (
          <div className="animate-pulse-green" style={{ height: 120, background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }} />
        ) : accounts.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Sin cuentas conectadas</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>
              {isMaster ? 'Conecta el Instagram, Facebook o Google Maps de cada venue con el botón +.' : 'Pide al Master conectar las cuentas de cada venue.'}
            </p>
          </div>
        ) : (
          Object.entries(byVenue).map(([buId, accs]) => (
            <div key={buId} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <BUChip code={buCode[buId] ?? '?'} />
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{buList.find(b => b.id === buId)?.name ?? ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(accs.length, 3)}, 1fr)`, gap: 10 }}>
                {accs.map(acc => {
                  const meta = PLATFORM_META[acc.platform]
                  const t = latest[acc.id]
                  const p = pulse[acc.id]
                  const fTrend = trend(t?.now?.followers, t?.prev?.followers)
                  const topEmotion = p ? Object.entries(p.emotions).sort((a, b) => b[1] - a[1])[0]?.[0] : null
                  return (
                    <div key={acc.id} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12, borderTop: `2px solid ${meta.color}`, opacity: acc.active ? 1 : 0.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <meta.Icon size={14} style={{ color: meta.color }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{acc.handle ?? meta.label}</span>
                        {!acc.active && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>pausada</span>}
                      </div>
                      {!t?.now ? (
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>Sin datos aún — corre "Actualizar".</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {t.now.followers != null && (
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span className="num" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{t.now.followers.toLocaleString('es-MX')}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>seguidores</span>
                              <fTrend.Icon size={12} style={{ color: fTrend.color }} />
                              {fTrend.diff !== 0 && <span className="num" style={{ fontSize: 10, color: fTrend.color, fontFamily: 'var(--font-mono)' }}>{fTrend.diff > 0 ? '+' : ''}{fTrend.diff}</span>}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
                            {t.now.engagement != null && <span className="num">⚡ {t.now.engagement}% eng.</span>}
                            {t.now.reach != null && <span className="num">👁 {t.now.reach.toLocaleString('es-MX')} alcance</span>}
                            {t.now.rating != null && <span className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={10} style={{ color: '#E8A33D' }} /> {t.now.rating} ({t.now.reviews_count ?? 0})</span>}
                            {t.now.dm_in != null && <span className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MessageCircle size={10} /> {t.now.dm_in} DMs/día</span>}
                            {(t.now.dm_sales ?? 0) > 0 && <span className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--status-healthy)', fontWeight: 700 }}><DollarSign size={10} /> {t.now.dm_sales} reservas por DM</span>}
                          </div>
                          {p && p.n > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                              <span style={{ fontSize: 16 }}>{topEmotion ? EMOTION_META[topEmotion]?.emoji ?? '😐' : '😐'}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: sentimentColor(p.avg) }}>{sentimentLabel(p.avg)}</span>
                              <span className="num" style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{Math.round(p.avg * 100)}/100 · {p.n} menciones</span>
                              {p.sales > 0 && <span className="num" style={{ fontSize: 10, color: 'var(--status-healthy)', fontFamily: 'var(--font-mono)' }}>💰 {p.sales} con intención</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}

        {/* Menciones recientes con emoción */}
        {filteredMentions.length > 0 && (
          <div style={card}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', margin: '0 0 10px' }}>
              Menciones recientes · {filteredMentions.length}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 480, overflowY: 'auto' }}>
              {filteredMentions.slice(0, 60).map(mn => {
                const acc = accountById[mn.account_id]
                const meta = acc ? PLATFORM_META[acc.platform] : null
                const em = mn.emotion ? EMOTION_META[mn.emotion] : null
                return (
                  <div key={mn.id} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', borderLeft: `3px solid ${mn.sentiment != null ? sentimentColor(mn.sentiment) : 'var(--border-subtle)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                      {meta && <meta.Icon size={11} style={{ color: meta.color }} />}
                      {acc && <BUChip code={buCode[acc.bu_id] ?? '?'} size="sm" />}
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{mn.author ?? 'Anónimo'}</span>
                      {mn.rating && <span className="num" style={{ fontSize: 10, color: '#E8A33D', fontFamily: 'var(--font-mono)' }}>{'★'.repeat(mn.rating)}</span>}
                      {em && <span title={mn.emotion!} style={{ fontSize: 12 }}>{em.emoji}</span>}
                      {mn.sales_intent && <span title="Intención de compra/reserva" style={{ fontSize: 10 }}>💰</span>}
                      {!mn.analyzed_at && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>por analizar</span>}
                      {mn.posted_at && <span className="num" style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>{new Date(mn.posted_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>{mn.text.slice(0, 240)}{mn.text.length > 240 ? '…' : ''}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {configOpen && (
        <AccountConfigSheet
          accounts={accounts} buList={buList} isMobile={isMobile}
          onClose={() => setConfigOpen(false)}
          onSaved={() => { setConfigOpen(false); load() }}
        />
      )}
    </div>
  )
}

// ── Conectar/administrar cuentas (Master) ────────────────────────────────────
function AccountConfigSheet({ accounts, buList, isMobile, onClose, onSaved }: {
  accounts: Account[]
  buList: { id: string; code: string; name: string }[]
  isMobile: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [buId, setBuId] = useState(buList[0]?.id ?? '')
  const [platform, setPlatform] = useState<'instagram' | 'facebook' | 'google'>('instagram')
  const [handle, setHandle] = useState('')
  const [externalId, setExternalId] = useState('')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)

  const inp: React.CSSProperties = { width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }

  const ID_HINT = {
    instagram: 'ID de cuenta business de IG (Graph API) — lo da Meta Business Suite',
    facebook: 'ID de la página de Facebook',
    google: 'Place ID de Google Maps (developers.google.com/maps → Place ID Finder)',
  }

  async function save() {
    if (!buId || !externalId.trim()) { showToast('Falta venue o ID externo.', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('social_accounts').upsert({
      bu_id: buId, platform, handle: handle.trim() || null, external_id: externalId.trim(),
      access_token: token.trim() || null, active: true,
    }, { onConflict: 'bu_id,platform' })
    setSaving(false)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    showToast('Cuenta conectada — corre "Actualizar" para traer datos.', 'success')
    onSaved()
  }

  async function toggle(acc: Account) {
    await supabase.from('social_accounts').update({ active: !acc.active }).eq('id', acc.id)
    onSaved()
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={460}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Cuentas conectadas</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {accounts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {accounts.map(a => {
                const meta = PLATFORM_META[a.platform]
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                    <meta.Icon size={13} style={{ color: meta.color }} />
                    <BUChip code={buList.find(b => b.id === a.bu_id)?.code ?? '?'} size="sm" />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.handle ?? a.external_id}</span>
                    <button onClick={() => toggle(a)}
                      style={{ minHeight: 32, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: a.active ? 'var(--status-healthy)' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                      {a.active ? 'Activa' : 'Pausada'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Conectar cuenta</span>
            <div>
              <label style={lbl}>Venue</label>
              <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Plataforma</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['instagram', 'facebook', 'google'] as const).map(p => {
                  const meta = PLATFORM_META[p]
                  return (
                    <button key={p} onClick={() => setPlatform(p)}
                      style={{ flex: 1, minHeight: 40, borderRadius: 'var(--radius-sm)', border: `1px solid ${platform === p ? meta.color : 'var(--border-subtle)'}`, background: platform === p ? `color-mix(in srgb, ${meta.color} 14%, transparent)` : 'none', color: platform === p ? meta.color : 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <meta.Icon size={13} /> {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label style={lbl}>Handle / nombre (visual)</label>
              <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="@brumarecords" style={inp} />
            </div>
            <div>
              <label style={lbl}>ID externo</label>
              <input value={externalId} onChange={e => setExternalId(e.target.value)} placeholder={platform === 'google' ? 'ChIJ…' : '17841…'} style={inp} />
              <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>{ID_HINT[platform]}</p>
            </div>
            <div>
              <label style={lbl}>Token propio (opcional)</label>
              <input value={token} onChange={e => setToken(e.target.value)} placeholder="Vacío = usa el token global" style={inp} />
              <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>IG/FB: page access token de Meta · Google: API key con Places habilitado.</p>
            </div>
            <button onClick={save} disabled={saving}
              style={{ minHeight: 46, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Guardando…' : 'Conectar'}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
