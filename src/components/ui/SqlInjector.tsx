import { useState } from 'react'
import { Zap, X, Eye, PenLine, CheckCircle2, AlertTriangle, FolderKanban, CheckSquare, Package, Banknote } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { Sheet, showToast } from '../v2'

// ─────────────────────────────────────────────────────────────────────────────
// ⚡SQL — inyección de proyectos y tareas (solo Master).
// Un agente de IA propone un bloque de INSERTs (docs/PROMPT_INYECTAR_SQL.md);
// aquí se pega, se PREVISUALIZA — el SQL corre de verdad contra la base y se
// revierte, así el preview es exacto, no una interpretación — se puede editar,
// y solo al FIRMAR se aplica. Todo lo que no sea INSERT lo rechaza el servidor.
// ─────────────────────────────────────────────────────────────────────────────

const NEON = '#39FF14'

interface Creado {
  proyectos: { nombre: string; tipo: string; estado: string; inicio: string | null; fin: string | null; presupuesto: number | null; venue: string | null; responsable: string | null }[]
  tareas: { titulo: string; area: string | null; prioridad: string; vence: string | null; horas: number | null; venue: string | null; asignada_a: string | null; proyecto: string | null }[]
  recursos: { nombre: string; cantidad: number; costo_unitario: number | null }[]
  presupuesto: { concepto: string; monto: number; es_ingreso: boolean }[]
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const fecha = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'sin fecha'

export function SqlInjector() {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [sql, setSql] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Creado | null>(null)
  // El SQL previsualizado: si lo editan después, el preview deja de valer y
  // hay que volver a revisar antes de firmar (nadie firma algo que no vio).
  const [previewedSql, setPreviewedSql] = useState<string | null>(null)

  const dirty = preview !== null && previewedSql !== sql
  const total = preview ? preview.proyectos.length + preview.tareas.length + preview.recursos.length + preview.presupuesto.length : 0

  function reset() {
    setSql(''); setPreview(null); setPreviewedSql(null); setError(null)
  }

  async function run(apply: boolean) {
    if (!sql.trim()) { setError('Pega el SQL que te pasó el agente.'); return }
    setBusy(true); setError(null)
    const { data, error: err } = await supabase.rpc('fn_sql_inject', { p_sql: sql, p_apply: apply })
    setBusy(false)
    if (err) {
      setError(err.message.replace(/^.*?:\s*/, ''))
      if (apply) setPreview(null)
      return
    }
    const creado = (data as { creado: Creado })?.creado ?? null
    if (apply) {
      showToast('Firmado y aplicado — ya vive en HOG APP ⚡', 'success')
      window.dispatchEvent(new CustomEvent('hog:task-updated'))
      setOpen(false); reset()
      return
    }
    setPreview(creado)
    setPreviewedSql(sql)
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 12,
    color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'var(--font-mono)', lineHeight: 1.5, resize: 'vertical',
  }

  return (
    <>
      {/* Botón flotante — abajo a la derecha, verde fosforescente */}
      <button onClick={() => setOpen(true)} title="Inyectar proyecto o tareas con SQL"
        style={{
          position: 'fixed', right: 'max(16px, env(safe-area-inset-right))',
          bottom: `calc(${isMobile ? 78 : 20}px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 50, display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 46, padding: '0 16px', borderRadius: 999, border: 'none',
          background: NEON, color: '#04120A', fontSize: 13, fontWeight: 900,
          fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', cursor: 'pointer',
          boxShadow: `0 0 0 1px rgba(0,0,0,0.35), 0 6px 22px ${NEON}66, 0 2px 8px rgba(0,0,0,0.5)`,
        }}>
        <Zap size={15} strokeWidth={2.8} /> SQL
      </button>

      {open && (
        <Sheet open onClose={() => setOpen(false)} isMobile={isMobile} width={620}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 26, height: 26, borderRadius: 7, background: NEON, color: '#04120A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Zap size={14} strokeWidth={3} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 800, margin: 0 }}>Inyectar proyecto o tareas</h2>
                  <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '1px 0 0' }}>Pega el SQL, revísalo y fírmalo. Solo se aceptan altas.</p>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Cerrar" style={{ width: 34, height: 34, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}><X size={16} /></button>
              </div>
            </div>

            {/* Cuerpo */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                  <PenLine size={11} /> SQL propuesto {dirty && <span style={{ color: '#E8A33D', textTransform: 'none', letterSpacing: 0 }}>· editado, vuelve a revisar</span>}
                </label>
                <textarea value={sql} onChange={e => { setSql(e.target.value); setError(null) }}
                  rows={isMobile ? 8 : 11} spellCheck={false} placeholder={'begin;\n\nwith proyecto as (\n  insert into event_plans (...) values (...) returning id\n)\ninsert into tasks (...) select ... from proyecto;\n\ncommit;'}
                  style={inp} />
              </div>

              {error && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'color-mix(in srgb, var(--status-risk) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-risk) 35%, transparent)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <AlertTriangle size={14} style={{ color: 'var(--status-risk)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{error}</span>
                </div>
              )}

              {preview && !dirty && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={14} style={{ color: NEON }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {total === 0 ? 'El SQL corrió, pero no crearía nada' : `Se crearían ${total} registros`}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>SIMULADO · NADA GUARDADO AÚN</span>
                  </div>

                  {preview.proyectos.length > 0 && (
                    <Bloque icon={<FolderKanban size={12} />} titulo="Proyectos" n={preview.proyectos.length}>
                      {preview.proyectos.map((p, i) => (
                        <Fila key={i} principal={p.nombre}
                          secundario={`${p.tipo} · ${p.venue ?? 'SIN VENUE'} · ${fecha(p.inicio)}${p.fin && p.fin !== p.inicio ? ` → ${fecha(p.fin)}` : ''}${p.responsable ? ` · ${p.responsable}` : ' · sin responsable'}`}
                          derecha={p.presupuesto != null ? mxn.format(p.presupuesto) : undefined} />
                      ))}
                    </Bloque>
                  )}

                  {preview.tareas.length > 0 && (
                    <Bloque icon={<CheckSquare size={12} />} titulo="Tareas" n={preview.tareas.length}>
                      {preview.tareas.map((t, i) => (
                        <Fila key={i} principal={t.titulo}
                          secundario={`${fecha(t.vence)} · ${t.prioridad}${t.area ? ` · ${t.area}` : ''}${t.proyecto ? ` · ${t.proyecto}` : ''} · ${t.asignada_a ?? 'SIN ASIGNAR'}`}
                          derecha={t.horas != null ? `${t.horas} h` : undefined}
                          alerta={!t.asignada_a} />
                      ))}
                    </Bloque>
                  )}

                  {preview.recursos.length > 0 && (
                    <Bloque icon={<Package size={12} />} titulo="Recursos" n={preview.recursos.length}>
                      {preview.recursos.map((r, i) => (
                        <Fila key={i} principal={`${r.cantidad}× ${r.nombre}`}
                          derecha={r.costo_unitario != null ? mxn.format(r.costo_unitario * r.cantidad) : undefined} />
                      ))}
                    </Bloque>
                  )}

                  {preview.presupuesto.length > 0 && (
                    <Bloque icon={<Banknote size={12} />} titulo="Presupuesto" n={preview.presupuesto.length}>
                      {preview.presupuesto.map((b, i) => (
                        <Fila key={i} principal={b.concepto} secundario={b.es_ingreso ? 'ingreso' : 'gasto'}
                          derecha={`${b.es_ingreso ? '+' : '−'}${mxn.format(b.monto)}`}
                          color={b.es_ingreso ? 'var(--status-healthy)' : undefined} />
                      ))}
                    </Bloque>
                  )}
                </div>
              )}
            </div>

            {/* Acciones */}
            <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => run(false)} disabled={busy || !sql.trim()}
                style={{ flex: 1, minHeight: 46, borderRadius: 999, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <Eye size={14} /> {busy ? 'Revisando…' : preview ? 'Revisar de nuevo' : 'Previsualizar'}
              </button>
              <button onClick={() => run(true)} disabled={busy || !preview || dirty || total === 0}
                title={dirty ? 'Editaste el SQL — vuelve a previsualizar antes de firmar' : undefined}
                style={{ flex: 1, minHeight: 46, borderRadius: 999, border: 'none', background: (!preview || dirty || total === 0) ? 'var(--bg-elevated)' : NEON, color: (!preview || dirty || total === 0) ? 'var(--text-tertiary)' : '#04120A', fontSize: 13, fontWeight: 900, cursor: (!preview || dirty || total === 0 || busy) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                <Zap size={14} strokeWidth={3} /> FIRMAR Y APLICAR
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}

function Bloque({ icon, titulo, n, children }: { icon: React.ReactNode; titulo: string; n: number; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
        {icon} {titulo} · {n}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  )
}

function Fila({ principal, secundario, derecha, color, alerta }: {
  principal: string; secundario?: string; derecha?: string; color?: string; alerta?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', padding: '7px 9px', borderLeft: alerta ? '2px solid #E8A33D' : '2px solid transparent' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{principal}</div>
        {secundario && <div className="num" style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{secundario}</div>}
      </div>
      {derecha && <span className="num" style={{ fontSize: 11.5, fontWeight: 700, color: color ?? 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{derecha}</span>}
    </div>
  )
}
