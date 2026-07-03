import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Copy, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { Sheet, showToast } from '../v2'

interface CapRow {
  id: string
  day_of_week: number
  time_slot: string
  max_reservations: number
  max_pax: number
  active: boolean
}

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Editor de capacidad por venue (Ops Manager+): filas día × slot con máximos
// y toggle activo. Sin mapas de mesas — solo slots. RLS restringe escritura.
export function CapacityEditor({ buId, buCode, onClose, onSaved }: {
  buId: string
  buCode: string
  onClose: () => void
  onSaved: () => void
}) {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState<CapRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newSlot, setNewSlot] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('venue_capacity').select('*').eq('bu_id', buId).order('day_of_week').order('time_slot')
    setRows((data ?? []) as CapRow[])
    setLoading(false)
  }, [buId])

  useEffect(() => { load() }, [load])

  async function addSlot(dow: number) {
    const slot = (newSlot[dow] ?? '').trim()
    if (!slot) return
    const { error } = await supabase.from('venue_capacity').insert({
      bu_id: buId, day_of_week: dow, time_slot: slot, max_reservations: 10, max_pax: 60, active: true,
    })
    if (error) { showToast(error.code === '23505' ? 'Ese slot ya existe para este día.' : `No se pudo agregar: ${error.message}`, 'error'); return }
    setNewSlot(p => ({ ...p, [dow]: '' }))
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
    if (error) { showToast(`No se pudo eliminar: ${error.message}`, 'error'); load(); return }
    onSaved()
  }

  // Atajo copiar-semana: replica los slots de un día en los otros 6
  async function copyToWeek(dow: number) {
    const src = rows.filter(r => r.day_of_week === dow)
    if (!src.length) return
    const payload = []
    for (let d = 0; d < 7; d++) {
      if (d === dow) continue
      for (const r of src) {
        payload.push({ bu_id: buId, day_of_week: d, time_slot: r.time_slot, max_reservations: r.max_reservations, max_pax: r.max_pax, active: r.active })
      }
    }
    const { error } = await supabase.from('venue_capacity').upsert(payload, { onConflict: 'bu_id,day_of_week,time_slot' })
    if (error) { showToast(`No se pudo copiar: ${error.message}`, 'error'); return }
    showToast(`${DAYS_ES[dow]} copiado a toda la semana.`, 'success')
    load(); onSaved()
  }

  const numStyle: React.CSSProperties = {
    width: 64, minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 13, color: 'var(--text-primary)',
    outline: 'none', textAlign: 'center', boxSizing: 'border-box',
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={520}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <div>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Capacidad · {buCode}</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '2px 0 0' }}>Máximos por slot. Sin filas = sin límite (slots default).</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[80, 80, 80].map((h, i) => <div key={i} className="animate-pulse-green" style={{ height: h, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {DAYS_ES.map((dayName, dow) => {
              const dayRows = rows.filter(r => r.day_of_week === dow)
              return (
                <div key={dow} style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: dayRows.length ? 8 : 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{dayName}</span>
                    <span className="num" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{dayRows.length} slots</span>
                    {dayRows.length > 0 && (
                      <button onClick={() => copyToWeek(dow)} title="Copiar este día a toda la semana"
                        style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-default)', background: 'none', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                        <Copy size={11} /> Copiar a la semana
                      </button>
                    )}
                  </div>

                  {dayRows.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                      {/* encabezados */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ flex: 1 }}>Slot</span>
                        <span style={{ width: 64, textAlign: 'center' }}>Reservas</span>
                        <span style={{ width: 64, textAlign: 'center' }}>Pax</span>
                        <span style={{ width: 44, textAlign: 'center' }}>Activo</span>
                        <span style={{ width: 36 }} />
                      </div>
                      {dayRows.map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: r.active ? 1 : 0.5 }}>
                          <span className="num" style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{r.time_slot}</span>
                          <input type="number" inputMode="numeric" defaultValue={r.max_reservations} className="num" style={numStyle}
                            onBlur={e => { const v = Math.max(0, Number(e.target.value)); if (v !== r.max_reservations) updateRow(r, { max_reservations: v }) }} />
                          <input type="number" inputMode="numeric" defaultValue={r.max_pax} className="num" style={numStyle}
                            onBlur={e => { const v = Math.max(0, Number(e.target.value)); if (v !== r.max_pax) updateRow(r, { max_pax: v }) }} />
                          <button onClick={() => updateRow(r, { active: !r.active })} role="switch" aria-checked={r.active}
                            style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: r.active ? 'var(--accent)' : 'var(--bg-base)', position: 'relative', flexShrink: 0 }}>
                            <span style={{ position: 'absolute', top: 3, left: r.active ? 22 : 3, width: 20, height: 20, borderRadius: '50%', background: r.active ? 'var(--on-accent)' : 'var(--border-strong)', transition: 'left 0.15s' }} />
                          </button>
                          <button onClick={() => deleteRow(r)} aria-label="Eliminar slot"
                            style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', flexShrink: 0 }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={newSlot[dow] ?? ''}
                      onChange={e => setNewSlot(p => ({ ...p, [dow]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addSlot(dow) }}
                      placeholder="Nuevo slot, ej. 19:00–20:30"
                      className="num"
                      style={{ flex: 1, minHeight: 40, background: 'var(--bg-base)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <button onClick={() => addSlot(dow)} disabled={!(newSlot[dow] ?? '').trim()}
                      style={{ minHeight: 40, padding: '0 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: (newSlot[dow] ?? '').trim() ? 'var(--accent)' : 'var(--bg-base)', color: (newSlot[dow] ?? '').trim() ? 'var(--on-accent)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}
