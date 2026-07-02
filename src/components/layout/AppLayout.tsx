import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { HomeScreen } from '../ui/HomeScreen'
import { useIsMobile } from '../../hooks/useIsMobile'
import { TENANT, viewTitle } from '../../config/tenant'

interface Props {
  children: React.ReactNode
  activeView: string
  onNavigate: (view: string) => void
  onSignOut: () => void
  userRole?: string
}

export function AppLayout({ children, activeView, onNavigate, onSignOut, userRole }: Props) {
  const isMobile = useIsMobile()
  const [showHome, setShowHome] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const views: Record<string, string> = {
        '1': 'dashboard', '2': 'tasks', '3': 'crm', '4': 'calendar',
        '5': 'content', '6': 'revenue', '7': 'activity', '8': 'templates',
        '9': 'upload', '0': 'invite',
      }
      if (views[e.key]) onNavigate(views[e.key])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNavigate])

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-base)', overflow: 'hidden' }}>
        {/* Mobile top bar with H logo */}
        <div style={{ height: '48px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0 }}>
          <button
            onClick={() => setShowHome(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <div style={{ background: 'var(--accent)', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px' }}>H</span>
            </div>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px' }}>{TENANT.appName}</span>
              <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>{viewTitle(activeView)}</span>
            </span>
          </button>
        </div>

        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingBottom: '60px' }}>
          {children}
        </main>
        <BottomNav activeView={activeView} onNavigate={onNavigate} userRole={userRole} />

        {showHome && (
          <HomeScreen
            onNavigate={onNavigate}
            onClose={() => setShowHome(false)}
            userRole={userRole}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        onHomeClick={() => setShowHome(true)}
        userRole={userRole}
      />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>

      {showHome && (
        <HomeScreen
          onNavigate={onNavigate}
          onClose={() => setShowHome(false)}
          userRole={userRole}
        />
      )}
    </div>
  )
}
