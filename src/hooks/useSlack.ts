import { supabase } from '../lib/supabase'

let cachedWebhook: string | null = null

async function getWebhook(): Promise<string | null> {
  if (cachedWebhook) return cachedWebhook
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'slack_webhook').single()
  if (data?.value) { cachedWebhook = data.value; return cachedWebhook }
  const local = localStorage.getItem('hog_slack_webhook')
  if (local) { cachedWebhook = local; return cachedWebhook }
  return null
}

export function clearWebhookCache() { cachedWebhook = null }

// Channel broadcast — posts to the shared webhook
export async function notifySlack(text: string) {
  const url = await getWebhook()
  if (!url || !url.startsWith('https://hooks.slack.com/')) return
  try {
    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
  } catch { /* best-effort */ }
}

// Direct message — sends via bot to the specific Supabase user's Slack DM.
// Falls back to channel broadcast if the user has no slack_user_id configured.
export async function notifyUserDM(supabaseUserId: string, message: string) {
  try {
    const { data, error } = await supabase.from('profiles').select('slack_user_id').eq('id', supabaseUserId).single()
    if (error) console.warn('[notifyUserDM] profile lookup error', error.message)
    console.log('[notifyUserDM] target', supabaseUserId, 'slack_user_id:', data?.slack_user_id ?? '(none)')
    if (data?.slack_user_id) {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('send-slack-dm', {
        body: { slackUserId: data.slack_user_id, message },
      })
      if (fnError) {
        // Try to extract the Slack error from the response body
        try {
          const body = await (fnError as unknown as { context?: Response }).context?.json?.()
          console.error('[notifyUserDM] Slack error:', body?.error ?? fnError.message)
        } catch {
          console.error('[notifyUserDM] edge function error', fnError.message)
        }
      } else {
        console.log('[notifyUserDM] delivered', fnData)
      }
      return
    }
    console.warn('[notifyUserDM] no slack_user_id, falling back to channel')
  } catch (e) {
    console.error('[notifyUserDM] exception', e)
  }
  // Fallback: post to channel if user hasn't set up their Slack ID
  await notifySlack(message)
}

// ── Deep-link helpers ────────────────────────────────────────────────────────────

// Builds a link that opens the task/deal as an overlay on top of the app.
export function taskLink(taskId: string) {
  return `${window.location.origin}/?task=${taskId}`
}
export function dealLink(dealId: string) {
  return `${window.location.origin}/?deal=${dealId}`
}

// Appends a Slack-formatted "Open" link to a message, when a link is provided.
function withLink(text: string, link?: string) {
  return link ? `${text}\n👉 <${link}|Open in HOG APP>` : text
}

// ── Task messages ──────────────────────────────────────────────────────────────

export function taskCreatedMessage(title: string, bu: string, priority: string, assignee?: string, link?: string) {
  return withLink(`🆕 *New Task* — ${title}\n*BU:* ${bu} · *Priority:* ${priority}${assignee ? ` · *Assigned to:* ${assignee}` : ''}`, link)
}

export function statusChangedMessage(title: string, from: string, to: string, bu: string, link?: string) {
  const ICONS: Record<string, string> = {
    OPEN: '⬜', IN_PROGRESS: '🟦', PROOF_SUBMITTED: '🟡', APPROVED: '✅', REVISION: '🔴',
  }
  return withLink(`${ICONS[to] ?? '🔄'} *Task updated* — ${title}\n*${bu}* · ${from} → *${to}*`, link)
}

export function proofUploadedMessage(title: string, bu: string, uploader: string, link?: string) {
  return withLink(`📎 *Proof submitted* — ${title}\n*BU:* ${bu} · Uploaded by ${uploader}`, link)
}

export function taskAssignedMessage(title: string, assignee: string, link?: string) {
  return withLink(`📋 *You've been assigned a task* — ${title}\nAssigned to: ${assignee}`, link)
}

export function taskCommentMessage(title: string, author: string, comment: string, link?: string) {
  return withLink(`💬 *New comment on* — ${title}\n${author}: "${comment}"`, link)
}

export function dealCommentMessage(title: string, author: string, body: string, link?: string) {
  return withLink(`💬 *New activity on* — ${title}\n${author}: "${body}"`, link)
}

// ── CRM messages ───────────────────────────────────────────────────────────────

export function dealCreatedMessage(title: string, type: string, value: string | null, creator: string, link?: string) {
  return withLink(`🤝 *New Deal* — ${title}\n*Type:* ${type}${value ? ` · *Value:* ${value}` : ''} · Created by ${creator}`, link)
}

export function dealStageChangedMessage(title: string, from: string, to: string, updater: string, link?: string) {
  const ICONS: Record<string, string> = {
    LEAD: '🎯', CONTACTED: '📞', PROPOSAL: '📋', NEGOTIATING: '🤝', WON: '🏆', LOST: '❌',
  }
  return withLink(`${ICONS[to] ?? '🔄'} *Deal updated* — ${title}\n${updater} · ${from} → *${to}*`, link)
}

export function dealActivityMessage(title: string, type: ActivityType, body: string, author: string, link?: string) {
  const ICONS: Record<string, string> = { CALL: '📞', EMAIL: '📧', MEETING: '📅', NOTE: '📝' }
  return withLink(`${ICONS[type] ?? '💬'} *CRM ${type}* — ${title}\n${author}: "${body}"`, link)
}

export function reservationCreatedMessage(guest: string, bu: string, date: string, slot: string, pax: number) {
  return `🍸 *Nueva reserva* — ${bu}\n${guest} · ${date} · ${slot} · ${pax} pax`
}

export function reservationLostMessage(kind: 'no_show' | 'cancelled', guest: string, bu: string, date: string, slot: string, pax: number, reason?: string) {
  const icon = kind === 'no_show' ? '👻' : '🚫'
  const label = kind === 'no_show' ? 'No-show' : 'Cancelación'
  return `${icon} *${label} (${pax} pax)* — ${bu}\n${guest} · ${date} · ${slot}${reason ? ` · Motivo: ${reason}` : ''}`
}

type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE'
