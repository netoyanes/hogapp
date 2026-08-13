// concierge-webhook — punto de entrada único para Meta (WhatsApp + Instagram).
// GET  = handshake de verificación (Meta lo llama al configurar el webhook).
// POST = mensajes entrantes. Guarda, decide si el bot debe responder, agenda
//        el turno (next_bot_reply_at) y responde 200 rápido — el envío real lo
//        hace concierge-agent, despachado por concierge-dispatcher (cron).
// Auto-contenida (sin imports locales) para poder desplegarse desde el editor
// del dashboard de Supabase, no solo por CLI.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Meta firma cada POST con el App Secret (HMAC SHA-256); comparación en tiempo constante.
async function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader) return false
  const expected = signatureHeader.replace('sha256=', '')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  if (hex.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)

  // ── Handshake de verificación ────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')
  // Dos firmas posibles: WhatsApp firma con el App Secret general (META_APP_SECRET);
  // Instagram Login firma con el "Instagram app secret" propio (IG_APP_SECRET).
  const secrets = [Deno.env.get('META_APP_SECRET'), Deno.env.get('IG_APP_SECRET')].filter(Boolean) as string[]
  let validSig = false
  for (const s of secrets) {
    if (await verifyMetaSignature(rawBody, signature, s)) { validSig = true; break }
  }
  if (!validSig) {
    console.error('[concierge-webhook] firma inválida')
    return new Response('Invalid signature', { status: 401 })
  }

  const body = JSON.parse(rawBody)
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    if (body.object === 'whatsapp_business_account') {
      await handleWhatsApp(supabaseAdmin, body)
    } else if (body.object === 'instagram') {
      await handleInstagram(supabaseAdmin, body)
    }
  } catch (err) {
    console.error('[concierge-webhook] error procesando evento', String(err))
  }

  // Meta requiere 200 rápido; el bot responde de forma asíncrona vía cron.
  return new Response('EVENT_RECEIVED', { status: 200 })
})

// Descarga una imagen de WhatsApp (comprobantes de depósito, etc.) y la sube
// al bucket público 'proofs' — devuelve la URL pública, o null si falla.
// deno-lint-ignore no-explicit-any
async function fetchWhatsAppImage(supabaseAdmin: any, mediaId: string, mime?: string): Promise<string | null> {
  try {
    const token = Deno.env.get('WHATSAPP_TOKEN')!
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!metaRes.ok) return null
    const { url } = await metaRes.json()
    const binRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!binRes.ok) return null
    const bytes = new Uint8Array(await binRes.arrayBuffer())
    const ext = (mime ?? 'image/jpeg').split('/')[1]?.split(';')[0] || 'jpg'
    const path = `concierge/${mediaId}.${ext}`
    const { error } = await supabaseAdmin.storage.from('proofs').upload(path, bytes, { contentType: mime ?? 'image/jpeg', upsert: true })
    if (error) { console.error('[webhook] upload imagen falló', error.message); return null }
    const { data } = supabaseAdmin.storage.from('proofs').getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch (err) {
    console.error('[webhook] fetchWhatsAppImage', String(err))
    return null
  }
}

// deno-lint-ignore no-explicit-any
async function handleWhatsApp(supabaseAdmin: any, body: any) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const phoneNumberId = value?.metadata?.phone_number_id
      for (const msg of value?.messages ?? []) {
        const from = msg.from as string
        const contactName = value.contacts?.[0]?.profile?.name ?? null
        const buId = await resolveVenueForChannel(supabaseAdmin, 'whatsapp', phoneNumberId, from)
        // CTWA: si el mensaje llega desde un anuncio, Meta manda `referral`
        // (headline/body del anuncio). El bot abre vendiendo ESO.
        const referral = msg.referral ? {
          source: 'whatsapp_ad',
          headline: msg.referral.headline ?? null,
          body: msg.referral.body ?? null,
          source_url: msg.referral.source_url ?? null,
          source_id: msg.referral.source_id ?? null,
        } : undefined
        if (msg.type === 'text') {
          await ingestMessage(supabaseAdmin, {
            channel: 'whatsapp', externalId: from, buId, displayName: contactName, body: msg.text?.body as string,
            referral,
          })
        } else if (msg.type === 'image') {
          // Comprobantes de depósito y fotos: se guardan en el hilo para que
          // el equipo los valide desde la Bandeja.
          const imageUrl = await fetchWhatsAppImage(supabaseAdmin, msg.image?.id, msg.image?.mime_type)
          await ingestMessage(supabaseAdmin, {
            channel: 'whatsapp', externalId: from, buId, displayName: contactName,
            body: msg.image?.caption?.trim() || '[📎 El cliente envió una imagen]',
            meta: imageUrl ? { image_url: imageUrl } : { image_failed: true },
            referral,
          })
        }
        // otros tipos (audio, sticker, ubicación) se ignoran por ahora
      }
    }
  }
}

// Perfil público del remitente en IG (nombre + handle) — para saludarlo por su
// nombre y no pedirle un dato que su perfil ya nos da. Falla en silencio.
async function fetchIgProfile(igsid: string): Promise<string | null> {
  try {
    const token = Deno.env.get('IG_PAGE_ACCESS_TOKEN')
    if (!token) return null
    const res = await fetch(`https://graph.instagram.com/v20.0/${igsid}?fields=name,username`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const p = await res.json()
    if (p.name && p.username) return `${p.name} (@${p.username})`
    return p.name ?? (p.username ? `@${p.username}` : null)
  } catch {
    return null
  }
}

// deno-lint-ignore no-explicit-any
async function handleInstagram(supabaseAdmin: any, body: any) {
  for (const entry of body.entry ?? []) {
    const igAccountId = entry.id as string // cuenta de IG que RECIBIÓ el mensaje → identifica el venue
    for (const event of entry.messaging ?? []) {
      // Eco = mensaje que NUESTRA cuenta envió. Si lo mandó el sistema
      // (bot/Bandeja) se reconoce y se ignora; si no, alguien del equipo
      // respondió desde la app de Instagram — se registra en el hilo.
      if (event.message?.is_echo) { await ingestIgEcho(supabaseAdmin, event); continue }
      const from = event.sender?.id as string
      const buId = await resolveVenueForChannel(supabaseAdmin, 'instagram', igAccountId, from)
      const imageUrl = (event.message?.attachments ?? []).find((a: { type: string }) => a.type === 'image')?.payload?.url ?? null
      // Click-to-message: si el DM viene de un anuncio, Meta manda `referral`
      // (ads_context_data trae el título del anuncio). El bot abre vendiendo ESO.
      const rawRef = event.referral ?? event.message?.referral ?? event.postback?.referral ?? null
      // Respuesta a una HISTORIA (incluye historias promocionadas): llega como
      // reply_to.story, SIN datos del anuncio — pero el contexto igual vale oro.
      const storyRef = event.message?.reply_to?.story ?? null
      const referral = rawRef ? {
        source: 'instagram_ad',
        headline: rawRef.ads_context_data?.ad_title ?? null,
        ref: rawRef.ref ?? null,
        ad_id: rawRef.ad_id ?? null,
        photo_url: rawRef.ads_context_data?.photo_url ?? null,
      } : storyRef ? {
        source: 'instagram_story',
        story_id: storyRef.id ?? null,
        story_url: storyRef.url ?? null,
      } : undefined
      if (!event.message?.text && !imageUrl) continue
      await ingestMessage(supabaseAdmin, {
        channel: 'instagram', externalId: from, buId, displayName: null,
        body: event.message?.text ?? '[📎 El cliente envió una imagen]',
        meta: imageUrl ? { image_url: imageUrl } : undefined,
        referral,
        fetchDisplayName: () => fetchIgProfile(from), // solo se llama si aún no lo tenemos
      })
    }
  }
}

// Eco de Instagram (is_echo): lo envió nuestra cuenta. Los envíos del propio
// sistema se reconocen por el mid guardado al enviar o por texto idéntico
// reciente (cubre la carrera eco-vs-insert). Lo demás lo escribió ALGUIEN DEL
// EQUIPO desde la app de Instagram: se registra como mensaje del equipo y la
// conversación pasa a manos humanas — el bot se calla, igual que cuando
// responden desde la Bandeja.
// deno-lint-ignore no-explicit-any
async function ingestIgEcho(supabaseAdmin: any, event: any) {
  try {
    const guestId = event.recipient?.id as string | undefined
    if (!guestId) return
    const mid = (event.message?.mid as string | undefined) ?? null
    const text = (event.message?.text as string | undefined)?.trim()
      || (event.message?.attachments?.length ? '[📎 El equipo envió un adjunto]' : '')
    if (!text) return

    const { data: conv } = await supabaseAdmin.from('bot_conversations')
      .select('id, status').eq('channel', 'instagram').eq('external_id', guestId).maybeSingle()
    if (!conv) return // eco de una conversación que no seguimos

    if (mid) {
      const { data: byMid } = await supabaseAdmin.from('bot_messages')
        .select('id').eq('conversation_id', conv.id).contains('meta', { mid }).limit(1)
      if (byMid?.length) return
    }
    const cutoff = new Date(Date.now() - 10 * 60000).toISOString()
    const { data: recent } = await supabaseAdmin.from('bot_messages')
      .select('body').eq('conversation_id', conv.id).in('role', ['bot', 'agent']).gte('created_at', cutoff)
    if ((recent ?? []).some((r: { body: string | null }) => (r.body ?? '').trim() === text)) return

    await supabaseAdmin.from('bot_messages').insert({
      conversation_id: conv.id, role: 'agent', body: text,
      meta: { via: 'instagram_app', ...(mid ? { mid } : {}) },
    })
    const patch: Record<string, unknown> = {
      last_sender: 'agent', last_message_at: new Date().toISOString(),
      next_bot_reply_at: null, next_followup_at: null,
    }
    if (conv.status === 'bot' || conv.status === 'needs_human') {
      Object.assign(patch, { status: 'human', taken_at: new Date().toISOString() })
    }
    await supabaseAdmin.from('bot_conversations').update(patch).eq('id', conv.id)
    console.log('[webhook] respuesta desde la app de IG registrada', conv.id, '→', text.slice(0, 60))
  } catch (err) {
    console.error('[webhook] ingestIgEcho', String(err))
  }
}

// Resuelve a qué venue pertenece el mensaje:
// · Instagram: cada cuenta de IG está ligada 1:1 a un venue → match directo.
// · WhatsApp: el número es del holding (compartido) → si ya hay conversación
//   o guest_channels para este external_id, reusa su bu_id; si no, queda null
//   y el agente pregunta a qué venue se refiere (resuelto en conversación).
// deno-lint-ignore no-explicit-any
async function resolveVenueForChannel(supabaseAdmin: any, channel: 'whatsapp' | 'instagram', externalAccount: string | undefined, externalId: string): Promise<string | null> {
  const { data: existing } = await supabaseAdmin.from('bot_conversations').select('bu_id').eq('channel', channel).eq('external_id', externalId).maybeSingle()
  if (existing?.bu_id) return existing.bu_id

  if (channel === 'instagram' && externalAccount) {
    const { data: cfg } = await supabaseAdmin.from('bot_venue_config').select('bu_id').eq('channel', 'instagram').eq('external_account', externalAccount).eq('enabled', true).maybeSingle()
    if (cfg?.bu_id) return cfg.bu_id
  }
  return null
}

// deno-lint-ignore no-explicit-any
async function ingestMessage(supabaseAdmin: any, opts: { channel: 'whatsapp' | 'instagram'; externalId: string; buId: string | null; displayName: string | null; body: string; meta?: Record<string, unknown>; referral?: Record<string, unknown>; fetchDisplayName?: () => Promise<string | null> }) {
  const { channel, externalId, buId, body, meta, referral, fetchDisplayName } = opts
  let { displayName } = opts

  const { data: conv } = await supabaseAdmin.from('bot_conversations')
    .select('*').eq('channel', channel).eq('external_id', externalId).maybeSingle()

  // Perfil del canal (nombre/handle de IG): una sola vez, cuando aún no lo tenemos
  if (!displayName && !conv?.display_name && fetchDisplayName) {
    displayName = await fetchDisplayName()
  }

  let conversationId = conv?.id as string | undefined

  if (!conversationId) {
    const { data: created, error } = await supabaseAdmin.from('bot_conversations').insert({
      channel, external_id: externalId, bu_id: buId, display_name: displayName,
      status: 'bot', last_sender: 'guest', pending_fields: ['name', 'phone', 'date', 'time', 'pax'],
      referral: referral ?? null,
    }).select('*').single()
    if (error) { console.error('[concierge-webhook] no se pudo crear conversación', error.message); return }
    conversationId = created.id
  }

  await supabaseAdmin.from('bot_messages').insert({ conversation_id: conversationId, role: 'guest', body, meta: meta ?? null })
  console.log('[webhook] msg entrante', channel, 'conv', conversationId, '→', String(body).slice(0, 60))

  const current = conv ?? { status: 'bot', first_replied_at: null, next_bot_reply_at: null }
  const patch: Record<string, unknown> = {
    last_sender: 'guest', last_message_at: new Date().toISOString(),
    display_name: displayName ?? conv?.display_name ?? null,
  }
  // Campaña: si este mensaje llegó desde un anuncio, es lo que le interesa
  // AHORA — se guarda/actualiza en la conversación para que el bot lo venda.
  if (referral) patch.referral = referral
  if (conv?.status === 'closed') patch.status = 'bot' // el cliente reabre la conversación

  // Respeta el handoff: si un humano tiene la conversación, no se agenda al bot.
  const effectiveStatus = patch.status ?? current.status
  if (effectiveStatus === 'bot') {
    let cfg: { enabled: boolean; first_reply_delay_seconds: number } | null = null
    if (buId) {
      const { data } = await supabaseAdmin.from('bot_venue_config').select('enabled, first_reply_delay_seconds').eq('bu_id', buId).eq('channel', channel).maybeSingle()
      cfg = data
    }
    if (buId && !cfg?.enabled) {
      // La config por canal manda: canal apagado (o sin configurar) → al equipo, sin bot.
      patch.status = 'needs_human'
      patch.escalation_reason = 'Canal del bot deshabilitado para este venue'
      patch.next_bot_reply_at = null
    } else {
      const alreadyPending = current.next_bot_reply_at && new Date(current.next_bot_reply_at) > new Date()
      if (!alreadyPending) {
        // 1a respuesta espera el delay del venue (45s default); las siguientes,
        // inmediatas — el cron las despacha en su próximo ciclo (≤60s).
        const delaySeconds = current.first_replied_at ? 0 : (cfg?.first_reply_delay_seconds ?? 45)
        patch.next_bot_reply_at = new Date(Date.now() + delaySeconds * 1000).toISOString()
      }
    }
  }

  await supabaseAdmin.from('bot_conversations').update(patch).eq('id', conversationId)
}
