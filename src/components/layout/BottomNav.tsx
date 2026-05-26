import { LayoutDashboard, CheckSquare, CalendarDays, UserCircle, UserPlus, BarChart3, Activity } from 'lucide-react'

interface Props {
  activeView: string
  onNavigate: (view: string) => void
  userRole?: string
}

function canSeeDashboard(role?: string) {
  return role === 'MASTER' || role === 'C_LEVEL'
}

export function BottomNav({ activeView, onNavigate, userRole }: Props) {
  const items = [
    canSeeDashboard(userRole) && { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tasks',    label: 'Tasks',    icon: CheckSquare },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'revenue',  label: 'Revenue',  icon: BarChart3 },
    canSeeDashboard(userRole) && { id: 'activity', label: 'Activity', icon: Activity },
    userRole === 'MASTER' && { id: 'invite', label: 'Invite', icon: UserPlus },
    { id: 'profile',  label: 'Profile',  icon: UserCircle },
  ].filter(Boolean) as { id: string; label: string; icon: React.ElementType }[]

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
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              padding: '10px 4px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--text-tertiary)',
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-ui)', fontWeight: active ? 600 : 400 }}>
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
