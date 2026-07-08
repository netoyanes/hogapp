// concierge-agent — Claude con herramientas: atiende UN turno de UNA conversación.
// Invocado por concierge-dispatcher (cron) o directo con { conversationId }.
// Principio del producto (no negociable): cada mensaje del cliente avanza la
// reserva; nunca se le pide un dato que ya dio ni cambia de canal sin contexto.
// Auto-contenida (sin imports locales) para poder desplegarse desde el editor
// del dashboard de Supabase, no solo por CLI.
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
    const data = await res.json()
    if (!res.ok) console.error('[concierge] sendWhatsApp error', JSON.stringify(data))
    return data
  }
  const pageToken = Deno.env.get('IG_PAGE_ACCESS_TOKEN')!
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: to }, message: { text } }),
  })
  const data = await res.json()
  if (!res.ok) console.error('[concierge] sendInstagram error', JSON.stringify(data))
  return data
}

// Mismo webhook de Slack que usa la app (app_settings.slack_webhook)
// deno-lint-ignore no-explicit-any
async function notifySlackFromEdge(supabaseAdmin: any, text: string) {
  const { data } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'slack_webhook').maybeSingle()
  const url = data?.value
  if (!url || !url.startsWith('https://hooks.slack.com/')) return
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
  } catch (err) {
    console.error('[concierge] slack notify failed', String(err))
  }
}

const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_SLOTS = ['19:00–20:30', '20:30–22:00', '22:00–23:30'] // debe reflejar Reservations.tsx
const MAX_TOOL_ROUNDS = 6

// Los clientes mexicanos dan su teléfono como sea: "81 1225 6803", "8112256803",
// "521811...". guests.phone exige E.164 — normalizamos aquí, no en el modelo.
function normalizePhoneMX(raw: string): string {
  let digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('521') && digits.length === 13) digits = '52' + digits.slice(3) // WhatsApp MX viejo: 521 + 10
  if (digits.length === 10) digits = '52' + digits
  return '+' + digits
}

const TOOLS = [
  {
    name: 'identificar_venue',
    description: 'Fija a qué venue del holding pertenece esta conversación, usando su código (ej. BM). Solo úsalo si el venue no está identificado todavía y el cliente lo mencionó o lo confirmó.',
    input_schema: { type: 'object', properties: { codigo_venue: { type: 'string' } }, required: ['codigo_venue'] },
  },
  {
    name: 'buscar_disponibilidad',
    description: 'Consulta horarios y cupo disponible de un venue para una fecha. Úsalo antes de ofrecer horarios al cliente.',
    input_schema: { type: 'object', properties: { fecha: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['fecha'] },
  },
  {
    name: 'crear_o_actualizar_cliente',
    description: 'Da de alta o encuentra al cliente por su teléfono. Llama esto en cuanto tengas nombre Y teléfono, antes de crear la reserva.',
    input_schema: {
      type: 'object',
      properties: { nombre: { type: 'string' }, telefono: { type: 'string', description: 'Formato E.164, ej. +526691234567' } },
      required: ['nombre', 'telefono'],
    },
  },
  {
    name: 'crear_reserva',
    description: 'Crea la reservación. Requiere que ya exista el cliente (crear_o_actualizar_cliente) y el venue identificado. Úsala solo cuando tengas fecha, hora/slot, y número de personas confirmados por el cliente.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        horario: { type: 'string', description: 'Uno de los slots devueltos por buscar_disponibilidad' },
        pax: { type: 'integer' },
        notas: { type: 'string' },
      },
      required: ['fecha', 'horario', 'pax'],
    },
  },
  {
    name: 'notificar_slack',
    description: 'Manda un aviso corto al equipo del venue por Slack. Úsalo al confirmar una reserva o cuando algo requiera atención del equipo pero no ameite escalar toda la conversación.',
    input_schema: { type: 'object', properties: { mensaje: { type: 'string' } }, required: ['mensaje'] },
  },
  {
    name: 'escalar_a_humano',
    description: 'Pasa la conversación a un humano. Úsalo si el cliente lo pide explícitamente, hay una queja, el grupo excede el límite de personas para autoservicio, no entendiste la solicitud dos veces seguidas, o el tema se sale de reservas (pagos, proveedores, prensa, quejas serias).',
    input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] },
  },
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { conversationId, isFollowup } = await req.json()
    if (!conversationId) return new Response(JSON.stringify({ error: 'conversationId required' }), { status: 400, headers: CORS })

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await runTurn(supabaseAdmin, conversationId, !!isFollowup)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[concierge-agent] excepción', String(err))
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})

// deno-lint-ignore no-explicit-any
async function runTurn(supabaseAdmin: any, conversationId: string, isFollowup: boolean) {
  const { data: conv } = await supabaseAdmin.from('bot_conversations').select('*').eq('id', conversationId).single()
  if (!conv || conv.status !== 'bot' || conv.is_simulated) return // respeta handoff; el simulador no toca Meta

  const [{ data: bu }, { data: cfg }, { data: history }, { data: venues }, { data: pay }] = await Promise.all([
    conv.bu_id ? supabaseAdmin.from('business_units').select('id, code, name').eq('id', conv.bu_id).maybeSingle() : { data: null },
    conv.bu_id ? supabaseAdmin.from('bot_venue_config').select('*').eq('bu_id', conv.bu_id).eq('channel', conv.channel).maybeSingle() : { data: null },
    supabaseAdmin.from('bot_messages').select('role, body').eq('conversation_id', conversationId).order('created_at').limit(30),
    supabaseAdmin.from('bot_venue_config').select('bu_id, external_account, business_units(code, name)').eq('channel', conv.channel).eq('enabled', true),
    conv.bu_id ? supabaseAdmin.from('venue_payment_config').select('*').eq('bu_id', conv.bu_id).maybeSingle() : { data: null },
  ])

  const { data: settings } = await supabaseAdmin.from('app_settings').select('key, value').in('key', ['bot_model', 'bot_enabled', 'app_public_url'])
  const settingsMap = Object.fromEntries((settings ?? []).map((s: { key: string; value: string }) => [s.key, s.value]))
  if (settingsMap.bot_enabled !== 'true') return // kill switch global

  // La config por canal manda: venue identificado con el canal apagado (o sin
  // configurar) → el bot no atiende; pasa al equipo con aviso al cliente.
  if (conv.bu_id && (!cfg || !cfg.enabled)) {
    const nota = 'Te conecto con el equipo para atenderte, dame un momento 🙌'
    await supabaseAdmin.from('bot_conversations').update({
      status: 'needs_human', escalation_reason: 'Canal del bot deshabilitado para este venue',
      next_bot_reply_at: null, next_followup_at: null,
    }).eq('id', conversationId)
    await supabaseAdmin.from('bot_messages').insert({ conversation_id: conversationId, role: 'bot', body: nota })
    await sendChannelMessage(conv.channel, conv.external_id, nota)
    await notifySlackFromEdge(supabaseAdmin, `🙋 *Cliente esperando atención humana* — ${bu?.name ?? 'venue'}: canal del bot deshabilitado`)
    return
  }

  const model = settingsMap.bot_model || 'claude-haiku-4-5-20251001'
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

  const ctx = { supabaseAdmin, conv: { ...conv }, bu, cfg }
  const system = buildSystemPrompt(ctx, venues ?? [], isFollowup, settingsMap.app_public_url, pay)
  // Mensajes consecutivos del mismo rol se fusionan: así el batching de 45s
  // (varios mensajes del cliente antes del turno) llega como un solo bloque,
  // y evita cualquier problema de alternancia estricta de roles con la API.
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = []
  for (const m of (history ?? []).filter((m: { role: string }) => m.role !== 'system')) {
    const role = m.role === 'guest' ? 'user' : 'assistant'
    const last = messages[messages.length - 1]
    if (last && last.role === role && typeof last.content === 'string') last.content += '\n' + (m.body ?? '')
    else messages.push({ role, content: m.body ?? '' })
  }
  if (messages.length && messages[0].role !== 'user') messages.unshift({ role: 'user', content: '[inicio de conversación]' })

  if (isFollowup) {
    messages.push({ role: 'user', content: '[sistema: el cliente no ha respondido — manda un único seguimiento breve, sin presionar, recordando qué falta]' })
  }

  let finalText = ''
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': ANTHROPIC_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 500, system, messages, tools: TOOLS }),
    })
    const data = await res.json()
    if (!res.ok) { console.error('[concierge-agent] Anthropic error', JSON.stringify(data)); return }

    const textBlocks = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text)
    finalText = textBlocks.join('\n').trim()

    if (data.stop_reason !== 'tool_use') break

    messages.push({ role: 'assistant', content: data.content })
    const toolResults = []
    for (const block of data.content) {
      if (block.type !== 'tool_use') continue
      const result = await executeTool(ctx, block.name, block.input)
      if (block.name === 'escalar_a_humano') { finalText = finalText || result.customerNote || ''; await sendIfAny(ctx, finalText); return }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  // Nunca dejar al cliente sin respuesta (regla del producto): si se agotaron
  // los turnos de herramientas sin texto final, manda un acuse breve.
  if (!finalText) finalText = 'Dame un segundo, ya estoy revisando eso 🙌'
  await sendIfAny(ctx, finalText)

  if (ctx.conv.status === 'bot') {
    const followupMinutes = ctx.cfg?.followup_after_minutes ?? 5
    const maxFollowups = ctx.cfg?.max_followups ?? 1
    const patch: Record<string, unknown> = {
      next_bot_reply_at: null,
      first_replied_at: ctx.conv.first_replied_at ?? new Date().toISOString(),
      last_sender: 'bot',
    }
    if (isFollowup) patch.followups_sent = (ctx.conv.followups_sent ?? 0) + 1
    const followupsSent = (patch.followups_sent as number) ?? ctx.conv.followups_sent ?? 0
    patch.next_followup_at = followupsSent < maxFollowups ? new Date(Date.now() + followupMinutes * 60000).toISOString() : null
    await supabaseAdmin.from('bot_conversations').update(patch).eq('id', conversationId)
  }
}

// deno-lint-ignore no-explicit-any
async function sendIfAny(ctx: any, text: string) {
  if (!text) return
  await ctx.supabaseAdmin.from('bot_messages').insert({ conversation_id: ctx.conv.id, role: 'bot', body: text })
  await sendChannelMessage(ctx.conv.channel, ctx.conv.external_id, text)
}

// deno-lint-ignore no-explicit-any
function buildSystemPrompt(ctx: any, venues: any[], isFollowup: boolean, publicUrl?: string, pay?: any): string {
  const lines: string[] = []
  lines.push('Eres el Concierge de HOG, un holding de venues de hospitalidad en México. Atiendes por ' + (ctx.conv.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram') + '.')
  lines.push('Regla dura, sin excepción: cada mensaje del cliente debe AVANZAR su reserva. Nunca le pidas un dato que ya dio. Nunca lo hagas cambiar de canal sin llevar su contexto. Sé breve, cálido, en español de México, sin emojis excesivos.')
  lines.push('El funnel es: capturar nombre, teléfono, fecha, hora y número de personas → confirmar. En cuanto tengas nombre y teléfono, usa crear_o_actualizar_cliente. En cuanto tengas fecha/hora/pax confirmados por el cliente, usa crear_reserva. No inventes disponibilidad — usa buscar_disponibilidad antes de ofrecer horarios.')
  lines.push('REGLA DE ORO — no mientas nunca sobre el estado de la reserva: solo puedes decirle al cliente que su reserva quedó lista si crear_reserva devolvió ok:true EN ESTA conversación. Si una herramienta devuelve un error, corrige el dato y reintenta; si no lo puedes resolver, dile con honestidad que hubo un detalle y usa escalar_a_humano. Confirmar en falso destruye la confianza del cliente y del equipo.')
  lines.push('Teléfonos: pásalos tal como los dé el cliente — el sistema los normaliza. Con 10 dígitos mexicanos basta. Horarios: al llamar crear_reserva usa el texto EXACTO del slot que devolvió buscar_disponibilidad (ej. "20:30–22:00"), no lo reescribas.')
  if (publicUrl) lines.push(`Cuando pidas el teléfono por primera vez, comparte una sola vez este enlace de aviso de privacidad: ${publicUrl}/?aviso=1 — así el cliente sabe cómo cuidamos su dato antes de dártelo. No lo repitas en cada mensaje.`)

  if (ctx.bu) {
    lines.push(`Venue de esta conversación: ${ctx.bu.name} (código ${ctx.bu.code}).`)
    if (ctx.cfg?.persona_note) lines.push(`Voz de este venue: ${ctx.cfg.persona_note}`)
    const maxPax = ctx.cfg?.escalate_over_pax ?? 12
    lines.push(`Si el grupo es mayor a ${maxPax} personas, usa escalar_a_humano — esos casos los atiende el equipo directamente.`)
    if (pay?.active && pay?.clabe) {
      const monto = pay.deposit_per_person ? `$${pay.deposit_per_person} MXN por persona` : pay.deposit_fixed ? `$${pay.deposit_fixed} MXN por reserva` : 'el monto que indique el equipo'
      lines.push(`Apartados para grupos grandes: si el grupo es de ${pay.deposit_over_pax} personas o más (sin pasar el límite de escalar), después de crear la reserva ofrece asegurarla con un depósito (${monto}). SOLO si el cliente acepta, comparte los datos: CLABE ${pay.clabe}${pay.bank_name ? ` (${pay.bank_name})` : ''}${pay.beneficiary ? `, a nombre de ${pay.beneficiary}` : ''}. Pídele que mande su comprobante por este mismo chat — el equipo lo valida, tú no confirmes pagos. Incluye "Apartado solicitado" en las notas de la reserva.${pay.instructions ? ' ' + pay.instructions : ''}`)
    }
  } else {
    const list = venues.map((v: { business_units: { code: string; name: string } }) => `${v.business_units?.name} (${v.business_units?.code})`).join(', ')
    lines.push(`Aún no sabemos a qué venue se refiere el cliente. Venues disponibles por este canal: ${list || 'ninguno configurado'}. Pregúntale a cuál se refiere y usa identificar_venue en cuanto lo confirme.`)
  }

  if (ctx.conv.pending_fields?.length) lines.push(`Datos que aún faltan por confirmar: ${ctx.conv.pending_fields.join(', ')}.`)
  lines.push(`Fecha y hora actuales: ${new Date().toISOString()}.`)
  if (isFollowup) lines.push('Este turno es un ÚNICO mensaje de seguimiento porque el cliente no respondió — que sea breve, sin presionar, recordando amablemente qué falta para cerrar su reserva.')
  lines.push('Si algo se sale de reservas (quejas serias, pagos, proveedores, prensa) o el cliente pide hablar con una persona, usa escalar_a_humano de inmediato.')

  return lines.join('\n')
}

// deno-lint-ignore no-explicit-any
async function executeTool(ctx: any, name: string, input: any): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = ctx
  switch (name) {
    case 'identificar_venue': {
      const { data: bu } = await supabaseAdmin.from('business_units').select('id, code, name').eq('code', input.codigo_venue).maybeSingle()
      if (!bu) return { error: 'Código de venue no encontrado.' }
      await supabaseAdmin.from('bot_conversations').update({ bu_id: bu.id }).eq('id', ctx.conv.id)
      ctx.conv.bu_id = bu.id
      ctx.bu = bu
      const { data: cfg } = await supabaseAdmin.from('bot_venue_config').select('*').eq('bu_id', bu.id).eq('channel', ctx.conv.channel).maybeSingle()
      ctx.cfg = cfg
      if (!cfg || !cfg.enabled) {
        return { ok: true, venue: bu.name, aviso: 'Este venue tiene el canal del bot DESHABILITADO — usa escalar_a_humano de inmediato para que el equipo lo atienda directamente.' }
      }
      return { ok: true, venue: bu.name }
    }

    case 'buscar_disponibilidad': {
      if (!ctx.conv.bu_id) return { error: 'Primero identifica el venue.' }
      const dow = new Date(input.fecha + 'T00:00:00').getDay()
      const [{ data: cap }, { data: res }] = await Promise.all([
        supabaseAdmin.from('venue_capacity').select('time_slot, max_reservations, max_pax').eq('bu_id', ctx.conv.bu_id).eq('day_of_week', dow).eq('active', true),
        supabaseAdmin.from('reservations').select('time_slot, party_size, status').eq('bu_id', ctx.conv.bu_id).eq('date', input.fecha),
      ])
      const used: Record<string, number> = {}
      const paxUsed: Record<string, number> = {}
      for (const r of res ?? []) if (['requested', 'confirmed', 'seated', 'completed'].includes(r.status)) {
        used[r.time_slot] = (used[r.time_slot] ?? 0) + 1
        paxUsed[r.time_slot] = (paxUsed[r.time_slot] ?? 0) + r.party_size
      }
      const slots = (cap && cap.length > 0)
        ? cap.map((c: { time_slot: string; max_reservations: number; max_pax: number }) => ({ horario: c.time_slot, cupo_libre: c.max_reservations - (used[c.time_slot] ?? 0), pax_libres: c.max_pax - (paxUsed[c.time_slot] ?? 0) }))
        : DEFAULT_SLOTS.map(s => ({ horario: s, cupo_libre: null, pax_libres: null }))
      return { fecha: input.fecha, horarios: slots.filter(s => s.cupo_libre === null || s.cupo_libre > 0) }
    }

    case 'crear_o_actualizar_cliente': {
      // consent_terms se queda en false aquí a propósito: el consentimiento se
      // sella con el tap del botón de confirmación por WhatsApp (Fase 3), no
      // silenciosamente al capturar el dato. El bot debe compartir el aviso de
      // privacidad en el mensaje donde pide el teléfono (ver system prompt).
      const { data: guest, error } = await supabaseAdmin.from('guests')
        .upsert({ phone: normalizePhoneMX(input.telefono), full_name: input.nombre, origin_bu: ctx.conv.bu_id }, { onConflict: 'phone', ignoreDuplicates: false })
        .select('id, full_name').single()
      if (error) return { error: error.message }
      await supabaseAdmin.from('guest_channels').upsert({ guest_id: guest.id, channel: ctx.conv.channel, external_id: ctx.conv.external_id }, { onConflict: 'channel,external_id' })
      await supabaseAdmin.from('bot_conversations').update({ guest_id: guest.id, pending_fields: (ctx.conv.pending_fields ?? []).filter((f: string) => f !== 'name' && f !== 'phone') }).eq('id', ctx.conv.id)
      ctx.conv.guest_id = guest.id
      return { ok: true, guest_id: guest.id, nombre: guest.full_name }
    }

    case 'crear_reserva': {
      if (!ctx.conv.bu_id) return { error: 'Falta identificar el venue.' }
      if (!ctx.conv.guest_id) return { error: 'Falta crear/encontrar al cliente primero (crear_o_actualizar_cliente).' }
      const { data: reserva, error } = await supabaseAdmin.from('reservations').insert({
        guest_id: ctx.conv.guest_id, bu_id: ctx.conv.bu_id, date: input.fecha, time_slot: input.horario,
        party_size: input.pax, notes: input.notas ?? null, status: 'requested',
        source: ctx.conv.channel, bot_conversation_id: ctx.conv.id,
      }).select('id').single()
      if (error) return { error: error.message }
      await supabaseAdmin.from('bot_conversations').update({ pending_fields: [] }).eq('id', ctx.conv.id)
      // Auditoría: la reserva del bot queda en Actividad atribuida a "Concierge HOG"
      await supabaseAdmin.from('activity_log').insert({
        user_id: null, action: 'reservation_created', entity_type: 'reservation', entity_id: reserva.id,
        details: { actor: 'Concierge HOG', bu: ctx.bu?.code, date: input.fecha, slot: input.horario, pax: input.pax, channel: ctx.conv.channel },
      })
      await notifySlackFromEdge(supabaseAdmin, `🤖 *Reserva vía Concierge* — ${ctx.bu?.name ?? ''}\n${input.fecha} · ${input.horario} · ${input.pax} pax`)
      return { ok: true, reservation_id: reserva.id }
    }

    case 'notificar_slack':
      await notifySlackFromEdge(supabaseAdmin, `🤖 ${input.mensaje}`)
      return { ok: true }

    case 'escalar_a_humano': {
      await supabaseAdmin.from('bot_conversations').update({
        status: 'needs_human', escalation_reason: input.motivo, next_bot_reply_at: null, next_followup_at: null,
      }).eq('id', ctx.conv.id)
      ctx.conv.status = 'needs_human'
      await notifySlackFromEdge(supabaseAdmin, `🙋 *Necesita atención humana* — ${ctx.bu?.name ?? 'venue sin identificar'}\nMotivo: ${input.motivo}`)
      return { ok: true, customerNote: 'Ahorita te conecto con alguien del equipo, dame un momento 🙌' }
    }

    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}
