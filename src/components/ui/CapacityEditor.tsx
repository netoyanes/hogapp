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
  active: boolean
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

  const load = useCallback(async () => {
    const { data } = await supabase.from('venue_capacity').select('*').eq('bu_id', buId).order('day_of_week')
    setRows((data ?? []) as CapRow[])
    setLoading(false)
  }, [buId])

  useEffect(() => { load() }, [load])

  async function addCap(dow: number) {
    const { error } = await supabase.from('venue_capacity').insert({
      bu_id: buId, day_of_week: dow, max_reservations: 40, max_pax: 200, active: true,
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
      .map(d => ({ bu_id: buId, day_of_week: d, max_reservations: src.max_reservations, max_pax: src.max_pax, active: src.active }))
    const { error } = await supabase.from('venue_capacity').upsert(payload, { onConflict: 'bu_id,day_of_week' })
    if (error) { showToast(`No se pudo copiar: ${error.message}`, 'error'); return }
    showToast(`${DAYS_ES[dow]} copiado a toda la semana.`, 'success')
    load(); onSaved()
  }

  const numStyle: React.CSSProperties = {
    width: 72, minHeight: 40, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 13, color: 'var(--text-primary)',
    outline: 'none', textAlign: 'center', boxSizing: 'border-box',
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={480}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4) var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) 0' }}>
          <div>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, margin: 0 }}>Capacidad · {buCode}</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '2px 0 0' }}>Cupo total por noche — sin horarios. Sin fila = sin límite ese día.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[56, 56, 56].map((h, i) => <div key={i} className="animate-pulse-green" style={{ height: h, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* encabezados */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              <span style={{ flex: 1 }}>Día</span>
              <span style={{ width: 72, textAlign: 'center' }}>Reservas</span>
              <span style={{ width: 72, textAlign: 'center' }}>Pax</span>
              <span style={{ width: 44, textAlign: 'center' }}>Activo</span>
              <span style={{ width: 76 }} />
            </div>
            {DAYS_ES.map((dayName, dow) => {
              const row = rows.find(r => r.day_of_week === dow)
              return (
                <div key={dow} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '8px 10px', opacity: row && !row.active ? 0.5 : 1 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{dayName}</span>
                  {row ? (
                    <>
                      <input type="number" inputMode="numeric" defaultValue={row.max_reservations} className="num" style={numStyle}
                        onBlur={e => { const v = Math.max(0, Number(e.target.value)); if (v !== row.max_reservations) updateRow(row, { max_reservations: v }) }} />
                      <input type="number" inputMode="numeric" defaultValue={row.max_pax} className="num" style={numStyle}
                        onBlur={e => { const v = Math.max(0, Number(e.target.value)); if (v !== row.max_pax) updateRow(row, { max_pax: v }) }} />
                      <button onClick={() => updateRow(row, { active: !row.active })} role="switch" aria-checked={row.active}
                        style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: row.active ? 'var(--accent)' : 'var(--bg-base)', position: 'relative', flexShrink: 0 }}>
                        <span style={{ position: 'absolute', top: 3, left: row.active ? 22 : 3, width: 20, height: 20, borderRadius: '50%', background: row.active ? 'var(--on-accent)' : 'var(--border-strong)', transition: 'left 0.15s' }} />
                      </button>
                      <div style={{ width: 76, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <button onClick={() => copyToWeek(dow)} title="Copiar a toda la semana" aria-label="Copiar a toda la semana"
                          style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                          <Copy size={13} />
                        </button>
                        <button onClick={() => deleteRow(row)} aria-label="Quitar límite"
                          style={{ width: 36, height: 36, border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <button onClick={() => addCap(dow)}
                      style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 11, cursor: 'pointer' }}>
                      Sin límite — Agregar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}
