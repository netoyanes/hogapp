import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Notif = {
  id: string
  user_id: string
  title: string
  body: string | null
  type: string | null
  entity_id: string | null
  read: boolean
  created_at: string
}

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notif[]>([])

  useEffect(() => {
    if (!userId) return

    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(60)
      setNotifications(data ?? [])
    }

    load()

    const channel = supabase
      .channel(`notifs-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const notif = payload.new as Notif
          setNotifications((prev) => [notif, ...prev])
          // Browser push notification
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(notif.title, { body: notif.body ?? undefined, icon: '/favicon.ico' })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const unreadCount = notifications.filter((n) => !n.read).length

  async function markAllRead() {
    if (!userId) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  return { notifications, unreadCount, markAllRead, markRead }
}
