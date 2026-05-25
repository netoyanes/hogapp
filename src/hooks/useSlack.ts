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

export function taskCreatedMessage(title: string, bu: string, priority: string, assignee?: string) {
  return `🆕 *New Task* — ${title}\n*BU:* ${bu} · *Priority:* ${priority}${assignee ? ` · *Assigned to:* ${assignee}` : ''}`
}

export function statusChangedMessage(title: string, from: string, to: string, bu: string) {
  const ICONS: Record<string, string> = {
    OPEN: '⬜',
    IN_PROGRESS: '🟦',
    PROOF_SUBMITTED: '🟡',
    APPROVED: '✅',
    REVISION: '🔴',
  }
  return `${ICONS[to] ?? '🔄'} *Task updated* — ${title}\n*${bu}* · ${from} → *${to}*`
}

export function proofUploadedMessage(title: string, bu: string, uploader: string) {
  return `📎 *Proof submitted* — ${title}\n*BU:* ${bu} · Uploaded by ${uploader}`
}
