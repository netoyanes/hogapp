import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { Auth } from './screens/Auth'
import { UserOnboarding } from './screens/UserOnboarding'
import { Dashboard } from './screens/Dashboard'
import { TaskBoard } from './screens/TaskBoard'
import { RevenueUpload } from './screens/RevenueUpload'
import { BUOnboardingForm } from './screens/BUOnboardingForm'
import { AppLayout } from './components/layout/AppLayout'

export default function App() {
  const { session, profile, loading, signIn, signOut, refetchProfile } = useAuth()
  const [activeView, setActiveView] = useState('dashboard')
  const [scoringBU, setScoringBU] = useState<string | null>(null)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div
            style={{ width: '32px', height: '32px', background: 'var(--accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            className="animate-pulse-green"
          >
            <span style={{ color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px' }}>H</span>
          </div>
          <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>Loading HOG OPS…</span>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Auth onSignIn={signIn} />
  }

  if (profile && !profile.onboarding_completed) {
    return <UserOnboarding profile={profile} onComplete={() => refetchProfile?.()} />
  }

  function renderView() {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard onScoreBU={(code) => setScoringBU(code)} userRole={profile?.role ?? undefined} />
      case 'tasks':
        return <TaskBoard userRole={profile?.role ?? undefined} />
      case 'revenue':
      case 'upload':
        return <RevenueUpload />
      default:
        return <Dashboard onScoreBU={(code) => setScoringBU(code)} userRole={profile?.role ?? undefined} />
    }
  }

  return (
    <AppLayout
      activeView={activeView}
      onNavigate={setActiveView}
      onSignOut={signOut}
      userRole={profile?.role ?? undefined}
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
