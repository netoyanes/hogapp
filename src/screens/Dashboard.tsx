import { useEffect, useState } from 'react'
import { BUCard } from '../components/ui/BUCard'
import { BUSINESS_UNITS } from '../data/seed-business-units'
import { supabase } from '../lib/supabase'
import { calculateScores } from '../lib/scoring'
import { BUChip } from '../components/v2'
import { useIsMobile } from '../hooks/useIsMobile'
import type { BUOnboarding, BusinessUnit, ScoreResult } from '../types'

// Pulso operativo por marca: reservas (bot vs manual), conversaciones del
// Concierge y pipeline CRM activo — el indicador real para Master/C-Level.
interface OpsPulse {
  resTotal: number
  resBot: number
  convs: number
  escalated: number
  deals: number
  pipeline: number
}
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

interface Props {
  onScoreBU: (buCode: string) => void
  onViewTasks: (buId: string) => void
  userRole?: string
}

type SeedBU = { code: string; name: string; category?: string; location?: string; project_phase?: string; revenue_health?: string; [key: string]: unknown }
type BUWithId = SeedBU & { id?: string }

export function Dashboard({ onScoreBU, onViewTasks, userRole }: Props) {
  const isMobile = useIsMobile()
  const [buData, setBuData] = useState<BusinessUnit[]>([])
  const [onboardings, setOnboardings] = useState<BUOnboarding[]>([])
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const [pulse, setPulse] = useState<Record<string, OpsPulse>>({})
  const [social7d, setSocial7d] = useState({ posts: 0, reactions: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const week = new Date(Date.now() - 7 * 86400000).toISOString()
      const [{ data: buses }, { data: obs }, { data: tasks }, { data: res }, { data: convs }, { data: deals }, { count: posts }, { count: reactions }] = await Promise.all([
        supabase.from('business_units').select('*').order('name'),
        supabase.from('bu_onboarding').select('*'),
        supabase.from('tasks').select('bu_id').not('bu_id', 'is', null),
        supabase.from('reservations').select('bu_id, bot_conversation_id, source, created_by').gte('created_at', monthStart),
        supabase.from('bot_conversations').select('bu_id, status').eq('is_simulated', false).gte('created_at', monthStart),
        supabase.from('crm_deals').select('bu_id, value').not('stage', 'in', '("WON","LOST")'),
        supabase.from('social_posts').select('id', { count: 'exact', head: true }).gte('created_at', week),
        supabase.from('social_reactions').select('id', { count: 'exact', head: true }).gte('created_at', week),
      ])
      setBuData(buses ?? [])
      setOnboardings(obs ?? [])
      const counts: Record<string, number> = {}
      tasks?.forEach((t) => { if (t.bu_id) counts[t.bu_id] = (counts[t.bu_id] ?? 0) + 1 })
      setTaskCounts(counts)

      const p: Record<string, OpsPulse> = {}
      const at = (id: string) => (p[id] ??= { resTotal: 0, resBot: 0, convs: 0, escalated: 0, deals: 0, pipeline: 0 })
      for (const r of res ?? []) if (r.bu_id) {
        const e = at(r.bu_id)
        e.resTotal++
        if (r.bot_conversation_id || (!r.created_by && (r.source === 'whatsapp' || r.source === 'instagram'))) e.resBot++
      }
      for (const c of convs ?? []) if (c.bu_id) {
        const e = at(c.bu_id)
        e.convs++
        if (c.status === 'needs_human' || c.status === 'human') e.escalated++
      }
      for (const d of deals ?? []) if (d.bu_id) {
        const e = at(d.bu_id)
        e.deals++
        e.pipeline += Number(d.value ?? 0)
      }
      setPulse(p)
      setSocial7d({ posts: posts ?? 0, reactions: reactions ?? 0 })
      setLoading(false)
    }
    load()
  }, [])

  function getScores(buId: string): ScoreResult | undefined {
    const ob = onboardings.find((o) => o.bu_id === buId)
    if (!ob) return undefined
    return calculateScores({
      publishes_per_week: (ob.publishes_per_week ?? 0) as 0 | 1 | 2 | 3,
      has_brand_brief: ob.has_brand_brief ?? false,
      has_content_pillars: ob.has_content_pillars ?? false,
      has_moodboard: ob.has_moodboard ?? false,
      has_communication_objective: ob.has_communication_objective ?? false,
      has_active_assets: ob.has_active_assets ?? false,
      has_overdue_assets: ob.has_overdue_assets ?? false,
      revenue_trend: ob.revenue_trend ?? 'NO_DATA',
      engagement_level: ob.engagement_level ?? 'NO_DATA',
    })
  }

  // Merge seed data with DB data
  const displayBUs: BUWithId[] = buData.length > 0
    ? buData.map((bu) => ({ ...bu, ...BUSINESS_UNITS.find((s) => s.code === bu.code) })) as BUWithId[]
    : (BUSINESS_UNITS as unknown as BUWithId[])

  const filteredBUs = userRole === 'MASTER'
    ? displayBUs
    : userRole === 'OPS_MANAGER'
    ? displayBUs.filter((bu) => ['BM', 'AM', 'PM'].includes(bu.code))
    : displayBUs

  // Split into scored vs pending
  const scoredBUs = filteredBUs.filter((bu) => {
    const dbBU = buData.find((b) => b.code === bu.code)
    return dbBU && !!getScores(dbBU.id)
  })
  const pendingBUs = filteredBUs.filter((bu) => {
    const dbBU = buData.find((b) => b.code === bu.code)
    return !dbBU || !getScores(dbBU.id)
  })

  function renderGrid(list: BUWithId[]) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {list.map((bu) => {
          const dbBU = buData.find((b) => b.code === bu.code)
          const scores = dbBU ? getScores(dbBU.id) : undefined
          return (
            <BUCard
              key={bu.code}
              bu={dbBU ?? (bu as unknown as BusinessUnit)}
              scores={scores}
              onScore={() => onScoreBU(bu.code)}
              taskCount={dbBU ? (taskCounts[dbBU.id] ?? 0) : 0}
              onViewTasks={dbBU ? () => onViewTasks(dbBU.id) : undefined}
            />
          )
        })}
      </div>
    )
  }

  // Totales del pulso operativo (mes en curso)
  const pulseTotals = Object.values(pulse).reduce(
    (a, e) => ({ res: a.res + e.resTotal, bot: a.bot + e.resBot, pipeline: a.pipeline + e.pipeline }),
    { res: 0, bot: 0, pipeline: 0 },
  )
  const pulseBUs = displayBUs
    .map(bu => ({ bu, dbBU: buData.find(b => b.code === bu.code) }))
    .filter((x): x is { bu: BUWithId; dbBU: BusinessUnit } => !!x.dbBU && !!pulse[x.dbBU.id])
    .sort((a, b) => (pulse[b.dbBU.id].pipeline - pulse[a.dbBU.id].pipeline) || (pulse[b.dbBU.id].resTotal - pulse[a.dbBU.id].resTotal))

  // KPI stats
  const scored = onboardings.length
  const healthy = onboardings.filter((o) => {
    const s = getScores(o.bu_id)
    return s?.status === 'HEALTHY'
  }).length
  const atRisk = onboardings.filter((o) => {
    const s = getScores(o.bu_id)
    return s?.status === 'AT_RISK'
  }).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top bar */}
      <div
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0 }}
        className="px-6 py-4"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '18px' }}>Dashboard</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              Marketing + operación + ventas · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            {filteredBUs.length} Business Units
          </div>
        </div>

        {/* KPI strip — valor grande + sub-dato chico, nada se parte en renglones */}
        <div className="flex gap-3" style={{ overflowX: 'auto', paddingBottom: '2px' }}>
          {[
            { label: 'Total BUs', value: String(filteredBUs.length), color: 'var(--text-primary)' },
            { label: 'Reservas (mes)', value: String(pulseTotals.res), sub: pulseTotals.res > 0 ? `${Math.round((pulseTotals.bot / pulseTotals.res) * 100)}% bot` : undefined, color: 'var(--accent)' },
            { label: 'Pipeline CRM', value: mxn.format(pulseTotals.pipeline), color: 'var(--status-healthy)' },
            { label: 'Social (7d)', value: String(social7d.posts), sub: `${social7d.reactions} reacciones`, color: 'var(--text-primary)' },
            { label: 'Healthy', value: String(healthy), color: 'var(--status-healthy)' },
            { label: 'At Risk', value: String(atRisk), color: 'var(--status-risk)' },
            { label: 'No Data', value: String(filteredBUs.length - scored), color: 'var(--text-tertiary)' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', flexShrink: 0 }}
              className="px-4 py-2 flex flex-col items-center min-w-[88px]"
            >
              <span style={{ color: kpi.color, fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>
                {kpi.value}
              </span>
              {'sub' in kpi && kpi.sub && (
                <span style={{ color: kpi.color, fontSize: '10px', fontFamily: 'var(--font-mono)', marginTop: '2px', whiteSpace: 'nowrap', opacity: 0.85 }}>{kpi.sub}</span>
              )}
              <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '2px', whiteSpace: 'nowrap' }}>{kpi.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* BU Grid */}
      <div style={{ flex: 1, overflow: 'auto' }} className="p-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', height: '200px' }}
                className="animate-pulse-green"
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Pulso operativo por marca — Concierge + CRM (mes en curso) */}
            {pulseBUs.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px' }}>Pulso operativo · mes en curso</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                </div>
                <div style={{ background: 'var(--bg-surface)', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                  {!isMobile && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1.4fr) 1fr 1fr 1.2fr', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <span>Marca</span><span>Reservas</span><span>Concierge</span><span>Deals activos</span>
                    </div>
                  )}
                  {pulseBUs.map(({ bu, dbBU }) => {
                    const e = pulse[dbBU.id]
                    const resTxt = (
                      <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {e.resTotal}
                        {e.resTotal > 0 && <span style={{ color: 'var(--accent)' }}> · {e.resBot} bot</span>}
                        {e.resTotal - e.resBot > 0 && <span style={{ color: 'var(--text-tertiary)' }}> · {e.resTotal - e.resBot} man.</span>}
                      </span>
                    )
                    const convTxt = (
                      <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {e.convs} conv.
                        {e.escalated > 0 && <span style={{ color: 'var(--status-attention)' }}> · {e.escalated} esc.</span>}
                      </span>
                    )
                    const dealTxt = (
                      <span className="num" style={{ fontSize: 12, color: e.pipeline > 0 ? 'var(--status-healthy)' : 'var(--text-tertiary)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {e.deals > 0 ? `${e.deals} · ${mxn.format(e.pipeline)}` : '—'}
                      </span>
                    )
                    // Móvil: tarjeta apilada (marca arriba, métricas etiquetadas abajo) — las
                    // 4 columnas no caben en 390px sin aplastarse.
                    return isMobile ? (
                      <div key={dbBU.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <BUChip code={dbBU.code} size="sm" />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bu.name}</span>
                          <span style={{ marginLeft: 'auto' }}>{dealTxt}</span>
                        </span>
                        <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Reservas</span>{resTxt}
                          </span>
                          <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Concierge</span>{convTxt}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div key={dbBU.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1.4fr) 1fr 1fr 1.2fr', gap: 8, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <BUChip code={dbBU.code} size="sm" />
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bu.name}</span>
                        </span>
                        {resTxt}
                        {convTxt}
                        {dealTxt}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Scored section */}
            {scoredBUs.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px' }}>Scored</span>
                  <span style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', borderRadius: '20px', padding: '1px 9px', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {scoredBUs.length}
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                </div>
                {renderGrid(scoredBUs)}
              </div>
            )}

            {/* Pending section */}
            {pendingBUs.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '13px' }}>Pending Onboarding</span>
                  <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)', borderRadius: '20px', padding: '1px 9px', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {pendingBUs.length}
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
                </div>
                {renderGrid(pendingBUs)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
