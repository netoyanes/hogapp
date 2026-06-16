import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRIORITY_COLORS: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#EAB308', LOW: '#22C55E' }
const STATUS_COLORS: Record<string, string> = {
  OPEN: '#6B7280', IN_PROGRESS: '#3B82F6', PROOF_SUBMITTED: '#F59E0B',
  APPROVED: '#22C55E', REVISION: '#EF4444',
}
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', PROOF_SUBMITTED: 'Proof Submitted',
  APPROVED: 'Approved', REVISION: 'Revision',
}

function buildHtml(task: Record<string, unknown>, buName: string, assigneeName: string, taskUrl: string) {
  const pColor = PRIORITY_COLORS[task.priority as string] ?? '#6B7280'
  const sColor = STATUS_COLORS[task.status as string] ?? '#6B7280'
  const statusLabel = STATUS_LABELS[task.status as string] ?? task.status

  const dueDate = task.due_date
    ? new Date(`${task.due_date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const metaRows = [
    buName       ? `<tr><td style="padding-bottom:12px;"><div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">Business Unit</div><div style="font-size:12px;color:#999;">${buName}</div></td></tr>` : '',
    assigneeName ? `<tr><td style="padding-bottom:12px;"><div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">Assigned to</div><div style="font-size:12px;color:#999;">${assigneeName}</div></td></tr>` : '',
    dueDate      ? `<tr><td style="padding-bottom:12px;"><div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">Due Date</div><div style="font-size:12px;color:#999;">${dueDate}</div></td></tr>` : '',
    task.estimated_hours ? `<tr><td style="padding-bottom:12px;"><div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">Est. Hours</div><div style="font-size:12px;color:#999;">${task.estimated_hours}h</div></td></tr>` : '',
    task.proof_required  ? `<tr><td style="padding-bottom:12px;"><div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">Proof Required</div><div style="font-size:12px;color:#EAB308;">Yes</div></td></tr>` : '',
  ].filter(Boolean).join('')

  const descriptionBlock = task.description
    ? `<p style="margin:0 0 16px 0;font-size:13px;color:#999;line-height:1.6;background:#0D0D0D;border-radius:8px;padding:12px;border:1px solid #222;">${String(task.description).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
    : ''

  // Inline HOG logo SVG (no external resources — email safe)
  const logoSvg = `<svg width="19" height="19" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:5px auto;">
    <path d="M 24.73 15.21 A 43 43 0 0 1 75.27 15.21 L 65.87 28.16 A 27 27 0 0 0 34.13 28.16 Z" fill="#F5F0E8"/>
    <path d="M 84.79 24.73 A 43 43 0 0 1 84.79 75.27 L 71.84 65.87 A 27 27 0 0 0 71.84 34.13 Z" fill="#F5F0E8"/>
    <path d="M 75.27 84.79 A 43 43 0 0 1 24.73 84.79 L 34.13 71.84 A 27 27 0 0 0 65.87 71.84 Z" fill="#F5F0E8"/>
    <path d="M 15.21 75.27 A 43 43 0 0 1 15.21 24.73 L 28.16 34.13 A 27 27 0 0 0 28.16 65.87 Z" fill="#F5F0E8"/>
  </svg>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width"/>
  <title>HOG OPS Task</title>
</head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0D0D0D;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;margin-bottom:20px;">
          <tr>
            <td>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:30px;height:30px;background:#1B3A20;border-radius:7px;text-align:center;vertical-align:middle;">
                    ${logoSvg}
                  </td>
                  <td style="padding-left:10px;">
                    <span style="color:#E5E5E5;font-family:monospace;font-weight:700;font-size:13px;">HOG OPS</span>
                  </td>
                  <td align="right" style="padding-left:20px;">
                    <span style="font-size:11px;color:#555;background:#1A1A1A;border:1px solid #2A2A2A;border-radius:4px;padding:2px 8px;font-family:monospace;">Task Notification</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#141414;border:1px solid #2A2A2A;border-radius:12px;overflow:hidden;">
          <!-- Priority bar -->
          <tr><td style="height:3px;background:${pColor};font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:20px;">

              <!-- Title -->
              <h1 style="margin:0 0 12px 0;font-size:18px;font-weight:700;color:#E5E5E5;line-height:1.3;">${String(task.title).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>

              <!-- Badges -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                <tr>
                  <td style="padding-right:6px;">
                    <span style="display:inline-block;font-size:11px;font-weight:600;font-family:monospace;color:${sColor};background:${sColor}22;border:1px solid ${sColor}55;border-radius:4px;padding:3px 8px;">${statusLabel}</span>
                  </td>
                  <td style="padding-right:6px;">
                    <span style="display:inline-block;font-size:11px;font-family:monospace;color:#777;background:#1A1A1A;border:1px solid #2A2A2A;border-radius:4px;padding:3px 8px;">${task.type}</span>
                  </td>
                  <td>
                    <span style="display:inline-block;font-size:11px;font-family:monospace;color:${pColor};background:${pColor}22;border:1px solid ${pColor}55;border-radius:4px;padding:3px 8px;">${task.priority}</span>
                  </td>
                </tr>
              </table>

              ${descriptionBlock}

              <!-- Meta -->
              ${metaRows ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">${metaRows}</table>` : ''}

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${taskUrl}"
                       style="display:inline-block;background:#22C55E;color:#000;text-align:center;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
                      Open Task →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>

        <!-- Footer -->
        <p style="margin-top:16px;font-size:11px;color:#444;font-family:monospace;text-align:center;">
          HOG OPS Command Center · You're receiving this because a task was assigned to you.
        </p>

      </td>
    </tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { taskId, assigneeId, appUrl } = await req.json()
    if (!taskId || !assigneeId || !appUrl) {
      return new Response(
        JSON.stringify({ error: 'taskId, assigneeId, and appUrl are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'HOG OPS <noreply@hogops.com>'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [{ data: task }, { data: profile }] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase.from('profiles').select('email, full_name').eq('id', assigneeId).single(),
    ])

    if (!task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!profile?.email) {
      return new Response(JSON.stringify({ error: 'Assignee email not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let buName = ''
    if (task.bu_id) {
      const { data: bu } = await supabase.from('business_units').select('code, name').eq('id', task.bu_id).single()
      if (bu) buName = `${bu.code} · ${bu.name}`
    }

    const taskUrl = `${appUrl}?task=${taskId}`
    const html = buildHtml(task, buName, profile.full_name ?? '', taskUrl)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [profile.email],
        subject: `You've been assigned: ${task.title}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return new Response(
        JSON.stringify({ error: (err as Record<string, string>).message ?? 'Email send failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
