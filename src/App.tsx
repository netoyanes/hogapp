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
import { Reports } from './screens/Reports'
import { SharedTask } from './screens/SharedTask'
import { AppLogoBadge } from './components/ui/AppLogo'

export function canSeeDashboard(role?: string | null) {
  return role === 'MASTER' || role === 'C_LEVEL'
}

// Detect shared task URL before rendering anything else
const _sharedTaskId = new URLSearchParams(window.location.search).get('share')

export default function App() {
  // Shared task view — completely isolated, no app shell
  if (_sharedTaskId) return <SharedTask taskId={_sharedTaskId} />

  const { session, profile, loading, accessDenied, signIn, signOut, refetchProfile } = useAuth()
  const role = profile?.role ?? undefined

  // Default view: dashboard for MASTER/C_LEVEL, tasks for everyone else
  const [activeView, setActiveView] = useState(() =>
    canSeeDashboard(role) ? 'dashboard' : 'tasks'
  )
  const [scoringBU, setScoringBU] = useState<string | null>(null)
  const [buFilter, setBuFilter] = useState('')

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
          <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>Loading HOG OPS…</span>
        </div>
      </div>
    )
  }

  if (!session) return <Auth onSignIn={signIn} accessDenied={accessDenied} />

  if (profile && !profile.onboarding_completed) {
    return <UserOnboarding profile={profile} onComplete={() => refetchProfile?.()} />
  }

  function handleNavigate(view: string) {
    if (view === 'dashboard' && !canSeeDashboard(role)) return
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
        return <TaskBoard userRole={role} defaultBuFilter={buFilter} />
      case 'crm':
        return <CRM userRole={role} />
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
        return canSeeDashboard(role)
          ? <Dashboard onScoreBU={(code) => setScoringBU(code)} onViewTasks={goToTasksForBU} userRole={role} />
          : <TaskBoard userRole={role} defaultBuFilter={buFilter} />
    }
  }

  return (
    <>
      <AppLayout
        activeView={activeView}
        onNavigate={handleNavigate}
        onSignOut={signOut}
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

      {profile && <NotificationBell userId={profile.id} />}
    </>
  )
}
