import { useState } from 'react'
import { LayoutDashboard, CheckSquare, BarChart3, Upload, ChevronRight, LogOut, UserCircle, UserPlus, Activity } from 'lucide-react'

interface Props {
  activeView: string
  onNavigate: (view: string) => void
  onSignOut: () => void
  userRole?: string
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',    icon: LayoutDashboard, shortcut: '1', cLevelOnly: true },
  { id: 'tasks',     label: 'Tasks',         icon: CheckSquare,     shortcut: '2' },
  { id: 'revenue',   label: 'Revenue',       icon: BarChart3,       shortcut: '3' },
  { id: 'activity',  label: 'Activity Log',  icon: Activity,        shortcut: '4', cLevelOnly: true },
  { id: 'upload',    label: 'CSV Upload',    icon: Upload,          shortcut: '5', masterOnly: true },
  { id: 'invite',    label: 'Invite Users',  icon: UserPlus,        shortcut: '6', masterOnly: true },
  { id: 'profile',   label: 'Profile',       icon: UserCircle,      shortcut: '7' },
]

function canSeeDashboard(role?: string) {
  return role === 'MASTER' || role === 'C_LEVEL'
}

export function Sidebar({ activeView, onNavigate, onSignOut, userRole }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <aside
      style={{
        width: expanded ? '220px' : '56px',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        transition: 'width 0.2s ease',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Logo area */}
      <div
        style={{ height: '56px', borderBottom: '1px solid var(--border-subtle)' }}
        className="flex items-center px-3 shrink-0"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div
            style={{ background: 'var(--accent)', borderRadius: '6px', width: '28px', height: '28px', flexShrink: 0 }}
            className="flex items-center justify-center"
          >
            <span style={{ color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px' }}>H</span>
          </div>
          {expanded && (
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
              HOG OPS
            </span>
          )}
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-1 p-2 overflow-hidden">
        {NAV_ITEMS.filter(item => {
          if (item.masterOnly && userRole !== 'MASTER') return false
          if (item.cLevelOnly && !canSeeDashboard(userRole)) return false
          return true
        }).map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                background: active ? 'var(--accent-bg)' : 'transparent',
                border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                borderRadius: '6px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: expanded ? '0 10px' : '0',
                justifyContent: expanded ? 'flex-start' : 'center',
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
              title={!expanded ? item.label : undefined}
            >
              <Icon size={16} style={{ flexShrink: 0 }} />
              {expanded && (
                <span style={{ fontSize: '13px', fontWeight: active ? 600 : 400 }}>{item.label}</span>
              )}
              {expanded && (
                <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '10px', marginLeft: 'auto' }}>
                  {item.shortcut}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Expand toggle + sign out */}
      <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="p-2 flex flex-col gap-1">
        <button
          onClick={onSignOut}
          style={{ color: 'var(--text-tertiary)', height: '36px', display: 'flex', alignItems: 'center', gap: '10px', padding: expanded ? '0 10px' : '0', justifyContent: expanded ? 'flex-start' : 'center', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: 'none', width: '100%' }}
          className="hover:text-[var(--status-risk)] transition-colors"
          title="Sign out"
        >
          <LogOut size={15} style={{ flexShrink: 0 }} />
          {expanded && <span style={{ fontSize: '13px' }}>Sign out</span>}
        </button>

        <button
          onClick={() => setExpanded(!expanded)}
          style={{ color: 'var(--text-tertiary)', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: 'none', width: '100%' }}
          className="hover:text-[var(--text-secondary)] transition-colors"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronRight size={15} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>
    </aside>
  )
}
