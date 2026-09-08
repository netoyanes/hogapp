// concierge-dispatcher — disparado por pg_cron cada minuto (ver concierge_phase2.sql).
// Encuentra turnos vencidos (primera respuesta/siguiente mensaje) y seguimientos
// de 5 min pendientes, y despacha cada uno a concierge-agent.
// Auto-contenida (sin imports locales) para poder desplegarse desde el editor
// del dashboard de Supabase, no solo por CLI.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CONCURRENCY = 5

// Un turno que lleva más de esto vencido ya no se contesta: el cliente escribió
// hace rato y una respuesta tardía es peor que ninguna. Se le apaga el reloj
// para que no quede rebotando en la cola (ver EL INCIDENTE abajo).
const VENCIMIENTO_MIN = 60

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const now = new Date().toISOString()

  // EL INCIDENTE: el kill switch se apagó el 22 de agosto con 24 conversaciones
  // pendientes. concierge-agent respeta el switch, pero hacía return DESPUÉS de
  // sus 7 consultas y sin limpiar next_bot_reply_at — así que seguían vencidas.
  // Este dispatcher las volvía a despachar cada minuto: ~10 mil consultas por
  // hora, 17 días, solo para redescubrir que el bot estaba apagado. Ahogó la
  // instancia hasta que PostgREST no pudo ni cargar su schema cache y la Data
  // API entera empezó a responder 503.
  //
  // El switch se consulta AQUÍ, con una sola consulta, antes de despachar nada.
  const { data: sw } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'bot_enabled').maybeSingle()
  if (sw?.value !== 'true') {
    return new Response(JSON.stringify({ dispatched: 0, motivo: 'bot_enabled=false' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // El corte de vencimiento va en la consulta, no después: lo viejo ni se trae.
  const corte = new Date(Date.now() - VENCIMIENTO_MIN * 60000).toISOString()

  const [{ data: dueReplies }, { data: dueFollowups }, { data: rancias }] = await Promise.all([
    supabaseAdmin.from('bot_conversations').select('id').eq('status', 'bot').eq('is_simulated', false).not('next_bot_reply_at', 'is', null).lte('next_bot_reply_at', now).gte('next_bot_reply_at', corte),
    supabaseAdmin.from('bot_conversations').select('id, bu_id, channel').eq('status', 'bot').eq('is_simulated', false).eq('last_sender', 'bot').not('next_followup_at', 'is', null).lte('next_followup_at', now).gte('next_followup_at', corte),
    supabaseAdmin.from('bot_conversations').select('id, next_bot_reply_at, next_followup_at').eq('status', 'bot').eq('is_simulated', false).or(`next_bot_reply_at.lt.${corte},next_followup_at.lt.${corte}`),
  ])

  // Segunda red, por si algo vuelve a dejar turnos colgados: lo que ya venció
  // hace más de una hora se apaga en vez de reintentarse para siempre.
  //
  // Cada reloj se apaga por separado: una conversación puede traer la respuesta
  // rancia y el seguimiento todavía vigente, y apagar los dos de un plumazo se
  // comería un seguimiento legítimo.
  type Rancia = { id: string; next_bot_reply_at: string | null; next_followup_at: string | null }
  const replyRancias = (rancias ?? []).filter((c: Rancia) => c.next_bot_reply_at && c.next_bot_reply_at < corte).map((c: Rancia) => c.id)
  const followRancias = (rancias ?? []).filter((c: Rancia) => c.next_followup_at && c.next_followup_at < corte).map((c: Rancia) => c.id)
  await Promise.all([
    replyRancias.length ? supabaseAdmin.from('bot_conversations').update({ next_bot_reply_at: null }).in('id', replyRancias) : null,
    followRancias.length ? supabaseAdmin.from('bot_conversations').update({ next_followup_at: null }).in('id', followRancias) : null,
  ])
  if (replyRancias.length || followRancias.length) {
    console.log('[concierge-dispatcher] relojes rancios apagados:', replyRancias.length, 'respuestas,', followRancias.length, 'seguimientos')
  }

  const replyIds = new Set((dueReplies ?? []).map((c: { id: string }) => c.id))
  const followupJobs: { id: string; isFollowup: boolean }[] = []
  for (const id of replyIds) followupJobs.push({ id, isFollowup: false })
  for (const c of dueFollowups ?? []) {
    if (replyIds.has(c.id)) continue // ya la va a atender como respuesta normal
    if (await withinCourtesyWindow(supabaseAdmin, c.bu_id, c.channel)) followupJobs.push({ id: c.id, isFollowup: true })
  }

  const functionsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/concierge-agent`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  let dispatched = 0
  for (let i = 0; i < followupJobs.length; i += CONCURRENCY) {
    const batch = followupJobs.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(job =>
      fetch(functionsUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: job.id, isFollowup: job.isFollowup }),
      }).catch(err => console.error('[concierge-dispatcher] fallo despachando', job.id, String(err)))
    ))
    dispatched += batch.length
  }

  return new Response(JSON.stringify({ dispatched }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
})

// deno-lint-ignore no-explicit-any
async function withinCourtesyWindow(supabaseAdmin: any, buId: string | null, channel: string): Promise<boolean> {
  if (!buId) return true
  const { data: cfg } = await supabaseAdmin.from('bot_venue_config').select('followup_window_start, followup_window_end, timezone').eq('bu_id', buId).eq('channel', channel).maybeSingle()
  if (!cfg) return true
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: cfg.timezone || 'America/Mazatlan', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  const start = cfg.followup_window_start.slice(0, 5)
  const end = cfg.followup_window_end.slice(0, 5)
  // Ventanas que cruzan medianoche (nightlife: ej. 08:00–00:20) envuelven el día
  return start <= end ? (local >= start && local <= end) : (local >= start || local <= end)
}
