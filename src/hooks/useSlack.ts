import { supabase } from '../lib/supabase'

let cachedWebhook: string | null = null

async function getWebhook(): Promise<string | null> {
  if (cachedWebhook) return cachedWebhook
  // Try app_settings table first
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'slack_webhook')
    .single()
  if (data?.value) {
    cachedWebhook = data.value
    return cachedWebhook
  }
  // Fall back to localStorage
  const local = localStorage.getItem('hog_slack_webhook')
  if (local) {
    cachedWebhook = local
    return cachedWebhook
  }
  return null
}

export function clearWebhookCache() {
  cachedWebhook = null
}

export async function notifySlack(text: string) {
  const url = await getWebhook()
  if (!url || !url.startsWith('https://hooks.slack.com/')) return
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch {
    // Slack notifications are best-effort — never block the UI
  }
}

// Returns "<@UXXXXXXXX> " if the user has a Slack ID, otherwise ""
export async function slackMention(userId: string): Promise<string> {
  try {
    const { data } = await supabase.from('profiles').select('slack_user_id').eq('id', userId).single()
    if (data?.slack_user_id) return `<@${data.slack_user_id}> `
  } catch { /* best-effort */ }
  return ''
}

// ── Task messages ──────────────────────────────────────────────────────────────

export function taskCreatedMessage(title: string, bu: string, priority: string, assignee?: string, mention?: string) {
  const who = mention ? `${mention}(${assignee})` : assignee ? `*Assigned to:* ${assignee}` : ''
  return `🆕 *New Task* — ${title}\n*BU:* ${bu} · *Priority:* ${priority}${who ? ` · ${who}` : ''}`
}

export function statusChangedMessage(title: string, from: string, to: string, bu: string, mention?: string) {
  const ICONS: Record<string, string> = {
    OPEN: '⬜', IN_PROGRESS: '🟦', PROOF_SUBMITTED: '🟡', APPROVED: '✅', REVISION: '🔴',
  }
  return `${ICONS[to] ?? '🔄'} *Task updated* — ${title}\n*${bu}* · ${from} → *${to}*${mention ? `\n${mention}` : ''}`
}

export function proofUploadedMessage(title: string, bu: string, uploader: string) {
  return `📎 *Proof submitted* — ${title}\n*BU:* ${bu} · Uploaded by ${uploader}`
}

export function taskAssignedMessage(title: string, assignee: string, mention: string) {
  return `📋 *Task assigned* — ${title}\n${mention}${assignee} has been assigned this task`
}

// ── CRM messages ───────────────────────────────────────────────────────────────

export function dealCreatedMessage(title: string, type: string, value: string | null, creator: string, mention?: string) {
  return `🤝 *New Deal* — ${title}\n*Type:* ${type}${value ? ` · *Value:* ${value}` : ''} · Created by ${mention ?? ''}${creator}`
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
