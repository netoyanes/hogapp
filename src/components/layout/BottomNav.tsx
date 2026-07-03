import { LayoutDashboard, CheckSquare, UserCircle, Handshake, Contact2, Sparkles } from 'lucide-react'
import { STR } from '../../lib/strings'

interface Props {
  activeView: string
  onNavigate: (view: string) => void
  userRole?: string
}

// v2 mobile nav — max 5 slots per role. Anything beyond lives in the "Más"
// sheet, opened from the top bar. One-handed reach, ≥44px targets.
const MASTER_SLOTS = [
  { id: 'dashboard', label: STR.nav.dashboard, icon: LayoutDashboard },
  { id: 'tasks',     label: STR.nav.tasks,     icon: CheckSquare },
  { id: 'crm',       label: STR.nav.crm,       icon: Handshake },
  { id: 'social',    label: STR.nav.social,    icon: Sparkles },
  { id: 'profile',   label: STR.nav.profile,   icon: UserCircle },
]

const TEAM_SLOTS = [
  { id: 'tasks',    label: STR.nav.tasks,     icon: CheckSquare },
  { id: 'crm',      label: STR.nav.crm,       icon: Handshake },
  { id: 'social',   label: STR.nav.social,    icon: Sparkles },
  { id: 'contacts', label: STR.nav.directory, icon: Contact2 },
  { id: 'profile',  label: STR.nav.profile,   icon: UserCircle },
]

export function BottomNav({ activeView, onNavigate, userRole }: Props) {
  const items = userRole === 'MASTER' ? MASTER_SLOTS : TEAM_SLOTS

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
