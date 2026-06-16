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

// ── Task messages ──────────────────────────────────────────────────────────────

export function taskCreatedMessage(title: string, bu: string, priority: string, assignee?: string) {
  return `🆕 *New Task* — ${title}\n*BU:* ${bu} · *Priority:* ${priority}${assignee ? ` · *Assigned to:* ${assignee}` : ''}`
}

export function statusChangedMessage(title: string, from: string, to: string, bu: string) {
  const ICONS: Record<string, string> = {
    OPEN: '⬜', IN_PROGRESS: '🟦', PROOF_SUBMITTED: '🟡', APPROVED: '✅', REVISION: '🔴',
  }
  return `${ICONS[to] ?? '🔄'} *Task updated* — ${title}\n*${bu}* · ${from} → *${to}*`
}

export function proofUploadedMessage(title: string, bu: string, uploader: string) {
  return `📎 *Proof submitted* — ${title}\n*BU:* ${bu} · Uploaded by ${uploader}`
}

export function taskAssignedMessage(title: string, assignee: string) {
  return `📋 *You've been assigned a task* — ${title}\nAssigned to: ${assignee}`
}

export function taskCommentMessage(title: string, author: string, comment: string) {
  return `💬 *New comment on* — ${title}\n${author}: "${comment}"`
}

export function dealCommentMessage(title: string, author: string, body: string) {
  return `💬 *New activity on* — ${title}\n${author}: "${body}"`
}

// ── CRM messages ───────────────────────────────────────────────────────────────

export function dealCreatedMessage(title: string, type: string, value: string | null, creator: string) {
  return `🤝 *New Deal* — ${title}\n*Type:* ${type}${value ? ` · *Value:* ${value}` : ''} · Created by ${creator}`
}

export function dealStageChangedMessage(title: string, from: string, to: string, updater: string) {
  const ICONS: Record<string, string> = {
    LEAD: '🎯', CONTACTED: '📞', PROPOSAL: '📋', NEGOTIATING: '🤝', WON: '🏆', LOST: '❌',
  }
  return `${ICONS[to] ?? '🔄'} *Deal updated* — ${title}\n${updater} · ${from} → *${to}*`
}

export function dealActivityMessage(title: string, type: ActivityType, body: string, author: string) {
  const ICONS: Record<string, string> = { CALL: '📞', EMAIL: '📧', MEETING: '📅', NOTE: '📝' }
  return `${ICONS[type] ?? '💬'} *CRM ${type}* — ${title}\n${author}: "${body}"`
}

type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE'
