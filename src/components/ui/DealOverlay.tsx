import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DealDetailPanel } from './DealDetailPanel'
import type { CRMContact } from '../../screens/CRM'
import type { BusinessUnit } from '../../types'

interface Props {
  dealId: string
  onClose: () => void
  userRole?: string
}

// Loads the contacts + business units a DealDetailPanel needs, then renders it.
// Used when opening a deal straight from a notification deep-link (outside the CRM screen).
export function DealOverlay({ dealId, onClose, userRole }: Props) {
  const [contacts, setContacts] = useState<CRMContact[]>([])
  const [buses, setBuses] = useState<BusinessUnit[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: c }, { data: b }] = await Promise.all([
        supabase.from('crm_contacts').select('*').order('full_name'),
        supabase.from('business_units').select('*').order('name'),
      ])
      if (cancelled) return
      setContacts(c ?? [])
      setBuses(b ?? [])
      setReady(true)
    }
    load()
    return () => { cancelled = true }
  }, [dealId])

  if (!ready) return null

  return (
    <DealDetailPanel
      dealId={dealId}
      contacts={contacts}
      buses={buses}
      onClose={onClose}
      onUpdated={() => { /* deep-link view — nothing to refresh behind it */ }}
      userRole={userRole}
    />
  )
}
