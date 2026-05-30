import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, role, appUrl } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Try to send invite email (works for new users)
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { role },
      redirectTo: appUrl,
    })

    const alreadyRegistered = inviteError?.message?.toLowerCase().includes('already')

    // Generate a magic link regardless (works for new and existing users)
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: alreadyRegistered ? 'magiclink' : 'invite',
      email,
      options: { data: { role }, redirectTo: appUrl },
    })

    if (linkError && !alreadyRegistered) {
      return new Response(
        JSON.stringify({ error: linkError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailSent: !inviteError,
        alreadyRegistered,
        inviteLink: linkData?.properties?.action_link ?? appUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
