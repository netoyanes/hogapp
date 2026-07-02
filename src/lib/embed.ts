// Detects the content kind of a pasted URL and builds an embeddable src.

export type PostKind = 'LINK' | 'YOUTUBE' | 'INSTAGRAM' | 'TIKTOK' | 'PDF' | 'IMAGE' | 'HTML'

export function detectKind(url: string): PostKind {
  const u = url.toLowerCase()
  if (/youtube\.com\/(watch|shorts)|youtu\.be\//.test(u)) return 'YOUTUBE'
  if (/instagram\.com\/(p|reel|reels|tv)\//.test(u))      return 'INSTAGRAM'
  if (/tiktok\.com\//.test(u))                            return 'TIKTOK'
  if (/\.pdf($|\?)/.test(u))                              return 'PDF'
  if (/\.(png|jpe?g|gif|webp|svg|avif)($|\?)/.test(u))    return 'IMAGE'
  if (/\.html?($|\?)/.test(u))                            return 'HTML'
  return 'LINK'
}

// YouTube video id from watch/shorts/youtu.be URLs
export function youtubeId(url: string): string | null {
  const m =
    url.match(/[?&]v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?&/]+)/) ||
    url.match(/youtube\.com\/shorts\/([^?&/]+)/)
  return m ? m[1] : null
}

export function youtubeEmbed(url: string): string | null {
  const id = youtubeId(url)
  return id ? `https://www.youtube.com/embed/${id}` : null
}

// Instagram embed — /p/<id>/embed works for posts, reels and IGTV
export function instagramEmbed(url: string): string | null {
  const m = url.match(/instagram\.com\/(p|reel|reels|tv)\/([^/?#]+)/)
  if (!m) return null
  const kind = m[1] === 'reels' ? 'reel' : m[1]
  return `https://www.instagram.com/${kind}/${m[2]}/embed`
}

// TikTok video id → oEmbed iframe
export function tiktokId(url: string): string | null {
  const m = url.match(/tiktok\.com\/.*\/video\/(\d+)/) || url.match(/tiktok\.com\/.*\/(\d{6,})/)
  return m ? m[1] : null
}

export function tiktokEmbed(url: string): string | null {
  const id = tiktokId(url)
  return id ? `https://www.tiktok.com/embed/v2/${id}` : null
}

export function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
