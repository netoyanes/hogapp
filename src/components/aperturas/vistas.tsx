// ─────────────────────────────────────────────────────────────────────────────
// APERTURAS · CRONOGRAMA, PARTIDAS, PROVEEDORES Y FLUJO
//
// Las cuatro vistas que no son el panel. Todas leen del mismo tablero
// calculado, así que ninguna puede contradecir a otra: si el Gantt movió una
// barra, el flujo de caja ya se movió con ella.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { Plus, Trash2, ShoppingCart } from 'lucide-react'
import {
  type Partida, type Proveedor, type Proyecto, TIPOS_PROVEEDOR, OFICIOS,
  montoDe, masDias, diasEntre,
} from '../../lib/aperturas/modelo'
import type { Tablero, Pago } from '../../lib/aperturas/motor'
import {
  mxn, dia, diaCorto, inp, btn, btnGhost, card, secTitle, colorDeMonto, colorDeTipo,
  C_CRITICA, C_COMPRA, C_ESTIMADO,
} from './tokens'
import { Barra, Casilla, Campo } from './ui'

// ── Cronograma (Gantt) ───────────────────────────────────────────────────────

export function Cronograma({ proyecto, partidas, tablero, hoy, selId, onSelect, isMobile }: {
  proyecto: Proyecto
  partidas: Partida[]
  tablero: Tablero
  hoy: string
  selId: string | null
  onSelect: (id: string) => void
  isMobile: boolean
}) {
  const { crono } = tablero
  const ANCHO = isMobile ? 20 : 26

  // El calendario abarca desde el inicio hasta lo último que pase: el fin del
  // proyecto, la meta de apertura o hoy. Lo que quede fuera no existe.
  const dias = useMemo(() => {
    const fin = [crono.fin_total, proyecto.meta_apertura, hoy].sort().at(-1)!
    const n = Math.max(1, diasEntre(proyecto.inicio, fin) + 2)
    return Array.from({ length: n }, (_, i) => masDias(proyecto.inicio, i))
  }, [proyecto.inicio, proyecto.meta_apertura, crono.fin_total, hoy])

  const grupos = useMemo(() => {
    const m = new Map<string, Partida[]>()
    for (const p of partidas) {
      const l = m.get(p.fase)
      if (l) l.push(p); else m.set(p.fase, [p])
    }
    return [...m.entries()]
  }, [partidas])

  const colNombre = isMobile ? 132 : 240
  const esFinde = (f: string) => [0, 6].includes(new Date(f + 'T00:00:00').getDay())

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: colNombre + dias.length * ANCHO }}>
          {/* Encabezado de días */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ width: colNombre, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3, background: 'var(--bg-surface)', padding: '8px 10px' }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Qué</span>
            </div>
            {dias.map(f => (
              <div key={f} style={{
                width: ANCHO, flexShrink: 0, textAlign: 'center', padding: '6px 0',
                background: f === hoy ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : esFinde(f) ? 'var(--bg-base)' : undefined,
                borderLeft: f === proyecto.meta_apertura ? `2px solid ${C_CRITICA}` : undefined,
              }}>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'narrow' })}
                </div>
                <div className="num" style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: f === hoy ? 800 : 400, color: f === hoy ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {diaCorto(f)}
                </div>
              </div>
            ))}
          </div>

          {grupos.map(([fase, ps]) => (
            <div key={fase}>
              <div style={{ position: 'sticky', left: 0, padding: '6px 10px', background: 'var(--bg-elevated)' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{fase}</span>
              </div>
              {ps.map(p => {
                const b = crono.barras.get(p.id)
                if (!b) return null
                const color = b.critica ? C_CRITICA : colorDeTipo(p.tipo)
                const ancho = Math.max(1, b.duracion) * ANCHO
                const activa = selId === p.id
                return (
                  <div key={p.id} onClick={() => onSelect(p.id)} style={{
                    display: 'flex', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
                    background: activa ? 'var(--accent-bg)' : undefined,
                  }}>
                    <div style={{
                      width: colNombre, flexShrink: 0, position: 'sticky', left: 0, zIndex: 1,
                      background: activa ? 'var(--accent-bg)' : 'var(--bg-surface)',
                      padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                    </div>
                    <div style={{ display: 'flex', position: 'relative', flex: 1 }}>
                      {dias.map(f => (
                        <div key={f} style={{
                          width: ANCHO, flexShrink: 0,
                          background: f === hoy ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : esFinde(f) ? 'var(--bg-base)' : undefined,
                          borderLeft: f === proyecto.meta_apertura ? `2px solid ${C_CRITICA}` : undefined,
                        }} />
                      ))}
                      {/* Holgura: hasta dónde podría correrse sin romper nada */}
                      {b.holgura > 0 && (
                        <div title={`Se puede tardar hasta ${b.holgura} ${b.holgura === 1 ? 'día' : 'días'} más sin mover la apertura`} style={{
                          position: 'absolute', left: b.inicio_temprano * ANCHO + ancho, top: '50%',
                          transform: 'translateY(-50%)', width: b.holgura * ANCHO, height: 12,
                          background: 'repeating-linear-gradient(90deg, var(--border-default) 0 3px, transparent 3px 6px)',
                          borderRadius: 3, opacity: 0.6,
                        }} />
                      )}
                      <div title={`${p.nombre} · ${dia(b.fecha_inicio)} → ${dia(b.fecha_fin)} · ${p.avance}%`} style={{
                        position: 'absolute', left: b.inicio_temprano * ANCHO + 1, top: '50%',
                        transform: 'translateY(-50%)', width: Math.max(4, ancho - 2), height: 16,
                        borderRadius: 4, border: `1px solid ${color}`, overflow: 'hidden',
                        background: `color-mix(in srgb, ${color} 16%, transparent)`,
                        opacity: p.post_apertura ? 0.65 : 1,
                      }}>
                        <div style={{ width: `${p.avance}%`, height: '100%', background: color }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        {[['No se puede atrasar', C_CRITICA], ['Compra: la barra es lo que tarda en llegar', C_COMPRA], ['Trabajo o tarea', 'var(--status-healthy)']].map(([t, c]) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} /> {t}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)' }}>
          <span style={{ width: 14, height: 6, background: 'repeating-linear-gradient(90deg, var(--border-default) 0 3px, transparent 3px 6px)' }} /> Se puede tardar hasta aquí
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)' }}>
          <span style={{ width: 2, height: 11, background: C_CRITICA }} /> El día que quieres abrir
        </span>
      </div>
    </div>
  )
}

// ── Partidas ─────────────────────────────────────────────────────────────────

export function TablaPartidas({ partidas, proveedores, tablero, selId, onSelect, onAdd, isMobile }: {
  partidas: Partida[]
  proveedores: Proveedor[]
  tablero: Tablero
  selId: string | null
  onSelect: (id: string) => void
  onAdd: (tipo: Partida['tipo']) => void
  isMobile: boolean
}) {
  const [filtro, setFiltro] = useState<'todas' | Partida['tipo']>('todas')
  const nombreProv = useMemo(() => Object.fromEntries(proveedores.map(p => [p.id, p.nombre])), [proveedores])
  const lista = filtro === 'todas' ? partidas : partidas.filter(p => p.tipo === filtro)

  const th: React.CSSProperties = { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', textTransform: 'uppercase', textAlign: 'left', padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '7px 8px', fontSize: 12.5, color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {([['todas', 'Todo'], ['compra', 'Lo que compro'], ['trabajo', 'Lo que contrato'], ['tarea', 'Lo que hace el equipo']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFiltro(id)} style={{
              minHeight: 32, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: filtro === id ? 'var(--accent-bg)' : 'transparent',
              border: `1px solid ${filtro === id ? 'var(--accent)' : 'var(--border-default)'}`,
              color: filtro === id ? 'var(--accent)' : 'var(--text-secondary)',
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['compra', 'Comprar'], ['trabajo', 'Contratar'], ['tarea', 'Tarea']] as const).map(([t, label]) => (
            <button key={t} onClick={() => onAdd(t)} style={{ ...btnGhost, minHeight: 32, padding: '0 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 620 : undefined }}>
          <thead>
            <tr>
              <th style={th}>Qué</th>
              <th style={th}>Con quién</th>
              <th style={{ ...th, textAlign: 'right' }}>Cuánto</th>
              <th style={th}>Empieza</th>
              <th style={th}>Termina</th>
              <th style={{ ...th, width: 90 }}>Va en</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(p => {
              const b = tablero.crono.barras.get(p.id)
              const monto = montoDe(p)
              const activa = selId === p.id
              return (
                <tr key={p.id} onClick={() => onSelect(p.id)} style={{ cursor: 'pointer', background: activa ? 'var(--accent-bg)' : undefined }}>
                  <td style={{ ...td, color: 'var(--text-primary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      {p.tipo === 'compra' && (p.foto
                        ? <img src={p.foto} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                        : <ShoppingCart size={13} style={{ color: C_COMPRA, flexShrink: 0 }} />)}
                      {p.nombre}
                      {p.post_apertura && <span title="No detiene la apertura: se hace después de abrir" style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '1px 4px' }}>DESPUÉS</span>}
                    </span>
                  </td>
                  <td style={td}>{p.proveedor_id ? nombreProv[p.proveedor_id] ?? '—' : '—'}</td>
                  <td className="num" style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: colorDeMonto(monto, p.estimado) }}>
                    {mxn(monto)}{p.estimado ? ' ~' : ''}
                  </td>
                  <td className="num" style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{b ? dia(b.fecha_inicio) : '—'}</td>
                  <td className="num" style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: b?.critica ? C_CRITICA : undefined, fontWeight: b?.critica ? 700 : undefined }}>
                    {b ? dia(b.fecha_fin) : '—'}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 34 }}><Barra valor={p.avance / 100} alto={5} /></div>
                      <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>{p.avance}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {lista.length === 0 && (
          <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12.5, margin: 0 }}>
No has anotado nada de este tipo todavía.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Proveedores ──────────────────────────────────────────────────────────────

export function TablaProveedores({ proveedores, partidas, tablero, onChange, onAdd, onDelete, isMobile }: {
  proveedores: Proveedor[]
  partidas: Partida[]
  tablero: Tablero
  onChange: (id: string, patch: Partial<Proveedor>) => void
  onAdd: () => void
  onDelete: (id: string) => void
  isMobile: boolean
}) {
  // Columnas calculadas: cuánto le debo a cada quién y cuánto ya le pagué.
  const numeros = useMemo(() => {
    const m = new Map<string, { partidas: number; comprometido: number; pagado: number }>()
    for (const p of partidas) {
      if (!p.proveedor_id) continue
      const v = m.get(p.proveedor_id) ?? { partidas: 0, comprometido: 0, pagado: 0 }
      v.partidas++
      v.comprometido += montoDe(p)
      m.set(p.proveedor_id, v)
    }
    for (const pago of tablero.pagos) {
      if (!pago.proveedor_id || !pago.pagado) continue
      const v = m.get(pago.proveedor_id)
      if (v) v.pagado += pago.monto
    }
    return m
  }, [partidas, tablero.pagos])

  const th: React.CSSProperties = { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', textTransform: 'uppercase', textAlign: 'left', padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 8px', borderTop: '1px solid var(--border-subtle)' }
  const mini: React.CSSProperties = { ...inp, minHeight: 32, fontSize: 12, padding: '0 8px' }
  const calc: React.CSSProperties = { ...td, fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ ...secTitle, margin: 0, flex: 1 }}>Con quién trabajas · el % de anticipo decide cuándo sale el dinero</p>
        <button onClick={onAdd} style={{ ...btn, minHeight: 32, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Plus size={13} /> Proveedor
        </button>
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 760 : undefined }}>
          <thead>
            <tr>
              <th style={{ ...th, minWidth: 150 }}>Nombre</th>
              <th style={{ ...th, minWidth: 120 }}>Tipo</th>
              <th style={{ ...th, minWidth: 120 }}>Oficio</th>
              <th style={{ ...th, width: 90 }} title="Qué parte le pagas al arrancar. 50 = mitad y mitad.">Anticipo %</th>
              <th style={{ ...th, minWidth: 120 }}>Contacto</th>
              <th style={{ ...th, textAlign: 'right' }}>Trabajos</th>
              <th style={{ ...th, textAlign: 'right' }}>Le debes en total</th>
              <th style={{ ...th, textAlign: 'right' }}>Ya pagado</th>
              <th style={{ ...th, textAlign: 'right' }}>Falta pagarle</th>
              <th style={{ ...th, width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {proveedores.map(v => {
              const n = numeros.get(v.id) ?? { partidas: 0, comprometido: 0, pagado: 0 }
              return (
                <tr key={v.id}>
                  <td style={td}><input value={v.nombre} onChange={e => onChange(v.id, { nombre: e.target.value })} style={mini} /></td>
                  <td style={td}>
                    <select value={v.tipo} onChange={e => onChange(v.id, { tipo: e.target.value as Proveedor['tipo'] })} style={{ ...mini, cursor: 'pointer' }}>
                      {TIPOS_PROVEEDOR.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <select value={v.oficio ?? ''} onChange={e => onChange(v.id, { oficio: e.target.value || null })} style={{ ...mini, cursor: 'pointer' }}>
                      <option value="">—</option>
                      {OFICIOS.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <input type="number" min={0} max={100} value={Math.round(v.anticipo_pct * 100)}
                      onChange={e => onChange(v.id, { anticipo_pct: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })}
                      style={{ ...mini, textAlign: 'right' }} />
                  </td>
                  <td style={td}><input value={v.contacto ?? ''} onChange={e => onChange(v.id, { contacto: e.target.value || null })} style={mini} /></td>
                  <td className="num" style={calc}>{n.partidas}</td>
                  <td className="num" style={calc}>{mxn(n.comprometido)}</td>
                  <td className="num" style={{ ...calc, color: 'var(--status-healthy)' }}>{mxn(n.pagado)}</td>
                  <td className="num" style={{ ...calc, color: n.comprometido - n.pagado > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{mxn(n.comprometido - n.pagado)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span role="button" title={n.partidas ? 'No se puede borrar: tiene trabajos asignados' : 'Borrar'}
                      onClick={() => n.partidas === 0 && onDelete(v.id)}
                      style={{ cursor: n.partidas ? 'not-allowed' : 'pointer', color: 'var(--text-tertiary)', opacity: n.partidas ? 0.3 : 1, display: 'inline-flex' }}>
                      <Trash2 size={12} />
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {proveedores.length === 0 && (
          <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12.5, margin: 0 }}>
Todavía no has dado de alta a nadie. Agrégalos aquí y luego los eliges en cada cosa que anotes.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Flujo de caja ────────────────────────────────────────────────────────────

export function Flujo({ tablero, hoy, onTogglePago, onSelect, isMobile }: {
  tablero: Tablero
  hoy: string
  onTogglePago: (pago: Pago, valor: boolean) => void
  onSelect: (id: string) => void
  isMobile: boolean
}) {
  const { semanas, presupuesto, pagos } = tablero
  const techo = Math.max(presupuesto.aprobado, presupuesto.ejecutable, semanas.at(-1)?.acumulado ?? 0, 1)
  const maxSemana = Math.max(...semanas.map(s => s.programado), 1)

  const CW = 720, CH = 170
  const colW = semanas.length ? CW / semanas.length : CW
  const y = (v: number) => CH - (v / techo) * (CH - 10)

  const puntos = semanas.map((s, i) => `${i * colW + colW / 2},${y(s.acumulado)}`).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <p style={{ ...secTitle, margin: 0, flex: 1 }}>Cuánto sale cada semana</p>
          {[['Te toca pagar', 'var(--text-tertiary)'], ['Ya pagado', 'var(--status-healthy)'], ['Suma total', C_COMPRA]].map(([t, c]) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} /> {t}
            </span>
          ))}
        </div>
        {semanas.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12.5, margin: 0 }}>Todavía no hay pagos: ninguna cosa anotada tiene precio.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${CW} ${CH + 24}`} style={{ width: '100%', minWidth: 520, display: 'block' }}>
              {/* Referencias de presupuesto: el techo real y el aprobado */}
              {([[presupuesto.ejecutable, 'Lo que puedes gastar', C_ESTIMADO], [presupuesto.aprobado, 'Presupuesto total', 'var(--text-tertiary)']] as const).map(([v, label, c]) => (
                <g key={label}>
                  <line x1={0} y1={y(v)} x2={CW} y2={y(v)} stroke={c} strokeWidth={1} strokeDasharray="5 4" />
                  <text x={CW - 4} y={y(v) - 4} textAnchor="end" fill={c} style={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}>{label} {mxn(v)}</text>
                </g>
              ))}
              {semanas.map((s, i) => {
                const bw = Math.min(22, colW / 2 - 3)
                const hProg = ((s.programado / maxSemana) * (CH - 20))
                const hPag = ((s.pagado / maxSemana) * (CH - 20))
                return (
                  <g key={s.inicio}>
                    <rect x={i * colW + colW / 2 - bw - 1} y={CH - hProg} width={bw} height={Math.max(hProg, s.programado > 0 ? 2 : 0)} rx={3} fill="var(--text-tertiary)" opacity={0.45}>
                      <title>Semana del {dia(s.inicio)} · te toca pagar {mxn(s.programado)}</title>
                    </rect>
                    <rect x={i * colW + colW / 2 + 1} y={CH - hPag} width={bw} height={Math.max(hPag, s.pagado > 0 ? 2 : 0)} rx={3} fill="var(--status-healthy)">
                      <title>Semana del {dia(s.inicio)} · pagado {mxn(s.pagado)}</title>
                    </rect>
                    <text x={i * colW + colW / 2} y={CH + 15} textAnchor="middle" fill="var(--text-tertiary)" style={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}>
                      {dia(s.inicio)}
                    </text>
                  </g>
                )
              })}
              <polyline points={puntos} fill="none" stroke={C_COMPRA} strokeWidth={2} />
              <line x1={0} y1={CH} x2={CW} y2={CH} stroke="var(--border-subtle)" strokeWidth={1} />
            </svg>
          </div>
        )}
      </div>

      <div style={{ ...card, padding: 0 }}>
        <p style={{ ...secTitle, margin: 0, padding: '12px 14px 8px' }}>Todos los pagos, por fecha · palomea el que ya hiciste</p>
        <div style={{ maxHeight: isMobile ? undefined : 420, overflowY: 'auto' }}>
          {pagos.map(pago => {
            const vencido = !pago.pagado && pago.fecha < hoy
            return (
              <div key={`${pago.partida_id}:${pago.clase}`} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
                borderTop: '1px solid var(--border-subtle)',
                background: vencido ? 'color-mix(in srgb, var(--status-risk) 8%, transparent)' : undefined,
              }}>
                <Casilla checked={pago.pagado} onChange={v => onTogglePago(pago, v)} label="" />
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: vencido ? C_CRITICA : 'var(--text-tertiary)', width: 58, flexShrink: 0 }}>
                  {dia(pago.fecha)}
                </span>
                <span onClick={() => onSelect(pago.partida_id)} style={{
                  flex: 1, fontSize: 12.5, color: 'var(--text-primary)', cursor: 'pointer', minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: pago.pagado ? 'line-through' : undefined, opacity: pago.pagado ? 0.6 : 1,
                }}>
                  {pago.partida}
                </span>
                <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', textTransform: 'uppercase', flexShrink: 0 }}>{pago.clase}</span>
                <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, flexShrink: 0, color: pago.estimado ? C_ESTIMADO : 'var(--text-primary)' }}>
                  {mxn(pago.monto)}
                </span>
              </div>
            )
          })}
          {pagos.length === 0 && (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12.5, margin: 0 }}>
Ninguna de las cosas que anotaste tiene precio todavía.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Ajustes del proyecto ─────────────────────────────────────────────────────

export function AjustesProyecto({ proyecto, onChange }: {
  proyecto: Proyecto & { notas: string | null }
  onChange: (patch: Record<string, unknown>) => void
}) {
  return (
    <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      <Campo label="Nombre">
        <input value={proyecto.nombre} onChange={e => onChange({ nombre: e.target.value })} style={inp} />
      </Campo>
      <Campo label="Ciudad" ayuda="Para calcular cuánto tardan las entregas.">
        <input value={proyecto.ciudad} onChange={e => onChange({ ciudad: e.target.value })} style={inp} />
      </Campo>
      <Campo label="¿Cuándo empiezas?">
        <input type="date" value={proyecto.inicio} onChange={e => onChange({ inicio: e.target.value })} style={inp} />
      </Campo>
      <Campo label="¿Qué día quieres abrir?">
        <input type="date" value={proyecto.meta_apertura} onChange={e => onChange({ meta_apertura: e.target.value })} style={inp} />
      </Campo>
      <Campo label="¿Cuánto tienes para gastar?">
        <input type="number" inputMode="decimal" value={proyecto.presupuesto_aprobado}
          onChange={e => onChange({ presupuesto_aprobado: Number(e.target.value) })} style={inp} />
      </Campo>
      <Campo label="Guardar para imprevistos (%)" ayuda="Este dinero se aparta y no cuenta como disponible.">
        <input type="number" min={0} max={50} value={Math.round(proyecto.reserva_pct * 100)}
          onChange={e => onChange({ reserva_pct: Math.min(50, Math.max(0, Number(e.target.value))) / 100 })} style={inp} />
      </Campo>
    </div>
  )
}
