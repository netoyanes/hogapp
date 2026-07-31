// public-reservation — formulario público de reservas por venue.
// El cliente entra a la app con ?reservar=<CÓDIGO> (sin sesión) y esta función
// (service role) valida las reglas del venue y crea la reserva. Dos acciones:
//   { action: 'info', code }  → datos del venue para pintar el formulario
//   { action: 'book', code, nombre, telefono, fecha, horario, pax, notas }
// Verify JWT: DESACTIVADO (la llama gente sin cuenta). La seguridad la da esta
// misma función: solo escribe si el venue tiene public_booking_enabled y valida
// cupo/umbral; nunca confirma la reserva (queda 'requested' para el equipo).
// Auto-contenida para desplegar desde el editor del dashboard.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Misma normalización que usa el bot (HH:MM 24h; teléfono E.164/MX válido o null)
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
function normalizePhoneMX(raw: string): string | null {
  const trimmed = String(raw).trim()
  if (trimmed.startsWith('+') && /^\+[1-9]\d{7,14}$/.test(trimmed.replace(/[\s-]/g, ''))) {
    return trimmed.replace(/[\s-]/g, '')
  }
  let digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('521') && digits.length === 13) digits = '52' + digits.slice(3)
  if (digits.length === 10) digits = '52' + digits
  return /^52\d{10}$/.test(digits) ? '+' + digits : null
}

// deno-lint-ignore no-explicit-any
async function notifySlack(admin: any, text: string) {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'slack_webhook').maybeSingle()
  const url = data?.value
  if (!url || !url.startsWith('https://hooks.slack.com/')) return
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }) } catch { /* silencio */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json()
    const code = String(body.code ?? '').trim().toUpperCase()
    if (!code) return json({ error: 'Falta el venue.' }, 400)

    const { data: bu } = await admin.from('business_units')
      .select('id, code, name, public_booking_enabled, venue_type, inventory_type').eq('code', code).maybeSingle()
    if (!bu) return json({ error: 'Venue no encontrado.' }, 404)
    if (!bu.public_booking_enabled) return json({ error: 'Este venue no tiene reservas en línea por ahora.', disabled: true }, 403)

    const { data: pay } = await admin.from('venue_payment_config').select('*').eq('bu_id', bu.id).maybeSingle()
    // Motor por mesas (Fase 3): si el venue lo activó, el formulario ofrece
    // slots del motor en vez de hora libre — mismo cálculo que app y bot.
    const { data: engineCfg } = await admin.from('venue_reservation_settings')
      .select('engine, online_max_pax').eq('bu_id', bu.id).maybeSingle()
    const tableEngine = engineCfg?.engine === 'tables'

    // ── INFO: datos para pintar el formulario ──────────────────────────────
    if ((body.action ?? 'info') === 'info') {
      return json({
        ok: true,
        venue: bu.name,
        // Solo el modelo por-noche (F&B/club) se soporta en el formulario web;
        // los demás tipos reservan por otros medios.
        supported: (bu.inventory_type ?? 'nightly_capacity') === 'nightly_capacity',
        engine: tableEngine ? 'tables' : 'night',
        online_max_pax: tableEngine ? (engineCfg?.online_max_pax ?? 8) : null,
        deposit: (pay?.active && pay?.clabe) ? {
          over_pax: pay.deposit_over_pax,
          per_person: pay.deposit_per_person ?? null,
          fixed: pay.deposit_fixed ?? null,
        } : null,
      })
    }

    // ── SLOTS: horarios disponibles del motor por mesas ────────────────────
    if (body.action === 'slots') {
      if (!tableEngine) return json({ ok: true, engine: 'night', slots: [] })
      const fecha = String(body.fecha ?? '').trim()
      const pax = parseInt(String(body.pax ?? ''), 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !(pax > 0)) return json({ ok: true, slots: [] })
      const { data: slots } = await admin.rpc('fn_available_slots', { p_bu: bu.id, p_date: fecha, p_pax: pax, p_online: true })
      return json({ ok: true, engine: 'tables', slots: (slots ?? []).map((s: { slot: string }) => s.slot) })
    }

    // ── BOOK: crear la reserva ─────────────────────────────────────────────
    if (body.action === 'book') {
      if ((bu.inventory_type ?? 'nightly_capacity') !== 'nightly_capacity') {
        return json({ error: 'Este venue no reserva por este medio — escríbenos y con gusto te atendemos.' }, 400)
      }
      const nombre = String(body.nombre ?? '').trim()
      const fecha = String(body.fecha ?? '').trim()
      const pax = parseInt(String(body.pax ?? ''), 10)
      const tel = normalizePhoneMX(String(body.telefono ?? ''))
      const hora = normalizeTime(String(body.horario ?? ''))
      if (nombre.length < 2) return json({ error: 'Escribe tu nombre.' }, 400)
      if (!tel) return json({ error: 'Tu teléfono no es válido — son 10 dígitos (o +52).' }, 400)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: 'Elige una fecha.' }, 400)
      if (fecha < new Date().toISOString().slice(0, 10)) return json({ error: 'Elige una fecha de hoy en adelante.' }, 400)
      if (!hora) return json({ error: 'Elige tu hora de llegada.' }, 400)
      if (!(pax > 0 && pax <= 40)) return json({ error: 'Número de personas inválido.' }, 400)

      // Motor por mesas: el motor asigna mesa o rechaza — nunca sobrevende.
      // deno-lint-ignore no-explicit-any
      let asignada: any = null
      if (tableEngine) {
        if (engineCfg?.online_max_pax && pax > engineCfg.online_max_pax) {
          return json({ error: `Para grupos de más de ${engineCfg.online_max_pax} escríbenos por WhatsApp y el equipo te arma la mesa 🙏` }, 400)
        }
        const { data: asg } = await admin.rpc('fn_assign_table', { p_bu: bu.id, p_date: fecha, p_slot: hora, p_pax: pax, p_online: true })
        asignada = asg?.[0] ?? null
        if (!asignada) {
          return json({ error: 'Ese horario se acaba de llenar. Elige otro horario disponible 🙏', full: true }, 409)
        }
      }

      // Cupo de la noche (tope general — aplica en ambos motores): nunca sobrevende.
      const dow = new Date(fecha + 'T00:00:00').getDay()
      const [{ data: cap }, { data: resNoche }] = await Promise.all([
        admin.from('venue_capacity').select('max_reservations, max_pax').eq('bu_id', bu.id).eq('day_of_week', dow).eq('active', true).maybeSingle(),
        admin.from('reservations').select('party_size, status').eq('bu_id', bu.id).eq('date', fecha),
      ])
      if (cap) {
        let usadas = 0, paxUsadas = 0
        for (const r of resNoche ?? []) {
          if (!['requested', 'confirmed', 'seated', 'completed'].includes(r.status)) continue
          usadas++; paxUsadas += r.party_size
        }
        if (usadas >= cap.max_reservations || paxUsadas + pax > cap.max_pax) {
          return json({ error: 'Esa noche ya está llena. Prueba con otra fecha 🙏', full: true }, 409)
        }
      }

      // Cliente (upsert por teléfono) — sin duplicar
      const { data: guest, error: gErr } = await admin.from('guests')
        .upsert({ phone: tel, full_name: nombre, origin_bu: bu.id }, { onConflict: 'phone', ignoreDuplicates: false })
        .select('id').single()
      if (gErr) return json({ error: 'No se pudo registrar. Intenta de nuevo.' }, 500)

      // Anti-duplicados: si ya tiene reserva viva ese día, se actualiza
      const { data: existentes } = await admin.from('reservations')
        .select('id').eq('guest_id', guest.id).eq('bu_id', bu.id).eq('date', fecha)
        .in('status', ['requested', 'confirmed']).limit(1)

      // Nota de apartado si el grupo cruza el umbral (el equipo lo gestiona)
      let notas = String(body.notas ?? '').trim() || null
      let deposito: { total: number } | null = null
      if (pay?.active && pay?.clabe && pax >= pay.deposit_over_pax) {
        const total = pay.deposit_per_person ? pax * pay.deposit_per_person : (pay.deposit_fixed ?? 0)
        deposito = { total }
        notas = `${notas ? notas + ' · ' : ''}Apartado pendiente: $${total} (grupo de ${pax}) — reserva por web`
      }

      let reservaId: string
      if (existentes?.[0]) {
        await admin.from('reservations').update({
          time_slot: hora, party_size: pax, notes: notas,
          zone_id: asignada?.zone_id ?? undefined, table_id: asignada?.table_id ?? undefined, combo_id: asignada?.combo_id ?? undefined,
        }).eq('id', existentes[0].id)
        reservaId = existentes[0].id
      } else {
        const { data: reserva, error: rErr } = await admin.from('reservations').insert({
          guest_id: guest.id, bu_id: bu.id, date: fecha, time_slot: hora, party_size: pax,
          notes: notas, status: 'requested', source: 'web',
          zone_id: asignada?.zone_id ?? null, table_id: asignada?.table_id ?? null, combo_id: asignada?.combo_id ?? null,
        }).select('id').single()
        if (rErr) return json({ error: 'No se pudo crear la reserva. Intenta de nuevo.' }, 500)
        reservaId = reserva.id
      }

      await admin.from('activity_log').insert({
        user_id: null, action: 'reservation_created', entity_type: 'reservation', entity_id: reservaId,
        details: { actor: 'Reserva web', bu: bu.code, date: fecha, slot: hora, pax, channel: 'web' },
      })
      await notifySlack(admin, `🌐 *Reserva web* — ${bu.name}\n${fecha} · ${hora} · ${pax} pax · ${nombre}${deposito ? `\n⚠️ Apartado pendiente: $${deposito.total}` : ''}`)

      return json({
        ok: true, venue: bu.name, fecha, hora, pax,
        deposito, // si != null, el front muestra el aviso de apartado
      })
    }

    return json({ error: 'Acción desconocida.' }, 400)
  } catch (err) {
    console.error('[public-reservation]', String(err))
    return json({ error: 'Algo salió mal. Intenta de nuevo.' }, 500)
  }
})
