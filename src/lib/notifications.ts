import { supabase } from './supabase'

export async function notifyAdminsAndAssignee(
  title: string,
  body: string,
  type: string,
  entityId?: string,
  assigneeId?: string
) {
  const [{ data: { user } }, { data: admins }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('profiles').select('id').in('role', ['MASTER', 'C_LEVEL']),
  ])

  const targetIds = new Set((admins ?? []).map((a) => a.id))
  if (assigneeId) targetIds.add(assigneeId)
  // Don't notify the person who triggered the action
  if (user?.id) targetIds.delete(user.id)

  if (targetIds.size === 0) return

  await supabase.from('notifications').insert(
    [...targetIds].map((userId) => ({
      user_id: userId,
      title,
      body,
      type,
      entity_id: entityId ?? null,
    }))
  )
}

export async function sendTaskAssignmentEmail(taskId: string, assigneeId: string) {
  await supabase.functions.invoke('send-task-email', {
    body: { taskId, assigneeId, appUrl: window.location.origin },
  })
}
