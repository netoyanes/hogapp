import { Lock } from 'lucide-react'
import { PriorityDot } from './PriorityDot'
import type { Task } from '../../types'

interface Props {
  task: Task
  buName?: string
  assigneeName?: string
  onClick?: () => void
}

export function TaskCard({ task, buName, assigneeName, onClick }: Props) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'APPROVED'

  return (
    <div
      onClick={onClick}
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px', cursor: 'pointer' }}
      className="hover:border-[var(--border-strong)] transition-colors"
    >
      {/* Top row */}
      <div className="flex items-start gap-2 mb-2">
        <PriorityDot priority={task.priority} />
        <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, lineHeight: '1.4', flex: 1 }}>
          {task.title}
        </span>
        {task.is_private && <Lock size={10} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: '3px' }} />}
      </div>

      {/* BU + Type */}
      <div className="flex items-center gap-2 mb-2">
        {buName && (
          <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: '4px' }}>
            {buName}
          </span>
        )}
        <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{task.type}</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span style={{ color: assigneeName ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: '11px' }}>
          {assigneeName ?? 'Unassigned'}
        </span>
        <div className="flex items-center gap-2">
          {task.proof_required && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>📎</span>
          )}
          {task.due_date && (
            <span style={{ color: isOverdue ? '#EF4444' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
