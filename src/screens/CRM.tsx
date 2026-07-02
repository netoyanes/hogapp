import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { BusinessUnit } from '../types'
import { Plus, DollarSign, TrendingUp, Target, Briefcase } from 'lucide-react'
import { DealDetailPanel } from '../components/ui/DealDetailPanel'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { notifySlack, dealCreatedMessage, dealLink } from '../hooks/useSlack'

type DealType = 'SPONSORSHIP' | 'PARTNERSHIP' | 'ADVERTISING' | 'EVENT' | 'OTHER'
type DealStage = 'LEAD' | 'CONTACTED' | 'PROPOSAL' | 'NEGOTIATING' | 'WON' | 'LOST'

export interface CRMContact {
  id: string
  full_name: string
  company: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

export interface CRMDeal {
  id: string
  title: string
  deal_type: DealType
  stage: DealStage
  value: number | null
  probability: number
  close_date: string | null
  bu_id: string | null
  contact_id: string | null
  description: string | null
  lost_reason: string | null
  created_by: string | null
  closed_by: string | null
  created_at: string
  updated_at: string
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

function fmt(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

interface Props {
  userRole?: string
  userId?: string
}

export function CRM({ userRole, userId }: Props) {
  const [deals, setDeals] = useState<CRMDeal[]>([])
  const [contacts, setContacts] = useState<CRMContact[]>([])
  const [buses, setBuses] = useState<BusinessUnit[]>([])
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [stageFilter, setStageFilter] = useState<DealStage | ''>('')
  const [buFilter, setBuFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState(() => userRole !== 'MASTER' ? (userId ?? '') : '')

  // create modal state
  const [cTitle, setCTitle] = useState('')
  const [cType, setCType] = useState<DealType>('SPONSORSHIP')
  const [cStage, setCStage] = useState<DealStage>('LEAD')
  const [cValue, setCValue] = useState('')
  const [cProb, setCProb] = useState('50')
  const [cCloseDate, setCCloseDate] = useState('')
  const [cBu, setCBu] = useState('')
  const [cContactId, setCContactId] = useState('')
  const [cDesc, setCDesc] = useState('')
  const [cContactName, setCContactName] = useState('')
  const [cContactCompany, setCContactCompany] = useState('')
  const [cContactEmail, setCContactEmail] = useState('')
  const [newContact, setNewContact] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [{ data: d }, { data: c }, { data: b }] = await Promise.all([
      supabase.from('crm_deals').select('*').order('created_at', { ascending: false }),
      supabase.from('crm_contacts').select('*').order('full_name'),
      supabase.from('business_units').select('*').order('code'),
    ])
    if (d) setDeals(d)
    if (c) setContacts(c)
    if (b) setBuses(b)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('crm-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_deals' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_contacts' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])
  useAutoRefresh(load)

  const openDeals = deals.filter(d => d.stage !== 'WON' && d.stage !== 'LOST')
  const wonDeals  = deals.filter(d => d.stage === 'WON')
  const pipelineValue = openDeals.reduce((s, d) => s + (d.value ?? 0), 0)
  const wonValue      = wonDeals.reduce((s, d) => s + (d.value ?? 0), 0)
  const winRate = deals.filter(d => d.stage === 'WON' || d.stage === 'LOST').length
    ? Math.round((wonDeals.length / deals.filter(d => d.stage === 'WON' || d.stage === 'LOST').length) * 100)
    : 0

  const filtered = deals.filter(d => {
    if (stageFilter && d.stage !== stageFilter) return false
    if (buFilter && d.bu_id !== buFilter) return false
    if (ownerFilter && d.created_by !== ownerFilter) return false
    return true
  })

  const byStage = (stage: DealStage) => filtered.filter(d => d.stage === stage)

  async function save() {
    if (!cTitle.trim()) return
    setSaving(true)
    try {
      let contactId = cContactId || null

      if (newContact && cContactName.trim()) {
        const { data: nc } = await supabase
          .from('crm_contacts')
          .insert({ full_name: cContactName.trim(), company: cContactCompany || null, email: cContactEmail || null })
          .select('id')
          .single()
        if (nc) contactId = nc.id
      }

      const { data: { user } } = await supabase.auth.getUser()

      const { data: newDeal } = await supabase.from('crm_deals').insert({
        title:       cTitle.trim(),
        deal_type:   cType,
        stage:       cStage,
        value:       cValue ? parseFloat(cValue) : null,
        probability: parseInt(cProb) || 50,
        close_date:  cCloseDate || null,
        bu_id:       cBu || null,
        contact_id:  contactId,
        description: cDesc || null,
        created_by:  user?.id ?? null,
      }).select('id').single()

      if (user?.id) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
        const creatorName = profile?.full_name ?? 'Someone'
        const fmtValue = cValue ? fmt(parseFloat(cValue)) : null
        notifySlack(dealCreatedMessage(cTitle.trim(), cType, fmtValue, creatorName, newDeal ? dealLink(newDeal.id) : undefined))
      }

      await load()
      setCreating(false)
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setCTitle(''); setCType('SPONSORSHIP'); setCStage('LEAD'); setCValue('')
    setCProb('50'); setCCloseDate(''); setCBu(''); setCContactId('')
    setCDesc(''); setCContactName(''); setCContactCompany(''); setCContactEmail('')
    setNewContact(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '20px', flex: 1, flexWrap: 'wrap' }}>
          <Stat icon={<DollarSign size={14} />} label="Pipeline" value={fmt(pipelineValue)} color="#3B82F6" />
          <Stat icon={<TrendingUp size={14} />} label="Won" value={fmt(wonValue)} color="#22C55E" />
          <Stat icon={<Briefcase size={14} />} label="Open Deals" value={String(openDeals.length)} color="#8B5CF6" />
          <Stat icon={<Target size={14} />} label="Win Rate" value={`${winRate}%`} color="#F59E0B" />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={buFilter} onChange={e => setBuFilter(e.target.value)} className="filter-select" style={selStyle}>
            <option value="">All BUs</option>
            {buses.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}
          </select>
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value as DealStage | '')} style={selStyle}>
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button
            onClick={() => setOwnerFilter(v => v ? '' : (userId ?? ''))}
            style={{
              background: ownerFilter ? 'var(--accent-bg)' : 'var(--bg-elevated)',
              border: `1px solid ${ownerFilter ? 'var(--accent-border)' : 'var(--border-default)'}`,
              color: ownerFilter ? 'var(--accent)' : 'var(--text-tertiary)',
              borderRadius: '6px', padding: '5px 9px', fontSize: '12px', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
            }}
          >
            {ownerFilter ? 'My Deals' : 'All Deals'}
          </button>
          <button
            onClick={() => setCreating(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}
          >
            <Plus size={14} /> New Deal
          </button>
        </div>
      </div>

      {/* Kanban */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', height: '100%', minWidth: `${STAGES.length * 220}px` }}>
          {STAGES.map(stage => (
            <div key={stage.id} style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px', borderBottom: `2px solid ${stage.color}` }}>
                <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: stage.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stage.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{byStage(stage.id).length}</span>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {byStage(stage.id).map(deal => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    contact={contacts.find(c => c.id === deal.contact_id) ?? null}
                    bu={buses.find(b => b.id === deal.bu_id) ?? null}
                    onClick={() => setSelectedDeal(deal.id)}
                  />
                ))}
                {byStage(stage.id).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-tertiary)', fontSize: '11px' }}>—</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deal detail panel */}
      {selectedDeal && (
        <DealDetailPanel
          dealId={selectedDeal}
          contacts={contacts}
          buses={buses}
          onClose={() => setSelectedDeal(null)}
          onUpdated={load}
          userRole={userRole}
        />
      )}

      {/* Create deal modal */}
      {creating && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setCreating(false)}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>New Deal</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Title *">
                <input value={cTitle} onChange={e => setCTitle(e.target.value)} placeholder="Deal title" style={inputStyle} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Type">
                  <select value={cType} onChange={e => setCType(e.target.value as DealType)} style={inputStyle}>
                    {DEAL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
                  </select>
                </Field>
                <Field label="Stage">
                  <select value={cStage} onChange={e => setCStage(e.target.value as DealStage)} style={inputStyle}>
                    {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Value (USD)">
                  <input type="number" value={cValue} onChange={e => setCValue(e.target.value)} placeholder="0" style={inputStyle} />
                </Field>
                <Field label="Probability %">
                  <input type="number" min={0} max={100} value={cProb} onChange={e => setCProb(e.target.value)} style={inputStyle} />
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Close Date">
                  <input type="date" value={cCloseDate} onChange={e => setCCloseDate(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Business Unit">
                  <select value={cBu} onChange={e => setCBu(e.target.value)} style={inputStyle}>
                    <option value="">None</option>
                    {buses.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}
                  </select>
                </Field>
              </div>

              {/* Contact */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <label style={labelStyle}>Contact</label>
                  <button onClick={() => setNewContact(!newContact)} style={{ fontSize: '10px', color: newContact ? 'var(--accent)' : 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {newContact ? '← Existing' : '+ New contact'}
                  </button>
                </div>
                {newContact ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input value={cContactName} onChange={e => setCContactName(e.target.value)} placeholder="Full name *" style={inputStyle} />
                    <input value={cContactCompany} onChange={e => setCContactCompany(e.target.value)} placeholder="Company" style={inputStyle} />
                    <input value={cContactEmail} onChange={e => setCContactEmail(e.target.value)} placeholder="Email" style={inputStyle} />
                  </div>
                ) : (
                  <select value={cContactId} onChange={e => setCContactId(e.target.value)} style={inputStyle}>
                    <option value="">None</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.company ? ` · ${c.company}` : ''}</option>)}
                  </select>
                )}
              </div>

              <Field label="Description">
                <textarea value={cDesc} onChange={e => setCDesc(e.target.value)} rows={3} placeholder="Context, notes…" style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setCreating(false); resetForm() }} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button onClick={save} disabled={saving || !cTitle.trim()} style={{ padding: '7px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Create Deal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ color, display: 'flex' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
      </div>
    </div>
  )
}

function DealCard({ deal, contact, bu, onClick }: { deal: CRMDeal; contact: CRMContact | null; bu: BusinessUnit | null; onClick: () => void }) {
  const typeColor = DEAL_TYPE_COLORS[deal.deal_type]
  return (
    <button
      onClick={onClick}
      style={{ width: '100%', textAlign: 'left', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderTop: `3px solid ${typeColor}`, borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
        <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{deal.title}</span>
        {bu && <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '1px 4px', flexShrink: 0 }}>{bu.code}</span>}
      </div>

      <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(deal.value)}</div>

      {contact && (
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
          {contact.full_name}{contact.company ? <span style={{ color: 'var(--text-tertiary)' }}> · {contact.company}</span> : null}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: 1, height: '3px', background: 'var(--bg-base)', borderRadius: '2px' }}>
          <div style={{ width: `${deal.probability}%`, height: '100%', background: typeColor, borderRadius: '2px' }} />
        </div>
        <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{deal.probability}%</span>
      </div>

      {deal.close_date && (
        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
          Close: {new Date(deal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

const selStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)',
  borderRadius: '6px',
  padding: '5px 8px',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '4px',
  fontFamily: 'var(--font-ui)',
}
