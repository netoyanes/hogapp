// wellness-pay — el dinero del portal wellness, vía Blumon Pay.
//
// Dos entradas en la misma función:
//   · action=checkout  (el alumno, autenticado con su access_token de alumno):
//     genera un CHECKOUT LINK de Blumon para pagar su reserva. Elegimos
//     checkout link a propósito: la tarjeta se teclea en la página de Blumon,
//     jamás toca nuestro servidor ni nuestra base — cero carga PCI.
//   · webhook (Blumon → nosotros, sin auth de usuario): confirma o rechaza el
//     pago. El match es por `reference`, que nosotros generamos por pago.
//
// El MONTO siempre sale de la base (wellness_bookings.amount), nunca del
// cliente: un request manipulado no puede pagar $1 por una clase de $250.
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   BLUMON_ENV        sandbox | prod
//   BLUMON_USER       usuario e-commerce (correo del registro)
//   BLUMON_PASS       password YA en SHA-256 hex (como lo pide su API)
//   PORTAL_BASE_URL   https://tu-dominio.com  (para el urlCallback de regreso)
//
// Verify JWT: DESACTIVADO — el alumno no es usuario de Supabase (su auth es el
// access_token, validado aquí contra la base) y el webhook viene de Blumon.
// Registrar el webhook con soporte@blumonpay.com apuntando a:
//   https://<project>.supabase.co/functions/v1/wellness-pay?action=webhook
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const BASE = () => Deno.env.get('BLUMON_ENV') === 'prod'
  ? { token: 'https://tokener.blumonpay.net', ecom: 'https://ecommerce.blumonpay.net' }
  : { token: 'https://sandbox-tokener.blumonpay.net', ecom: 'https://sandbox-ecommerce.blumonpay.net' }

// Basic fijo de la API e-commerce de Blumon (documentado, igual en sandbox y prod)
const BASIC = btoa('blumon_pay_ecommerce_api:blumon_pay_ecommerce_api_password')

async function blumonToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'password',
    username: Deno.env.get('BLUMON_USER') ?? '',
    password: Deno.env.get('BLUMON_PASS') ?? '',
  })
  const res = await fetch(`${BASE().token}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${BASIC}` },
    body,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Blumon auth falló: ${JSON.stringify(data).slice(0, 300)}`)
  return data.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  const action = url.searchParams.get('action') ?? 'checkout'

  // service_role: los RPC públicos no cubren pagos; esta función es el único
  // camino de escritura a wellness_payments desde fuera
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    // ── WEBHOOK de Blumon: confirma/rechaza por reference ────────────────────
    if (action === 'webhook') {
      const hook = await req.json()
      const ref = String(hook.reference ?? '')
      const approved = String(hook.codeResponse ?? '') === '00'
        || String(hook.descriptionResponse ?? '').toUpperCase() === 'APROBADA'
      const { data: pay } = await db.from('wellness_payments')
        .select('id, booking_id, status').eq('blumon_reference', ref).maybeSingle()
      if (!pay) {
        // Referencia desconocida: se registra para auditar, no se tira el 200
        // (Blumon reintentaría para siempre un pago que no es nuestro)
        console.log(`[wellness-pay] webhook con reference desconocida: ${ref}`)
        return json({ ok: true, unknown: true })
      }
      if (pay.status === 'pagado') return json({ ok: true, dedup: true })

      await db.from('wellness_payments').update({
        status: approved ? 'pagado' : 'rechazado',
        blumon_operation: String(hook.operationNumber ?? ''),
        blumon_auth: String(hook.authorizationCode ?? ''),
        detail: hook,
        paid_at: approved ? new Date().toISOString() : null,
      }).eq('id', pay.id)

      if (approved && pay.booking_id) {
        await db.from('wellness_bookings')
          .update({ paid: true, paid_via: 'blumon', payment_id: pay.id })
          .eq('id', pay.booking_id)
      }
      console.log(`[wellness-pay] webhook ${ref}: ${approved ? 'APROBADA' : `rechazada (${hook.codeResponse})`}`)
      return json({ ok: true })
    }

    // ── CHECKOUT: el alumno pide su link de pago ─────────────────────────────
    const { token, booking_id } = await req.json()
    if (!token || !booking_id) return json({ error: 'Faltan datos.' }, 400)

    // Autenticación del alumno: su token debe ser dueño de la reserva
    const { data: booking } = await db.from('wellness_bookings')
      .select('id, amount, paid, student_id, class_date, slot_id, wellness_students!inner(id, full_name, phone, email, access_token)')
      .eq('id', booking_id).single()
    // deno-lint-ignore no-explicit-any
    const student = (booking as any)?.wellness_students
    if (!booking || student?.access_token !== token) return json({ error: 'Reserva no encontrada.' }, 404)
    if (booking.paid) return json({ error: 'Esta clase ya está pagada.' }, 409)
    const amount = Number(booking.amount)
    if (!amount || amount <= 0) return json({ error: 'Esta clase no requiere pago en línea.' }, 400)

    // Clase y venue: el nombre va al concepto del cobro, el código del venue
    // arma el urlCallback — el alumno regresa AL portal del que vino
    const { data: slot } = await db.from('wellness_slots')
      .select('id, wellness_classes!inner(name, business_units!inner(code))').eq('id', booking.slot_id).single()
    // deno-lint-ignore no-explicit-any
    const className = (slot as any)?.wellness_classes?.name ?? 'Clase wellness'
    // deno-lint-ignore no-explicit-any
    const buCode = (slot as any)?.wellness_classes?.business_units?.code ?? ''

    // Reference propia: es el hilo que une checkout → webhook → reserva
    const reference = `WL${Date.now()}${crypto.randomUUID().slice(0, 6)}`.toUpperCase()
    const { data: pay, error: payErr } = await db.from('wellness_payments').insert({
      student_id: student.id, booking_id: booking.id, amount,
      method: 'blumon', status: 'pendiente', blumon_reference: reference,
    }).select('id').single()
    if (payErr || !pay) return json({ error: `No se pudo iniciar el pago: ${payErr?.message}` }, 500)

    const access = await blumonToken()
    const nombre = String(student.full_name ?? '').trim().split(/\s+/)
    const res = await fetch(`${BASE().ecom}/checkout/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify({
        name: nombre[0] ?? '', lastName: nombre.slice(1).join(' ') || '-',
        email: student.email ?? undefined, phone: student.phone ?? undefined,
        amount, unique: true, reference,
        paymentConcept: `${className} · ${booking.class_date}`,
        response: true,
        urlCallback: `${Deno.env.get('PORTAL_BASE_URL') ?? ''}/?wellness=${encodeURIComponent(buCode)}`,
      }),
    })
    const data = await res.json()
    if (!data.status || !data.dataResponse?.payOrder) {
      await db.from('wellness_payments').update({ status: 'cancelado', detail: data }).eq('id', pay.id)
      return json({ error: `Blumon rechazó el checkout: ${data.error?.description ?? 'sin detalle'}` }, 502)
    }
    return json({ ok: true, pay_url: `${BASE().ecom}${data.dataResponse.payOrder}`, reference })
  } catch (e) {
    console.error('[wellness-pay]', e)
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
