// hoh-provision — MASTER crea/administra cuentas de piso (Heart of House).
// Los HoH no tienen correo: se crea un usuario de Supabase con email sintético
// (usuario@piso.hoglocal.app) y el PIN como contraseña, confirmado de una vez
// para que puedan entrar sin verificación por correo.
// Verify JWT: ACTIVADO (lo llama un MASTER autenticado desde la app).
// Auto-contenida para desplegar desde el editor del dashboard.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const EMAIL_DOMAIN = 'piso.hoglocal.app'
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`
const pinToPassword = (p: string) => `hog-pin-${String(p).trim()}`
const validUser = (u: string) => /^[a-z0-9]{8,}$/.test(u)
const validPin = (p: string) => /^\d{4,6}$/.test(String(p))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    // Quién llama (su propio JWT) + validación de rol MASTER
    const supabaseUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: caller } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (caller?.role !== 'MASTER') return json({ error: 'Solo MASTER puede administrar accesos de piso' }, 403)

    const body = await req.json()
    const action = body.action ?? 'create'

    if (action === 'create') {
      const username = String(body.username ?? '').trim().toLowerCase()
      const pin = String(body.pin ?? '').trim()
      const fullName = String(body.full_name ?? '').trim()
      const venues: string[] = Array.isArray(body.venues) ? body.venues : []
      if (!validUser(username)) return json({ error: 'El usuario debe tener al menos 8 caracteres (letras/números, minúsculas).' }, 400)
      if (!validPin(pin)) return json({ error: 'El PIN debe ser de 4 a 6 dígitos.' }, 400)
      if (!fullName) return json({ error: 'Falta el nombre de la persona.' }, 400)

      // ¿Usuario ya en uso?
      const { data: exists } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
      if (exists) return json({ error: `El usuario "${username}" ya está en uso.` }, 409)

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: usernameToEmail(username),
        password: pinToPassword(pin),
        email_confirm: true,
        user_metadata: { full_name: fullName, username },
      })
      if (cErr || !created.user) return json({ error: cErr?.message ?? 'No se pudo crear la cuenta' }, 400)

      const uid = created.user.id
      const { error: pErr } = await admin.from('profiles').upsert({
        id: uid, username, full_name: fullName, email: usernameToEmail(username),
        role: 'HEART_OF_HOUSE', onboarding_completed: true,
      }, { onConflict: 'id' })
      if (pErr) return json({ error: pErr.message }, 400)

      if (venues.length) {
        await admin.from('user_venues').insert(venues.map(bu_id => ({ user_id: uid, bu_id })))
      }
      await admin.from('activity_log').insert({
        user_id: user.id, action: 'hoh_created', entity_type: 'user', entity_id: uid,
        details: { username, full_name: fullName },
      })
      return json({ ok: true, user_id: uid, username })
    }

    if (action === 'reset_pin') {
      const userId = String(body.user_id ?? '')
      const pin = String(body.pin ?? '').trim()
      if (!userId) return json({ error: 'Falta el usuario.' }, 400)
      if (!validPin(pin)) return json({ error: 'El PIN debe ser de 4 a 6 dígitos.' }, 400)
      // Solo cuentas de piso
      const { data: target } = await admin.from('profiles').select('role, username').eq('id', userId).single()
      if (target?.role !== 'HEART_OF_HOUSE') return json({ error: 'Solo se puede reiniciar el PIN de cuentas de piso.' }, 400)
      const { error: uErr } = await admin.auth.admin.updateUserById(userId, { password: pinToPassword(pin) })
      if (uErr) return json({ error: uErr.message }, 400)
      await admin.from('activity_log').insert({
        user_id: user.id, action: 'hoh_pin_reset', entity_type: 'user', entity_id: userId,
        details: { username: target.username },
      })
      return json({ ok: true })
    }

    return json({ error: `Acción desconocida: ${action}` }, 400)
  } catch (err) {
    console.error('[hoh-provision] excepción', String(err))
    return json({ error: String(err) }, 500)
  }
})
