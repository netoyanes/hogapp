import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Search, AlertTriangle, ChevronRight, ChevronLeft, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { normalizePhone, formatPhone } from '../lib/phone'
import { logActivity } from '../hooks/useActivityLog'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { useIsMobile } from '../hooks/useIsMobile'
import { Avatar } from '../components/ui/Avatar'
import { GuestProfile, type Guest, type GuestStats } from '../components/ui/GuestProfile'
import { BUChip, FilterChips, Sheet, showToast } from '../components/v2'

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

interface Props {
  userRole?: string
  userId?: string
}

export function Guests({ userRole, userId }: Props) {
  const isMobile = useIsMobile()
  const canCreate = ['MASTER', 'OPS_MANAGER', 'TEAM'].includes(userRole ?? '')

  const [guests, setGuests] = useState<Guest[]>([])
  const [stats, setStats] = useState<Record<string, GuestStats>>({})
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [filterBu, setFilterBu] = useState('')
  const [filterChip, setFilterChip] = useState('ALL')   // ALL | VIP | MKT | tag
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'visits'>('recent')
  const [creating, setCreating] = useState(false)
  const [openGuestId, setOpenGuestId] = useState<string | null>(null)

  const buMap = useMemo(() => Object.fromEntries(buList.map(b => [b.id, b.code])), [buList])

  const load = useCallback(async () => {
    const [{ data: g, error }, { data: st }, { data: buses }, { data: tags }] = await Promise.all([
      supabase.from('guests').select('*').neq('status', 'anonymized').order('created_at', { ascending: false }).limit(500),
      supabase.from('guest_stats').select('*'),
      supabase.from('business_units').select('id, code, name').order('code'),
      supabase.from('guest_tag_options').select('label').eq('active', true).order('label'),
    ])
    if (error) { setLoadError(true); setLoading(false); return }
    setGuests((g ?? []) as Guest[])
    const sm: Record<string, GuestStats> = {}
    for (const s of (st ?? []) as GuestStats[]) sm[s.guest_id] = s
    setStats(sm)
    setBuList(buses ?? [])
    setTagOptions((tags ?? []).map(t => t.label))
    setLoadError(false)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  // ── Filter + sort ──
  const q = search.trim().toLowerCase()
  const qPhone = q.replace(/[\s-()]/g, '')
  const filtered = useMemo(() => {
    let list = guests.filter(g => {
      if (filterBu && g.origin_bu !== filterBu) return false
      if (filterChip === 'VIP' && !g.tags.includes('VIP')) return false
      if (filterChip === 'MKT' && !g.consent_marketing) return false
      if (filterChip !== 'ALL' && filterChip !== 'VIP' && filterChip !== 'MKT' && !g.tags.includes(filterChip)) return false
      if (!q) return true
      return g.full_name.toLowerCase().includes(q) || (qPhone.length >= 3 && g.phone.includes(qPhone))
    })
    list = [...list].sort((a, b) => {
      if (sortBy === 'name') return a.full_name.localeCompare(b.full_name)
      if (sortBy === 'visits') return (stats[b.id]?.total_visits ?? 0) - (stats[a.id]?.total_visits ?? 0)
      const la = stats[a.id]?.last_visit ?? '', lb = stats[b.id]?.last_visit ?? ''
      if (la !== lb) return lb.localeCompare(la)
      return b.created_at.localeCompare(a.created_at)
    })
    return list
  }, [guests, stats, q, qPhone, filterBu, filterChip, sortBy])

  const chips = [
    { id: 'ALL', label: 'Todos' },
    { id: 'VIP', label: 'VIP', color: 'var(--accent)' },
    { id: 'MKT', label: 'Con marketing', color: 'var(--status-healthy)' },
    ...tagOptions.filter(t => t !== 'VIP').map(t => ({ id: t, label: t })),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header: búsqueda por teléfono (primaria) */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              inputMode="tel"
              placeholder="Buscar por teléfono o nombre…"
              style={{ width: '100%', minHeight: 44, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0 12px 0 36px', fontSize: 15, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {canCreate && (
            <button onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Plus size={15} /> {!isMobile && 'Nuevo cliente'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto' }}>
          <select value={filterBu} onChange={e => setFilterBu(e.target.value)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', padding: '6px 8px', fontSize: 12, minHeight: 32, outline: 'none', cursor: 'pointer', flexShrink: 0 }}>
            <option value="">Venue de origen</option>
            {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', padding: '6px 8px', fontSize: 12, minHeight: 32, outline: 'none', cursor: 'pointer', flexShrink: 0 }}>
            <option value="recent">Actividad reciente</option>
            <option value="name">Nombre</option>
            <option value="visits">Visitas</option>
          </select>
          <span className="num" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>{filtered.length} clientes</span>
        </div>
        <FilterChips options={chips} active={filterChip} onChange={setFilterChip} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse-green" style={{ height: 64, background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
          ))
        ) : loadError ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No pudimos cargar los clientes. Revisa tu conexión.</p>
            <button onClick={() => { setLoading(true); load() }} style={{ marginTop: 10, minHeight: 40, padding: '0 16px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}>Reintentar</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>🪪</span>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 280, margin: 0 }}>
              {q || filterBu || filterChip !== 'ALL' ? 'Nada coincide con tu búsqueda o filtros.' : 'Aún no hay clientes registrados. Crea el primero con el botón +.'}
            </p>
            {canCreate && !q && filterChip === 'ALL' && !filterBu && (
              <button onClick={() => setCreating(true)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                + Nuevo cliente
              </button>
            )}
          </div>
        ) : (
          filtered.map(g => {
            const st = stats[g.id]
            return (
              <button
                key={g.id}
                onClick={() => setOpenGuestId(g.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--bg-surface)', border: 'none', borderRadius: 'var(--radius-md)', padding: '11px 14px', cursor: 'pointer', flexShrink: 0, opacity: g.status === 'archived' ? 0.55 : 1, minHeight: 44 }}
              >
                <Avatar name={g.full_name} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{g.full_name}</span>
                    {g.tags.includes('VIP') && <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '0 5px' }}>VIP</span>}
                    {(st?.no_shows ?? 0) >= 2 && (
                      <span title={`${st!.no_shows} no-shows`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--status-attention)' }}>
                        <AlertTriangle size={10} /> {st!.no_shows}
                      </span>
                    )}
                    {g.status === 'archived' && <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>ARCHIVADO</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatPhone(g.phone)}</span>
                    {g.origin_bu && buMap[g.origin_bu] && <BUChip code={buMap[g.origin_bu]} size="sm" />}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{st?.total_visits ?? 0}<span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 400 }}> visitas</span></div>
                  <div className="num" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {st?.last_visit ? new Date(st.last_visit + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : 'sin visitas'}
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              </button>
            )
          })
        )}
      </div>

      {creating && (
        <GuestCreateSheet
          buList={buList}
          tagOptions={tagOptions}
          userId={userId}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); load(); setOpenGuestId(id) }}
          onOpenExisting={(id) => { setCreating(false); setOpenGuestId(id) }}
        />
      )}

      {openGuestId && (
        <GuestProfile
          guestId={openGuestId}
          buMap={buMap}
          userRole={userRole}
          onClose={() => setOpenGuestId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}

// ── Alta de cliente — 2 pasos, optimizada para 15 segundos en el host stand ──
export function GuestCreateSheet({ buList, tagOptions, userId, defaultBuId, onClose, onCreated, onOpenExisting }: {
  buList: { id: string; code: string; name: string }[]
  tagOptions: string[]
  userId?: string
  defaultBuId?: string
  onClose: () => void
  onCreated: (guestId: string) => void
  onOpenExisting: (guestId: string) => void
}) {
  const isMobile = useIsMobile()
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avisoOpen, setAvisoOpen] = useState(false)
  // Paso 1 — esenciales
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [existing, setExisting] = useState<{ id: string; name: string } | null>(null)
  const [name, setName] = useState('')
  const [buId, setBuId] = useState(defaultBuId ?? '')
  const [terms, setTerms] = useState(false)
  // Paso 2 — opcionales
  const [email, setEmail] = useState('')
  const [bMonth, setBMonth] = useState('')
  const [bDay, setBDay] = useState('')
  const [bYear, setBYear] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [mkt, setMkt] = useState(false)   // NUNCA pre-marcado

  useEffect(() => {
    if (!buId && buList.length > 0) setBuId(buList[0].id)
  }, [buList, buId])

  async function checkDupe() {
    setPhoneError(null); setExisting(null)
    const e164 = normalizePhone(phone)
    if (!phone.trim()) return
    if (!e164) { setPhoneError('Teléfono inválido. Usa 10 dígitos o formato +52…'); return }
    const { data } = await supabase.from('guests').select('id, full_name').eq('phone', e164).maybeSingle()
    if (data) setExisting({ id: data.id, name: data.full_name })
  }

  const e164 = normalizePhone(phone)
  const step1Valid = !!e164 && !!name.trim() && !!buId && terms && !existing

  async function save() {
    if (!step1Valid || !e164) return
    setSaving(true); setError(null)
    let birthday: string | null = null
    let hasYear = true
    if (bMonth && bDay) {
      const y = bYear && Number(bYear) > 1900 ? Number(bYear) : 2000
      hasYear = !!bYear && Number(bYear) > 1900
      birthday = `${y}-${String(bMonth).padStart(2, '0')}-${String(bDay).padStart(2, '0')}`
    }
    const { data, error: err } = await supabase.from('guests').insert({
      phone: e164,
      full_name: name.trim(),
      email: email.trim() || null,
      birthday, birthday_has_year: hasYear,
      origin_bu: buId || null,
      created_by: userId ?? null,
      tags,
      notes: notes.trim() || null,
      consent_terms: true, consent_terms_at: new Date().toISOString(),
      consent_marketing: mkt, consent_marketing_at: mkt ? new Date().toISOString() : null,
    }).select('id').single()
    setSaving(false)
    if (err) {
      if (err.code === '23505') { await checkDupe(); setError('Este teléfono ya está registrado.') }
      else setError(`No se pudo crear: ${err.message}`)
      return
    }
    const buCode = buList.find(b => b.id === buId)?.code
    logActivity('guest_created', 'guest', data.id, { name: name.trim(), bu: buCode ?? null })
    showToast('Cliente creado.', 'success')
    onCreated(data.id)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 15, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={440}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>
            Nuevo cliente <span className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>· paso {step}/2</span>
          </h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {step === 1 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Teléfono *</label>
              <input
                value={phone}
                onChange={e => { setPhone(e.target.value); setExisting(null); setPhoneError(null) }}
                onBlur={checkDupe}
                inputMode="tel" autoFocus
                placeholder="55 1234 5678"
                className="num"
                style={{ ...inputStyle, borderColor: phoneError ? 'var(--status-risk)' : existing ? 'var(--status-attention)' : 'var(--border-subtle)' }}
              />
              {phoneError && <p style={{ color: 'var(--status-risk)', fontSize: 12, margin: '5px 0 0' }}>{phoneError}</p>}
              {existing && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, background: 'color-mix(in srgb, var(--status-attention) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-attention) 30%, transparent)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>Este cliente ya existe: <strong style={{ color: 'var(--text-primary)' }}>{existing.name}</strong></span>
                  <button onClick={() => onOpenExisting(existing.id)} style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Abrir perfil</button>
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Nombre completo *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre y apellido" style={inputStyle} />
            </div>
            <div>
              <label style={lbl}>Venue *</label>
              <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                El cliente acepta los términos y el{' '}
                <button type="button" onClick={(e) => { e.preventDefault(); setAvisoOpen(true) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 13, textDecoration: 'underline' }}>aviso de privacidad</button>. *
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(2)} disabled={!step1Valid}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 18px', borderRadius: 999, border: 'none', background: step1Valid ? 'var(--bg-elevated)' : 'var(--bg-surface)', color: step1Valid ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, cursor: step1Valid ? 'pointer' : 'not-allowed' }}>
                Opcionales <ChevronRight size={14} />
              </button>
              <button onClick={save} disabled={!step1Valid || saving}
                style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, border: 'none', background: step1Valid ? 'var(--accent)' : 'var(--bg-elevated)', color: step1Valid ? 'var(--on-accent)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 700, cursor: step1Valid ? 'pointer' : 'not-allowed' }}>
                {saving ? 'Creando…' : 'Crear cliente'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Correo</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@correo.com" style={inputStyle} />
            </div>
            <div>
              <label style={lbl}>Cumpleaños (el año es opcional)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={bDay} onChange={e => setBDay(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Día</option>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
                <select value={bMonth} onChange={e => setBMonth(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Mes</option>
                  {MONTHS_ES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <input value={bYear} onChange={e => setBYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="Año" className="num" style={{ ...inputStyle, maxWidth: 90 }} />
              </div>
            </div>
            <div>
              <label style={lbl}>Tags</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tagOptions.map(t => {
                  const on = tags.includes(t)
                  return (
                    <button key={t} onClick={() => setTags(p => on ? p.filter(x => x !== t) : [...p, t])}
                      style={{ minHeight: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: on ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, color: on ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label style={lbl}>Notas internas</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Preferencias, alergias, contexto…" style={{ ...inputStyle, minHeight: 60, padding: '10px 12px', resize: 'vertical' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', minHeight: 44 }}>
              <input type="checkbox" checked={mkt} onChange={e => setMkt(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                El cliente acepta recibir promociones y comunicación de marketing. <span style={{ color: 'var(--text-tertiary)' }}>(opcional)</span>
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                <ChevronLeft size={14} /> Esenciales
              </button>
              <button onClick={save} disabled={saving}
                style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Creando…' : 'Crear cliente'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p style={{ marginTop: 12, color: 'var(--status-risk)', fontSize: 13, background: 'color-mix(in srgb, var(--status-risk) 10%, transparent)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>{error}</p>
        )}
      </div>

      {/* Aviso de privacidad (resumen; página completa en fase de privacidad) */}
      {avisoOpen && (
        <div onClick={() => setAvisoOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 20, maxWidth: 420, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Aviso de privacidad</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
              HOG utiliza tus datos personales (nombre, teléfono, correo y fecha de cumpleaños) únicamente para gestionar tus reservaciones y visitas en nuestros venues. No compartimos tus datos con terceros. Puedes solicitar la corrección o eliminación de tus datos en cualquier momento en cualquiera de nuestros establecimientos (derechos ARCO, LFPDPPP). La comunicación de marketing es opcional y solo se envía con tu consentimiento explícito, que puedes retirar cuando quieras.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => setAvisoOpen(false)} style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Entendido</button>
              <a href="/?aviso=1" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 12, textDecoration: 'none' }}>Ver página completa ↗</a>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}
