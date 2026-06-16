import { LayoutDashboard, CheckSquare, CalendarDays, Megaphone, UserCircle, UserPlus, BarChart3, Activity, Handshake, FileText, Contact2 } from 'lucide-react'
import { TENANT } from '../../config/tenant'

interface Props {
  activeView: string
  onNavigate: (view: string) => void
  userRole?: string
}

export function BottomNav({ activeView, onNavigate, userRole }: Props) {
  const allItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tasks',     label: 'Tasks',     icon: CheckSquare },
    { id: 'crm',       label: 'CRM',       icon: Handshake },
    { id: 'contacts',  label: 'Contacts',  icon: Contact2 },
    { id: 'calendar',  label: 'Calendar',  icon: CalendarDays },
    { id: 'content',   label: 'Content',   icon: Megaphone },
    { id: 'revenue',   label: 'Revenue',   icon: BarChart3 },
    { id: 'activity',  label: 'Activity',  icon: Activity },
    { id: 'invite',    label: 'Invite',    icon: UserPlus },
    { id: 'reports',   label: 'Reports',   icon: FileText },
    { id: 'profile',   label: 'Profile',   icon: UserCircle },
  ]
  const items = allItems.filter(item => {
    if (!TENANT.enabledViews.includes(item.id)) return false
    if (userRole === 'MASTER') return true
    return ['tasks', 'crm', 'contacts', 'profile'].includes(item.id)
  })

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
