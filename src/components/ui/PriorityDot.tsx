import type { TaskPriority } from '../../types'

const COLORS: Record<TaskPriority, string> = {
  HIGH:   '#EF4444',
  MEDIUM: '#EAB308',
  LOW:    '#22C55E',
}

export function PriorityDot({ priority }: { priority: TaskPriority }) {
  return (
    <span
      style={{ background: COLORS[priority] }}
      className="inline-block w-2 h-2 rounded-full shrink-0"
      title={priority}
    />
  )
}
