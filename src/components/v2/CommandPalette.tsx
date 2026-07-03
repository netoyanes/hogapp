import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, CheckSquare, Handshake, Contact2, CornerDownLeft, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { STR } from '../../lib/strings'

// ⌘K / Ctrl+K command palette — jump to a module, search tasks/deals/contacts,
// or run quick actions. Desktop power path; the logo launcher stays as fallback.

interface NavItem { id: string; label: string }
interface Result {
  kind: 'nav' | 'action' | 'task' | 'deal' | 'contact'
  id: string
  label: string
  sub?: string
}

interface Props {
  open: boolean
  onClose: () => void
  navItems: NavItem[]                 // already role-filtered by the caller
  onNavigate: (view: string) => void
  onOpenTask: (id: string) => void
  onOpenDeal: (id: string) => void
  onCreateTask: () => void
}

export function CommandPalette({ open, onClose, navItems, onNavigate, onOpenTask, onOpenDeal, onCreateTask }: Props) {
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<Result[]>([])
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setQuery(''); setRemote([]); setCursor(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])

  // Debounced cross-entity search (tasks, deals, contacts) from 2 chars
  useEffect(() => {
    if (!open || query.trim().length < 2) { setRemote([]); return }
    const q = query.trim()
    const t = setTimeout(async () => {
      const [{ data: tasks }, { data: deals }, { data: contacts }] = await Promise.all([
        supabase.from('tasks').select('id, title, status').ilike('title', `%${q}%`).eq('archived', false).limit(5),
        supabase.from('crm_deals').select('id, title, stage').ilike('title', `%${q}%`).limit(5),
        supabase.from('crm_contacts').select('id, full_name, company').ilike('full_name', `%${q}%`).limit(5),
      ])
      setRemote([
        ...(tasks ?? []).map(t => ({ kind: 'task' as const, id: t.id, label: t.title, sub: t.status })),
        ...(deals ?? []).map(d => ({ kind: 'deal' as const, id: d.id, label: d.title, sub: d.stage })),
        ...(contacts ?? []).map(c => ({ kind: 'contact' as const, id: c.id, label: c.full_name, sub: c.company ?? undefined })),
      ])
    }, 220)
    return () => clearTimeout(t)
  }, [query, open])

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    const nav: Result[] = navItems
      .filter(n => !q || n.label.toLowerCase().includes(q))
      .map(n => ({ kind: 'nav', id: n.id, label: n.label }))
    const actions: Result[] = ('crear tarea'.includes(q) || 'nueva tarea'.includes(q) || !q)
      ? [{ kind: 'action', id: 'create-task', label: 'Crear tarea', sub: 'C' }]
      : []
    return [...actions, ...nav, ...remote]
  }, [query, navItems, remote])

  useEffect(() => { setCursor(0) }, [results.length])

  function run(r: Result) {
    onClose()
    if (r.kind === 'nav') onNavigate(r.id)
    else if (r.kind === 'action') onCreateTask()
    else if (r.kind === 'task') onOpenTask(r.id)
    else if (r.kind === 'deal') onOpenDeal(r.id)
    else if (r.kind === 'contact') onNavigate('contacts')
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
      else if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); run(results[cursor]) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  if (!open) return null

  const KIND_ICON = { task: CheckSquare, deal: Handshake, contact: Contact2 } as const
  const KIND_TAG: Record<string, string> = { nav: 'Ir a', action: 'Acción', task: 'Tarea', deal: 'Deal', contact: 'Contacto' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 90, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 16px 0' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{
        width: '100%', maxWidth: 560, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-default)', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
          <Search size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar tareas, deals, contactos… o ir a un módulo"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-size-md)', fontFamily: 'var(--font-ui)' }}
          />
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '2px 6px' }}>esc</kbd>
        </div>

        <div style={{ maxHeight: '46vh', overflowY: 'auto', padding: 'var(--space-2)' }}>
          {results.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-size-sm)', textAlign: 'center', padding: 'var(--space-6)' }}>{STR.empty.search}</p>
          )}
          {results.map((r, i) => {
            const Icon = r.kind === 'action' ? Plus : (KIND_ICON as Record<string, typeof CheckSquare>)[r.kind]
            const active = i === cursor
            return (
              <button
                key={`${r.kind}-${r.id}`}
                onClick={() => run(r)}
                onMouseEnter={() => setCursor(i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', textAlign: 'left',
                  minHeight: 'var(--touch-target)', padding: '0 var(--space-3)', borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--accent-bg)' : 'transparent', border: 'none', cursor: 'pointer',
                }}
              >
                {Icon
                  ? <Icon size={15} style={{ color: active ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                  : <span style={{ width: 15 }} />}
                <span style={{ flex: 1, minWidth: 0, color: 'var(--text-primary)', fontSize: 'var(--text-size-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.label}
                  {r.sub && <span style={{ color: 'var(--text-tertiary)', marginLeft: 8, fontSize: 'var(--text-size-xs)', fontFamily: 'var(--font-mono)' }}>{r.sub}</span>}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: active ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0 }}>
                  {active ? <CornerDownLeft size={12} /> : KIND_TAG[r.kind]}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
