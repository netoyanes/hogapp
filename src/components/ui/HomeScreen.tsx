import { useEffect } from 'react'
import {
  LayoutDashboard, CheckSquare, Handshake, CalendarDays, Megaphone,
  BarChart3, Activity, LayoutTemplate, Upload, UserPlus, UserCircle, FileText,
} from 'lucide-react'
import { AppLogoBadge } from './AppLogo'
import { TENANT } from '../../config/tenant'

interface App {
  id: string
  label: string
  icon: React.ElementType
  color: string
}

const APPS: App[] = [
  { id: 'dashboard',  label: 'Dashboard',     icon: LayoutDashboard, color: '#39FF14' },
  { id: 'tasks',      label: 'Tasks',         icon: CheckSquare,     color: '#3B82F6' },
  { id: 'crm',        label: 'CRM',           icon: Handshake,       color: '#EC4899' },
  { id: 'calendar',   label: 'Calendar',      icon: CalendarDays,    color: '#8B5CF6' },
  { id: 'content',    label: 'Content',       icon: Megaphone,       color: '#F97316' },
  { id: 'revenue',    label: 'Revenue',       icon: BarChart3,       color: '#22C55E' },
  { id: 'activity',   label: 'Activity Log',  icon: Activity,        color: '#F59E0B' },
  { id: 'templates',  label: 'Templates',     icon: LayoutTemplate,  color: '#6366F1' },
  { id: 'upload',     label: 'CSV Upload',    icon: Upload,          color: '#6B7280' },
  { id: 'invite',     label: 'Invite Users',  icon: UserPlus,        color: '#14B8A6' },
  { id: 'reports',    label: 'Reports',       icon: FileText,        color: '#0EA5E9' },
  { id: 'profile',    label: 'Profile',       icon: UserCircle,      color: '#64748B' },
]

interface Props {
  onNavigate: (view: string) => void
  onClose: () => void
  userRole?: string
}

export function HomeScreen({ onNavigate, onClose, userRole }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const visible = APPS.filter(app => {
    if (!TENANT.enabledViews.includes(app.id)) return false
    if (userRole === 'MASTER') return true
    return ['tasks', 'crm', 'profile'].includes(app.id)
  })

  function go(id: string) {
    onNavigate(id)
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      {/* Tablet frame */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          padding: '32px',
          width: '100%',
          maxWidth: '640px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <AppLogoBadge size={32} radius={8} />
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '15px' }}>{TENANT.appName}</span>
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>ESC to close</span>
        </div>

        {/* App grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
            gap: '12px',
          }}
        >
          {visible.map(app => {
            const Icon = app.icon
            return (
              <button
                key={app.id}
                onClick={() => go(app.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 8px',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  outline: 'none',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.background = `${app.color}15`
                  el.style.borderColor = `${app.color}60`
                  el.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.background = 'var(--bg-base)'
                  el.style.borderColor = 'var(--border-subtle)'
                  el.style.transform = 'none'
                }}
              >
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background: `${app.color}20`,
                    border: `1px solid ${app.color}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={24} style={{ color: app.color }} />
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-ui)',
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}>
                  {app.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
