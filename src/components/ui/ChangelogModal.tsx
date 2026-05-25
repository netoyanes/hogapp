import { useEffect } from 'react'
import { X } from 'lucide-react'
import { CHANGELOG, APP_VERSION } from '../../config/version'

interface Props {
  onClose: () => void
}

const TYPE_COLORS = {
  MAJOR: '#EF4444',
  MINOR: '#22C55E',
  PATCH: '#EAB308',
}

export function ChangelogModal({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sorted = [...CHANGELOG].reverse()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '80vh' }}
        className="flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h2 style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }} className="text-base font-semibold">
              HOG OPS — Changelog
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} className="text-xs mt-0.5">
              Current: v{APP_VERSION}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
            className="p-1.5 rounded-md hover:opacity-70 transition-opacity"
          >
            <X size={14} />
          </button>
        </div>

        {/* Entries */}
        <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-5">
          {sorted.map((entry) => (
            <div key={entry.version}>
              <div className="flex items-center gap-3 mb-2">
                <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }} className="text-sm font-semibold">
                  v{entry.version}
                </span>
                <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }} className="text-xs">
                  {entry.date}
                </span>
                <span
                  style={{ color: TYPE_COLORS[entry.type], background: `${TYPE_COLORS[entry.type]}18`, border: `1px solid ${TYPE_COLORS[entry.type]}30`, fontFamily: 'var(--font-mono)' }}
                  className="text-xs px-1.5 py-0.5 rounded"
                >
                  {entry.type}
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {entry.changes.map((change, i) => (
                  <li key={i} style={{ color: 'var(--text-secondary)' }} className="text-sm flex gap-2">
                    <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
