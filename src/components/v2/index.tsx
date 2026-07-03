// ─────────────────────────────────────────────────────────────────────────────
// HOG APP v2 component library — build once, reuse everywhere.
// Inert until screens adopt them (redesign phase 2+). Everything derives from
// theme-v2 tokens; no hardcoded hex in here.
//
// Primitives: BUChip · StatusBadge · PriorityEdge · KPITile · FilterChips ·
// SegmentedControl · EmptyState · Toast · Sheet (slide-over / bottom sheet)
// CommandPalette ships with the Shell module (needs app-level wiring).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { buColor, buColorBg, buColorBorder, buMonogram } from '../../lib/buIdentity'

// ── BUChip — the signature element ───────────────────────────────────────────
export function BUChip({ code, name, size = 'md' }: { code: string; name?: string; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 18 : 24
  const fs = size === 'sm' ? 8 : 10
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }} title={name ?? code}>
      <span style={{
        width: px, height: px, borderRadius: 'var(--radius-sm)', flexShrink: 0,
        background: buColorBg(code), border: `1px solid ${buColorBorder(code)}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: buColor(code), fontFamily: 'var(--font-mono)', fontSize: fs, fontWeight: 700,
      }}>
        {buMonogram(code)}
      </span>
      {name && <span style={{ fontSize: 'var(--text-size-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{name}</span>}
    </span>
  )
}

// ── StatusBadge — semantic color ALWAYS paired with a label ─────────────────
const STATUS_TONES = {
  healthy:   'var(--status-healthy)',
  attention: 'var(--status-attention)',
  risk:      'var(--status-risk)',
  neutral:   'var(--status-none)',
  accent:    'var(--accent)',
} as const
export type StatusTone = keyof typeof STATUS_TONES

export function StatusBadgeV2({ tone, label }: { tone: StatusTone; label: string }) {
  const c = STATUS_TONES[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-size-xs)', fontWeight: 600,
      color: c, background: `color-mix(in srgb, ${c} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${c} 32%, transparent)`,
      borderRadius: 'var(--radius-sm)', padding: '2px var(--space-2)', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
      {label}
    </span>
  )
}

// ── PriorityEdge — thin left bar instead of a badge; parent needs position:relative
export function PriorityEdge({ priority }: { priority: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const c = { HIGH: 'var(--priority-high)', MEDIUM: 'var(--priority-medium)', LOW: 'var(--priority-low)' }[priority]
  return (
    <span aria-label={`Prioridad ${priority === 'HIGH' ? 'alta' : priority === 'MEDIUM' ? 'media' : 'baja'}`} style={{
      position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
      background: c, borderRadius: '3px 0 0 3px',
    }} />
  )
}

// ── KPITile ──────────────────────────────────────────────────────────────────
export function KPITile({ label, value, icon, color = 'var(--text-primary)', hint }: {
  label: string; value: string; icon?: ReactNode; color?: string; hint?: string
}) {
  return (
    <div title={hint} style={{
      background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3) var(--space-4)', minWidth: 96,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
        {icon}
        <span style={{ fontSize: 'var(--text-size-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div className="num" style={{ color, fontSize: 'var(--text-size-lg)', fontWeight: 700, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

// ── FilterChips — horizontally scrollable pill row ───────────────────────────
export function FilterChips({ options, active, onChange }: {
  options: { id: string; label: string; color?: string }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', padding: '2px' }}>
      {options.map(o => {
        const isActive = o.id === active
        const c = o.color ?? 'var(--accent)'
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            minHeight: 36, padding: '0 var(--space-4)', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer',
            fontSize: 'var(--text-size-xs)', fontWeight: 600, fontFamily: 'var(--font-ui)',
            background: isActive ? `color-mix(in srgb, ${c} 14%, transparent)` : 'transparent',
            border: `1px solid ${isActive ? c : 'var(--border-default)'}`,
            color: isActive ? c : 'var(--text-secondary)',
            transition: 'var(--motion-fast)',
          }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── SegmentedControl — equal-width segments (mobile status switcher, tabs) ──
export function SegmentedControl({ options, value, onChange }: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div role="tablist" style={{
      display: 'flex', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
      padding: 'var(--space-1)', gap: 'var(--space-1)',
    }}>
      {options.map(o => {
        const isActive = o.id === value
        return (
          <button key={o.id} role="tab" aria-selected={isActive} onClick={() => onChange(o.id)} style={{
            flex: 1, minHeight: 36, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
            fontSize: 'var(--text-size-xs)', fontWeight: isActive ? 700 : 500, fontFamily: 'var(--font-ui)',
            background: isActive ? 'var(--bg-elevated)' : 'transparent',
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            transition: 'var(--motion-fast)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── EmptyState — icon + one sentence + one action ────────────────────────────
export function EmptyStateV2({ icon, title, actionLabel, onAction }: {
  icon: ReactNode; title: string; actionLabel?: string; onAction?: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-8) var(--space-4)', textAlign: 'center' }}>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 28 }}>{icon}</div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-size-sm)', margin: 0, maxWidth: 280, lineHeight: 'var(--leading-body)' }}>{title}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} style={{
          minHeight: 'var(--touch-target)', padding: '0 var(--space-5)', borderRadius: 999, border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 'var(--text-size-sm)', fontWeight: 700,
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// ── Toast — module-level emitter + <Toaster/> host ───────────────────────────
type ToastKind = 'success' | 'error' | 'info'
interface ToastMsg { id: number; kind: ToastKind; text: string }
let toastListener: ((t: ToastMsg) => void) | null = null
let toastSeq = 0

export function showToast(text: string, kind: ToastKind = 'info') {
  toastListener?.({ id: ++toastSeq, kind, text })
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  useEffect(() => {
    toastListener = (t) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500)
    }
    return () => { toastListener = null }
  }, [])
  const tone: Record<ToastKind, string> = { success: 'var(--status-healthy)', error: 'var(--status-risk)', info: 'var(--text-secondary)' }
  return (
    <div style={{ position: 'fixed', bottom: 'calc(var(--space-6) + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', zIndex: 120, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} role="status" style={{
          background: 'var(--bg-overlay)', color: 'var(--text-primary)',
          borderLeft: `3px solid ${tone[t.kind]}`, borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-size-sm)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxWidth: 360,
        }}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

// ── Sheet — right slide-over on desktop, full-height bottom sheet on mobile ──
export function Sheet({ open, onClose, isMobile, children, width = 480 }: {
  open: boolean; onClose: () => void; isMobile: boolean; children: ReactNode; width?: number
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const panel: CSSProperties = isMobile
    ? {
        position: 'fixed', left: 0, right: 0, bottom: 0, top: 'var(--space-6)', zIndex: 61,
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'sheet-up var(--motion-sheet)',
      }
    : {
        position: 'fixed', top: 0, right: 0, bottom: 0, width, maxWidth: '96vw', zIndex: 61,
        background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'sheet-in var(--motion-sheet)',
      }

  return (
    <>
      <style>{`
        @keyframes sheet-in { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes sheet-up { from { transform: translateY(32px); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60 }} />
      <div role="dialog" aria-modal="true" style={panel}>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2) 0', flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
          </div>
        )}
        {children}
      </div>
    </>
  )
}
