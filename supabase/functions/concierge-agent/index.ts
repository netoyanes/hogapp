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
  // Instagram API with Instagram Login: se envía por graph.instagram.com con
  // el token de la cuenta IG (IGAA...), no por graph.facebook.com con Página.
  const igToken = Deno.env.get('IG_PAGE_ACCESS_TOKEN')!
  const res = await fetch(`https://graph.instagram.com/${META_API_VERSION}/me/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${igToken}`, 'Content-Type': 'application/json' },
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
const MAX_TOOL_ROUNDS = 6

// El venue no maneja turnos fijos: acepta "20:30", "8:30 pm", "8pm"… y lo
// normaliza a HH:MM 24h (zero-padded, para que ordene bien como texto).
function normalizeTime(raw: string): string | null {
  const s = String(raw).trim().toLowerCase()
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const ampm = m[3]?.replace(/\./g, '')
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// Los clientes mexicanos dan su teléfono como sea: "81 1225 6803", "8112256803",
// "521811...". guests.phone exige E.164 — normalizamos y VALIDAMOS aquí, no en
// el modelo. Devuelve null si el número no cuadra (ej. 9 dígitos + símbolos):
// mejor rebotar al cliente por el dato correcto que registrar basura.
function normalizePhoneMX(raw: string): string | null {
  const trimmed = String(raw).trim()
  // Internacional explícito (turistas: +1..., +34...) — se respeta tal cual
  if (trimmed.startsWith('+') && /^\+[1-9]\d{7,14}$/.test(trimmed.replace(/[\s-]/g, ''))) {
    return trimmed.replace(/[\s-]/g, '')
  }
  let digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('521') && digits.length === 13) digits = '52' + digits.slice(3) // WhatsApp MX viejo: 521 + 10
  if (digits.length === 10) digits = '52' + digits
  return /^52\d{10}$/.test(digits) ? '+' + digits : null
}

const TOOLS = [
  {
    name: 'identificar_venue',
    description: 'Fija a qué venue del holding pertenece esta conversación, usando su código (ej. BM). Solo úsalo si el venue no está identificado todavía y el cliente lo mencionó o lo confirmó.',
    input_schema: { type: 'object', properties: { codigo_venue: { type: 'string' } }, required: ['codigo_venue'] },
  },
  {
    name: 'buscar_disponibilidad',
    description: 'Consulta si el venue tiene cupo para una fecha (el venue NO maneja horarios fijos — el cliente llega a la hora que quiera y se queda el tiempo que guste). Úsala antes de confirmar una fecha muy solicitada, para avisar si está por llenarse.',
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
    description: 'Crea la reservación. Requiere que ya exista el cliente (crear_o_actualizar_cliente) y el venue identificado. Úsala solo cuando tengas fecha, hora de llegada y número de personas confirmados por el cliente.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        horario: { type: 'string', description: 'Hora de llegada que acordaste con el cliente, en cualquier formato claro (ej. "20:30", "8:30 pm", "9pm") — el sistema la normaliza.' },
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
  console.log('[agent] turno', conversationId, 'canal', conv?.channel, 'status', conv?.status ?? 'no-encontrada', isFollowup ? '(seguimiento)' : '')
  if (!conv || conv.status !== 'bot' || conv.is_simulated) { console.log('[agent] skip: status/simulada'); return } // respeta handoff; el simulador no toca Meta

  const [{ data: bu }, { data: cfg }, { data: history }, { data: venues }, { data: pay }] = await Promise.all([
    conv.bu_id ? supabaseAdmin.from('business_units').select('id, code, name').eq('id', conv.bu_id).maybeSingle() : { data: null },
    conv.bu_id ? supabaseAdmin.from('bot_venue_config').select('*').eq('bu_id', conv.bu_id).eq('channel', conv.channel).maybeSingle() : { data: null },
    supabaseAdmin.from('bot_messages').select('role, body').eq('conversation_id', conversationId).order('created_at').limit(30),
    supabaseAdmin.from('bot_venue_config').select('bu_id, external_account, business_units(code, name)').eq('channel', conv.channel).eq('enabled', true),
    conv.bu_id ? supabaseAdmin.from('venue_payment_config').select('*').eq('bu_id', conv.bu_id).maybeSingle() : { data: null },
  ])

  const { data: settings } = await supabaseAdmin.from('app_settings').select('key, value').in('key', ['bot_model', 'bot_enabled', 'app_public_url'])
  const settingsMap = Object.fromEntries((settings ?? []).map((s: { key: string; value: string }) => [s.key, s.value]))
  if (settingsMap.bot_enabled !== 'true') { console.log('[agent] skip: kill switch global apagado'); return }

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
  console.log('[agent] respuesta enviada por', ctx.conv.channel, '→', String(text).slice(0, 60))
}

// deno-lint-ignore no-explicit-any
function buildSystemPrompt(ctx: any, venues: any[], isFollowup: boolean, publicUrl?: string, pay?: any): string {
  const lines: string[] = []
  lines.push('Eres el Concierge de HOG, un holding de venues de hospitalidad en México. Atiendes por ' + (ctx.conv.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram') + '.')
  lines.push('Saludo: abre SIEMPRE tu primera respuesta de la conversación con un saludo breve y educado — una sola línea que salude y se ponga a ayudar de inmediato. Sencillo, cálido y funcional; nada de párrafos de bienvenida ni formalidades acartonadas. En mensajes posteriores ya no saludes de nuevo.')
  lines.push('Regla dura, sin excepción: cada mensaje del cliente debe AVANZAR su reserva. Nunca le pidas un dato que ya dio. Nunca lo hagas cambiar de canal sin llevar su contexto. Sé breve, cálido, en español de México, sin emojis excesivos.')
  lines.push('El funnel es: capturar nombre, teléfono, fecha, hora de llegada y número de personas → confirmar. En cuanto tengas nombre y teléfono, usa crear_o_actualizar_cliente. En cuanto tengas fecha/hora/pax confirmados por el cliente, usa crear_reserva.')
  lines.push('IMPORTANTE — el venue NO tiene horarios fijos ni turnos: la hora de llegada la decide el cliente libremente, y se queda el tiempo que quiera (sin salida forzada). Nunca le ofrezcas una lista de horarios para elegir — solo pregúntale a qué hora le gustaría llegar. Usa buscar_disponibilidad únicamente para saber si esa noche el venue está muy lleno y, si es el caso, avisarle con anticipación.')
  lines.push('REGLA DE ORO — no mientas nunca sobre el estado de la reserva: solo puedes decirle al cliente que su reserva quedó lista si crear_reserva devolvió ok:true EN ESTA conversación. Si una herramienta devuelve un error, corrige el dato y reintenta; si no lo puedes resolver, dile con honestidad que hubo un detalle y usa escalar_a_humano. Confirmar en falso destruye la confianza del cliente y del equipo.')
  lines.push('PRIORIZA LA VENTA: registra y usa TODO lo que el cliente ya dijo (si ya mencionó cuántas personas o la ocasión, no se lo vuelvas a preguntar — dalo por bueno y anótalo). Pide solo lo que falta, de preferencia una cosa a la vez, y avanza siempre hacia el cierre: datos → fecha → horario → reserva. Si un dato viene mal, corrige SOLO ese dato y en el mismo mensaje sigue con lo demás (ej. "oye, tu número parece incompleto, ¿me lo confirmas? y mientras, ¿qué fecha quieres?"). Nunca dejes la conversación en pausa esperando: siempre cierra tu mensaje con la siguiente pregunta concreta.')
  lines.push('Teléfonos: valida a ojo — un celular mexicano son 10 dígitos (o internacional con +). Si lo que dio el cliente tiene menos/más dígitos o símbolos raros, NO lo registres: pídele que lo confirme, con buena onda. El sistema también lo valida por si acaso.')
  lines.push('Peticiones especiales (área privada, decoración, pastel, ocasiones): anótalas en las notas de la reserva y dile al cliente que el equipo lo revisa y le confirma — no prometas lo que no controlas, pero tampoco lo dejes sin registro.')
  if (ctx.conv.display_name) lines.push(`El perfil del cliente en este canal dice: "${ctx.conv.display_name}" — OJO: suele ser un apodo o nombre artístico, no su nombre real. Úsalo solo para saludar con calidez. Para la reserva SIEMPRE pide su nombre ("¿a nombre de quién pongo la reserva?") y a partir de que te lo dé, dirígete a la persona por ESE nombre.`)
  lines.push('RESERVA EXISTENTE: cuando registres al cliente, el sistema te dirá si ya tiene reservas próximas. Si ya tiene una para el MISMO día que está pidiendo, NO crees otra: confírmasela con sus datos ("ya tienes tu mesa el sábado a las 20:30 para 6 👍"). Si pide cambios (hora/personas), usa crear_reserva con los datos nuevos — el sistema ACTUALIZA la existente en lugar de duplicar.')
  if (publicUrl) lines.push(`Cuando pidas el teléfono por primera vez, comparte una sola vez este enlace de aviso de privacidad: ${publicUrl}/?aviso=1 — así el cliente sabe cómo cuidamos su dato antes de dártelo. No lo repitas en cada mensaje.`)

  if (ctx.bu) {
    lines.push(`Venue de esta conversación: ${ctx.bu.name} (código ${ctx.bu.code}).`)
    if (ctx.cfg?.persona_note) lines.push(`Voz de este venue: ${ctx.cfg.persona_note}`)
    const maxPax = ctx.cfg?.escalate_over_pax ?? 12
    lines.push(`Grupos mayores a ${maxPax} personas: usa escalar_a_humano SIN crear reserva — eventos de ese tamaño los arma el equipo directamente.`)
    if (pay?.active && pay?.clabe) {
      const formula = pay.deposit_per_person
        ? `el total es (número de personas × $${pay.deposit_per_person} MXN)`
        : `el total es $${pay.deposit_fixed ?? 0} MXN por reserva`
      lines.push(`APARTADO OBLIGATORIO para grupos de ${pay.deposit_over_pax} personas o más (y hasta ${maxPax}). El flujo, en este orden: (1) captura los datos y usa crear_reserva normal, incluyendo en las notas "Apartado pendiente: $TOTAL" — ${formula}, calcúlalo tú y menciona la cifra exacta; (2) explícale al cliente que para grupos de ese tamaño se pide un apartado de $TOTAL para asegurar su mesa y comparte los datos de depósito: CLABE ${pay.clabe}${pay.bank_name ? ` (${pay.bank_name})` : ''}${pay.beneficiary ? `, a nombre de ${pay.beneficiary}` : ''}; pídele que mande su comprobante por este mismo chat; (3) usa escalar_a_humano con motivo "Apartado pendiente de validación: $TOTAL" — el equipo valida el pago y confirma la reserva. Tu último mensaje debe incluir monto y datos de depósito ANTES de escalar. Tú nunca confirmes pagos ni reservas con apartado pendiente.${pay.instructions ? ' ' + pay.instructions : ''}`)
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
        supabaseAdmin.from('venue_capacity').select('max_reservations, max_pax').eq('bu_id', ctx.conv.bu_id).eq('day_of_week', dow).eq('active', true).maybeSingle(),
        supabaseAdmin.from('reservations').select('party_size, status').eq('bu_id', ctx.conv.bu_id).eq('date', input.fecha),
      ])
      if (!cap) return { fecha: input.fecha, sin_limite: true, nota: 'Este venue no tiene tope configurado esa noche — hay cupo libremente.' }
      let usadas = 0, paxUsadas = 0
      for (const r of res ?? []) if (['requested', 'confirmed', 'seated', 'completed'].includes(r.status)) {
        usadas++; paxUsadas += r.party_size
      }
      return {
        fecha: input.fecha,
        reservas_max: cap.max_reservations, reservas_usadas: usadas,
        pax_max: cap.max_pax, pax_usadas: paxUsadas,
        casi_lleno: usadas >= cap.max_reservations * 0.85 || paxUsadas >= cap.max_pax * 0.85,
      }
    }

    case 'crear_o_actualizar_cliente': {
      // consent_terms se queda en false aquí a propósito: el consentimiento se
      // sella con el tap del botón de confirmación por WhatsApp (Fase 3), no
      // silenciosamente al capturar el dato. El bot debe compartir el aviso de
      // privacidad en el mensaje donde pide el teléfono (ver system prompt).
      const tel = normalizePhoneMX(input.telefono)
      if (!tel) {
        return { error: `El teléfono "${input.telefono}" no es válido (un celular mexicano son 10 dígitos). NO registres nada: dile al cliente con buena onda que su número parece incompleto y pídele confirmarlo — y en el MISMO mensaje sigue avanzando con lo que falte (fecha/horario).` }
      }
      const { data: guest, error } = await supabaseAdmin.from('guests')
        .upsert({ phone: tel, full_name: input.nombre, origin_bu: ctx.conv.bu_id }, { onConflict: 'phone', ignoreDuplicates: false })
        .select('id, full_name').single()
      if (error) return { error: error.message }
      // El handle de IG queda ligado al guest (mismo cliente en IG + WA sin duplicar)
      const handle = ctx.conv.display_name?.match(/@([\w.]+)/)?.[1] ?? null
      await supabaseAdmin.from('guest_channels').upsert({ guest_id: guest.id, channel: ctx.conv.channel, external_id: ctx.conv.external_id, handle }, { onConflict: 'channel,external_id' })
      await supabaseAdmin.from('bot_conversations').update({ guest_id: guest.id, pending_fields: (ctx.conv.pending_fields ?? []).filter((f: string) => f !== 'name' && f !== 'phone') }).eq('id', ctx.conv.id)
      ctx.conv.guest_id = guest.id
      // Reservas próximas del cliente en este venue: el modelo evita duplicar
      // y puede confirmar la existente ("ya tienes tu mesa el sábado 👍").
      const { data: proximas } = await supabaseAdmin.from('reservations')
        .select('date, time_slot, party_size, status')
        .eq('guest_id', guest.id).eq('bu_id', ctx.conv.bu_id ?? '00000000-0000-0000-0000-000000000000')
        .gte('date', new Date().toISOString().slice(0, 10))
        .in('status', ['requested', 'confirmed'])
        .order('date').limit(3)
      return { ok: true, guest_id: guest.id, nombre: guest.full_name, reservas_proximas: proximas ?? [] }
    }

    case 'crear_reserva': {
      if (!ctx.conv.bu_id) return { error: 'Falta identificar el venue.' }
      if (!ctx.conv.guest_id) return { error: 'Falta crear/encontrar al cliente primero (crear_o_actualizar_cliente).' }
      const hora = normalizeTime(input.horario)
      if (!hora) return { error: `No entendí la hora "${input.horario}". Pídele al cliente que la confirme (ej. "9:30 pm" o "21:30").` }
      // Anti-duplicados: si el cliente ya tiene reserva viva ese día en este
      // venue, se ACTUALIZA esa en lugar de crear una segunda.
      const { data: existentes } = await supabaseAdmin.from('reservations')
        .select('id, time_slot, party_size, status')
        .eq('guest_id', ctx.conv.guest_id).eq('bu_id', ctx.conv.bu_id).eq('date', input.fecha)
        .in('status', ['requested', 'confirmed']).limit(1)
      const existente = existentes?.[0]
      if (existente) {
        const { error: upErr } = await supabaseAdmin.from('reservations').update({
          time_slot: hora, party_size: input.pax,
          notes: input.notas ?? undefined, bot_conversation_id: ctx.conv.id,
        }).eq('id', existente.id)
        if (upErr) return { error: upErr.message }
        await supabaseAdmin.from('activity_log').insert({
          user_id: null, action: 'reservation_updated', entity_type: 'reservation', entity_id: existente.id,
          details: { actor: 'Concierge HOG', bu: ctx.bu?.code, date: input.fecha, slot: hora, pax: input.pax, antes: `${existente.time_slot} · ${existente.party_size} pax` },
        })
        await notifySlackFromEdge(supabaseAdmin, `🤖 *Reserva actualizada vía Concierge* — ${ctx.bu?.name ?? ''}\n${input.fecha} · ${existente.time_slot}→${hora} · ${existente.party_size}→${input.pax} pax`)
        return { ok: true, actualizada: true, reservation_id: existente.id, estado: existente.status, aviso: `El cliente YA tenía reserva ese día (${existente.time_slot}, ${existente.party_size} pax, ${existente.status}) — se actualizó con los datos nuevos en lugar de duplicar. Confírmale los datos finales.` }
      }
      const { data: reserva, error } = await supabaseAdmin.from('reservations').insert({
        guest_id: ctx.conv.guest_id, bu_id: ctx.conv.bu_id, date: input.fecha, time_slot: hora,
        party_size: input.pax, notes: input.notas ?? null, status: 'requested',
        source: ctx.conv.channel, bot_conversation_id: ctx.conv.id,
      }).select('id').single()
      if (error) return { error: error.message }
      await supabaseAdmin.from('bot_conversations').update({ pending_fields: [] }).eq('id', ctx.conv.id)
      // Auditoría: la reserva del bot queda en Actividad atribuida a "Concierge HOG"
      await supabaseAdmin.from('activity_log').insert({
        user_id: null, action: 'reservation_created', entity_type: 'reservation', entity_id: reserva.id,
        details: { actor: 'Concierge HOG', bu: ctx.bu?.code, date: input.fecha, slot: hora, pax: input.pax, channel: ctx.conv.channel },
      })
      await notifySlackFromEdge(supabaseAdmin, `🤖 *Reserva vía Concierge* — ${ctx.bu?.name ?? ''}\n${input.fecha} · ${hora} · ${input.pax} pax`)
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
