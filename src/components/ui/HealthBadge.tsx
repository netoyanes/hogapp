import type { HealthStatus } from '../../types'

interface Props {
  status: HealthStatus
  score?: number
  size?: 'sm' | 'md'
}

const CONFIG: Record<HealthStatus, { dot: string; label: string; color: string }> = {
  HEALTHY:   { dot: '🟢', label: 'Healthy',   color: '#22C55E' },
  ATTENTION: { dot: '🟡', label: 'Attention',  color: '#EAB308' },
  AT_RISK:   { dot: '🔴', label: 'At Risk',    color: '#EF4444' },
  NO_DATA:   { dot: '⚫', label: 'No Data',    color: '#555555' },
}

export function HealthBadge({ status, score, size = 'md' }: Props) {
  const cfg = CONFIG[status]
  return (
    <span
      style={{ color: cfg.color }}
      className={`inline-flex items-center gap-1 font-mono font-semibold ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
    >
      <span>{cfg.dot}</span>
      {score !== undefined && <span>{score}</span>}
    </span>
  )
}
