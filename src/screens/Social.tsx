import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Link2, Video, Camera, Music2, FileText, ImageIcon, Code, Send, Upload, Trash2, ExternalLink } from 'lucide-react'
import { Avatar } from '../components/ui/Avatar'
import { HtmlFrame } from '../components/ui/HtmlFrame'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { detectKind, youtubeEmbed, instagramEmbed, tiktokEmbed, domainOf, type PostKind } from '../lib/embed'
import type { Profile } from '../types'

interface Post {
  id: string
  author_id: string | null
  kind: PostKind
  url: string | null
  caption: string | null
  created_at: string
}
interface Reaction { post_id: string; user_id: string; emoji: string }

const EMOJIS = ['👍', '❤️', '🔥']

const KIND_ICON: Record<PostKind, React.ElementType> = {
  LINK: Link2, YOUTUBE: Video, INSTAGRAM: Camera, TIKTOK: Music2, PDF: FileText, IMAGE: ImageIcon, HTML: Code,
}
const KIND_COLOR: Record<PostKind, string> = {
  LINK: '#6B7280', YOUTUBE: '#FF0000', INSTAGRAM: '#E4405F', TIKTOK: '#25F4EE', PDF: '#EF4444', IMAGE: '#3B82F6', HTML: '#F97316',
}

interface Props {
  profile?: Profile | null
  userId?: string
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const DAILY_MESSAGES = [
  'Comparte algo que inspire al equipo hoy.',
  '¿Viste algo interesante? Súbelo aquí.',
  'Un buen artículo puede cambiarle el día a alguien.',
  'La cultura se construye compartiendo.',
  'Hoy es un buen día para aprender algo nuevo.',
  'Deja tu huella: comparte, reacciona, conecta.',
  'El mejor contenido lo trae el equipo.',
]

export function Social({ profile, userId }: Props) {
  const [posts, setPosts] = useState<Post[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [authors, setAuthors] = useState<Record<string, string>>({})
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [posting, setPosting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'equipo'
  // Deterministic daily message (same all day, rotates by day of month)
  const dailyMsg = DAILY_MESSAGES[new Date().getDate() % DAILY_MESSAGES.length]
  const todayLabel = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  const load = useCallback(async () => {
    const [{ data: p }, { data: r }, { data: members }] = await Promise.all([
      supabase.from('social_posts').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('social_reactions').select('post_id, user_id, emoji'),
      supabase.from('profiles').select('id, full_name, email'),
    ])
    if (p) setPosts(p as Post[])
    if (r) setReactions(r as Reaction[])
    if (members) {
      const names: Record<string, string> = {}
      for (const m of members) names[m.id] = m.full_name ?? m.email ?? 'Unknown'
      setAuthors(names)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useAutoRefresh(load)

  async function submitLink() {
    if (!url.trim()) return
    setPosting(true)
    const kind = detectKind(url.trim())
    await supabase.from('social_posts').insert({
      author_id: userId ?? null,
      kind,
      url: url.trim(),
      caption: caption.trim() || null,
    })
    setUrl(''); setCaption('')
    setPosting(false)
    await load()
  }

  async function uploadFile(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `social/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('proofs').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' })
    if (!error) {
      const { data: urlData } = supabase.storage.from('proofs').getPublicUrl(path)
      const kind: PostKind = file.type === 'application/pdf' ? 'PDF' : file.type === 'text/html' ? 'HTML' : 'IMAGE'
      await supabase.from('social_posts').insert({
        author_id: userId ?? null,
        kind,
        url: urlData.publicUrl,
        caption: caption.trim() || file.name,
      })
      setCaption('')
      await load()
    }
    setUploading(false)
  }

  async function toggleReaction(postId: string, emoji: string) {
    if (!userId) return
    const existing = reactions.find(r => r.post_id === postId && r.user_id === userId && r.emoji === emoji)
    if (existing) {
      setReactions(prev => prev.filter(r => !(r.post_id === postId && r.user_id === userId && r.emoji === emoji)))
      await supabase.from('social_reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('emoji', emoji)
    } else {
      setReactions(prev => [...prev, { post_id: postId, user_id: userId, emoji }])
      await supabase.from('social_reactions').insert({ post_id: postId, user_id: userId, emoji })
    }
  }

  async function deletePost(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
    await supabase.from('social_posts').delete().eq('id', id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Daily welcome */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, background: 'linear-gradient(135deg, var(--accent-bg), transparent)' }}>
        <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '20px' }}>
          {greeting()}, {firstName} 👋
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px', textTransform: 'capitalize' }}>{todayLabel}</p>
        <p style={{ color: 'var(--accent)', fontSize: '12px', marginTop: '6px', fontStyle: 'italic' }}>{dailyMsg}</p>
      </div>

      {/* Composer */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitLink() }}
            placeholder="Pega un link — YouTube, Instagram, TikTok, artículo…"
            style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button onClick={submitLink} disabled={posting || !url.trim()} style={{ background: url.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: url.trim() ? '#000' : 'var(--text-tertiary)', border: 'none', borderRadius: '8px', padding: '0 14px', cursor: url.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
            <Send size={14} /> {posting ? '…' : 'Post'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
          <input
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Caption (opcional)…"
            style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <Upload size={13} /> {uploading ? 'Subiendo…' : 'PDF / imagen / HTML'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf,.html,.htm" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
        </div>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {posts.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', paddingTop: '48px' }}>
            Aún no hay nada. ¡Sé el primero en compartir algo!
          </div>
        )}
        {posts.map(post => {
          const Icon = KIND_ICON[post.kind] ?? Link2
          const color = KIND_COLOR[post.kind] ?? '#6B7280'
          const authorName = post.author_id ? authors[post.author_id] ?? 'Unknown' : 'Unknown'
          const postReactions = reactions.filter(r => r.post_id === post.id)
          return (
            <div key={post.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
                <Avatar name={authorName} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{authorName}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(post.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontFamily: 'var(--font-mono)', color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: '4px', padding: '2px 6px' }}>
                  <Icon size={11} /> {post.kind}
                </span>
                {(post.author_id === userId) && (
                  <button onClick={() => deletePost(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', padding: '2px' }} title="Eliminar">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Caption */}
              {post.caption && (
                <p style={{ padding: '0 14px 10px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{post.caption}</p>
              )}

              {/* Embed / media */}
              {post.url && <PostMedia post={post} />}

              {/* Reactions */}
              <div style={{ display: 'flex', gap: '6px', padding: '10px 14px', borderTop: '1px solid var(--border-subtle)' }}>
                {EMOJIS.map(emoji => {
                  const count = postReactions.filter(r => r.emoji === emoji).length
                  const mine = !!postReactions.find(r => r.emoji === emoji && r.user_id === userId)
                  return (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(post.id, emoji)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '999px', cursor: 'pointer',
                        background: mine ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                        border: `1px solid ${mine ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                        fontSize: '13px', color: 'var(--text-secondary)',
                      }}
                    >
                      <span>{emoji}</span>
                      {count > 0 && <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: mine ? 'var(--accent)' : 'var(--text-tertiary)' }}>{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PostMedia({ post }: { post: Post }) {
  const url = post.url!
  const frameStyle: React.CSSProperties = { width: '100%', border: 'none', display: 'block', background: '#000' }

  switch (post.kind) {
    case 'YOUTUBE': {
      const src = youtubeEmbed(url)
      return src ? <iframe src={src} title="YouTube" style={{ ...frameStyle, aspectRatio: '16/9' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <LinkCard url={url} />
    }
    case 'INSTAGRAM': {
      const src = instagramEmbed(url)
      return src ? <iframe src={src} title="Instagram" style={{ ...frameStyle, height: '560px', background: '#fff' }} scrolling="no" /> : <LinkCard url={url} />
    }
    case 'TIKTOK': {
      const src = tiktokEmbed(url)
      return src ? <iframe src={src} title="TikTok" style={{ ...frameStyle, height: '580px' }} allowFullScreen /> : <LinkCard url={url} />
    }
    case 'IMAGE':
      return <img src={url} alt={post.caption ?? 'image'} style={{ width: '100%', maxHeight: '520px', objectFit: 'contain', display: 'block', background: 'var(--bg-base)' }} />
    case 'PDF':
      return <iframe src={`${url}#toolbar=0`} title="PDF" style={{ ...frameStyle, height: '480px', background: '#fff' }} />
    case 'HTML':
      return <HtmlFrame url={url} title="HTML" style={{ ...frameStyle, height: '420px', background: '#fff' }} />
    default:
      return <LinkCard url={url} />
  }
}

function LinkCard({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 14px 14px', padding: '12px 14px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '10px', textDecoration: 'none' }}>
      <Link2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{domainOf(url)}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
      </div>
      <ExternalLink size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
    </a>
  )
}
