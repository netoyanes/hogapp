import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Platform = 'INSTAGRAM' | 'FACEBOOK' | 'WHATSAPP' | 'TIKTOK' | 'OTHER'
type ContentType = 'POST' | 'STORY' | 'REEL' | 'VIDEO' | 'CAROUSEL'
type ContentStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'CANCELLED'

interface ContentEntry {
  id: string
  bu_id: string
  title: string
  caption: string | null
  platform: Platform
  content_type: ContentType
  status: ContentStatus
  scheduled_for: string
  task_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const PLATFORM_COLORS: Record<Platform, string> = {
  INSTAGRAM: '#E1306C',
  FACEBOOK: '#1877F2',
  WHATSAPP: '#25D366',
  TIKTOK: '#FF0050',
  OTHER: '#8B5CF6',
}

const PLATFORM_ICONS: Record<Platform, string> = {
  INSTAGRAM: '📸',
  FACEBOOK: '👥',
  WHATSAPP: '💬',
  TIKTOK: '🎵',
  OTHER: '📱',
}

const STATUS_COLORS: Record<ContentStatus, string> = {
  DRAFT: '#6B7280',
  SCHEDULED: '#3B82F6',
  PUBLISHED: '#22C55E',
  CANCELLED: '#EF4444',
}

const PLATFORMS: Platform[] = ['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'TIKTOK', 'OTHER']
const CONTENT_TYPES: ContentType[] = ['POST', 'STORY', 'REEL', 'VIDEO', 'CAROUSEL']
const STATUSES: ContentStatus[] = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED']

interface Props {
  userRole?: string
}

export function ContentCalendar({ userRole: _userRole }: Props) {
  const today = new Date()
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [entries, setEntries] = useState<ContentEntry[]>([])
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [taskList, setTaskList] = useState<{ id: string; title: string; bu_id: string | null }[]>([])
  const [filterBu, setFilterBu] = useState('')
  const [filterPlatform, setFilterPlatform] = useState<Platform | ''>('')
  const [filterStatus, setFilterStatus] = useState<ContentStatus | ''>('')
  const [loading, setLoading] = useState(true)

  // Modal
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; entry?: ContentEntry } | null>(null)
  const [fBuId, setFBuId] = useState('')
  const [fTitle, setFTitle] = useState('')
  const [fCaption, setFCaption] = useState('')
  const [fPlatform, setFPlatform] = useState<Platform>('INSTAGRAM')
  const [fContentType, setFContentType] = useState<ContentType>('POST')
  const [fStatus, setFStatus] = useState<ContentStatus>('DRAFT')
  const [fDate, setFDate] = useState('')
  const [fTaskId, setFTaskId] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: ents }, { data: buses }, { data: tasks }] = await Promise.all([
        supabase.from('content_calendar').select('*').order('scheduled_for'),
        supabase.from('business_units').select('id, code, name').order('name'),
        supabase.from('tasks').select('id, title, bu_id').eq('archived', false).order('title'),
      ])
      setEntries((ents ?? []) as ContentEntry[])
      setBuList(buses ?? [])
      setTaskList(tasks ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const year = current.getFullYear()
  const month = current.getMonth()

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const filtered = entries.filter(e => {
    if (filterBu && e.bu_id !== filterBu) return false
    if (filterPlatform && e.platform !== filterPlatform) return false
    if (filterStatus && e.status !== filterStatus) return false
    return true
  })

  function entriesForDay(day: number): ContentEntry[] {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return filtered.filter(e => e.scheduled_for === dateStr)
  }

  function isToday(day: number) {
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
  }

  function toDateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function openCreate(dateStr: string) {
    setFBuId(filterBu || buList[0]?.id || '')
    setFTitle('')
    setFCaption('')
    setFPlatform(filterPlatform || 'INSTAGRAM')
    setFContentType('POST')
    setFStatus('DRAFT')
    setFDate(dateStr)
    setFTaskId('')
    setFNotes('')
    setModal({ mode: 'create' })
  }

  function openEdit(entry: ContentEntry) {
    setFBuId(entry.bu_id)
    setFTitle(entry.title)
    setFCaption(entry.caption ?? '')
    setFPlatform(entry.platform)
    setFContentType(entry.content_type)
    setFStatus(entry.status)
    setFDate(entry.scheduled_for)
    setFTaskId(entry.task_id ?? '')
    setFNotes(entry.notes ?? '')
    setModal({ mode: 'edit', entry })
  }

  async function save() {
    if (!fTitle.trim() || !fBuId || !fDate) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      bu_id: fBuId,
      title: fTitle.trim(),
      caption: fCaption || null,
      platform: fPlatform,
      content_type: fContentType,
      status: fStatus,
      scheduled_for: fDate,
      task_id: fTaskId || null,
      notes: fNotes || null,
      updated_at: new Date().toISOString(),
    }
    if (modal?.mode === 'edit' && modal.entry) {
      const { data } = await supabase.from('content_calendar').update(payload).eq('id', modal.entry.id).select().single()
      setEntries(prev => prev.map(e => e.id === modal.entry!.id ? data as ContentEntry : e))
    } else {
      const { data } = await supabase.from('content_calendar').insert({ ...payload, created_by: user?.id }).select().single()
      setEntries(prev => [...prev, data as ContentEntry].sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)))
    }
    setSaving(false)
    setModal(null)
  }

  async function deleteEntry() {
    if (!modal?.entry) return
    setDeleting(true)
    await supabase.from('content_calendar').delete().eq('id', modal.entry.id)
    setEntries(prev => prev.filter(e => e.id !== modal.entry!.id))
    setDeleting(false)
    setModal(null)
  }

  const thisMonthCount = filtered.filter(e => {
    const d = new Date(e.scheduled_for + 'T00:00:00')
    return d.getFullYear() === year && d.getMonth() === month
  }).length

  const inputStyle = {
    background: 'var(--bg-base)',
    border: '1px solid var(--border-default)',
    borderRadius: '7px',
    color: 'var(--text-primary)',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    width: '100%',
  }

  const selectStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: 'var(--font-ui)',
    outline: 'none',
    cursor: 'pointer',
  }

  const btnStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    color: 'var(--text-secondary)',
    padding: '5px 8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  }

  const label = (text: string) => (
    <label style={{ color: 'var(--text-secondary)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>{text}</label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, padding: '14px 20px' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '17px' }}>Content Calendar</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{thisMonthCount} piece{thisMonthCount !== 1 ? 's' : ''} this month</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))} style={selectStyle}>Today</button>
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))} style={btnStyle}><ChevronLeft size={14} /></button>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', minWidth: '140px', textAlign: 'center' }}>
              {MONTHS[month]} {year}
            </span>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))} style={btnStyle}><ChevronRight size={14} /></button>
          </div>
        </div>

        {/* Filters + platform legend */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterBu} onChange={e => setFilterBu(e.target.value)} style={selectStyle}>
            <option value="">All BUs</option>
            {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
          <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value as Platform | '')} style={selectStyle}>
            <option value="">All platforms</option>
            {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_ICONS[p]} {p}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ContentStatus | '')} style={selectStyle}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {(filterBu || filterPlatform || filterStatus) && (
            <button onClick={() => { setFilterBu(''); setFilterPlatform(''); setFilterStatus('') }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer' }}>Clear</button>
          )}

          {/* Platform legend */}
          <div className="flex items-center gap-3 ml-auto" style={{ overflowX: 'auto' }}>
            {PLATFORMS.map(p => (
              <div key={p} className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: PLATFORM_COLORS[p], flexShrink: 0 }} />
                <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
          {DAYS.map(d => (
            <div key={d} style={{ color: 'var(--text-tertiary)', fontSize: '11px', fontWeight: 600, textAlign: 'center', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} style={{ minHeight: '110px' }} />
            const dayEntries = loading ? [] : entriesForDay(day)
            const visible = dayEntries.slice(0, 4)
            const overflow = dayEntries.length - 4

            return (
              <div
                key={day}
                style={{
                  minHeight: '110px',
                  background: isToday(day) ? 'var(--accent-bg)' : 'var(--bg-surface)',
                  border: `1px solid ${isToday(day) ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                  borderRadius: '8px',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span style={{
                    color: isToday(day) ? 'var(--accent)' : 'var(--text-tertiary)',
                    fontSize: '11px', fontWeight: isToday(day) ? 700 : 400, fontFamily: 'var(--font-mono)',
                  }}>
                    {day}
                  </span>
                  <button
                    onClick={() => openCreate(toDateStr(day))}
                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 2px', opacity: 0.5 }}
                    title={`Add content for ${MONTHS[month]} ${day}`}
                  >
                    +
                  </button>
                </div>

                {visible.map(entry => {
                  const color = PLATFORM_COLORS[entry.platform]
                  const bu = buList.find(b => b.id === entry.bu_id)
                  return (
                    <button
                      key={entry.id}
                      onClick={() => openEdit(entry)}
                      title={`${entry.title} · ${entry.platform} · ${entry.content_type} · ${entry.status}`}
                      style={{
                        background: `${color}12`,
                        border: `1px solid ${color}35`,
                        borderLeft: `3px solid ${color}`,
                        borderRadius: '4px',
                        padding: '3px 5px',
                        fontSize: '10px',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        minWidth: 0,
                      }}
                    >
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: STATUS_COLORS[entry.status], flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{entry.title}</span>
                      {bu && <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '9px', flexShrink: 0 }}>{bu.code}</span>}
                    </button>
                  )
                })}

                {overflow > 0 && (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', paddingLeft: '4px' }}>+{overflow} more</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Status legend */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, padding: '8px 20px' }}>
        <div className="flex items-center gap-4">
          {STATUSES.map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_COLORS[s] }} />
              <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
        >
          <div
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', width: '100%', maxWidth: '540px', maxHeight: '92vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '15px' }}>
                  {modal.mode === 'create' ? 'Plan Content' : 'Edit Content'}
                </h2>
                {modal.mode === 'edit' && modal.entry && (
                  <div className="flex items-center gap-2 mt-1">
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: PLATFORM_COLORS[modal.entry.platform] }} />
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{modal.entry.platform} · {modal.entry.content_type}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {modal.mode === 'edit' && (
                  <button
                    onClick={deleteEntry}
                    disabled={deleting}
                    style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#EF4444', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    {deleting ? '…' : 'Delete'}
                  </button>
                )}
                <button onClick={() => setModal(null)} style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', padding: '5px', borderRadius: '6px', cursor: 'pointer' }}>
                  <X size={13} />
                </button>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* BU + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  {label('Business Unit *')}
                  <select value={fBuId} onChange={e => setFBuId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">— Select BU —</option>
                    {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                  </select>
                </div>
                <div>
                  {label('Scheduled for *')}
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-default)')} />
                </div>
              </div>

              {/* Title */}
              <div>
                {label('Title *')}
                <input
                  autoFocus value={fTitle} onChange={e => setFTitle(e.target.value)}
                  placeholder="Content title or topic"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>

              {/* Platform + Type + Status */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  {label('Platform')}
                  <select
                    value={fPlatform} onChange={e => setFPlatform(e.target.value as Platform)}
                    style={{ ...inputStyle, cursor: 'pointer', borderColor: `${PLATFORM_COLORS[fPlatform]}70` }}
                  >
                    {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_ICONS[p]} {p}</option>)}
                  </select>
                </div>
                <div>
                  {label('Type')}
                  <select value={fContentType} onChange={e => setFContentType(e.target.value as ContentType)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  {label('Status')}
                  <select
                    value={fStatus} onChange={e => setFStatus(e.target.value as ContentStatus)}
                    style={{ ...inputStyle, cursor: 'pointer', borderColor: `${STATUS_COLORS[fStatus]}70` }}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Caption */}
              <div>
                {label('Caption / Copy')}
                <textarea
                  value={fCaption} onChange={e => setFCaption(e.target.value)}
                  rows={5} placeholder="Write the actual post copy here — hashtags, call to action, emojis..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
                />
                {fCaption.length > 0 && (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', float: 'right', marginTop: '4px' }}>
                    {fCaption.length} chars
                  </span>
                )}
              </div>

              {/* Linked task */}
              <div>
                {label('Linked Task (optional)')}
                <select value={fTaskId} onChange={e => setFTaskId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">— None —</option>
                  {taskList
                    .filter(t => !fBuId || t.bu_id === fBuId)
                    .map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>

              {/* Notes */}
              <div>
                {label('Internal Notes')}
                <textarea
                  value={fNotes} onChange={e => setFNotes(e.target.value)}
                  rows={2} placeholder="References, links, design requests, instructions for the team..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setModal(null)} style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '10px', fontSize: '13px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || !fTitle.trim() || !fBuId || !fDate}
                  style={{
                    flex: 2,
                    background: (fTitle.trim() && fBuId && fDate) ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: (fTitle.trim() && fBuId && fDate) ? 'var(--on-accent)' : 'var(--text-tertiary)',
                    borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 600, border: 'none',
                    cursor: (fTitle.trim() && fBuId && fDate) ? 'pointer' : 'not-allowed',
                  }}
                >
                  {saving ? 'Saving…' : modal.mode === 'create' ? 'Add to Calendar' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
