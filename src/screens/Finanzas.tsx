import { useCallback, useEffect, useMemo, useState } from 'react'
import { Landmark, RefreshCw, Settings2, Plus, Trash2, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { BUChip, Sheet, showToast } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// FINANZAS — espacio exclusivo del Master (acceso otorgable solo por él, app
// 'finanzas' en Usuarios). Por venue:
//  · Ingresos en el tiempo (captura propia) vs Egresos (órdenes BANX)
//  · PASIVOS visibles: órdenes vivas (pendiente/autorizado/en proceso)
//  · Ratio ingresos/egresos mensual — la salud financiera de un vistazo
//  · Saldo BANX y nómina espejo. Sync vía edge function banx-sync (sandbox/prod)
// Paleta de gráficas validada (CVD-safe): ingresos #3D89C4 · egresos #C27E22
// ─────────────────────────────────────────────────────────────────────────────

interface FinLocation { id: string; bu_id: string; banx_slug: string; active: boolean; last_sync: string | null }
interface Income { id: string; bu_id: string; date: string; amount: number; source: string | null; notes: string | null }
interface Order {
  id: string; bu_id: string; external_id: string | null; beneficiary: string | null
  amount: number; concept: string | null; expense_type: string | null; status: string
  payment_date: string | null; folio_solicitud: string | null; origin: string | null
  banx_created_at: string | null; banx_updated_at: string | null
  rejection_reason: string | null; cancel_reason: string | null
}
interface Balance { bu_id: string; taken_at: string; available: number | null; reserved: number | null }
interface PayrollRun { id: string; bu_id: string; pay_date: string | null; status: string | null; total_amount: number | null; employee_count: number | null }

const C_IN = '#3D89C4'   // ingresos (validado dark, CVD-safe vs egresos)
const C_OUT = '#C27E22'  // egresos
const LIVE_STATUSES = ['PENDIENTE', 'AUTORIZADO', 'EN_PROCESO', 'SOLICITAR_INFO']
const STATUS_COLOR: Record<string, string> = {
  PENDIENTE: 'var(--text-tertiary)', AUTORIZADO: '#C27E22', EN_PROCESO: '#3D89C4',
  LIQUIDADO: 'var(--status-healthy)', RECHAZADO: 'var(--status-risk)', CANCELADO: 'var(--status-risk)',
  DEVUELTO: 'var(--status-risk)', SOLICITAR_INFO: 'var(--status-attention)',
}
const mxn = (n: number) => `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

export function Finanzas({ userId, isMaster }: { userId?: string; isMaster: boolean }) {
  const isMobile = useIsMobile()
  const [buList, setBuList] = useState<{ id: string; code: string; name: string }[]>([])
  const [locations, setLocations] = useState<FinLocation[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [payroll, setPayroll] = useState<PayrollRun[]>([])
  const [buId, setBuId] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  // Captura rápida de ingreso
  const [incAmount, setIncAmount] = useState('')
  const [incDate, setIncDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [incSource, setIncSource] = useState('')

  const load = useCallback(async () => {
    const yearAgo = new Date(); yearAgo.setMonth(yearAgo.getMonth() - 12)
    const sinceISO = yearAgo.toISOString()
    const [{ data: bus }, { data: locs }, { data: inc }, { data: ord }, { data: bal }, { data: pr }] = await Promise.all([
      supabase.from('business_units').select('id, code, name').order('name'),
      supabase.from('finance_locations').select('*'),
      supabase.from('finance_income').select('*').gte('date', sinceISO.slice(0, 10)).order('date', { ascending: false }),
      supabase.from('finance_orders').select('*').gte('banx_created_at', sinceISO).order('banx_created_at', { ascending: false }).limit(1000),
      supabase.from('finance_balances').select('bu_id, taken_at, available, reserved').order('taken_at', { ascending: false }).limit(200),
      supabase.from('finance_payroll_runs').select('id, bu_id, pay_date, status, total_amount, employee_count').order('pay_date', { ascending: false }).limit(30),
    ])
    setBuList(bus ?? [])
    setLocations((locs ?? []) as FinLocation[])
    setIncomes((inc ?? []) as Income[])
    setOrders((ord ?? []) as Order[])
    setBalances((bal ?? []) as Balance[])
    setPayroll((pr ?? []) as PayrollRun[])
    setLoading(false)
    if (!buId && (locs?.length || bus?.length)) setBuId(locs?.[0]?.bu_id ?? bus?.[0]?.id ?? '')
  }, [buId])
  useEffect(() => { load() }, [load])

  const buCode = useMemo(() => Object.fromEntries(buList.map(b => [b.id, b.code])), [buList])

  // ── Series mensuales (12m) del venue seleccionado ──────────────────────────
  const months = useMemo(() => {
    const arr: string[] = []
    const d = new Date(); d.setDate(1)
    for (let i = 11; i >= 0; i--) {
      const m = new Date(d); m.setMonth(m.getMonth() - i)
      arr.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
    }
    return arr
  }, [])

  const series = useMemo(() => {
    const inMap: Record<string, number> = {}, outMap: Record<string, number> = {}
    for (const i of incomes) {
      if (i.bu_id !== buId) continue
      const k = i.date.slice(0, 7)
      inMap[k] = (inMap[k] ?? 0) + Number(i.amount)
    }
    for (const o of orders) {
      // Egresos comprometidos: todo lo creado (deuda) menos rechazado/cancelado
      if (o.bu_id !== buId || ['RECHAZADO', 'CANCELADO', 'DEVUELTO'].includes(o.status)) continue
      const k = (o.banx_created_at ?? '').slice(0, 7)
      if (!k) continue
      outMap[k] = (outMap[k] ?? 0) + Number(o.amount)
    }
    return months.map(m => ({ m, ingresos: inMap[m] ?? 0, egresos: outMap[m] ?? 0 }))
  }, [incomes, orders, buId, months])

  const nowMonth = months[11]
  const cur = series[11] ?? { ingresos: 0, egresos: 0 }
  const liabilities = useMemo(() => orders.filter(o => o.bu_id === buId && LIVE_STATUSES.includes(o.status)), [orders, buId])
  const liabTotal = liabilities.reduce((s, o) => s + Number(o.amount), 0)
  const lastBalance = balances.find(b => b.bu_id === buId)
  const ratio = cur.egresos > 0 ? cur.ingresos / cur.egresos : null
  const ratioColor = (r: number | null) => r == null ? 'var(--text-tertiary)' : r >= 1.2 ? 'var(--status-healthy)' : r >= 0.8 ? 'var(--status-attention)' : 'var(--status-risk)'

  const maxVal = Math.max(...series.map(s => Math.max(s.ingresos, s.egresos)), 1)

  async function syncNow() {
    setSyncing(true)
    const { data, error } = await supabase.functions.invoke('banx-sync', { body: { action: 'sync' } })
    setSyncing(false)
    if (error) { showToast('No se pudo sincronizar — ¿banx-sync desplegada y BANX_API_KEY configurada?', 'error'); return }
    showToast(`BANX: ${(data?.log ?? []).join(' · ')}`.slice(0, 140), 'success')
    load()
  }

  async function addIncome() {
    const amount = parseFloat(incAmount)
    if (!(amount > 0) || !incDate || !buId) { showToast('Monto y fecha del ingreso.', 'error'); return }
    const { error } = await supabase.from('finance_income').insert({ bu_id: buId, date: incDate, amount, source: incSource.trim() || null, created_by: userId ?? null })
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    setIncAmount(''); setIncSource('')
    showToast('Ingreso registrado.', 'success')
    load()
  }

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14 }
  const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', margin: '0 0 10px' }
  const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)', padding: '0 12px', fontSize: 13, outline: 'none', minHeight: 42, boxSizing: 'border-box' }

  // Gráfica: barras pareadas 12m (SVG). Marcas delgadas, gap 2px, una escala.
  const CH = 150, CW = 720
  const groupW = CW / 12

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: 16, maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Landmark size={18} style={{ color: 'var(--accent)' }} />
          <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800, margin: 0, flex: 1 }}>Finanzas</h1>
          <select value={buId} onChange={e => setBuId(e.target.value)}
            style={{ ...inp, cursor: 'pointer', minHeight: 40 }}>
            {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
          </select>
          <button onClick={syncNow} disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            <RefreshCw size={13} /> {syncing ? 'Sincronizando…' : 'Sync BANX'}
          </button>
          {isMaster && (
            <button onClick={() => setConfigOpen(true)} title="Configurar conexión BANX"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer' }}>
              <Settings2 size={16} />
            </button>
          )}
        </div>

        {/* KPIs del venue */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'Ingresos del mes', value: mxn(cur.ingresos), color: C_IN },
            { label: 'Egresos del mes', value: mxn(cur.egresos), color: C_OUT },
            { label: 'Pasivos vivos', value: mxn(liabTotal), color: liabTotal > 0 ? 'var(--status-attention)' : 'var(--text-primary)', hint: `${liabilities.length} órdenes sin liquidar` },
            { label: 'Ratio ingresos/egresos', value: ratio == null ? '—' : ratio.toFixed(2), color: ratioColor(ratio), hint: '≥1.2 sano · 0.8–1.2 atención · <0.8 riesgo' },
          ].map(k => (
            <div key={k.label} title={k.hint} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{k.label}</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 800, color: k.color, fontFamily: 'var(--font-mono)' }}>{k.value}</div>
            </div>
          ))}
        </div>
        {lastBalance && (
          <p className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '-6px 0 0', fontFamily: 'var(--font-mono)' }}>
            🏦 Saldo BANX: <strong style={{ color: 'var(--text-primary)' }}>{lastBalance.available != null ? mxn(lastBalance.available) : '—'}</strong>
            {lastBalance.reserved ? ` · ${mxn(lastBalance.reserved)} reservado en proceso` : ''} · al {new Date(lastBalance.taken_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}

        {/* Ingresos vs egresos — 12 meses */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <p style={{ ...secTitle, margin: 0, flex: 1 }}>Ingresos vs egresos · 12 meses</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C_IN }} /> Ingresos</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C_OUT }} /> Egresos</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${CW} ${CH + 22}`} style={{ width: '100%', minWidth: 560, display: 'block' }}>
              {series.map((s, i) => {
                const x0 = i * groupW
                const barW = Math.min(16, groupW / 2 - 4)
                const hIn = Math.round((s.ingresos / maxVal) * (CH - 14))
                const hOut = Math.round((s.egresos / maxVal) * (CH - 14))
                const isNow = s.m === nowMonth
                return (
                  <g key={s.m}>
                    <rect x={x0 + groupW / 2 - barW - 1} y={CH - hIn} width={barW} height={Math.max(hIn, s.ingresos > 0 ? 3 : 0)} rx={3} fill={C_IN}>
                      <title>{s.m} · Ingresos {mxn(s.ingresos)}</title>
                    </rect>
                    <rect x={x0 + groupW / 2 + 1} y={CH - hOut} width={barW} height={Math.max(hOut, s.egresos > 0 ? 3 : 0)} rx={3} fill={C_OUT}>
                      <title>{s.m} · Egresos {mxn(s.egresos)}</title>
                    </rect>
                    <text x={x0 + groupW / 2} y={CH + 15} textAnchor="middle" fill={isNow ? 'var(--text-primary)' : 'var(--text-tertiary)'} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: isNow ? 800 : 400 }}>
                      {new Date(s.m + '-01T00:00:00').toLocaleDateString('es-MX', { month: 'short' })}
                    </text>
                  </g>
                )
              })}
              <line x1={0} y1={CH} x2={CW} y2={CH} stroke="var(--border-subtle)" strokeWidth={1} />
            </svg>
          </div>
        </div>

        {/* Ratio en el tiempo */}
        <div style={card}>
          <p style={secTitle}><TrendingUp size={11} style={{ verticalAlign: '-2px' }} /> Ratio ingresos/egresos por mes</p>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {series.map(s => {
              const r = s.egresos > 0 ? s.ingresos / s.egresos : null
              return (
                <div key={s.m} title={`${s.m}: ${r == null ? 'sin egresos' : r.toFixed(2)}`} style={{ flex: 1, minWidth: 44, textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 4px', borderTop: `3px solid ${ratioColor(r)}` }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 800, color: ratioColor(r), fontFamily: 'var(--font-mono)' }}>{r == null ? '—' : r.toFixed(1)}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{new Date(s.m + '-01T00:00:00').toLocaleDateString('es-MX', { month: 'short' })}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pasivos vivos */}
        <div style={card}>
          <p style={secTitle}>Pasivos vivos · {liabilities.length} órdenes · {mxn(liabTotal)}</p>
          {liabilities.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>Sin órdenes pendientes de liquidar. {locations.length === 0 ? 'Configura la conexión BANX (⚙) y sincroniza.' : ''}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {liabilities.map(o => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${STATUS_COLOR[o.status] ?? 'var(--border-subtle)'}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.beneficiary ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.concept ?? ''}{o.expense_type ? ` · ${o.expense_type}` : ''}{o.payment_date ? ` · paga ${o.payment_date}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', color: STATUS_COLOR[o.status] ?? 'var(--text-tertiary)', flexShrink: 0 }}>{o.status.replace('_', ' ')}</span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{mxn(Number(o.amount))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Captura de ingresos + nómina */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div style={card}>
            <p style={secTitle}>Registrar ingreso · {buCode[buId] ?? ''}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="date" value={incDate} onChange={e => setIncDate(e.target.value)} className="num" style={{ ...inp, flex: '1 1 130px' }} />
              <input type="number" inputMode="decimal" value={incAmount} onChange={e => setIncAmount(e.target.value)} placeholder="Monto MXN" style={{ ...inp, flex: '1 1 110px' }} />
              <input value={incSource} onChange={e => setIncSource(e.target.value)} placeholder="Fuente (barra, cover…)" style={{ ...inp, flex: '2 1 150px' }} />
              <button onClick={addIncome} style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: 42, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <Plus size={14} /> Agregar
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, maxHeight: 180, overflowY: 'auto' }}>
              {incomes.filter(i => i.bu_id === buId).slice(0, 15).map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="num" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{i.date}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.source ?? '—'}</span>
                  <span className="num" style={{ fontWeight: 700, color: C_IN, fontFamily: 'var(--font-mono)' }}>{mxn(Number(i.amount))}</span>
                  <span role="button" title="Eliminar" onClick={async () => { await supabase.from('finance_income').delete().eq('id', i.id); load() }}
                    style={{ cursor: 'pointer', color: 'var(--text-tertiary)', display: 'inline-flex' }}><Trash2 size={11} /></span>
                </div>
              ))}
            </div>
          </div>

          <div style={card}>
            <p style={secTitle}>Nómina (BANX)</p>
            {payroll.filter(p => p.bu_id === buId).length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>Sin corridas sincronizadas.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {payroll.filter(p => p.bu_id === buId).slice(0, 8).map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span className="num" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{p.pay_date ?? '—'}</span>
                    <span style={{ flex: 1 }}>{p.employee_count ?? '—'} colaboradores</span>
                    <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)', color: p.status === 'PAGADA' ? 'var(--status-healthy)' : 'var(--text-tertiary)' }}>{p.status ?? ''}</span>
                    <span className="num" style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: C_OUT }}>{p.total_amount != null ? mxn(Number(p.total_amount)) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading && <p style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>Cargando…</p>}
      </div>

      {configOpen && (
        <BanxConfigSheet buList={buList} locations={locations} isMobile={isMobile}
          onClose={() => setConfigOpen(false)} onSaved={() => { setConfigOpen(false); load() }} />
      )}
    </div>
  )
}

// ── Configuración BANX (solo Master): mapear BU→slug y probar la conexión ────
function BanxConfigSheet({ buList, locations, isMobile, onClose, onSaved }: {
  buList: { id: string; code: string; name: string }[]
  locations: FinLocation[]
  isMobile: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [buId, setBuId] = useState(buList[0]?.id ?? '')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [log, setLog] = useState<string | null>(null)

  const inp: React.CSSProperties = { width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '0 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }

  async function callFn(action: string, extra?: Record<string, unknown>) {
    setBusy(action); setLog(null)
    const { data, error } = await supabase.functions.invoke('banx-sync', { body: { action, ...extra } })
    setBusy(null)
    if (error) { setLog('Error: ¿banx-sync desplegada y secrets (BANX_API_KEY) configurados?'); return }
    setLog(JSON.stringify(data?.result ?? data, null, 2).slice(0, 1200))
  }

  async function saveMapping() {
    if (!buId || !slug.trim()) { showToast('Elige venue y escribe el slug BANX.', 'error'); return }
    const { error } = await supabase.from('finance_locations').upsert({ bu_id: buId, banx_slug: slug.trim(), active: true }, { onConflict: 'bu_id' })
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); return }
    showToast('Sucursal conectada — dale Sync BANX.', 'success')
    setSlug('')
    onSaved()
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={480}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 'var(--space-3) 0' }}>Conexión BANX</h2>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>
          Secrets en Supabase: <code>BANX_API_KEY</code> (banx_test_… para sandbox) y <code>BANX_WEBHOOK_SECRET</code> (whsec_…).
          El webhook a registrar con BANX: <code>…/functions/v1/banx-webhook</code>.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {locations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {locations.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 10px' }}>
                  <BUChip code={buList.find(b => b.id === l.bu_id)?.code ?? '?'} size="sm" />
                  <span className="num" style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{l.banx_slug}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{l.last_sync ? `sync ${l.last_sync.slice(0, 16)}` : 'sin sync'}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Mapear venue → sucursal BANX</span>
            <select value={buId} onChange={e => setBuId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {buList.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
            </select>
            <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="slug BANX — ej. bruma-mzt" style={inp} />
            <button onClick={saveMapping}
              style={{ minHeight: 44, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Conectar sucursal
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => callFn('ping')} disabled={!!busy}
              style={{ flex: 1, minHeight: 42, borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {busy === 'ping' ? '…' : 'Ping'}
            </button>
            <button onClick={() => callFn('test_batch', { slug: locations[0]?.banx_slug ?? 'bruma-mzt' })} disabled={!!busy}
              style={{ flex: 1, minHeight: 42, borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {busy === 'test_batch' ? '…' : 'Orden de prueba'}
            </button>
            <button onClick={() => callFn('test_payroll', { slug: locations[0]?.banx_slug ?? 'bruma-mzt' })} disabled={!!busy}
              style={{ flex: 1, minHeight: 42, borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {busy === 'test_payroll' ? '…' : 'Nómina de prueba'}
            </button>
          </div>
          {log && (
            <pre style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10, fontSize: 10.5, color: 'var(--text-secondary)', overflowX: 'auto', margin: 0, maxHeight: 260, overflowY: 'auto' }}>{log}</pre>
          )}
          <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
            El acceso a esta app lo otorgas SOLO tú: Usuarios → apps por usuario → <strong>finanzas</strong>.
          </p>
        </div>
      </div>
    </Sheet>
  )
}
