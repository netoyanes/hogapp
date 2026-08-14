import { useEffect, useState } from 'react'
import {
  X, CheckSquare, Users, MessageSquare, Share2, Eye, CalendarDays,
  FolderKanban, AlertTriangle, Activity,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Sheet } from '../v2'
import { describeAction, moduleOf, MODULES, MODULE_ORDER, type ModuleId } from '../../lib/activityCatalog'

// ─────────────────────────────────────────────────────────────────────────────
// Ficha de actividad de una persona. Separa a propósito dos preguntas que se
// confunden seguido:
//   · QUÉ TRAE ENCIMA hoy (estado: tareas suyas, dónde está relacionado)
//   · QUÉ HIZO en el periodo (acciones: comentarios, reservas, compartidos)
// Un número alto de "acciones" no significa carga de trabajo, y al revés.
// ─────────────────────────────────────────────────────────────────────────────

interface Ficha {
  perfil: { nombre: string; rol: string; email: string } | null
  acciones_total: number
  por_accion: Record<string, number>
  comentarios: number
  reservas_creadas: number
  compartio_tareas: number
  vistas_de_lo_que_compartio: number
  tareas_responsable: number
  tareas_responsable_activas: number
  tareas_vencidas: number
  tareas_relacionado: number
  proyectos_responsable: number
  ultima_accion: string | null
}

export function PersonSheet({ userId, nombre, desde, hasta, rangoLabel, isMobile, onClose }: {
  userId: string; nombre: string; desde: string; hasta: string
  rangoLabel: string; isMobile: boolean; onClose: () => void
}) {
  const [f, setF] = useState<Ficha | null>(null)
  const [recientes, setRecientes] = useState<{ id: string; action: string; details: Record<string, unknown> | null; created_at: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('fn_activity_person', { p_user: userId, p_desde: desde, p_hasta: hasta })
      .then(({ data, error: e }) => e ? setError(e.message) : setF(data as Ficha))
    supabase.from('activity_log').select('id, action, details, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(25)
      .then(({ data }) => setRecientes(data ?? []))
  }, [userId, desde, hasta])

  // Reparto de sus acciones por módulo — en qué áreas trabaja realmente
  const porModulo = (() => {
    const acc: Partial<Record<ModuleId, number>> = {}
    for (const [action, n] of Object.entries(f?.por_accion ?? {})) {
      const m = moduleOf(action)
      acc[m] = (acc[m] ?? 0) + Number(n)
    }
    return MODULE_ORDER.map(id => ({ id, n: acc[id] ?? 0 })).filter(x => x.n > 0).sort((a, b) => b.n - a.n)
  })()
  const maxMod = Math.max(...porModulo.map(x => x.n), 1)

  const card: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 12 }
  const titulo: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', margin: '0 0 9px' }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            {nombre.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 800, margin: 0 }}>{f?.perfil?.nombre ?? nombre}</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '1px 0 0', fontFamily: 'var(--font-mono)' }}>
              {f?.perfil?.rol ?? '—'}{f?.ultima_accion ? ` · última acción ${new Date(f.ultima_accion).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : ' · sin actividad'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 34, height: 34, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error ? (
            <p style={{ fontSize: 12, color: 'var(--status-attention)' }}>Falta correr el SQL de Actividad v2 (activity_v2.sql) para ver la ficha.</p>
          ) : !f ? (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Cargando…</p>
          ) : (
            <>
              {/* QUÉ TRAE ENCIMA — estado actual */}
              <div style={card}>
                <p style={titulo}>Qué trae encima ahora</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <Dato icon={<CheckSquare size={12} />} label="Como responsable" value={f.tareas_responsable_activas}
                    sub={`${f.tareas_responsable} en total`} color="var(--accent)" />
                  <Dato icon={<Users size={12} />} label="Relacionado" value={f.tareas_relacionado}
                    sub="tareas de otros que sigue" />
                  <Dato icon={<FolderKanban size={12} />} label="Proyectos a cargo" value={f.proyectos_responsable} />
                  <Dato icon={<AlertTriangle size={12} />} label="Vencidas" value={f.tareas_vencidas}
                    color={f.tareas_vencidas > 0 ? 'var(--status-risk)' : undefined} />
                </div>
              </div>

              {/* QUÉ HIZO — en el periodo */}
              <div style={card}>
                <p style={titulo}>Qué hizo · últimos {rangoLabel}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <Dato icon={<Activity size={12} />} label="Acciones" value={f.acciones_total} color="var(--accent)" />
                  <Dato icon={<MessageSquare size={12} />} label="Comentarios" value={f.comentarios}
                    sub="en tareas, proyectos y deals" />
                  <Dato icon={<CalendarDays size={12} />} label="Reservas creadas" value={f.reservas_creadas} />
                  <Dato icon={<Share2 size={12} />} label="Tareas compartidas" value={f.compartio_tareas}
                    sub={f.compartio_tareas > 0 ? `${f.vistas_de_lo_que_compartio} ${f.vistas_de_lo_que_compartio === 1 ? 'vista' : 'vistas'} generadas` : undefined} />
                </div>
                {f.compartio_tareas > 0 && (
                  <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-tertiary)', margin: '9px 0 0' }}>
                    <Eye size={10} /> Las "vistas generadas" son aperturas del link público que compartió.
                  </p>
                )}
              </div>

              {/* En qué áreas trabaja */}
              {porModulo.length > 0 && (
                <div style={card}>
                  <p style={titulo}>En qué áreas trabaja</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {porModulo.map(({ id, n }) => {
                      const M = MODULES[id]
                      return (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 88, flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <M.icon size={10} style={{ color: M.color, flexShrink: 0 }} /> {M.label}
                          </span>
                          <div style={{ flex: 1, height: 14, background: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${(n / maxMod) * 100}%`, height: '100%', background: `color-mix(in srgb, ${M.color} 55%, transparent)` }} />
                          </div>
                          <span className="num" style={{ width: 34, textAlign: 'right', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', flexShrink: 0 }}>{n}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Últimos movimientos */}
              <div style={card}>
                <p style={titulo}>Últimos movimientos</p>
                {recientes.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Sin actividad registrada.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {recientes.map(r => {
                      const d = describeAction(r.action, r.details)
                      const Icon = d.icon
                      return (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0' }}>
                          <Icon size={11} style={{ color: d.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.text}</span>
                          <span className="num" style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            {new Date(r.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function Dato({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: number; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', padding: '9px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
        {icon} {label}
      </div>
      <div className="num" style={{ fontSize: 19, fontWeight: 800, color: color ?? 'var(--text-primary)', lineHeight: 1.2, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: 'var(--text-tertiary)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
