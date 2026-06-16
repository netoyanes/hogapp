import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search, Phone, Mail, Building2, Edit2, Check, X } from 'lucide-react'
import { Avatar } from '../components/ui/Avatar'
import { useAutoRefresh } from '../hooks/useAutoRefresh'

interface Contact {
  id: string
  full_name: string
  company: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

interface DealCount {
  contact_id: string
  count: number
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

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '4px',
  fontFamily: 'var(--font-ui)',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  )
}

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [dealCounts, setDealCounts] = useState<DealCount[]>([])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // form state (shared for create & edit)
  const [fName, setFName] = useState('')
  const [fCompany, setFCompany] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fPhone, setFPhone] = useState('')
  const [fNotes, setFNotes] = useState('')

  const load = useCallback(async () => {
    const [{ data: c }, { data: d }] = await Promise.all([
      supabase.from('crm_contacts').select('*').order('full_name'),
      supabase.from('crm_deals').select('contact_id').not('contact_id', 'is', null),
    ])
    if (c) setContacts(c)
    if (d) {
      const counts: Record<string, number> = {}
      for (const row of d) {
        if (row.contact_id) counts[row.contact_id] = (counts[row.contact_id] ?? 0) + 1
      }
      setDealCounts(Object.entries(counts).map(([contact_id, count]) => ({ contact_id, count })))
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  function resetForm() {
    setFName(''); setFCompany(''); setFEmail(''); setFPhone(''); setFNotes('')
  }

  function startCreate() {
    resetForm()
    setEditingId(null)
    setCreating(true)
  }

  function startEdit(c: Contact) {
    setFName(c.full_name)
    setFCompany(c.company ?? '')
    setFEmail(c.email ?? '')
    setFPhone(c.phone ?? '')
    setFNotes(c.notes ?? '')
    setCreating(false)
    setEditingId(c.id)
  }

  async function saveCreate() {
    if (!fName.trim()) return
    setSaving(true)
    await supabase.from('crm_contacts').insert({
      full_name: fName.trim(),
      company: fCompany.trim() || null,
      email: fEmail.trim() || null,
      phone: fPhone.trim() || null,
      notes: fNotes.trim() || null,
    })
    await load()
    setCreating(false)
    resetForm()
    setSaving(false)
  }

  async function saveEdit(id: string) {
    if (!fName.trim()) return
    setSaving(true)
    await supabase.from('crm_contacts').update({
      full_name: fName.trim(),
      company: fCompany.trim() || null,
      email: fEmail.trim() || null,
      phone: fPhone.trim() || null,
      notes: fNotes.trim() || null,
    }).eq('id', id)
    await load()
    setEditingId(null)
    resetForm()
    setSaving(false)
  }

  const q = search.toLowerCase()
  const filtered = contacts.filter(c =>
    c.full_name.toLowerCase().includes(q) ||
    (c.company ?? '').toLowerCase().includes(q) ||
    (c.email ?? '').toLowerCase().includes(q)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, company, email…"
            style={{ ...inputStyle, paddingLeft: '30px' }}
          />
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {filtered.length} contacts
        </span>
        <button
          onClick={startCreate}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}
        >
          <Plus size={14} /> New Contact
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <Field label="Full name *">
              <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Jane Doe" style={inputStyle} autoFocus />
            </Field>
            <Field label="Company">
              <input value={fCompany} onChange={e => setFCompany(e.target.value)} placeholder="Acme Inc." style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="jane@example.com" style={inputStyle} />
            </Field>
            <Field label="Phone">
              <input value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="+1 555 000 0000" style={inputStyle} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} placeholder="Context about this contact…" style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setCreating(false); resetForm() }} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
            <button onClick={saveCreate} disabled={saving || !fName.trim()} style={{ padding: '6px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Add Contact'}
            </button>
          </div>
        </div>
      )}

      {/* Contact list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', paddingTop: '48px' }}>
            {search ? 'No contacts match your search.' : 'No contacts yet. Add the first one above.'}
          </div>
        )}

        {filtered.map(contact => {
          const dealCount = dealCounts.find(d => d.contact_id === contact.id)?.count ?? 0
          const isEditing = editingId === contact.id

          if (isEditing) {
            return (
              <div key={contact.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-border)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <Field label="Full name *">
                    <input value={fName} onChange={e => setFName(e.target.value)} style={inputStyle} autoFocus />
                  </Field>
                  <Field label="Company">
                    <input value={fCompany} onChange={e => setFCompany(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Email">
                    <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Phone">
                    <input value={fPhone} onChange={e => setFPhone(e.target.value)} style={inputStyle} />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </Field>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setEditingId(null); resetForm() }} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <X size={12} /> Cancel
                  </button>
                  <button onClick={() => saveEdit(contact.id)} disabled={saving || !fName.trim()} style={{ padding: '5px 12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', opacity: saving ? 0.6 : 1 }}>
                    <Check size={12} /> Save
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={contact.id}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}
            >
              <Avatar name={contact.full_name} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{contact.full_name}</span>
                  {contact.company && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <Building2 size={10} />{contact.company}
                    </span>
                  )}
                  {dealCount > 0 && (
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: '4px', padding: '1px 5px' }}>
                      {dealCount} deal{dealCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '14px', marginTop: '5px', flexWrap: 'wrap' }}>
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>
                      <Mail size={10} />{contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                      <Phone size={10} />{contact.phone}
                    </a>
                  )}
                </div>
                {contact.notes && (
                  <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '5px', lineHeight: 1.4, margin: '5px 0 0 0' }}>{contact.notes}</p>
                )}
              </div>
              <button
                onClick={() => startEdit(contact)}
                style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                title="Edit contact"
              >
                <Edit2 size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
