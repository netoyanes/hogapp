import { useEffect } from 'react'

/**
 * Refreshes data when the tab regains focus and on a polling interval.
 * Works as a fallback when Supabase real-time isn't available.
 */
export function useAutoRefresh(load: () => void, intervalMs = 20000) {
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', load)
    const timer = setInterval(load, intervalMs)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', load)
      clearInterval(timer)
    }
  }, [load, intervalMs])
}
