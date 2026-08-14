// reservation-notify — confirmación AUTOMÁTICA de reserva por WhatsApp.
// Se invoca al confirmar/guardar una reserva desde la app. Rutas, en orden:
//   1. Conversación del concierge por WhatsApp (ventana de 24 h) → mensaje libre.
//   2. Plantilla aprobada de Cloud API (app_settings.wa_confirm_template) al
//      teléfono del cliente — única vía permitida por Meta para escribirle a
//      un número que no nos ha escrito.
// Dedup: reservations.confirm_sent_at — la confirmación nunca se manda dos veces;
// el botón manual "Confirmar por WhatsApp" (wa.me) sigue siendo el fallback.
// Verify JWT: ACTIVADO (la llama un usuario autenticado de la app).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const META_API_VERSION = 'v20.0'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// deno-lint-ignore no-explicit-any
async function graphSend(payload: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
  const token = Deno.env.get('WHATSAPP_TOKEN')!
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })
  return { ok: res.ok, data: await res.json() }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const { reservationId } = await req.json()
    if (!reservationId) return json({ error: 'reservationId requerido' }, 400)

    const supabaseUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['MASTER', 'OPS_MANAGER', 'TEAM', 'MARKETING', 'HEART_OF_HOUSE'].includes(profile.role)) {
      return json({ error: 'Sin permiso' }, 403)
    }

    const { data: res, error: resErr } = await supabaseAdmin.from('reservations')
      .select('id, bu_id, guest_id, date, time_slot, party_size, status, source, manage_token, confirm_sent_at, bot_conversation_id, guests(full_name, phone), business_units(name)')
      .eq('id', reservationId).maybeSingle()
    // Un error aquí casi siempre es la columna confirm_sent_at faltante (falta
    // correr reclutamiento_confirmacion.sql). Antes se tragaba y devolvía
    // "Reserva no encontrada", que mandaba a buscar el problema al lugar
    // equivocado.
    if (resErr) {
      console.error('[reservation-notify] lectura de la reserva falló', resErr.message)
      return json({ error: `No se pudo leer la reserva: ${resErr.message}. Si menciona confirm_sent_at, falta correr reclutamiento_confirmacion.sql en Supabase.` }, 500)
    }
    if (!res) return json({ error: 'Reserva no encontrada' }, 404)

    // Política del aviso: solo reservas confirmadas, una sola vez, y los
    // walk-ins no reciben confirmación (ya están en la puerta).
    if (res.status !== 'confirmed') return json({ skipped: 'no confirmada' })
    if (res.confirm_sent_at) return json({ skipped: 'ya enviada' })
    if (res.source === 'walk_in') return json({ skipped: 'walk-in' })

    let token = res.manage_token as string | null
    if (!token) {
      token = crypto.randomUUID()
      await supabaseAdmin.from('reservations').update({ manage_token: token }).eq('id', res.id)
    }

    // deno-lint-ignore no-explicit-any
    const guest: any = res.guests
    // deno-lint-ignore no-explicit-any
    const venueName = (res.business_units as any)?.name ?? ''
    const fechaTxt = new Date(res.date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    const hora = String(res.time_slot).slice(0, 5)
    const pax = `${res.party_size} ${res.party_size === 1 ? 'persona' : 'personas'}`

    const { data: settings } = await supabaseAdmin.from('app_settings').select('key, value')
      .in('key', ['wa_confirm_template', 'app_public_url'])
    const settingsMap = Object.fromEntries((settings ?? []).map((s: { key: string; value: string }) => [s.key, s.value]))
    const link = `${settingsMap.app_public_url ?? 'https://hogapp-smoky.vercel.app'}/?mireserva=${token}`

    const marcarEnviada = () => supabaseAdmin.from('reservations').update({ confirm_sent_at: new Date().toISOString() }).eq('id', res.id)

    // ── Ruta 1: la reserva nació en el concierge por WhatsApp → mensaje libre
    // por el mismo hilo (válido dentro de la ventana de 24 h de Meta). Si la
    // ventana ya cerró, Meta rechaza y caemos a la plantilla.
    if (res.bot_conversation_id) {
      const { data: conv } = await supabaseAdmin.from('bot_conversations')
        .select('id, channel, external_id, is_simulated').eq('id', res.bot_conversation_id).maybeSingle()
      if (conv && conv.channel === 'whatsapp' && !conv.is_simulated) {
        const msg = `✅ ¡Hola ${guest?.full_name ?? ''}! Tu reservación quedó confirmada.\n\n📍 ${venueName}\n📅 ${fechaTxt}\n🕗 ${hora} · ${pax}\n\nSi llegas un poco tarde o surge un imprevisto, avísanos aquí:\n${link}\n\n¡Te esperamos! 🥂`
        const sent = await graphSend({ to: conv.external_id, type: 'text', text: { body: msg } })
        if (sent.ok) {
          const mid = sent.data?.messages?.[0]?.id ?? null
          await supabaseAdmin.from('bot_messages').insert({
            conversation_id: conv.id, role: 'agent', body: msg,
            meta: { via: 'auto_confirm', ...(mid ? { mid } : {}) },
          })
          await supabaseAdmin.from('bot_conversations').update({ last_sender: 'agent', last_message_at: new Date().toISOString() }).eq('id', conv.id)
          await marcarEnviada()
          return json({ ok: true, method: 'chat' })
        }
        console.log('[reservation-notify] canal del bot rechazó (¿ventana 24h cerrada?) — intento plantilla', JSON.stringify(sent.data?.error ?? {}))
      }
    }

    // ── Ruta 2: plantilla aprobada al teléfono del cliente
    const digits = String(guest?.phone ?? '').replace(/\D/g, '')
    if (!digits) return json({ error: 'El cliente no tiene teléfono guardado' })
    const to = digits.length === 10 ? `52${digits}` : digits
    const template = settingsMap.wa_confirm_template || 'confirmacion_reserva'
    const bodyParams = [guest?.full_name ?? 'cliente', venueName, fechaTxt, hora, pax]
      .map(t => ({ type: 'text', text: String(t) }))

    // Meta es quisquilloso con dos cosas que no controlamos desde aquí: el
    // IDIOMA con el que se registró la plantilla (es_MX vs es) y si lleva o no
    // botón de URL dinámica. En vez de adivinar, se prueban las combinaciones
    // en orden de preferencia y se reporta el último error si ninguna pasa.
    const intentos: { lang: string; conBoton: boolean }[] = [
      { lang: 'es_MX', conBoton: true },
      { lang: 'es_MX', conBoton: false },
      { lang: 'es',    conBoton: true },
      { lang: 'es',    conBoton: false },
    ]
    let sent = { ok: false, data: null as unknown as Record<string, unknown> }
    for (const it of intentos) {
      const components: unknown[] = [{ type: 'body', parameters: bodyParams }]
      if (it.conBoton) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }] })
      sent = await graphSend({ to, type: 'template', template: { name: template, language: { code: it.lang }, components } })
      if (sent.ok) { console.log('[reservation-notify] plantilla enviada', it.lang, it.conBoton ? 'con botón' : 'sin botón'); break }
      console.log('[reservation-notify] intento fallido', it.lang, it.conBoton ? 'con botón' : 'sin botón',
        JSON.stringify((sent.data as { error?: unknown })?.error ?? {}))
    }
    if (!sent.ok) {
      // deno-lint-ignore no-explicit-any
      const e: any = (sent.data as any)?.error
      const detalle = [e?.message, e?.error_data?.details].filter(Boolean).join(' — ')
      console.error('[reservation-notify] plantilla falló en todos los intentos', JSON.stringify(sent.data))
      return json({ error: `Plantilla "${template}": ${detalle || 'Meta rechazó el envío'}${e?.code ? ` (código ${e.code})` : ''}` })
    }
    await marcarEnviada()
    await supabaseAdmin.from('activity_log').insert({
      user_id: user.id, action: 'reservation_confirm_wa_auto', entity_type: 'reservation', entity_id: res.id,
      details: { guest: guest?.full_name, venue: venueName, via: 'template' },
    })
    return json({ ok: true, method: 'template' })
  } catch (err) {
    console.error('[reservation-notify] excepción', String(err))
    return json({ error: String(err) }, 500)
  }
})
