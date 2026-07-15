import { useEffect, useState, useRef } from 'react'
import { SmilePlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Reacciones con emoji para comentarios de Tareas y CRM. Autocontenida: carga
// sus propias reacciones por (parentType, parentId) y togglea la del usuario.
const PALETTE = ['👍', '❤️', '🎉', '😂', '👀', '🙏', '🔥', '✅']

type Reaction = { emoji: string; user_id: string }

export function ReactionBar({ parentType, parentId, userId }: {
  parentType: 'task_comment' | 'deal_activity'
  parentId: string
  userId?: string
}) {
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    supabase.from('comment_reactions').select('emoji, user_id')
      .eq('parent_type', parentType).eq('parent_id', parentId)
      .then(({ data }) => { if (alive) setReactions((data ?? []) as Reaction[]) })
    return () => { alive = false }
  }, [parentType, parentId])

  useEffect(() => {
    if (!pickerOpen) return
    const onDoc = (e: MouseEvent) => { if (barRef.current && !barRef.current.contains(e.target as Node)) setPickerOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [pickerOpen])

  async function toggle(emoji: string) {
    if (!userId) return
    setPickerOpen(false)
    const mine = reactions.some(r => r.emoji === emoji && r.user_id === userId)
    if (mine) {
      setReactions(prev => prev.filter(r => !(r.emoji === emoji && r.user_id === userId)))
      await supabase.from('comment_reactions').delete()
        .eq('parent_type', parentType).eq('parent_id', parentId).eq('emoji', emoji).eq('user_id', userId)
    } else {
      setReactions(prev => [...prev, { emoji, user_id: userId }])
      await supabase.from('comment_reactions').insert({ parent_type: parentType, parent_id: parentId, emoji, user_id: userId })
    }
  }

  // Agrupa por emoji conservando el orden de la paleta
  const grouped = PALETTE
    .map(e => ({ emoji: e, count: reactions.filter(r => r.emoji === e).length, mine: reactions.some(r => r.emoji === e && r.user_id === userId) }))
    .filter(g => g.count > 0)

  return (
    <div ref={barRef} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap', position: 'relative' }}>
      {grouped.map(g => (
        <button key={g.emoji} onClick={() => toggle(g.emoji)} disabled={!userId}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, lineHeight: 1,
            padding: '2px 7px', borderRadius: 999, cursor: userId ? 'pointer' : 'default',
            background: g.mine ? 'var(--accent-bg)' : 'var(--bg-elevated)',
            border: `1px solid ${g.mine ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
            color: g.mine ? 'var(--accent)' : 'var(--text-secondary)',
          }}>
          <span>{g.emoji}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{g.count}</span>
        </button>
      ))}
      {userId && (
        <button onClick={() => setPickerOpen(o => !o)} title="Reaccionar"
          style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', borderRadius: 999, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>
          <SmilePlus size={13} />
        </button>
      )}
      {pickerOpen && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 20,
          display: 'flex', gap: 2, padding: 6, borderRadius: 10,
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)', boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
        }}>
          {PALETTE.map(e => (
            <button key={e} onClick={() => toggle(e)}
              style={{ fontSize: 18, lineHeight: 1, padding: '3px 5px', borderRadius: 7, background: 'none', border: 'none', cursor: 'pointer' }}
              className="hover:bg-[var(--bg-elevated)]">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
