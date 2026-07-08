// concierge-send — respuesta HUMANA desde la Bandeja hacia el cliente real.
// La app no puede hablar con Meta directamente (las llaves viven aquí), así
// que la Bandeja invoca esta función: valida al agente, guarda el mensaje,
// toma la conversación (el bot se calla) y lo envía por el canal.
// Verify JWT: ACTIVADO (la llama un usuario autenticado de la app).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const META_API_VERSION = 'v20.0'

async function sendChannelMessage(channel: 'whatsapp' | 'instagram', to: string, text: string) {
  if (channel === 'whatsapp') {
    const token = Deno.env.get('WHATSAPP_TOKEN')!
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
    })
    return { ok: res.ok, data: await res.json() }
  }
  // Instagram API with Instagram Login: graph.instagram.com + Bearer del token IG
  const igToken = Deno.env.get('IG_PAGE_ACCESS_TOKEN')!
  const res = await fetch(`https://graph.instagram.com/${META_API_VERSION}/me/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${igToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: to }, message: { text } }),
  })
  return { ok: res.ok, data: await res.json() }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const { conversationId, body } = await req.json()
    if (!conversationId || !body?.trim()) {
      return new Response(JSON.stringify({ error: 'conversationId y body son requeridos' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Quién llama (con su propio JWT) — y validación de rol
    const supabaseUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await supabaseAdmin.from('profiles').select('role, full_name').eq('id', user.id).single()
    if (!profile || !['MASTER', 'OPS_MANAGER', 'TEAM'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Sin permiso para responder conversaciones' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { data: conv } = await supabaseAdmin.from('bot_conversations').select('id, channel, external_id, status, is_simulated, assigned_to').eq('id', conversationId).single()
    if (!conv) return new Response(JSON.stringify({ error: 'Conversación no encontrada' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })

    // Enviar al canal real (las simuladas nunca tocan Meta)
    if (!conv.is_simulated) {
      const sent = await sendChannelMessage(conv.channel, conv.external_id, body.trim())
      if (!sent.ok) {
        console.error('[concierge-send] envío falló', JSON.stringify(sent.data))
        return new Response(JSON.stringify({ error: sent.data?.error?.message ?? 'Meta rechazó el envío' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
    }

    // Guardar y tomar la conversación: responder como humano calla al bot
    await supabaseAdmin.from('bot_messages').insert({ conversation_id: conversationId, role: 'agent', body: body.trim() })
    const patch: Record<string, unknown> = { last_sender: 'agent', last_message_at: new Date().toISOString(), next_bot_reply_at: null, next_followup_at: null }
    if (conv.status !== 'human') Object.assign(patch, { status: 'human', assigned_to: conv.assigned_to ?? user.id, taken_at: new Date().toISOString() })
    await supabaseAdmin.from('bot_conversations').update(patch).eq('id', conversationId)

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[concierge-send] excepción', String(err))
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
