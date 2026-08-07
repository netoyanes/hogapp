import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X, GripHorizontal } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { Sheet, StatusBadgeV2, showToast } from '../v2'

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR DE PISO (Fase 1) — el gerente arma el plano de su venue:
// zonas (mesas o barra) y mobiliario arrastrable en un lienzo por zona.
// La capacidad total del venue se calcula sola sumando el mobiliario activo.
// En Fase 2 este mismo plano se vuelve la vista operativa con estados en vivo.
// ─────────────────────────────────────────────────────────────────────────────

interface Zone {
  id: string; bu_id: string; name: string; kind: 'mesas' | 'barra'
  reservable_online: boolean; priority: number
  open_time: string | null; close_time: string | null
  status: 'active' | 'closed'; bar_seats: number
}
interface TableRow {
  id: string; zone_id: string; name: string; min_pax: number; max_pax: number
  shape: 'square' | 'round' | 'booth' | 'lounge' | 'high'
  x: number; y: number; w: number; h: number; active: boolean
  section: string | null   // sección/estación del mesero ("A", "Terraza"…)
}
interface Combo { id: string; zone_id: string; name: string; table_ids: string[]; min_pax: number; max_pax: number }

const SHAPES: { id: TableRow['shape']; label: string }[] = [
  { id: 'square', label: 'Mesa' },
  { id: 'round', label: 'Redonda' },
  { id: 'high', label: 'Mesa alta' },
  { id: 'booth', label: 'Booth' },
  { id: 'lounge', label: 'Lounge' },
]

export function FloorEditor({ buId, buCode, onClose }: { buId: string; buCode: string; onClose: () => void }) {
  const isMobile = useIsMobile()
  const [zones, setZones] = useState<Zone[]>([])
  const [tables, setTables] = useState<TableRow[]>([])
  const [combos, setCombos] = useState<Combo[]>([])
  const [zoneId, setZoneId] = useState('')
  const [addingZone, setAddingZone] = useState(false)
  const [zName, setZName] = useState('')
  const [zKind, setZKind] = useState<'mesas' | 'barra'>('mesas')
  const [editTable, setEditTable] = useState<TableRow | null>(null)
  const [comboSel, setComboSel] = useState<Set<string>>(new Set())
  const canvasRef = useRef<HTMLDivElement>(null)
  // drag state (refs para no re-render en cada move)
  const drag = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  const load = useCallback(async () => {
    const [{ data: z }, { data: t }, { data: c }] = await Promise.all([
      supabase.from('venue_zones').select('*').eq('bu_id', buId).order('priority').order('created_at'),
      supabase.from('venue_tables').select('*').eq('bu_id', buId),
      supabase.from('table_combinations').select('*').eq('bu_id', buId),
    ])
    setZones((z ?? []) as Zone[])
    setTables((t ?? []) as TableRow[])
    setCombos((c ?? []) as Combo[])
    setZoneId(prev => prev || (z ?? [])[0]?.id || '')
  }, [buId])

  useEffect(() => { load() }, [load])

  const zone = zones.find(z => z.id === zoneId) ?? null
  const zoneTables = tables.filter(t => t.zone_id === zoneId)
  const zoneCombos = combos.filter(c => c.zone_id === zoneId)

  // Capacidad calculada — nunca se teclea a mano
  const capOf = (z: Zone) => z.kind === 'barra'
    ? (z.status === 'active' ? z.bar_seats : 0)
    : tables.filter(t => t.zone_id === z.id && t.active).reduce((s, t) => s + t.max_pax, z.status === 'active' ? 0 : -tables.filter(t => t.zone_id === z.id && t.active).reduce((s2, t) => s2 + t.max_pax, 0))
  const totalCap = zones.reduce((s, z) => s + Math.max(0, capOf(z)), 0)

  // ── Zonas ──────────────────────────────────────────────────────────────────
  async function addZone() {
    if (!zName.trim()) return
    const { data, error } = await supabase.from('venue_zones').insert({
      bu_id: buId, name: zName.trim(), kind: zKind, priority: zones.length,
      bar_seats: zKind === 'barra' ? 10 : 0,
    }).select('*').single()
    if (error) { showToast(`No se pudo crear: ${error.message}`, 'error'); return }
    setZones(prev => [...prev, data as Zone]); setZoneId(data.id)
    setZName(''); setAddingZone(false)
  }
  async function patchZone(z: Zone, patch: Partial<Zone>) {
    setZones(prev => prev.map(p => p.id === z.id ? { ...p, ...patch } : p))
    const { error } = await supabase.from('venue_zones').update(patch).eq('id', z.id)
    if (error) { showToast(`No se pudo guardar: ${error.message}`, 'error'); load() }
  }
  async function deleteZone(z: Zone) {
    if (!window.confirm(`¿Eliminar la zona "${z.name}" y sus mesas?`)) return
    await supabase.from('venue_zones').delete().eq('id', z.id)
    setZoneId(''); load()
  }

  // ── Mesas ──────────────────────────────────────────────────────────────────
  async function addTable() {
    if (!zone) return
    const n = zoneTables.length + 1
    const { data, error } = await supabase.from('venue_tables').insert({
      bu_id: buId, zone_id: zone.id, name: `M${n}`, min_pax: 2, max_pax: 4,
      x: 40 + (n % 3) * 6, y: 40 + (n % 4) * 5, w: 13, h: 13,
    }).select('*').single()
    if (error) { showToast(`No se pudo agregar: ${error.message}`, 'error'); return }
    setTables(prev => [...prev, data as TableRow])
  }
  async function patchTable(id: string, patch: Partial<TableRow>) {
    setTables(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    const { error } = await supabase.from('venue_tables').update(patch).eq('id', id)
    if (error) { showToast('No se pudo guardar la mesa', 'error'); load() }
  }
  async function deleteTable(id: string) {
    await supabase.from('venue_tables').delete().eq('id', id)
    setTables(prev => prev.filter(t => t.id !== id))
    setEditTable(null)
  }

  // ── Drag en el lienzo ──────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent, t: TableRow) {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { id: t.id, startX: e.clientX, startY: e.clientY, origX: t.x, origY: t.y, moved: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!d || !rect) return
    const dx = ((e.clientX - d.startX) / rect.width) * 100
    const dy = ((e.clientY - d.startY) / rect.height) * 100
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6) d.moved = true
    const t = tables.find(x => x.id === d.id)
    if (!t) return
    const nx = Math.min(100 - t.w, Math.max(0, d.origX + dx))
    const ny = Math.min(100 - t.h, Math.max(0, d.origY + dy))
    setTables(prev => prev.map(x => x.id === d.id ? { ...x, x: nx, y: ny } : x))
  }
  function onPointerUp(_e: React.PointerEvent, t: TableRow) {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) {
      const cur = tables.find(x => x.id === t.id)
      if (cur) supabase.from('venue_tables').update({ x: cur.x, y: cur.y }).eq('id', t.id).then(({ error }) => { if (error) showToast('No se pudo guardar la posición', 'error') })
    } else {
      setEditTable(tables.find(x => x.id === t.id) ?? null)
    }
  }

  // ── Combinaciones ──────────────────────────────────────────────────────────
  async function createCombo() {
    if (!zone || comboSel.size < 2) return
    const sel = zoneTables.filter(t => comboSel.has(t.id))
    const name = sel.map(t => t.name).join('+')
    const minP = Math.min(...sel.map(t => t.min_pax))
    const maxP = sel.reduce((s, t) => s + t.max_pax, 0)
    const { error } = await supabase.from('table_combinations').insert({
      bu_id: buId, zone_id: zone.id, name, table_ids: sel.map(t => t.id), min_pax: minP, max_pax: maxP,
    })
    if (error) { showToast(`No se pudo crear: ${error.message}`, 'error'); return }
    setComboSel(new Set()); load()
    showToast(`Combinación ${name} creada (${minP}–${maxP} pax)`, 'success')
  }
  async function deleteCombo(id: string) {
    await supabase.from('table_combinations').delete().eq('id', id)
    setCombos(prev => prev.filter(c => c.id !== id))
  }

  const inp: React.CSSProperties = {
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', padding: '8px 10px', fontSize: 13, outline: 'none', minHeight: 40, boxSizing: 'border-box',
  }

  const shapeStyle = (t: TableRow): React.CSSProperties => ({
    position: 'absolute', left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%`,
    borderRadius: t.shape === 'round' ? '50%' : t.shape === 'booth' ? '10px 10px 3px 3px' : t.shape === 'lounge' ? 14 : 6,
    background: t.active ? 'var(--bg-elevated)' : 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
    border: `2px solid ${comboSel.has(t.id) ? 'var(--accent)' : t.active ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    cursor: 'grab', touchAction: 'none', userSelect: 'none',
    opacity: t.active ? 1 : 0.5,
  })

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={760}>
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800, margin: 0 }}>Editor de piso · {buCode}</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 11, margin: '2px 0 0' }}>
              Capacidad total calculada: <strong style={{ color: 'var(--accent)' }}>{totalCap} pax</strong> — se suma sola del mobiliario activo.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 8 }}><X size={18} /></button>
        </div>

        {/* Zonas */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {zones.map(z => (
            <button key={z.id} onClick={() => setZoneId(z.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
                background: zoneId === z.id ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                border: `1px solid ${zoneId === z.id ? 'var(--accent-border)' : 'var(--border-default)'}`,
                color: zoneId === z.id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700,
                opacity: z.status === 'closed' ? 0.55 : 1,
              }}>
              {z.name} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{Math.max(0, capOf(z))}</span>
              {z.status === 'closed' && '· cerrada'}
            </button>
          ))}
          {addingZone ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input autoFocus value={zName} onChange={e => setZName(e.target.value)} placeholder="Nombre de la zona" style={{ ...inp, width: 150 }}
                onKeyDown={e => { if (e.key === 'Enter') addZone() }} />
              <select value={zKind} onChange={e => setZKind(e.target.value as 'mesas' | 'barra')} style={{ ...inp, cursor: 'pointer' }}>
                <option value="mesas">Mesas</option>
                <option value="barra">Barra</option>
              </select>
              <button onClick={addZone} style={{ ...inp, cursor: 'pointer', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', fontWeight: 700 }}>Crear</button>
            </span>
          ) : (
            <button onClick={() => setAddingZone(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 999, border: '1px dashed var(--border-default)', background: 'none', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer' }}>
              <Plus size={13} /> Zona
            </button>
          )}
        </div>

        {zone && (
          <>
            {/* Config de la zona */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={zone.reservable_online} onChange={e => patchZone(zone, { reservable_online: e.target.checked })} />
                Reservable en línea
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                Prioridad
                <input type="number" value={zone.priority} onChange={e => patchZone(zone, { priority: Number(e.target.value) })} style={{ ...inp, width: 60, minHeight: 34, textAlign: 'center' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                Abre <input type="time" value={zone.open_time ?? ''} onChange={e => patchZone(zone, { open_time: e.target.value || null })} style={{ ...inp, minHeight: 34 }} />
                Cierra <input type="time" value={zone.close_time ?? ''} onChange={e => patchZone(zone, { close_time: e.target.value || null })} style={{ ...inp, minHeight: 34 }} />
              </label>
              <button onClick={() => patchZone(zone, { status: zone.status === 'active' ? 'closed' : 'active' })}
                style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: zone.status === 'active' ? 'color-mix(in srgb, var(--status-healthy) 15%, transparent)' : 'color-mix(in srgb, var(--status-risk) 15%, transparent)', color: zone.status === 'active' ? 'var(--status-healthy)' : 'var(--status-risk)' }}>
                {zone.status === 'active' ? 'Abierta' : 'Cerrada temporalmente'}
              </button>
              <button onClick={() => deleteZone(zone)} title="Eliminar zona" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 6 }}><Trash2 size={14} /></button>
            </div>

            {zone.kind === 'barra' ? (
              /* ── Barra: contador de asientos ── */
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <GripHorizontal size={18} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>Asientos de barra (se administran por contador, no por mesas)</span>
                <input type="number" min={0} value={zone.bar_seats}
                  onChange={e => patchZone(zone, { bar_seats: Math.max(0, Number(e.target.value)) })}
                  style={{ ...inp, width: 80, textAlign: 'center', fontSize: 16, fontWeight: 700 }} />
              </div>
            ) : (
              /* ── Mesas: lienzo drag-and-drop ── */
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={addTable}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={13} /> Mesa
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Arrastra para acomodar · toca una mesa para editarla</span>
                </div>
                <div ref={canvasRef}
                  style={{
                    position: 'relative', width: '100%', aspectRatio: '4 / 3',
                    background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
                    backgroundImage: 'radial-gradient(circle, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '24px 24px',
                    overflow: 'hidden',
                  }}>
                  {zoneTables.map(t => (
                    <div key={t.id} style={shapeStyle(t)}
                      onPointerDown={e => onPointerDown(e, t)} onPointerMove={onPointerMove} onPointerUp={e => onPointerUp(e, t)}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', pointerEvents: 'none' }}>{t.name}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>{t.min_pax}–{t.max_pax}</span>
                    </div>
                  ))}
                  {zoneTables.length === 0 && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                      Agrega tu primera mesa con “+ Mesa”
                    </div>
                  )}
                </div>

                {/* Combinaciones */}
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                    Combinaciones (mesas contiguas que se juntan)
                  </div>
                  {zoneCombos.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{c.min_pax}–{c.max_pax} pax</span>
                      <button onClick={() => deleteCombo(c.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                    {zoneTables.map(t => (
                      <button key={t.id} onClick={() => setComboSel(prev => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })}
                        style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: comboSel.has(t.id) ? 'var(--accent-bg)' : 'var(--bg-base)', border: `1px solid ${comboSel.has(t.id) ? 'var(--accent)' : 'var(--border-subtle)'}`, color: comboSel.has(t.id) ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {t.name}
                      </button>
                    ))}
                    <button onClick={createCombo} disabled={comboSel.size < 2}
                      style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: comboSel.size >= 2 ? 'pointer' : 'not-allowed', background: comboSel.size >= 2 ? 'var(--accent)' : 'var(--bg-base)', color: comboSel.size >= 2 ? 'var(--on-accent)' : 'var(--text-tertiary)', border: 'none' }}>
                      Combinar {comboSel.size >= 2 ? `(${comboSel.size})` : ''}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {zones.length === 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            Empieza creando tu primera zona (ej. “Sala 1”, “Terraza”, “Barra”).
          </p>
        )}
      </div>

      {/* Editar mesa */}
      {editTable && (
        <div onClick={() => setEditTable(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 18, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <strong style={{ color: 'var(--text-primary)', fontSize: 15, flex: 1 }}>Mesa {editTable.name}</strong>
              <StatusBadgeV2 tone={editTable.active ? 'healthy' : 'neutral'} label={editTable.active ? 'Activa' : 'Inactiva'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Nombre
                <input value={editTable.name} onChange={e => setEditTable({ ...editTable, name: e.target.value })} style={{ ...inp, width: '100%', marginTop: 4 }} /></label>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Tipo
                <select value={editTable.shape} onChange={e => setEditTable({ ...editTable, shape: e.target.value as TableRow['shape'] })} style={{ ...inp, width: '100%', marginTop: 4, cursor: 'pointer' }}>
                  {SHAPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select></label>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Capacidad mín
                <input type="number" min={1} value={editTable.min_pax} onChange={e => setEditTable({ ...editTable, min_pax: Math.max(1, Number(e.target.value)) })} style={{ ...inp, width: '100%', marginTop: 4 }} /></label>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Capacidad máx
                <input type="number" min={1} value={editTable.max_pax} onChange={e => setEditTable({ ...editTable, max_pax: Math.max(1, Number(e.target.value)) })} style={{ ...inp, width: '100%', marginTop: 4 }} /></label>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)', gridColumn: '1 / -1' }}>Sección (estación del mesero)
                <input value={editTable.section ?? ''} onChange={e => setEditTable({ ...editTable, section: e.target.value })} placeholder="A, B, Terraza…" style={{ ...inp, width: '100%', marginTop: 4 }} /></label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={editTable.active} onChange={e => setEditTable({ ...editTable, active: e.target.checked })} />
              Mesa activa (cuenta para la capacidad)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                if (editTable.min_pax > editTable.max_pax) { showToast('La capacidad mínima no puede ser mayor que la máxima.', 'error'); return }
                patchTable(editTable.id, { name: editTable.name.trim() || editTable.name, shape: editTable.shape, min_pax: editTable.min_pax, max_pax: editTable.max_pax, active: editTable.active, section: editTable.section?.trim() || null })
                setEditTable(null)
              }}
                style={{ flex: 1, background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 999, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Guardar
              </button>
              <button onClick={() => { if (window.confirm(`¿Eliminar la mesa ${editTable.name}?`)) deleteTable(editTable.id) }}
                style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 999, padding: '0 14px', color: 'var(--status-risk)', cursor: 'pointer' }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}
