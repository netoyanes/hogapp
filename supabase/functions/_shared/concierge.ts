// Helpers compartidos por concierge-webhook / concierge-agent / concierge-dispatcher.
// Deno — importado por ruta relativa desde cada función.

const META_API_VERSION = 'v20.0'

// ─── Firma del webhook (Meta firma cada POST con el App Secret) ─────────────
export async function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader) return false
  const expected = signatureHeader.replace('sha256=', '')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  // Comparación en tiempo constante
  if (hex.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// ─── Enviar mensaje de texto ─────────────────────────────────────────────────
export async function sendWhatsApp(phoneNumberId: string, token: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })
  const data = await res.json()
  if (!res.ok) console.error('[concierge] sendWhatsApp error', JSON.stringify(data))
  return data
}

export async function sendInstagram(pageAccessToken: string, recipientId: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/me/messages?access_token=${pageAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  })
  const data = await res.json()
  if (!res.ok) console.error('[concierge] sendInstagram error', JSON.stringify(data))
  return data
}

export async function sendChannelMessage(channel: 'whatsapp' | 'instagram', to: string, text: string) {
  if (channel === 'whatsapp') {
    const token = Deno.env.get('WHATSAPP_TOKEN')!
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!
    return sendWhatsApp(phoneNumberId, token, to, text)
  }
  const token = Deno.env.get('IG_PAGE_ACCESS_TOKEN')!
  return sendInstagram(token, to, text)
}

// ─── Slack — mismo webhook que usa la app (app_settings.slack_webhook) ──────
// deno-lint-ignore no-explicit-any
export async function notifySlackFromEdge(supabaseAdmin: any, text: string) {
  const { data } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'slack_webhook').maybeSingle()
  const url = data?.value
  if (!url || !url.startsWith('https://hooks.slack.com/')) return
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
  } catch (err) {
    console.error('[concierge] slack notify failed', String(err))
  }
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
