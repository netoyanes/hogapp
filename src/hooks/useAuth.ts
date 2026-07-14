import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import type { Session } from '@supabase/supabase-js'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) fetchProfile(session.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    // MASTER always gets through. Cuentas de piso (Heart of House) se crean por
    // provisión directa de MASTER (usuario+PIN), no por invitación por correo.
    // Los demás requieren invitación activa — verificada en cada login para que
    // revocarla cierre el acceso de inmediato.
    if (profile && profile.role !== 'MASTER' && profile.role !== 'HEART_OF_HOUSE') {
      const { data: invite } = await supabase
        .from('invitations')
        .select('id')
        .ilike('email', profile.email ?? '')
        .maybeSingle()

      if (!invite) {
        await supabase.auth.signOut()
        setAccessDenied(true)
        setLoading(false)
        return
      }
    }

    setProfile(profile)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return { session, profile, loading, accessDenied, signIn, signOut, refetchProfile: () => session?.user && fetchProfile(session.user.id) }
}
