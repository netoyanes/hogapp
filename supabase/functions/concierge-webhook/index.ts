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
  const appSecret = Deno.env.get('META_APP_SECRET')!
  const validSig = await verifyMetaSignature(rawBody, signature, appSecret)
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

// deno-lint-ignore no-explicit-any
async function handleWhatsApp(supabaseAdmin: any, body: any) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const phoneNumberId = value?.metadata?.phone_number_id
      for (const msg of value?.messages ?? []) {
        if (msg.type !== 'text') continue // Fase 2: solo texto; botones/media se agregan después
        const from = msg.from as string
        const text = msg.text?.body as string
        const contactName = value.contacts?.[0]?.profile?.name ?? null
        const buId = await resolveVenueForChannel(supabaseAdmin, 'whatsapp', phoneNumberId, from)
        await ingestMessage(supabaseAdmin, {
          channel: 'whatsapp', externalId: from, buId, displayName: contactName, body: text,
        })
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
async function handleInstagram(supabaseAdmin: any, body: any) {
  for (const entry of body.entry ?? []) {
    const igAccountId = entry.id as string // cuenta de IG que RECIBIÓ el mensaje → identifica el venue
    for (const event of entry.messaging ?? []) {
      if (!event.message?.text || event.message?.is_echo) continue // ignora eco de mensajes propios
      const from = event.sender?.id as string
      const text = event.message.text as string
      const buId = await resolveVenueForChannel(supabaseAdmin, 'instagram', igAccountId, from)
      await ingestMessage(supabaseAdmin, {
        channel: 'instagram', externalId: from, buId, displayName: null, body: text,
      })
    }
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
async function ingestMessage(supabaseAdmin: any, opts: { channel: 'whatsapp' | 'instagram'; externalId: string; buId: string | null; displayName: string | null; body: string }) {
  const { channel, externalId, buId, displayName, body } = opts

  const { data: conv } = await supabaseAdmin.from('bot_conversations')
    .select('*').eq('channel', channel).eq('external_id', externalId).maybeSingle()

  let conversationId = conv?.id as string | undefined

  if (!conversationId) {
    const { data: created, error } = await supabaseAdmin.from('bot_conversations').insert({
      channel, external_id: externalId, bu_id: buId, display_name: displayName,
      status: 'bot', last_sender: 'guest', pending_fields: ['name', 'phone', 'date', 'time', 'pax'],
    }).select('*').single()
    if (error) { console.error('[concierge-webhook] no se pudo crear conversación', error.message); return }
    conversationId = created.id
  }

  await supabaseAdmin.from('bot_messages').insert({ conversation_id: conversationId, role: 'guest', body })

  const current = conv ?? { status: 'bot', first_replied_at: null, next_bot_reply_at: null }
  const patch: Record<string, unknown> = {
    last_sender: 'guest', last_message_at: new Date().toISOString(),
    display_name: displayName ?? conv?.display_name ?? null,
  }
  if (conv?.status === 'closed') patch.status = 'bot' // el cliente reabre la conversación

  // Respeta el handoff: si un humano tiene la conversación, no se agenda al bot.
  const effectiveStatus = patch.status ?? current.status
  if (effectiveStatus === 'bot') {
    const alreadyPending = current.next_bot_reply_at && new Date(current.next_bot_reply_at) > new Date()
    if (!alreadyPending) {
      const delaySeconds = await getReplyDelay(supabaseAdmin, buId, channel, !current.first_replied_at)
      patch.next_bot_reply_at = new Date(Date.now() + delaySeconds * 1000).toISOString()
    }
  }

  await supabaseAdmin.from('bot_conversations').update(patch).eq('id', conversationId)
}

// deno-lint-ignore no-explicit-any
async function getReplyDelay(supabaseAdmin: any, buId: string | null, channel: string, isFirstReply: boolean): Promise<number> {
  if (!isFirstReply) return 0 // "las siguientes inmediatamente" — el cron las despacha en su próximo ciclo (≤60s)
  if (!buId) return 45
  const { data: cfg } = await supabaseAdmin.from('bot_venue_config').select('first_reply_delay_seconds').eq('bu_id', buId).eq('channel', channel).maybeSingle()
  return cfg?.first_reply_delay_seconds ?? 45
}
