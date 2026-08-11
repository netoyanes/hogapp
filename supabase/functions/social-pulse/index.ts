// social-pulse — métricas de redes sociales por venue + análisis de emoción.
//  action 'pull':    extrae métricas y comentarios de cada cuenta conectada
//                    (Instagram Graph, Facebook, Google Places) + DMs del bot
//  action 'analyze': clasifica menciones pendientes con Claude (sentimiento
//                    -1..1, emoción, intención de compra)
//  action 'run':     pull + analyze (para el cron diario)
// Auto-contenida para desplegar desde el editor del dashboard.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const GRAPH = 'https://graph.facebook.com/v21.0'

// deno-lint-ignore no-explicit-any
type Admin = any

interface Account {
  id: string; bu_id: string; platform: 'instagram' | 'facebook' | 'google'
  handle: string | null; external_id: string; access_token: string | null; active: boolean
}

async function gjson(url: string) {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(JSON.stringify(data.error ?? data).slice(0, 300))
  return data
}

// ── Instagram (Graph API, cuenta business) ──────────────────────────────────
async function pullInstagram(admin: Admin, acc: Account, snap: Record<string, unknown>) {
  const token = acc.access_token || Deno.env.get('IG_PAGE_ACCESS_TOKEN')
  if (!token) throw new Error('sin token de Instagram')
  const id = acc.external_id
  const info = await gjson(`${GRAPH}/${id}?fields=followers_count,follows_count,media_count,username&access_token=${token}`)
  snap.followers = info.followers_count ?? null
  snap.following = info.follows_count ?? null
  snap.posts = info.media_count ?? null

  try {
    const ins = await gjson(`${GRAPH}/${id}/insights?metric=reach&period=days_28&access_token=${token}`)
    snap.reach = ins.data?.[0]?.values?.at(-1)?.value ?? null
  } catch (_) { /* insights requieren permisos extra — opcional */ }

  // Engagement: promedio (likes+comentarios) de los últimos 10 posts / seguidores
  const media = await gjson(`${GRAPH}/${id}/media?fields=id,like_count,comments_count,timestamp&limit=10&access_token=${token}`)
  const posts = (media.data ?? []) as { id: string; like_count?: number; comments_count?: number }[]
  if (posts.length && snap.followers) {
    const avg = posts.reduce((s, p) => s + (p.like_count ?? 0) + (p.comments_count ?? 0), 0) / posts.length
    snap.engagement = Math.round((avg / (snap.followers as number)) * 10000) / 100 // %
  }

  // Comentarios recientes de los últimos 5 posts → menciones por analizar
  const rows: Record<string, unknown>[] = []
  for (const p of posts.slice(0, 5)) {
    try {
      const cs = await gjson(`${GRAPH}/${p.id}/comments?fields=id,text,username,timestamp&limit=25&access_token=${token}`)
      for (const c of (cs.data ?? []) as { id: string; text?: string; username?: string; timestamp?: string }[]) {
        if (!c.text) continue
        rows.push({ account_id: acc.id, kind: 'comment', external_id: c.id, author: c.username ?? null, text: c.text, posted_at: c.timestamp ?? null })
      }
    } catch (_) { /* post sin permiso de comentarios */ }
  }
  if (rows.length) await admin.from('social_mentions').upsert(rows, { onConflict: 'account_id,kind,external_id', ignoreDuplicates: true })
  return rows.length
}

// ── Facebook (página) ───────────────────────────────────────────────────────
async function pullFacebook(admin: Admin, acc: Account, snap: Record<string, unknown>) {
  const token = acc.access_token || Deno.env.get('IG_PAGE_ACCESS_TOKEN')
  if (!token) throw new Error('sin token de Facebook')
  const info = await gjson(`${GRAPH}/${acc.external_id}?fields=fan_count,followers_count,overall_star_rating,rating_count&access_token=${token}`)
  snap.followers = info.followers_count ?? info.fan_count ?? null
  snap.rating = info.overall_star_rating ?? null
  snap.reviews_count = info.rating_count ?? null
  try {
    const rt = await gjson(`${GRAPH}/${acc.external_id}/ratings?fields=review_text,created_time,rating,reviewer&limit=25&access_token=${token}`)
    const rows = ((rt.data ?? []) as { review_text?: string; created_time?: string; rating?: number; reviewer?: { name?: string } }[])
      .filter(r => r.review_text)
      .map(r => ({
        account_id: acc.id, kind: 'review', external_id: `${acc.external_id}:${r.created_time}`,
        author: r.reviewer?.name ?? null, text: r.review_text, posted_at: r.created_time ?? null, rating: r.rating ?? null,
      }))
    if (rows.length) await admin.from('social_mentions').upsert(rows, { onConflict: 'account_id,kind,external_id', ignoreDuplicates: true })
    return rows.length
  } catch (_) { return 0 }
}

// ── Google Maps (Places Details: rating + últimas 5 reseñas) ────────────────
async function pullGoogle(admin: Admin, acc: Account, snap: Record<string, unknown>) {
  const key = acc.access_token || Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!key) throw new Error('sin GOOGLE_MAPS_API_KEY')
  const data = await gjson(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${acc.external_id}&fields=rating,user_ratings_total,reviews&reviews_sort=newest&key=${key}`)
  const r = data.result ?? {}
  snap.rating = r.rating ?? null
  snap.reviews_count = r.user_ratings_total ?? null
  const rows = ((r.reviews ?? []) as { author_name?: string; text?: string; time?: number; rating?: number }[])
    .filter(v => v.text)
    .map(v => ({
      account_id: acc.id, kind: 'review', external_id: `${acc.external_id}:${v.time}`,
      author: v.author_name ?? null, text: v.text, posted_at: v.time ? new Date(v.time * 1000).toISOString() : null, rating: v.rating ?? null,
    }))
  if (rows.length) await admin.from('social_mentions').upsert(rows, { onConflict: 'account_id,kind,external_id', ignoreDuplicates: true })
  return rows.length
}

// ── DMs del concierge: volumen y ventas (reservas creadas vía bot) ──────────
async function pullDMs(admin: Admin, buId: string, snap: Record<string, unknown>) {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { data: convs } = await admin.from('bot_conversations').select('id').eq('bu_id', buId)
    const ids = (convs ?? []).map((c: { id: string }) => c.id)
    if (ids.length) {
      const { count: inCount } = await admin.from('bot_messages').select('id', { count: 'exact', head: true })
        .in('conversation_id', ids).eq('role', 'guest').gte('created_at', since)
      const { count: outCount } = await admin.from('bot_messages').select('id', { count: 'exact', head: true })
        .in('conversation_id', ids).eq('role', 'bot').gte('created_at', since)
      snap.dm_in = inCount ?? 0
      snap.dm_out = outCount ?? 0
    }
    const { count: sales } = await admin.from('reservations').select('id', { count: 'exact', head: true })
      .eq('bu_id', buId).not('bot_conversation_id', 'is', null).gte('created_at', since)
    snap.dm_sales = sales ?? 0
  } catch (_) { /* tablas del bot opcionales */ }
}

async function pull(admin: Admin) {
  const { data: accounts } = await admin.from('social_accounts').select('*').eq('active', true)
  const log: string[] = []
  for (const acc of (accounts ?? []) as Account[]) {
    const snap: Record<string, unknown> = { account_id: acc.id, taken_on: new Date().toISOString().slice(0, 10) }
    try {
      let mentions = 0
      if (acc.platform === 'instagram') mentions = await pullInstagram(admin, acc, snap)
      else if (acc.platform === 'facebook') mentions = await pullFacebook(admin, acc, snap)
      else if (acc.platform === 'google') mentions = await pullGoogle(admin, acc, snap)
      if (acc.platform === 'instagram') await pullDMs(admin, acc.bu_id, snap)
      await admin.from('social_snapshots').upsert(snap, { onConflict: 'account_id,taken_on' })
      log.push(`${acc.platform}/${acc.handle ?? acc.external_id}: ok (+${mentions} menciones)`)
    } catch (e) {
      log.push(`${acc.platform}/${acc.handle ?? acc.external_id}: ERROR ${(e as Error).message}`)
    }
  }
  return log
}

// ── Análisis de emoción con Claude: lotes de menciones pendientes ───────────
async function analyze(admin: Admin) {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return ['sin ANTHROPIC_API_KEY — análisis omitido']
  const { data: pending } = await admin.from('social_mentions')
    .select('id, kind, text, rating').is('analyzed_at', null).limit(40)
  if (!pending?.length) return ['sin menciones pendientes']

  const schema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            sentiment: { type: 'number', description: 'de -1 (muy negativo) a 1 (muy positivo)' },
            emotion: { type: 'string', enum: ['alegría', 'entusiasmo', 'neutral', 'duda', 'decepción', 'enojo'] },
            sales_intent: { type: 'boolean', description: 'true si pregunta por precio, reserva, disponibilidad o quiere comprar' },
          },
          required: ['id', 'sentiment', 'emotion', 'sales_intent'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 8000,
      system: 'Analizas comentarios y reseñas de redes sociales de venues de hospitalidad en México (bares, cafés, clubes). Para cada texto devuelve sentimiento (-1 a 1), la emoción dominante y si hay intención de compra/reserva. Considera sarcasmo, modismos mexicanos y emojis.',
      messages: [{
        role: 'user',
        content: `Clasifica estas menciones (id · tipo · texto):\n${pending.map((m: { id: string; kind: string; text: string; rating: number | null }) => `${m.id} · ${m.kind}${m.rating ? ` (${m.rating}★)` : ''} · ${String(m.text).slice(0, 400).replace(/\n/g, ' ')}`).join('\n')}`,
      }],
      output_config: { format: { type: 'json_schema', schema } },
    }),
  })
  const data = await res.json()
  if (!res.ok) return [`Anthropic error: ${JSON.stringify(data).slice(0, 200)}`]
  if (data.stop_reason === 'refusal') return ['análisis rehusado — lote omitido']

  const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
  let parsed: { items?: { id: string; sentiment: number; emotion: string; sales_intent: boolean }[] }
  try { parsed = JSON.parse(text) } catch { return ['respuesta no parseable'] }

  let updated = 0
  for (const it of parsed.items ?? []) {
    const { error } = await admin.from('social_mentions').update({
      sentiment: Math.max(-1, Math.min(1, it.sentiment)),
      emotion: it.emotion,
      sales_intent: it.sales_intent,
      analyzed_at: new Date().toISOString(),
    }).eq('id', it.id)
    if (!error) updated++
  }
  return [`analizadas ${updated}/${pending.length} menciones`]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let action = 'run'
  try { action = (await req.json())?.action ?? 'run' } catch { /* body vacío = run */ }

  const log: string[] = []
  if (action === 'pull' || action === 'run') log.push(...await pull(admin))
  if (action === 'analyze' || action === 'run') {
    // hasta 3 lotes de 40 por corrida
    for (let i = 0; i < 3; i++) {
      const r = await analyze(admin)
      log.push(...r)
      if (r[0]?.startsWith('sin menciones')) break
    }
  }
  return new Response(JSON.stringify({ ok: true, log }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
})
