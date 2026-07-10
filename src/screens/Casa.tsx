// ─────────────────────────────────────────────────────────────────────────────
// LA CASA — operación de piso (Heart of House) · Fase A
// · HoH ve "Mi turno": sus puestas a punto de hoy + reportar problema.
// · Ops/Master administran: Hoy (revisión), Plantillas, Inventario, Incidencias.
// · C-Level entra en modo lectura.
// Un dato capturado (una foto de un item) alimenta las tres vistas.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Camera, Check, AlertTriangle, Plus, X, ChevronRight, Send, Undo2, CheckCircle2, Trash2, Boxes, ClipboardCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { BUChip, KPITile, SegmentedControl, Sheet, StatusBadgeV2, EmptyStateV2, showToast, type StatusTone } from '../components/v2'

interface BU { id: string; code: string; name: string }
interface Checklist { id: string; bu_id: string; name: string; frequency: string; active: boolean; sort: number }
interface ChecklistItem { id: string; checklist_id: string; label: string; area: string | null; requires_photo: boolean; sort: number }
interface Run {
  id: string; checklist_id: string; bu_id: string; date: string
  status: 'in_progress' | 'submitted' | 'approved' | 'returned'
  started_by: string | null; review_note: string | null
}
interface RunItem { id: string; run_id: string; item_id: string; status: 'pending' | 'done' | 'issue'; photo_url: string | null; note: string | null }
interface Asset {
  id: string; bu_id: string; folio: string | null; name: string; category: string; area: string | null
  brand: string | null; model: string | null; serial: string | null; cost: number | null
  condition: string; photo_url: string | null; notes: string | null
}
interface Incident {
  id: string; bu_id: string; area: string | null; description: string; photo_url: string | null
  status: 'open' | 'task_created' | 'resolved'; task_id: string | null; reported_by: string | null; created_at: string
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function uploadCasaPhoto(file: File, prefix: string): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `casa/${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('proofs').upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })
  if (error) { showToast('No se pudo subir la foto', 'error'); return null }
  return supabase.storage.from('proofs').getPublicUrl(path).data.publicUrl
}

const RUN_STATUS: Record<Run['status'], { label: string; tone: StatusTone }> = {
  in_progress: { label: 'En curso',   tone: 'attention' },
  submitted:   { label: 'Por revisar', tone: 'accent' },
  approved:    { label: 'Aprobada',   tone: 'healthy' },
  returned:    { label: 'Regresada',  tone: 'risk' },
}
const FREQ_LABEL: Record<string, string> = { daily: 'Diaria', opening: 'Apertura', closing: 'Cierre', weekly: 'Semanal' }
const CATEGORIES = [
  { id: 'MOBILIARIO',    label: 'Mobiliario' },
  { id: 'HARDWARE_AV',   label: 'Hardware AV' },
  { id: 'COCINA',        label: 'Cocina' },
  { id: 'REFRIGERACION', label: 'Refrigeración' },
  { id: 'COMPUTO',       label: 'Cómputo' },
  { id: 'DECORACION',    label: 'Decoración' },
  { id: 'OTRO',          label: 'Otro' },
]
const CONDITIONS: { id: string; label: string; tone: StatusTone }[] = [
  { id: 'GOOD',    label: 'Bueno',         tone: 'healthy' },
  { id: 'FAIR',    label: 'Regular',       tone: 'attention' },
  { id: 'DAMAGED', label: 'Dañado',        tone: 'risk' },
  { id: 'REPAIR',  label: 'En reparación', tone: 'accent' },
  { id: 'RETIRED', label: 'Baja',          tone: 'neutral' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)', padding: '10px 12px', color: 'var(--text-primary)',
  fontSize: '14px', minHeight: '44px', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px',
}
const btnPrimary: React.CSSProperties = {
  background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius-md)',
  padding: '12px 16px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', minHeight: '44px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
}
const btnGhost: React.CSSProperties = {
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)', padding: '12px 16px', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
  minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
}

// ═════════════════════════════════════════════════════════════════════════════
export function Casa({ userId, userRole, initialReport }: { userId?: string; userRole?: string; initialReport?: boolean }) {
  const isMobile = useIsMobile()
  const isHoH = userRole === 'HEART_OF_HOUSE'
  const canWrite = userRole === 'MASTER' || userRole === 'OPS_MANAGER'

  const [bus, setBus] = useState<BU[]>([])
  const [myBuIds, setMyBuIds] = useState<Set<string> | null>(null) // null = sin restricción
  const [reportOpen, setReportOpen] = useState(!!initialReport)

  useEffect(() => { setReportOpen(!!initialReport) }, [initialReport])

  useEffect(() => {
    void (async () => {
      const [{ data: buData }, { data: uv }] = await Promise.all([
        supabase.from('business_units').select('id, code, name').order('name'),
        userId ? supabase.from('user_venues').select('bu_id').eq('user_id', userId) : Promise.resolve({ data: null }),
      ])
      setBus(buData ?? [])
      setMyBuIds(uv?.length ? new Set(uv.map(v => v.bu_id)) : null)
    })()
  }, [userId])

  const visibleBus = useMemo(
    () => (myBuIds && (isHoH || userRole === 'OPS_MANAGER')) ? bus.filter(b => myBuIds.has(b.id)) : bus,
    [bus, myBuIds, isHoH, userRole],
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '960px', margin: '0 auto' }}>
        {isHoH
          ? <MiTurno bus={visibleBus} userId={userId} isMobile={isMobile} onReport={() => setReportOpen(true)} />
          : <CasaAdmin bus={visibleBus} userId={userId} isMobile={isMobile} canWrite={canWrite} />}
      </div>
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} bus={visibleBus} userId={userId} isMobile={isMobile} />
    </div>
  )
}

// ═══ MI TURNO (Heart of House) ═══════════════════════════════════════════════
function MiTurno({ bus, userId, isMobile, onReport }: { bus: BU[]; userId?: string; isMobile: boolean; onReport: () => void }) {
  const [buId, setBuId] = useState('')
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [runItems, setRunItems] = useState<RunItem[]>([])
  const [openChecklist, setOpenChecklist] = useState<Checklist | null>(null)

  useEffect(() => { if (!buId && bus.length) setBuId(bus[0].id) }, [bus, buId])

  const load = useCallback(async () => {
    if (!buId) return
    const { data: cls } = await supabase.from('venue_checklists')
      .select('*').eq('bu_id', buId).eq('active', true).order('sort').order('name')
    const ids = (cls ?? []).map(c => c.id)
    const [{ data: its }, { data: rns }] = await Promise.all([
      ids.length ? supabase.from('venue_checklist_items').select('*').in('checklist_id', ids).order('sort') : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('checklist_runs').select('*').in('checklist_id', ids).eq('date', todayISO()) : Promise.resolve({ data: [] }),
    ])
    const runIds = (rns ?? []).map(r => r.id)
    const { data: ris } = runIds.length
      ? await supabase.from('checklist_run_items').select('*').in('run_id', runIds)
      : { data: [] }
    setChecklists(cls ?? []); setItems(its ?? []); setRuns(rns ?? []); setRunItems(ris ?? [])
  }, [buId])

  useEffect(() => { void load() }, [load])

  const bu = bus.find(b => b.id === buId)
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Mi turno</h1>
        <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{fecha}</span>
      </div>

      {bus.length > 1 && (
        <SegmentedControl scrollable value={buId} onChange={setBuId}
          options={bus.map(b => ({ id: b.id, label: b.name }))} />
      )}

      {checklists.length === 0 ? (
        <EmptyStateV2 icon={<ClipboardCheck size={28} />} title="Sin puestas a punto configuradas para este venue — pídele a tu Ops Manager que las cree." />
      ) : (
        checklists.map(cl => {
          const clItems = items.filter(i => i.checklist_id === cl.id)
          const run = runs.find(r => r.checklist_id === cl.id)
          const ris = run ? runItems.filter(ri => ri.run_id === run.id) : []
          const done = ris.filter(ri => ri.status !== 'pending').length
          const st = run ? RUN_STATUS[run.status] : { label: 'Sin empezar', tone: 'neutral' as StatusTone }
          const pct = clItems.length ? Math.round((done / clItems.length) * 100) : 0
          return (
            <button key={cl.id} onClick={() => setOpenChecklist(cl)}
              style={{
                textAlign: 'left', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)', padding: '16px', cursor: 'pointer', minHeight: '72px',
                display: 'flex', alignItems: 'center', gap: '14px',
              }}>
              <ProgressRing pct={run ? pct : 0} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{cl.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  {FREQ_LABEL[cl.frequency] ?? cl.frequency} · {done}/{clItems.length} listos
                </div>
                {run?.status === 'returned' && run.review_note && (
                  <div style={{ fontSize: '12px', color: 'var(--status-risk)', marginTop: '4px' }}>↩ {run.review_note}</div>
                )}
              </div>
              <StatusBadgeV2 tone={st.tone} label={st.label} />
              <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            </button>
          )
        })
      )}

      <button onClick={onReport} style={{ ...btnGhost, borderColor: 'color-mix(in srgb, var(--status-risk) 40%, transparent)', color: 'var(--status-risk)' }}>
        <AlertTriangle size={16} /> Reportar un problema
      </button>

      {openChecklist && bu && (
        <RunSheet
          checklist={openChecklist} bu={bu} userId={userId} isMobile={isMobile}
          reviewMode={false}
          onClose={() => { setOpenChecklist(null); void load() }}
        />
      )}
    </div>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 16, c = 2 * Math.PI * r
  const color = pct >= 100 ? 'var(--status-healthy)' : pct > 0 ? 'var(--accent)' : 'var(--border-subtle)'
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--border-subtle)" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text-secondary)" fontFamily="var(--font-mono)">{pct}%</text>
    </svg>
  )
}

// ═══ RUN SHEET — ejecutar una puesta a punto (y revisarla, para Ops) ══════════
function RunSheet({ checklist, bu, userId, isMobile, reviewMode, onClose }: {
  checklist: Checklist; bu: BU; userId?: string; isMobile: boolean; reviewMode: boolean; onClose: () => void
}) {
  const [run, setRun] = useState<Run | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [runItems, setRunItems] = useState<Record<string, RunItem>>({}) // key: item_id
  const [issueFor, setIssueFor] = useState<ChecklistItem | null>(null)
  const [issueNote, setIssueNote] = useState('')
  const [issueFile, setIssueFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data: its } = await supabase.from('venue_checklist_items')
        .select('*').eq('checklist_id', checklist.id).order('sort')
      setItems(its ?? [])
      let { data: existing } = await supabase.from('checklist_runs')
        .select('*').eq('checklist_id', checklist.id).eq('date', todayISO()).maybeSingle()
      if (!existing && !reviewMode) {
        const { data: created } = await supabase.from('checklist_runs')
          .insert({ checklist_id: checklist.id, bu_id: bu.id, date: todayISO(), started_by: userId ?? null })
          .select('*').maybeSingle()
        // carrera benigna: si otro turno la creó al mismo tiempo, se relee
        existing = created ?? (await supabase.from('checklist_runs')
          .select('*').eq('checklist_id', checklist.id).eq('date', todayISO()).maybeSingle()).data
      }
      setRun(existing ?? null)
      if (existing) {
        const { data: ris } = await supabase.from('checklist_run_items').select('*').eq('run_id', existing.id)
        setRunItems(Object.fromEntries((ris ?? []).map(ri => [ri.item_id, ri])))
      }
    })()
  }, [checklist.id, bu.id, userId, reviewMode])

  const editable = !reviewMode && run != null && (run.status === 'in_progress' || run.status === 'returned')

  async function setItemState(item: ChecklistItem, status: RunItem['status'], photoUrl?: string | null, note?: string | null) {
    if (!run) return
    const existing = runItems[item.id]
    const patch = {
      run_id: run.id, item_id: item.id, status,
      photo_url: photoUrl !== undefined ? photoUrl : existing?.photo_url ?? null,
      note: note !== undefined ? note : existing?.note ?? null,
      done_by: userId ?? null, done_at: status === 'pending' ? null : new Date().toISOString(),
    }
    const { data } = existing
      ? await supabase.from('checklist_run_items').update(patch).eq('id', existing.id).select('*').single()
      : await supabase.from('checklist_run_items').insert(patch).select('*').single()
    if (data) setRunItems(prev => ({ ...prev, [item.id]: data }))
  }

  async function toggleDone(item: ChecklistItem, file?: File) {
    if (!editable) return
    const current = runItems[item.id]
    if (current?.status === 'done') { await setItemState(item, 'pending'); return }
    let photoUrl: string | null | undefined = undefined
    if (item.requires_photo) {
      if (!file) return // la UI abre la cámara; sin foto no hay palomita
      setBusy(true)
      photoUrl = await uploadCasaPhoto(file, `runs/${run!.id}`)
      setBusy(false)
      if (!photoUrl) return
    }
    await setItemState(item, 'done', photoUrl)
  }

  async function submitIssue() {
    if (!issueFor || !run || !issueNote.trim()) return
    setBusy(true)
    const photoUrl = issueFile ? await uploadCasaPhoto(issueFile, `incidents/${bu.id}`) : null
    await setItemState(issueFor, 'issue', photoUrl, issueNote.trim())
    // El pegamento: un item con problema genera la incidencia al instante
    const ri = (await supabase.from('checklist_run_items').select('id').eq('run_id', run.id).eq('item_id', issueFor.id).maybeSingle()).data
    await supabase.from('ops_incidents').insert({
      bu_id: bu.id, area: issueFor.area, description: `${checklist.name} · ${issueFor.label}: ${issueNote.trim()}`,
      photo_url: photoUrl, reported_by: userId ?? null, run_item_id: ri?.id ?? null,
    })
    setBusy(false)
    showToast('Problema reportado — el equipo lo verá en Incidencias', 'success')
    setIssueFor(null); setIssueNote(''); setIssueFile(null)
  }

  const doneCount = items.filter(i => runItems[i.id] && runItems[i.id].status !== 'pending').length
  const allDone = items.length > 0 && doneCount === items.length

  async function submitRun() {
    if (!run) return
    await supabase.from('checklist_runs').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', run.id)
    showToast('Enviada para revisión ✅', 'success')
    onClose()
  }

  async function review(status: 'approved' | 'returned') {
    if (!run) return
    let note: string | null = null
    if (status === 'returned') {
      note = window.prompt('¿Qué hay que corregir? (el equipo lo verá)')
      if (!note?.trim()) return
    }
    await supabase.from('checklist_runs').update({ status, reviewed_by: userId ?? null, review_note: note?.trim() ?? null }).eq('id', run.id)
    showToast(status === 'approved' ? 'Puesta a punto aprobada ✅' : 'Regresada al equipo', status === 'approved' ? 'success' : 'info')
    onClose()
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={560}>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BUChip code={bu.code} size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>{checklist.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{doneCount}/{items.length} listos · hoy</div>
          </div>
          {run && <StatusBadgeV2 tone={RUN_STATUS[run.status].tone} label={RUN_STATUS[run.status].label} />}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '8px' }}><X size={18} /></button>
        </div>

        {run?.status === 'returned' && run.review_note && (
          <div style={{ background: 'color-mix(in srgb, var(--status-risk) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--status-risk) 30%, transparent)', borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: '13px', color: 'var(--text-primary)' }}>
            ↩ Regresada: {run.review_note}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(item => {
            const ri = runItems[item.id]
            const st = ri?.status ?? 'pending'
            return (
              <div key={item.id} style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                padding: '12px', display: 'flex', alignItems: 'center', gap: '10px', minHeight: '56px',
                opacity: st === 'done' ? 0.75 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', textDecoration: st === 'done' ? 'line-through' : 'none' }}>{item.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                    {item.area && <span>{item.area}</span>}
                    {item.requires_photo && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Camera size={10} /> foto obligatoria</span>}
                    {st === 'issue' && ri?.note && <span style={{ color: 'var(--status-risk)' }}>⚠ {ri.note}</span>}
                  </div>
                </div>
                {ri?.photo_url && (
                  <img src={ri.photo_url} alt="" onClick={() => window.open(ri.photo_url!, '_blank')}
                    style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0 }} />
                )}
                {editable && (
                  <>
                    {item.requires_photo && st !== 'done' ? (
                      <label style={{ ...iconBtn(false), cursor: busy ? 'wait' : 'pointer' }}>
                        <Camera size={18} />
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void toggleDone(item, f); e.currentTarget.value = '' }} />
                      </label>
                    ) : (
                      <button onClick={() => void toggleDone(item)} style={iconBtn(st === 'done')} disabled={busy}>
                        <Check size={18} />
                      </button>
                    )}
                    <button onClick={() => { setIssueFor(item); setIssueNote(''); setIssueFile(null) }}
                      style={{ ...iconBtn(false), color: st === 'issue' ? 'var(--status-risk)' : 'var(--text-tertiary)' }} disabled={busy}>
                      <AlertTriangle size={16} />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {editable && allDone && (
          <button onClick={() => void submitRun()} style={btnPrimary}><Send size={16} /> Enviar para revisión</button>
        )}
        {reviewMode && run?.status === 'submitted' && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => void review('approved')} style={{ ...btnPrimary, flex: 1 }}><CheckCircle2 size={16} /> Aprobar</button>
            <button onClick={() => void review('returned')} style={{ ...btnGhost, flex: 1 }}><Undo2 size={16} /> Regresar</button>
          </div>
        )}

        {issueFor && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>⚠ Problema en: {issueFor.label}</div>
            <textarea value={issueNote} onChange={e => setIssueNote(e.target.value)} rows={2} placeholder="¿Qué pasa? (ej. 'llave de la barra gotea')" style={{ ...inputStyle, resize: 'vertical' }} />
            <label style={{ ...btnGhost, justifyContent: 'flex-start' }}>
              <Camera size={16} /> {issueFile ? issueFile.name.slice(0, 28) : 'Agregar foto (opcional)'}
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => setIssueFile(e.target.files?.[0] ?? null)} />
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => void submitIssue()} disabled={!issueNote.trim() || busy} style={{ ...btnPrimary, flex: 1, opacity: issueNote.trim() ? 1 : 0.5 }}>Reportar</button>
              <button onClick={() => setIssueFor(null)} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

function iconBtn(active: boolean): React.CSSProperties {
  return {
    width: '44px', height: '44px', borderRadius: 'var(--radius-md)', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    background: active ? 'var(--status-healthy)' : 'var(--bg-elevated)',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  }
}

// ═══ REPORTAR PROBLEMA (standalone) ══════════════════════════════════════════
function ReportSheet({ open, onClose, bus, userId, isMobile }: {
  open: boolean; onClose: () => void; bus: BU[]; userId?: string; isMobile: boolean
}) {
  const [buId, setBuId] = useState('')
  const [area, setArea] = useState('')
  const [desc, setDesc] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!buId && bus.length) setBuId(bus[0].id) }, [bus, buId])

  async function submit() {
    if (!buId || !desc.trim()) return
    setBusy(true)
    const photoUrl = file ? await uploadCasaPhoto(file, `incidents/${buId}`) : null
    const { error } = await supabase.from('ops_incidents').insert({
      bu_id: buId, area: area.trim() || null, description: desc.trim(), photo_url: photoUrl, reported_by: userId ?? null,
    })
    setBusy(false)
    if (error) { showToast('No se pudo reportar — intenta de nuevo', 'error'); return }
    showToast('Reportado ✅ — el equipo lo verá en Incidencias', 'success')
    setDesc(''); setArea(''); setFile(null)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} isMobile={isMobile} width={480}>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)', flex: 1 }}>⚠ Reportar un problema</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '8px' }}><X size={18} /></button>
        </div>
        {bus.length > 1 && (
          <div>
            <span style={labelStyle}>Venue</span>
            <SegmentedControl scrollable value={buId} onChange={setBuId} options={bus.map(b => ({ id: b.id, label: b.name }))} />
          </div>
        )}
        <div>
          <span style={labelStyle}>¿Dónde?</span>
          <input value={area} onChange={e => setArea(e.target.value)} placeholder="Barra, Cocina, Baños, Terraza…" style={inputStyle} />
        </div>
        <div>
          <span style={labelStyle}>¿Qué pasa?</span>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Describe el problema en una o dos líneas" style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <label style={{ ...btnGhost, justifyContent: 'flex-start' }}>
          <Camera size={16} /> {file ? file.name.slice(0, 30) : 'Tomar foto'}
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={() => void submit()} disabled={!desc.trim() || busy} style={{ ...btnPrimary, opacity: desc.trim() && !busy ? 1 : 0.5 }}>
          {busy ? 'Enviando…' : 'Reportar al equipo'}
        </button>
      </div>
    </Sheet>
  )
}

// ═══ ADMIN (Ops Manager / Master; C-Level lectura) ═══════════════════════════
function CasaAdmin({ bus, userId, isMobile, canWrite }: { bus: BU[]; userId?: string; isMobile: boolean; canWrite: boolean }) {
  const [tab, setTab] = useState('hoy')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)', flex: 1 }}>La Casa</h1>
        {!canWrite && <StatusBadgeV2 tone="neutral" label="Solo lectura" />}
      </div>
      <SegmentedControl scrollable value={tab} onChange={setTab} options={[
        { id: 'hoy',         label: 'Hoy' },
        { id: 'plantillas',  label: 'Plantillas' },
        { id: 'inventario',  label: 'Inventario' },
        { id: 'incidencias', label: 'Incidencias' },
      ]} />
      {tab === 'hoy' && <AdminHoy bus={bus} userId={userId} isMobile={isMobile} canWrite={canWrite} />}
      {tab === 'plantillas' && <AdminPlantillas bus={bus} userId={userId} isMobile={isMobile} canWrite={canWrite} />}
      {tab === 'inventario' && <AdminInventario bus={bus} userId={userId} isMobile={isMobile} canWrite={canWrite} />}
      {tab === 'incidencias' && <AdminIncidencias bus={bus} userId={userId} canWrite={canWrite} />}
    </div>
  )
}

// ── Hoy: pulso del turno + revisión ──────────────────────────────────────────
function AdminHoy({ bus, userId, isMobile, canWrite }: { bus: BU[]; userId?: string; isMobile: boolean; canWrite: boolean }) {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({})
  const [runs, setRuns] = useState<Run[]>([])
  const [doneCounts, setDoneCounts] = useState<Record<string, number>>({}) // run_id → listos
  const [reviewing, setReviewing] = useState<{ checklist: Checklist; bu: BU } | null>(null)

  const load = useCallback(async () => {
    const buIds = bus.map(b => b.id)
    if (!buIds.length) return
    const { data: cls } = await supabase.from('venue_checklists').select('*').in('bu_id', buIds).eq('active', true).order('sort')
    const clIds = (cls ?? []).map(c => c.id)
    const [{ data: its }, { data: rns }] = await Promise.all([
      clIds.length ? supabase.from('venue_checklist_items').select('id, checklist_id').in('checklist_id', clIds) : Promise.resolve({ data: [] }),
      clIds.length ? supabase.from('checklist_runs').select('*').in('checklist_id', clIds).eq('date', todayISO()) : Promise.resolve({ data: [] }),
    ])
    const counts: Record<string, number> = {}
    for (const it of (its ?? []) as { checklist_id: string }[]) counts[it.checklist_id] = (counts[it.checklist_id] ?? 0) + 1
    const runIds = (rns ?? []).map(r => r.id)
    const { data: ris } = runIds.length
      ? await supabase.from('checklist_run_items').select('run_id, status').in('run_id', runIds)
      : { data: [] }
    const dc: Record<string, number> = {}
    for (const ri of (ris ?? []) as { run_id: string; status: string }[]) if (ri.status !== 'pending') dc[ri.run_id] = (dc[ri.run_id] ?? 0) + 1
    setChecklists(cls ?? []); setItemCounts(counts); setRuns(rns ?? []); setDoneCounts(dc)
  }, [bus])

  useEffect(() => { void load() }, [load])

  const porRevisar = runs.filter(r => r.status === 'submitted').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
        <KPITile label="Puestas a punto hoy" value={String(checklists.length)} />
        <KPITile label="En curso" value={String(runs.filter(r => r.status === 'in_progress').length)} color="var(--status-attention)" />
        <KPITile label="Por revisar" value={String(porRevisar)} color={porRevisar ? 'var(--accent)' : undefined} />
        <KPITile label="Aprobadas" value={String(runs.filter(r => r.status === 'approved').length)} color="var(--status-healthy)" />
      </div>

      {bus.map(bu => {
        const buCls = checklists.filter(c => c.bu_id === bu.id)
        if (!buCls.length) return null
        return (
          <div key={bu.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BUChip code={bu.code} size="sm" />
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-secondary)' }}>{bu.name}</span>
            </div>
            {buCls.map(cl => {
              const run = runs.find(r => r.checklist_id === cl.id)
              const total = itemCounts[cl.id] ?? 0
              const done = run ? (doneCounts[run.id] ?? 0) : 0
              const st = run ? RUN_STATUS[run.status] : { label: 'Sin empezar', tone: 'neutral' as StatusTone }
              return (
                <button key={cl.id} onClick={() => setReviewing({ checklist: cl, bu })}
                  style={{
                    textAlign: 'left', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', padding: '12px 14px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '12px', minHeight: '52px',
                  }}>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{cl.name}</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{done}/{total}</span>
                  <StatusBadgeV2 tone={st.tone} label={st.label} />
                </button>
              )
            })}
          </div>
        )
      })}

      {checklists.length === 0 && (
        <EmptyStateV2 icon={<ClipboardCheck size={28} />} title="Aún no hay puestas a punto — créalas en Plantillas." />
      )}

      {reviewing && (
        <RunSheet checklist={reviewing.checklist} bu={reviewing.bu} userId={userId} isMobile={isMobile}
          reviewMode={canWrite} onClose={() => { setReviewing(null); void load() }} />
      )}
    </div>
  )
}

// ── Plantillas: CRUD de puestas a punto ──────────────────────────────────────
function AdminPlantillas({ bus, userId, isMobile, canWrite }: { bus: BU[]; userId?: string; isMobile: boolean; canWrite: boolean }) {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<Checklist | 'new' | null>(null)

  const load = useCallback(async () => {
    const buIds = bus.map(b => b.id)
    if (!buIds.length) return
    const { data: cls } = await supabase.from('venue_checklists').select('*').in('bu_id', buIds).order('sort').order('name')
    const clIds = (cls ?? []).map(c => c.id)
    const { data: its } = clIds.length
      ? await supabase.from('venue_checklist_items').select('id, checklist_id').in('checklist_id', clIds)
      : { data: [] }
    const counts: Record<string, number> = {}
    for (const it of (its ?? []) as { checklist_id: string }[]) counts[it.checklist_id] = (counts[it.checklist_id] ?? 0) + 1
    setChecklists(cls ?? []); setItemCounts(counts)
  }, [bus])

  useEffect(() => { void load() }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {canWrite && (
        <button onClick={() => setEditing('new')} style={{ ...btnPrimary, alignSelf: 'flex-start' }}>
          <Plus size={16} /> Nueva puesta a punto
        </button>
      )}
      {checklists.map(cl => {
        const bu = bus.find(b => b.id === cl.bu_id)
        return (
          <button key={cl.id} onClick={() => setEditing(cl)}
            style={{
              textAlign: 'left', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)', padding: '12px 14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '12px', minHeight: '52px', opacity: cl.active ? 1 : 0.55,
            }}>
            {bu && <BUChip code={bu.code} size="sm" />}
            <span style={{ flex: 1, fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{cl.name}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{FREQ_LABEL[cl.frequency]} · {itemCounts[cl.id] ?? 0} items</span>
            {!cl.active && <StatusBadgeV2 tone="neutral" label="Inactiva" />}
            <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        )
      })}
      {checklists.length === 0 && <EmptyStateV2 icon={<ClipboardCheck size={28} />} title="Sin plantillas todavía." />}
      {editing && (
        <TemplateSheet checklist={editing === 'new' ? null : editing} bus={bus} userId={userId} isMobile={isMobile}
          canWrite={canWrite} onClose={() => { setEditing(null); void load() }} />
      )}
    </div>
  )
}

function TemplateSheet({ checklist, bus, userId, isMobile, canWrite, onClose }: {
  checklist: Checklist | null; bus: BU[]; userId?: string; isMobile: boolean; canWrite: boolean; onClose: () => void
}) {
  const [buId, setBuId] = useState(checklist?.bu_id ?? bus[0]?.id ?? '')
  const [name, setName] = useState(checklist?.name ?? '')
  const [frequency, setFrequency] = useState(checklist?.frequency ?? 'daily')
  const [active, setActive] = useState(checklist?.active ?? true)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newArea, setNewArea] = useState('')
  const [newPhoto, setNewPhoto] = useState(false)
  const [savedId, setSavedId] = useState(checklist?.id ?? null)

  useEffect(() => {
    if (!checklist) return
    void supabase.from('venue_checklist_items').select('*').eq('checklist_id', checklist.id).order('sort')
      .then(({ data }) => setItems(data ?? []))
  }, [checklist])

  async function saveHeader(): Promise<string | null> {
    if (!name.trim() || !buId) return null
    if (savedId) {
      await supabase.from('venue_checklists').update({ name: name.trim(), frequency, active, bu_id: buId }).eq('id', savedId)
      return savedId
    }
    const { data } = await supabase.from('venue_checklists')
      .insert({ bu_id: buId, name: name.trim(), frequency, active, created_by: userId ?? null })
      .select('id').single()
    if (data) setSavedId(data.id)
    return data?.id ?? null
  }

  async function addItem() {
    if (!newLabel.trim()) return
    const id = savedId ?? await saveHeader()
    if (!id) { showToast('Ponle nombre a la puesta a punto primero', 'error'); return }
    const { data } = await supabase.from('venue_checklist_items')
      .insert({ checklist_id: id, label: newLabel.trim(), area: newArea.trim() || null, requires_photo: newPhoto, sort: items.length })
      .select('*').single()
    if (data) setItems(prev => [...prev, data])
    setNewLabel(''); setNewArea(''); setNewPhoto(false)
  }

  async function removeItem(itemId: string) {
    await supabase.from('venue_checklist_items').delete().eq('id', itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
  }

  async function saveAndClose() {
    const id = await saveHeader()
    if (!id) { showToast('Falta el nombre', 'error'); return }
    showToast('Plantilla guardada ✅', 'success')
    onClose()
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={560}>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)', flex: 1 }}>
            {checklist ? 'Editar puesta a punto' : 'Nueva puesta a punto'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '8px' }}><X size={18} /></button>
        </div>
        <div>
          <span style={labelStyle}>Venue</span>
          <SegmentedControl scrollable value={buId} onChange={setBuId} options={bus.map(b => ({ id: b.id, label: b.name }))} />
        </div>
        <div>
          <span style={labelStyle}>Nombre</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder='Ej. "Apertura barra"' style={inputStyle} disabled={!canWrite} />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>Frecuencia</span>
            <select value={frequency} onChange={e => setFrequency(e.target.value)} style={inputStyle} disabled={!canWrite}>
              <option value="daily">Diaria</option>
              <option value="opening">Apertura</option>
              <option value="closing">Cierre</option>
              <option value="weekly">Semanal</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} disabled={!canWrite} /> Activa
          </label>
        </div>

        <div>
          <span style={labelStyle}>Items ({items.length})</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {items.map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)' }}>{it.label}</span>
                {it.area && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{it.area}</span>}
                {it.requires_photo && <Camera size={12} style={{ color: 'var(--accent)' }} />}
                {canWrite && (
                  <button onClick={() => void removeItem(it.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '6px' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {canWrite && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder='Nuevo item — ej. "Barra montada y limpia"' style={inputStyle}
              onKeyDown={e => { if (e.key === 'Enter') void addItem() }} />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input value={newArea} onChange={e => setNewArea(e.target.value)} placeholder="Área (opcional)" style={{ ...inputStyle, flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="checkbox" checked={newPhoto} onChange={e => setNewPhoto(e.target.checked)} /> <Camera size={12} /> foto
              </label>
              <button onClick={() => void addItem()} style={{ ...btnGhost, padding: '10px 14px' }}><Plus size={16} /></button>
            </div>
          </div>
        )}

        {canWrite && <button onClick={() => void saveAndClose()} style={btnPrimary}>Guardar plantilla</button>}
      </div>
    </Sheet>
  )
}

// ── Inventario ───────────────────────────────────────────────────────────────
function AdminInventario({ bus, userId, isMobile, canWrite }: { bus: BU[]; userId?: string; isMobile: boolean; canWrite: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [buFilter, setBuFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [editing, setEditing] = useState<Asset | 'new' | null>(null)

  const load = useCallback(async () => {
    const buIds = bus.map(b => b.id)
    if (!buIds.length) return
    const { data } = await supabase.from('venue_assets').select('*').in('bu_id', buIds).neq('condition', 'RETIRED').order('name')
    setAssets(data ?? [])
  }, [bus])

  useEffect(() => { void load() }, [load])

  const filtered = assets.filter(a =>
    (buFilter === 'all' || a.bu_id === buFilter) && (catFilter === 'all' || a.category === catFilter))
  const valorTotal = filtered.reduce((s, a) => s + (a.cost ?? 0), 0)
  const danados = filtered.filter(a => a.condition === 'DAMAGED' || a.condition === 'REPAIR').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
        <KPITile label="Activos" value={String(filtered.length)} icon={<Boxes size={12} />} />
        <KPITile label="Valor registrado" value={valorTotal ? `$${valorTotal.toLocaleString('es-MX')}` : '—'} color="var(--accent)" />
        <KPITile label="Dañados / en reparación" value={String(danados)} color={danados ? 'var(--status-risk)' : undefined} />
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={buFilter} onChange={e => setBuFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}>
          <option value="all">Todos los venues</option>
          {bus.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}>
          <option value="all">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {canWrite && (
          <button onClick={() => setEditing('new')} style={{ ...btnPrimary, marginLeft: 'auto' }}>
            <Plus size={16} /> Agregar activo
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
        {filtered.map(a => {
          const bu = bus.find(b => b.id === a.bu_id)
          const cond = CONDITIONS.find(c => c.id === a.condition)
          return (
            <button key={a.id} onClick={() => setEditing(a)}
              style={{
                textAlign: 'left', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)', padding: '12px', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center',
              }}>
              {a.photo_url
                ? <img src={a.photo_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
                : <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Boxes size={18} style={{ color: 'var(--text-tertiary)' }} /></div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                  {bu && <BUChip code={bu.code} size="sm" />}
                  {a.folio && <span>#{a.folio}</span>}
                  {a.area && <span>{a.area}</span>}
                  {a.cost != null && <span>${a.cost.toLocaleString('es-MX')}</span>}
                </div>
              </div>
              {cond && <StatusBadgeV2 tone={cond.tone} label={cond.label} />}
            </button>
          )
        })}
      </div>
      {filtered.length === 0 && <EmptyStateV2 icon={<Boxes size={28} />} title="Sin activos registrados con estos filtros." />}

      {editing && (
        <AssetSheet asset={editing === 'new' ? null : editing} bus={bus} userId={userId} isMobile={isMobile}
          canWrite={canWrite} onClose={() => { setEditing(null); void load() }} />
      )}
    </div>
  )
}

function AssetSheet({ asset, bus, userId, isMobile, canWrite, onClose }: {
  asset: Asset | null; bus: BU[]; userId?: string; isMobile: boolean; canWrite: boolean; onClose: () => void
}) {
  const [f, setF] = useState({
    bu_id: asset?.bu_id ?? bus[0]?.id ?? '', folio: asset?.folio ?? '', name: asset?.name ?? '',
    category: asset?.category ?? 'MOBILIARIO', area: asset?.area ?? '', brand: asset?.brand ?? '',
    model: asset?.model ?? '', serial: asset?.serial ?? '', cost: asset?.cost != null ? String(asset.cost) : '',
    condition: asset?.condition ?? 'GOOD', notes: asset?.notes ?? '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }))

  async function save() {
    if (!f.name.trim() || !f.bu_id) { showToast('Falta el nombre del activo', 'error'); return }
    setBusy(true)
    const photoUrl = file ? await uploadCasaPhoto(file, `assets/${f.bu_id}`) : undefined
    const row: Record<string, unknown> = {
      bu_id: f.bu_id, folio: f.folio.trim() || null, name: f.name.trim(), category: f.category,
      area: f.area.trim() || null, brand: f.brand.trim() || null, model: f.model.trim() || null,
      serial: f.serial.trim() || null, cost: f.cost ? Number(f.cost) : null,
      condition: f.condition, notes: f.notes.trim() || null,
    }
    if (photoUrl) row.photo_url = photoUrl
    if (asset) {
      await supabase.from('venue_assets').update(row).eq('id', asset.id)
      if (asset.condition !== f.condition) {
        await supabase.from('asset_events').insert({
          asset_id: asset.id, type: 'condition', from_value: asset.condition, to_value: f.condition, created_by: userId ?? null,
        })
      }
      if (asset.bu_id !== f.bu_id) {
        await supabase.from('asset_events').insert({
          asset_id: asset.id, type: 'transfer', from_value: asset.bu_id, to_value: f.bu_id, created_by: userId ?? null,
        })
      }
    } else {
      const { data } = await supabase.from('venue_assets').insert({ ...row, created_by: userId ?? null }).select('id').single()
      if (data) await supabase.from('asset_events').insert({ asset_id: data.id, type: 'created', to_value: f.condition, created_by: userId ?? null })
    }
    setBusy(false)
    showToast('Activo guardado ✅', 'success')
    onClose()
  }

  return (
    <Sheet open onClose={onClose} isMobile={isMobile} width={520}>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)', flex: 1 }}>{asset ? 'Editar activo' : 'Agregar activo'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '8px' }}><X size={18} /></button>
        </div>
        <div>
          <span style={labelStyle}>Venue</span>
          <SegmentedControl scrollable value={f.bu_id} onChange={v => set('bu_id', v)} options={bus.map(b => ({ id: b.id, label: b.name }))} />
        </div>
        <div>
          <span style={labelStyle}>Nombre *</span>
          <input value={f.name} onChange={e => set('name', e.target.value)} placeholder='Ej. "Bocina QSC K12"' style={inputStyle} disabled={!canWrite} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <span style={labelStyle}>Categoría</span>
            <select value={f.category} onChange={e => set('category', e.target.value)} style={inputStyle} disabled={!canWrite}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <span style={labelStyle}>Estado</span>
            <select value={f.condition} onChange={e => set('condition', e.target.value)} style={inputStyle} disabled={!canWrite}>
              {CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <span style={labelStyle}>Área</span>
            <input value={f.area} onChange={e => set('area', e.target.value)} placeholder="Barra, Terraza…" style={inputStyle} disabled={!canWrite} />
          </div>
          <div>
            <span style={labelStyle}>Folio</span>
            <input value={f.folio} onChange={e => set('folio', e.target.value)} placeholder="Etiqueta física" style={inputStyle} disabled={!canWrite} />
          </div>
          <div>
            <span style={labelStyle}>Marca</span>
            <input value={f.brand} onChange={e => set('brand', e.target.value)} style={inputStyle} disabled={!canWrite} />
          </div>
          <div>
            <span style={labelStyle}>Modelo</span>
            <input value={f.model} onChange={e => set('model', e.target.value)} style={inputStyle} disabled={!canWrite} />
          </div>
          <div>
            <span style={labelStyle}>No. serie</span>
            <input value={f.serial} onChange={e => set('serial', e.target.value)} style={inputStyle} disabled={!canWrite} />
          </div>
          <div>
            <span style={labelStyle}>Costo (MXN)</span>
            <input type="number" value={f.cost} onChange={e => set('cost', e.target.value)} style={inputStyle} disabled={!canWrite} />
          </div>
        </div>
        <div>
          <span style={labelStyle}>Notas</span>
          <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} disabled={!canWrite} />
        </div>
        {canWrite && (
          <label style={{ ...btnGhost, justifyContent: 'flex-start' }}>
            <Camera size={16} /> {file ? file.name.slice(0, 30) : (asset?.photo_url ? 'Cambiar foto' : 'Tomar foto')}
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        {canWrite && (
          <button onClick={() => void save()} disabled={busy} style={btnPrimary}>{busy ? 'Guardando…' : 'Guardar activo'}</button>
        )}
      </div>
    </Sheet>
  )
}

// ── Incidencias ──────────────────────────────────────────────────────────────
function AdminIncidencias({ bus, userId, canWrite }: { bus: BU[]; userId?: string; canWrite: boolean }) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [filter, setFilter] = useState('open')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const buIds = bus.map(b => b.id)
    if (!buIds.length) return
    const { data } = await supabase.from('ops_incidents').select('*').in('bu_id', buIds).order('created_at', { ascending: false }).limit(200)
    setIncidents(data ?? [])
  }, [bus])

  useEffect(() => { void load() }, [load])

  const filtered = incidents.filter(i => filter === 'all' ? true : filter === 'open' ? i.status !== 'resolved' : i.status === 'resolved')

  async function createTask(inc: Incident) {
    setBusyId(inc.id)
    const bu = bus.find(b => b.id === inc.bu_id)
    const { data: task, error } = await supabase.from('tasks').insert({
      title: `Incidencia${inc.area ? ` · ${inc.area}` : ''}: ${inc.description.slice(0, 80)}`,
      description: `${inc.description}${inc.photo_url ? `\n\nFoto: ${inc.photo_url}` : ''}\n\nReportada desde La Casa${bu ? ` · ${bu.name}` : ''}.`,
      area: 'mantenimiento', client_impact: 'internal', priority: 'HIGH', status: 'OPEN', bu_id: inc.bu_id,
      created_by: userId ?? null, proof_required: true, deadline_type: 'SOFT',
    }).select('id').single()
    if (error || !task) { setBusyId(null); showToast('No se pudo crear la tarea', 'error'); return }
    await supabase.from('ops_incidents').update({ status: 'task_created', task_id: task.id }).eq('id', inc.id)
    setBusyId(null)
    showToast('Tarea de mantenimiento creada ✅', 'success')
    void load()
  }

  async function resolve(inc: Incident) {
    await supabase.from('ops_incidents').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', inc.id)
    showToast('Incidencia resuelta ✅', 'success')
    void load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SegmentedControl value={filter} onChange={setFilter} options={[
        { id: 'open', label: `Abiertas ${incidents.filter(i => i.status !== 'resolved').length}` },
        { id: 'resolved', label: 'Resueltas' },
        { id: 'all', label: 'Todas' },
      ]} />
      {filtered.map(inc => {
        const bu = bus.find(b => b.id === inc.bu_id)
        return (
          <div key={inc.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            {inc.photo_url && (
              <img src={inc.photo_url} alt="" onClick={() => window.open(inc.photo_url!, '_blank')}
                style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{inc.description}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                {bu && <BUChip code={bu.code} size="sm" />}
                {inc.area && <span>{inc.area}</span>}
                <span>{new Date(inc.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {inc.status === 'task_created' && <StatusBadgeV2 tone="accent" label="Tarea creada" />}
                {inc.status === 'resolved' && <StatusBadgeV2 tone="healthy" label="Resuelta" />}
              </div>
            </div>
            {canWrite && inc.status === 'open' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                <button onClick={() => void createTask(inc)} disabled={busyId === inc.id}
                  style={{ ...btnGhost, padding: '8px 12px', minHeight: '36px', fontSize: '12px' }}>Crear tarea</button>
                <button onClick={() => void resolve(inc)}
                  style={{ ...btnGhost, padding: '8px 12px', minHeight: '36px', fontSize: '12px', color: 'var(--status-healthy)' }}>Resolver</button>
              </div>
            )}
            {canWrite && inc.status === 'task_created' && (
              <button onClick={() => void resolve(inc)}
                style={{ ...btnGhost, padding: '8px 12px', minHeight: '36px', fontSize: '12px', color: 'var(--status-healthy)', flexShrink: 0 }}>Resolver</button>
            )}
          </div>
        )
      })}
      {filtered.length === 0 && <EmptyStateV2 icon={<AlertTriangle size={28} />} title="Sin incidencias por aquí — buena señal." />}
    </div>
  )
}
