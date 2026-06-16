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
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface Props {
  userId: string
  onOpenTask?: (taskId: string) => void
}

// Notification types whose entity_id points at a task
const TASK_TYPES = new Set(['task_created', 'status_changed', 'proof_uploaded', 'comment_posted'])

export function NotificationBell({ userId, onOpenTask }: Props) {
  const isMobile = useIsMobile()
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications(userId)
  const [open, setOpen] = useState(false)
  const [permissionAsked, setPermissionAsked] = useState(false)

  // Layout constants
  const btnBottom = isMobile ? 72 : 24   // above bottom nav on mobile
  const btnRight  = isMobile ? 16 : 24
  const panelBottom = btnBottom + 52      // panel sits above the button
  const panelRight  = btnRight
  const panelWidth  = isMobile ? `calc(100vw - ${btnRight * 2}px)` : '320px'
  const panelMaxH   = isMobile ? 'calc(100dvh - 160px)' : '480px'

  function handleOpen() {
    setOpen((v) => !v)
    if (!permissionAsked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
      setPermissionAsked(true)
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 44 }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Floating bell button */}
      <button
        onClick={handleOpen}
        title="Notifications"
        style={{
          position: 'fixed',
          bottom: `${btnBottom}px`,
          right: `${btnRight}px`,
          zIndex: 45,
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: open
            ? 'var(--accent)'
            : unreadCount > 0
              ? 'var(--accent)'
              : 'var(--bg-surface)',
          border: `1px solid ${open || unreadCount > 0 ? 'var(--accent)' : 'var(--border-default)'}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'transform 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        <Bell size={18} style={{ color: open || unreadCount > 0 ? '#000' : 'var(--text-secondary)' }} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-3px',
            right: '-3px',
            minWidth: '18px',
            height: '18px',
            borderRadius: '9px',
            background: '#EF4444',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            border: '2px solid var(--bg-base)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel — opens upward from the button */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: `${panelBottom}px`,
          right: `${panelRight}px`,
          zIndex: 45,
          width: panelWidth,
          maxHeight: panelMaxH,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>Notifications</span>
              {unreadCount > 0 && (
                <span style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: '4px' }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <CheckCheck size={13} /> All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Push permission banner */}
          {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
            <div style={{ padding: '10px 16px', background: 'var(--accent-bg)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexShrink: 0 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Enable push to get notified when the app is closed</span>
              <button
                onClick={() => Notification.requestPermission()}
                style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Enable
              </button>
            </div>
          )}

          {/* Notification list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <Bell size={22} style={{ color: 'var(--text-tertiary)', margin: '0 auto 8px' }} />
                <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>No notifications yet</p>
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
                    background: notif.read ? 'transparent' : 'rgba(34,197,94,0.04)',
                    display: 'flex', gap: '10px', alignItems: 'flex-start',
                    cursor: (canOpen || !notif.read) ? 'pointer' : 'default',
                  }}
                >
                  <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>
                    {TYPE_ICONS[notif.type ?? ''] ?? '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: notif.read ? 400 : 600, lineHeight: '1.3' }}>
                      {notif.title}
                    </div>
                    {notif.body && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px', lineHeight: '1.4' }}>
                        {notif.body}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                        {timeAgo(notif.created_at)}
                      </span>
                      {canOpen && (
                        <span style={{ color: 'var(--accent)', fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                          Open ↗
                        </span>
                      )}
                    </div>
                  </div>
                  {!notif.read && (
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: '4px' }} />
                  )}
                </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </>
  )
}
