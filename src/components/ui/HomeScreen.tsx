import { useEffect } from 'react'
import {
  LayoutDashboard, CheckSquare, Handshake, CalendarDays, Megaphone,
  BarChart3, Activity, LayoutTemplate, Upload, UserPlus, UserCircle, FileText,
  Contact2, Sparkles, Target, Shell,
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
  { id: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard, color: '#E8A33D' },
  { id: 'tasks',      label: 'Tareas',      icon: CheckSquare,     color: '#7FA3C2' },
  { id: 'crm',        label: 'CRM',         icon: Handshake,       color: '#D98C9F' },
  { id: 'concierge',  label: 'Concierge',   icon: Shell,           color: '#5E9FB8' },
  { id: 'contacts',   label: 'Directorio',  icon: Contact2,        color: '#6FA8A0' },
  { id: 'social',     label: 'Social',      icon: Sparkles,        color: '#B08BC9' },
  { id: 'objectives', label: 'Objetivos',   icon: Target,          color: '#5FBF7A' },
  { id: 'calendar',   label: 'Calendario',  icon: CalendarDays,    color: '#A79BC8' },
  { id: 'content',    label: 'Contenido',   icon: Megaphone,       color: '#DB9A6A' },
  { id: 'revenue',    label: 'Ingresos',    icon: BarChart3,       color: '#8FBF9F' },
  { id: 'activity',   label: 'Actividad',   icon: Activity,        color: '#C9A76B' },
  { id: 'templates',  label: 'Plantillas',  icon: LayoutTemplate,  color: '#9BA3C9' },
  { id: 'upload',     label: 'Carga CSV',   icon: Upload,          color: '#9C9488' },
  { id: 'invite',     label: 'Usuarios',    icon: UserPlus,        color: '#7FB8AD' },
  { id: 'reports',    label: 'Reportes',    icon: FileText,        color: '#8CA8C4' },
  { id: 'profile',    label: 'Perfil',      icon: UserCircle,      color: '#A89F92' },
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
    if (app.id === 'concierge' && userRole === 'MARKETING') return false // hospitalidad sin Marketing
    if (userRole === 'MASTER') return true
    return ['tasks', 'crm', 'concierge', 'contacts', 'social', 'objectives', 'profile'].includes(app.id)
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
