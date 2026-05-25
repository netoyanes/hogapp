import { useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'

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
}

export function NotificationBell({ userId }: Props) {
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications(userId)
  const [open, setOpen] = useState(false)
  const [permissionAsked, setPermissionAsked] = useState(false)

  function handleOpen() {
    setOpen((v) => !v)
    // Request browser push permission the first time they open the bell
    if (!permissionAsked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
      setPermissionAsked(true)
    }
  }

  return (
    <>
      {/* Bell button */}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={handleOpen}
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: open ? 'var(--accent-bg)' : 'var(--bg-surface)',
            border: `1px solid ${open ? 'var(--accent-border)' : 'var(--border-default)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', position: 'relative', flexShrink: 0,
          }}
          title="Notifications"
        >
          <Bell size={15} style={{ color: open ? 'var(--accent)' : 'var(--text-secondary)' }} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              minWidth: '17px', height: '17px', borderRadius: '9px',
              background: '#EF4444', color: '#fff',
              fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 44 }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'fixed', top: '56px', right: '12px', zIndex: 45,
          width: '320px', maxHeight: '480px',
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
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
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
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
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => !notif.read && markRead(notif.id)}
                  style={{
                    padding: '11px 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: notif.read ? 'transparent' : 'rgba(34,197,94,0.04)',
                    display: 'flex', gap: '10px', alignItems: 'flex-start',
                    cursor: notif.read ? 'default' : 'pointer',
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
                    <div style={{ color: 'var(--text-tertiary)', fontSize: '10px', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                      {timeAgo(notif.created_at)}
                    </div>
                  </div>
                  {!notif.read && (
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: '4px' }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}
