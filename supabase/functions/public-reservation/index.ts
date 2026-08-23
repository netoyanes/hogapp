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

// Aforo simultáneo (modelo de rotación): pax presentes en una ventana de
// tiempo con las duraciones configuradas — la misma regla que app y bot.
// deno-lint-ignore no-explicit-any
async function cargaSimultanea(admin: any, buId: string, fecha: string) {
  const dow = new Date(fecha + 'T00:00:00').getDay()
  const [{ data: cap }, { data: res }, { data: st }] = await Promise.all([
    admin.from('venue_capacity').select('max_pax, open_time, close_time').eq('bu_id', buId).eq('day_of_week', dow).eq('active', true).maybeSingle(),
    admin.from('reservations').select('time_slot, party_size, status, duration_min').eq('bu_id', buId).eq('date', fecha),
    admin.from('venue_reservation_settings').select('durations').eq('bu_id', buId).maybeSingle(),
  ])
  const durs = (st?.durations ?? []) as { max_pax: number; minutes: number }[]
  const durFor = (p: number) => [...durs].sort((a, b) => a.max_pax - b.max_pax).find(d => d.max_pax >= p)?.minutes ?? 120
  const toMin = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
  const openM = cap?.open_time ? toMin(cap.open_time) : 12 * 60
  let closeM = cap?.close_time ? toMin(cap.close_time) : 24 * 60
  if (closeM <= openM) closeM += 1440
  const norm = (t: string) => { let v = toMin(t); if (v < openM) v += 1440; return v }
  // deno-lint-ignore no-explicit-any
  const vivas = ((res ?? []) as any[]).filter(r => ['requested', 'confirmed', 'seated'].includes(r.status))
  const enVentana = (t0: number, dur: number) => {
    let s = 0
    for (const r of vivas) {
      const s0 = norm(r.time_slot), s1 = s0 + (r.duration_min ?? durFor(r.party_size))
      if (s0 < t0 + dur && s1 > t0) s += r.party_size
    }
    return s
  }
  const lbl = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { maxPax: cap?.max_pax ?? null, hasHours: !!(cap?.open_time && cap?.close_time), openM, closeM, durFor, norm, enVentana, lbl }
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

    // ── MI RESERVA (?mireserva=<token>): el cliente ve su reserva y avisa si
    // llega tarde o cancela — el token único de la reserva es la llave.
    if (String(body.action ?? '').startsWith('manage_')) {
      const token = String(body.token ?? '').trim()
      if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'Link inválido.' }, 400)
      const { data: r } = await admin.from('reservations')
        .select('id, bu_id, guest_id, date, time_slot, party_size, status, notes')
        .eq('manage_token', token).maybeSingle()
      if (!r) return json({ error: 'No encontramos tu reserva — revisa el link.' }, 404)
      const [{ data: bu2 }, { data: g }] = await Promise.all([
        admin.from('business_units').select('code, name').eq('id', r.bu_id).maybeSingle(),
        admin.from('guests').select('full_name').eq('id', r.guest_id).maybeSingle(),
      ])
      const base = {
        venue: bu2?.name ?? '', codigo: bu2?.code ?? '', nombre: g?.full_name ?? '',
        fecha: r.date, hora: String(r.time_slot).slice(0, 5), pax: r.party_size, status: r.status,
      }
      const activa = ['requested', 'confirmed'].includes(r.status)

      if (body.action === 'manage_info') return json({ ok: true, ...base })

      if (body.action === 'manage_late') {
        if (!activa && r.status !== 'seated') return json({ error: 'Tu reserva ya no está activa — escríbenos por WhatsApp y te ayudamos.' }, 400)
        const mins = Math.min(Math.max(parseInt(String(body.minutos ?? '15'), 10) || 15, 5), 120)
        const nota = `🕐 Cliente avisó: llega ~${mins} min tarde`
        await admin.from('reservations').update({ notes: r.notes ? `${r.notes} · ${nota}` : nota }).eq('id', r.id)
        await admin.from('activity_log').insert({
          user_id: null, action: 'reservation_updated', entity_type: 'reservation', entity_id: r.id,
          details: { actor: 'Cliente (mi reserva)', aviso: `llega ~${mins} min tarde` },
        })
        await notifySlack(admin, `🕐 *Aviso de retraso* — ${bu2?.name}\n${base.nombre} (${r.date} · ${base.hora} · ${r.party_size} pax) avisa que llega ~${mins} min tarde.`)
        return json({ ok: true, ...base, aviso: mins })
      }

      if (body.action === 'manage_cancel') {
        if (!activa) return json({ error: 'Tu reserva ya no se puede cancelar por aquí — escríbenos por WhatsApp.' }, 400)
        const motivo = String(body.motivo ?? '').trim().slice(0, 200)
        await admin.from('reservations').update({
          status: 'cancelled',
          cancel_reason: motivo ? `Cliente canceló desde su link: ${motivo}` : 'Cliente canceló desde su link',
        }).eq('id', r.id)
        await admin.from('activity_log').insert({
          user_id: null, action: 'reservation_status', entity_type: 'reservation', entity_id: r.id,
          details: { actor: 'Cliente (mi reserva)', to: 'Cancelada', motivo: motivo || null },
        })
        await notifySlack(admin, `❌ *Cancelación del cliente* — ${bu2?.name}\n${base.nombre} canceló su reserva del ${r.date} · ${base.hora} · ${r.party_size} pax.${motivo ? `\nMotivo: ${motivo}` : ''}`)
        return json({ ok: true, ...base, status: 'cancelled' })
      }
      return json({ error: 'Acción desconocida.' }, 400)
    }

    // ── VENUES: el selector de casas del link de un PR (/p/CODIGO sin ?v=) ──
    // Público a propósito: es la misma información que ya se ve en cualquier
    // link de reserva, solo que junta. No expone nada del programa PR.
    if (body.action === 'venues') {
      const { data: bus } = await admin.from('business_units')
        .select('code, name, location, public_booking_enabled, inventory_type')
        .eq('public_booking_enabled', true).order('name')
      const abiertas = (bus ?? []).filter(b => (b.inventory_type ?? 'nightly_capacity') === 'nightly_capacity')
      return json({ ok: true, venues: abiertas.map(b => ({ code: b.code, name: b.name, location: b.location })) })
    }

    const code = String(body.code ?? '').trim().toUpperCase()
    if (!code) return json({ error: 'Falta el venue.' }, 400)

    const { data: bu } = await admin.from('business_units')
      .select('id, code, name, public_booking_enabled, venue_type, inventory_type, timezone').eq('code', code).maybeSingle()
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
      // La hora que importa es la DEL VENUE, no la de quien mira: alguien en
      // Sinaloa abriendo un venue de CDMX veía el día y los horarios corridos
      // una hora. El servidor manda la fecha y la hora locales de la casa ya
      // resueltas, para que el navegador no tenga que adivinarlas.
      const tz = (bu as { timezone?: string }).timezone || 'America/Mazatlan'
      const ahora = new Date()
      const fmt = (opts: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...opts }).format(ahora)
      return json({
        ok: true,
        venue: bu.name,
        timezone: tz,
        // 'YYYY-MM-DD' y 'HH:MM' en el huso del venue
        venue_hoy: fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }),
        venue_hora: new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(ahora),
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

    // ── SLOTS: horarios CON LUGAR para la fecha y grupo ────────────────────
    // Motor por mesas → fn_available_slots. Sin motor → aforo simultáneo:
    // se ofrecen las horas donde el grupo cabe, para que el cliente no
    // adivine una hora que luego rebota. Sin aforo/horario → hora libre.
    if (body.action === 'slots') {
      const fecha = String(body.fecha ?? '').trim()
      const pax = parseInt(String(body.pax ?? ''), 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !(pax > 0)) return json({ ok: true, mode: 'free', slots: [] })
      if (tableEngine) {
        const { data: slots } = await admin.rpc('fn_available_slots', { p_bu: bu.id, p_date: fecha, p_pax: pax, p_online: true })
        return json({ ok: true, mode: 'tables', slots: (slots ?? []).map((s: { slot: string }) => s.slot) })
      }
      const carga = await cargaSimultanea(admin, bu.id, fecha)
      if (carga.maxPax == null || !carga.hasHours) return json({ ok: true, mode: 'free', slots: [] })
      const dur = carga.durFor(pax)
      const slots: string[] = []
      for (let m = carga.openM; m <= carga.closeM - dur; m += 30) {
        if (carga.enVentana(m, dur) + pax <= carga.maxPax) slots.push(carga.lbl(m))
      }
      return json({ ok: true, mode: 'night', slots })
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

      // Detector de horario — aforo SIMULTÁNEO en [hora, hora+duración): la
      // gente rota, así que el tope no es acumulado del día. max_pax = aforo.
      const carga = await cargaSimultanea(admin, bu.id, fecha)
      if (carga.maxPax != null) {
        const dur = carga.durFor(pax)
        const t0 = carga.norm(hora)
        if (carga.enVentana(t0, dur) + pax > carga.maxPax) {
          // Sugerir en el error las 3 horas cercanas con lugar
          const cands: number[] = []
          for (let m = carga.openM; m <= carga.closeM - dur; m += 30) {
            if (carga.enVentana(m, dur) + pax <= carga.maxPax) cands.push(m)
          }
          const sug = cands.sort((a, b) => Math.abs(a - t0) - Math.abs(b - t0)).slice(0, 3).sort((a, b) => a - b).map(carga.lbl)
          return json({ error: `A esa hora ya estamos llenos.${sug.length ? ` Tenemos lugar a las ${sug.join(', ')} 🙏` : ' Prueba otro horario 🙏'}`, full: true }, 409)
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

      // ── ATRIBUCIÓN PR ────────────────────────────────────────────────────
      // El código llega del navegador (lo guardó /p/CODIGO por 30 días). Aquí
      // solo se pasa el recado: TODAS las reglas —cutoff, cliente recurrente,
      // auto-atribución, tope de manuales— viven en fn_pr_attribute, en la
      // base, para que valgan igual venga la reserva de donde venga.
      // Si el motor rechaza, la reserva NO se cae: el cliente ya reservó y eso
      // es lo que importa; lo que se pierde es el crédito, y queda el porqué.
      let atribucion: { ok: boolean; error?: string } | null = null
      const refPr = String(body.ref ?? '').trim().toUpperCase().slice(0, 24)
      if (refPr && /^[A-Z0-9]{3,12}-[A-Z]{2,8}$/.test(refPr)) {
        const { data: attr, error: aErr } = await admin.rpc('fn_pr_attribute', {
          p_reservation: reservaId, p_codigo: refPr, p_canal: 'link',
        })
        atribucion = aErr ? { ok: false, error: aErr.message } : (attr as { ok: boolean; error?: string })
        if (atribucion && !atribucion.ok) {
          console.warn('[public-reservation] atribución rechazada', refPr, atribucion.error)
        }
      }

      await admin.from('activity_log').insert({
        user_id: null, action: 'reservation_created', entity_type: 'reservation', entity_id: reservaId,
        details: {
          actor: 'Reserva web', bu: bu.code, date: fecha, slot: hora, pax, channel: 'web',
          ...(atribucion?.ok ? { pr: refPr } : {}),
        },
      })
      await notifySlack(admin, `🌐 *Reserva web* — ${bu.name}\n${fecha} · ${hora} · ${pax} pax · ${nombre}${atribucion?.ok ? `\n🎟 Trae código de ${refPr}` : ''}${deposito ? `\n⚠️ Apartado pendiente: $${deposito.total}` : ''}`)

      return json({
        ok: true, venue: bu.name, fecha, hora, pax,
        deposito, // si != null, el front muestra el aviso de apartado
        pr: atribucion?.ok ? refPr : null,
      })
    }

    return json({ error: 'Acción desconocida.' }, 400)
  } catch (err) {
    console.error('[public-reservation]', String(err))
    return json({ error: 'Algo salió mal. Intenta de nuevo.' }, 500)
  }
})
