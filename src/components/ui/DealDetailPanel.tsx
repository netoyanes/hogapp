import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { X, Edit2, Check, ChevronDown, Phone, Mail, MessageSquare, Calendar, Briefcase } from 'lucide-react'
import type { BusinessUnit } from '../../types'
import type { CRMContact, CRMDeal } from '../../screens/CRM'
import { TaskDetailPanel } from './TaskDetailPanel'
import { Avatar } from './Avatar'

type DealStage = 'LEAD' | 'CONTACTED' | 'PROPOSAL' | 'NEGOTIATING' | 'WON' | 'LOST'
type DealType  = 'SPONSORSHIP' | 'PARTNERSHIP' | 'ADVERTISING' | 'EVENT' | 'OTHER'
type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE'

interface Activity {
  id: string
  deal_id: string
  type: ActivityType
  body: string
  created_by: string | null
  created_at: string
  profile?: { full_name: string | null }
}

interface LinkedTask {
  id: string
  title: string
  status: string
  priority: string
}

const STAGES: { id: DealStage; label: string; color: string }[] = [
  { id: 'LEAD',        label: 'Lead',        color: '#6B7280' },
  { id: 'CONTACTED',   label: 'Contacted',   color: '#3B82F6' },
  { id: 'PROPOSAL',    label: 'Proposal',    color: '#F59E0B' },
  { id: 'NEGOTIATING', label: 'Negotiating', color: '#8B5CF6' },
  { id: 'WON',         label: 'Won',         color: '#22C55E' },
  { id: 'LOST',        label: 'Lost',        color: '#EF4444' },
]

const DEAL_TYPE_COLORS: Record<DealType, string> = {
  SPONSORSHIP: '#EC4899',
  PARTNERSHIP: '#3B82F6',
  ADVERTISING: '#F97316',
  EVENT:       '#8B5CF6',
  OTHER:       '#6B7280',
}

const DEAL_TYPES: DealType[] = ['SPONSORSHIP', 'PARTNERSHIP', 'ADVERTISING', 'EVENT', 'OTHER']

const STATUS_DOTS: Record<string, string> = {
  OPEN: '#6B7280', IN_PROGRESS: '#3B82F6', PROOF_SUBMITTED: '#F59E0B',
  APPROVED: '#22C55E', REVISION: '#EF4444',
}

const ACT_ICONS: Record<ActivityType, React.ElementType> = {
  CALL: Phone, EMAIL: Mail, MEETING: Calendar, NOTE: MessageSquare,
}

function fmt(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

interface Props {
  dealId: string
  contacts: CRMContact[]
  buses: BusinessUnit[]
  onClose: () => void
  onUpdated: () => void
  userRole?: string
}

export function DealDetailPanel({ dealId, contacts, buses, onClose, onUpdated, userRole }: Props) {
  const [deal, setDeal] = useState<CRMDeal | null>(null)
  const [creatorName, setCreatorName] = useState<string | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([])
  const [availTasks, setAvailTasks] = useState<LinkedTask[]>([])
  const [editing, setEditing] = useState(false)
  const [lostModal, setLostModal] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [actType, setActType] = useState<ActivityType>('NOTE')
  const [actBody, setActBody] = useState('')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  // edit state
  const [eTitle, setETitle] = useState('')
  const [eType, setEType] = useState<DealType>('OTHER')
  const [eValue, setEValue] = useState('')
  const [eProb, setEProb] = useState('')
  const [eCloseDate, setECloseDate] = useState('')
  const [eBu, setEBu] = useState('')
  const [eContactId, setEContactId] = useState('')
  const [eDesc, setEDesc] = useState('')

  const panelRef = useRef<HTMLDivElement>(null)

  const loadDeal = useCallback(async () => {
    const { data } = await supabase.from('crm_deals').select('*').eq('id', dealId).single()
    if (data) {
      setDeal(data)
      setETitle(data.title)
      setEType(data.deal_type)
      setEValue(data.value != null ? String(data.value) : '')
      setEProb(String(data.probability))
      setECloseDate(data.close_date ?? '')
      setEBu(data.bu_id ?? '')
      setEContactId(data.contact_id ?? '')
      setEDesc(data.description ?? '')
      if (data.created_by) {
        const { data: creator } = await supabase.from('profiles').select('full_name, email').eq('id', data.created_by).single()
        setCreatorName(creator?.full_name ?? creator?.email ?? null)
      }
    }
  }, [dealId])

  const loadActivities = useCallback(async () => {
    const { data } = await supabase
      .from('crm_activities')
      .select('*, profile:profiles(full_name)')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
    if (data) setActivities(data as Activity[])
  }, [dealId])

  const loadLinkedTasks = useCallback(async () => {
    const { data: links } = await supabase.from('crm_deal_tasks').select('task_id').eq('deal_id', dealId)
    if (!links?.length) { setLinkedTasks([]); return }
    const ids = links.map(l => l.task_id)
    const { data: tasks } = await supabase.from('tasks').select('id, title, status, priority').in('id', ids)
    if (tasks) setLinkedTasks(tasks)
  }, [dealId])

  const loadAvailTasks = useCallback(async () => {
    const { data } = await supabase.from('tasks').select('id, title, status, priority').eq('archived', false).order('created_at', { ascending: false })
    if (data) setAvailTasks(data)
  }, [])

  useEffect(() => {
    loadDeal()
    loadActivities()
    loadLinkedTasks()
    loadAvailTasks()
  }, [loadDeal, loadActivities, loadLinkedTasks, loadAvailTasks])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function changeStage(stage: DealStage) {
    if (stage === 'LOST') { setLostModal(true); return }
    await supabase.from('crm_deals').update({ stage, lost_reason: null, updated_at: new Date().toISOString() }).eq('id', dealId)
    setDeal(d => d ? { ...d, stage, lost_reason: null } : d)
    onUpdated()
  }

  async function confirmLost() {
    await supabase.from('crm_deals').update({ stage: 'LOST', lost_reason: lostReason || null, updated_at: new Date().toISOString() }).eq('id', dealId)
    setDeal(d => d ? { ...d, stage: 'LOST', lost_reason: lostReason || null } : d)
    setLostModal(false)
    setLostReason('')
    onUpdated()
  }

  async function saveEdit() {
    await supabase.from('crm_deals').update({
      title: eTitle,
      deal_type: eType,
      value: eValue ? parseFloat(eValue) : null,
      probability: parseInt(eProb) || 50,
      close_date: eCloseDate || null,
      bu_id: eBu || null,
      contact_id: eContactId || null,
      description: eDesc || null,
      updated_at: new Date().toISOString(),
    }).eq('id', dealId)
    await loadDeal()
    setEditing(false)
    onUpdated()
  }

  async function deleteDeal() {
    if (!confirm('Delete this deal? This cannot be undone.')) return
    await supabase.from('crm_deals').delete().eq('id', dealId)
    onUpdated()
    onClose()
  }

  async function addActivity() {
    if (!actBody.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('crm_activities').insert({
      deal_id: dealId,
      type: actType,
      body: actBody.trim(),
      created_by: user?.id ?? null,
    })
    setActBody('')
    await loadActivities()
  }

  async function linkTask(taskId: string) {
    await supabase.from('crm_deal_tasks').upsert({ deal_id: dealId, task_id: taskId })
    await loadLinkedTasks()
  }

  async function unlinkTask(taskId: string) {
    await supabase.from('crm_deal_tasks').delete().eq('deal_id', dealId).eq('task_id', taskId)
    setLinkedTasks(prev => prev.filter(t => t.id !== taskId))
  }

  if (!deal) return null

  const stageInfo = STAGES.find(s => s.id === deal.stage)
  const contact   = contacts.find(c => c.id === deal.contact_id)
  const bu        = buses.find(b => b.id === deal.bu_id)
  const typeColor = DEAL_TYPE_COLORS[deal.deal_type as DealType] ?? '#6B7280'
  const unlinkedTasks = availTasks.filter(t => !linkedTasks.some(l => l.id === t.id))

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(480px, 100vw)',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-subtle)',
          zIndex: 45,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              {editing ? (
                <input value={eTitle} onChange={e => setETitle(e.target.value)} style={{ ...inputStyle, fontSize: '14px', fontWeight: 700 }} />
              ) : (
                <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{deal.title}</h2>
              )}
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: typeColor, background: `${typeColor}15`, padding: '2px 6px', borderRadius: '4px' }}>
                  {deal.deal_type}
                </span>
                {bu && <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '2px 6px', borderRadius: '4px' }}>{bu.code}</span>}
                {deal.stage === 'WON' && <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#22C55E', background: '#22C55E15', padding: '2px 6px', borderRadius: '4px' }}>WON</span>}
                {deal.stage === 'LOST' && <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#EF4444', background: '#EF444415', padding: '2px 6px', borderRadius: '4px' }}>LOST</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {editing ? (
                <button onClick={saveEdit} style={iconBtn('#22C55E')}><Check size={14} /></button>
              ) : (
                <button onClick={() => setEditing(true)} style={iconBtn()}><Edit2 size={14} /></button>
              )}
              <button onClick={onClose} style={iconBtn()}><X size={14} /></button>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Stage pipeline */}
          <section>
            <SectionLabel>Pipeline Stage</SectionLabel>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {STAGES.map(s => (
                <button
                  key={s.id}
                  onClick={() => changeStage(s.id)}
                  style={{
                    fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)',
                    padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
                    border: `1px solid ${deal.stage === s.id ? s.color : 'var(--border-subtle)'}`,
                    background: deal.stage === s.id ? `${s.color}20` : 'transparent',
                    color: deal.stage === s.id ? s.color : 'var(--text-tertiary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {deal.stage === 'LOST' && deal.lost_reason && (
              <p style={{ fontSize: '11px', color: '#EF4444', marginTop: '6px', fontStyle: 'italic' }}>Reason: {deal.lost_reason}</p>
            )}
          </section>

          {/* Meta */}
          <section>
            <SectionLabel>Details</SectionLabel>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <EditField label="Type">
                    <select value={eType} onChange={e => setEType(e.target.value as DealType)} style={inputStyle}>
                      {DEAL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
                    </select>
                  </EditField>
                  <EditField label="Value (USD)">
                    <input type="number" value={eValue} onChange={e => setEValue(e.target.value)} style={inputStyle} />
                  </EditField>
                  <EditField label="Probability %">
                    <input type="number" min={0} max={100} value={eProb} onChange={e => setEProb(e.target.value)} style={inputStyle} />
                  </EditField>
                  <EditField label="Close Date">
                    <input type="date" value={eCloseDate} onChange={e => setECloseDate(e.target.value)} style={inputStyle} />
                  </EditField>
                  <EditField label="Business Unit">
                    <select value={eBu} onChange={e => setEBu(e.target.value)} style={inputStyle}>
                      <option value="">None</option>
                      {buses.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}
                    </select>
                  </EditField>
                  <EditField label="Contact">
                    <select value={eContactId} onChange={e => setEContactId(e.target.value)} style={inputStyle}>
                      <option value="">None</option>
                      {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </select>
                  </EditField>
                </div>
                <EditField label="Description">
                  <textarea value={eDesc} onChange={e => setEDesc(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </EditField>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <MetaRow label="Value">{fmt(deal.value)}</MetaRow>
                <MetaRow label="Probability">
                  <span>{deal.probability}%</span>
                  <div style={{ marginTop: '3px', height: '3px', background: 'var(--bg-base)', borderRadius: '2px' }}>
                    <div style={{ width: `${deal.probability}%`, height: '100%', background: stageInfo?.color ?? '#6B7280', borderRadius: '2px' }} />
                  </div>
                </MetaRow>
                <MetaRow label="Close Date">{deal.close_date ? new Date(deal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</MetaRow>
                <MetaRow label="Business Unit">{bu?.code ?? '—'}</MetaRow>
                {creatorName && (
                  <MetaRow label="Created by">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <Avatar name={creatorName} size={18} />
                      <span>{creatorName}</span>
                    </div>
                  </MetaRow>
                )}
              </div>
            )}
          </section>

          {/* Contact */}
          {contact && !editing && (
            <section>
              <SectionLabel>Contact</SectionLabel>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{contact.full_name}</div>
                {contact.company && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{contact.company}</div>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {contact.email && <a href={`mailto:${contact.email}`} style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}><Mail size={10} />{contact.email}</a>}
                  {contact.phone && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={10} />{contact.phone}</span>}
                </div>
              </div>
            </section>
          )}

          {/* Description */}
          {deal.description && !editing && (
            <section>
              <SectionLabel>Description</SectionLabel>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{deal.description}</p>
            </section>
          )}

          {/* Linked Tasks */}
          <section>
            <SectionLabel>Linked Tasks</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {linkedTasks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '7px 10px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_DOTS[t.status] ?? '#6B7280', flexShrink: 0 }} />
                  <button onClick={() => setOpenTaskId(t.id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-primary)', padding: 0 }}>{t.title}</button>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{t.status.replace('_', ' ')}</span>
                  <button onClick={() => unlinkTask(t.id)} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
              ))}

              {unlinkedTasks.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <select
                    onChange={e => { if (e.target.value) { linkTask(e.target.value); (e.target as HTMLSelectElement).value = '' } }}
                    style={{ ...inputStyle, color: 'var(--text-tertiary)' }}
                    defaultValue=""
                  >
                    <option value="" disabled>+ Link a task…</option>
                    {unlinkedTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                  <ChevronDown size={12} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                </div>
              )}
            </div>
          </section>

          {/* Activity Log */}
          <section>
            <SectionLabel>Activity</SectionLabel>

            {/* Input */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              {(['NOTE', 'CALL', 'EMAIL', 'MEETING'] as ActivityType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setActType(t)}
                  style={{ fontSize: '9px', fontWeight: 600, fontFamily: 'var(--font-mono)', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${actType === t ? 'var(--accent)' : 'var(--border-subtle)'}`, background: actType === t ? 'var(--accent-bg)' : 'transparent', color: actType === t ? 'var(--accent)' : 'var(--text-tertiary)' }}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={actBody}
                onChange={e => setActBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addActivity() } }}
                placeholder="Add a note, log a call…"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={addActivity} disabled={!actBody.trim()} style={{ padding: '7px 12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, opacity: actBody.trim() ? 1 : 0.4 }}>Add</button>
            </div>

            {/* Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              {activities.map(a => {
                const Icon = ACT_ICONS[a.type]
                const authorName = a.profile?.full_name ?? 'Unknown'
                return (
                  <div key={a.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar name={authorName} size={28} />
                      <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={7} style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{authorName}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{a.body}</div>
                    </div>
                  </div>
                )
              })}

              {/* Deal created entry — always shown as the baseline log entry */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {creatorName ? (
                    <Avatar name={creatorName} size={28} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Briefcase size={12} style={{ color: 'var(--text-tertiary)' }} />
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Briefcase size={7} style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{creatorName ?? 'Unknown'}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(deal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.4, fontStyle: 'italic' }}>Deal created</div>
                </div>
              </div>
            </div>
          </section>

          {/* Danger zone */}
          <section style={{ paddingTop: '4px', borderTop: '1px solid var(--border-subtle)' }}>
            <button onClick={deleteDeal} style={{ fontSize: '11px', color: 'var(--status-risk)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete deal</button>
          </section>
        </div>
      </div>

      {/* Lost reason modal */}
      {lostModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '360px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Mark as Lost</h3>
            <textarea
              value={lostReason}
              onChange={e => setLostReason(e.target.value)}
              rows={3}
              placeholder="Reason (optional)"
              style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: '16px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setLostModal(false)} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button onClick={confirmLost} style={{ padding: '7px 14px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Mark Lost</button>
            </div>
          </div>
        </div>
      )}

      {/* Nested task panel */}
      {openTaskId && (
        <TaskDetailPanel
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onUpdated={() => {}}
          userRole={userRole}
        />
      )}
    </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', fontFamily: 'var(--font-ui)' }}>{children}</div>
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '2px', fontFamily: 'var(--font-ui)' }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{children}</div>
    </div>
  )
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontFamily: 'var(--font-ui)' }}>{label}</label>
      {children}
    </div>
  )
}

function iconBtn(color?: string): React.CSSProperties {
  return {
    width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '6px',
    cursor: 'pointer', color: color ?? 'var(--text-secondary)',
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-base)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '6px',
  padding: '7px 10px',
  fontSize: '12px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
}
