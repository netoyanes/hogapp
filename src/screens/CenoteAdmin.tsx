import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2, MessageCircle, Check, X, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SegmentedControl, StatusBadgeV2, KPITile, showToast, type StatusTone } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// CENOTE (admin) — el otro lado del portal /cenote
//
// Lo que el equipo hace aquí es exactamente el proceso del 1-pager:
//   · Facilitadores: llega la solicitud → recorrido → "Dar acceso" genera su
//     código y el mensaje de WhatsApp con el link → él elige plan y bloque en
//     el portal → aquí se marca activo cuando hay contrato y depósito.
//   · Spa: cada compra nace pendiente de pago. Se marca pagada con el medio
//     (todo entra a cuenta HOG) o se cancela, y el turno se libera.
// Arriba, la meta de noviembre del 1-pager contra lo real del mes.
// ─────────────────────────────────────────────────────────────────────────────

interface Facilitador {
  id: string; nombre: string; telefono: string; correo: string | null; disciplina: string | null
  alumnos: number | null; donde_hoy: string | null; plan_interes: string | null; horario_pref: string | null
  status: string; codigo: string | null; bloque: string | null; plan_code: string | null
  deposito: number | null; primer_mes: number | null; created_at: string
}
interface Pedido {
  id: string; folio: string; producto_code: string; producto: string; nombre: string; telefono: string
  fecha: string | null; turno: string | null; codigo: string | null; tipo_desc: string | null; habitacion: string | null
  total: number; descuento: number; status: string; paid_via: string | null; created_at: string
}

const STATUS_FAC: Record<string, { label: string; tone: StatusTone }> = {
  solicitud:   { label: 'Solicitud', tone: 'attention' },
  acceso:      { label: 'Con acceso', tone: 'accent' },
  contratando: { label: 'Por cobrar', tone: 'attention' },
  activo:      { label: 'Activo', tone: 'healthy' },
  descartado:  { label: 'Descartado', tone: 'neutral' },
}
const STATUS_PED: Record<string, { label: string; tone: StatusTone }> = {
  pendiente_pago: { label: 'Pendiente', tone: 'attention' },
  pagado:         { label: 'Pagado', tone: 'healthy' },
  cancelado:      { label: 'Cancelado', tone: 'neutral' },
}
/** Meta del 1-pager "Nueva forma de operar". */
const META = { nov: { fac: 8, circ: 60, mas: 30, rec: 3 }, dic: { fac: 12, circ: 100, mas: 55, rec: 6 }, ene: { fac: 16, circ: 140, mas: 80, rec: 10 } }
const CIRCUITOS = new Set(['circuito', 'pareja', 'reset', 'reset_deep', 'reset_pareja', 'dia_cenote', 'privado'])
const MASAJES = new Set(['relajante', 'descontracturante', 'masaje90', 'reset', 'reset_deep', 'reset_pareja', 'dia_cenote'])

const mxn = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const codigoDe = (nombre: string) => sinAcentos(nombre.trim().split(/\s+/)[0] ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)
const wa = (tel: string, texto: string) => `https://wa.me/52${tel.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(texto)}`

function mensajeAcceso(f: Facilitador, codigo: string) {
  const link = `${window.location.origin}/cenote?acceso=${codigo}`
  return `Hola ${f.nombre.split(' ')[0]}, qué gusto que te haya gustado Cenote. Tu código de acceso es ${codigo}. ` +
    `Entra aquí, elige tu membresía y confirma tu bloque${f.bloque ? ` (${f.bloque})` : ''}: ${link}\n` +
    `Te lo aparto 48 horas. El depósito y el primer mes van a la cuenta de HOG que te mando en cuanto confirmes.`
}

export function CenoteAdmin({ canWrite }: { canWrite: boolean }) {
  const [vista, setVista] = useState('spa')
  const [facs, setFacs] = useState<Facilitador[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: f, error }, { data: p }] = await Promise.all([
      supabase.from('cenote_facilitadores').select('*').order('created_at', { ascending: false }),
      supabase.from('cenote_pedidos').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    if (error) { setMissing(true); setLoading(false); return }
    setFacs((f ?? []) as Facilitador[]); setPedidos((p ?? []) as Pedido[]); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const kpi = useMemo(() => {
    const hoy = new Date()
    const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
    const delMes = pedidos.filter(p => p.status === 'pagado' && (p.fecha ?? p.created_at).startsWith(mes))
    const meta = hoy.getMonth() === 10 ? META.nov : hoy.getMonth() === 11 ? META.dic : META.ene
    return {
      meta,
      activos: facs.filter(f => f.status === 'activo').length,
      nuevas: facs.filter(f => f.status === 'solicitud').length,
      circuitos: delMes.filter(p => CIRCUITOS.has(p.producto_code)).length,
      masajes: delMes.filter(p => MASAJES.has(p.producto_code)).length,
      recovery: pedidos.filter(p => p.status === 'pagado' && p.producto_code.startsWith('recovery')).length,
      ingresoSpa: delMes.reduce((s, p) => s + Number(p.total), 0),
      pendientes: pedidos.filter(p => p.status === 'pendiente_pago').length,
    }
  }, [facs, pedidos])

  if (missing) return <p style={{ fontSize: 13, color: 'var(--status-attention)' }}>Falta correr cenote_portal.sql en Supabase.</p>
  if (loading) return <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Cargando…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <a href={`${window.location.origin}/cenote`} target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none', border: '1px solid var(--accent-border)', borderRadius: 999, padding: '6px 12px', fontWeight: 700 }}>
          <Link2 size={12} /> Abrir portal Cenote
        </a>
        <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/cenote`); showToast('Link copiado', 'success') }}
          style={{ fontSize: 11.5, color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}>
          Copiar link
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        <KPITile label="Facilitadores" value={`${kpi.activos} / ${kpi.meta.fac}`} hint="Activos contra la meta del mes" />
        <KPITile label="Circuitos mes" value={`${kpi.circuitos} / ${kpi.meta.circ}`} />
        <KPITile label="Masajes mes" value={`${kpi.masajes} / ${kpi.meta.mas}`} />
        <KPITile label="Recovery" value={`${kpi.recovery} / ${kpi.meta.rec}`} />
        <KPITile label="Spa cobrado mes" value={mxn(kpi.ingresoSpa)} color="var(--status-healthy)" />
      </div>

      <SegmentedControl value={vista} onChange={setVista} options={[
        { id: 'spa', label: `Spa${kpi.pendientes ? ` · ${kpi.pendientes} por cobrar` : ''}` },
        { id: 'facilitadores', label: `Facilitadores${kpi.nuevas ? ` · ${kpi.nuevas} nuevas` : ''}` },
      ]} />

      {vista === 'facilitadores' && (
        facs.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Aún no hay solicitudes. Comparte el link del portal con los facilitadores.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {facs.map(f => <FilaFacilitador key={f.id} f={f} canWrite={canWrite} onChange={load} />)}
            </div>
      )}
      {vista === 'spa' && (
        pedidos.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Aún no hay compras del spa.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pedidos.map(p => <FilaPedido key={p.id} p={p} canWrite={canWrite} onChange={load} />)}
            </div>
      )}
    </div>
  )
}

const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px' } as const
const accion = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '6px 12px', cursor: 'pointer', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', textDecoration: 'none' } as const
const input = { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)' } as const

function FilaFacilitador({ f, canWrite, onChange }: { f: Facilitador; canWrite: boolean; onChange: () => void }) {
  const [abrir, setAbrir] = useState(false)
  const [codigo, setCodigo] = useState(() => codigoDe(f.nombre))
  const [bloque, setBloque] = useState(f.horario_pref ?? '')
  const st = STATUS_FAC[f.status] ?? STATUS_FAC.solicitud

  const darAcceso = async () => {
    const c = codigo.trim().toUpperCase()
    if (c.length < 3) return showToast('El código necesita al menos 3 letras', 'error')
    const { error } = await supabase.from('cenote_facilitadores')
      .update({ codigo: c, bloque: bloque.trim() || null, status: 'acceso', acceso_at: new Date().toISOString() }).eq('id', f.id)
    if (error) return showToast(error.code === '23505' ? 'Ese código ya lo tiene otro facilitador' : error.message, 'error')
    window.open(wa(f.telefono, mensajeAcceso({ ...f, bloque: bloque.trim() || null }, c)), '_blank')
    setAbrir(false); onChange()
  }
  const cambiar = async (status: string, extra: Record<string, unknown> = {}) => {
    const { error } = await supabase.from('cenote_facilitadores').update({ status, ...extra }).eq('id', f.id)
    if (error) return showToast(error.message, 'error')
    onChange()
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{f.nombre}</strong>
            <StatusBadgeV2 tone={st.tone} label={st.label} />
            {f.codigo && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--accent)' }}>{f.codigo}</span>}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {[f.disciplina, f.alumnos != null ? `${f.alumnos} alumnos` : null, f.donde_hoy, (f.plan_code ?? f.plan_interes)?.toUpperCase(), f.bloque ?? f.horario_pref].filter(Boolean).join(' · ')}
          </p>
          {f.status === 'contratando' && f.deposito != null && (
            <p style={{ fontSize: 12.5, color: 'var(--status-attention)', margin: '4px 0 0', fontWeight: 600 }}>
              Por cobrar: depósito {mxn(f.deposito)} + primer mes {mxn(f.primer_mes ?? 0)} = {mxn(f.deposito + (f.primer_mes ?? 0))}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <a href={wa(f.telefono, `Hola ${f.nombre.split(' ')[0]}, soy de Cenote.`)} target="_blank" rel="noreferrer" style={accion}><MessageCircle size={13} /> WhatsApp</a>
          {canWrite && f.status === 'solicitud' && <button style={accion} onClick={() => setAbrir(a => !a)}><KeyRound size={13} /> Dar acceso</button>}
          {canWrite && f.status === 'acceso' && f.codigo && (
            <a href={wa(f.telefono, mensajeAcceso(f, f.codigo))} target="_blank" rel="noreferrer" style={accion}><KeyRound size={13} /> Reenviar código</a>
          )}
          {canWrite && f.status === 'contratando' && (
            <button style={{ ...accion, borderColor: 'var(--status-healthy)', color: 'var(--status-healthy)' }}
              onClick={() => { if (confirm(`¿${f.nombre} ya firmó y depositó? Su bloque queda activo.`)) cambiar('activo', { activo_at: new Date().toISOString() }) }}>
              <Check size={13} /> Contrato y depósito
            </button>
          )}
          {canWrite && ['solicitud', 'acceso'].includes(f.status) && (
            <button style={accion} onClick={() => { if (confirm(`¿Descartar a ${f.nombre}?`)) cambiar('descartado') }}><X size={13} /></button>
          )}
        </div>
      </div>
      {abrir && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Código (también para sus alumnos)
            <input style={{ ...input, display: 'block', marginTop: 4, width: 130, fontFamily: 'var(--font-mono)' }} value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Bloque apartado (día y hora)
            <input style={{ ...input, display: 'block', marginTop: 4, width: 170 }} value={bloque} onChange={e => setBloque(e.target.value)} placeholder="Martes 19:00" />
          </label>
          <button style={{ ...accion, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} onClick={darAcceso}>Dar acceso y mandar WhatsApp</button>
        </div>
      )}
    </div>
  )
}

function FilaPedido({ p, canWrite, onChange }: { p: Pedido; canWrite: boolean; onChange: () => void }) {
  const [via, setVia] = useState('transferencia')
  const st = STATUS_PED[p.status] ?? STATUS_PED.pendiente_pago
  const actualizar = async (cambios: Record<string, unknown>) => {
    const { error } = await supabase.from('cenote_pedidos').update(cambios).eq('id', p.id)
    if (error) return showToast(error.message, 'error')
    onChange()
  }
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{p.folio}</span>
          <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{p.producto}</strong>
          <StatusBadgeV2 tone={st.tone} label={st.label} />
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          {[p.nombre, p.fecha ? `${p.fecha} ${p.turno ?? ''}` : null,
            p.tipo_desc === 'flow' ? `Flow${p.habitacion ? ` hab. ${p.habitacion}` : ''}` : p.tipo_desc === 'alumno' ? `alumno ${p.codigo}` : null,
            p.paid_via].filter(Boolean).join(' · ')}
        </p>
      </div>
      <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>{mxn(p.total)}</strong>
      <a href={wa(p.telefono, `Hola ${p.nombre.split(' ')[0]}, te escribimos de Cenote por tu folio ${p.folio} (${p.producto}, ${mxn(p.total)}).`)}
        target="_blank" rel="noreferrer" style={accion}><MessageCircle size={13} /></a>
      {canWrite && p.status === 'pendiente_pago' && (
        <>
          <select style={input} value={via} onChange={e => setVia(e.target.value)}>
            <option value="transferencia">Transferencia</option>
            <option value="terminal">Terminal</option>
            <option value="link">Link de pago</option>
            <option value="efectivo">Efectivo (con recibo)</option>
          </select>
          <button style={{ ...accion, borderColor: 'var(--status-healthy)', color: 'var(--status-healthy)' }}
            onClick={() => actualizar({ status: 'pagado', paid_via: via, paid_at: new Date().toISOString() })}><Check size={13} /> Pagado</button>
          <button style={accion} onClick={() => { if (confirm(`¿Cancelar ${p.folio}? El turno se libera.`)) actualizar({ status: 'cancelado' }) }}><X size={13} /></button>
        </>
      )}
    </div>
  )
}
