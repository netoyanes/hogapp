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

const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600,
  color: 'var(--text-primary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', textDecoration: 'none',
}
