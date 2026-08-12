// banx-webhook — receptor de webhooks firmados de BANX (§7 de su doc).
//  · Verifica X-Banx-Signature (HMAC-SHA256 sobre "<t>.<body crudo>", ±5 min)
//  · Deduplica por X-Banx-Delivery-Id (finance_webhook_events)
//  · orden_pago.*  → upsert del estado en finance_orders
//  · nomina.*      → upsert en finance_payroll_runs
// Responde 2xx de inmediato tras procesar (payloads chicos, <10s garantizado).
// Secrets: BANX_WEBHOOK_SECRET (whsec_…). Verify JWT: DESACTIVADO (server-to-server).
import { createClient } from 'jsr:@supabase/supabase-js@2'

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function timingSafeEq(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  const secret = Deno.env.get('BANX_WEBHOOK_SECRET')
  if (!secret) return new Response('no secret configured', { status: 500 })

  // Firma sobre el body CRUDO — no re-serializar
  const raw = await req.text()
  const header = req.headers.get('X-Banx-Signature') ?? ''
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')))
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return new Response('bad signature', { status: 400 })
  const expected = await hmacHex(secret, `${t}.${raw}`)
  if (!timingSafeEq(expected, String(parts.v1 ?? ''))) return new Response('bad signature', { status: 400 })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Dedup por delivery id — si ya lo vimos, 200 y fuera
  const deliveryId = req.headers.get('X-Banx-Delivery-Id') ?? crypto.randomUUID()
  const { error: dupErr } = await admin.from('finance_webhook_events').insert({ id: deliveryId })
  if (dupErr) return new Response('ok (dup)', { status: 200 })

  try {
    const event = JSON.parse(raw)
    const d = event.data ?? {}

    // Mapear sucursal BANX → BU (banx_location_id se llena en el primer sync)
    const { data: loc } = await admin.from('finance_locations')
      .select('bu_id').eq('banx_location_id', d.location_id).maybeSingle()
    if (!loc) return new Response('ok (unmapped location)', { status: 200 })

    if (String(event.type ?? '').startsWith('orden_pago')) {
      await admin.from('finance_orders').upsert({
        id: d.orden_id, bu_id: loc.bu_id,
        external_id: d.external_id ?? null, sequential_number: d.sequential_number ?? null,
        beneficiary: d.beneficiario ?? null, clabe_last4: d.clabe_ultimos4 ?? null,
        amount: Number(d.monto ?? 0), iva: d.iva != null ? Number(d.iva) : null,
        concept: d.concepto ?? null, reference: d.referencia ?? null, invoice_number: d.factura ?? null,
        payment_date: d.fecha_pago ?? null, payment_method: d.metodo_pago ?? null,
        status: d.estado_nuevo,
        rejection_reason: d.motivo_rechazo ?? null, cancel_reason: d.motivo_cancelacion ?? null,
        stp_tracking_key: d.stp_tracking_key ?? null, folio_solicitud: d.folio_solicitud ?? null,
        origin: d.origen ?? null,
        banx_updated_at: d.occurred_at ?? event.created_at ?? null,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' })
    } else if (String(event.type ?? '').startsWith('nomina')) {
      await admin.from('finance_payroll_runs').upsert({
        id: d.corrida_id, bu_id: loc.bu_id,
        pay_date: d.pay_date ?? null, period_start: d.period_start ?? null, period_end: d.period_end ?? null,
        status: d.estado_nuevo ?? null,
        total_amount: d.total_amount != null ? Number(d.total_amount) : null,
        employee_count: d.employee_count ?? null,
        rejection_reason: d.motivo_rechazo ?? null,
        banx_updated_at: d.occurred_at ?? event.created_at ?? null,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' })
    }
    // eventos desconocidos: se ignoran (contrato v1 — parser tolerante)
  } catch (e) {
    console.error('[banx-webhook]', String(e))
    // firma válida + dedup registrado: 200 para no acumular reintentos;
    // el polling de banx-sync reconcilia cualquier hueco
  }
  return new Response('ok', { status: 200 })
})
