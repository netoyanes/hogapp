import { useEffect, useState } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import { CHANGELOG, APP_VERSION } from '../../config/version'
import { useIsMobile } from '../../hooks/useIsMobile'

interface Props {
  onClose: () => void
}

const TYPE_COLORS = {
  MAJOR: '#EF4444',
  MINOR: '#22C55E',
  PATCH: '#EAB308',
}

export function ChangelogModal({ onClose }: Props) {
  const isMobile = useIsMobile()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sorted = [...CHANGELOG].reverse()
  // Current version expanded by default; click a version to see its full log
  const [expanded, setExpanded] = useState<Set<string>>(new Set([sorted[0]?.version]))
  function toggle(v: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v); else next.add(v)
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', padding: isMobile ? 0 : undefined }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={isMobile
          ? { background: 'var(--bg-surface)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
          : { background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h2 style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }} className="text-base font-semibold">
              HOG APP — Changelog
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

        {/* Entries — click a version to expand its full log */}
        <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-2">
          {sorted.map((entry) => {
            const isOpen = expanded.has(entry.version)
            return (
              <div key={entry.version} style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  onClick={() => toggle(entry.version)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: isOpen ? 'var(--bg-elevated)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  {isOpen ? <ChevronDown size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                  <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }} className="text-sm font-semibold">
                    v{entry.version}
                  </span>
                  <span
                    style={{ color: TYPE_COLORS[entry.type], background: `${TYPE_COLORS[entry.type]}18`, border: `1px solid ${TYPE_COLORS[entry.type]}30`, fontFamily: 'var(--font-mono)' }}
                    className="text-xs px-1.5 py-0.5 rounded"
                  >
                    {entry.type}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }} className="text-xs">
                    {entry.date}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }} className="text-xs">
                    {entry.changes.length}
                  </span>
                </button>
                {isOpen && (
                  <ul className="flex flex-col gap-1 px-4 pb-3 pt-1">
                    {entry.changes.map((change, i) => (
                      <li key={i} style={{ color: 'var(--text-secondary)' }} className="text-sm flex gap-2">
                        <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                        {change}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

