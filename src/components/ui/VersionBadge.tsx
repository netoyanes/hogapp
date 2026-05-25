import { useState } from 'react'
import { APP_VERSION } from '../../config/version'
import { ChangelogModal } from './ChangelogModal'

export function VersionBadge() {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="View changelog"
        style={{
          position: 'fixed',
          bottom: '12px',
          left: '12px',
          zIndex: 40,
          background: hovered ? 'var(--bg-elevated)' : 'transparent',
          border: `1px solid ${hovered ? 'var(--accent-border)' : 'transparent'}`,
          color: hovered ? 'var(--accent)' : 'var(--border-default)',
          fontFamily: 'var(--font-mono)',
          borderRadius: '6px',
          padding: hovered ? '4px 8px' : '4px',
          fontSize: '11px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          overflow: 'hidden',
          maxWidth: hovered ? '80px' : '14px',
          whiteSpace: 'nowrap',
          opacity: hovered ? 1 : 0.3,
        }}
      >
        {hovered ? `v${APP_VERSION}` : '·'}
      </button>

      {open && <ChangelogModal onClose={() => setOpen(false)} />}
    </>
  )
}
