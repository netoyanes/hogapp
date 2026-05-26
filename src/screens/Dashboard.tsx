import { useEffect, useState } from 'react'
import { BUCard } from '../components/ui/BUCard'
import { BUSINESS_UNITS } from '../data/seed-business-units'
import { supabase } from '../lib/supabase'
import { calculateScores } from '../lib/scoring'
import type { BUOnboarding, BusinessUnit, ScoreResult } from '../types'

interface Props {
  onScoreBU: (buCode: string) => void
  onViewTasks: (buId: string) => void
  userRole?: string
}

type SeedBU = { code: string; name: string; category?: string; location?: string; project_phase?: string; revenue_health?: string; [key: string]: unknown }
type BUWithId = SeedBU & { id?: string }

export function Dashboard({ onScoreBU, onViewTasks, userRole }: Props) {
  const [buData, setBuData] = useState<BusinessUnit[]>([])
  const [onboardings, setOnboardings] = useState<BUOnboarding[]>([])
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: buses }, { data: obs }, { data: tasks }] = await Promise.all([
        supabase.from('business_units').select('*').order('name'),
        supabase.from('bu_onboarding').select('*'),
        supabase.from('tasks').select('bu_id').not('bu_id', 'is', null),
      ])
      setBuData(buses ?? [])
      setOnboardings(obs ?? [])
      const counts: Record<string, number> = {}
      tasks?.forEach((t) => { if (t.bu_id) counts[t.bu_id] = (counts[t.bu_id] ?? 0) + 1 })
      setTaskCounts(counts)
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
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>HOG Marketing Intelligence · Week of May 25, 2026</p>
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            {filteredBUs.length} Business Units
          </div>
        </div>

        {/* KPI strip */}
        <div className="flex gap-3" style={{ overflowX: 'auto', paddingBottom: '2px' }}>
          {[
            { label: 'Total BUs', value: filteredBUs.length, color: 'var(--text-primary)' },
            { label: 'Scored', value: scored, color: 'var(--text-primary)' },
            { label: 'Healthy', value: healthy, color: 'var(--status-healthy)' },
            { label: 'At Risk', value: atRisk, color: 'var(--status-risk)' },
            { label: 'No Data', value: filteredBUs.length - scored, color: 'var(--text-tertiary)' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px' }}
              className="px-4 py-2 flex flex-col items-center min-w-[80px]"
            >
              <span style={{ color: kpi.color, fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, lineHeight: 1 }}>
                {kpi.value}
              </span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '2px' }}>{kpi.label}</span>
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
