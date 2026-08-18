import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Users, Plus, Link2, Download, X, Search, Ban, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { normalizePhone, formatPhone } from '../lib/phone'
import { useIsMobile } from '../hooks/useIsMobile'
import { KPITile, SegmentedControl, StatusBadgeV2, EmptyStateV2, Sheet, showToast, type StatusTone } from '../components/v2'
import { logActivity } from '../hooks/useActivityLog'

// ─────────────────────────────────────────────────────────────────────────────
// RED PR — atribución de reservas por relaciones públicas (Fase 0)
//
// Lo que resuelve: hoy nadie sabe qué reservas trajo cada PR, y por lo tanto
// nadie puede pagarle por resultado. Esta pantalla es el registro de identidad
// del programa: quién es cada PR, cuál es su código —inmutable y dictable por
// teléfono— y su link/QR para repartir.
//
// El principio del módulo entero: el dinero solo se libera con eventos que el
// PR NO controla. Por eso aquí NO se marca sentada, NO se captura consumo y
// NO se liberan comisiones. Esta pantalla solo administra identidad.
//
// Dos caras según el rol:
//  · Master / PR Manager → la red completa: alta, baja, suspensión, tier
//  · PR                  → solo su tarjeta: su código, su link, su QR
// ─────────────────────────────────────────────────────────────────────────────

type Tier = 'aspirante' | 'plata' | 'oro' | 'embajador'
type Plaza = 'mzt' | 'cdmx' | 'foraneo'
type Estatus = 'activo' | 'suspendido' | 'baja'

interface PRProfile {
  id: string
  user_id: string | null
  full_name: string
  phone: string | null
  email: string | null
  codigo: string
  tier: Tier
  tier_desde: string
  plaza: Plaza
  estatus: Estatus
  datos_fiscales_ok: boolean
  restricciones: Record<string, unknown>
  notas: string | null
  fecha_alta: string
}

const TIER_META: Record<Tier, { label: string; tone: StatusTone; tarifa: string }> = {
  aspirante: { label: 'Aspirante', tone: 'neutral', tarifa: '5%' },
  plata: { label: 'Plata', tone: 'accent', tarifa: '7%' },
  oro: { label: 'Oro', tone: 'attention', tarifa: '9%' },
  embajador: { label: 'Embajador', tone: 'healthy', tarifa: '10%' },
}
const PLAZA_LABEL: Record<Plaza, string> = { mzt: 'Mazatlán', cdmx: 'CDMX', foraneo: 'Foráneo' }
const PLAZA_SUFIJO: Record<Plaza, string> = { mzt: 'MZT', cdmx: 'CDMX', foraneo: 'HOG' }

// El código se dicta por teléfono: sin acentos, sin ñ, sin ambigüedad.
function sugerirCodigo(nombre: string, plaza: Plaza): string {
  const limpio = nombre.trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, '')
  const alias = (limpio.split(/\s+/)[0] ?? '').slice(0, 8)
  return alias ? `${alias}-${PLAZA_SUFIJO[plaza]}` : ''
}
const CODIGO_OK = /^[A-Z0-9]{3,12}-[A-Z]{2,8}$/

export function PRNetwork({ userRole, userId }: { userRole?: string; userId?: string }) {
  const isMobile = useIsMobile()
  const esAdmin = ['MASTER', 'C_LEVEL', 'PR_MANAGER'].includes(userRole ?? '')
  const [rows, setRows] = useState<PRProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [falta, setFalta] = useState(false)          // el SQL aún no se corre
  const [filtro, setFiltro] = useState<'activo' | 'suspendido' | 'baja'>('activo')
  const [q, setQ] = useState('')
  const [creando, setCreando] = useState(false)
  const [abierto, setAbierto] = useState<PRProfile | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('pr_profiles')
      .select('*').order('full_name')
    if (error) {
      // Sin pr_attribution.sql la tabla no existe: se explica, no se rompe
      if (/does not exist|relation/i.test(error.message)) { setFalta(true); setLoading(false); return }
      showToast(`No se pudo cargar la red: ${error.message}`, 'error')
    }
    setRows((data ?? []) as PRProfile[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter(r =>
      r.estatus === filtro &&
      (!term || r.full_name.toLowerCase().includes(term) || r.codigo.toLowerCase().includes(term)))
  }, [rows, filtro, q])

  const kpis = useMemo(() => ({
    activos: rows.filter(r => r.estatus === 'activo').length,
    embajadores: rows.filter(r => r.estatus === 'activo' && r.tier === 'embajador').length,
    sinFiscales: rows.filter(r => r.estatus === 'activo' && !r.datos_fiscales_ok).length,
  }), [rows])

  if (falta) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyStateV2 icon="🗄" title="Falta correr pr_attribution.sql"
          actionLabel="Reintentar" onAction={() => { setFalta(false); load() }} />
        <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)', maxWidth: 460, margin: '0 auto' }}>
          El módulo de atribución PR necesita sus tablas. Corre <code>supabase/seeds/pr_attribution.sql</code> en
          el SQL Editor de Supabase y vuelve a entrar.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={18} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0, flex: 1 }}>Red PR</h1>
          {esAdmin && (
            <button onClick={() => setCreando(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={15} /> Alta de PR
            </button>
          )}
        </div>

        {esAdmin && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <KPITile label="PRs activos" value={String(kpis.activos)} />
              <KPITile label="Embajadores" value={String(kpis.embajadores)} color="var(--status-healthy)" />
              <KPITile label="Sin datos fiscales" value={String(kpis.sinFiscales)}
                color={kpis.sinFiscales ? 'var(--status-attention)' : 'var(--text-primary)'}
                hint="No se les puede pagar hasta facturar" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <SegmentedControl
                options={[{ id: 'activo', label: 'Activos' }, { id: 'suspendido', label: 'Suspendidos' }, { id: 'baja', label: 'Bajas' }]}
                value={filtro} onChange={v => setFiltro(v as typeof filtro)} />
              <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre o código…"
                  style={{ width: '100%', minHeight: 40, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 999, padding: '0 12px 0 30px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <EmptyStateV2 icon="🎟" title={esAdmin ? 'Nadie en la red todavía' : 'Aún no tienes código PR'}
            actionLabel={esAdmin ? 'Dar de alta al primero' : undefined}
            onAction={esAdmin ? () => setCreando(true) : undefined} />
        ) : visibles.map(pr => (
          <button key={pr.id} onClick={() => setAbierto(pr)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 12, cursor: 'pointer', minHeight: 62 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{pr.full_name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 7px' }}>
                  {pr.codigo}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{PLAZA_LABEL[pr.plaza]}</span>
                {!pr.datos_fiscales_ok && pr.estatus === 'activo' && (
                  <span style={{ fontSize: 10.5, color: 'var(--status-attention)' }}>sin datos fiscales</span>
                )}
              </div>
            </div>
            <StatusBadgeV2 tone={TIER_META[pr.tier].tone} label={`${TIER_META[pr.tier].label} · ${TIER_META[pr.tier].tarifa}`} />
          </button>
        ))}
      </div>

      {creando && <AltaPRSheet isMobile={isMobile} userId={userId} onClose={() => setCreando(false)} onSaved={() => { setCreando(false); load() }} />}
      {abierto && <PRDetalleSheet pr={abierto} esAdmin={esAdmin} isMobile={isMobile}
        onClose={() => setAbierto(null)} onChanged={() => { setAbierto(null); load() }} />}
    </div>
  )
}

// ── Alta: el código nace aquí y ya nunca cambia ─────────────────────────────
function AltaPRSheet({ isMobile, userId, onClose, onSaved }: {
  isMobile: boolean; userId?: string; onClose: () => void; onSaved: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [plaza, setPlaza] = useState<Plaza>('mzt')
  const [codigo, setCodigo] = useState('')
  const [tocado, setTocado] = useState(false)     // ¿el usuario editó el código a mano?
  const [tel, setTel] = useState('')
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState<Tier>('aspirante')
  const [busy, setBusy] = useState(false)

  // Mientras no lo toquen a mano, el código sigue al nombre y a la plaza
  useEffect(() => { if (!tocado) setCodigo(sugerirCodigo(nombre, plaza)) }, [nombre, plaza, tocado])

  const codigoValido = CODIGO_OK.test(codigo)

  async function guardar() {
    if (!nombre.trim()) { showToast('Falta el nombre del PR.', 'error'); return }
    if (!codigoValido) { showToast('El código debe ser ALIAS-PLAZA, en mayúsculas (ej. SOFI-MZT).', 'error'); return }
    const e164 = tel.trim() ? normalizePhone(tel) : null
    if (tel.trim() && !e164) { showToast('El teléfono no parece válido — revísalo.', 'error'); return }
    setBusy(true)
    const { data, error } = await supabase.from('pr_profiles').insert({
      full_name: nombre.trim(), codigo, plaza, tier,
      phone: e164, email: email.trim() || null, created_by: userId ?? null,
    }).select('id, codigo').single()
    setBusy(false)
    if (error) {
      showToast(/duplicate|unique/i.test(error.message)
        ? `El código ${codigo} ya existe — los códigos nunca se reasignan.`
        : `No se pudo dar de alta: ${error.message}`, 'error')
      return
    }
    logActivity('pr_alta', 'pr_profile', data.id, { nombre: nombre.trim(), codigo: data.codigo, plaza, tier })
    showToast(`${nombre.trim()} dado de alta con el código ${data.codigo}.`, 'success')
    onSaved()
  }

  const inp: React.CSSProperties = { width: '100%', minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }
  const lb: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={460}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Alta de PR</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={lb}>Nombre completo *</label>
            <input value={nombre} autoFocus onChange={e => setNombre(e.target.value)} style={inp} /></div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lb}>Plaza</label>
              <select value={plaza} onChange={e => setPlaza(e.target.value as Plaza)} style={{ ...inp, cursor: 'pointer' }}>
                {(Object.keys(PLAZA_LABEL) as Plaza[]).map(p => <option key={p} value={p}>{PLAZA_LABEL[p]}</option>)}
              </select></div>
            <div><label style={lb}>Tier inicial</label>
              <select value={tier} onChange={e => setTier(e.target.value as Tier)} style={{ ...inp, cursor: 'pointer' }}>
                {(Object.keys(TIER_META) as Tier[]).map(t => <option key={t} value={t}>{TIER_META[t].label} · {TIER_META[t].tarifa}</option>)}
              </select></div>
          </div>

          <div>
            <label style={lb}>Código PR *</label>
            <input value={codigo} onChange={e => { setTocado(true); setCodigo(e.target.value.toUpperCase()) }}
              className="num" style={{ ...inp, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.04em', borderColor: codigo && !codigoValido ? 'var(--status-risk)' : 'var(--border-subtle)' }} />
            <p style={{ fontSize: 10.5, color: codigo && !codigoValido ? 'var(--status-risk)' : 'var(--text-tertiary)', margin: '5px 0 0', lineHeight: 1.5 }}>
              {codigo && !codigoValido
                ? 'Formato: ALIAS-PLAZA, mayúsculas, sin acentos (ej. SOFI-MZT).'
                : 'Se dicta por teléfono, así que va sin acentos ni ambigüedad. Es INMUTABLE: una vez creado no se puede cambiar, y si el PR se da de baja el código nunca se reasigna.'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lb}>Teléfono</label>
              <input value={tel} onChange={e => setTel(e.target.value)} inputMode="tel" placeholder="669 123 4567" className="num" style={{ ...inp, fontFamily: 'var(--font-mono)' }} /></div>
            <div><label style={lb}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} inputMode="email" style={inp} /></div>
          </div>
          <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
            El teléfono sirve para detectar auto-atribución: si el PR reserva a su propio número, el motor lo marca con factor 0 y bandera.
          </p>

          <button onClick={guardar} disabled={busy || !codigoValido || !nombre.trim()}
            style={{ width: '100%', minHeight: 50, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy || !codigoValido || !nombre.trim() ? 0.5 : 1 }}>
            {busy ? 'Dando de alta…' : 'Dar de alta y generar su código'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// ── Detalle: el link, el QR y la administración del PR ──────────────────────
function PRDetalleSheet({ pr, esAdmin, isMobile, onClose, onChanged }: {
  pr: PRProfile; esAdmin: boolean; isMobile: boolean; onClose: () => void; onChanged: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [tier, setTier] = useState<Tier>(pr.tier)
  const [busy, setBusy] = useState(false)
  // El link del PR vive en /p/ — /r/ ya es de los venues y /w/ de wellness
  const link = `${window.location.origin}/p/${pr.codigo}`

  useEffect(() => {
    QRCode.toDataURL(link, { width: 1024, margin: 2, errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#FFFFFF' } })
      .then(setQr).catch(() => setQr(null))
  }, [link])

  function copiar() {
    navigator.clipboard.writeText(link)
    showToast('Link copiado — ya se puede repartir.', 'success')
  }
  function descargar() {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr; a.download = `QR-${pr.codigo}.png`; a.click()
  }

  async function guardarTier() {
    if (tier === pr.tier) return
    setBusy(true)
    const { error } = await supabase.from('pr_profiles')
      .update({ tier, tier_desde: new Date().toISOString().slice(0, 10) }).eq('id', pr.id)
    setBusy(false)
    if (error) { showToast(`No se pudo: ${error.message}`, 'error'); return }
    logActivity('pr_tier', 'pr_profile', pr.id, { codigo: pr.codigo, antes: pr.tier, ahora: tier })
    showToast(`${pr.full_name} pasó a ${TIER_META[tier].label}.`, 'success')
    onChanged()
  }

  async function cambiarEstatus(nuevo: Estatus) {
    const verbo = nuevo === 'baja' ? 'dar de baja' : nuevo === 'suspendido' ? 'suspender' : 'reactivar'
    if (!window.confirm(`¿${verbo[0].toUpperCase()}${verbo.slice(1)} a ${pr.full_name}?${nuevo === 'baja' ? ' Su código nunca se reasignará.' : ''}`)) return
    setBusy(true)
    const { error } = await supabase.from('pr_profiles').update({
      estatus: nuevo, ...(nuevo === 'baja' ? { fecha_baja: new Date().toISOString().slice(0, 10) } : {}),
    }).eq('id', pr.id)
    setBusy(false)
    if (error) { showToast(`No se pudo: ${error.message}`, 'error'); return }
    logActivity('pr_estatus', 'pr_profile', pr.id, { codigo: pr.codigo, estatus: nuevo })
    showToast(`${pr.full_name}: ${nuevo}.`, 'success')
    onChanged()
  }

  const lb: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
  const bloqueo = pr.restricciones?.['bloqueo_finde_hasta'] as string | undefined

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={460}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>{pr.full_name}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bloqueo && new Date(bloqueo) >= new Date() && (
            <div style={{ background: 'color-mix(in srgb, var(--status-attention) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-attention) 30%, transparent)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 12, color: 'var(--status-attention)', fontWeight: 600 }}>
              Viernes y sábado bloqueados por show rate bajo, hasta el {new Date(bloqueo + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}.
            </div>
          )}

          {/* El código, el link y el QR — lo que el PR viene a buscar */}
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 14, textAlign: 'center' }}>
            <label style={{ ...lb, textAlign: 'left' }}>Su código</label>
            <div className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 10 }}>
              {pr.codigo}
            </div>
            {qr && (
              <img src={qr} alt={`QR de ${pr.codigo}`} width={168} height={168}
                style={{ borderRadius: 10, background: '#fff', padding: 6, display: 'block', margin: '0 auto 10px' }} />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={copiar}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                <Link2 size={14} /> Copiar link
              </button>
              <button onClick={descargar} disabled={!qr}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                <Download size={14} /> Descargar QR
              </button>
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '8px 0 0', lineHeight: 1.5 }}>
              Quien abra este link o escanee el QR lleva el código pre-aplicado por 30 días. Si después toca el link de otro PR, la reserva se atribuye al último — así que conviene repartirlo cerca de la decisión.
            </p>
          </div>

          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><span style={lb}>Plaza</span><span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{PLAZA_LABEL[pr.plaza]}</span></div>
            <div><span style={lb}>En la red desde</span><span className="num" style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{new Date(pr.fecha_alta + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
            {pr.phone && <div><span style={lb}>Teléfono</span><span className="num" style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatPhone(pr.phone)}</span></div>}
            <div><span style={lb}>Datos fiscales</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: pr.datos_fiscales_ok ? 'var(--status-healthy)' : 'var(--status-attention)' }}>
                {pr.datos_fiscales_ok ? 'Completos' : 'Pendientes'}
              </span></div>
          </div>

          {esAdmin && pr.estatus !== 'baja' && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
              <label style={lb}>Tier — define su tarifa base</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={tier} onChange={e => setTier(e.target.value as Tier)}
                  style={{ flex: 1, minHeight: 44, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}>
                  {(Object.keys(TIER_META) as Tier[]).map(t => <option key={t} value={t}>{TIER_META[t].label} · {TIER_META[t].tarifa}</option>)}
                </select>
                {tier !== pr.tier && (
                  <button onClick={guardarTier} disabled={busy}
                    style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Guardar
                  </button>
                )}
              </div>
              <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '6px 0 0' }}>
                Cambiar el tier NO recalcula comisiones ya devengadas: cada una guardó su propia tarifa.
              </p>
            </div>
          )}

          {esAdmin && (
            <div style={{ display: 'flex', gap: 8 }}>
              {pr.estatus === 'activo' && (
                <button onClick={() => cambiarEstatus('suspendido')} disabled={busy}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 999, border: '1px solid color-mix(in srgb, var(--status-attention) 35%, transparent)', background: 'none', color: 'var(--status-attention)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  <Ban size={14} /> Suspender
                </button>
              )}
              {pr.estatus !== 'activo' && (
                <button onClick={() => cambiarEstatus('activo')} disabled={busy}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  <RotateCcw size={14} /> Reactivar
                </button>
              )}
              {pr.estatus !== 'baja' && (
                <button onClick={() => cambiarEstatus('baja')} disabled={busy}
                  style={{ flex: 1, minHeight: 44, borderRadius: 999, border: '1px solid color-mix(in srgb, var(--status-risk) 30%, transparent)', background: 'none', color: 'var(--status-risk)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  Dar de baja
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
