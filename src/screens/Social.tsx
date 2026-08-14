import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Link2, Video, Camera, Music2, FileText, ImageIcon, Code, Send, Trash2, ExternalLink, X } from 'lucide-react'
import { Avatar } from '../components/ui/Avatar'
import { HtmlFrame } from '../components/ui/HtmlFrame'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { useIsMobile } from '../hooks/useIsMobile'
import { detectKind, youtubeEmbed, instagramEmbed, tiktokEmbed, domainOf, type PostKind } from '../lib/embed'
import type { Profile } from '../types'

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `hace ${days}d`
  return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

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
  TEXT: Link2, LINK: Link2, YOUTUBE: Video, INSTAGRAM: Camera, TIKTOK: Music2, PDF: FileText, IMAGE: ImageIcon, HTML: Code,
}
const KIND_COLOR: Record<PostKind, string> = {
  TEXT: '#6B7280', LINK: '#6B7280', YOUTUBE: '#FF0000', INSTAGRAM: '#E4405F', TIKTOK: '#25F4EE', PDF: '#EF4444', IMAGE: '#3B82F6', HTML: '#F97316',
}

const toolBtn: React.CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px',
  padding: '7px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px',
  display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
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
  const isMobile = useIsMobile()
  const [posts, setPosts] = useState<Post[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [authors, setAuthors] = useState<Record<string, string>>({})
  const [caption, setCaption] = useState('')
  const [posting, setPosting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Pending attachment for the current draft (link or uploaded file)
  const [attachUrl, setAttachUrl] = useState<string | null>(null)
  const [attachKind, setAttachKind] = useState<PostKind | null>(null)
  const [linkInput, setLinkInput] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)

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

  function attachLink() {
    const u = linkInput.trim()
    if (!u) return
    setAttachUrl(u)
    setAttachKind(detectKind(u))
    setLinkInput('')
    setShowLinkInput(false)
  }

  function clearAttachment() {
    setAttachUrl(null); setAttachKind(null)
  }

  async function uploadFile(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `social/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('proofs').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' })
    if (!error) {
      const { data: urlData } = supabase.storage.from('proofs').getPublicUrl(path)
      const kind: PostKind = file.type === 'application/pdf' ? 'PDF' : file.type === 'text/html' ? 'HTML' : 'IMAGE'
      setAttachUrl(urlData.publicUrl)
      setAttachKind(kind)
    }
    setUploading(false)
  }

  async function publish() {
    // Need at least a thought or an attachment
    if (!caption.trim() && !attachUrl) return
    setPosting(true)
    await supabase.from('social_posts').insert({
      author_id: userId ?? null,
      kind: attachKind ?? 'TEXT',
      url: attachUrl,
      caption: caption.trim() || null,
    })
    setCaption(''); clearAttachment()
    setPosting(false)
    await load()
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

  const canPublish = !!(caption.trim() || attachUrl)
  // X/Twitter pattern: single-line input that expands on focus; stays expanded
  // while there's a draft (text, attachment or link input) so blur never eats it
  const [composerFocused, setComposerFocused] = useState(false)
  const composerExpanded = composerFocused || !!caption.trim() || !!attachUrl || showLinkInput

  return (
    // Single scroll container — greeting + composer scroll away with the feed,
    // which maximizes reading space on mobile (social-feed best practice).
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: isMobile ? '0 0 24px' : '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '14px' }}>

        {/* Daily welcome */}
        <div style={{ padding: isMobile ? '16px' : '18px 20px', background: 'linear-gradient(135deg, var(--accent-bg), var(--bg-surface))', border: isMobile ? 'none' : '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', borderRadius: isMobile ? 0 : '14px' }}>
          <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '19px' }}>
            {greeting()}, {firstName} 👋
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px', textTransform: 'capitalize' }}>{todayLabel}</p>
          <p style={{ color: 'var(--accent)', fontSize: '12px', marginTop: '4px', fontStyle: 'italic' }}>{dailyMsg}</p>
        </div>

        {/* Composer — one thought box + attachment tools */}
        <div style={{ padding: isMobile ? '14px 16px' : '16px', background: 'var(--bg-surface)', border: isMobile ? 'none' : '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', borderRadius: isMobile ? 0 : '14px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Avatar name={profile?.full_name ?? 'You'} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="¿Qué estás pensando? Comparte una idea, un copy…"
                rows={composerExpanded ? 3 : 1}
                style={{ width: '100%', background: 'var(--bg-base)', border: `1px solid ${composerFocused ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: '12px', padding: '11px 13px', fontSize: '15px', color: 'var(--text-primary)', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-ui)', lineHeight: 1.5, transition: 'var(--motion-fast)' }}
                onFocus={() => setComposerFocused(true)}
                onBlur={() => setComposerFocused(false)}
              />

              {/* Link input (revealed) */}
              {showLinkInput && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <input
                    value={linkInput}
                    onChange={e => setLinkInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') attachLink() }}
                    autoFocus
                    placeholder="Pega un link — YouTube, Instagram, TikTok, artículo…"
                    style={{ flex: 1, minWidth: 0, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none' }}
                  />
                  <button onClick={attachLink} disabled={!linkInput.trim()} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '10px', padding: '0 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, minHeight: '38px' }}>Añadir</button>
                </div>
              )}

              {/* Pending attachment preview */}
              {attachUrl && attachKind && (
                <div style={{ marginTop: '8px', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
                  <button onClick={clearAttachment} title="Quitar" style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 2, background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '999px', color: '#fff', cursor: 'pointer', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={14} />
                  </button>
                  <PostMedia post={{ id: 'draft', author_id: null, kind: attachKind, url: attachUrl, caption: null, created_at: '' }} />
                </div>
              )}

              {/* Toolbar — appears when the composer is active (X pattern) */}
              {composerExpanded && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
                <button onClick={() => setShowLinkInput(v => !v)} title="Adjuntar link" style={{ ...toolBtn, minHeight: '38px', borderRadius: '999px', background: showLinkInput ? 'var(--accent-bg)' : 'var(--bg-elevated)', borderColor: showLinkInput ? 'var(--accent-border)' : 'var(--border-default)', color: showLinkInput ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  <Link2 size={15} /> {!isMobile && 'Link'}
                </button>
                <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Subir archivo" style={{ ...toolBtn, minHeight: '38px', borderRadius: '999px' }}>
                  <ImageIcon size={15} /> {uploading ? 'Subiendo…' : (!isMobile && 'Foto / archivo')}
                </button>
                <input ref={fileRef} type="file" accept="image/*,application/pdf,.html,.htm" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
                <button
                  onClick={publish}
                  disabled={posting || !canPublish}
                  style={{ marginLeft: 'auto', background: canPublish ? 'var(--accent)' : 'var(--bg-elevated)', color: canPublish ? 'var(--on-accent)' : 'var(--text-tertiary)', border: 'none', borderRadius: '999px', padding: '0 18px', minHeight: '38px', cursor: canPublish ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}
                >
                  <Send size={14} /> {posting ? '…' : 'Publicar'}
                </button>
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Feed */}
        {posts.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', padding: '48px 16px' }}>
            Aún no hay nada. ¡Sé el primero en compartir algo!
          </div>
        )}
        {posts.map(post => {
          const Icon = KIND_ICON[post.kind] ?? Link2
          const color = KIND_COLOR[post.kind] ?? '#6B7280'
          const authorName = post.author_id ? authors[post.author_id] ?? 'Unknown' : 'Unknown'
          const postReactions = reactions.filter(r => r.post_id === post.id)
          const totalReactions = postReactions.length
          return (
            <article key={post.id} style={{ background: 'var(--bg-surface)', border: isMobile ? 'none' : '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', borderRadius: isMobile ? 0 : '14px', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: isMobile ? '12px 16px' : '13px 16px' }}>
                <Avatar name={authorName} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{authorName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {timeAgo(post.created_at)}
                    {post.kind !== 'TEXT' && (
                      <span style={{ color, marginLeft: '6px', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>
                        <Icon size={9} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '2px' }} />{post.kind}
                      </span>
                    )}
                  </div>
                </div>
                {(post.author_id === userId) && (
                  <button onClick={() => deletePost(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '999px' }} title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Thought / copy — the main content */}
              {post.caption && (
                <p style={{ padding: '0 16px 12px', fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{post.caption}</p>
              )}

              {/* Attachment — edge-to-edge media */}
              {post.url && post.kind !== 'TEXT' && <PostMedia post={post} />}

              {/* Action bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: isMobile ? '8px 12px' : '8px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                {EMOJIS.map(emoji => {
                  const count = postReactions.filter(r => r.emoji === emoji).length
                  const mine = !!postReactions.find(r => r.emoji === emoji && r.user_id === userId)
                  return (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(post.id, emoji)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        minHeight: 'var(--touch-target)', padding: '0 14px', borderRadius: '999px', cursor: 'pointer',
                        background: mine ? 'var(--accent-bg)' : 'transparent',
                        border: `1px solid ${mine ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                        fontSize: '15px', color: 'var(--text-secondary)',
                        transition: 'transform 0.1s',
                      }}
                      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.92)' }}
                      onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      <span>{emoji}</span>
                      {count > 0 && <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: mine ? 'var(--accent)' : 'var(--text-tertiary)' }}>{count}</span>}
                    </button>
                  )
                })}
                {totalReactions > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    {totalReactions} reacci{totalReactions === 1 ? 'ón' : 'ones'}
                  </span>
                )}
              </div>
            </article>
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
    case 'TEXT':
      return null
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

interface LinkPreview { title?: string; description?: string; image?: string; publisher?: string }

// In-memory cache so previews aren't re-fetched every render/refresh
const previewCache: Record<string, LinkPreview | null> = {}

function LinkCard({ url }: { url: string }) {
  const [preview, setPreview] = useState<LinkPreview | null | undefined>(previewCache[url])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (url in previewCache) { setPreview(previewCache[url]); return }
    let cancelled = false
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json?.status === 'success') {
          const d = json.data
          const p: LinkPreview = { title: d.title, description: d.description, image: d.image?.url, publisher: d.publisher }
          previewCache[url] = p
          setPreview(p)
        } else {
          previewCache[url] = null
          setFailed(true)
        }
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [url])

  // Rich preview
  if (preview && (preview.title || preview.image)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', margin: '0 14px 14px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '10px', textDecoration: 'none', overflow: 'hidden' }}>
        {preview.image && (
          <img src={preview.image} alt={preview.title ?? ''} style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', display: 'block', borderBottom: '1px solid var(--border-subtle)' }} />
        )}
        <div style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
            <Link2 size={11} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{preview.publisher ?? domainOf(url)}</span>
          </div>
          {preview.title && <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.3 }}>{preview.title}</div>}
          {preview.description && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '3px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{preview.description}</div>}
        </div>
      </a>
    )
  }

  // Loading skeleton (until we know it failed)
  if (preview === undefined && !failed) {
    return (
      <div style={{ margin: '0 14px 14px', padding: '12px 14px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="animate-pulse-green" style={{ width: '38px', height: '38px', borderRadius: '6px', background: 'var(--bg-elevated)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="animate-pulse-green" style={{ height: '10px', width: '60%', background: 'var(--bg-elevated)', borderRadius: '4px', marginBottom: '6px' }} />
          <div className="animate-pulse-green" style={{ height: '9px', width: '85%', background: 'var(--bg-elevated)', borderRadius: '4px' }} />
        </div>
      </div>
    )
  }

  // Fallback simple card
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
