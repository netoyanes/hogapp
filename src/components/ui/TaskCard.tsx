import { Lock, Paperclip } from 'lucide-react'
import { Avatar } from './Avatar'
import { BUChip, PriorityEdge } from '../v2'
import type { Task } from '../../types'

interface Props {
  task: Task
  buName?: string          // BU code (monogram source)
  assigneeName?: string
  proofCount?: number
  onClick?: () => void
}

// v2 card — compressed: title, assignee avatar, BU chip, due date;
// priority as a thin left edge bar, evidence as a paperclip count.
export function TaskCard({ task, buName, assigneeName, proofCount = 0, onClick }: Props) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'APPROVED'

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px 10px 15px',
        cursor: 'pointer',
        flexShrink: 0, // never let a flex-column scroll container crush the card
      }}
      className="hover:brightness-110 transition-[filter]"
    >
      <PriorityEdge priority={task.priority} />

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '8px' }}>
        <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, lineHeight: 1.4, flex: 1, minWidth: 0 }}>
          {task.title}
        </span>
        {task.is_private && <Lock size={10} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 3 }} />}
      </div>

      {/* Footer: avatar · BU chip · clip count · due date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {assigneeName
          ? <Avatar name={assigneeName} size={20} />
          : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1px dashed var(--border-strong)', flexShrink: 0 }} title="Sin asignar" />}
        {buName && <BUChip code={buName} size="sm" />}
        {(proofCount > 0 || task.proof_required) && (
          <span title={task.proof_required && proofCount === 0 ? 'Requiere evidencia' : `${proofCount} evidencias`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: proofCount > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            <Paperclip size={11} />{proofCount > 0 ? proofCount : ''}
          </span>
        )}
        {task.due_date && (
          <span className="num" style={{ marginLeft: 'auto', color: isOverdue ? 'var(--status-risk)' : 'var(--text-tertiary)', fontSize: 10, fontWeight: isOverdue ? 700 : 400 }}>
            {new Date(task.due_date + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  )
}
