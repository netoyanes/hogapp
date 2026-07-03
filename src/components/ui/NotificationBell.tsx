import { useState } from 'react'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import { useIsMobile } from '../../hooks/useIsMobile'

const TYPE_ICONS: Record<string, string> = {
  task_created:   '🟢',
  status_changed: '🔵',
  proof_uploaded: '🟡',
  comment_posted: '💬',
  user_invited:   '🟣',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

interface Props {
  userId: string
  onOpenTask?: (taskId: string) => void
}

// Notification types whose entity_id points at a task
const TASK_TYPES = new Set(['task_created', 'status_changed', 'proof_uploaded', 'comment_posted'])

// Top-bar bell (v2) — replaces the floating FAB. Renders inline wherever the
// shell places it (sidebar header on desktop, top bar on mobile); the panel
// drops below the top edge.
export function NotificationBell({ userId, onOpenTask }: Props) {
  const isMobile = useIsMobile()
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications(userId)
  const [open, setOpen] = useState(false)
  const [permissionAsked, setPermissionAsked] = useState(false)

  function handleOpen() {
    setOpen(v => !v)
    if (!permissionAsked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
      setPermissionAsked(true)
    }
  }

  const panelPos: React.CSSProperties = isMobile
    ? { position: 'fixed', top: 52, left: 8, right: 8, zIndex: 95, maxHeight: '70dvh' }
    : { position: 'fixed', top: 10, left: 56, zIndex: 95, width: 340, maxHeight: '72vh' }

  return (
    <>
      <button
        onClick={handleOpen}
        title="Notificaciones"
        aria-label={`Notificaciones${unreadCount ? ` (${unreadCount} sin leer)` : ''}`}
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: 'var(--radius-sm)',
          background: open ? 'var(--accent-bg)' : 'transparent',
          border: `1px solid ${open ? 'var(--accent-border)' : 'transparent'}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Bell size={17} style={{ color: open || unreadCount > 0 ? 'var(--accent)' : 'var(--text-secondary)' }} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, borderRadius: 8,
            background: 'var(--status-risk)', color: '#fff', fontSize: 9, fontWeight: 700,
            fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 94 }} />
          <div style={{
            ...panelPos,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
          }}>
            {/* Header */}
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 'var(--text-size-sm)' }}>Notificaciones</span>
                {unreadCount > 0 && (
                  <span className="num" style={{ background: 'color-mix(in srgb, var(--status-risk) 14%, transparent)', color: 'var(--status-risk)', fontSize: 11, padding: '1px 6px', borderRadius: 4 }}>
                    {unreadCount} nuevas
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, minHeight: 32 }}>
                    <CheckCheck size={13} /> Marcar leídas
                  </button>
                )}
                <button onClick={() => setOpen(false)} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}>
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Push permission banner */}
            {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
              <div style={{ padding: 'var(--space-2) var(--space-4)', background: 'var(--accent-bg)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexShrink: 0 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Activa push para avisos con la app cerrada</span>
                <button
                  onClick={() => Notification.requestPermission()}
                  style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Activar
                </button>
              </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                  <Bell size={22} style={{ color: 'var(--text-tertiary)', margin: '0 auto 8px' }} />
                  <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Sin notificaciones por ahora.</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const canOpen = !!(onOpenTask && notif.entity_id && TASK_TYPES.has(notif.type ?? ''))
                  function handleClick() {
                    if (!notif.read) markRead(notif.id)
                    if (canOpen) {
                      onOpenTask!(notif.entity_id!)
                      setOpen(false)
                    }
                  }
                  return (
                    <div
                      key={notif.id}
                      onClick={handleClick}
                      style={{
                        padding: '11px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: notif.read ? 'transparent' : 'var(--accent-bg)',
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        cursor: (canOpen || !notif.read) ? 'pointer' : 'default',
                      }}
                    >
                      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                        {TYPE_ICONS[notif.type ?? ''] ?? '🔔'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: notif.read ? 400 : 600, lineHeight: 1.3 }}>
                          {notif.title}
                        </div>
                        {notif.body && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                            {notif.body}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                            {timeAgo(notif.created_at)}
                          </span>
                          {canOpen && (
                            <span style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                              Abrir ↗
                            </span>
                          )}
                        </div>
                      </div>
                      {!notif.read && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 4 }} />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
