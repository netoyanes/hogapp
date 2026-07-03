import { useEffect, useState, useCallback } from 'react'
import { Phone, MessageCircle, Star, Archive, Trash2, Pencil, Check, X, CalendarClock, History, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatPhone, waLink } from '../../lib/phone'
import { logActivity } from '../../hooks/useActivityLog'
import { useIsMobile } from '../../hooks/useIsMobile'
import { Avatar } from './Avatar'
import { BUChip, KPITile, Sheet, StatusBadgeV2, showToast } from '../v2'

export interface Guest {
  id: string
  phone: string
  full_name: string
  email: string | null
  birthday: string | null
  birthday_has_year: boolean
  origin_bu: string | null
  created_by: string | null
  tags: string[]
  notes: string | null
  consent_terms: boolean
  consent_terms_at: string | null
  consent_marketing: boolean
  consent_marketing_at: string | null
  status: 'active' | 'archived' | 'anonymized'
  created_at: string
}

export interface GuestStats {
  guest_id: string
  total_visits: number
  last_visit: string | null
  no_shows: number
  cancellations: number
  completed_reservations: number
}

interface VisitRow { id: string; bu_id: string; visit_date: string; source: string }
interface UpcomingRes { id: string; bu_id: string; date: string; time_slot: string; party_size: number; status: string }

const SOURCE_LABEL: Record<string, string> = { reservation: 'Reserva', walk_in: 'Walk-in', manual: 'Manual' }
const RES_STATUS_LABEL: Record<string, string> = { requested: 'Solicitada', confirmed: 'Confirmada', seated: 'Sentada' }

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props {
  guestId: string
  buMap: Record<string, string>          // bu_id → code
  userRole?: string
  onClose: () => void
  onChanged?: () => void
}

export function GuestProfile({ guestId, buMap, userRole, onClose, onChanged }: Props) {
  const isMobile = useIsMobile()
  const [guest, setGuest] = useState<Guest | null>(null)
  const [stats, setStats] = useState<GuestStats | null>(null)
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingRes[]>([])
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<null | 'anonymize' | 'hard'>(null)
  // edit fields
  const [eName, setEName] = useState('')
  const [eEmail, setEEmail] = useState('')
  const [eNotes, setENotes] = useState('')

  const canWrite = ['MASTER', 'OPS_MANAGER', 'TEAM'].includes(userRole ?? '')
  const canArchive = ['MASTER', 'OPS_MANAGER'].includes(userRole ?? '')
  const isMaster = userRole === 'MASTER'

  const load = useCallback(async () => {
    const [{ data: g, error }, { data: st }, { data: vs }, { data: up }] = await Promise.all([
      supabase.from('guests').select('*').eq('id', guestId).single(),
      supabase.from('guest_stats').select('*').eq('guest_id', guestId).single(),
      supabase.from('guest_visits').select('id, bu_id, visit_date, source').eq('guest_id', guestId).order('visit_date', { ascending: false }).limit(20),
      supabase.from('reservations').select('id, bu_id, date, time_slot, party_size, status').eq('guest_id', guestId)
        .gte('date', new Date().toISOString().slice(0, 10)).in('status', ['requested', 'confirmed', 'seated']).order('date'),
    ])
    if (error || !g) { setLoadError(true); return }
    setGuest(g as Guest)
    setEName(g.full_name); setEEmail(g.email ?? ''); setENotes(g.notes ?? '')
    if (st) setStats(st as GuestStats)
    setVisits((vs ?? []) as VisitRow[])
    setUpcoming((up ?? []) as UpcomingRes[])
  }, [guestId])

  useEffect(() => { load() }, [load])

  async function toggleVip() {
    if (!guest || !canWrite) return
    const has = guest.tags.includes('VIP')
    const tags = has ? guest.tags.filter(t => t !== 'VIP') : [...guest.tags, 'VIP']
    setGuest({ ...guest, tags })
    const { error } = await supabase.from('guests').update({ tags }).eq('id', guest.id)
    if (error) { showToast('No se pudo actualizar VIP. Intenta de nuevo.', 'error'); load(); return }
    onChanged?.()
  }

  async function saveEdit() {
    if (!guest || !eName.trim()) return
    const { error } = await supabase.from('guests').update({
      full_name: eName.trim(), email: eEmail.trim() || null, notes: eNotes.trim() || null,
    }).eq('id', guest.id)
    if (error) { showToast('No se pudo guardar. Intenta de nuevo.', 'error'); return }
    logActivity('guest_updated', 'guest', guest.id, { name: eName.trim() })
    setEditing(false)
    showToast('Cliente actualizado.', 'success')
    load(); onChanged?.()
  }

  async function archiveGuest() {
    if (!guest) return
    const next = guest.status === 'archived' ? 'active' : 'archived'
    const { error } = await supabase.from('guests').update({ status: next }).eq('id', guest.id)
    if (error) { showToast('No se pudo archivar. Intenta de nuevo.', 'error'); return }
    logActivity(next === 'archived' ? 'guest_archived' : 'guest_restored', 'guest', guest.id, { name: guest.full_name })
    showToast(next === 'archived' ? 'Cliente archivado.' : 'Cliente restaurado.', 'success')
    load(); onChanged?.()
  }

  async function anonymizeGuest() {
    if (!guest) return
    const { error } = await supabase.rpc('anonymize_guest', { gid: guest.id })
    if (error) { showToast(`No se pudo anonimizar: ${error.message}`, 'error'); return }
    logActivity('guest_anonymized', 'guest', guest.id, { name: guest.full_name })
    showToast('Cliente anonimizado — datos personales eliminados.', 'success')
    setConfirmDelete(null)
    load(); onChanged?.()
  }

  async function hardDelete() {
    if (!guest) return
    const { error } = await supabase.from('guests').delete().eq('id', guest.id)
    if (error) { showToast(`No se pudo eliminar: ${error.message}`, 'error'); return }
    logActivity('guest_deleted', 'guest', guest.id, { name: guest.full_name })
    showToast('Cliente eliminado definitivamente.', 'success')
    onChanged?.(); onClose()
  }

  const isAnon = guest?.status === 'anonymized'

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={480}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        {loadError ? (
          <div style={{ padding: 'var(--space-8) 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No encontramos este cliente. Puede haber sido eliminado.</p>
            <button onClick={onClose} style={{ marginTop: 12, minHeight: 40, padding: '0 16px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>Cerrar</button>
          </div>
        ) : !guest ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 20 }}>
            {[64, 40, 90].map((h, i) => <div key={i} className="animate-pulse-green" style={{ height: h, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }} />)}
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 'var(--space-3) 0' }}>
              <Avatar name={guest.full_name} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h2 style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 700, margin: 0 }}>{guest.full_name}</h2>
                  {guest.status !== 'active' && (
                    <StatusBadgeV2 tone={isAnon ? 'neutral' : 'attention'} label={isAnon ? 'Anonimizado' : 'Archivado'} />
                  )}
                </div>
                {!isAnon && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <a href={`tel:${guest.phone}`} className="num" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={12} /> {formatPhone(guest.phone)}
                    </a>
                    <a href={waLink(guest.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                      style={{ color: 'var(--status-healthy)', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, textDecoration: 'none' }}>
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {guest.origin_bu && buMap[guest.origin_bu] && <BUChip code={buMap[guest.origin_bu]} size="sm" />}
                  {guest.tags.map(t => (
                    <span key={t} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: t === 'VIP' ? 'var(--accent)' : 'var(--text-secondary)', background: t === 'VIP' ? 'var(--accent-bg)' : 'var(--bg-elevated)', border: `1px solid ${t === 'VIP' ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: 4, padding: '1px 6px' }}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {canWrite && !isAnon && (
                  <button onClick={toggleVip} title={guest.tags.includes('VIP') ? 'Quitar VIP' : 'Marcar VIP'}
                    style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Star size={15} style={{ color: 'var(--accent)', fill: guest.tags.includes('VIP') ? 'var(--accent)' : 'none' }} />
                  </button>
                )}
                <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 'var(--space-4)' }}>
              <KPITile label="Visitas" value={String(stats?.total_visits ?? 0)} />
              <KPITile label="Última" value={stats?.last_visit ? new Date(stats.last_visit + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'} />
              <KPITile label="Cumplidas" value={String(stats?.completed_reservations ?? 0)} color="var(--status-healthy)" />
              <KPITile label="No-shows" value={String(stats?.no_shows ?? 0)} color={(stats?.no_shows ?? 0) >= 2 ? 'var(--status-attention)' : undefined} />
            </div>

            {/* Próximas reservas */}
            <SectionTitle icon={<CalendarClock size={12} />} text={`Próximas reservas${upcoming.length ? ` · ${upcoming.length}` : ''}`} />
            {upcoming.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: '4px 0 16px' }}>Sin reservas próximas.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {upcoming.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', flexShrink: 0 }}>
                    {buMap[r.bu_id] && <BUChip code={buMap[r.bu_id]} size="sm" />}
                    <span className="num" style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{fmtDate(r.date)} · {r.time_slot}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.party_size} pax</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{RES_STATUS_LABEL[r.status] ?? r.status}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Historial de visitas */}
            <SectionTitle icon={<History size={12} />} text={`Historial de visitas${visits.length ? ` · ${visits.length}` : ''}`} />
            {visits.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: '4px 0 16px' }}>Aún no hay visitas registradas.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                {visits.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                    {buMap[v.bu_id] && <BUChip code={buMap[v.bu_id]} size="sm" />}
                    <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(v.visit_date)}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{SOURCE_LABEL[v.source] ?? v.source}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Notas */}
            <SectionTitle icon={<Pencil size={12} />} text="Notas" />
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <input value={eName} onChange={e => setEName(e.target.value)} placeholder="Nombre completo *" style={inputStyle} />
                <input type="email" value={eEmail} onChange={e => setEEmail(e.target.value)} placeholder="Correo" style={inputStyle} />
                <textarea value={eNotes} onChange={e => setENotes(e.target.value)} rows={3} placeholder="Notas internas (visibles para staff)…" style={{ ...inputStyle, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditing(false)} style={btnGhost}>Cancelar</button>
                  <button onClick={saveEdit} disabled={!eName.trim()} style={{ ...btnPrimary, opacity: eName.trim() ? 1 : 0.5 }}><Check size={12} /> Guardar</button>
                </div>
              </div>
            ) : (
              <p style={{ color: guest.notes ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: 13, margin: '4px 0 16px', whiteSpace: 'pre-wrap' }}>
                {guest.notes || 'Sin notas.'}
              </p>
            )}

            {/* Datos y consentimientos */}
            <SectionTitle icon={<ShieldCheck size={12} />} text="Datos y consentimientos" />
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              <span>Correo: {guest.email ?? '—'}</span>
              <span>Cumpleaños: {guest.birthday
                ? new Date(guest.birthday + 'T00:00:00').toLocaleDateString('es-MX', guest.birthday_has_year ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' })
                : '—'}</span>
              <span>Términos: {guest.consent_terms ? `✓ aceptados ${guest.consent_terms_at ? new Date(guest.consent_terms_at).toLocaleDateString('es-MX') : ''}` : '✗ sin aceptar'}</span>
              <span>Marketing: {guest.consent_marketing ? `✓ acepta ${guest.consent_marketing_at ? new Date(guest.consent_marketing_at).toLocaleDateString('es-MX') : ''}` : '✗ no acepta'}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>Registrado el {new Date(guest.created_at).toLocaleDateString('es-MX')}</span>
            </div>

            {/* Actions */}
            {!isAnon && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canWrite && !editing && (
                  <button onClick={() => setEditing(true)} style={btnGhost}><Pencil size={12} /> Editar</button>
                )}
                {canArchive && (
                  <button onClick={archiveGuest} style={btnGhost}>
                    <Archive size={12} /> {guest.status === 'archived' ? 'Restaurar' : 'Archivar'}
                  </button>
                )}
                {isMaster && (
                  <button onClick={() => setConfirmDelete('anonymize')} style={{ ...btnGhost, color: 'var(--status-risk)', borderColor: 'color-mix(in srgb, var(--status-risk) 35%, transparent)' }}>
                    <Trash2 size={12} /> Eliminar / anonimizar
                  </button>
                )}
              </div>
            )}

            {/* Confirm delete/anonymize (MASTER) */}
            {confirmDelete && (
              <div style={{ marginTop: 12, background: 'color-mix(in srgb, var(--status-risk) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--status-risk) 30%, transparent)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                <p style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>Esta acción es permanente.</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '0 0 10px', lineHeight: 1.5 }}>
                  <strong>Anonimizar</strong> borra nombre, teléfono, correo y notas de forma irreversible pero conserva visitas y reservas para estadísticas ("Cliente eliminado"). <strong>Eliminar</strong> borra también todo su historial.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={anonymizeGuest} style={{ ...btnPrimary, background: 'var(--status-risk)', color: '#fff' }}>Anonimizar</button>
                  <button onClick={hardDelete} style={{ ...btnGhost, color: 'var(--status-risk)' }}>Eliminar todo</button>
                  <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function SectionTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
      {icon} {text}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)', padding: '9px 11px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
}
const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px',
  borderRadius: 999, border: '1px solid var(--border-default)', background: 'none',
  color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 16px',
  borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)',
  fontSize: 12, fontWeight: 700, cursor: 'pointer',
}
