import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'
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
import { TaskTemplates } from './screens/TaskTemplates'
import { NotificationBell } from './components/ui/NotificationBell'
import { CRM } from './screens/CRM'
import { Events } from './screens/Events'
import { Objectives } from './screens/Objectives'
import { Reports } from './screens/Reports'
import { Concierge } from './screens/Concierge'
import { Casa } from './screens/Casa'
import { SharedTask } from './screens/SharedTask'
import { PrivacyNotice } from './screens/PrivacyNotice'
import { PublicReservation } from './screens/PublicReservation'
import { AppLogoBadge } from './components/ui/AppLogo'
import { TaskDetailPanel } from './components/ui/TaskDetailPanel'
import { DealOverlay } from './components/ui/DealOverlay'
import { GuestOverlay } from './components/ui/GuestOverlay'
import { Toaster } from './components/v2'
import { CommandPalette } from './components/v2/CommandPalette'
import { navItemsForRole } from './components/layout/Sidebar'
import { getViewAsRole, setViewAsRole } from './lib/viewAs'
import { useEffect, useRef } from 'react'

export function canSeeDashboard(role?: string | null) {
  return role === 'MASTER' || role === 'C_LEVEL' || role === 'DEV'
}

// Alias legados de vistas: asignar un app libera también sus alias
const APP_ALIASES: Record<string, string[]> = {
  crm: ['contacts'], concierge: ['reservations'], casa: ['reportar'], revenue: ['upload'],
}
function expandApps(apps: Set<string>): Set<string> {
  const s = new Set<string>(['profile'])
  apps.forEach(a => { s.add(a); (APP_ALIASES[a] ?? []).forEach(x => s.add(x)) })
  return s
}

// Detect deep-link URLs before rendering anything else
const _params = new URLSearchParams(window.location.search)
const _sharedTaskId = _params.get('share')
const _aviso = _params.get('aviso')
const _reservar = _params.get('reservar')

// Strip a query param from the URL bar without reloading (so an overlay doesn't reopen on refresh)
function stripUrlParam(key: string) {
  const url = new URL(window.location.href)
  url.searchParams.delete(key)
  window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
}

export default function App() {
  // Reserva pública por venue — página aislada, sin sesión (?reservar=CÓDIGO)
  if (_reservar) return <PublicReservation code={_reservar} />
  // Shared task view — completely isolated, no app shell
  if (_sharedTaskId) return <SharedTask taskId={_sharedTaskId} />
  // Aviso de privacidad — página pública estática
  if (_aviso) return <PrivacyNotice />

  const { session, profile, loading, accessDenied, signIn, signOut, refetchProfile } = useAuth()
  const realRole = profile?.role ?? undefined
  // MASTER can simulate another role to test access; everyone else uses their real role
  const viewAs = realRole === 'MASTER' ? getViewAsRole() : null
  const role = (viewAs ?? realRole) as string | undefined

  const [activeView, setActiveView] = useState('tasks')

  // Funciones extra por usuario (capabilities): el rol define lo general y
  // las funciones liberan áreas puntuales (ej. 'talento' para el booker que
  // vive en Marketing). Se administran en Usuarios (Master).
  const [caps, setCaps] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('user_capabilities').select('capability').eq('user_id', profile.id)
      .then(({ data }) => setCaps(new Set((data ?? []).map(c => c.capability))))
  }, [profile?.id])

  // Apps por usuario: el Master asigna qué apps ve cada quien (user_apps).
  // Sin filas asignadas, aplican los defaults del rol (compatibilidad).
  const [userApps, setUserApps] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('user_apps').select('app').eq('user_id', profile.id)
      .then(({ data }) => setUserApps(data && data.length ? new Set(data.map(a => a.app)) : null))
  }, [profile?.id])

  // Con apps asignadas (cualquier rol, HoH incluido): si la vista actual no
  // está permitida, aterrizar en la primera app asignada según prioridad.
  useEffect(() => {
    if (!role || role === 'MASTER' || !userApps || userApps.size === 0) return
    const allowed = expandApps(userApps)
    if (!allowed.has(activeView)) {
      const orden = role === 'HEART_OF_HOUSE'
        ? ['concierge', 'casa', 'tasks', 'dashboard', 'crm', 'events', 'objectives', 'content', 'revenue', 'reports', 'activity', 'templates']
        : ['casa', 'concierge', 'tasks', 'dashboard', 'crm', 'events', 'objectives', 'content', 'revenue', 'reports', 'activity', 'templates']
      setActiveView(orden.find(v => allowed.has(v)) ?? 'profile')
    }
  }, [role, userApps, activeView])

  // Role-based landing, applied once the profile (and any view-as override)
  // resolves: MASTER → dashboard · TEAM → social · managers → tasks.
  // The old initializer ran before the profile loaded, so it never fired.
  const landedRef = useRef(false)
  useEffect(() => {
    if (landedRef.current || !role) return
    landedRef.current = true
    // Team en tablet (host stand) aterriza en Concierge (Reservas); en teléfono, en Tareas.
    // HoH aterriza SIEMPRE en Reservas (la tablet vive en el host stand).
    const teamLanding = window.innerWidth >= 768 ? 'concierge' : 'tasks'
    setActiveView(role === 'MASTER' || role === 'DEV' ? 'dashboard' : role === 'HEART_OF_HOUSE' ? 'concierge' : role === 'TEAM' ? teamLanding : 'tasks')
  }, [role])
  const [scoringBU, setScoringBU] = useState<string | null>(null)
  const [buFilter, setBuFilter] = useState('')

  // Overlay panels — opened from notifications / Slack deep-links, sit ON TOP of the
  // current screen so you keep working where you were.
  const [overlayTaskId, setOverlayTaskId] = useState<string | null>(() => _params.get('task'))
  const [overlayDealId, setOverlayDealId] = useState<string | null>(() => _params.get('deal'))
  const [overlayGuestId, setOverlayGuestId] = useState<string | null>(() => _params.get('guest'))
  const [paletteOpen, setPaletteOpen] = useState(false)

  function openTaskOverlay(taskId: string) { setOverlayTaskId(taskId) }
  function closeTaskOverlay() { setOverlayTaskId(null); stripUrlParam('task') }
  function closeDealOverlay() { setOverlayDealId(null); stripUrlParam('deal') }
  function closeGuestOverlay() { setOverlayGuestId(null); stripUrlParam('guest') }

  // Cross-module hops: Calendario → Reservas (día) y "Convertir en deal" → overlay
  useEffect(() => {
    const goRes = () => handleNavigate('concierge')
    const openDeal = (e: Event) => { const id = (e as CustomEvent).detail; if (id) setOverlayDealId(id) }
    window.addEventListener('hog:open-reservations', goRes)
    window.addEventListener('hog:open-deal', openDeal)
    return () => {
      window.removeEventListener('hog:open-reservations', goRes)
      window.removeEventListener('hog:open-deal', openDeal)
    }
  })

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

  // 'contacts' queda como alias legado (links viejos) — renderiza Comercial.
  // Apps por usuario: con asignación explícita (user_apps), el usuario ve SOLO
  // esas apps + Perfil (los alias legados se expanden). Sin asignación, rol.
  // Aplica a TODOS los roles no-Master, HoH incluido.
  let ALLOWED_VIEWS: Set<string> | null
  if (role === 'MASTER') {
    ALLOWED_VIEWS = null // null = no restriction
  } else if (userApps && userApps.size > 0) {
    ALLOWED_VIEWS = expandApps(userApps)
  } else {
    // Objetivos es SOLO Master; Contenido se retiró (vive en Proyectos)
    ALLOWED_VIEWS = role === 'DEV'
      ? new Set(['dashboard', 'tasks', 'crm', 'concierge', 'casa', 'contacts', 'events',
                 'revenue', 'reports', 'activity', 'templates', 'profile']) // auditoría: todo menos admin (Usuarios/Carga)
      : role === 'HEART_OF_HOUSE'
        ? new Set(['casa', 'reportar', 'concierge', 'profile']) // piso + tablet de host: La Casa y Reservas
        : role === 'TEAM' || role === 'MARKETING'
          ? new Set(['tasks', 'crm', 'concierge', 'contacts', 'events', 'profile'])
          : new Set(['tasks', 'crm', 'concierge', 'casa', 'contacts', 'events', 'profile'])
  }

  function handleNavigate(view: string) {
    if (ALLOWED_VIEWS && !ALLOWED_VIEWS.has(view)) return
    setActiveView(view)
  }

  function renderView() {
    switch (activeView) {
      case 'dashboard':
        if (!canSeeDashboard(role) && !userApps?.has('dashboard')) {
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
      case 'contacts': // alias legado — el directorio ahora vive dentro de Comercial
        return <CRM userRole={role} userId={profile?.id} caps={caps} />
      case 'reservations': // alias legado (links viejos de Slack/Calendario)
      case 'concierge':
        return <Concierge userId={profile?.id} userRole={role} caps={caps} />
      case 'casa':
        return <Casa userId={profile?.id} userRole={role} />
      case 'reportar': // slot de bottom-nav del HoH: La Casa con el reporte abierto
        return <Casa userId={profile?.id} userRole={role} initialReport />
      case 'events':
        return <Events userRole={role} userId={profile?.id} caps={caps} onOpenTask={openTaskOverlay} />
      case 'objectives':
        // Objetivos es exclusivo del Master (dirección)
        return role === 'MASTER'
          ? <Objectives profile={profile} userId={profile?.id} userRole={role} />
          : <EmptyState icon="🔒" title="Solo Master" description="Objetivos es exclusivo de dirección." />
      case 'revenue':
      case 'upload':
        return <RevenueUpload />
      case 'activity':
        return canSeeDashboard(role) || userApps?.has('activity') ? <ActivityLog /> : (
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
        userApps={userApps}
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
        navItems={navItemsForRole(role, userApps).map(i => ({ id: i.id, label: i.label }))}
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
          position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: '50%', transform: 'translateX(-50%)', zIndex: 100,
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
          onOpenTask={(id) => setOverlayTaskId(id)}
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
      {overlayGuestId && (
        <GuestOverlay
          guestId={overlayGuestId}
          onClose={closeGuestOverlay}
          userRole={role}
        />
      )}

      <Toaster />
    </>
  )
}
