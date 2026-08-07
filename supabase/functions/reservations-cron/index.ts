// reservations-cron — Fase 4 del ciclo de reservas. Corre cada 10 min (pg_cron):
//  1) NO-SHOW AUTOMÁTICO: reservas de HOY (hora local del venue) que vencieron
//     su tolerancia (no_show_hold_minutes del venue, default 15) → no_show.
//  2) SIN GARANTÍA: reservas con apartado/depósito pendiente a menos de 24h
//     del evento → se marcan en notas y se alerta al equipo.
//  3) ALERTAS: resumen a Slack solo cuando algo pasó.
// Auto-contenida para desplegar desde el editor del dashboard.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// deno-lint-ignore no-explicit-any
async function notifySlack(admin: any, text: string) {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'slack_webhook').maybeSingle()
  const url = data?.value
  if (!url || !url.startsWith('https://hooks.slack.com/')) return
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }) } catch { /* silencio */ }
}

const toMin = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
// Madrugada (antes de las 6:00) pertenece a la noche anterior → +1440
const norm = (m: number) => (m < 6 * 60 ? m + 1440 : m)

function localNow(tz: string): { dateISO: string; min: number } {
  const now = new Date()
  const dateISO = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  const [h, m] = hm.split(':').map(Number)
  return { dateISO, min: norm(h * 60 + m) }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const [{ data: bus }, { data: settings }] = await Promise.all([
      admin.from('business_units').select('id, code, name, timezone'),
      admin.from('venue_reservation_settings').select('bu_id, no_show_hold_minutes'),
    ])
    const holdMap: Record<string, number> = Object.fromEntries((settings ?? []).map((s: { bu_id: string; no_show_hold_minutes: number }) => [s.bu_id, s.no_show_hold_minutes]))
    const slackLines: string[] = []
    let noshows = 0, sinGarantia = 0

    for (const bu of bus ?? []) {
      const tz = bu.timezone || 'America/Mazatlan'
      const { dateISO, min: nowMin } = localNow(tz)
      const hold = holdMap[bu.id] ?? 15

      // ── 1) No-show automático (solo reservas de HOY, vencidas > tolerancia) ──
      const { data: res } = await admin.from('reservations')
        .select('id, guest_id, time_slot, party_size')
        .eq('bu_id', bu.id).eq('date', dateISO).in('status', ['requested', 'confirmed'])
      const vencidas = (res ?? []).filter((r: { time_slot: string }) => {
        const start = norm(toMin(r.time_slot))
        const overdue = nowMin - (start + hold)
        // ventana de seguridad: vencida hace 0-6h (evita marcar cosas raras)
        return overdue > 0 && overdue <= 360
      })
      if (vencidas.length) {
        const gids = [...new Set(vencidas.map((r: { guest_id: string }) => r.guest_id))]
        const { data: gs } = await admin.from('guests').select('id, full_name').in('id', gids)
        const gname = (id: string) => (gs ?? []).find((g: { id: string }) => g.id === id)?.full_name ?? 'Cliente'
        for (const r of vencidas) {
          await admin.from('reservations').update({ status: 'no_show' }).eq('id', r.id).in('status', ['requested', 'confirmed'])
          await admin.from('activity_log').insert({
            user_id: null, action: 'reservation_status', entity_type: 'reservation', entity_id: r.id,
            details: { actor: 'Sistema', bu: bu.code, to: 'No-show', via: 'auto_noshow', guest: gname(r.guest_id), slot: r.time_slot, pax: r.party_size },
          })
        }
        noshows += vencidas.length
        slackLines.push(`👻 *No-show automático* — ${bu.code}: ${vencidas.map((r: { guest_id: string; time_slot: string; party_size: number }) => `${gname(r.guest_id)} (${r.time_slot}, ${r.party_size}p)`).join(' · ')}`)
      }

      // ── 2) Sin garantía: depósito pendiente a <24h del evento ────────────────
      const { data: dep } = await admin.from('reservations')
        .select('id, guest_id, date, time_slot, party_size, notes')
        .eq('bu_id', bu.id).in('status', ['requested', 'confirmed'])
        .gte('date', dateISO)
        .or('notes.ilike.%Apartado pendiente%,notes.ilike.%Depósito requerido%')
      const porMarcar = (dep ?? []).filter((r: { date: string; time_slot: string; notes: string | null }) => {
        if ((r.notes ?? '').includes('SIN GARANTÍA')) return false
        const daysAhead = (new Date(r.date + 'T00:00:00').getTime() - new Date(dateISO + 'T00:00:00').getTime()) / 86400000
        const startAbs = daysAhead * 1440 + norm(toMin(r.time_slot))
        return startAbs - nowMin <= 1440 && startAbs - nowMin > -360
      })
      if (porMarcar.length) {
        const gids = [...new Set(porMarcar.map((r: { guest_id: string }) => r.guest_id))]
        const { data: gs } = await admin.from('guests').select('id, full_name').in('id', gids)
        const gname = (id: string) => (gs ?? []).find((g: { id: string }) => g.id === id)?.full_name ?? 'Cliente'
        for (const r of porMarcar) {
          await admin.from('reservations').update({ notes: `${r.notes ?? ''} · ⚠️ SIN GARANTÍA (sin depósito a 24h)` }).eq('id', r.id)
        }
        sinGarantia += porMarcar.length
        slackLines.push(`💳 *Sin garantía (depósito no recibido a 24h)* — ${bu.code}: ${porMarcar.map((r: { guest_id: string; date: string; time_slot: string; party_size: number }) => `${gname(r.guest_id)} (${r.date} ${r.time_slot}, ${r.party_size}p)`).join(' · ')}\nEl host decide si la sostiene.`)
      }
    }

    if (slackLines.length) await notifySlack(admin, slackLines.join('\n\n'))
    return new Response(JSON.stringify({ ok: true, noshows, sinGarantia }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[reservations-cron]', String(err))
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
