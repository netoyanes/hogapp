import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  children: React.ReactNode
  activeView: string
  onNavigate: (view: string) => void
  onSignOut: () => void
  userRole?: string
}

export function AppLayout({ children, activeView, onNavigate, onSignOut, userRole }: Props) {
  const isMobile = useIsMobile()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const views: Record<string, string> = { '1': 'dashboard', '2': 'tasks', '3': 'crm', '4': 'calendar', '5': 'content', '6': 'revenue', '7': 'activity', '8': 'templates', '9': 'upload', '0': 'invite' }
      if (views[e.key]) onNavigate(views[e.key])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNavigate])

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-base)', overflow: 'hidden' }}>
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingBottom: '60px' }}>
          {children}
        </main>
        <BottomNav activeView={activeView} onNavigate={onNavigate} userRole={userRole} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <Sidebar activeView={activeView} onNavigate={onNavigate} onSignOut={onSignOut} userRole={userRole} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}
