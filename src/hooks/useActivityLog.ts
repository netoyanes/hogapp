import { supabase } from '../lib/supabase'

export function logActivity(
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return
    supabase.from('activity_log').insert({
      user_id: user.id,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      details: details ?? null,
    })
  })
}
