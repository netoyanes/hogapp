import { LayoutDashboard, CheckSquare, UserCircle, Shell, Handshake, CalendarDays, ClipboardCheck, Camera, Megaphone, BarChart3, Target, FileText } from 'lucide-react'
import { STR } from '../../lib/strings'

interface Props {
  activeView: string
  onNavigate: (view: string) => void
  userRole?: string
  userApps?: Set<string> | null
}

// v2 mobile nav — max 5 slots per role. Anything beyond lives in the "Más"
// sheet, opened from the top bar. One-handed reach, ≥44px targets.
const MASTER_SLOTS = [
  { id: 'dashboard', label: STR.nav.dashboard, icon: LayoutDashboard },
  { id: 'tasks',     label: STR.nav.tasks,     icon: CheckSquare },
  { id: 'crm',       label: STR.nav.crm,       icon: Handshake },
  { id: 'events',    label: STR.nav.events,    icon: CalendarDays },
  { id: 'profile',   label: STR.nav.profile,   icon: UserCircle },
]

const TEAM_SLOTS = [
  { id: 'concierge', label: STR.nav.concierge, icon: Shell },
  { id: 'tasks',    label: STR.nav.tasks,     icon: CheckSquare },
  { id: 'events',   label: STR.nav.events,    icon: CalendarDays },
  { id: 'crm',      label: STR.nav.crm,       icon: Handshake },
  { id: 'profile',  label: STR.nav.profile,   icon: UserCircle },
]

// Heart of House (piso + tablet de host): Mi turno · Reportar · Reservas · Perfil.
const HOH_SLOTS = [
  { id: 'casa',      label: 'Mi turno',  icon: ClipboardCheck },
  { id: 'reportar',  label: 'Reportar',  icon: Camera },
  { id: 'concierge', label: 'Reservas',  icon: Shell },
  { id: 'profile',   label: STR.nav.profile, icon: UserCircle },
]

// Catálogo de slots para armar el bottom nav desde las apps asignadas
// (user_apps): mismo orden de prioridad para todos los roles, HoH incluido.
const SLOT_CATALOG = [
  { id: 'casa',      label: 'Mi turno',          icon: ClipboardCheck },
  { id: 'reportar',  label: 'Reportar',          icon: Camera },
  { id: 'concierge', label: STR.nav.concierge,   icon: Shell },
  { id: 'dashboard', label: STR.nav.dashboard,   icon: LayoutDashboard },
  { id: 'tasks',     label: STR.nav.tasks,       icon: CheckSquare },
  { id: 'crm',       label: STR.nav.crm,         icon: Handshake },
  { id: 'events',    label: STR.nav.events,      icon: CalendarDays },
  { id: 'objectives', label: STR.nav.objectives, icon: Target },
  { id: 'content',   label: STR.nav.content,     icon: Megaphone },
  { id: 'revenue',   label: STR.nav.revenue,     icon: BarChart3 },
  { id: 'reports',   label: STR.nav.reports,     icon: FileText },
]

export function BottomNav({ activeView, onNavigate, userRole, userApps }: Props) {
  let items = userRole === 'MASTER' ? MASTER_SLOTS
    : userRole === 'HEART_OF_HOUSE' ? HOH_SLOTS
    : TEAM_SLOTS
  // Apps por usuario: con asignación explícita, el bottom nav se ARMA desde
  // esas apps (máx 4 + Perfil); el resto queda en el sheet "Más".
  if (userRole !== 'MASTER' && userApps && userApps.size > 0) {
    const assigned = SLOT_CATALOG.filter(s =>
      userApps.has(s.id) || (s.id === 'reportar' && userRole === 'HEART_OF_HOUSE' && userApps.has('casa')))
    items = [...assigned.slice(0, 4), { id: 'profile', label: STR.nav.profile, icon: UserCircle }]
  }

  return (
    <nav
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map((item) => {
        const Icon = item.icon
        const active = activeView === item.id
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              flex: 1,
              minHeight: 'var(--touch-target)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              padding: '9px 4px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--text-tertiary)',
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.4 : 2} />
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-ui)', fontWeight: active ? 700 : 400 }}>
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
