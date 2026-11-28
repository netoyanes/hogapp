import { useCallback, useEffect, useState } from 'react'
import { Copy, ExternalLink, Link2, MessageCircle, RefreshCw, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SegmentedControl, StatusBadgeV2, showToast } from '../components/v2'
import { ReporteVista } from '../concha/reporte/ReporteVista'
import { periodoTexto, type DatosReporte } from '../concha/reporte/datos'
import { fechaLocal, sumarDias } from '../concha/logic'

// ─────────────────────────────────────────────────────────────────────────────
// DOÑA CONCHA · Reportes — genera un link único al reporte de ventas para
// compartirlo con un director. Se elige el periodo (cuántos días) y cuánto
// tiempo vale el link; quien lo abre ve el reporte sin cuenta y lo descarga en
// PDF. Los links se pueden revocar.
//
// Acceso: MASTER o C_LEVEL (fn_concha_admin lo vuelve a verificar en la base).
// ─────────────────────────────────────────────────────────────────────────────

interface Link {
  id: string; token: string; titulo: string; desde: string; hasta: string
  expira_en: string; revocado: boolean; creado_en: string; vistas: number; ultima_vista: string | null
}

const PERIODOS = [
  { id: '7', label: '7 días' }, { id: '14', label: '14 días' }, { id: '30', label: '30 días' },
  { id: '90', label: '90 días' }, { id: 'otro', label: 'Otro' },
]
const VIGENCIAS = [
  { id: '24', label: '24 horas' }, { id: '72', label: '3 días' }, { id: '168', label: '7 días' }, { id: '720', label: '30 días' },
]

const urlDe = (token: string) => `${window.location.origin}/reporte/${token}`
const fechaHora = (s: string) => new Date(s).toLocaleString('es-MX', { timeZone: 'America/Mazatlan', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const card: React.CSSProperties = { background: 'var(--bg-surface)', borderRadius: 'var(--radius-md, 12px)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }
const input: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 14 }
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }
const btnMain: React.CSSProperties = { ...btn, background: 'var(--accent)', borderColor: 'var(--accent)', color: '#0A0A0A', fontWeight: 600 }

export function ConchaReportes() {
  const hoy = fechaLocal()
  const [periodo, setPeriodo] = useState('30')
  const [hasta, setHasta] = useState(hoy)
  const [desdeOtro, setDesdeOtro] = useState(sumarDias(hoy, -29))
  const [vigencia, setVigencia] = useState('72')
  const [titulo, setTitulo] = useState('')
  const [links, setLinks] = useState<Link[]>([])
  const [nuevo, setNuevo] = useState<Link | null>(null)
  const [vista, setVista] = useState<DatosReporte | null>(null)
  const [cargando, setCargando] = useState(false)
  const [diasHistorial, setDiasHistorial] = useState<number | null>(null)
  const [ahora, setAhora] = useState(0)

  const desde = periodo === 'otro' ? desdeOtro : sumarDias(hasta, -(Number(periodo) - 1))
  const valido = !!desde && !!hasta && desde <= hasta

  const cargarLinks = useCallback(async () => {
    const [l, h] = await Promise.all([
      supabase.from('concha_reportes').select('*').order('creado_en', { ascending: false }).limit(50),
      supabase.from('concha_historial_dia').select('fecha', { count: 'exact', head: true }),
    ])
    if (l.error) showToast('No se pudieron cargar los links', 'error')
    setLinks((l.data ?? []) as Link[])
    setDiasHistorial(h.count ?? 0)
    setAhora(Date.now())
  }, [])

  useEffect(() => { const t = setTimeout(cargarLinks, 0); return () => clearTimeout(t) }, [cargarLinks])

  // Vista previa del periodo elegido
  useEffect(() => {
    if (!valido) return
    let vivo = true
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('concha_reporte_vista_previa', { p_desde: desde, p_hasta: hasta })
      if (!vivo) return
      if (error) showToast('No se pudo cargar la vista previa', 'error')
      else setVista(data as DatosReporte)
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [desde, hasta, valido])

  async function generar() {
    if (!valido) return
    setCargando(true)
    const { data, error } = await supabase.rpc('concha_crear_reporte', { p_desde: desde, p_hasta: hasta, p_horas: Number(vigencia), p_titulo: titulo || null })
    setCargando(false)
    if (error) { showToast(error.message, 'error'); return }
    setNuevo(data as Link)
    cargarLinks()
  }

  async function copiar(token: string) {
    try { await navigator.clipboard.writeText(urlDe(token)); showToast('Link copiado', 'success') }
    catch { showToast('No se pudo copiar; mantén presionado el link', 'error') }
  }

  function whatsapp(l: Link) {
    const txt = `${l.titulo} · ${periodoTexto(l.desde, l.hasta)}\n${urlDe(l.token)}\n(El link vence el ${fechaHora(l.expira_en)})`
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank', 'noopener')
  }

  async function revocar(l: Link) {
    if (!confirm(`¿Revocar el link «${l.titulo}»? Quien lo tenga ya no podrá abrirlo.`)) return
    const { error } = await supabase.from('concha_reportes').update({ revocado: true }).eq('id', l.id)
    if (error) showToast('No se pudo revocar', 'error')
    else { showToast('Link revocado', 'success'); if (nuevo?.id === l.id) setNuevo(null); cargarLinks() }
  }

  const estado = (l: Link) => l.revocado ? { tone: 'risk' as const, t: 'Revocado' }
    : new Date(l.expira_en).getTime() < ahora ? { tone: 'neutral' as const, t: 'Vencido' }
    : { tone: 'healthy' as const, t: `Vence ${fechaHora(l.expira_en)}` }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Doña Concha · Reportes</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-secondary)' }}>
          Genera un link al reporte de ventas para compartirlo. Quien lo abra lo ve sin cuenta y lo puede descargar en PDF, hasta que venza.
        </p>
      </div>

      <div style={card}>
        <span style={label}>Periodo</span>
        <SegmentedControl options={PERIODOS} value={periodo} onChange={setPeriodo} scrollable />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {periodo === 'otro' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
              Desde <input type="date" style={input} value={desdeOtro} max={hasta} onChange={e => setDesdeOtro(e.target.value)} />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            {periodo === 'otro' ? 'Hasta' : 'Termina el'} <input type="date" style={input} value={hasta} max={hoy} onChange={e => setHasta(e.target.value)} />
          </label>
          <span style={{ fontSize: 14, color: 'var(--text-primary)', paddingBottom: 9 }}>{valido ? periodoTexto(desde, hasta) : 'Periodo inválido'}</span>
        </div>

        <span style={label}>El link vale por</span>
        <SegmentedControl options={VIGENCIAS} value={vigencia} onChange={setVigencia} scrollable />

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
          Título (opcional)
          <input style={input} placeholder="Reporte de ventas · Doña Concha" value={titulo} maxLength={80} onChange={e => setTitulo(e.target.value)} />
        </label>

        <div>
          <button type="button" style={btnMain} onClick={generar} disabled={!valido || cargando}>
            <Link2 size={15} /> {cargando ? 'Generando…' : 'Generar link'}
          </button>
        </div>

        {nuevo && (
          <div style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Link listo · vence el {fechaHora(nuevo.expira_en)}</span>
            <code style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{urlDe(nuevo.token)}</code>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={btn} onClick={() => copiar(nuevo.token)}><Copy size={14} /> Copiar</button>
              <button type="button" style={btn} onClick={() => whatsapp(nuevo)}><MessageCircle size={14} /> WhatsApp</button>
              <a style={{ ...btn, textDecoration: 'none' }} href={urlDe(nuevo.token)} target="_blank" rel="noopener"><ExternalLink size={14} /> Abrir</a>
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={label}>Links generados</span>
          <button type="button" style={btn} onClick={cargarLinks} title="Actualizar"><RefreshCw size={14} /></button>
        </div>
        {links.length === 0 ? <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Todavía no hay links.</span> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {links.map(l => {
              const e = estado(l)
              const vigente = e.tone === 'healthy'
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{l.titulo}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{periodoTexto(l.desde, l.hasta)} · {l.vistas} {l.vistas === 1 ? 'vista' : 'vistas'}{l.ultima_vista ? ` · última ${fechaHora(l.ultima_vista)}` : ''}</div>
                  </div>
                  <StatusBadgeV2 tone={e.tone} label={e.t} />
                  {vigente && <>
                    <button type="button" style={btn} onClick={() => copiar(l.token)} title="Copiar link"><Copy size={14} /></button>
                    <button type="button" style={btn} onClick={() => whatsapp(l)} title="Compartir por WhatsApp"><MessageCircle size={14} /></button>
                    <button type="button" style={btn} onClick={() => revocar(l)} title="Revocar"><XCircle size={14} /> Revocar</button>
                  </>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={card}>
        <span style={label}>Historial de ventas</span>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          {diasHistorial == null ? '…' : diasHistorial === 0
            ? 'Todavía no hay historial cargado. Las ventas anteriores a la caja se suman al reporte en cuanto se carguen.'
            : `${diasHistorial} días de historial cargados. El reporte los junta con lo que registra la caja.`}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={label}>Vista previa · así lo verá el director</span>
        <div style={{ borderRadius: 16, overflow: 'hidden' }}>
          {vista && valido
            ? <ReporteVista datos={vista} titulo={titulo || 'Reporte de ventas · Doña Concha'} desde={desde} hasta={hasta} />
            : <div style={{ ...card, color: 'var(--text-secondary)', fontSize: 14 }}>Cargando…</div>}
        </div>
      </div>
    </div>
  )
}
