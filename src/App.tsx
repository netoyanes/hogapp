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

export function canSeeDashboard(role?: string | null) {
  return role === 'MASTER' || role === 'C_LEVEL'
}

export default function App() {
  const { session, profile, loading, signIn, signOut, refetchProfile } = useAuth()
  const role = profile?.role ?? undefined

  // Default view: dashboard for MASTER/C_LEVEL, tasks for everyone else
  const [activeView, setActiveView] = useState(() =>
    canSeeDashboard(role) ? 'dashboard' : 'tasks'
  )
  const [scoringBU, setScoringBU] = useState<string | null>(null)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', background: 'var(--accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="animate-pulse-green">
            <span style={{ color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px' }}>H</span>
          </div>
          <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>Loading HOG OPS…</span>
        </div>
      </div>
    )
  }

  if (!session) return <Auth onSignIn={signIn} />

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
        return <Dashboard onScoreBU={(code) => setScoringBU(code)} userRole={role} />
      case 'tasks':
        return <TaskBoard userRole={role} />
      case 'revenue':
      case 'upload':
        return <RevenueUpload />
      case 'activity':
        return canSeeDashboard(role) ? <ActivityLog /> : (
          <EmptyState icon="🔒" title="Access restricted" description="Activity Log is only available to C-Level and Master users." />
        )
      case 'invite':
        return role === 'MASTER' ? <InviteUsers /> : null
      case 'profile':
        return profile ? <Profile profile={profile} onUpdated={() => refetchProfile?.()} /> : null
      default:
        return canSeeDashboard(role)
          ? <Dashboard onScoreBU={(code) => setScoringBU(code)} userRole={role} />
          : <TaskBoard userRole={role} />
    }
  }

  return (
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
  )
}
