import { useState } from 'react'
import { APP_VERSION } from '../../config/version'
import { ChangelogModal } from './ChangelogModal'

export function VersionBadge() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: '16px',
          left: '16px',
          zIndex: 40,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          borderRadius: '6px',
          padding: '4px 8px',
          fontSize: '11px',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--accent)'
          e.currentTarget.style.borderColor = 'var(--accent-border)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-tertiary)'
          e.currentTarget.style.borderColor = 'var(--border-default)'
        }}
        title="View changelog"
      >
        v{APP_VERSION}
      </button>

      {open && <ChangelogModal onClose={() => setOpen(false)} />}
    </>
  )
}
