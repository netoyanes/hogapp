import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { Auth } from './screens/Auth'
import { UserOnboarding } from './screens/UserOnboarding'
import { Dashboard } from './screens/Dashboard'
import { TaskBoard } from './screens/TaskBoard'
import { RevenueUpload } from './screens/RevenueUpload'
import { BUOnboardingForm } from './screens/BUOnboardingForm'
import { AppLayout } from './components/layout/AppLayout'
import { Profile } from './screens/Profile'
import { InviteUsers } from './screens/InviteUsers'
import { EmptyState } from './components/ui/EmptyState'
import { ActivityLog } from './screens/ActivityLog'
import { CalendarView } from './screens/CalendarView'
import { ContentCalendar } from './screens/ContentCalendar'
import { TaskTemplates } from './screens/TaskTemplates'
import { NotificationBell } from './components/ui/NotificationBell'
import { CRM } from './screens/CRM'
import { Contacts } from './screens/Contacts'
import { Social } from './screens/Social'
import { Objectives } from './screens/Objectives'
import { Reports } from './screens/Reports'
import { SharedTask } from './screens/SharedTask'
import { AppLogoBadge } from './components/ui/AppLogo'
import { TaskDetailPanel } from './components/ui/TaskDetailPanel'
import { DealOverlay } from './components/ui/DealOverlay'
import { CommandPalette } from './components/v2/CommandPalette'
import { navItemsForRole } from './components/layout/Sidebar'
import { getViewAsRole, setViewAsRole } from './lib/viewAs'
import { useEffect, useRef } from 'react'

export function canSeeDashboard(role?: string | null) {
  return role === 'MASTER' || role === 'C_LEVEL'
}

// Detect deep-link URLs before rendering anything else
const _params = new URLSearchParams(window.location.search)
const _sharedTaskId = _params.get('share')

// Strip a query param from the URL bar without reloading (so an overlay doesn't reopen on refresh)
function stripUrlParam(key: string) {
  const url = new URL(window.location.href)
  url.searchParams.delete(key)
  window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
}

export default function App() {
  // Shared task view — completely isolated, no app shell
  if (_sharedTaskId) return <SharedTask taskId={_sharedTaskId} />

  const { session, profile, loading, accessDenied, signIn, signOut, refetchProfile } = useAuth()
  const realRole = profile?.role ?? undefined
  // MASTER can simulate another role to test access; everyone else uses their real role
  const viewAs = realRole === 'MASTER' ? getViewAsRole() : null
  const role = (viewAs ?? realRole) as string | undefined

  const [activeView, setActiveView] = useState('tasks')

  // Role-based landing, applied once the profile (and any view-as override)
  // resolves: MASTER → dashboard · TEAM → social · managers → tasks.
  // The old initializer ran before the profile loaded, so it never fired.
  const landedRef = useRef(false)
  useEffect(() => {
    if (landedRef.current || !role) return
    landedRef.current = true
    setActiveView(role === 'MASTER' ? 'dashboard' : role === 'TEAM' ? 'social' : 'tasks')
  }, [role])
  const [scoringBU, setScoringBU] = useState<string | null>(null)
  const [buFilter, setBuFilter] = useState('')

  // Overlay panels — opened from notifications / Slack deep-links, sit ON TOP of the
  // current screen so you keep working where you were.
  const [overlayTaskId, setOverlayTaskId] = useState<string | null>(() => _params.get('task'))
  const [overlayDealId, setOverlayDealId] = useState<string | null>(() => _params.get('deal'))
  const [paletteOpen, setPaletteOpen] = useState(false)

  function openTaskOverlay(taskId: string) { setOverlayTaskId(taskId) }
  function closeTaskOverlay() { setOverlayTaskId(null); stripUrlParam('task') }
  function closeDealOverlay() { setOverlayDealId(null); stripUrlParam('deal') }

  // ⌘K / Ctrl+K opens the command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function goToTasksForBU(buId: string) {
    setBuFilter(buId)
    setActiveView('tasks')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div className="animate-pulse-green">
            <AppLogoBadge size={32} radius={8} />
          </div>
          <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>Loading HOG APP…</span>
        </div>
      </div>
    )
  }

  if (!session) return <Auth onSignIn={signIn} accessDenied={accessDenied} />

  if (profile && !profile.onboarding_completed) {
    return <UserOnboarding profile={profile} onComplete={() => refetchProfile?.()} />
  }

  const ALLOWED_VIEWS = role === 'MASTER'
    ? null // null = no restriction
    : new Set(['tasks', 'crm', 'contacts', 'social', 'objectives', 'profile'])

  function handleNavigate(view: string) {
    if (ALLOWED_VIEWS && !ALLOWED_VIEWS.has(view)) return
    setActiveView(view)
  }

  function renderView() {
    switch (activeView) {
      case 'dashboard':
        if (!canSeeDashboard(role)) {
          return (
            <EmptyState
              icon="🔒"
              title="Access restricted"
              description="The Marketing Dashboard is only available to C-Level and Master users."
            />
          )
        }
        return <Dashboard onScoreBU={(code) => setScoringBU(code)} onViewTasks={goToTasksForBU} userRole={role} />
      case 'tasks':
        return <TaskBoard userRole={role} defaultBuFilter={buFilter} userId={profile?.id} />
      case 'crm':
        return <CRM userRole={role} userId={profile?.id} />
      case 'contacts':
        return <Contacts userRole={role} userId={profile?.id} />
      case 'social':
        return <Social profile={profile} userId={profile?.id} />
      case 'objectives':
        return <Objectives profile={profile} userId={profile?.id} userRole={role} />
      case 'calendar':
        return <CalendarView userRole={role} defaultBuFilter={buFilter} />
      case 'content':
        return <ContentCalendar userRole={role} />
      case 'revenue':
      case 'upload':
        return <RevenueUpload />
      case 'activity':
        return canSeeDashboard(role) ? <ActivityLog /> : (
          <EmptyState icon="🔒" title="Access restricted" description="Activity Log is only available to C-Level and Master users." />
        )
      case 'templates':
        return <TaskTemplates userRole={role} />
      case 'reports':
        return <Reports userRole={role} />
      case 'invite':
        return role === 'MASTER' ? <InviteUsers /> : null
      case 'profile':
        return profile ? <Profile profile={profile} onUpdated={() => refetchProfile?.()} /> : null
      default:
        return role === 'MASTER'
          ? <Dashboard onScoreBU={(code) => setScoringBU(code)} onViewTasks={goToTasksForBU} userRole={role} />
          : <TaskBoard userRole={role} defaultBuFilter={buFilter} userId={profile?.id} />
    }
  }

  return (
    <>
      <AppLayout
        activeView={activeView}
        onNavigate={handleNavigate}
        onSignOut={signOut}
        onOpenPalette={() => setPaletteOpen(true)}
        bell={profile ? <NotificationBell userId={profile.id} onOpenTask={openTaskOverlay} /> : undefined}
        userRole={role}
      >
        {renderView()}

        {scoringBU && (
          <BUOnboardingForm
            buCode={scoringBU}
            onClose={() => setScoringBU(null)}
            onSaved={() => setScoringBU(null)}
          />
        )}
      </AppLayout>

      {/* Command palette — ⌘K: navigate, search tasks/deals/contacts, quick actions */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        navItems={navItemsForRole(role).map(i => ({ id: i.id, label: i.label }))}
        onNavigate={handleNavigate}
        onOpenTask={openTaskOverlay}
        onOpenDeal={(id) => setOverlayDealId(id)}
        onCreateTask={() => {
          handleNavigate('tasks')
          // TaskBoard listens for this and opens its create modal
          setTimeout(() => window.dispatchEvent(new CustomEvent('hog:create-task')), 120)
        }}
      />

      {/* Role-preview banner — visible while a MASTER is simulating another role */}
      {viewAs && (
        <div style={{
          position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: '10px',
          background: '#F59E0B', color: '#000', borderRadius: '0 0 10px 10px',
          padding: '6px 14px', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          👁 Viendo como {viewAs}
          <button
            onClick={() => setViewAsRole(null)}
            style={{ background: '#000', color: '#F59E0B', border: 'none', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
          >
            Salir
          </button>
        </div>
      )}

      {/* Notification / deep-link overlays — render above the whole app shell */}
      {overlayTaskId && (
        <TaskDetailPanel
          taskId={overlayTaskId}
          onClose={closeTaskOverlay}
          onUpdated={() => { /* overlay view — background screen refreshes on its own */ }}
          userRole={role}
        />
      )}
      {overlayDealId && (
        <DealOverlay
          dealId={overlayDealId}
          onClose={closeDealOverlay}
          userRole={role}
        />
      )}
    </>
  )
}
