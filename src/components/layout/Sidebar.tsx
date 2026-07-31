import { useState, type ReactNode } from 'react'
import { LayoutDashboard, CheckSquare, CalendarDays, Megaphone, BarChart3, Upload, ChevronRight, LogOut, UserCircle, UserPlus, Activity, LayoutTemplate, Handshake, FileText, Target, Command, Shell, ClipboardCheck } from 'lucide-react'
import { AppLogoBadge } from '../ui/AppLogo'
import { TENANT, viewTitle } from '../../config/tenant'
import { STR } from '../../lib/strings'

interface Props {
  activeView: string
  onNavigate: (view: string) => void
  onSignOut: () => void
  onHomeClick: () => void
  onOpenPalette?: () => void
  bell?: ReactNode
  userRole?: string
  userApps?: Set<string> | null
}

export const NAV_ITEMS = [
  { id: 'dashboard',  label: STR.nav.dashboard,  icon: LayoutDashboard, shortcut: '1', cLevelOnly: true },
  { id: 'tasks',      label: STR.nav.tasks,      icon: CheckSquare,     shortcut: '2' },
  { id: 'crm',        label: STR.nav.crm,        icon: Handshake,       shortcut: '3' },
  { id: 'concierge',  label: STR.nav.concierge,  icon: Shell },
  { id: 'casa',       label: STR.nav.casa,       icon: ClipboardCheck },
  { id: 'events',     label: STR.nav.events,     icon: CalendarDays,    shortcut: '5' },
  { id: 'objectives', label: STR.nav.objectives, icon: Target,          shortcut: '6' },
  { id: 'content',    label: STR.nav.content,    icon: Megaphone,       shortcut: '8' },
  { id: 'revenue',    label: STR.nav.revenue,    icon: BarChart3,       shortcut: '9' },
  { id: 'activity',   label: STR.nav.activity,   icon: Activity,                     cLevelOnly: true },
  { id: 'templates',  label: STR.nav.templates,  icon: LayoutTemplate,               cLevelOnly: true },
  { id: 'upload',     label: STR.nav.upload,     icon: Upload,          shortcut: '0', masterOnly: true },
  { id: 'invite',     label: STR.nav.invite,     icon: UserPlus,        masterOnly: true },
  { id: 'reports',    label: STR.nav.reports,    icon: FileText },
  { id: 'profile',    label: STR.nav.profile,    icon: UserCircle },
]

// Views every non-MASTER role can navigate to (mirrors ALLOWED_VIEWS in App)
export const NON_MASTER_VIEWS = ['tasks', 'crm', 'concierge', 'casa', 'events', 'objectives', 'profile']
// La Casa (operación de piso): personal HoH la vive, Ops la administra,
// C-Level/Master supervisan. Marketing y Team no la ven.
const CASA_ROLES = new Set(['MASTER', 'C_LEVEL', 'OPS_MANAGER', 'HEART_OF_HOUSE', 'DEV'])

// apps: asignación por usuario (user_apps). Con filas, el usuario ve SOLO esas
// apps (+ Perfil siempre); sin filas, aplican los defaults de su rol.
export function navItemsForRole(userRole?: string, apps?: Set<string> | null) {
  if (userRole !== 'MASTER' && apps && apps.size > 0) {
    return NAV_ITEMS.filter(item => TENANT.enabledViews.includes(item.id) && !item.masterOnly
      && (item.id === 'profile' || apps.has(item.id)))
  }
  // Heart of House (piso + tablet de host): La Casa, Reservas (Concierge) y Perfil
  if (userRole === 'HEART_OF_HOUSE') {
    return NAV_ITEMS.filter(item => ['casa', 'concierge', 'profile'].includes(item.id))
  }
  // DEV (auditoría): ve toda la plataforma menos administración (Usuarios/Carga)
  if (userRole === 'DEV') {
    return NAV_ITEMS.filter(item => TENANT.enabledViews.includes(item.id) && !item.masterOnly)
  }
  return NAV_ITEMS.filter(item => {
    if (!TENANT.enabledViews.includes(item.id)) return false
    if (item.id === 'casa' && !CASA_ROLES.has(userRole ?? '')) return false
    if (userRole === 'MASTER') return true
    return NON_MASTER_VIEWS.includes(item.id)
  })
}

export function Sidebar({ activeView, onNavigate, onSignOut, onHomeClick, onOpenPalette, bell, userRole, userApps }: Props) {
  const [expanded, setExpanded] = useState(false)
  const items = navItemsForRole(userRole, userApps)

  return (
    <aside
      style={{
        width: expanded ? '220px' : '56px',
        background: 'var(--bg-surface)',
        transition: 'width 0.2s ease',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Logo + bell */}
      <div
        style={{ height: '56px', borderBottom: '1px solid var(--border-subtle)' }}
        className="flex items-center px-3 shrink-0 gap-1"
      >
        <button
          onClick={onHomeClick}
          title="Inicio"
          className="flex items-center gap-2.5 overflow-hidden"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flex: 1, minWidth: 0 }}
        >
          <div className="hover:opacity-80" style={{ transition: 'opacity 0.15s', flexShrink: 0 }}>
            <AppLogoBadge size={28} radius={6} />
          </div>
          {expanded && (
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, overflow: 'hidden', textAlign: 'left' }}>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                {TENANT.appName}
              </span>
              <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '9px', whiteSpace: 'nowrap' }}>
                {viewTitle(activeView)}
              </span>
            </span>
          )}
        </button>
        {expanded && bell}
      </div>

      {/* Bell when collapsed — its own row so it never crowds the logo */}
      {!expanded && bell && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          {bell}
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-1 p-2 overflow-hidden">
        {items.map((item) => {
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
                borderRadius: 'var(--radius-sm)',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: expanded ? '0 10px' : '0',
                justifyContent: expanded ? 'flex-start' : 'center',
                cursor: 'pointer',
                transition: 'var(--motion-fast)',
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

      {/* ⌘K + sign out + expand */}
      <div style={{ borderTop: '1px solid var(--border-subtle)' }} className="p-2 flex flex-col gap-1">
        {onOpenPalette && (
          <button
            onClick={onOpenPalette}
            style={{ color: 'var(--text-tertiary)', height: '36px', display: 'flex', alignItems: 'center', gap: '10px', padding: expanded ? '0 10px' : '0', justifyContent: expanded ? 'flex-start' : 'center', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', border: 'none', width: '100%' }}
            className="hover:text-[var(--text-secondary)] transition-colors"
            title="Buscar (⌘K)"
          >
            <Command size={15} style={{ flexShrink: 0 }} />
            {expanded && (
              <>
                <span style={{ fontSize: '13px' }}>Buscar</span>
                <kbd style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '9px', border: '1px solid var(--border-default)', borderRadius: 4, padding: '1px 5px', color: 'var(--text-tertiary)' }}>⌘K</kbd>
              </>
            )}
          </button>
        )}
        <button
          onClick={onSignOut}
          style={{ color: 'var(--text-tertiary)', height: '36px', display: 'flex', alignItems: 'center', gap: '10px', padding: expanded ? '0 10px' : '0', justifyContent: expanded ? 'flex-start' : 'center', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', border: 'none', width: '100%' }}
          className="hover:text-[var(--status-risk)] transition-colors"
          title="Cerrar sesión"
        >
          <LogOut size={15} style={{ flexShrink: 0 }} />
          {expanded && <span style={{ fontSize: '13px' }}>Cerrar sesión</span>}
        </button>

        <button
          onClick={() => setExpanded(!expanded)}
          style={{ color: 'var(--text-tertiary)', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', border: 'none', width: '100%' }}
          className="hover:text-[var(--text-secondary)] transition-colors"
          title={expanded ? 'Colapsar' : 'Expandir'}
        >
          <ChevronRight size={15} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>
    </aside>
  )
}
