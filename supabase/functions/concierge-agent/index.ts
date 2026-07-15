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
const MAX_TOOL_ROUNDS = 8

// El modelo NO debe calcular fechas: recibe una tabla ya resuelta en hora de
// México ("el sábado" → la fila marcada sábado). Un timestamp UTC pelón ya
// produjo un "sábado 12" que en realidad era domingo.
function fechaContexto(): string {
  const tz = 'America/Mexico_City'
  const largo = new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const filas: string[] = []
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.now() + i * 86400000)
    filas.push(`${i === 0 ? 'HOY → ' : ''}${largo.format(d)} = ${iso.format(d)}`)
  }
  return filas.join(' | ')
}

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
    description: 'Consulta la disponibilidad del venue para una fecha. El sistema responde según el tipo de venue: cupo de la noche (restaurantes/clubs), horarios de cita disponibles (wellness), eventos con lugares (art house), o unidades libres en un rango (hospedaje — pasa también fecha_fin).',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD (en hospedaje: check-in)' },
        servicio: { type: 'string', description: 'Solo wellness: nombre del servicio si el cliente ya eligió uno' },
        fecha_fin: { type: 'string', description: 'Solo hospedaje: YYYY-MM-DD del check-out' },
      },
      required: ['fecha'],
    },
  },
  {
    name: 'crear_o_actualizar_cliente',
    description: 'Da de alta o encuentra al cliente por su teléfono. Llama esto en cuanto tengas nombre Y teléfono, antes de crear la reserva.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        telefono: { type: 'string', description: 'Formato E.164, ej. +526691234567' },
        cumpleanos: { type: 'string', description: 'Solo si el cliente mencionó su cumpleaños: YYYY-MM-DD, o MM-DD si no dio el año' },
      },
      required: ['nombre', 'telefono'],
    },
  },
  {
    name: 'crear_reserva',
    description: 'Crea la reservación. Requiere que ya exista el cliente (crear_o_actualizar_cliente) y el venue identificado. Según el tipo de venue pasa además: servicio+horario de cita (wellness), evento (art house), o unidad+fecha_fin (hospedaje). Úsala solo con los datos confirmados por el cliente.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD (en hospedaje: check-in)' },
        horario: { type: 'string', description: 'Hora de llegada o de la cita, en cualquier formato claro (ej. "20:30", "8:30 pm") — el sistema la normaliza. En eventos y hospedaje puedes omitirla.' },
        pax: { type: 'integer' },
        notas: { type: 'string' },
        servicio: { type: 'string', description: 'Solo wellness: nombre del servicio que reserva' },
        evento: { type: 'string', description: 'Solo art house: nombre del evento al que confirma lugares' },
        unidad: { type: 'string', description: 'Solo hospedaje: nombre de la unidad elegida (ej. "Pod 1")' },
        fecha_fin: { type: 'string', description: 'Solo hospedaje: YYYY-MM-DD del check-out' },
      },
      required: ['fecha', 'pax'],
    },
  },
  {
    name: 'listar_servicios',
    description: 'Lista los servicios del venue (wellness): nombre, duración, precio y días/horarios en que se ofrecen. Úsala cuando el cliente pregunte qué hay o no sepa qué reservar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'listar_eventos',
    description: 'Lista la cartelera de eventos anunciados del venue (art house), con fecha, hora y lugares disponibles. Omite fecha para ver los próximos.',
    input_schema: { type: 'object', properties: { fecha: { type: 'string', description: 'YYYY-MM-DD; omite para ver próximos 30 días' } } },
  },
  {
    name: 'listar_unidades',
    description: 'Lista las unidades del venue (hospedaje) libres en un rango de fechas, con capacidad y tarifa por noche — y la cotización del rango. Requiere check-in y check-out.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD del check-in' },
        fecha_fin: { type: 'string', description: 'YYYY-MM-DD del check-out' },
      },
      required: ['fecha', 'fecha_fin'],
    },
  },
  {
    name: 'programacion_venue',
    description: 'Consulta qué DJs tocan en el venue (hoy, una fecha, o los próximos 7 días). Úsala cuando pregunten "¿quién toca?", "¿qué hay el sábado?", "¿hay DJ hoy?" — y aprovecha la respuesta para ofrecer la reserva.',
    input_schema: {
      type: 'object',
      properties: { fecha: { type: 'string', description: 'YYYY-MM-DD; omite para ver los próximos 7 días' } },
    },
  },
  {
    name: 'registrar_dj',
    description: 'Registra a un DJ/artista interesado en tocar en el venue, en la base de talento. Úsala cuando quien escribe sea un DJ ofreciendo sus servicios y ya hayas capturado sus datos básicos.',
    input_schema: {
      type: 'object',
      properties: {
        nombre_artistico: { type: 'string' },
        generos: { type: 'string', description: 'Géneros separados por coma (ej. "house, techno")' },
        ciudad: { type: 'string' },
        fee_aproximado: { type: 'number', description: 'Fee aproximado en MXN si lo mencionó' },
        telefono: { type: 'string' },
        links: { type: 'string', description: 'IG, SoundCloud, mixes — lo que haya compartido' },
        notas: { type: 'string', description: 'Disponibilidad u otros detalles que mencionó' },
      },
      required: ['nombre_artistico'],
    },
  },
  {
    name: 'registrar_proveedor',
    description: 'Registra en el directorio comercial a una empresa o persona que escribe OFRECIENDO productos o servicios (uniformes, insumos, publicidad, software, etc.). Úsala cuando el mensaje sea claramente una oferta B2B, con los datos que ya haya compartido.',
    input_schema: {
      type: 'object',
      properties: {
        empresa: { type: 'string', description: 'Nombre de la empresa' },
        nombre_contacto: { type: 'string', description: 'Nombre de la persona que escribe' },
        servicio: { type: 'string', description: 'Qué ofrece (ej. "personalización de playeras y bolsas para empresas")' },
        telefono: { type: 'string' },
        email: { type: 'string' },
        ciudad: { type: 'string' },
        notas: { type: 'string', description: 'Detalles extra que mencionó (materiales, condiciones, links)' },
      },
      required: ['empresa', 'servicio'],
    },
  },
  {
    name: 'agregar_nota_reserva',
    description: 'Agrega una nota a la reserva próxima del cliente y avisa al equipo del venue. Úsala cuando el cliente avise que va en camino, que llega tarde, o cualquier detalle operativo de su reserva ya hecha (cambio de mesa, silla de bebé, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        nota: { type: 'string', description: 'La nota, corta y clara (ej. "Va en camino, llega ~30 min tarde")' },
        fecha: { type: 'string', description: 'YYYY-MM-DD de la reserva (omite si solo tiene una próxima)' },
      },
      required: ['nota'],
    },
  },
  {
    name: 'cancelar_reserva',
    description: 'Cancela una reserva próxima del cliente. Úsala en cuanto el cliente pida cancelar — sin fricción ni interrogatorio. Si el cliente tiene varias reservas próximas y no especificó cuál, el sistema te las devuelve para que le preguntes.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD de la reserva a cancelar (omite si el cliente no la dijo y solo tiene una próxima)' },
        motivo: { type: 'string', description: 'Motivo si el cliente lo mencionó espontáneamente (opcional, no lo interrogues)' },
      },
    },
  },
  {
    name: 'notificar_slack',
    description: 'Manda un aviso corto al equipo del venue por Slack. Úsalo al confirmar una reserva o cuando algo requiera atención del equipo pero no amerite escalar toda la conversación.',
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

  const [{ data: bu }, { data: cfg }, { data: history }, { data: venues }, { data: pay }, { data: botInfo }] = await Promise.all([
    conv.bu_id ? supabaseAdmin.from('business_units').select('id, code, name, venue_type, inventory_type, reservation_policy').eq('id', conv.bu_id).maybeSingle() : { data: null },
    conv.bu_id ? supabaseAdmin.from('bot_venue_config').select('*').eq('bu_id', conv.bu_id).eq('channel', conv.channel).maybeSingle() : { data: null },
    supabaseAdmin.from('bot_messages').select('role, body').eq('conversation_id', conversationId).order('created_at').limit(30),
    supabaseAdmin.from('bot_venue_config').select('bu_id, external_account, business_units(code, name)').eq('channel', conv.channel).eq('enabled', true),
    conv.bu_id ? supabaseAdmin.from('venue_payment_config').select('*').eq('bu_id', conv.bu_id).maybeSingle() : { data: null },
    conv.bu_id ? supabaseAdmin.from('venue_bot_info').select('faq').eq('bu_id', conv.bu_id).maybeSingle() : { data: null },
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

  const ctx = { supabaseAdmin, conv: { ...conv }, bu, cfg, pay, faq: botInfo?.faq ?? null }
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
      console.log('[agent] tool', block.name, JSON.stringify(block.input).slice(0, 180), '→', JSON.stringify(result).slice(0, 180))
      if (block.name === 'escalar_a_humano') { finalText = finalText || String(result.customerNote ?? ''); await sendIfAny(ctx, finalText); return }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  // Nunca dejar al cliente sin respuesta (regla del producto). Si se agotaron
  // las rondas de herramientas sin texto final, algo se atoró — un "dame un
  // segundo" sin nadie detrás es perder la venta en silencio: se escala a
  // humano para que el equipo lo cache en la Bandeja.
  if (!finalText) {
    finalText = 'Déjame lo checo con el equipo y te confirmo en un momento 🙌'
    console.error('[agent] rondas agotadas sin respuesta — escalando', conversationId)
    await supabaseAdmin.from('bot_conversations').update({
      status: 'needs_human', escalation_reason: 'El agente agotó sus rondas de herramientas sin poder responder — revisar logs',
      next_bot_reply_at: null, next_followup_at: null,
    }).eq('id', conversationId)
    ctx.conv.status = 'needs_human'
    await notifySlackFromEdge(supabaseAdmin, `🙋 *Concierge atorado — atender en Bandeja* — ${bu?.name ?? 'venue sin identificar'}\nEl agente no logró completar la acción tras varias rondas de herramientas.`)
  }
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
  lines.push('BREVEDAD — esto es un chat, no un correo: responde en 1 a 3 líneas, UNA idea por mensaje. Responde EXACTAMENTE lo que preguntó (si pregunta el costo, la primera línea es el costo) y cierra con UN paso siguiente corto. NUNCA vuelques toda la información de golpe: dosifica — los datos largos (transferencias, cuentas, políticas completas) se comparten SOLO cuando el cliente ya dijo que quiere su lugar, no antes. Tono: sutil, amable, neutro y eficiente — cero párrafos de vendedor.')
  lines.push('LA VENTA SE CIERRA AQUÍ: NUNCA redirijas al cliente a otro correo, teléfono o canal para comprar o "confirmar precios" — los contactos que aparezcan en el FAQ son referencia interna, no para mandar al cliente. Si no sabes un dato, dilo con honestidad y usa escalar_a_humano; jamás regales la venta a otro lado.')
  lines.push('ESTRATEGIA DEL FAQ: si el FAQ del venue trae líneas de OBJETIVO DE VENTA, PRIORIDAD o CÓMO RESPONDER, son la estrategia comercial del venue y las sigues al pie de la letra (qué ofrecer primero, qué ofrecer solo si aplica, qué guardar para después).')
  lines.push('FORMATO: escribes en un chat de WhatsApp/Instagram, NO en markdown. Prohibido usar **dobles asteriscos**, títulos, o listas con guiones — no se renderizan y se ven rotos. Si quieres resaltar algo en WhatsApp usa *asteriscos simples* en una palabra o frase corta, con moderación. Escribe SIEMPRE 100% en español: ni un "Wait", "Ok so" ni ningún anglicismo de relleno.')
  lines.push('NO RE-CONFIRMES: propón los datos completos UNA sola vez ("te apunto el sábado 11 a las 20:30, 8 personas, ¿va?"). Si el cliente dice que sí, o repite el MISMO dato que tú propusiste (ej. tú dijiste 20:30 y él contesta "está bien 8:30"), eso ES la confirmación — usa crear_reserva de inmediato, no vuelvas a preguntar lo mismo. Volver a confirmar lo ya confirmado mata la venta. Solo aclara si el cliente dio dos datos CONTRADICTORIOS (ej. "8 personas" y luego "10"): pregunta cuál, una vez, dentro de tu misma propuesta.')
  // ── MÓDULO POR TIPO DE VENUE — el funnel y el modelo de inventario cambian
  //    por tipo; las reglas duras de arriba y abajo aplican a todos.
  const vt = ctx.bu?.venue_type ?? 'fnb'
  const policy = ctx.bu?.reservation_policy ?? {}
  if (vt === 'wellness') {
    lines.push('El funnel es: servicio → fecha → horario disponible → número de personas → nombre y teléfono → confirmar. Usa listar_servicios si el cliente no sabe qué hay; usa buscar_disponibilidad para ver los horarios REALES de un día antes de ofrecer cualquiera. En cuanto tengas nombre y teléfono, usa crear_o_actualizar_cliente; con servicio/fecha/horario/pax confirmados, usa crear_reserva (pasa el servicio y el horario exactos).')
    lines.push('IMPORTANTE — este venue trabaja por CITAS con horarios fijos: SIEMPRE ofrece horarios concretos que buscar_disponibilidad te devolvió ("tengo 9:00, 10:30 o 12:00"), NUNCA digas "llega cuando quieras" ni inventes horarios. Si el horario que pide está lleno, ofrece los que sí tienen lugar.')
    if (policy.cancel_window_hours) lines.push(`CAMBIOS Y CANCELACIONES: se aceptan hasta ${policy.cancel_window_hours} horas antes de la cita. Dentro de esa ventana NO prometas el cambio ni la cancelación: explica la política con amabilidad y usa escalar_a_humano para que el equipo decida.`)
  } else if (vt === 'art_house') {
    lines.push('El funnel es: evento (o fecha → cartelera del día) → número de personas → nombre y teléfono → confirmar lugares. Usa listar_eventos para la cartelera; buscar_disponibilidad te dice los lugares libres. En cuanto tengas nombre y teléfono, usa crear_o_actualizar_cliente; con el evento y pax confirmados, usa crear_reserva (pasa el nombre del evento).')
    lines.push('IMPORTANTE — este venue funciona por EVENTOS con cupo: solo ofrece eventos ANUNCIADOS que las herramientas te devuelvan. Si no hay cartelera para esa fecha, dilo con honestidad y ofrece avisarle cuando se anuncie — NO inventes eventos, artistas ni fechas.')
    lines.push('EVENTO LLENO: si el evento está agotado o no caben todos, ofrece otro evento de la cartelera; si insiste en ese, anótalo en lista de espera con notificar_slack ("LISTA DE ESPERA EVENTO: nombre, pax, evento, teléfono") y explícale que el equipo le avisa si se libera lugar.')
  } else if (vt === 'boutique_hospitality') {
    lines.push('El funnel es: fecha de llegada (check-in) → fecha de salida (check-out) → número de personas → tipo de unidad → nombre y teléfono → reservar. Usa listar_unidades para ver qué unidades hay libres en ese rango y sus tarifas. En cuanto tengas nombre y teléfono, usa crear_o_actualizar_cliente; con unidad y fechas confirmadas, usa crear_reserva (pasa unidad, fecha y fecha_fin).')
    lines.push('IMPORTANTE — este venue es HOSPEDAJE: COTIZA SIEMPRE antes de reservar — noches × tarifa de la unidad, y di el total claro en MXN. Comparte las políticas del lugar (horas de check-in/out, condiciones) cuando sean relevantes.')
    lines.push('Para ASEGURAR la estancia se usa el flujo de apartado (datos de depósito + comprobante por este chat + validación del equipo) — nunca digas que la estancia está asegurada sin ese flujo.')
  } else {
    // fnb y dance_club — el modelo original de Bruma, sin cambios
    lines.push('El funnel es: capturar nombre, teléfono, fecha, hora de llegada y número de personas → confirmar. En cuanto tengas nombre y teléfono, usa crear_o_actualizar_cliente. En cuanto tengas fecha/hora/pax confirmados por el cliente, usa crear_reserva.')
    lines.push('IMPORTANTE — el venue NO tiene horarios fijos ni turnos: la hora de llegada la decide el cliente libremente, y se queda el tiempo que quiera (sin salida forzada). Nunca le ofrezcas una lista de horarios para elegir — solo pregúntale a qué hora le gustaría llegar. Usa buscar_disponibilidad únicamente para saber si esa noche el venue está muy lleno y, si es el caso, avisarle con anticipación.')
    if (vt === 'dance_club') lines.push('Este venue es un CLUB: la programación de DJs es tu mejor argumento de venta — consúltala con programacion_venue y úsala para cerrar la reserva en el mismo mensaje.')
  }
  if (policy && Object.keys(policy).length && policy.notes) lines.push(`Notas de política del venue: ${policy.notes}`)
  lines.push('REGLA DE ORO — no mientas nunca sobre el estado de la reserva: solo puedes decirle al cliente que su reserva quedó lista si crear_reserva devolvió ok:true EN ESTA conversación. Si una herramienta devuelve un error, corrige el dato y reintenta; si no lo puedes resolver, dile con honestidad que hubo un detalle y usa escalar_a_humano. Confirmar en falso destruye la confianza del cliente y del equipo.')
  lines.push('PRIORIZA LA VENTA: registra y usa TODO lo que el cliente ya dijo (si ya mencionó cuántas personas o la ocasión, no se lo vuelvas a preguntar — dalo por bueno y anótalo). Pide solo lo que falta, de preferencia una cosa a la vez, y avanza siempre hacia el cierre: datos → fecha → horario → reserva. Si un dato viene mal, corrige SOLO ese dato y en el mismo mensaje sigue con lo demás (ej. "oye, tu número parece incompleto, ¿me lo confirmas? y mientras, ¿qué fecha quieres?"). Nunca dejes la conversación en pausa esperando: siempre cierra tu mensaje con la siguiente pregunta concreta.')
  lines.push('Teléfonos: valida a ojo — un celular mexicano son 10 dígitos (o internacional con +). Si lo que dio el cliente tiene menos/más dígitos o símbolos raros, NO lo registres: pídele que lo confirme, con buena onda. El sistema también lo valida por si acaso.')
  lines.push('Peticiones especiales (área privada, decoración, pastel, ocasiones): anótalas en las notas de la reserva y dile al cliente que el equipo lo revisa y le confirma — no prometas lo que no controlas, pero tampoco lo dejes sin registro.')
  if (ctx.conv.display_name) lines.push(`El perfil del cliente en este canal dice: "${ctx.conv.display_name}" — OJO: suele ser un apodo o nombre artístico, no su nombre real. Úsalo solo para saludar con calidez. Para la reserva SIEMPRE pide su nombre ("¿a nombre de quién pongo la reserva?") y a partir de que te lo dé, dirígete a la persona por ESE nombre.`)
  // Atribución de campaña: si el cliente escribió desde un anuncio o
  // respondiendo a una historia, el bot abre vendiendo ESO — nunca el
  // genérico "¿qué información necesitas?"
  const refCamp = ctx.conv.referral
  if (refCamp && (refCamp.headline || refCamp.body || refCamp.ref)) {
    const anuncio = [refCamp.headline, refCamp.body].filter(Boolean).join(' — ') || String(refCamp.ref ?? '')
    lines.push(`CAMPAÑA — este cliente llegó escribiendo DESDE UN ANUNCIO: "${anuncio}". Eso es exactamente lo que le interesa: tu primera respuesta habla de ESE evento/promoción con entusiasmo (consulta programacion_venue o listar_eventos si aplica, y el FAQ del venue) y llévalo directo a reservar. PROHIBIDO responderle con un genérico tipo "¿qué información necesitas?" — ya sabes a qué viene.`)
  } else if (refCamp?.source === 'instagram_story') {
    lines.push(`HISTORIA — este cliente escribió RESPONDIENDO A UNA HISTORIA del venue: algo que vio ahí le interesó. Si el FAQ trae una línea "EVENTO EN PROMOCIÓN", asume que pregunta por ESE evento y abre directo con él (nombre, fecha y precio en una línea + cierre corto). Si no hay evento en promoción declarado, pregunta en UNA línea corta si le interesa el evento o promoción de la historia. PROHIBIDO el genérico "¿qué información necesitas?".`)
  }
  lines.push('RESERVA EXISTENTE: cuando registres al cliente, el sistema te dirá si ya tiene reservas próximas. Si ya tiene una para el MISMO día que está pidiendo, NO crees otra: confírmasela con sus datos ("ya tienes tu mesa el sábado a las 20:30 para 6 👍"). Si pide cambios (hora/personas), usa crear_reserva con los datos nuevos — el sistema ACTUALIZA la existente en lugar de duplicar y valida que todavía haya cupo; si ya no cabe, ofrécele otra opción.')
  lines.push('CANCELACIONES: si el cliente pide cancelar, cancela SIN fricción con cancelar_reserva — nada de "¿seguro?" repetidos ni interrogar el motivo (si lo cuenta espontáneamente, regístralo). Confírmale la cancelación con calidez e invítalo a volver ("cuando quieras, aquí tienes tu mesa"). Una cancelación bien atendida es un cliente que regresa.')
  lines.push('EN CAMINO / RETRASOS: si el cliente avisa que va en camino, que llega tarde, o pide un detalle operativo de su reserva ya hecha, usa agregar_nota_reserva — el equipo lo ve al instante. Confírmale tranquilo: "le aviso al equipo, tu mesa te espera".')
  lines.push('CUMPLEAÑOS: si el cliente menciona su fecha de cumpleaños, pásala en crear_o_actualizar_cliente (campo cumpleanos) — el sistema la recuerda para consentirlo después. No la pidas de la nada; solo captúrala si sale en la conversación.')
  lines.push('QUEJAS: ante cualquier queja, primero una disculpa breve y humana (sin excusas), y de inmediato escalar_a_humano con el motivo empezando con "QUEJA:" y el resumen — eso alerta al equipo con prioridad y deja registro en la ficha del cliente. Nunca te pongas a la defensiva ni resuelvas compensaciones tú.')
  if (vt === 'fnb' || vt === 'dance_club') {
    lines.push('LISTA DE ESPERA: si la noche que quiere está llena, ofrécele primero otra fecha u hora cercana. Si insiste en esa noche, dile que lo anotas en lista de espera, usa notificar_slack con "LISTA DE ESPERA: nombre, pax, fecha, teléfono" y explícale que el equipo le avisa si se libera lugar — sin prometerle que sí habrá.')
    lines.push('PROGRAMACIÓN / DJs: si preguntan quién toca o qué hay tal noche, usa programacion_venue y VÉNDELO — menciona al DJ y sus géneros con entusiasmo y ofrece apartar mesa en el mismo mensaje. Si no hay programación registrada, NO inventes nombres: di que está por anunciarse y ofrece la reserva igual.')
    lines.push('DJ QUE QUIERE TOCAR: si quien escribe es un DJ/artista ofreciendo sus servicios, cambia a modo reclutador amable — captura (una o dos preguntas por mensaje): nombre artístico, géneros, ciudad, fee aproximado, links de mixes/IG y teléfono. Con lo que tengas usa registrar_dj, dile que el booker escuchará su material y le responde por aquí, y cierra con escalar_a_humano ("DJ interesado: [nombre]"). NUNCA negocies fees, NUNCA prometas fechas — eso es del booker.')
  }
  lines.push('IMÁGENES: si el historial muestra "[📎 El cliente envió una imagen]" en el contexto de un apartado, es casi seguro su comprobante de depósito: agradécele, dile que el equipo lo valida y confirma, y usa escalar_a_humano con motivo "Comprobante de apartado recibido — validar" si la conversación no está ya escalada.')
  lines.push('PROVEEDORES: si quien escribe es una empresa o persona OFRECIENDO productos o servicios (uniformes, insumos, publicidad, software, distribuidores…), NO lo despaches ni lo trates como cliente de reservas. Agradece su interés y captura sus datos — muchos mandan TODO en un solo mensaje (empresa, nombre, servicio, teléfono, correo, ciudad): tómalo de ahí, NO re-preguntes lo que ya dieron. Usa registrar_proveedor con esos datos, dile que el equipo de compras y alianzas revisa las propuestas y le responde por este mismo canal si hay interés, y cierra con escalar_a_humano ("Proveedor registrado: [empresa] — [servicio]"). NUNCA compres, agendes reuniones ni compartas correos del equipo.')
  lines.push('EVENTOS: si el cliente quiere un evento (cumpleaños grande, despedida, corporativo, renta del lugar), NO lo despaches directo — captura primero esta información, una pregunta a la vez: (1) ¿qué fecha tienen en mente?, (2) ¿aproximadamente cuántas personas serían?, (3) ¿qué tipo de evento u ocasión es?, (4) ¿buscan un área reservada o el lugar completo?, y su nombre y teléfono si aún no los tienes. Ya con eso, usa escalar_a_humano con TODO el resumen en el motivo ("Evento: cumpleaños, ~40 pax, 26 de julio, área reservada — María, tel registrado") — así el equipo llega a cerrar la venta, no a re-preguntar.')
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

  // FAQ del venue (Config → FAQ): fuente oficial para preguntas frecuentes
  if (ctx.faq && String(ctx.faq).trim()) {
    lines.push(`FAQ DEL VENUE — responde preguntas frecuentes con esta información (es la fuente oficial; si la respuesta no está aquí y no la sabes con certeza, NO inventes: dilo con honestidad y ofrece escalar):\n${String(ctx.faq).trim()}`)
  }

  if (ctx.conv.pending_fields?.length) lines.push(`Datos que aún faltan por confirmar: ${ctx.conv.pending_fields.join(', ')}.`)
  lines.push(`FECHAS (hora de México, ya calculadas — úsalas EXACTAMENTE así y NUNCA calcules tú una fecha): ${fechaContexto()}. Si el cliente dice "el sábado", es la fila marcada como sábado en esta tabla; menciona siempre día Y número al confirmar ("el sábado 11").`)
  if (isFollowup) lines.push('Este turno es un ÚNICO mensaje de seguimiento porque el cliente no respondió — que sea breve, sin presionar, recordando amablemente qué falta para cerrar su reserva.')
  lines.push('Si algo se sale de reservas (quejas serias, pagos, prensa) o el cliente pide hablar con una persona, usa escalar_a_humano de inmediato. (Los proveedores primero se registran con registrar_proveedor y luego se escala.)')

  return lines.join('\n')
}

// deno-lint-ignore no-explicit-any
async function executeTool(ctx: any, name: string, input: any): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = ctx
  switch (name) {
    case 'identificar_venue': {
      const { data: bu } = await supabaseAdmin.from('business_units').select('id, code, name, venue_type, inventory_type, reservation_policy').eq('code', input.codigo_venue).maybeSingle()
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
      // Ruteo por modelo de inventario — nightly_capacity (Bruma) sigue abajo sin cambios
      const invTipo = ctx.bu?.inventory_type ?? 'nightly_capacity'
      if (invTipo === 'time_slots') return await disponibilidadSlots(ctx, input)
      if (invTipo === 'event_rsvp') return await disponibilidadEventos(ctx, input)
      if (invTipo === 'unit_stay') return await disponibilidadUnidades(ctx, input)
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
      // Cumpleaños si el cliente lo mencionó (MM-DD sin año → año 2000 + flag)
      const guestRow: Record<string, unknown> = { phone: tel, full_name: input.nombre, origin_bu: ctx.conv.bu_id }
      if (input.cumpleanos) {
        const full = String(input.cumpleanos).match(/^(\d{4})-(\d{2})-(\d{2})$/)
        const short = String(input.cumpleanos).match(/^(\d{2})-(\d{2})$/)
        if (full) { guestRow.birthday = input.cumpleanos; guestRow.birthday_has_year = true }
        else if (short) { guestRow.birthday = `2000-${short[1]}-${short[2]}`; guestRow.birthday_has_year = false }
      }
      const { data: guest, error } = await supabaseAdmin.from('guests')
        .upsert(guestRow, { onConflict: 'phone', ignoreDuplicates: false })
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
      // Ruteo por modelo de inventario — nightly_capacity (Bruma) sigue abajo sin cambios
      const invCrear = ctx.bu?.inventory_type ?? 'nightly_capacity'
      if (invCrear === 'time_slots') return await crearReservaSlot(ctx, input)
      if (invCrear === 'event_rsvp') return await crearReservaEvento(ctx, input)
      if (invCrear === 'unit_stay') return await crearReservaEstancia(ctx, input)
      if (!input.horario) return { error: 'Falta la hora de llegada — pregúntale al cliente a qué hora le gustaría llegar.' }
      const hora = normalizeTime(input.horario)
      if (!hora) return { error: `No entendí la hora "${input.horario}". Pídele al cliente que la confirme (ej. "9:30 pm" o "21:30").` }
      // Anti-duplicados: si el cliente ya tiene reserva viva ese día en este
      // venue, se ACTUALIZA esa en lugar de crear una segunda.
      const { data: existentes } = await supabaseAdmin.from('reservations')
        .select('id, time_slot, party_size, status')
        .eq('guest_id', ctx.conv.guest_id).eq('bu_id', ctx.conv.bu_id).eq('date', input.fecha)
        .in('status', ['requested', 'confirmed']).limit(1)
      const existente = existentes?.[0]

      // Validación de cupo de la noche (crear Y modificar): el bot nunca
      // sobrevende — el sobrecupo solo lo autoriza un humano desde la app.
      const dow = new Date(input.fecha + 'T00:00:00').getDay()
      const [{ data: capNoche }, { data: resNoche }] = await Promise.all([
        supabaseAdmin.from('venue_capacity').select('max_reservations, max_pax').eq('bu_id', ctx.conv.bu_id).eq('day_of_week', dow).eq('active', true).maybeSingle(),
        supabaseAdmin.from('reservations').select('id, party_size, status').eq('bu_id', ctx.conv.bu_id).eq('date', input.fecha),
      ])
      if (capNoche) {
        let usadas = 0, paxUsadas = 0
        for (const r of resNoche ?? []) {
          if (!['requested', 'confirmed', 'seated', 'completed'].includes(r.status)) continue
          if (existente && r.id === existente.id) continue // al modificar, su propia reserva no cuenta
          usadas++; paxUsadas += r.party_size
        }
        const sinCupoReservas = !existente && usadas >= capNoche.max_reservations
        const sinCupoPax = paxUsadas + input.pax > capNoche.max_pax
        if (sinCupoReservas || sinCupoPax) {
          return { error: `Esa noche ya no hay cupo (${usadas}/${capNoche.max_reservations} reservas, ${paxUsadas + input.pax}/${capNoche.max_pax} pax con esta reserva). NO confirmes: ofrécele al cliente otra fecha cercana con buena onda, y si insiste en esa noche usa escalar_a_humano — solo el equipo puede autorizar sobrecupo.` }
        }
      }
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
        // Si el grupo creció y cruzó el umbral de apartado, el bot debe cobrar la diferencia
        let avisoApartado = ''
        if (ctx.pay?.active && ctx.pay?.clabe && input.pax >= ctx.pay.deposit_over_pax) {
          const total = ctx.pay.deposit_per_person ? input.pax * ctx.pay.deposit_per_person : (ctx.pay.deposit_fixed ?? 0)
          const antes = existente.party_size >= ctx.pay.deposit_over_pax
          avisoApartado = antes
            ? ` OJO: el grupo cambió y el apartado total ahora es $${total} MXN — si ya depositó una parte, pide solo la diferencia y escala para validación.`
            : ` OJO: con ${input.pax} personas la reserva AHORA requiere apartado de $${total} MXN — sigue el flujo de apartado (datos de depósito + comprobante + escalar).`
        }
        return { ok: true, actualizada: true, reservation_id: existente.id, estado: existente.status, aviso: `El cliente YA tenía reserva ese día (${existente.time_slot}, ${existente.party_size} pax, ${existente.status}) — se actualizó con los datos nuevos en lugar de duplicar. Confírmale los datos finales.${avisoApartado}` }
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

    case 'programacion_venue': {
      if (!ctx.conv.bu_id) return { error: 'Primero identifica el venue.' }
      const hoy = new Date().toISOString().slice(0, 10)
      const desde = input.fecha ?? hoy
      const hasta = input.fecha ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      // Directorio unificado: el talento vive en crm_contacts (contact_type='DJ')
      const { data: gigs } = await supabaseAdmin.from('dj_bookings')
        .select('date, start_time, status, crm_contacts(full_name, genres)')
        .eq('bu_id', ctx.conv.bu_id).gte('date', desde).lte('date', hasta)
        .in('status', ['confirmed', 'played'])
        .order('date')
      const programacion = (gigs ?? []).map((g: { date: string; start_time: string; crm_contacts: { full_name: string; genres: string[] } | null }) => ({
        fecha: g.date, hora: g.start_time, dj: g.crm_contacts?.full_name ?? 'DJ', generos: g.crm_contacts?.genres ?? [],
      }))
      if (!programacion.length) return { sin_programacion: true, nota: 'No hay DJs anunciados para esas fechas — dile que la programación está por anunciarse (NO inventes nombres) y ofrece la reserva igual.' }
      return { programacion, nota: 'Menciona al DJ con entusiasmo y aprovecha para ofrecer apartar mesa.' }
    }

    case 'registrar_dj': {
      // El bot NUNCA negocia fees ni promete fechas: registra, avisa y escala.
      const nombre = String(input.nombre_artistico).trim()
      if (!nombre) return { error: 'Falta el nombre artístico.' }
      // Directorio unificado: el DJ se registra como contacto (contact_type='DJ')
      const { data: existente } = await supabaseAdmin.from('crm_contacts').select('id, full_name').eq('contact_type', 'DJ').ilike('full_name', nombre).maybeSingle()
      const row: Record<string, unknown> = {
        full_name: nombre,
        contact_type: 'DJ',
        genres: input.generos ? String(input.generos).split(',').map((g: string) => g.trim()).filter(Boolean) : [],
        city: input.ciudad ?? null,
        base_fee: input.fee_aproximado ?? null,
        phone: input.telefono ? (normalizePhoneMX(input.telefono) ?? input.telefono) : null,
        links: input.links ?? null,
        fee_notes: input.notas ?? null,
        source: 'concierge',
      }
      let djId = existente?.id
      if (existente) {
        await supabaseAdmin.from('crm_contacts').update(row).eq('id', existente.id)
      } else {
        const { data: nuevo, error: dErr } = await supabaseAdmin.from('crm_contacts').insert(row).select('id').single()
        if (dErr) return { error: dErr.message }
        djId = nuevo.id
      }
      await supabaseAdmin.from('activity_log').insert({
        user_id: null, action: existente ? 'dj_updated' : 'dj_created', entity_type: 'dj', entity_id: djId,
        details: { actor: 'Concierge HOG', stage_name: nombre, fee: input.fee_aproximado ?? null, channel: ctx.conv.channel },
      })
      await notifySlackFromEdge(supabaseAdmin, `🎧 *DJ interesado vía Concierge* — ${ctx.bu?.name ?? 'venue'}\n${nombre}${input.generos ? ` · ${input.generos}` : ''}${input.ciudad ? ` · ${input.ciudad}` : ''}${input.fee_aproximado ? ` · ~$${input.fee_aproximado} MXN` : ''}${input.links ? `\n${input.links}` : ''}`)
      return { ok: true, dj_id: djId, ya_existia: !!existente, instruccion: 'Dile que el booker va a escuchar su material y le responde por este mismo canal. NO prometas fechas ni negocies fee — usa escalar_a_humano con motivo "DJ interesado: [nombre]" para cerrar tu parte.' }
    }

    case 'registrar_proveedor': {
      // Directorio unificado: el proveedor queda como contacto VENDOR en
      // Comercial. El bot registra y escala — nunca compra ni agenda.
      const empresa = String(input.empresa ?? '').trim()
      if (!empresa) return { error: 'Falta el nombre de la empresa.' }
      const email = input.email ? String(input.email).trim().toLowerCase() : null
      // Dedupe: primero por email exacto, luego por empresa
      let existenteProv = null
      if (email) {
        const { data } = await supabaseAdmin.from('crm_contacts').select('id, full_name').ilike('email', email).maybeSingle()
        existenteProv = data
      }
      if (!existenteProv) {
        const { data } = await supabaseAdmin.from('crm_contacts').select('id, full_name').eq('contact_type', 'VENDOR').ilike('company', empresa).maybeSingle()
        existenteProv = data
      }
      const notasProv = [input.servicio ? `Ofrece: ${input.servicio}` : null, input.notas ?? null, `Llegó por ${ctx.conv.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram'} del Concierge`].filter(Boolean).join(' · ')
      const rowProv: Record<string, unknown> = {
        full_name: String(input.nombre_contacto ?? empresa).trim(),
        company: empresa,
        contact_type: 'VENDOR',
        email,
        phone: input.telefono ? (normalizePhoneMX(String(input.telefono)) ?? String(input.telefono)) : null,
        city: input.ciudad ?? null,
        notes: notasProv,
        source: 'concierge',
      }
      let provId = existenteProv?.id
      if (existenteProv) {
        await supabaseAdmin.from('crm_contacts').update(rowProv).eq('id', existenteProv.id)
      } else {
        const { data: nuevoProv, error: vErr } = await supabaseAdmin.from('crm_contacts').insert(rowProv).select('id').single()
        if (vErr) return { error: vErr.message }
        provId = nuevoProv.id
      }
      await supabaseAdmin.from('activity_log').insert({
        user_id: null, action: existenteProv ? 'vendor_updated' : 'vendor_registered', entity_type: 'contact', entity_id: provId,
        details: { actor: 'Concierge HOG', empresa, servicio: input.servicio ?? null, channel: ctx.conv.channel },
      })
      await notifySlackFromEdge(supabaseAdmin, `📦 *Proveedor vía Concierge* — ${ctx.bu?.name ?? 'venue'}\n${empresa}${input.servicio ? ` · ${input.servicio}` : ''}${input.nombre_contacto ? `\nContacto: ${input.nombre_contacto}` : ''}${input.telefono ? ` · ${input.telefono}` : ''}${email ? ` · ${email}` : ''}`)
      return { ok: true, contact_id: provId, ya_existia: !!existenteProv, instruccion: 'Agradécele, dile que el equipo de compras y alianzas revisa las propuestas y le responde por este mismo canal si hay interés, y usa escalar_a_humano con motivo "Proveedor registrado: [empresa] — [servicio]". NO prometas compra ni reunión.' }
    }

    case 'agregar_nota_reserva': {
      if (!ctx.conv.guest_id) return { error: 'No tengo identificado al cliente — pídele su teléfono para ubicar su reserva.' }
      let nq = supabaseAdmin.from('reservations')
        .select('id, date, time_slot, party_size, notes')
        .eq('guest_id', ctx.conv.guest_id)
        .gte('date', new Date().toISOString().slice(0, 10))
        .in('status', ['requested', 'confirmed', 'seated'])
        .order('date')
      if (ctx.conv.bu_id) nq = nq.eq('bu_id', ctx.conv.bu_id)
      if (input.fecha) nq = nq.eq('date', input.fecha)
      const { data: notas } = await nq.limit(2)
      if (!notas?.length) return { error: 'No encontré reserva próxima del cliente para anotar — confirma la fecha con él.' }
      if (notas.length > 1) return { varias: true, reservas: notas.map((r: { date: string; time_slot: string }) => ({ fecha: r.date, hora: r.time_slot })), instruccion: 'Tiene varias reservas — pregúntale a cuál y vuelve a llamar con la fecha.' }
      const r = notas[0]
      const nuevaNota = r.notes ? `${r.notes} · ${input.nota.trim()}` : input.nota.trim()
      const { error: nErr } = await supabaseAdmin.from('reservations').update({ notes: nuevaNota }).eq('id', r.id)
      if (nErr) return { error: nErr.message }
      await notifySlackFromEdge(supabaseAdmin, `🏃 *Aviso del cliente* — ${ctx.bu?.name ?? ''}\nReserva ${r.date} · ${r.time_slot} · ${r.party_size} pax → ${input.nota.trim()}`)
      return { ok: true, instruccion: 'Nota registrada y equipo avisado — confírmale al cliente que su mesa lo espera.' }
    }

    case 'cancelar_reserva': {
      if (!ctx.conv.guest_id) return { error: 'No tengo identificado al cliente en esta conversación — pídele su teléfono para ubicar su reserva, o usa escalar_a_humano.' }
      let q = supabaseAdmin.from('reservations')
        .select('id, date, time_slot, party_size')
        .eq('guest_id', ctx.conv.guest_id)
        .gte('date', new Date().toISOString().slice(0, 10))
        .in('status', ['requested', 'confirmed'])
        .order('date')
      if (ctx.conv.bu_id) q = q.eq('bu_id', ctx.conv.bu_id)
      if (input.fecha) q = q.eq('date', input.fecha)
      const { data: candidatas } = await q.limit(5)
      if (!candidatas?.length) return { error: 'No encontré ninguna reserva próxima a nombre del cliente' + (input.fecha ? ` para el ${input.fecha}` : '') + '. Confírmale la fecha o pregúntale si la hizo con otro teléfono.' }
      if (candidatas.length > 1) {
        return { varias: true, reservas: candidatas, instruccion: 'El cliente tiene varias reservas próximas — pregúntale cuál quiere cancelar y vuelve a llamar cancelar_reserva con la fecha.' }
      }
      const r = candidatas[0]
      const { error: cErr } = await supabaseAdmin.from('reservations').update({
        status: 'cancelled', cancel_reason: input.motivo?.trim() || 'Cancelada por el cliente vía Concierge',
      }).eq('id', r.id)
      if (cErr) return { error: cErr.message }
      await supabaseAdmin.from('activity_log').insert({
        user_id: null, action: 'reservation_status', entity_type: 'reservation', entity_id: r.id,
        details: { actor: 'Concierge HOG', to: 'Cancelada', date: r.date, slot: r.time_slot, pax: r.party_size, channel: ctx.conv.channel },
      })
      await notifySlackFromEdge(supabaseAdmin, `🚫 *Cancelación vía Concierge* — ${ctx.bu?.name ?? ''}\n${r.date} · ${r.time_slot} · ${r.party_size} pax${input.motivo ? ` · Motivo: ${input.motivo}` : ''}`)
      return { ok: true, cancelada: { fecha: r.date, hora: r.time_slot, pax: r.party_size }, instruccion: 'Confírmale la cancelación con amabilidad e invítalo a volver pronto — sin culpas ni presión.' }
    }

    case 'listar_servicios': {
      if (!ctx.conv.bu_id) return { error: 'Primero identifica el venue.' }
      const { data: servicios } = await supabaseAdmin.from('venue_services')
        .select('name, description, duration_minutes, capacity_per_slot, price, service_schedules(day_of_week, start_time, active)')
        .eq('bu_id', ctx.conv.bu_id).eq('active', true).order('sort')
      if (!servicios?.length) return { sin_servicios: true, nota: 'Este venue no tiene servicios configurados — dile con honestidad y usa escalar_a_humano si el cliente quiere reservar.' }
      const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
      return {
        servicios: servicios.map((s: { name: string; description: string | null; duration_minutes: number; capacity_per_slot: number; price: number | null; service_schedules: { day_of_week: number; start_time: string; active: boolean }[] }) => ({
          servicio: s.name, descripcion: s.description, duracion_min: s.duration_minutes,
          precio_mxn: s.price, cupo_por_horario: s.capacity_per_slot,
          horarios: (s.service_schedules ?? []).filter(h => h.active).map(h => `${DIAS[h.day_of_week]} ${h.start_time}`),
        })),
        nota: 'Estos son los horarios del calendario semanal — para una FECHA concreta usa buscar_disponibilidad, que descuenta lo ya reservado.',
      }
    }

    case 'listar_eventos': {
      if (!ctx.conv.bu_id) return { error: 'Primero identifica el venue.' }
      return await disponibilidadEventos(ctx, { fecha: input.fecha })
    }

    case 'listar_unidades': {
      if (!ctx.conv.bu_id) return { error: 'Primero identifica el venue.' }
      return await disponibilidadUnidades(ctx, { fecha: input.fecha, fecha_fin: input.fecha_fin })
    }

    case 'notificar_slack':
      await notifySlackFromEdge(supabaseAdmin, `🤖 ${input.mensaje}`)
      return { ok: true }

    case 'escalar_a_humano': {
      await supabaseAdmin.from('bot_conversations').update({
        status: 'needs_human', escalation_reason: input.motivo, next_bot_reply_at: null, next_followup_at: null,
      }).eq('id', ctx.conv.id)
      ctx.conv.status = 'needs_human'
      // Las quejas dejan huella en la ficha del cliente (tag "Queja") para que
      // el equipo lo trate con guante blanco en su siguiente visita.
      if (/^queja/i.test(String(input.motivo ?? '')) && ctx.conv.guest_id) {
        const { data: g } = await supabaseAdmin.from('guests').select('tags').eq('id', ctx.conv.guest_id).maybeSingle()
        if (g && !((g.tags ?? []) as string[]).includes('Queja')) {
          await supabaseAdmin.from('guests').update({ tags: [...(g.tags ?? []), 'Queja'] }).eq('id', ctx.conv.guest_id)
        }
      }
      const esQueja = /^queja/i.test(String(input.motivo ?? ''))
      await notifySlackFromEdge(supabaseAdmin, `${esQueja ? '🚨' : '🙋'} *${esQueja ? 'QUEJA — atención prioritaria' : 'Necesita atención humana'}* — ${ctx.bu?.name ?? 'venue sin identificar'}\nMotivo: ${input.motivo}`)
      return { ok: true, customerNote: 'Ahorita te conecto con alguien del equipo, dame un momento 🙌' }
    }

    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Modelos de inventario no-fnb (wellness / art house / hospedaje).
// Los slots de wellness son get-or-create: se calculan desde service_schedules
// y la fila en service_slots nace cuando alguien reserva ese horario.
// ═════════════════════════════════════════════════════════════════════════════

const ESTADOS_VIVOS = ['requested', 'confirmed', 'seated']

// ── WELLNESS: horarios disponibles de un día ─────────────────────────────────
// deno-lint-ignore no-explicit-any
async function disponibilidadSlots(ctx: any, input: any): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = ctx
  if (!input.fecha) return { error: 'Falta la fecha.' }
  const dow = new Date(input.fecha + 'T00:00:00').getDay()
  let q = supabaseAdmin.from('venue_services')
    .select('id, name, duration_minutes, capacity_per_slot, price, service_schedules(day_of_week, start_time, active)')
    .eq('bu_id', ctx.conv.bu_id).eq('active', true)
  if (input.servicio) q = q.ilike('name', `%${String(input.servicio).trim()}%`)
  const { data: servicios } = await q
  if (!servicios?.length) {
    return input.servicio
      ? { error: `No encontré el servicio "${input.servicio}" — usa listar_servicios para ver los nombres reales.` }
      : { sin_servicios: true, nota: 'Este venue no tiene servicios configurados.' }
  }
  // Slots ya materializados de ese día (los que tienen reservas)
  const { data: slots } = await supabaseAdmin.from('service_slots')
    .select('id, service_id, start_time, capacity').eq('bu_id', ctx.conv.bu_id).eq('date', input.fecha)
  const slotIds = (slots ?? []).map((s: { id: string }) => s.id)
  const ocupacion: Record<string, number> = {}
  if (slotIds.length) {
    const { data: resv } = await supabaseAdmin.from('reservations')
      .select('service_slot_id, party_size, status').in('service_slot_id', slotIds)
    for (const r of resv ?? []) {
      if (!ESTADOS_VIVOS.includes(r.status)) continue
      ocupacion[r.service_slot_id] = (ocupacion[r.service_slot_id] ?? 0) + r.party_size
    }
  }
  const horarios: { servicio: string; hora: string; lugares: number; precio_mxn: number | null }[] = []
  for (const s of servicios) {
    for (const h of (s.service_schedules ?? []).filter((h: { active: boolean; day_of_week: number }) => h.active && h.day_of_week === dow)) {
      const slot = (slots ?? []).find((sl: { service_id: string; start_time: string }) => sl.service_id === s.id && sl.start_time === h.start_time)
      const cap = slot?.capacity ?? s.capacity_per_slot
      const libres = cap - (slot ? (ocupacion[slot.id] ?? 0) : 0)
      if (libres > 0) horarios.push({ servicio: s.name, hora: h.start_time, lugares: libres, precio_mxn: s.price })
    }
  }
  horarios.sort((a, b) => a.hora.localeCompare(b.hora))
  if (!horarios.length) return { fecha: input.fecha, sin_horarios: true, nota: 'No hay horarios disponibles ese día (o el venue no abre) — ofrece otra fecha cercana.' }
  return { fecha: input.fecha, horarios, nota: 'Ofrece SOLO estos horarios, tal cual. No inventes otros.' }
}

// ── WELLNESS: crear cita (get-or-create del slot + validación de cupo) ───────
// deno-lint-ignore no-explicit-any
async function crearReservaSlot(ctx: any, input: any): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = ctx
  if (!input.servicio) return { error: 'Falta el servicio — pregúntale al cliente cuál quiere (usa listar_servicios si hace falta).' }
  if (!input.horario) return { error: 'Falta el horario de la cita — ofrécele los de buscar_disponibilidad.' }
  const hora = normalizeTime(input.horario)
  if (!hora) return { error: `No entendí la hora "${input.horario}". Confírmala con el cliente (ej. "10:30").` }
  const { data: servicio } = await supabaseAdmin.from('venue_services')
    .select('id, name, capacity_per_slot, price, service_schedules(day_of_week, start_time, active)')
    .eq('bu_id', ctx.conv.bu_id).eq('active', true).ilike('name', `%${String(input.servicio).trim()}%`).maybeSingle()
  if (!servicio) return { error: `No encontré el servicio "${input.servicio}" — usa listar_servicios para ver los nombres reales.` }
  const dow = new Date(input.fecha + 'T00:00:00').getDay()
  const enCalendario = (servicio.service_schedules ?? []).some((h: { active: boolean; day_of_week: number; start_time: string }) => h.active && h.day_of_week === dow && h.start_time === hora)
  if (!enCalendario) return { error: `${servicio.name} no se ofrece ese día a las ${hora}. Usa buscar_disponibilidad y ofrécele SOLO los horarios que devuelva.` }
  // get-or-create del slot
  let { data: slot } = await supabaseAdmin.from('service_slots')
    .select('id, capacity').eq('service_id', servicio.id).eq('date', input.fecha).eq('start_time', hora).maybeSingle()
  if (!slot) {
    const { data: creado, error: sErr } = await supabaseAdmin.from('service_slots')
      .insert({ service_id: servicio.id, bu_id: ctx.conv.bu_id, date: input.fecha, start_time: hora, capacity: servicio.capacity_per_slot })
      .select('id, capacity').maybeSingle()
    slot = creado ?? (await supabaseAdmin.from('service_slots')
      .select('id, capacity').eq('service_id', servicio.id).eq('date', input.fecha).eq('start_time', hora).maybeSingle()).data
    if (!slot && sErr) return { error: sErr.message }
  }
  // Anti-duplicados: mismo cliente + mismo slot → actualizar
  const { data: propias } = await supabaseAdmin.from('reservations')
    .select('id, party_size').eq('guest_id', ctx.conv.guest_id).eq('service_slot_id', slot.id)
    .in('status', ESTADOS_VIVOS).limit(1)
  const propia = propias?.[0]
  // Cupo del slot (excluyendo la propia si es actualización)
  const { data: resv } = await supabaseAdmin.from('reservations')
    .select('id, party_size, status').eq('service_slot_id', slot.id)
  let usados = 0
  for (const r of resv ?? []) {
    if (!ESTADOS_VIVOS.includes(r.status)) continue
    if (propia && r.id === propia.id) continue
    usados += r.party_size
  }
  if (usados + input.pax > slot.capacity) {
    return { error: `Ese horario ya no tiene lugar (${usados}/${slot.capacity} ocupados). NO confirmes: usa buscar_disponibilidad y ofrécele los horarios que sí tienen espacio.` }
  }
  if (propia) {
    const { error: upErr } = await supabaseAdmin.from('reservations')
      .update({ party_size: input.pax, notes: input.notas ?? undefined, bot_conversation_id: ctx.conv.id }).eq('id', propia.id)
    if (upErr) return { error: upErr.message }
    await notifySlackFromEdge(supabaseAdmin, `🤖 *Cita actualizada vía Concierge* — ${ctx.bu?.name ?? ''}\n${servicio.name} · ${input.fecha} ${hora} · ${propia.party_size}→${input.pax} pax`)
    return { ok: true, actualizada: true, reservation_id: propia.id, aviso: 'El cliente YA tenía cita en ese horario — se actualizó en lugar de duplicar.' }
  }
  const { data: reserva, error } = await supabaseAdmin.from('reservations').insert({
    guest_id: ctx.conv.guest_id, bu_id: ctx.conv.bu_id, date: input.fecha, time_slot: hora,
    party_size: input.pax, notes: input.notas ?? null, status: 'requested',
    source: ctx.conv.channel, bot_conversation_id: ctx.conv.id, service_slot_id: slot.id,
  }).select('id').single()
  if (error) return { error: error.message }
  await supabaseAdmin.from('bot_conversations').update({ pending_fields: [] }).eq('id', ctx.conv.id)
  await supabaseAdmin.from('activity_log').insert({
    user_id: null, action: 'reservation_created', entity_type: 'reservation', entity_id: reserva.id,
    details: { actor: 'Concierge HOG', bu: ctx.bu?.code, date: input.fecha, slot: hora, pax: input.pax, servicio: servicio.name, channel: ctx.conv.channel },
  })
  await notifySlackFromEdge(supabaseAdmin, `🤖 *Cita vía Concierge* — ${ctx.bu?.name ?? ''}\n${servicio.name} · ${input.fecha} ${hora} · ${input.pax} pax`)
  return { ok: true, reservation_id: reserva.id, servicio: servicio.name, precio_mxn: servicio.price }
}

// ── ART HOUSE: cartelera con lugares ─────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function disponibilidadEventos(ctx: any, input: any): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = ctx
  const hoy = new Date().toISOString().slice(0, 10)
  const desde = input.fecha ?? hoy
  const hasta = input.fecha ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const { data: eventos } = await supabaseAdmin.from('venue_events')
    .select('id, name, date, start_time, capacity, description, status')
    .eq('bu_id', ctx.conv.bu_id).gte('date', desde).lte('date', hasta)
    .in('status', ['announced', 'sold_out']).order('date')
  if (!eventos?.length) return { sin_cartelera: true, nota: 'No hay eventos anunciados para esas fechas — dilo con honestidad, ofrece avisarle cuando se anuncie (NO inventes eventos).' }
  const ids = eventos.map((e: { id: string }) => e.id)
  const { data: resv } = await supabaseAdmin.from('reservations')
    .select('event_id, party_size, status').in('event_id', ids)
  const usados: Record<string, number> = {}
  for (const r of resv ?? []) {
    if (!ESTADOS_VIVOS.includes(r.status)) continue
    usados[r.event_id] = (usados[r.event_id] ?? 0) + r.party_size
  }
  return {
    cartelera: eventos.map((e: { id: string; name: string; date: string; start_time: string; capacity: number; description: string | null; status: string }) => ({
      evento: e.name, fecha: e.date, hora: e.start_time, descripcion: e.description,
      lugares_disponibles: e.status === 'sold_out' ? 0 : Math.max(0, e.capacity - (usados[e.id] ?? 0)),
      agotado: e.status === 'sold_out' || (usados[e.id] ?? 0) >= e.capacity,
    })),
    nota: 'Solo ofrece estos eventos. Si el que quiere está agotado, ofrece otro o lista de espera (notificar_slack).',
  }
}

// ── ART HOUSE: RSVP a un evento ──────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function crearReservaEvento(ctx: any, input: any): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = ctx
  if (!input.evento) return { error: 'Falta el evento — pregúntale a cuál quiere ir (usa listar_eventos para la cartelera).' }
  let q = supabaseAdmin.from('venue_events')
    .select('id, name, date, start_time, capacity, status')
    .eq('bu_id', ctx.conv.bu_id).ilike('name', `%${String(input.evento).trim()}%`)
    .gte('date', new Date().toISOString().slice(0, 10)).order('date')
  if (input.fecha) q = q.eq('date', input.fecha)
  const { data: candidatos } = await q.limit(3)
  const anunciados = (candidatos ?? []).filter((e: { status: string }) => e.status === 'announced' || e.status === 'sold_out')
  if (!anunciados.length) return { error: `No encontré un evento anunciado que coincida con "${input.evento}" — usa listar_eventos y ofrece SOLO lo que devuelva.` }
  if (anunciados.length > 1) return { varios: true, eventos: anunciados.map((e: { name: string; date: string }) => ({ evento: e.name, fecha: e.date })), instruccion: 'Hay varios eventos que coinciden — pregúntale a cuál y vuelve a llamar con la fecha.' }
  const evento = anunciados[0]
  // Anti-duplicados: mismo cliente + mismo evento → actualizar
  const { data: propias } = await supabaseAdmin.from('reservations')
    .select('id, party_size').eq('guest_id', ctx.conv.guest_id).eq('event_id', evento.id)
    .in('status', ESTADOS_VIVOS).limit(1)
  const propia = propias?.[0]
  const { data: resv } = await supabaseAdmin.from('reservations')
    .select('id, party_size, status').eq('event_id', evento.id)
  let usados = 0
  for (const r of resv ?? []) {
    if (!ESTADOS_VIVOS.includes(r.status)) continue
    if (propia && r.id === propia.id) continue
    usados += r.party_size
  }
  if (evento.status === 'sold_out' || usados + input.pax > evento.capacity) {
    return { error: `"${evento.name}" ya no tiene lugares suficientes (${usados}/${evento.capacity}). NO confirmes: ofrece otro evento de la cartelera o lista de espera con notificar_slack ("LISTA DE ESPERA EVENTO: nombre, pax, evento, teléfono").` }
  }
  if (propia) {
    const { error: upErr } = await supabaseAdmin.from('reservations')
      .update({ party_size: input.pax, notes: input.notas ?? undefined, bot_conversation_id: ctx.conv.id }).eq('id', propia.id)
    if (upErr) return { error: upErr.message }
    await notifySlackFromEdge(supabaseAdmin, `🤖 *RSVP actualizado vía Concierge* — ${ctx.bu?.name ?? ''}\n${evento.name} · ${evento.date} · ${propia.party_size}→${input.pax} pax`)
    return { ok: true, actualizada: true, reservation_id: propia.id, aviso: 'El cliente YA tenía lugares en ese evento — se actualizó en lugar de duplicar.' }
  }
  const { data: reserva, error } = await supabaseAdmin.from('reservations').insert({
    guest_id: ctx.conv.guest_id, bu_id: ctx.conv.bu_id, date: evento.date, time_slot: evento.start_time,
    party_size: input.pax, notes: input.notas ?? null, status: 'requested',
    source: ctx.conv.channel, bot_conversation_id: ctx.conv.id, event_id: evento.id,
  }).select('id').single()
  if (error) return { error: error.message }
  await supabaseAdmin.from('bot_conversations').update({ pending_fields: [] }).eq('id', ctx.conv.id)
  await supabaseAdmin.from('activity_log').insert({
    user_id: null, action: 'reservation_created', entity_type: 'reservation', entity_id: reserva.id,
    details: { actor: 'Concierge HOG', bu: ctx.bu?.code, date: evento.date, slot: evento.start_time, pax: input.pax, evento: evento.name, channel: ctx.conv.channel },
  })
  await notifySlackFromEdge(supabaseAdmin, `🤖 *RSVP vía Concierge* — ${ctx.bu?.name ?? ''}\n${evento.name} · ${evento.date} ${evento.start_time} · ${input.pax} pax`)
  return { ok: true, reservation_id: reserva.id, evento: evento.name, fecha: evento.date, hora: evento.start_time }
}

// ── HOSPEDAJE: unidades libres en un rango + cotización ──────────────────────
// deno-lint-ignore no-explicit-any
async function disponibilidadUnidades(ctx: any, input: any): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = ctx
  if (!input.fecha || !input.fecha_fin) return { error: 'Para hospedaje necesito check-in Y check-out — pregúntale al cliente sus fechas.' }
  if (input.fecha_fin <= input.fecha) return { error: 'El check-out debe ser después del check-in — confirma las fechas con el cliente.' }
  const noches = Math.round((new Date(input.fecha_fin + 'T00:00:00').getTime() - new Date(input.fecha + 'T00:00:00').getTime()) / 86400000)
  const { data: unidades } = await supabaseAdmin.from('venue_units')
    .select('id, name, unit_type, capacity, base_rate, description')
    .eq('bu_id', ctx.conv.bu_id).eq('active', true).order('base_rate')
  if (!unidades?.length) return { sin_unidades: true, nota: 'Este venue no tiene unidades configuradas — usa escalar_a_humano.' }
  const ids = unidades.map((u: { id: string }) => u.id)
  const { data: resv } = await supabaseAdmin.from('reservations')
    .select('unit_id, check_in, check_out, status').in('unit_id', ids)
  const ocupadas = new Set<string>()
  for (const r of resv ?? []) {
    if (!ESTADOS_VIVOS.includes(r.status)) continue
    if (r.check_in < input.fecha_fin && r.check_out > input.fecha) ocupadas.add(r.unit_id)
  }
  const libres = unidades.filter((u: { id: string }) => !ocupadas.has(u.id))
  if (!libres.length) return { fecha: input.fecha, fecha_fin: input.fecha_fin, sin_disponibilidad: true, nota: 'No hay unidades libres en ese rango — ofrece otras fechas cercanas.' }
  return {
    check_in: input.fecha, check_out: input.fecha_fin, noches,
    unidades: libres.map((u: { name: string; unit_type: string | null; capacity: number; base_rate: number; description: string | null }) => ({
      unidad: u.name, tipo: u.unit_type, capacidad_pax: u.capacity, tarifa_por_noche_mxn: u.base_rate,
      total_estancia_mxn: noches * Number(u.base_rate), descripcion: u.description,
    })),
    nota: 'Cotiza claro: noches × tarifa = total. La estancia se asegura con el flujo de apartado.',
  }
}

// ── HOSPEDAJE: reservar estancia ─────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function crearReservaEstancia(ctx: any, input: any): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = ctx
  if (!input.unidad) return { error: 'Falta la unidad — usa listar_unidades y pregúntale cuál prefiere.' }
  if (!input.fecha || !input.fecha_fin) return { error: 'Faltan las fechas — necesito check-in (fecha) y check-out (fecha_fin).' }
  if (input.fecha_fin <= input.fecha) return { error: 'El check-out debe ser después del check-in — confirma las fechas.' }
  const { data: unidad } = await supabaseAdmin.from('venue_units')
    .select('id, name, capacity, base_rate')
    .eq('bu_id', ctx.conv.bu_id).eq('active', true).ilike('name', `%${String(input.unidad).trim()}%`).maybeSingle()
  if (!unidad) return { error: `No encontré la unidad "${input.unidad}" — usa listar_unidades para ver los nombres reales.` }
  if (input.pax > unidad.capacity) return { error: `${unidad.name} tiene capacidad para ${unidad.capacity} personas y el grupo es de ${input.pax} — ofrece una unidad más grande o dos unidades (escala si hace falta).` }
  // Anti-duplicados: mismo cliente + rango que solapa en este venue → actualizar esa estancia
  const { data: propias } = await supabaseAdmin.from('reservations')
    .select('id, unit_id, check_in, check_out, party_size')
    .eq('guest_id', ctx.conv.guest_id).eq('bu_id', ctx.conv.bu_id)
    .in('status', ESTADOS_VIVOS).not('unit_id', 'is', null)
  const propia = (propias ?? []).find((r: { check_in: string; check_out: string }) => r.check_in < input.fecha_fin && r.check_out > input.fecha)
  // ¿La unidad está libre en el rango? (excluyendo la propia si es cambio)
  const { data: resv } = await supabaseAdmin.from('reservations')
    .select('id, check_in, check_out, status').eq('unit_id', unidad.id)
  const ocupada = (resv ?? []).some((r: { id: string; check_in: string; check_out: string; status: string }) =>
    ESTADOS_VIVOS.includes(r.status) && !(propia && r.id === propia.id) && r.check_in < input.fecha_fin && r.check_out > input.fecha)
  if (ocupada) return { error: `${unidad.name} ya está ocupada en parte de ese rango. NO confirmes: usa listar_unidades para ofrecer otra unidad libre u otras fechas.` }
  const noches = Math.round((new Date(input.fecha_fin + 'T00:00:00').getTime() - new Date(input.fecha + 'T00:00:00').getTime()) / 86400000)
  const total = noches * Number(unidad.base_rate)
  const horaCheckin = normalizeTime(String(ctx.bu?.reservation_policy?.check_in_time ?? '')) ?? '15:00'
  if (propia) {
    const { error: upErr } = await supabaseAdmin.from('reservations').update({
      unit_id: unidad.id, date: input.fecha, check_in: input.fecha, check_out: input.fecha_fin,
      time_slot: horaCheckin, party_size: input.pax, notes: input.notas ?? undefined, bot_conversation_id: ctx.conv.id,
    }).eq('id', propia.id)
    if (upErr) return { error: upErr.message }
    await notifySlackFromEdge(supabaseAdmin, `🤖 *Estancia actualizada vía Concierge* — ${ctx.bu?.name ?? ''}\n${unidad.name} · ${input.fecha} → ${input.fecha_fin} · ${input.pax} pax · $${total} MXN`)
    return { ok: true, actualizada: true, reservation_id: propia.id, noches, total_mxn: total, aviso: 'El cliente YA tenía una estancia que solapa esas fechas — se actualizó en lugar de duplicar. Confírmale los datos finales y recuerda el flujo de apartado si aplica.' }
  }
  const { data: reserva, error } = await supabaseAdmin.from('reservations').insert({
    guest_id: ctx.conv.guest_id, bu_id: ctx.conv.bu_id, date: input.fecha, time_slot: horaCheckin,
    party_size: input.pax, notes: input.notas ?? null, status: 'requested',
    source: ctx.conv.channel, bot_conversation_id: ctx.conv.id,
    unit_id: unidad.id, check_in: input.fecha, check_out: input.fecha_fin,
  }).select('id').single()
  if (error) return { error: error.message }
  await supabaseAdmin.from('bot_conversations').update({ pending_fields: [] }).eq('id', ctx.conv.id)
  await supabaseAdmin.from('activity_log').insert({
    user_id: null, action: 'reservation_created', entity_type: 'reservation', entity_id: reserva.id,
    details: { actor: 'Concierge HOG', bu: ctx.bu?.code, date: input.fecha, check_out: input.fecha_fin, pax: input.pax, unidad: unidad.name, total_mxn: total, channel: ctx.conv.channel },
  })
  await notifySlackFromEdge(supabaseAdmin, `🤖 *Estancia vía Concierge* — ${ctx.bu?.name ?? ''}\n${unidad.name} · ${input.fecha} → ${input.fecha_fin} (${noches} noches) · ${input.pax} pax · $${total} MXN`)
  return { ok: true, reservation_id: reserva.id, unidad: unidad.name, noches, total_mxn: total, instruccion: 'Cotización clara al cliente (noches × tarifa = total). Si el venue tiene apartado configurado, sigue el flujo de apartado para asegurar la estancia.' }
}
