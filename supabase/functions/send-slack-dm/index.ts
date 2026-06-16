import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { slackUserId, message } = await req.json()
    console.log('[send-slack-dm] invoked', { slackUserId, messagePreview: String(message).slice(0, 40) })

    if (!slackUserId || !message) {
      console.error('[send-slack-dm] missing params', { slackUserId, hasMessage: !!message })
      return new Response(JSON.stringify({ error: 'slackUserId and message are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const token = Deno.env.get('SLACK_BOT_TOKEN')
    if (!token) {
      console.error('[send-slack-dm] SLACK_BOT_TOKEN not configured')
      return new Response(JSON.stringify({ error: 'SLACK_BOT_TOKEN not configured' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    console.log('[send-slack-dm] token present, length', token.length)

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackUserId, // Slack opens a DM automatically when channel = member ID
        text: message,
        unfurl_links: false,
        unfurl_media: false,
      }),
    })

    const data = await res.json()
    console.log('[send-slack-dm] slack response', JSON.stringify(data))
    if (!data.ok) {
      console.error('[send-slack-dm] slack error:', data.error)
      return new Response(JSON.stringify({ error: data.error }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    console.log('[send-slack-dm] message delivered to', slackUserId)
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-slack-dm] exception', String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
