import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { VersionBadge } from '../ui/VersionBadge'

interface Props {
  children: React.ReactNode
  activeView: string
  onNavigate: (view: string) => void
  onSignOut: () => void
  userRole?: string
}

export function AppLayout({ children, activeView, onNavigate, onSignOut, userRole }: Props) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const views: Record<string, string> = { '1': 'dashboard', '2': 'tasks', '3': 'revenue', '4': 'upload' }
      if (views[e.key]) onNavigate(views[e.key])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNavigate])

  // silence unused warning
  void forceUpdate

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <Sidebar activeView={activeView} onNavigate={onNavigate} onSignOut={onSignOut} userRole={userRole} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
      <VersionBadge />
    </div>
  )
}
