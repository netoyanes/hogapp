import { useCallback, useEffect, useRef, useState } from 'react'
import { AtSign, Check, CheckCheck, MessageSquare, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { notifyUserDM, taskLink, dealLink } from '../../hooks/useSlack'
import { logActivity } from '../../hooks/useActivityLog'
import { Avatar } from './Avatar'
import { ReactionBar } from './ReactionBar'

// ─────────────────────────────────────────────────────────────────────────────
// CHAT UNIFICADO — un solo chat para tarea / proyecto / deal, con:
//  · @menciones (autocompletar con la gente; genera notificación campana + DM)
//  · doble palomita: ✓ enviado · ✓✓ visto (tooltip dice quién) — comment_reads
//  · tiempo real (los mensajes de otros aparecen solos)
// Tablas: task_comments · event_comments · crm_activities (cada una la suya).
// ─────────────────────────────────────────────────────────────────────────────

export type ChatScope = 'task' | 'event' | 'deal'
export type Person = { id: string; full_name: string | null }

const CFG: Record<ChatScope, { table: string; fk: string; author: string; body: string; reaction: 'task_comment' | 'deal_activity' | 'event_comment' }> = {
  task:  { table: 'task_comments',  fk: 'task_id',  author: 'author_id',  body: 'content', reaction: 'task_comment' },
  event: { table: 'event_comments', fk: 'event_id', author: 'author_id',  body: 'content', reaction: 'event_comment' },
  deal:  { table: 'crm_activities', fk: 'deal_id',  author: 'created_by', body: 'body',    reaction: 'deal_activity' },
}

// Cómo se le llama a la cosa comentada, para el estado vacío
const LABEL: Record<ChatScope, string> = { task: 'la tarea', event: 'el proyecto', deal: 'la oportunidad' }

const scopeLink = (scope: ChatScope, id: string) =>
  scope === 'task' ? taskLink(id) : scope === 'deal' ? dealLink(id) : ''

// ── Menciones: detecta '@Nombre Completo' de gente real y notifica ───────────
export async function notifyMentions(opts: {
  scope: ChatScope; entityId: string; entityLabel: string
  content: string; authorId: string; authorName: string; people: Person[]
}): Promise<string[]> {
  const { scope, entityId, entityLabel, content, authorId, authorName, people } = opts
  const mentioned = people.filter(p => p.id !== authorId && p.full_name && content.includes('@' + p.full_name))
  if (!mentioned.length) return []
  await supabase.from('notifications').insert(mentioned.map(m => ({
    user_id: m.id,
    title: '💬 Te mencionaron',
    body: `${authorName} — ${entityLabel}: ${content.slice(0, 140)}`,
    type: `mention_${scope}`,
    entity_id: entityId,
  })))
  const link = scopeLink(scope, entityId)
  for (const m of mentioned) notifyUserDM(m.id, `💬 *${authorName}* te mencionó en *${entityLabel}*:\n> ${content}${link ? `\n${link}` : ''}`)
  return mentioned.map(m => m.id)
}

// Pinta '@Nombre' resaltado dentro del texto del mensaje
export function renderWithMentions(content: string, names: string[]) {
  const parts: React.ReactNode[] = []
  let rest = content, k = 0
  while (rest) {
    let best: { i: number; n: string } | null = null
    for (const n of names) {
      const i = rest.indexOf('@' + n)
      if (i !== -1 && (!best || i < best.i)) best = { i, n }
    }
    if (!best) { parts.push(rest); break }
    if (best.i > 0) parts.push(rest.slice(0, best.i))
    parts.push(<span key={k++} style={{ color: 'var(--accent)', fontWeight: 700 }}>@{best.n}</span>)
    rest = rest.slice(best.i + best.n.length + 1)
  }
  return parts
}

// ── Composer con @autocompletar — reutilizable (chat y panel de deal) ────────
export function MentionArea({ value, onChange, onSubmit, people, placeholder, style }: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  people: Person[]
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [q, setQ] = useState<string | null>(null)
  const update = (v: string) => {
    onChange(v)
    const at = v.lastIndexOf('@')
    if (at === -1) { setQ(null); return }
    const tail = v.slice(at + 1)
    setQ(tail.length > 24 ? null : tail)
  }
  const matches = q === null ? [] : people.filter(p => p.full_name && p.full_name.toLowerCase().includes(q.toLowerCase())).slice(0, 5)
  const pick = (name: string) => {
    const at = value.lastIndexOf('@')
    onChange(value.slice(0, at) + '@' + name + ' ')
    setQ(null)
  }
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      {matches.length > 0 && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'hidden', zIndex: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
          {matches.map(m => (
            <button key={m.id} onMouseDown={e => { e.preventDefault(); pick(m.full_name!) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 36 }}>
              <Avatar name={m.full_name!} size={20} />
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{m.full_name}</span>
            </button>
          ))}
        </div>
      )}
      <input value={value} onChange={e => update(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (matches.length && q !== null && q.length > 0) pick(matches[0].full_name!)
            else onSubmit()
          }
        }}
        placeholder={placeholder ?? 'Mensaje… usa @ para taggear a alguien'}
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', padding: '10px 12px', fontSize: 13, outline: 'none', minHeight: 42, ...style }} />
    </div>
  )
}

// ── Recibos de lectura: carga quién vio cada mensaje y marca leídos los ajenos
export function useReadReceipts(scope: ChatScope, rows: { id: string; author: string | null }[], userId?: string) {
  const [reads, setReads] = useState<Record<string, string[]>>({})
  const key = rows.map(r => r.id).join(',')
  useEffect(() => {
    if (!rows.length) { setReads({}); return }
    let alive = true
    supabase.from('comment_reads').select('comment_id, user_id').eq('scope', scope).in('comment_id', rows.map(r => r.id))
      .then(({ data }) => {
        if (!alive) return
        const m: Record<string, string[]> = {}
        for (const r of (data ?? []) as { comment_id: string; user_id: string }[]) (m[r.comment_id] = m[r.comment_id] ?? []).push(r.user_id)
        setReads(m)
      })
    // Al ver el chat, los mensajes de otros quedan marcados como leídos
    if (userId) {
      const unread = rows.filter(r => r.author !== userId)
      if (unread.length) {
        supabase.from('comment_reads')
          .upsert(unread.map(r => ({ scope, comment_id: r.id, user_id: userId })), { onConflict: 'scope,comment_id,user_id', ignoreDuplicates: true })
          .then(() => window.dispatchEvent(new CustomEvent('hog:msgs-read')))
      }
    }
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, key, userId])
  return reads
}

// ✓ enviado · ✓✓ visto por alguien más (tooltip con nombres)
export function ReadTicks({ readers, people, me }: { readers: string[]; people: Person[]; me?: string }) {
  const others = readers.filter(u => u !== me)
  if (!others.length) return <span title="Enviado — nadie lo ha visto aún" style={{ color: 'var(--text-tertiary)', display: 'inline-flex' }}><Check size={13} /></span>
  const names = others.map(u => people.find(p => p.id === u)?.full_name ?? '¿?')
  return <span title={`Visto por ${names.join(', ')}`} style={{ color: 'var(--accent)', display: 'inline-flex' }}><CheckCheck size={13} /></span>
}

// ── El chat completo ─────────────────────────────────────────────────────────
interface Msg { id: string; author_id: string | null; content: string; created_at: string }

export function EntityChat({ scope, entityId, entityLabel, notifyUserIds = [], maxHeight = 280, fill = false }: {
  scope: ChatScope
  entityId: string
  entityLabel: string
  /** Además de los taggeados: gente a avisar de cada mensaje (asignado, responsable…) */
  notifyUserIds?: (string | null | undefined)[]
  maxHeight?: number
  /** En un riel lateral el chat ocupa todo el alto disponible en vez de un tope fijo */
  fill?: boolean
}) {
  const cfg = CFG[scope]
  const [me, setMe] = useState<string | undefined>()
  const [meName, setMeName] = useState('Alguien')
  const [people, setPeople] = useState<Person[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setMe(user?.id)
      if (user?.id) {
        const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()
        setMeName(p?.full_name ?? p?.email ?? 'Alguien')
      }
    })
    supabase.from('profiles').select('id, full_name').order('full_name')
      .then(({ data }) => setPeople((data ?? []) as Person[]))
  }, [])

  const load = useCallback(async () => {
    const { data } = await supabase.from(cfg.table)
      .select(`id, created_at, ${cfg.author}, ${cfg.body}`)
      .eq(cfg.fk, entityId).order('created_at')
    setMsgs(((data ?? []) as unknown as Record<string, string | null>[]).map(r => ({
      id: r.id as string, created_at: r.created_at as string,
      author_id: r[cfg.author], content: (r[cfg.body] ?? '') as string,
    })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, entityId])
  useEffect(() => { load() }, [load])

  // Tiempo real: al insertar alguien más, el chat se refresca solo
  useEffect(() => {
    const ch = supabase.channel(`chat-${scope}-${entityId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: cfg.table, filter: `${cfg.fk}=eq.${entityId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, entityId, load])

  const reads = useReadReceipts(scope, msgs.map(m => ({ id: m.id, author: m.author_id })), me)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [msgs.length])

  async function send() {
    const content = draft.trim()
    if (!content || sending || !me) return
    setSending(true)
    const row: Record<string, unknown> = { [cfg.fk]: entityId, [cfg.author]: me, [cfg.body]: content }
    if (scope === 'deal') row.type = 'NOTE'
    const { error } = await supabase.from(cfg.table).insert(row)
    if (!error) {
      setDraft('')
      await load()
      logActivity('comment_posted', scope, entityId, { title: entityLabel })
      const mentioned = await notifyMentions({ scope, entityId, entityLabel, content, authorId: me, authorName: meName, people })
      const rest = [...new Set(notifyUserIds.filter((u): u is string => !!u && u !== me && !mentioned.includes(u)))]
      if (rest.length) {
        await supabase.from('notifications').insert(rest.map(u => ({
          user_id: u, title: '💬 Nuevo mensaje',
          body: `${meName} — ${entityLabel}: ${content.slice(0, 140)}`,
          type: scope === 'task' ? 'comment_posted' : `comment_${scope}`,
          entity_id: entityId,
        })))
        const link = scopeLink(scope, entityId)
        rest.forEach(u => notifyUserDM(u, `💬 *${meName}* comentó en *${entityLabel}*:\n> ${content}${link ? `\n${link}` : ''}`))
      }
    }
    setSending(false)
  }

  const names = people.map(p => p.full_name).filter((n): n is string => !!n)
  const nameOf = (id: string | null) => people.find(p => p.id === id)?.full_name ?? '¿?'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...(fill ? { flex: 1, minHeight: 0 } : null) }}>
      <div ref={listRef} style={{ ...(fill ? { flex: 1, minHeight: 0 } : { maxHeight }), overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
        {/* Estado vacío que ENSEÑA: un chat en blanco no dice qué se espera de
            ti ahí. Aquí se ve para qué sirve y —lo importante— que puedes
            jalar a alguien con @, que es la función que nadie descubre solo. */}
        {msgs.length === 0 && (
          <div style={{ ...(fill ? { margin: 'auto 0' } : null), textAlign: 'center', padding: '18px 10px' }}>
            <MessageSquare size={26} style={{ color: 'var(--text-tertiary)', opacity: 0.7 }} />
            <p style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, margin: '8px 0 3px' }}>Arranca la conversación</p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
              Haz preguntas, deja el seguimiento por escrito y resuelve aquí en vez de por WhatsApp — queda pegado a {LABEL[scope]}.
            </p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, padding: '5px 10px', borderRadius: 999, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>
              <AtSign size={11} /> menciona a alguien y le llega el aviso
            </span>
          </div>
        )}
        {msgs.map(m => {
          const mine = m.author_id === me
          return (
            <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: mine ? 'row-reverse' : 'row' }}>
              {!mine && <Avatar name={nameOf(m.author_id)} size={26} />}
              <div style={{ maxWidth: '82%', background: mine ? 'var(--accent-bg)' : 'var(--bg-elevated)', border: `1px solid ${mine ? 'var(--accent-border, var(--accent))' : 'var(--border-subtle)'}`, borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{mine ? 'Tú' : nameOf(m.author_id)}</span>
                  <span className="num" style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(m.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {mine && <ReadTicks readers={reads[m.id] ?? []} people={people} me={me} />}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {renderWithMentions(m.content, names)}
                </div>
                <ReactionBar parentType={cfg.reaction} parentId={m.id} userId={me} />
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <MentionArea value={draft} onChange={setDraft} onSubmit={send} people={people} />
        <button onClick={send} disabled={!draft.trim() || sending} aria-label="Enviar"
          style={{ width: 42, height: 42, borderRadius: 10, border: 'none', background: draft.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: draft.trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', cursor: draft.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
