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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { userId } = await req.json()
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify caller is MASTER
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: caller } } = await supabaseUser.auth.getUser()
    if (!caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'MASTER') {
      return new Response(
        JSON.stringify({ error: 'Forbidden: MASTER role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (userId === caller.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Clean up all references to this user before deleting the auth account.
    // Order matters: child rows first, then profile, then auth user.
    await Promise.all([
      supabaseAdmin.from('task_followers').delete().eq('user_id', userId),
      supabaseAdmin.from('notifications').delete().eq('user_id', userId),
      supabaseAdmin.from('task_comments').delete().eq('author_id', userId),
      supabaseAdmin.from('tasks').update({ assigned_to: null }).eq('assigned_to', userId),
    ])

    // Some schemas store invitations tied to the user — clean those up too
    await supabaseAdmin.from('invitations').delete().eq('invited_by', userId)

    // Delete profile row
    await supabaseAdmin.from('profiles').delete().eq('id', userId)

    // Now delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) {
      return new Response(
        JSON.stringify({ error: deleteError.message }),
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
