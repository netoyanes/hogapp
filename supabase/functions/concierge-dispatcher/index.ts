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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const now = new Date().toISOString()

  const [{ data: dueReplies }, { data: dueFollowups }] = await Promise.all([
    supabaseAdmin.from('bot_conversations').select('id').eq('status', 'bot').eq('is_simulated', false).not('next_bot_reply_at', 'is', null).lte('next_bot_reply_at', now),
    supabaseAdmin.from('bot_conversations').select('id, bu_id, channel').eq('status', 'bot').eq('is_simulated', false).eq('last_sender', 'bot').not('next_followup_at', 'is', null).lte('next_followup_at', now),
  ])

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
  return local >= cfg.followup_window_start.slice(0, 5) && local <= cfg.followup_window_end.slice(0, 5)
}
