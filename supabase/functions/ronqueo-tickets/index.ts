// ronqueo-tickets — venta de boletos de «All You Can Eat · Edición Ronqueo»
// (Bruma Records) con Stripe Checkout.
//
// Una función, varias entradas:
//   · { action: 'cupo' }        lugares restantes (vendidos + apartados vigentes)
//   · { action: 'checkout' }    aparta lugares en la base y crea la sesión de
//                               Checkout. Precio y cupo salen de ronqueo_config,
//                               NUNCA del cliente.
//   · { action: 'liberar' }     regreso por cancel_url: expira la sesión y
//                               devuelve los lugares al cupo
//   · { action: 'sesion' }      la página de gracias lee nombre, código,
//                               cantidad y total. Si el webhook aún no llega y
//                               Stripe ya marca el pago, confirma aquí mismo
//                               (misma lógica idempotente que el webhook).
//   · { action: 'reenviar' }    staff de HOG APP (con su sesión) reenvía el correo
//   · webhook de Stripe         lo reconoce por el header `stripe-signature`;
//                               verifica la firma con STRIPE_WEBHOOK_SECRET.
//                               checkout.session.completed → código + correo;
//                               checkout.session.expired → libera los lugares.
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY      sk_test_… en pruebas, sk_live_… en producción
//   STRIPE_WEBHOOK_SECRET  whsec_… del endpoint registrado en Stripe
//   PUBLIC_SITE_URL        https://dominio-de-hogapp (success/cancel URLs)
//   RESEND_API_KEY         correo de confirmación (sin ella el pago funciona
//                          y el correo queda pendiente para reenviarse)
//   RONQUEO_FROM_EMAIL     remitente verificado en Resend (opcional; si no,
//                          usa FROM_EMAIL o el de HOG APP)
//
// Verify JWT: DESACTIVADO — Stripe no manda Authorization y el landing es
// público. Cada entrada se protege sola: el webhook con su firma, 'reenviar'
// con el JWT del staff, y las públicas solo exponen lo mínimo.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17.7.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// El cliente se crea al primer uso: sin STRIPE_SECRET_KEY la función sigue
// respondiendo el cupo (y avisa claro en vez de tronar al arrancar).
let _stripe: Stripe | null = null
function stripeCli(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY')
  if (!key) throw new Error('STRIPE_SECRET_KEY no configurada')
  return (_stripe ??= new Stripe(key, { httpClient: Stripe.createFetchHttpClient() }))
}
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const SITE = (Deno.env.get('PUBLIC_SITE_URL') ?? '').replace(/\/+$/, '')
const PRODUCTO = 'all you can eat · edición ronqueo'
const DESCRIPCION = 'vie 20 nov 2026 · puertas 6:00 pm · bruma records · mazatlán'

type Orden = {
  id: string; status: string; nombre: string; correo: string; whatsapp: string; cantidad: number
  monto_centavos: number; stripe_session_id: string | null; codigo: string | null; email_sent_at: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'método no permitido' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  try {
    const firma = req.headers.get('stripe-signature')
    if (firma) return await webhook(db, await req.text(), firma)

    const body = await req.json().catch(() => ({}))
    switch (body.action) {
      case 'cupo': return json(await estado(db))
      case 'checkout': return await checkout(db, body)
      case 'liberar': return await liberar(db, body)
      case 'sesion': return await sesion(db, body)
      case 'reenviar': return await reenviar(db, req, body)
      default: return json({ error: 'acción desconocida' }, 400)
    }
  } catch (e) {
    console.error('ronqueo-tickets', e)
    return json({ error: 'error interno' }, 500)
  }
})

async function estado(db: SupabaseClient) {
  const { data, error } = await db.rpc('ronqueo_estado')
  if (error) throw error
  return data as { cupo: number; vendidos: number; reservados: number; restantes: number; maxPorCompra: number; ventaAbierta: boolean }
}

// ── checkout ────────────────────────────────────────────────────────────────
async function checkout(db: SupabaseClient, b: Record<string, unknown>) {
  if (!SITE) throw new Error('PUBLIC_SITE_URL no configurada')
  const nombre = String(b.nombre ?? '').trim().slice(0, 120)
  const correo = String(b.correo ?? '').trim().toLowerCase().slice(0, 200)
  const whatsapp = String(b.whatsapp ?? '').trim().slice(0, 30)
  const cantidad = Number(b.cantidad)

  if (nombre.length < 2) return json({ error: 'nombre inválido' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return json({ error: 'correo inválido' }, 400)
  if (whatsapp.replace(/\D/g, '').length < 10) return json({ error: 'whatsapp inválido' }, 400)
  if (!Number.isInteger(cantidad) || cantidad < 1) return json({ error: 'cantidad inválida' }, 400)

  // 1) Apartar en la base (con candado). Si no alcanza → 409 con lo que queda.
  const { data: r, error } = await db.rpc('ronqueo_reservar', {
    p_nombre: nombre, p_correo: correo, p_whatsapp: whatsapp, p_cantidad: cantidad,
  })
  if (error) {
    if (error.message === 'agotado' || error.message === 'venta_cerrada') {
      return json({ error: 'ya no quedan lugares suficientes', restantes: Number(error.details ?? 0) }, 409)
    }
    if (error.message === 'cantidad_invalida') return json({ error: 'cantidad inválida' }, 400)
    throw error
  }
  const res = r as { orden: string; precio_centavos: number; moneda: string }

  // 2) Sesión de Stripe. Vence a los 30 min (el mínimo de Stripe); el apartado
  //    en la base vence a los 31, así nunca se cobra un lugar ya liberado.
  try {
    const metadata = { orden: res.orden, nombre, correo, whatsapp, cantidad: String(cantidad), evento: 'ronqueo-2026-11-20' }
    const s = await stripeCli().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      locale: 'es-419',
      customer_email: correo,
      client_reference_id: res.orden,
      line_items: [{
        quantity: cantidad,
        price_data: {
          currency: res.moneda,
          unit_amount: res.precio_centavos,
          product_data: { name: PRODUCTO, description: DESCRIPCION },
        },
      }],
      metadata,
      payment_intent_data: { metadata, description: `${PRODUCTO} · ${cantidad} × lugar` },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${SITE}/ronqueo/gracias?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/ronqueo?cancelado=${res.orden}#boleto`,
    }, { idempotencyKey: `ronqueo-${res.orden}` })

    await db.from('ronqueo_orders').update({ stripe_session_id: s.id }).eq('id', res.orden)
    return json({ url: s.url })
  } catch (e) {
    // Sin sesión no hay cobro posible: los lugares regresan al cupo
    await db.from('ronqueo_orders').update({ status: 'expired' }).eq('id', res.orden)
    throw e
  }
}

// ── cancel_url ──────────────────────────────────────────────────────────────
async function liberar(db: SupabaseClient, b: Record<string, unknown>) {
  const orden = String(b.orden ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(orden)) return json({ ok: false }, 400)
  const { data: o } = await db.from('ronqueo_orders').select('id,status,stripe_session_id').eq('id', orden).maybeSingle()
  if (!o || o.status !== 'pending' || !o.stripe_session_id) return json({ ok: true })
  try {
    // Expirar la sesión hace imposible pagarla después; Stripe además manda
    // checkout.session.expired, que hace lo mismo que la línea de abajo.
    await stripeCli().checkout.sessions.expire(o.stripe_session_id)
  } catch (e) {
    // Si ya estaba pagada o vencida, Stripe lo rechaza: no tocamos la orden
    const s = await stripeCli().checkout.sessions.retrieve(o.stripe_session_id)
    if (s.status !== 'expired') {
      console.warn('liberar: la sesión no se pudo expirar', s.status, e)
      return json({ ok: false })
    }
  }
  await db.rpc('ronqueo_expirar', { p_session_id: o.stripe_session_id })
  return json({ ok: true })
}

// ── página de gracias ───────────────────────────────────────────────────────
async function sesion(db: SupabaseClient, b: Record<string, unknown>) {
  const sid = String(b.session_id ?? '')
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sid)) return json({ estado: 'no_encontrado' })

  let { data: o } = await db.from('ronqueo_orders').select('*').eq('stripe_session_id', sid).maybeSingle<Orden>()
  if (!o) return json({ estado: 'no_encontrado' })

  if (o.status !== 'paid') {
    const s = await stripeCli().checkout.sessions.retrieve(sid)
    if (s.payment_status !== 'paid') return json({ estado: s.status === 'expired' ? 'no_encontrado' : 'procesando' })
    o = await confirmar(db, s)
    if (!o) return json({ estado: 'procesando' })
  }
  return json({
    estado: 'pagado', nombre: o.nombre, codigo: o.codigo, cantidad: o.cantidad,
    total: Math.round(o.monto_centavos / 100), correo: o.correo,
  })
}

// ── webhook ─────────────────────────────────────────────────────────────────
async function webhook(db: SupabaseClient, raw: string, firma: string) {
  let ev: Stripe.Event
  try {
    ev = await Stripe.webhooks.constructEventAsync(raw, firma, Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '', undefined, cryptoProvider)
  } catch (e) {
    console.warn('webhook: firma inválida', (e as Error).message)
    return json({ error: 'firma inválida' }, 400)
  }

  const s = ev.data.object as Stripe.Checkout.Session
  // Solo sesiones de este evento (la cuenta de Stripe puede tener otras ventas)
  if (!s.metadata?.orden || s.metadata.evento !== 'ronqueo-2026-11-20') return json({ ignorado: true })

  if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
    if (s.payment_status === 'paid') await confirmar(db, s)
  } else if (ev.type === 'checkout.session.expired' || ev.type === 'checkout.session.async_payment_failed') {
    await db.rpc('ronqueo_expirar', { p_session_id: s.id })
  }
  return json({ recibido: true })
}

// Idempotente: el código se asigna una vez y el correo se reclama antes de
// enviarse. Se puede llamar las veces que sea (reintentos de Stripe + gracias).
async function confirmar(db: SupabaseClient, s: Stripe.Checkout.Session): Promise<Orden | null> {
  const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null
  const { data, error } = await db.rpc('ronqueo_confirmar', { p_session_id: s.id, p_payment_intent: pi })
  if (error) throw error
  const o = (data as Orden[])[0]
  if (!o) { console.warn('confirmar: sesión sin orden', s.id); return null }
  if (s.amount_total != null && s.amount_total !== o.monto_centavos) {
    console.error('confirmar: el monto cobrado no coincide', s.id, s.amount_total, o.monto_centavos)
  }
  if (!o.email_sent_at) await enviarCorreo(db, o)
  return o
}

// ── correo (Resend) ─────────────────────────────────────────────────────────
async function enviarCorreo(db: SupabaseClient, o: Orden) {
  const { data: mio } = await db.rpc('ronqueo_reclamar_correo', { p_orden: o.id })
  if (!mio) return // otro proceso ya lo está mandando o ya salió

  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) {
    await db.from('ronqueo_orders').update({ email_claimed_at: null, email_error: 'RESEND_API_KEY no configurada' }).eq('id', o.id)
    return
  }
  const from = Deno.env.get('RONQUEO_FROM_EMAIL') ?? Deno.env.get('FROM_EMAIL') ?? 'Bruma Records <noreply@hogops.com>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `ronqueo-${o.id}` },
    body: JSON.stringify({
      from,
      to: [o.correo],
      subject: `tu código para el ronqueo: ${o.codigo}`,
      html: correoHtml(o),
      text: correoTexto(o),
      tags: [{ name: 'evento', value: 'ronqueo' }],
    }),
  })
  if (res.ok) {
    await db.from('ronqueo_orders').update({ email_sent_at: new Date().toISOString(), email_error: null }).eq('id', o.id)
  } else {
    const detalle = (await res.text()).slice(0, 300)
    console.error('resend', res.status, detalle)
    await db.from('ronqueo_orders').update({ email_claimed_at: null, email_error: `resend ${res.status}: ${detalle}` }).eq('id', o.id)
  }
}

// Staff de HOG APP: reenviar el correo de una orden pagada
async function reenviar(db: SupabaseClient, req: Request, b: Record<string, unknown>) {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false },
  })
  const { data: esStaff } = await usuario.rpc('fn_ronqueo_staff')
  if (esStaff !== true) return json({ error: 'sin permiso' }, 403)
  const { data: o } = await db.from('ronqueo_orders').select('*').eq('id', String(b.orden ?? '')).maybeSingle<Orden>()
  if (!o || o.status !== 'paid') return json({ error: 'orden no pagada' }, 400)
  await db.from('ronqueo_orders').update({ email_sent_at: null, email_claimed_at: null }).eq('id', o.id)
  await enviarCorreo(db, { ...o, email_sent_at: null })
  const { data: fin } = await db.from('ronqueo_orders').select('email_sent_at,email_error').eq('id', o.id).single()
  return json({ ok: !!fin?.email_sent_at, error: fin?.email_error ?? null })
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const pesos = (centavos: number) => '$' + Math.round(centavos / 100).toLocaleString('en-US')

function correoTexto(o: Orden) {
  return [
    `listo, ${o.nombre}. tu lugar tiene nombre.`,
    '',
    `tu código: ${o.codigo}`,
    `${o.cantidad} ${o.cantidad === 1 ? 'lugar' : 'lugares'} · ${pesos(o.monto_centavos)} mxn`,
    'viernes 20 nov · puertas 6:00 pm',
    'bruma records · mazatlán',
    '',
    'enséñalo en la puerta, desde el teléfono o en captura.',
    'llega temprano, de verdad.',
    '',
    `${SITE}/ronqueo`,
  ].join('\n')
}

// Correo en los colores de Bruma (modo Día): papel, verde profundo y lima.
// Tablas e inline styles: es lo único que respetan todos los clientes de correo.
function correoHtml(o: Orden) {
  const n = esc(o.nombre)
  const font = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
  const mono = "'IBM Plex Mono', Menlo, Consolas, monospace"
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>tu código para el ronqueo</title></head>
<body style="margin:0;padding:0;background:#f4f1e9;">
<div style="display:none;max-height:0;overflow:hidden;">tu código: ${o.codigo} · vie 20 nov · bruma records</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1e9;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
  <tr><td style="font-family:${font};font-weight:800;font-size:22px;line-height:1;letter-spacing:-0.04em;color:#192623;padding-bottom:28px;">bruma<br>records</td></tr>
  <tr><td style="font-family:${mono};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9d4b21;padding-bottom:12px;">pago confirmado</td></tr>
  <tr><td style="font-family:${font};font-weight:800;font-size:40px;line-height:0.95;letter-spacing:-0.05em;color:#192623;padding-bottom:24px;">listo, ${n}.<br>tu lugar tiene nombre.</td></tr>
  <tr><td style="background:#161714;border-radius:8px;padding:24px;">
    <div style="font-family:${mono};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#f4f1e9;">tu código</div>
    <div style="font-family:${font};font-weight:800;font-size:40px;line-height:1;letter-spacing:-0.05em;color:#daff62;padding:6px 0 14px;">${o.codigo}</div>
    <div style="font-family:${font};font-size:16px;line-height:1.5;color:#f4f1e9;">
      ${o.cantidad} ${o.cantidad === 1 ? 'lugar' : 'lugares'} · ${pesos(o.monto_centavos)} mxn<br>
      viernes 20 nov · puertas 6:00 pm<br>
      bruma records · mazatlán
    </div>
  </td></tr>
  <tr><td style="font-family:${font};font-size:17px;line-height:1.4;color:#5f5440;padding:24px 0;">enséñalo en la puerta, desde el teléfono o en captura. la lista va a nombre de ${n}.</td></tr>
  <tr><td style="padding-bottom:28px;"><a href="${SITE}/ronqueo" style="display:inline-block;background:#daff62;color:#0f0f0f;font-family:${font};font-weight:700;font-size:17px;text-decoration:none;padding:16px 24px;border-radius:4px;">ver el evento</a></td></tr>
  <tr><td style="border-top:1px solid #192623;padding-top:16px;font-family:${font};font-weight:500;font-size:15px;color:#192623;">llega temprano, de verdad.</td></tr>
  <tr><td style="padding-top:20px;font-family:${mono};font-size:11px;letter-spacing:0.06em;color:#887a5b;">bruma records · café-bar &amp; music · @bruma_rec · #ronqueobruma</td></tr>
</table></td></tr></table></body></html>`
}
