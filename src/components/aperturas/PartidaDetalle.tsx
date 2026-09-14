// ─────────────────────────────────────────────────────────────────────────────
// APERTURAS · DETALLE DE LA PARTIDA
//
// Panel lateral persistente, nunca un modal: editar una partida mientras se ve
// el Gantt detrás es justo el momento en que se entiende por qué la fecha se
// movió. Un modal tapa esa relación.
//
// El formulario pide SOLO lo que corresponde al subtipo. Un carpintero cotiza
// por pieza y un pintor por m²; pedir "cantidad" a secas es la vía rápida a un
// presupuesto que no cuadra.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { X, Trash2, Link2, AlertTriangle } from 'lucide-react'
import {
  type Partida, type Proveedor, OFICIOS, oficioDe, montoDe, duracionDe, tiendaDeUrl,
} from '../../lib/aperturas/modelo'
import { type Cronograma, anticipoPctDe, sucesoresDe } from '../../lib/aperturas/motor'
import { mxn, dia, inp, btnGhost, colorDeMonto, C_ESTIMADO, C_CRITICA } from './tokens'
import { Campo, Calculado, Casilla } from './ui'

interface Props {
  partida: Partida
  partidas: Partida[]
  proveedores: Proveedor[]
  crono: Cronograma
  onChange: (patch: Partial<Partida>) => void
  onDelete: () => void
  onClose: () => void
  onSelect: (id: string) => void
}

export function PartidaDetalle({ partida: p, partidas, proveedores, crono, onChange, onDelete, onClose, onSelect }: Props) {
  const barra = crono.barras.get(p.id)
  const prov = proveedores.find(v => v.id === p.proveedor_id) ?? null
  const monto = montoDe(p)
  const pctAnticipo = anticipoPctDe(p, prov)
  const anticipo = monto * pctAnticipo
  const saldo = monto - anticipo
  const bloquea = useMemo(() => sucesoresDe(p.id, partidas), [p.id, partidas])
  const oficio = oficioDe(p.oficio)
  const tienda = p.url ? tiendaDeUrl(p.url) : null
  const enCiclo = crono.ciclos.includes(p.id)

  const num = (v: string) => v === '' ? null : Number(v)

  // Candidatas a dependencia: cualquier otra partida. El motor detecta el ciclo
  // si alguien se pasa de listo, así que no hace falta prohibirlo aquí.
  const otras = partidas.filter(q => q.id !== p.id)

  function alternarDep(id: string) {
    const deps = p.depende_de.includes(id)
      ? p.depende_de.filter(d => d !== id)
      : [...p.depende_de, id]
    onChange({ depende_de: deps })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflowY: 'auto', padding: '2px 2px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <input value={p.nombre} onChange={e => onChange({ nombre: e.target.value })}
          style={{ ...inp, fontSize: 15, fontWeight: 700, minHeight: 42 }} placeholder="Nombre de la partida" />
        <button onClick={onClose} title="Cerrar"
          style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 8, flexShrink: 0 }}>
          <X size={16} />
        </button>
      </div>

      {enCiclo && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'color-mix(in srgb, var(--status-risk) 12%, transparent)', border: `1px solid ${C_CRITICA}`, borderRadius: 8, padding: 10 }}>
          <AlertTriangle size={14} style={{ color: C_CRITICA, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Esta partida está en una dependencia circular: sus fechas no son confiables hasta que quites una dependencia.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Campo label="Fase">
          <input value={p.fase} onChange={e => onChange({ fase: e.target.value })} style={inp} list="aperturas-fases" />
        </Campo>
        <Campo label="Proveedor" ayuda={prov ? `Anticipo ${Math.round(prov.anticipo_pct * 100)}%` : undefined}>
          <select value={p.proveedor_id ?? ''} onChange={e => onChange({ proveedor_id: e.target.value || null })}
            style={{ ...inp, cursor: 'pointer' }}>
            <option value="">Sin proveedor</option>
            {proveedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </Campo>
      </div>

      {/* ── Campos del subtipo ─────────────────────────────────────────────── */}
      {p.tipo === 'compra' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Campo label="Link del producto"
            ayuda={tienda ? `${tienda.nombre} · entrega típica ${tienda.dias[0]}–${tienda.dias[1]} días. Revisa el precio contra tu carrito.` : 'Pega la URL: si reconocemos la tienda, precargamos los días de entrega.'}>
            <input value={p.url ?? ''} onChange={e => onChange({ url: e.target.value || null })}
              placeholder="https://…" style={inp} />
          </Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Campo label="Precio unitario">
              <input type="number" inputMode="decimal" value={p.precio_unitario ?? ''}
                onChange={e => onChange({ precio_unitario: num(e.target.value) })} style={inp} />
            </Campo>
            <Campo label="Cantidad">
              <input type="number" inputMode="decimal" value={p.cantidad ?? ''}
                onChange={e => onChange({ cantidad: num(e.target.value) })} style={inp} />
            </Campo>
            <Campo label="Días de entrega" ayuda="Es la duración en el cronograma.">
              <input type="number" inputMode="numeric" value={p.dias_entrega ?? ''}
                onChange={e => onChange({ dias_entrega: num(e.target.value) })} style={inp} />
            </Campo>
          </div>
          <Campo label="Foto (URL)">
            <input value={p.foto ?? ''} onChange={e => onChange({ foto: e.target.value || null })}
              placeholder="https://…" style={inp} />
          </Campo>
          {barra && (
            <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
              Ordenar el <strong style={{ color: 'var(--text-secondary)' }}>{dia(barra.fecha_inicio)}</strong> para
              tenerlo el <strong style={{ color: 'var(--text-secondary)' }}>{dia(barra.fecha_fin)}</strong>.
              La fecha real depende de tu código postal y del stock del momento — ajústala cuando la veas en el carrito.
            </p>
          )}
        </div>
      )}

      {p.tipo === 'trabajo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Campo label="Oficio" ayuda={oficio?.ayuda}>
            <select value={p.oficio ?? ''} onChange={e => onChange({ oficio: e.target.value || null })}
              style={{ ...inp, cursor: 'pointer' }}>
              <option value="">Elige el oficio</option>
              {OFICIOS.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Campo label={`Cantidad (${oficio?.unidad ?? 'unidad'})`}>
              <input type="number" inputMode="decimal" value={p.cantidad ?? ''}
                onChange={e => onChange({ cantidad: num(e.target.value) })} style={inp} />
            </Campo>
            <Campo label={`Precio por ${oficio?.unidad ?? 'unidad'}`}>
              <input type="number" inputMode="decimal" value={p.precio_unitario ?? ''}
                onChange={e => onChange({ precio_unitario: num(e.target.value) })} style={inp} />
            </Campo>
            <Campo label="Días de ejecución">
              <input type="number" inputMode="numeric" value={p.dias_ejecucion ?? ''}
                onChange={e => onChange({ dias_ejecucion: num(e.target.value) })} style={inp} />
            </Campo>
          </div>
        </div>
      )}

      {p.tipo === 'tarea' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Campo label="Responsable">
            <input value={p.responsable ?? ''} onChange={e => onChange({ responsable: e.target.value || null })} style={inp} />
          </Campo>
          <Campo label="Días">
            <input type="number" inputMode="numeric" value={p.dias ?? ''}
              onChange={e => onChange({ dias: num(e.target.value) })} style={inp} />
          </Campo>
          <Campo label="Costo" ayuda="Opcional.">
            <input type="number" inputMode="decimal" value={p.costo ?? ''}
              onChange={e => onChange({ costo: num(e.target.value) })} style={inp} />
          </Campo>
        </div>
      )}

      {/* ── Resumen económico ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1 }}>Total de la partida</span>
          <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: colorDeMonto(monto, p.estimado) }}>
            {mxn(monto)}
          </span>
        </div>
        {anticipo > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Casilla checked={p.anticipo_pagado} onChange={v => onChange({ anticipo_pagado: v })}
              label={`Anticipo ${Math.round(pctAnticipo * 100)}%`} />
            <span style={{ flex: 1, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {barra ? dia(barra.fecha_inicio) : '—'}
            </span>
            <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{mxn(anticipo)}</span>
          </div>
        )}
        {saldo > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Casilla checked={p.saldo_pagado} onChange={v => onChange({ saldo_pagado: v })} label="Saldo" />
            <span style={{ flex: 1, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {barra ? dia(barra.fecha_fin) : '—'}
            </span>
            <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{mxn(saldo)}</span>
          </div>
        )}
        <Casilla checked={p.estimado} onChange={v => onChange({ estimado: v })}
          label={<span style={{ color: p.estimado ? C_ESTIMADO : undefined }}>Monto estimado, sin cotización en firme</span>} />
      </div>

      {/* ── Avance ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1 }}>Avance físico</span>
          <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{p.avance}%</span>
        </div>
        <input type="range" min={0} max={100} step={5} value={p.avance}
          onChange={e => onChange({ avance: Number(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
      </div>

      {/* ── Lo calculado ──────────────────────────────────────────────────── */}
      {barra && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <Calculado label="Inicio" valor={dia(barra.fecha_inicio)} />
          <Calculado label="Fin" valor={dia(barra.fecha_fin)} color={barra.critica ? C_CRITICA : undefined}
            hint={barra.critica ? 'Ruta crítica: mover esta fecha mueve la apertura.' : undefined} />
          <Calculado label="Duración" valor={`${duracionDe(p)} d`} />
          <Calculado label="Holgura" valor={`${barra.holgura} d`} color={barra.holgura === 0 ? C_CRITICA : undefined}
            hint="Días que puede retrasarse sin mover su fecha límite." />
        </div>
      )}

      {bloquea.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Bloquea a</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {bloquea.map(b => (
              <button key={b.id} onClick={() => onSelect(b.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)', borderRadius: 999, padding: '4px 10px',
                fontSize: 11.5, color: 'var(--text-secondary)', cursor: 'pointer',
              }}>
                <Link2 size={11} /> {b.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Dependencias ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Depende de <span style={{ color: 'var(--text-tertiary)' }}>— tiene que terminar antes de que esta empiece</span>
        </span>
        <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 8 }}>
          {otras.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Es la única partida del proyecto.</span>}
          {otras.map(q => (
            <Casilla key={q.id} checked={p.depende_de.includes(q.id)} onChange={() => alternarDep(q.id)} label={q.nombre} />
          ))}
        </div>
      </div>

      <Casilla checked={p.post_apertura} onChange={v => onChange({ post_apertura: v })}
        label="Fase 2: no condiciona la apertura (cuenta en el dinero, no en la fecha)" />

      <Campo label="Notas">
        <textarea value={p.notas ?? ''} onChange={e => onChange({ notas: e.target.value || null })}
          rows={2} style={{ ...inp, minHeight: 56, padding: 8, resize: 'vertical', fontFamily: 'inherit' }} />
      </Campo>

      <button onClick={onDelete} style={{ ...btnGhost, color: 'var(--status-risk)', borderColor: 'var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Trash2 size={13} /> Eliminar partida
      </button>
    </div>
  )
}
