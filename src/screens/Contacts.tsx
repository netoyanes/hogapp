import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Search, Phone, Mail, Building2, Edit2, Check, X, Archive, ArchiveRestore, Trash2, ShieldCheck } from 'lucide-react'
import { Avatar } from '../components/ui/Avatar'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { useIsMobile } from '../hooks/useIsMobile'

// ── Contact types ────────────────────────────────────────────────────────────
const CONTACT_TYPES = [
  { id: 'VENUE_CLIENT', label: 'Cliente venue', color: '#22C55E' },
  { id: 'SPONSOR',      label: 'Patrocinador',      color: '#EC4899' },
  { id: 'PARTNER',      label: 'Socio',      color: '#3B82F6' },
  { id: 'VENDOR',       label: 'Proveedor',       color: '#F97316' },
  { id: 'PROSPECT',     label: 'Prospecto',     color: '#EAB308' },
  { id: 'OTHER',        label: 'Otro',        color: '#6B7280' },
] as const

const TYPE_COLOR: Record<string, string> = Object.fromEntries(CONTACT_TYPES.map(t => [t.id, t.color]))
const TYPE_LABEL: Record<string, string> = Object.fromEntries(CONTACT_TYPES.map(t => [t.id, t.label]))
const HOG_COLOR = '#A855F7'

interface Contact {
  id: string
  full_name: string
  company: string | null
  email: string | null
  phone: string | null
  notes: string | null
  contact_type: string | null
  created_by: string | null
  archived: boolean | null
}

// A HOG team member rendered as a read-only directory entry
interface HogEntry {
  id: string
  full_name: string
  email: string | null
  isHog: true
}

interface Props {
  userRole?: string
  userId?: string
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

export function Contacts({ userRole, userId }: Props) {
  const isMobile = useIsMobile()
  // Directorio con dos mundos separados: B2B (crm_contacts) y Clientes (guests)
  const isMaster = userRole === 'MASTER'
  // Only entry-level TEAM is restricted to venue clients; everyone else sees all.
  const restrictedToVenue = userRole === 'TEAM'

  const [contacts, setContacts] = useState<Contact[]>([])
  const [hogMembers, setHogMembers] = useState<HogEntry[]>([])
  const [dealCounts, setDealCounts] = useState<Record<string, number>>({})
  const [finders, setFinders] = useState<Record<string, string>>({}) // userId → name
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // form state (shared for create & edit)
  const [fName, setFName] = useState('')
  const [fCompany, setFCompany] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fPhone, setFPhone] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [fType, setFType] = useState<string>(restrictedToVenue ? 'VENUE_CLIENT' : 'PROSPECT')

  const load = useCallback(async () => {
    const [{ data: c }, { data: d }, { data: members }] = await Promise.all([
      supabase.from('crm_contacts').select('*').order('full_name'),
      supabase.from('crm_deals').select('contact_id').not('contact_id', 'is', null),
      supabase.from('profiles').select('id, full_name, email').not('full_name', 'is', null).order('full_name'),
    ])
    if (c) setContacts(c as Contact[])
    if (d) {
      const counts: Record<string, number> = {}
      for (const row of d) if (row.contact_id) counts[row.contact_id] = (counts[row.contact_id] ?? 0) + 1
      setDealCounts(counts)
    }
    if (members) {
      setHogMembers(members.map(m => ({ id: m.id, full_name: m.full_name ?? m.email ?? 'Unknown', email: m.email, isHog: true as const })))
      const names: Record<string, string> = {}
      for (const m of members) names[m.id] = m.full_name ?? m.email ?? 'Unknown'
      setFinders(names)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  function resetForm() {
    setFName(''); setFCompany(''); setFEmail(''); setFPhone(''); setFNotes('')
    setFType(restrictedToVenue ? 'VENUE_CLIENT' : 'PROSPECT')
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
    setFType(c.contact_type ?? 'OTHER')
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
      contact_type: restrictedToVenue ? 'VENUE_CLIENT' : fType,
      created_by: userId ?? null,
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
      contact_type: fType,
    }).eq('id', id)
    await load()
    setEditingId(null)
    resetForm()
    setSaving(false)
  }

  async function setArchived(id: string, archived: boolean) {
    await supabase.from('crm_contacts').update({ archived }).eq('id', id)
    await load()
  }

  async function deleteContact(id: string) {
    await supabase.from('crm_contacts').delete().eq('id', id)
    setConfirmDelete(null)
    await load()
  }

  // ── Filtering ────────────────────────────────────────────────────────────
  const q = search.toLowerCase()

  let visibleContacts = contacts.filter(c => {
    if (restrictedToVenue && c.contact_type !== 'VENUE_CLIENT') return false
    if (!showArchived && c.archived) return false
    return true
  })
  if (typeFilter !== 'ALL' && typeFilter !== 'HOG_INTERNAL') {
    visibleContacts = visibleContacts.filter(c => (c.contact_type ?? 'OTHER') === typeFilter)
  }
  visibleContacts = visibleContacts.filter(c =>
    c.full_name.toLowerCase().includes(q) ||
    (c.company ?? '').toLowerCase().includes(q) ||
    (c.email ?? '').toLowerCase().includes(q)
  )

  // HOG team members shown when not restricted, and matching the type filter (ALL or HOG_INTERNAL)
  const showHog = !restrictedToVenue && (typeFilter === 'ALL' || typeFilter === 'HOG_INTERNAL')
  const visibleHog = showHog
    ? hogMembers.filter(m => m.full_name.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q))
    : []

  const totalShown = visibleContacts.length + visibleHog.length

  // Filter chips available to this user
  const availableTypes = restrictedToVenue
    ? [{ id: 'VENUE_CLIENT', label: 'Cliente venue', color: '#22C55E' }]
    : [{ id: 'ALL', label: 'Todos', color: 'var(--accent)' }, ...CONTACT_TYPES, { id: 'HOG_INTERNAL', label: 'Equipo HOG', color: HOG_COLOR }]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Los clientes consumidores viven ahora en Concierge → Clientes; aquí solo B2B */}
      <>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '320px' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en el directorio…"
            style={{ ...inputStyle, paddingLeft: '30px' }}
          />
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {totalShown} registros
        </span>
        {isMaster && (
          <button
            onClick={() => setShowArchived(v => !v)}
            style={{ padding: '6px 10px', background: showArchived ? 'var(--accent-bg)' : 'transparent', border: `1px solid ${showArchived ? 'var(--accent-border)' : 'var(--border-subtle)'}`, color: showArchived ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap' }}
          >
            {showArchived ? 'Ocultar archivados' : 'Ver archivados'}
          </button>
        )}
        <button
          onClick={startCreate}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}
        >
          <Plus size={14} /> Crear contacto
        </button>
      </div>

      {/* Type filter chips */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '6px', overflowX: 'auto', flexShrink: 0 }}>
        {availableTypes.map(t => {
          const active = typeFilter === t.id || (restrictedToVenue && t.id === 'VENUE_CLIENT')
          return (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id)}
              style={{
                padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap', cursor: 'pointer',
                fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-ui)',
                background: active ? `${t.color}22` : 'transparent',
                border: `1px solid ${active ? t.color : 'var(--border-subtle)'}`,
                color: active ? t.color : 'var(--text-secondary)',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
            <Field label="Nombre completo *">
              <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Jane Doe" style={inputStyle} autoFocus />
            </Field>
            <Field label="Tipo">
              <select value={fType} onChange={e => setFType(e.target.value)} style={inputStyle} disabled={restrictedToVenue}>
                {(restrictedToVenue ? CONTACT_TYPES.filter(t => t.id === 'VENUE_CLIENT') : CONTACT_TYPES).map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Empresa">
              <input value={fCompany} onChange={e => setFCompany(e.target.value)} placeholder="Acme Inc." style={inputStyle} />
            </Field>
            <Field label="Correo">
              <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="jane@example.com" style={inputStyle} />
            </Field>
            <Field label="Teléfono">
              <input value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="+1 555 000 0000" style={inputStyle} />
            </Field>
          </div>
          <Field label="Notas">
            <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} placeholder="Contexto sobre este contacto…" style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setCreating(false); resetForm() }} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
            <button onClick={saveCreate} disabled={saving || !fName.trim()} style={{ padding: '6px 14px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Guardando…' : 'Agregar contacto'}
            </button>
          </div>
        </div>
      )}

      {/* Directory list (+ alphabet fast-scroll rail on mobile) */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 34px 12px 16px' : '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {totalShown === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', paddingTop: '48px' }}>
            {search ? 'Nada coincide con tu búsqueda.' : 'Aún no hay registros.'}
          </div>
        )}

        {/* External contacts */}
        {visibleContacts.map((contact, idx) => {
          const dealCount = dealCounts[contact.id] ?? 0
          const isEditing = editingId === contact.id
          const typeColor = TYPE_COLOR[contact.contact_type ?? 'OTHER'] ?? '#6B7280'
          const finderName = contact.created_by ? finders[contact.created_by] : null
          const letter = (contact.full_name[0] ?? '#').toUpperCase()
          const isFirstOfLetter = idx === 0 || (visibleContacts[idx - 1].full_name[0] ?? '#').toUpperCase() !== letter

          if (isEditing) {
            return (
              <div key={contact.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-border)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                  <Field label="Nombre completo *">
                    <input value={fName} onChange={e => setFName(e.target.value)} style={inputStyle} autoFocus />
                  </Field>
                  <Field label="Tipo">
                    <select value={fType} onChange={e => setFType(e.target.value)} style={inputStyle}>
                      {CONTACT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Empresa">
                    <input value={fCompany} onChange={e => setFCompany(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Correo">
                    <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="Teléfono">
                    <input value={fPhone} onChange={e => setFPhone(e.target.value)} style={inputStyle} />
                  </Field>
                </div>
                <Field label="Notas">
                  <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </Field>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setEditingId(null); resetForm() }} style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <X size={12} /> Cancel
                  </button>
                  <button onClick={() => saveEdit(contact.id)} disabled={saving || !fName.trim()} style={{ padding: '5px 12px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', opacity: saving ? 0.6 : 1 }}>
                    <Check size={12} /> Guardar
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={contact.id}
              id={isFirstOfLetter ? `dir-${letter}` : undefined}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px', opacity: contact.archived ? 0.55 : 1, scrollMarginTop: '8px' }}
            >
              <Avatar name={contact.full_name} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{contact.full_name}</span>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', background: `${typeColor}20`, color: typeColor, border: `1px solid ${typeColor}50`, borderRadius: '4px', padding: '1px 5px' }}>
                    {TYPE_LABEL[contact.contact_type ?? 'OTHER'] ?? 'Other'}
                  </span>
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
                  {contact.archived && (
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>ARCHIVED</span>
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
                {finderName && (
                  <p style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '5px', fontFamily: 'var(--font-mono)' }}>
                    Finder: <span style={{ color: 'var(--accent)' }}>{finderName}</span>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  onClick={() => startEdit(contact)}
                  style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}
                  title="Editar contacto"
                >
                  <Edit2 size={13} />
                </button>
                {isMaster && (
                  <>
                    <button
                      onClick={() => setArchived(contact.id, !contact.archived)}
                      style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}
                      title={contact.archived ? 'Restaurar' : 'Archivar'}
                    >
                      {contact.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                    </button>
                    {confirmDelete === contact.id ? (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button onClick={() => deleteContact(contact.id)} style={{ background: '#EF4444', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', padding: '5px 8px', cursor: 'pointer' }}>Eliminar</button>
                        <button onClick={() => setConfirmDelete(null)} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-tertiary)', fontSize: '11px', padding: '5px 8px', cursor: 'pointer' }}>No</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(contact.id)}
                        style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center' }}
                        title="Eliminar contacto"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}

        {/* HOG team members (read-only) */}
        {visibleHog.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0 2px' }}>
              <ShieldCheck size={12} style={{ color: HOG_COLOR }} />
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', fontWeight: 600 }}>EQUIPO HOG · {visibleHog.length}</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
            </div>
            {visibleHog.map(m => (
              <div key={m.id} style={{ background: 'var(--bg-surface)', border: `1px solid ${HOG_COLOR}30`, borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar name={m.full_name} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.full_name}</span>
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', background: `${HOG_COLOR}20`, color: HOG_COLOR, border: `1px solid ${HOG_COLOR}50`, borderRadius: '4px', padding: '1px 5px' }}>HOG Team</span>
                  </div>
                  {m.email && (
                    <a href={`mailto:${m.email}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', marginTop: '4px' }}>
                      <Mail size={10} />{m.email}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Alphabet fast-scroll rail (mobile) */}
      {isMobile && visibleContacts.length > 8 && (
        <div style={{ position: 'absolute', right: 2, top: 8, bottom: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0, zIndex: 5 }}>
          {[...new Set(visibleContacts.map(c => (c.full_name[0] ?? '#').toUpperCase()))].map(letter => (
            <button
              key={letter}
              onClick={() => document.getElementById(`dir-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '1px 8px', lineHeight: 1.4 }}
            >
              {letter}
            </button>
          ))}
        </div>
      )}
      </div>
      </>
    </div>
  )
}
