import { HealthBadge } from './HealthBadge'
import { BUChip } from '../v2'
import { SCORE_MAXES, SCORE_LABELS } from '../../lib/scoring'
import type { BusinessUnit, ScoreResult } from '../../types'

interface Props {
  bu: BusinessUnit | typeof import('../../data/seed-business-units').BUSINESS_UNITS[number]
  scores?: ScoreResult
  onScore?: () => void
  onViewTasks?: () => void
  taskCount?: number
}

const STATUS_COLOR: Record<string, string> = {
  HEALTHY: 'var(--status-healthy)',
  ATTENTION: 'var(--status-attention)',
  AT_RISK: 'var(--status-risk)',
  NO_DATA: 'var(--status-none)',
}

// v2 — health as a colored bar on the top edge + label; BU monogram chip;
// A–E dimensions as a compact 5-segment strip instead of stacked bars.
export function BUCard({ bu, scores, onScore, onViewTasks, taskCount = 0 }: Props) {
  const total = scores?.total ?? 0
  const status = scores?.status ?? 'NO_DATA'
  const statusColor = STATUS_COLOR[status]

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        position: 'relative',
        overflow: 'hidden',
      }}
      className="p-4 pt-5 flex flex-col gap-3 hover:brightness-110 transition-[filter]"
    >
      {/* Health as top-edge bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--bg-elevated)' }}>
        <div style={{ height: '100%', width: `${status === 'NO_DATA' ? 0 : total}%`, background: statusColor, transition: 'width 0.8s ease-out' }} />
      </div>

      {/* Header: monogram + name + health label */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BUChip code={bu.code} />
          <div className="min-w-0">
            <div style={{ color: 'var(--text-primary)' }} className="text-sm font-semibold truncate">
              {bu.name}
            </div>
            <div style={{ color: 'var(--text-tertiary)' }} className="text-xs truncate">
              {'category' in bu ? bu.category : ''}{bu.location ? ` · ${bu.location}` : ''}
            </div>
          </div>
        </div>
        <HealthBadge status={status} score={total} size="sm" />
      </div>

      {/* A–E dimensions as a compact 5-segment strip */}
      {scores ? (
        <div>
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['a', 'b', 'c', 'd', 'e'] as const).map((dim) => {
              const p = Math.min(100, Math.round((scores[dim] / SCORE_MAXES[dim]) * 100))
              return (
                <div key={dim} title={`${SCORE_LABELS[dim]}: ${scores[dim]}/${SCORE_MAXES[dim]}`} style={{ flex: 1 }}>
                  <div style={{ height: '6px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p}%`, background: statusColor, opacity: 0.55 + (p / 100) * 0.45 }} />
                  </div>
                  <div className="num" style={{ fontSize: '8px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '2px', textTransform: 'uppercase' }}>{dim}</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-tertiary)' }} className="text-xs text-center py-2">
          Sin calificación todavía
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <button
          onClick={onScore}
          style={{ border: '1px solid var(--accent-border)', color: 'var(--accent)', background: 'var(--accent-bg)', minHeight: '32px' }}
          className="flex-1 text-xs rounded-md font-medium hover:opacity-80 transition-opacity"
        >
          Calificar
        </button>
        <button
          onClick={onViewTasks}
          style={{
            border: `1px solid ${taskCount > 0 ? 'var(--border-default)' : 'var(--border-subtle)'}`,
            color: taskCount > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            background: 'var(--bg-elevated)',
            cursor: onViewTasks ? 'pointer' : 'default',
            minHeight: '32px',
          }}
          className="text-xs px-3 rounded-md font-medium hover:opacity-80 transition-opacity"
          title={taskCount > 0 ? `Ver ${taskCount} tarea${taskCount !== 1 ? 's' : ''} de esta BU` : 'Sin tareas para esta BU'}
        >
          {taskCount > 0 ? `${taskCount} tarea${taskCount !== 1 ? 's' : ''}` : 'Sin tareas'}
        </button>
      </div>
    </div>
  )
}
