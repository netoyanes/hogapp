import { ScoreBar } from './ScoreBar'
import { HealthBadge } from './HealthBadge'
import { SCORE_MAXES, SCORE_LABELS } from '../../lib/scoring'
import type { BusinessUnit, ScoreResult } from '../../types'

interface Props {
  bu: BusinessUnit | typeof import('../../data/seed-business-units').BUSINESS_UNITS[number]
  scores?: ScoreResult
  onScore?: () => void
  onViewTasks?: () => void
  taskCount?: number
}

export function BUCard({ bu, scores, onScore, onViewTasks, taskCount = 0 }: Props) {
  const total = scores?.total ?? 0
  const status = scores?.status ?? 'NO_DATA'

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: '10px',
      }}
      className="p-4 flex flex-col gap-3 hover:border-[var(--border-strong)] transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }} className="text-xs shrink-0">
              {bu.code}
            </span>
            <span style={{ color: 'var(--text-primary)' }} className="text-sm font-semibold truncate">
              {bu.name}
            </span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }} className="text-xs mt-0.5 truncate">
            {'category' in bu ? bu.category : ''}{bu.location ? ` · ${bu.location}` : ''}
          </div>
        </div>
        <HealthBadge status={status} score={total} size="sm" />
      </div>

      {/* Score total bar */}
      <div>
        <div style={{ background: 'var(--border-default)' }} className="h-1.5 rounded-full overflow-hidden">
          <div
            style={{
              width: `${total}%`,
              background: status === 'HEALTHY' ? '#22C55E' : status === 'ATTENTION' ? '#EAB308' : status === 'AT_RISK' ? '#EF4444' : '#3A3A3A',
              transition: 'width 0.8s ease-out',
            }}
            className="h-full rounded-full"
          />
        </div>
      </div>

      {/* Dimension bars */}
      {scores && (
        <div className="flex flex-col gap-1.5">
          {(['a', 'b', 'c', 'd', 'e'] as const).map((dim) => (
            <ScoreBar
              key={dim}
              label={SCORE_LABELS[dim]}
              score={scores[dim]}
              max={SCORE_MAXES[dim]}
            />
          ))}
        </div>
      )}

      {!scores && (
        <div style={{ color: 'var(--text-tertiary)' }} className="text-xs text-center py-2">
          No scoring data yet
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <button
          onClick={onScore}
          style={{ border: '1px solid var(--accent-border)', color: 'var(--accent)', background: 'var(--accent-bg)' }}
          className="flex-1 text-xs py-1.5 rounded-md font-medium hover:opacity-80 transition-opacity"
        >
          Score Onboarding
        </button>
        <button
          onClick={onViewTasks}
          style={{
            border: `1px solid ${taskCount > 0 ? 'var(--border-default)' : 'var(--border-subtle)'}`,
            color: taskCount > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            background: 'var(--bg-elevated)',
            cursor: onViewTasks ? 'pointer' : 'default',
          }}
          className="text-xs py-1.5 px-3 rounded-md font-medium hover:opacity-80 transition-opacity"
          title={taskCount > 0 ? `View ${taskCount} task${taskCount !== 1 ? 's' : ''} for this BU` : 'No tasks for this BU'}
        >
          {taskCount > 0 ? `${taskCount} task${taskCount !== 1 ? 's' : ''}` : 'No tasks'}
        </button>
      </div>
    </div>
  )
}
