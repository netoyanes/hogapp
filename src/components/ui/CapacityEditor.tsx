import { useEffect, useState, useCallback } from 'react'
import { Copy, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { Sheet, showToast } from '../v2'

interface CapRow {
  id: string
  day_of_week: number
  max_reservations: number
  max_pax: number
  open_time: string | null
  close_time: string | null
  active: boolean
}

// Parámetros de reserva del venue (Fase 3): motor por mesas, slots, duraciones,
// buffer, pacing y reglas de reserva en línea. Regla de oro: todo número que el
// motor usa vive aquí, nunca en el código.
interface ResSettings {
  bu_id: string
  engine: 'night' | 'tables'
  slot_minutes: 15 | 30 | 60
  durations: { max_pax: number; minutes: number }[]
  buffer_minutes: number
  pacing_max_pax: number
  online_pct: number
  online_max_pax: number
  no_show_hold_minutes: number
}
const DEFAULT_SETTINGS: Omit<ResSettings, 'bu_id'> = {
  engine: 'night', slot_minutes: 30,
  durations: [
    { max_pax: 2, minutes: 90 }, { max_pax: 4, minutes: 120 },
    { max_pax: 6, minutes: 150 }, { max_pax: 99, minutes: 180 },
  ],
  buffer_minutes: 15, pacing_max_pax: 0, online_pct: 100, online_max_pax: 8, no_show_hold_minutes: 15,
}

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Editor de capacidad por venue (Ops Manager+): un cupo TOTAL por noche
// (día × máximos), sin turnos ni horarios — la hora de llegada es libre y
// el cliente se queda el tiempo que quiera. RLS restringe la escritura.
export function CapacityEditor({ buId, buCode, onClose, onSaved }: {
  buId: string
  buCode: string
  onClose: () => void
  onSaved: () => void
}) {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState<CapRow[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<ResSettings | null>(null)

  const load = useCallback(async () => {
    const [{ data }, { data: st }] = await Promise.all([
      supabase.from('venue_capacity').select('*').eq('bu_id', buId).order('day_of_week'),
      supabase.from('venue_reservation_settings').select('*').eq('bu_id', buId).maybeSingle(),
    ])
    setRows((data ?? []) as CapRow[])
    setSettings(st ? (st as ResSettings) : { bu_id: buId, ...DEFAULT_SETTINGS })
    setLoading(false)
  }, [buId])

  // Fase 5 — CALIBRACIÓN: duraciones REALES del piso (table_sessions cerradas,
  // últimos 60 días) contra las configuradas, con sugerencia aplicable.
  const [calib, setCalib] = useState<{ tier: number; label: string; n: number; realAvg: number; configured: number; suggested: number }[] | null>(null)
  useEffect(() => {
    if (!settings) return
    const since = new Date(Date.now() - 60 * 86400000).toISOString()
    supabase.from('table_sessions').select('party_size, seated_at, closed_at')
      .eq('bu_id', buId).eq('status', 'closed').gte('seated_at', since)
      .then(({ data }) => {
        const rows = (data ?? []).filter(r => r.closed_at)
        const tiers = [...settings.durations].sort((a, b) => a.max_pax - b.max_pax)
        if (!rows.length || !tiers.length) { setCalib([]); return }
        const buckets = tiers.map(t => ({ t, mins: [] as number[] }))
        for (const r of rows) {
          const dur = (Date.parse(r.closed_at as string) - Date.parse(r.seated_at as string)) / 60000
          if (dur < 10 || dur > 600) continue // descarta ruido (cierres inmediatos u olvidados)
          const b = buckets.find(x => (r.party_size as number) <= x.t.max_pax) ?? buckets[buckets.length - 1]
          b.mins.push(dur)
        }
        setCalib(buckets.map((b, i) => {
          const n = b.mins.length
          const avg = n ? b.mins.reduce((s, x) => s + x, 0) / n : 0
          // sugerido = promedio real + 10% de colchón, redondeado a 15 min
          const suggested = n ? Math.max(30, Math.ceil((avg * 1.1) / 15) * 15) : b.t.minutes
          const lo = i === 0 ? 1 : tiers[i - 1].max_pax + 1
          return { tier: b.t.max_pax, label: `${lo}–${b.t.max_pax} pax`, n, realAvg: Math.round(avg), configured: b.t.minutes, suggested }
        }))
      })
  }, [buId, settings ? JSON.stringify(settings.durations) : '']) // eslint-disable-line react-hooks/exhaustive-deps

  async function applySuggested() {
    if (!settings || !calib) return
    const ds = settings.durations.map(d => {
      const c = calib.find(x => x.tier === d.max_pax)
      return c && c.n >= 5 ? { ...d, minutes: c.suggested } : d
    })
    await patchSettings({ durations: ds })
    showToast('Duraciones calibradas con los datos reales del piso.', 'success')
  }

  // Guardado inmediato de parámetros (upsert — la fila puede no existir aún)
  async function patchSettings(patch: Partial<ResSettings>) {
    if (!settings) return
    const next = { ...settings, ...patch }
    setSettings(next)
    const { error } = await supabase.from('venue_reservation_settings').upsert(next, { onConflict: 'bu_id' })
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); load(); return }
    onSaved()
  }

  useEffect(() => { load() }, [load])

  async function addCap(dow: number) {
    const { error } = await supabase.from('venue_capacity').insert({
      bu_id: buId, day_of_week: dow, max_reservations: 40, max_pax: 200, open_time: '18:00', close_time: '00:00', active: true,
    })
    if (error) { showToast(`No se pudo agregar: ${error.message}`, 'error'); return }
    load(); onSaved()
  }

  async function updateRow(row: CapRow, patch: Partial<CapRow>) {
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, ...patch } : r))
    const { error } = await supabase.from('venue_capacity').update(patch).eq('id', row.id)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); load(); return }
    onSaved()
  }

  async function deleteRow(row: CapRow) {
    setRows(rs => rs.filter(r => r.id !== row.id))
    const { error } = await supabase.from('venue_capacity').delete().eq('id', row.id)
    if (error) { showToast(`No se pudo quitar: ${error.message}`, 'error'); load(); return }
    onSaved()
  }

  // Atajo copiar-semana: replica el cupo de un día en los otros 6
  async function copyToWeek(dow: number) {
    const src = rows.find(r => r.day_of_week === dow)
    if (!src) return
    const payload = Array.from({ length: 7 }, (_, d) => d).filter(d => d !== dow)
      .map(d => ({ bu_id: buId, day_of_week: d, max_reservations: src.max_reservations, max_pax: src.max_pax, open_time: src.open_time, close_time: src.close_time, active: src.active }))
    const { error } = await supabase.from('venue_capacity').upsert(payload, { onConflict: 'bu_id,day_of_week' })
    if (error) { showToast(`No se pudo copiar: ${error.message}`, 'error'); return }
    showToast(`${DAYS_ES[dow]} copiado a toda la semana.`, 'success')
    load(); onSaved()
  }

  const numStyle: React.CSSProperties = {
    width: '100%', minHeight: 38, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)', padding: '0 6px', fontSize: 13, color: 'var(--text-primary)',
    outline: 'none', textAlign: 'center', boxSizing: 'border-box',
  }
  const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 }
  const fieldLbl: React.CSSProperties = { fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', textAlign: 'center' }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={480}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <div>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Capacidad y horario · {buCode}</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '2px 0 0' }}>Cupo total y horario por día. Pax = cupo total del venue esa noche. Sin fila = sin límite.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[56, 56, 56].map((h, i) => <div key={i} className="animate-pulse-green" style={{ height: h, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DAYS_ES.map((dayName, dow) => {
              const row = rows.find(r => r.day_of_week === dow)
              return (
                <div key={dow} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '10px 12px', opacity: row && !row.active ? 0.5 : 1 }}>
                  {/* fila 1: día + activo + acciones */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{dayName}</span>
                    {row ? (
                      <>
                        <button onClick={() => updateRow(row, { active: !row.active })} role="switch" aria-checked={row.active}
                          style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: row.active ? 'var(--accent)' : 'var(--bg-base)', position: 'relative', flexShrink: 0 }}>
                          <span style={{ position: 'absolute', top: 3, left: row.active ? 22 : 3, width: 20, height: 20, borderRadius: '50%', background: row.active ? 'var(--on-accent)' : 'var(--border-strong)', transition: 'left 0.15s' }} />
                        </button>
                        <button onClick={() => copyToWeek(dow)} title="Copiar a toda la semana" aria-label="Copiar a toda la semana"
                          style={{ width: 34, height: 34, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                          <Copy size={13} />
                        </button>
                        <button onClick={() => deleteRow(row)} aria-label="Quitar límite"
                          style={{ width: 34, height: 34, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => addCap(dow)}
                        style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer' }}>
                        Sin límite — Agregar
                      </button>
                    )}
                  </div>
                  {/* fila 2: campos */}
                  {row && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
                      <label style={fieldWrap}><span style={fieldLbl}>Reservas</span>
                        <input type="number" inputMode="numeric" defaultValue={row.max_reservations} className="num" style={numStyle}
                          onBlur={e => { const v = Math.max(0, Number(e.target.value)); if (v !== row.max_reservations) updateRow(row, { max_reservations: v }) }} /></label>
                      <label style={fieldWrap}><span style={fieldLbl}>Cupo total</span>
                        <input type="number" inputMode="numeric" defaultValue={row.max_pax} className="num" style={numStyle}
                          onBlur={e => { const v = Math.max(0, Number(e.target.value)); if (v !== row.max_pax) updateRow(row, { max_pax: v }) }} /></label>
                      <label style={fieldWrap}><span style={fieldLbl}>Abre</span>
                        <input type="time" defaultValue={row.open_time ?? ''} style={numStyle}
                          onBlur={e => { const v = e.target.value || null; if (v !== row.open_time) updateRow(row, { open_time: v }) }} /></label>
                      <label style={fieldWrap}><span style={fieldLbl}>Cierra</span>
                        <input type="time" defaultValue={row.close_time ?? ''} style={numStyle}
                          onBlur={e => { const v = e.target.value || null; if (v !== row.close_time) updateRow(row, { close_time: v }) }} /></label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Motor por mesas (Fase 3): parámetros de reserva del venue ── */}
        {!loading && settings && (
          <div style={{ marginTop: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Motor por mesas</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Horarios en slots y mesa auto-asignada. Requiere el piso configurado en el Editor de piso.</div>
              </div>
              <button onClick={() => patchSettings({ engine: settings.engine === 'tables' ? 'night' : 'tables' })} role="switch" aria-checked={settings.engine === 'tables'}
                style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: settings.engine === 'tables' ? 'var(--accent)' : 'var(--bg-base)', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: settings.engine === 'tables' ? 22 : 3, width: 20, height: 20, borderRadius: '50%', background: settings.engine === 'tables' ? 'var(--on-accent)' : 'var(--border-strong)', transition: 'left 0.15s' }} />
              </button>
            </div>

            {settings.engine === 'tables' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <label style={fieldWrap}><span style={fieldLbl}>Slot (min)</span>
                    <select value={settings.slot_minutes} onChange={e => patchSettings({ slot_minutes: Number(e.target.value) as 15 | 30 | 60 })} style={{ ...numStyle, cursor: 'pointer' }}>
                      <option value={15}>15</option><option value={30}>30</option><option value={60}>60</option>
                    </select></label>
                  <label style={fieldWrap}><span style={fieldLbl}>Buffer (min)</span>
                    <input type="number" inputMode="numeric" defaultValue={settings.buffer_minutes} className="num" style={numStyle}
                      onBlur={e => { const v = Math.max(0, Number(e.target.value)); if (v !== settings.buffer_minutes) patchSettings({ buffer_minutes: v }) }} /></label>
                  <label style={fieldWrap} title="Pax nuevos máximos por slot (ritmo de cocina). 0 = sin límite"><span style={fieldLbl}>Pacing pax</span>
                    <input type="number" inputMode="numeric" defaultValue={settings.pacing_max_pax} className="num" style={numStyle}
                      onBlur={e => { const v = Math.max(0, Number(e.target.value)); if (v !== settings.pacing_max_pax) patchSettings({ pacing_max_pax: v }) }} /></label>
                  <label style={fieldWrap} title="% de la capacidad del piso reservable en línea (web y bot)"><span style={fieldLbl}>% en línea</span>
                    <input type="number" inputMode="numeric" min={0} max={100} defaultValue={settings.online_pct} className="num" style={numStyle}
                      onBlur={e => { const v = Math.min(100, Math.max(0, Number(e.target.value))); if (v !== settings.online_pct) patchSettings({ online_pct: v }) }} /></label>
                  <label style={fieldWrap} title="Grupo máximo que puede reservar en línea; mayores los atiende el equipo"><span style={fieldLbl}>Grupo máx online</span>
                    <input type="number" inputMode="numeric" min={1} defaultValue={settings.online_max_pax} className="num" style={numStyle}
                      onBlur={e => { const v = Math.max(1, Number(e.target.value)); if (v !== settings.online_max_pax) patchSettings({ online_max_pax: v }) }} /></label>
                  <label style={fieldWrap} title="Minutos de tolerancia antes de liberar la mesa por no-show (Fase 4)"><span style={fieldLbl}>Tolerancia (min)</span>
                    <input type="number" inputMode="numeric" min={0} defaultValue={settings.no_show_hold_minutes} className="num" style={numStyle}
                      onBlur={e => { const v = Math.max(0, Number(e.target.value)); if (v !== settings.no_show_hold_minutes) patchSettings({ no_show_hold_minutes: v }) }} /></label>
                </div>

                {/* Duraciones por tamaño de grupo */}
                <div>
                  <span style={{ ...fieldLbl, textAlign: 'left', display: 'block', marginBottom: 6 }}>Duración de la mesa por tamaño de grupo</span>
                  {settings.durations.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>hasta</span>
                      <input type="number" inputMode="numeric" min={1} value={d.max_pax} className="num" style={{ ...numStyle, width: 56 }}
                        onChange={e => {
                          const ds = settings.durations.map((x, j) => j === i ? { ...x, max_pax: Math.max(1, Number(e.target.value)) } : x)
                          setSettings({ ...settings, durations: ds })
                        }}
                        onBlur={() => patchSettings({ durations: [...settings.durations].sort((a, b) => a.max_pax - b.max_pax) })} />
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>pax →</span>
                      <input type="number" inputMode="numeric" min={15} step={15} value={d.minutes} className="num" style={{ ...numStyle, width: 64 }}
                        onChange={e => {
                          const ds = settings.durations.map((x, j) => j === i ? { ...x, minutes: Math.max(15, Number(e.target.value)) } : x)
                          setSettings({ ...settings, durations: ds })
                        }}
                        onBlur={() => patchSettings({ durations: settings.durations })} />
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1 }}>min</span>
                      {settings.durations.length > 1 && (
                        <button onClick={() => patchSettings({ durations: settings.durations.filter((_, j) => j !== i) })} aria-label="Quitar duración"
                          style={{ width: 30, height: 30, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><Trash2 size={12} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => {
                    const last = settings.durations[settings.durations.length - 1]
                    patchSettings({ durations: [...settings.durations, { max_pax: (last?.max_pax ?? 4) + 2, minutes: (last?.minutes ?? 120) + 30 }] })
                  }}
                    style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer' }}>
                    + Rango
                  </button>
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: 0 }}>
                  Con el motor activo, las horas se ofrecen en slots y cada reserva recibe mesa automáticamente (app, link público y bot usan el mismo cálculo). El cupo por día de arriba sigue siendo un tope general.
                </p>
              </div>
            )}

            {/* Fase 5 — Calibración: lo que el piso midió vs lo configurado */}
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                📐 Calibración <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 10 }}>· duración real de las mesas (últimos 60 días)</span>
              </div>
              {calib === null ? null : calib.length === 0 || calib.every(c => c.n === 0) ? (
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                  Aún sin cierres de mesa registrados — la vista Piso alimenta esto sola (sentar → cerrar mesa).
                </p>
              ) : (
                <>
                  {calib.map(c => {
                    const diff = c.suggested - c.configured
                    const notable = c.n >= 5 && Math.abs(diff) >= 15
                    return (
                      <div key={c.tier} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                        <span style={{ width: 76, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.label}</span>
                        <span className="num" style={{ flex: 1, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          {c.n ? `real prom. ${c.realAvg} min (${c.n} cierres)` : 'sin datos'}
                        </span>
                        <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>config. {c.configured}</span>
                        {c.n >= 5 && (
                          <span className="num" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: notable ? 'var(--status-attention)' : 'var(--status-healthy)' }}>
                            → {c.suggested}
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {calib.some(c => c.n >= 5 && c.suggested !== c.configured) && (
                    <button onClick={applySuggested}
                      style={{ marginTop: 8, width: '100%', minHeight: 40, borderRadius: 999, border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Aplicar duraciones sugeridas (solo rangos con 5+ cierres)
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
