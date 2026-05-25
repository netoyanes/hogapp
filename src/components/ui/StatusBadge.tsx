import type { TaskStatus } from '../../types'

const CONFIG: Record<TaskStatus, { label: string; bg: string; color: string }> = {
  OPEN:             { label: 'Open',            bg: 'rgba(85,85,85,0.2)',   color: '#888888' },
  IN_PROGRESS:      { label: 'In Progress',     bg: 'rgba(34,197,94,0.1)',  color: '#22C55E' },
  PROOF_SUBMITTED:  { label: 'Proof Submitted', bg: 'rgba(234,179,8,0.1)',  color: '#EAB308' },
  APPROVED:         { label: 'Approved',        bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
  REVISION:         { label: 'Revision',        bg: 'rgba(239,68,68,0.1)',  color: '#EF4444' },
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = CONFIG[status]
  return (
    <span
      style={{ background: cfg.bg, color: cfg.color, fontFamily: 'var(--font-mono)' }}
      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
    >
      {cfg.label}
    </span>
  )
}
