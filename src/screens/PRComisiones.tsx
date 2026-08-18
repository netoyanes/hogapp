import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, X, AlertTriangle, Banknote } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { KPITile, SegmentedControl, StatusBadgeV2, EmptyStateV2, Sheet, showToast, type StatusTone } from '../components/v2'
import { logActivity } from '../hooks/useActivityLog'

// ─────────────────────────────────────────────────────────────────────────────
// COMISIONES PR — la cola del gerente y el corte quincenal.
//
// Aquí es donde una comisión calculada se vuelve dinero. El orden importa:
//   calculada → (gerente valida) → validada → (dirección libera) → liberada → pagada
//
// El gerente ve SOLO las de su casa; el PR no entra aquí en absoluto. Las dos
// cosas las impone el SQL, no esta pantalla — esto es la puerta, no la cerradura.
//
// Cada fila muestra POR QUÉ el monto es ese: tarifa, factor y cada
// multiplicador. Un gerente que no entiende un número no puede validarlo, y
// una validación a ciegas no protege nada.
// ─────────────────────────────────────────────────────────────────────────────

type Estado = 'calculada' | 'validada' | 'liberada' | 'en_pago' | 'pagada' | 'retenida' | 'rechazada'

const ESTADO_META: Record<Estado, { label: string; tone: StatusTone }> = {
  calculada: { label: 'Por validar', tone: 'attention' },
  validada:  { label: 'Validada',    tone: 'accent' },
  liberada:  { label: 'Liberada',    tone: 'healthy' },
  en_pago:   { label: 'En pago',     tone: 'healthy' },
  pagada:    { label: 'Pagada',      tone: 'healthy' },
  retenida:  { label: 'Retenida',    tone: 'risk' },
  rechazada: { label: 'Rechazada',   tone: 'risk' },
}

interface Comision {
  id: string
  reservation_id: string
  pr_id: string
  bu_id: string
  base_consumo_neto: number
  pax_sentado: number | null
  tier_aplicado: string
  tarifa_base: number
  factor_atribucion: number
  multiplicadores: { tipo: string; factor?: number; pax?: number; de?: number; a?: number; por_cover?: number }[]
  reducciones: { tipo: string; piso?: number; techo?: number; calculado?: number; consumo_por_persona?: number }[]
  tope_aplicado: boolean
  monto: number
  periodo_corte: string | null
  estado: Estado
  motivo_rechazo: string | null
  created_at: string
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })

function periodoActual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getDate() <= 15 ? 'Q1' : 'Q2'}`
}

export function PRComisiones({ userRole }: { userRole?: string }) {
  const isMobile = useIsMobile()
  const esDireccion = ['MASTER', 'C_LEVEL', 'PR_MANAGER'].includes(userRole ?? '')
  const [rows, setRows] = useState<Comision[]>([])
  const [prNombres, setPrNombres] = useState<Record<string, string>>({})
  const [buCodes, setBuCodes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [falta, setFalta] = useState(false)
  const [periodo, setPeriodo] = useState(periodoActual())
  const [filtro, setFiltro] = useState<'calculada' | 'validada' | 'todo'>('calculada')
  const [abierta, setAbierta] = useState<Comision | null>(null)
  const [cerrando, setCerrando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('pr_commissions')
      .select('*').eq('periodo_corte', periodo).order('created_at', { ascending: false })
    if (error) {
      if (/does not exist|relation/i.test(error.message)) { setFalta(true); setLoading(false); return }
      showToast(`No se pudieron cargar: ${error.message}`, 'error')
    }
    const list = (data ?? []) as Comision[]
    setRows(list)
    const [{ data: prs }, { data: bus }] = await Promise.all([
      supabase.from('pr_profiles').select('id, full_name, codigo'),
      supabase.from('business_units').select('id, code'),
    ])
    setPrNombres(Object.fromEntries((prs ?? []).map(p => [p.id, `${p.full_name} · ${p.codigo}`])))
    setBuCodes(Object.fromEntries((bus ?? []).map(b => [b.id, b.code])))
    setLoading(false)
  }, [periodo])
  useEffect(() => { load() }, [load])

  const visibles = useMemo(
    () => filtro === 'todo' ? rows : rows.filter(r => r.estado === filtro),
    [rows, filtro])

  const kpis = useMemo(() => ({
    porValidar: rows.filter(r => r.estado === 'calculada').reduce((s, r) => s + Number(r.monto), 0),
    validado:   rows.filter(r => r.estado === 'validada').reduce((s, r) => s + Number(r.monto), 0),
    liberado:   rows.filter(r => ['liberada', 'en_pago', 'pagada'].includes(r.estado)).reduce((s, r) => s + Number(r.monto), 0),
    pendientes: rows.filter(r => r.estado === 'calculada').length,
  }), [rows])

  async function liberarCorte() {
    if (!window.confirm(`¿Liberar el corte ${periodo}? Se liberan ${mxn.format(kpis.validado)} de comisiones validadas. El corte cerrado ya no se recalcula.`)) return
    setCerrando(true)
    const { data, error } = await supabase.rpc('fn_pr_corte', { p_periodo: periodo, p_liberar: true })
    setCerrando(false)
    if (error) { showToast(`No se pudo: ${error.message}`, 'error'); return }
    const r = data as { ok: boolean; error?: string; total?: number; prs?: number }
    if (!r?.ok) { showToast(r?.error ?? 'No se pudo liberar el corte.', 'error'); return }
    logActivity('pr_corte', 'pr_corte', crypto.randomUUID(), { periodo, total: r.total, prs: r.prs })
    showToast(`Corte ${periodo} liberado: ${mxn.format(Number(r.total ?? 0))}.`, 'success')
    load()
  }

  if (falta) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyStateV2 icon="🗄" title="Falta correr pr_fase1.sql" actionLabel="Reintentar" onAction={() => { setFalta(false); load() }} />
        <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)', maxWidth: 460, margin: '0 auto' }}>
          Las comisiones necesitan <code>supabase/seeds/pr_fase1.sql</code>. Córrelo en el SQL Editor de Supabase.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Banknote size={18} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0, flex: 1 }}>Comisiones PR</h1>
          <input value={periodo} onChange={e => setPeriodo(e.target.value)} className="num"
            style={{ width: 130, minHeight: 40, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 999, padding: '0 12px', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)', textAlign: 'center' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <KPITile label="Por validar" value={mxn.format(kpis.porValidar)}
            color={kpis.pendientes ? 'var(--status-attention)' : 'var(--text-primary)'}
            hint={kpis.pendientes ? `${kpis.pendientes} esperando` : 'nada pendiente'} />
          <KPITile label="Validado" value={mxn.format(kpis.validado)} hint="listo para liberar" />
          <KPITile label="Liberado" value={mxn.format(kpis.liberado)} color="var(--status-healthy)" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <SegmentedControl
            options={[{ id: 'calculada', label: 'Por validar' }, { id: 'validada', label: 'Validadas' }, { id: 'todo', label: 'Todas' }]}
            value={filtro} onChange={v => setFiltro(v as typeof filtro)} />
          {esDireccion && kpis.validado > 0 && (
            <button onClick={liberarCorte} disabled={cerrando}
              style={{ marginLeft: 'auto', minHeight: 40, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              {cerrando ? 'Liberando…' : `Liberar corte · ${mxn.format(kpis.validado)}`}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <EmptyStateV2 icon="✅" title={filtro === 'calculada' ? 'Nada por validar en este periodo' : 'Sin comisiones aquí'} />
        ) : visibles.map(c => (
          <button key={c.id} onClick={() => setAbierta(c)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 12, cursor: 'pointer', minHeight: 62 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                {prNombres[c.pr_id] ?? '—'}
              </div>
              <div className="num" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                {buCodes[c.bu_id] ?? '—'} · consumo {mxn.format(Number(c.base_consumo_neto))} · {c.pax_sentado ?? '—'} pax
                {c.tope_aplicado ? ' · TOPE' : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="num" style={{ fontSize: 15, fontWeight: 800, color: Number(c.monto) > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {mxn.format(Number(c.monto))}
              </div>
              <div style={{ marginTop: 3 }}>
                <StatusBadgeV2 tone={ESTADO_META[c.estado].tone} label={ESTADO_META[c.estado].label} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {abierta && (
        <DetalleComision c={abierta} isMobile={isMobile}
          nombre={prNombres[abierta.pr_id] ?? '—'} bu={buCodes[abierta.bu_id] ?? '—'}
          onClose={() => setAbierta(null)}
          onResuelta={() => { setAbierta(null); load() }} />
      )}
    </div>
  )
}

// ── El desglose: por qué el monto es ese, y la decisión del gerente ─────────
function DetalleComision({ c, nombre, bu, isMobile, onClose, onResuelta }: {
  c: Comision; nombre: string; bu: string; isMobile: boolean
  onClose: () => void; onResuelta: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [rechazando, setRechazando] = useState(false)
  const [busy, setBusy] = useState(false)

  async function decidir(aprueba: boolean) {
    if (!aprueba && !motivo.trim()) { showToast('Para rechazar hace falta el motivo.', 'error'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('fn_pr_validar_comision', {
      p_commission: c.id, p_aprueba: aprueba, p_motivo: motivo.trim() || null,
    })
    setBusy(false)
    if (error) { showToast(`No se pudo: ${error.message}`, 'error'); return }
    const r = data as { ok: boolean; error?: string }
    if (!r?.ok) { showToast(r?.error ?? 'No se pudo.', 'error'); return }
    logActivity('pr_validacion', 'pr_commission', c.id, { aprueba, monto: c.monto, motivo: motivo.trim() || null })
    showToast(aprueba ? 'Comisión validada.' : 'Comisión rechazada.', 'success')
    onResuelta()
  }

  const lb: React.CSSProperties = { fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const num: React.CSSProperties = { fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }
  const pendiente = c.estado === 'calculada' || c.estado === 'retenida'

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={430}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>{nombre}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ textAlign: 'center', padding: '6px 0 14px' }}>
          <div className="num" style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            {mxn.format(Number(c.monto))}
          </div>
          <StatusBadgeV2 tone={ESTADO_META[c.estado].tone} label={ESTADO_META[c.estado].label} />
        </div>

        {/* El desglose. Un gerente que no entiende el número no puede validarlo. */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 10 }}>
          <label style={{ ...lb, display: 'block', marginBottom: 8 }}>Cómo salió este monto</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Fila k="Consumo neto de la mesa" v={mxn.format(Number(c.base_consumo_neto))} />
            <Fila k={`Tarifa · tier ${c.tier_aplicado}`} v={`${(Number(c.tarifa_base) * 100).toFixed(1)}%`} />
            <Fila k="Crédito de atribución" v={`${Math.round(Number(c.factor_atribucion) * 100)}%`}
              nota={Number(c.factor_atribucion) < 1 ? 'no fue código directo del cliente' : undefined} />
            {c.multiplicadores?.map((m, i) => (
              <Fila key={i}
                k={m.tipo === 'dia_valle' ? 'Día valle'
                  : m.tipo === 'cliente_nuevo' ? 'Cliente nuevo del grupo'
                  : m.tipo === 'mesa_grande' ? `Mesa grande (${m.pax} pax)`
                  : m.tipo === 'cuota_fija' ? 'Cuota fija por cover'
                  : m.tipo === 'tope_multiplicadores' ? 'Tope de multiplicadores' : m.tipo}
                v={m.tipo === 'tope_multiplicadores' ? `×${m.de} → ×${m.a}`
                  : m.tipo === 'cuota_fija' ? mxn.format(Number(m.por_cover))
                  : `×${m.factor}`} />
            ))}
            {c.reducciones?.map((r, i) => (
              <Fila key={`r${i}`} alerta
                k={r.tipo === 'bajo_piso' ? 'Bajo el piso de consumo' : r.tipo === 'techo' ? 'Techo por reserva' : r.tipo}
                v={r.tipo === 'bajo_piso' ? `${mxn.format(Number(r.consumo_por_persona))}/persona < ${mxn.format(Number(r.piso))}`
                  : `${mxn.format(Number(r.calculado))} → ${mxn.format(Number(r.techo))}`} />
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><span style={lb}>Casa</span><div style={num}>{bu}</div></div>
          <div><span style={lb}>Personas</span><div style={num}>{c.pax_sentado ?? '—'}</div></div>
          <div><span style={lb}>Periodo</span><div style={num}>{c.periodo_corte ?? '—'}</div></div>
          <div><span style={lb}>Calculada</span><div style={num}>{new Date(c.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</div></div>
        </div>

        {c.motivo_rechazo && (
          <div style={{ background: 'color-mix(in srgb, var(--status-risk) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-risk) 30%, transparent)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12, fontSize: 12, color: 'var(--status-risk)' }}>
            Rechazada: {c.motivo_rechazo}
          </div>
        )}

        {pendiente && (
          <>
            {!rechazando ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setRechazando(true)} disabled={busy}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 999, border: '1px solid color-mix(in srgb, var(--status-risk) 30%, transparent)', background: 'none', color: 'var(--status-risk)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <AlertTriangle size={15} /> Rechazar
                </button>
                <button onClick={() => decidir(true)} disabled={busy}
                  style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 999, border: 'none', background: 'var(--status-healthy)', color: '#04210f', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>
                  <Check size={16} /> {busy ? 'Validando…' : 'Validar'}
                </button>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                <label style={{ ...lb, display: 'block', marginBottom: 6 }}>¿Por qué se rechaza?</label>
                <input value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus
                  placeholder="La mesa ya venía del venue, el código se puso tarde…"
                  style={{ width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setRechazando(false); setMotivo('') }}
                    style={{ flex: 1, minHeight: 44, borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={() => decidir(false)} disabled={busy || !motivo.trim()}
                    style={{ flex: 1, minHeight: 44, borderRadius: 999, border: 'none', background: 'var(--status-risk)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: busy || !motivo.trim() ? 0.5 : 1 }}>
                    Confirmar rechazo
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function Fila({ k, v, nota, alerta }: { k: string; v: string; nota?: string; alerta?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 12, color: alerta ? 'var(--status-attention)' : 'var(--text-secondary)', flex: 1 }}>
        {k}
        {nota && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block' }}>{nota}</span>}
      </span>
      <span className="num" style={{ fontSize: 12.5, fontWeight: 700, color: alerta ? 'var(--status-attention)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{v}</span>
    </div>
  )
}
