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
      const views: Record<string, string> = { '1': 'dashboard', '2': 'tasks', '3': 'calendar', '4': 'content', '5': 'revenue', '6': 'activity', '7': 'templates', '8': 'upload', '9': 'invite', '0': 'profile' }
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
