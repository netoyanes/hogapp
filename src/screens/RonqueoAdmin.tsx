import { useCallback, useEffect, useMemo, useState } from 'react'
import { Fish, ExternalLink, Copy, RefreshCw, Mail, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { KPITile, SegmentedControl, StatusBadgeV2, EmptyStateV2, showToast } from '../components/v2'

// ─────────────────────────────────────────────────────────────────────────────
// RONQUEO · el lado interno de la venta de boletos de Bruma Records
//
// Solo lectura: quién compró, cuántos lugares, su código RONQUEO-XX y si le
// llegó el correo. Las órdenes las escribe la edge function ronqueo-tickets
// (Stripe Checkout + webhook); aquí nadie las edita. La única acción es
// reenviar el correo de confirmación.
//
// Acceso: MASTER, DEV o la app 'ronqueo' asignada; la policy
// (fn_ronqueo_staff) lo vuelve a verificar en la base.
// ─────────────────────────────────────────────────────────────────────────────

interface Orden {
  id: string; created_at: string; status: 'pending' | 'paid' | 'expired'
  nombre: string; correo: string; whatsapp: string; cantidad: number; monto_centavos: number
  expires_at: string; paid_at: string | null; codigo: string | null; codigo_num: number | null
  stripe_session_id: string | null; stripe_payment_intent: string | null
  email_sent_at: string | null; email_error: string | null
}
interface Config { cupo: number; max_por_compra: number; precio_centavos: number; venta_abierta: boolean }

const pesos = (centavos: number) => '$' + Math.round(centavos / 100).toLocaleString('es-MX')
const fecha = (s: string) => new Date(s).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mazatlan' })

type Filtro = 'pagadas' | 'apartadas' | 'todas'

export function RonqueoAdmin() {
  const [ordenes, setOrdenes] = useState<Orden[] | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('pagadas')
  const [cargando, setCargando] = useState(false)
  const [ahora, setAhora] = useState(0)

  const cargar = useCallback(async () => {
    const [o, c] = await Promise.all([
      supabase.from('ronqueo_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('ronqueo_config').select('*').maybeSingle(),
    ])
    if (o.error) showToast('No se pudieron cargar las órdenes', 'error')
    setOrdenes((o.data ?? []) as Orden[])
    setConfig(c.data as Config | null)
    setAhora(Date.now())
    setCargando(false)
  }, [])

  useEffect(() => {
    const t0 = setTimeout(cargar, 0)
    const t = setInterval(cargar, 30_000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [cargar])

  const pagadas = useMemo(() => (ordenes ?? []).filter(o => o.status === 'paid').sort((a, b) => (a.codigo_num ?? 0) - (b.codigo_num ?? 0)), [ordenes])
  const apartadas = useMemo(() => (ordenes ?? []).filter(o => o.status === 'pending' && new Date(o.expires_at).getTime() > ahora), [ordenes, ahora])
  const vendidos = pagadas.reduce((s, o) => s + o.cantidad, 0)
  const reservados = apartadas.reduce((s, o) => s + o.cantidad, 0)
  const ingreso = pagadas.reduce((s, o) => s + o.monto_centavos, 0)
  const cupo = config?.cupo ?? 50
  const lista = filtro === 'pagadas' ? pagadas : filtro === 'apartadas' ? apartadas : (ordenes ?? [])
  const sinCorreo = pagadas.filter(o => !o.email_sent_at).length

  async function reenviar(o: Orden) {
    const { data, error } = await supabase.functions.invoke('ronqueo-tickets', { body: { action: 'reenviar', orden: o.id } })
    if (error || !data?.ok) showToast(`No se envió: ${data?.error ?? error?.message ?? 'error'}`, 'error')
    else showToast(`Correo reenviado a ${o.correo}`, 'success')
    cargar()
  }

  function exportarCsv() {
    const filas = [['codigo', 'nombre', 'lugares', 'total_mxn', 'correo', 'whatsapp', 'pagado'],
      ...pagadas.map(o => [o.codigo ?? '', o.nombre, String(o.cantidad), String(o.monto_centavos / 100), o.correo, o.whatsapp, o.paid_at ? fecha(o.paid_at) : ''])]
    const csv = filas.map(f => f.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'ronqueo-lista.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const link = `${location.origin}/ronqueo`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, padding: '14px 20px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Fish size={17} style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 17, margin: 0 }}>Ronqueo · Bruma Records</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: '2px 0 0' }}>All you can eat · edición ronqueo — vie 20 nov. Venta con Stripe; cada compra queda aquí con su código.</p>
        </div>
        <button className="btn-ghost" onClick={() => { navigator.clipboard.writeText(link); showToast('Link copiado', 'success') }} style={btn}><Copy size={14} /> Copiar link</button>
        <a href="/ronqueo" target="_blank" rel="noreferrer" style={btn}><ExternalLink size={14} /> Abrir landing</a>
        <button onClick={exportarCsv} style={btn} disabled={!pagadas.length}><Download size={14} /> Lista CSV</button>
        <button onClick={() => { setCargando(true); cargar() }} style={btn} aria-label="Actualizar"><RefreshCw size={14} className={cargando ? 'spin' : undefined} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 32px' }}>
        <EmbudoLanding />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
          <KPITile label="Lugares vendidos" value={`${vendidos} / ${cupo}`} />
          <KPITile label="Apartados (pagando)" value={String(reservados)} hint="Vencen a los 31 min" />
          <KPITile label="Disponibles" value={String(Math.max(0, cupo - vendidos - reservados))} color={cupo - vendidos - reservados <= 5 ? 'var(--status-attention)' : undefined} />
          <KPITile label="Ingreso" value={`${pesos(ingreso)} MXN`} />
          <KPITile label="Compras" value={String(pagadas.length)} hint={sinCorreo ? `${sinCorreo} sin correo` : 'Todos con correo'} color={sinCorreo ? 'var(--status-risk)' : undefined} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <SegmentedControl
            options={[{ id: 'pagadas', label: `Pagadas (${pagadas.length})` }, { id: 'apartadas', label: `Apartadas (${apartadas.length})` }, { id: 'todas', label: 'Todas' }]}
            value={filtro} onChange={v => setFiltro(v as Filtro)}
          />
        </div>

        {ordenes === null ? null : lista.length === 0 ? (
          <EmptyStateV2 icon={<Fish size={22} />} title={filtro === 'pagadas' ? 'Todavía no hay compras' : 'Nada por aquí'} />
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--text-primary)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', textAlign: 'left' }}>
                  {['Código', 'Nombre', 'Lugares', 'Total', 'Correo', 'WhatsApp', 'Estado', 'Fecha', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(o => {
                  const vencida = o.status === 'expired' || (o.status === 'pending' && new Date(o.expires_at).getTime() <= ahora)
                  return (
                    <tr key={o.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{o.codigo ?? '—'}</td>
                      <td style={td}>{o.nombre}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{o.cantidad}</td>
                      <td style={td}>{pesos(o.monto_centavos)}</td>
                      <td style={td}><a href={`mailto:${o.correo}`} style={{ color: 'inherit' }}>{o.correo}</a></td>
                      <td style={td}><a href={`https://wa.me/${o.whatsapp.replace(/\D/g, '').replace(/^(\d{10})$/, '52$1')}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{o.whatsapp}</a></td>
                      <td style={td}>
                        {o.status === 'paid'
                          ? <StatusBadgeV2 tone={o.email_sent_at ? 'healthy' : 'risk'} label={o.email_sent_at ? 'Pagado' : 'Pagado · sin correo'} />
                          : vencida ? <StatusBadgeV2 tone="neutral" label="Vencida" /> : <StatusBadgeV2 tone="attention" label="Pagando" />}
                        {o.status === 'paid' && o.email_error && <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 4, maxWidth: 220 }}>{o.email_error}</div>}
                      </td>
                      <td style={{ ...td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fecha(o.paid_at ?? o.created_at)}</td>
                      <td style={td}>
                        {o.status === 'paid' && (
                          <button onClick={() => reenviar(o)} style={{ ...btn, padding: '6px 10px' }} title="Reenviar correo con el código"><Mail size={13} /> Reenviar</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Estadísticas del landing: hasta dónde llega la gente ────────────────────
type Embudo = {
  visitas: number; visitantes: number; boleto_visto: number; cta_clics: number; cta_personas: number
  pagar_clics: number; pagar_personas: number; checkouts: number; pagadas: number; lugares_pagados: number
  cta_por_lugar: Record<string, number>; visitas_por_idioma: Record<string, number>
  visitas_por_dispositivo: Record<string, number>; visitas_por_origen: Record<string, number>
  por_dia: { dia: string; visitantes: number; cta: number; pagar: number }[]
}
const LUGAR_CTA: Record<string, string> = {
  hero: 'Botón del inicio', nav: 'Botón de la barra (escritorio)', 'nav-link': 'Link «boleto» del menú',
  menu: 'Menú móvil', barra: 'Barra fija (móvil)', cierre: 'Botón del cierre', saltar: 'Atajo de teclado',
}

function EmbudoLanding() {
  const [e, setE] = useState<Embudo | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let vivo = true
    const cargar = () => supabase.rpc('ronqueo_embudo').then(({ data, error }) => { if (!vivo) return; if (error) setError(true); else setE(data as Embudo) })
    const t0 = setTimeout(cargar, 0)
    const t = setInterval(cargar, 60_000)
    return () => { vivo = false; clearTimeout(t0); clearInterval(t) }
  }, [])
  if (error) return <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 16 }}>No se pudieron cargar las estadísticas del landing.</p>
  if (!e) return null

  const pasos = [
    { label: 'Visitaron el landing', n: e.visitantes, nota: `${e.visitas} visitas en total` },
    { label: 'Llegaron a la sección de boleto', n: e.boleto_visto },
    { label: 'Picaron «compra tu boleto»', n: e.cta_personas, nota: `${e.cta_clics} clics` },
    { label: 'Picaron «pagar»', n: e.pagar_personas, nota: `${e.pagar_clics} clics` },
    { label: 'Abrieron el pago en Stripe', n: e.checkouts },
    { label: 'Pagaron', n: e.pagadas, nota: `${e.lugares_pagados} lugares` },
  ]
  const base = Math.max(1, e.visitantes)
  const pct = (n: number) => `${Math.round((n / base) * 100)}%`
  const lista = (o: Record<string, number>, nombres?: Record<string, string>) =>
    Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 0' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{nombres?.[k] ?? k}</span><span className="num" style={{ fontWeight: 600 }}>{v}</span>
      </div>
    ))
  const caja: React.CSSProperties = { background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }
  const titulo: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-tertiary)', margin: '0 0 8px' }

  return (
    <section style={{ marginBottom: 20 }} aria-label="Estadísticas del landing">
      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Landing /ronqueo · hasta dónde llega la gente</h2>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 12px' }}>Personas distintas en cada paso (anónimo). El % es contra quienes visitaron.</p>
      <div style={{ ...caja, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {pasos.map(p => (
          <div key={p.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) 1fr 90px', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.label}</span>
            <div style={{ height: 22, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, (p.n / base) * 100)}%`, minWidth: p.n ? 4 : 0, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
            </div>
            <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }} title={p.nota}>
              {p.n} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11 }}>{pct(p.n)}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <div style={caja}><p style={titulo}>Clics por botón</p>{Object.keys(e.cta_por_lugar).length ? lista(e.cta_por_lugar, LUGAR_CTA) : <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Sin clics todavía</p>}</div>
        <div style={caja}><p style={titulo}>De dónde llegan</p>{lista(e.visitas_por_origen)}<p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '6px 0 0' }}>Agrega ?ref=instagram (o el nombre) al link que compartas.</p></div>
        <div style={caja}><p style={titulo}>Idioma</p>{lista(e.visitas_por_idioma, { es: 'Español', en: 'English' })}</div>
        <div style={caja}><p style={titulo}>Dispositivo</p>{lista(e.visitas_por_dispositivo, { movil: 'Celular', escritorio: 'Computadora' })}</div>
      </div>
      {e.por_dia.length > 0 && (
        <div style={{ ...caja, marginTop: 12 }}>
          <p style={titulo}>Por día (visitantes · clics compra · clics pagar)</p>
          {[...e.por_dia].reverse().slice(0, 14).map(d => (
            <div key={d.dia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{new Date(d.dia + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="num">{d.visitantes} · {d.cta} · {d.pagar}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600,
  color: 'var(--text-primary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', textDecoration: 'none',
}
