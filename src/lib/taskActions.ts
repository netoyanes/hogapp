import { supabase } from './supabase'
import { notifySlack, statusChangedMessage, notifyUserDM, taskLink } from '../hooks/useSlack'
import { logActivity } from '../hooks/useActivityLog'
import { notifyAdminsAndAssignee } from './notifications'
import type { Task, TaskStatus } from '../types'

// Single source of truth for a task status change + ALL its side effects
// (Slack channel + assignee DM, activity log, in-app notifications, and the
// approve→LOW priority rule). Used by the detail panel and the board's
// mobile swipe action so behavior never diverges.
export async function changeTaskStatus(task: Task, status: TaskStatus, buName?: string) {
  const prev = task.status
  if (prev === status) return
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'APPROVED') update.priority = 'LOW'
  await supabase.from('tasks').update(update).eq('id', task.id)

  notifySlack(statusChangedMessage(task.title, prev, status, buName || 'HOG APP'))
  if (task.assigned_to) {
    notifyUserDM(task.assigned_to, statusChangedMessage(task.title, prev, status, buName || 'HOG APP', taskLink(task.id)))
  }
  logActivity('status_changed', 'task', task.id, { title: task.title, from: prev, to: status })
  notifyAdminsAndAssignee(`Status → ${status}`, task.title, 'status_changed', task.id, task.assigned_to ?? undefined)
}
