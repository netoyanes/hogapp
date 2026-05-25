import type { ScoreInput, ScoreResult, HealthStatus } from '../types'

export function calculateScores(input: ScoreInput): ScoreResult {
  const a = ([0, 10, 12, 25] as const)[input.publishes_per_week]

  const b =
    (input.has_brand_brief ? 5 : 0) +
    (input.has_content_pillars ? 5 : 0) +
    (input.has_moodboard ? 5 : 0) +
    (input.has_communication_objective ? 5 : 0)

  const c =
    (input.has_active_assets ? 8 : 0) +
    (input.has_overdue_assets ? 0 : 7)

  const d: Record<string, number> = {
    GROWING: 30,
    STABLE: 20,
    DECLINING: 10,
    FREEFALL: 0,
    NO_DATA: 0,
  }

  const e: Record<string, number> = {
    HIGH: 10,
    MEDIUM: 5,
    LOW: 0,
    NO_DATA: 0,
  }

  const dScore = d[input.revenue_trend] ?? 0
  const eScore = e[input.engagement_level] ?? 0
  const total = a + b + c + dScore + eScore

  const status: HealthStatus =
    total >= 80 ? 'HEALTHY' :
    total >= 60 ? 'ATTENTION' :
    total > 0   ? 'AT_RISK' : 'NO_DATA'

  return { a, b, c, d: dScore, e: eScore, total, status }
}

export const SCORE_MAXES = { a: 25, b: 20, c: 15, d: 30, e: 10 }

export const SCORE_LABELS: Record<string, string> = {
  a: 'Content',
  b: 'Strategy',
  c: 'Pipeline',
  d: 'Revenue',
  e: 'Audience',
}
