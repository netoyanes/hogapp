import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GuestProfile } from './GuestProfile'

// Deep-link wrapper (?guest=<uuid>): loads the BU code map GuestProfile needs,
// then renders the profile sheet over whatever view is active.
export function GuestOverlay({ guestId, userRole, onClose }: {
  guestId: string
  userRole?: string
  onClose: () => void
}) {
  const [buMap, setBuMap] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('business_units').select('id, code').then(({ data }) => {
      if (cancelled) return
      setBuMap(Object.fromEntries((data ?? []).map(b => [b.id, b.code])))
    })
    return () => { cancelled = true }
  }, [guestId])

  if (!buMap) return null
  return <GuestProfile guestId={guestId} buMap={buMap} userRole={userRole} onClose={onClose} />
}
