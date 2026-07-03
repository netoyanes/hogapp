import { useEffect, useState, type ReactNode } from 'react'
import { LayoutGrid, ChevronRight } from 'lucide-react'
import { Sidebar, navItemsForRole } from './Sidebar'
import { BottomNav } from './BottomNav'
import { HomeScreen } from '../ui/HomeScreen'
import { Sheet } from '../v2'
import { useIsMobile } from '../../hooks/useIsMobile'
import { TENANT, viewTitle } from '../../config/tenant'
import { STR } from '../../lib/strings'

interface Props {
  children: React.ReactNode
  activeView: string
  onNavigate: (view: string) => void
  onSignOut: () => void
  onOpenPalette?: () => void
  bell?: ReactNode
  userRole?: string
}

// Views that already live in the mobile bottom nav (per role) — the "Más"
// sheet shows everything else the role can access.
const MASTER_BOTTOM = new Set(['dashboard', 'tasks', 'crm', 'social', 'profile'])
const TEAM_BOTTOM = new Set(['reservations', 'tasks', 'social', 'contacts', 'profile'])

export function AppLayout({ children, activeView, onNavigate, onSignOut, onOpenPalette, bell, userRole }: Props) {
  const isMobile = useIsMobile()
  const [showHome, setShowHome] = useState(false)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const views: Record<string, string> = {
        '1': 'dashboard', '2': 'tasks', '3': 'crm', '4': 'contacts',
        '5': 'social', '6': 'objectives', '7': 'calendar', '8': 'content',
        '9': 'revenue', '0': 'upload',
      }
      if (views[e.key]) onNavigate(views[e.key])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNavigate])

  if (isMobile) {
    const inBottom = userRole === 'MASTER' ? MASTER_BOTTOM : TEAM_BOTTOM
    const moreItems = navItemsForRole(userRole).filter(i => !inBottom.has(i.id))

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg-base)', overflow: 'hidden' }}>
        {/* Mobile top bar: logo/title · bell · Más (respects the notch/status bar) */}
        <div style={{ height: 'calc(48px + env(safe-area-inset-top))', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: 'env(safe-area-inset-top) 8px 0 16px', flexShrink: 0, gap: '4px' }}>
          <button
            onClick={() => setShowHome(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}
          >
            <div style={{ background: 'var(--accent)', borderRadius: 'var(--radius-sm)', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'var(--on-accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px' }}>H</span>
            </div>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, alignItems: 'flex-start', minWidth: 0 }}>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px' }}>{TENANT.appName}</span>
              <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>{viewTitle(activeView)}</span>
            </span>
          </button>
          {bell}
          {moreItems.length > 0 && (
            <button
              onClick={() => setShowMore(true)}
              aria-label={STR.nav.more}
              style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}
            >
              <LayoutGrid size={17} />
            </button>
          )}
        </div>

        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingBottom: '60px' }}>
          {children}
        </main>
        <BottomNav activeView={activeView} onNavigate={onNavigate} userRole={userRole} />

        {/* "Más" — remaining views for this role */}
        <Sheet open={showMore} onClose={() => setShowMore(false)} isMobile>
          <div style={{ padding: '0 var(--space-4) var(--space-6)', overflowY: 'auto' }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-size-md)', fontWeight: 700, margin: 'var(--space-2) 0 var(--space-3)' }}>{STR.nav.more}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {moreItems.map(item => {
                const Icon = item.icon
                const active = activeView === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); setShowMore(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--touch-target)',
                      padding: '0 var(--space-3)', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: active ? 'var(--accent-bg)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  >
                    <Icon size={18} style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 'var(--text-size-sm)', fontWeight: active ? 600 : 400 }}>{item.label}</span>
                    <ChevronRight size={15} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                )
              })}
            </div>
          </div>
        </Sheet>

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
        onOpenPalette={onOpenPalette}
        bell={bell}
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
