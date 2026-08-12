// banx-sync — puente HOG ↔ BANX (sandbox/producción por secrets).
//  action 'ping'          → GET /api/v1/ping (verifica credenciales y sucursales)
//  action 'sync'          → por cada BU mapeada y activa: saldo + órdenes (polling
//                           incremental con cursor) + corridas de nómina → espejo local
//  action 'colaboradores' → catálogo de nómina de una sucursal {slug}
//  action 'test_batch'    → lote de 1 orden de prueba (sandbox) {slug}
//  action 'test_payroll'  → corrida de prueba con el 1er colaborador con CLABE {slug}
// Secrets: BANX_API_KEY (banx_test_… / banx_live_…), BANX_BASE_URL (default sandbox).
// Verify JWT: ACTIVADO — solo Master o usuarios con la app 'finanzas'.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const BASE = () => Deno.env.get('BANX_BASE_URL') || 'https://sandboxbanx.aek.mx'

// deno-lint-ignore no-explicit-any
async function banx(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const key = Deno.env.get('BANX_API_KEY')
  if (!key) return { ok: false, status: 0, data: { error: { code: 'NO_KEY', message: 'Falta el secret BANX_API_KEY' } } }
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  let data = null
  try { data = await res.json() } catch { /* body vacío */ }
  return { ok: res.ok, status: res.status, data }
}

// deno-lint-ignore no-explicit-any
type Admin = any

// deno-lint-ignore no-explicit-any
function orderRow(buId: string, o: any) {
  return {
    id: o.id, bu_id: buId,
    external_id: o.external_id ?? null, sequential_number: o.sequential_number ?? null,
    beneficiary: o.beneficiary_name ?? null, bank: o.beneficiary_bank ?? null, clabe_last4: o.beneficiary_clabe_last4 ?? null,
    amount: Number(o.amount ?? 0), iva: o.iva_amount != null ? Number(o.iva_amount) : null,
    concept: o.concept ?? null, reference: o.reference ?? null, invoice_number: o.invoice_number ?? null,
    payment_date: o.payment_date ?? null, expense_type: o.expense_type ?? null, priority: o.priority ?? null,
    payment_method: o.payment_method ?? null, status: o.status,
    rejection_reason: o.status_detail?.rejection_reason ?? null, cancel_reason: o.status_detail?.cancel_reason ?? null,
    stp_tracking_key: o.stp_tracking_key ?? null, folio_solicitud: o.folio_solicitud ?? null, origin: o.origin ?? null,
    banx_created_at: o.created_at ?? null, banx_updated_at: o.updated_at ?? null,
    synced_at: new Date().toISOString(),
  }
}

async function syncLocation(admin: Admin, loc: { id: string; bu_id: string; banx_slug: string; last_sync: string | null }) {
  const out: string[] = []
  // Saldo → snapshot + banx_location_id
  const saldo = await banx(`/api/v1/saldo?location=${encodeURIComponent(loc.banx_slug)}`)
  if (saldo.ok) {
    await admin.from('finance_balances').insert({
      bu_id: loc.bu_id, available: saldo.data.available ?? null,
      closing_balance: saldo.data.closing_balance ?? null, reserved: saldo.data.reserved_in_process ?? null,
    })
    if (saldo.data.location?.id) await admin.from('finance_locations').update({ banx_location_id: saldo.data.location.id }).eq('id', loc.id)
    out.push(`saldo ok ($${saldo.data.available})`)
  } else out.push(`saldo: ${saldo.data?.error?.code ?? saldo.status}`)

  // Órdenes — polling incremental con cursor; upsert por id
  let since = loc.last_sync || '2026-01-01T00:00:00Z'
  let cursor: string | null = null
  let maxUpdated = loc.last_sync ?? ''
  let total = 0
  for (let page = 0; page < 20; page++) {
    const qs = `location=${encodeURIComponent(loc.banx_slug)}&since=${encodeURIComponent(since)}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const r = await banx(`/api/v1/ordenes-pago?${qs}`)
    if (!r.ok) { out.push(`ordenes: ${r.data?.error?.code ?? r.status}`); break }
    // deno-lint-ignore no-explicit-any
    const orders = (r.data.orders ?? []) as any[]
    if (orders.length) {
      await admin.from('finance_orders').upsert(orders.map(o => orderRow(loc.bu_id, o)), { onConflict: 'id' })
      total += orders.length
      for (const o of orders) if (o.updated_at && o.updated_at > maxUpdated) maxUpdated = o.updated_at
    }
    cursor = r.data.next_cursor ?? null
    if (!cursor) break
  }
  out.push(`${total} órdenes`)

  // Nómina — corridas
  const nr = await banx(`/api/v1/nomina/corridas?location=${encodeURIComponent(loc.banx_slug)}&limit=200`)
  if (nr.ok) {
    // deno-lint-ignore no-explicit-any
    const runs = (nr.data.corridas ?? []) as any[]
    if (runs.length) {
      await admin.from('finance_payroll_runs').upsert(runs.map(c => ({
        id: c.id, bu_id: loc.bu_id, pay_date: c.pay_date ?? null,
        period_start: c.period_start ?? null, period_end: c.period_end ?? null,
        status: c.status ?? null, total_amount: c.total_amount != null ? Number(c.total_amount) : null,
        employee_count: c.employee_count ?? null, rejection_reason: c.rejection_reason ?? null,
        banx_updated_at: c.updated_at ?? null, synced_at: new Date().toISOString(),
      })), { onConflict: 'id' })
    }
    out.push(`${runs.length} corridas`)
  }

  if (maxUpdated && maxUpdated !== loc.last_sync) {
    await admin.from('finance_locations').update({ last_sync: maxUpdated }).eq('id', loc.id)
  }
  return out.join(' · ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    // Autorización: Master o app 'finanzas'
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Sin sesión.' }, 401)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const [{ data: prof }, { data: appRow }] = await Promise.all([
      admin.from('profiles').select('role').eq('id', user.id).single(),
      admin.from('user_apps').select('app').eq('user_id', user.id).eq('app', 'finanzas').maybeSingle(),
    ])
    if (prof?.role !== 'MASTER' && !appRow) return json({ error: 'Finanzas es exclusivo del Master (o acceso otorgado por él).' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = body.action ?? 'sync'

    if (action === 'ping') {
      const r = await banx('/api/v1/ping')
      return json({ ok: r.ok, base: BASE(), result: r.data }, r.ok ? 200 : 502)
    }

    if (action === 'colaboradores') {
      const r = await banx(`/api/v1/nomina/colaboradores?location=${encodeURIComponent(String(body.slug ?? ''))}`)
      return json({ ok: r.ok, result: r.data }, r.ok ? 200 : 502)
    }

    if (action === 'test_batch') {
      const slug = String(body.slug ?? '')
      const stamp = Date.now()
      const r = await banx('/api/v1/ordenes-pago', {
        method: 'POST',
        headers: { 'Idempotency-Key': `HOG-TEST-${stamp}` },
        body: JSON.stringify({
          location: slug,
          external_batch_id: `HOG-TEST-${stamp}`,
          orders: [{
            external_id: `HOG-TEST-PO-${stamp}`,
            beneficiary_name: 'Proveedor de Prueba SA',
            beneficiary_clabe: '646180683100090019',
            amount: 123.45,
            concept: 'Prueba de conexión HOG',
            expense_type: 'OTRO',
            priority: 'NORMAL',
          }],
        }),
      })
      return json({ ok: r.ok, result: r.data }, r.ok ? 200 : 502)
    }

    if (action === 'test_payroll') {
      const slug = String(body.slug ?? '')
      const cols = await banx(`/api/v1/nomina/colaboradores?location=${encodeURIComponent(slug)}`)
      if (!cols.ok) return json({ ok: false, result: cols.data }, 502)
      // deno-lint-ignore no-explicit-any
      const first = (cols.data.colaboradores ?? []).find((c: any) => c.activo && c.has_clabe)
      if (!first) return json({ ok: false, result: { error: { message: 'Ningún colaborador activo con CLABE en esa sucursal.' } } }, 400)
      const today = new Date().toISOString().slice(0, 10)
      const r = await banx('/api/v1/nomina/corridas', {
        method: 'POST',
        headers: { 'Idempotency-Key': `HOG-NOMTEST-${slug}-${today}` },
        body: JSON.stringify({
          location: slug, pay_date: today,
          items: [{ employee_id: first.employee_id, monto_total: 100, notas: 'Prueba de conexión HOG' }],
        }),
      })
      return json({ ok: r.ok, result: r.data }, r.ok ? 200 : 502)
    }

    // sync (default): todas las sucursales activas, o solo una BU
    let q = admin.from('finance_locations').select('id, bu_id, banx_slug, last_sync').eq('active', true)
    if (body.bu_id) q = q.eq('bu_id', body.bu_id)
    const { data: locs } = await q
    const log: string[] = []
    for (const loc of locs ?? []) {
      try { log.push(`${loc.banx_slug}: ${await syncLocation(admin, loc)}`) }
      catch (e) { log.push(`${loc.banx_slug}: ERROR ${(e as Error).message}`) }
    }
    return json({ ok: true, base: BASE(), log: log.length ? log : ['sin sucursales mapeadas — configura el slug BANX por venue'] })
  } catch (err) {
    console.error('[banx-sync]', String(err))
    return json({ error: 'Algo salió mal.' }, 500)
  }
})
