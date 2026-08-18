// ─────────────────────────────────────────────────────────────────────────────
// HOG APP v2 component library — build once, reuse everywhere.
// Inert until screens adopt them (redesign phase 2+). Everything derives from
// theme-v2 tokens; no hardcoded hex in here.
//
// Primitives: BUChip · StatusBadge · PriorityEdge · KPITile · FilterChips ·
// SegmentedControl · EmptyState · Toast · Sheet (slide-over / bottom sheet)
// CommandPalette ships with the Shell module (needs app-level wiring).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { FeedbackButton } from '../ui/FeedbackButton'
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

// ── SegmentedControl — status switcher / tabs ────────────────────────────────
// Default: equal-width segments. `scrollable`: natural-width segments in a
// horizontally scrollable bar (for 5-6 phase switchers on mobile — labels
// never get crushed). Optional `color` per option tints its dot and the
// active state so phase progression reads at a glance.
export function SegmentedControl({ options, value, onChange, scrollable }: {
  options: { id: string; label: string; color?: string }[]
  value: string
  onChange: (id: string) => void
  scrollable?: boolean
}) {
  return (
    <div role="tablist" style={{
      display: 'flex', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
      padding: 'var(--space-1)', gap: 'var(--space-1)',
      overflowX: scrollable ? 'auto' : undefined,
      WebkitOverflowScrolling: 'touch',
    }}>
      {options.map(o => {
        const isActive = o.id === value
        const c = o.color
        return (
          <button key={o.id} role="tab" aria-selected={isActive} onClick={() => onChange(o.id)} style={{
            flex: scrollable ? '0 0 auto' : 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            minHeight: 36, padding: scrollable ? '0 14px' : '0 4px',
            borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
            fontSize: 'var(--text-size-xs)', fontWeight: isActive ? 700 : 500, fontFamily: 'var(--font-ui)',
            background: isActive
              ? (c ? `color-mix(in srgb, ${c} 18%, var(--bg-elevated))` : 'var(--bg-elevated)')
              : 'transparent',
            color: isActive ? (c ?? 'var(--text-primary)') : 'var(--text-secondary)',
            transition: 'var(--motion-fast)', whiteSpace: 'nowrap',
            overflow: scrollable ? undefined : 'hidden', textOverflow: scrollable ? undefined : 'ellipsis',
          }}>
            {c && <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0, opacity: isActive ? 1 : 0.6 }} />}
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

// ── Pila global de ventanas (Sheet / paneles) ────────────────────────────────
// Cada ventana abierta se registra aquí; con su posición en la pila sabe si es
// la de hasta arriba (recibe Escape) y cuántas subventanas tiene encima (se
// atenúa y encoge detrás — se VE que la subventana viene de la anterior).
let layerSeq = 0
const layerStack: number[] = []
const layerSubs = new Set<() => void>()
const notifyLayers = () => layerSubs.forEach(f => f())

export function useSheetLayer(open: boolean) {
  const idRef = useRef(0)
  const [, force] = useState(0)
  useEffect(() => {
    if (!open) return
    const id = ++layerSeq
    idRef.current = id
    layerStack.push(id)
    notifyLayers()
    return () => {
      const i = layerStack.indexOf(id)
      if (i !== -1) layerStack.splice(i, 1)
      idRef.current = 0
      notifyLayers()
    }
  }, [open])
  useEffect(() => {
    const f = () => force(n => n + 1)
    layerSubs.add(f)
    return () => { layerSubs.delete(f) }
  }, [])
  const idx = layerStack.indexOf(idRef.current)
  const depth = idx === -1 ? 0 : idx                       // 0 = ventana base
  const behind = idx === -1 ? 0 : layerStack.length - 1 - idx // capas encima
  const isTop = idx !== -1 && behind === 0
  return { depth, behind, isTop, zBase: 60 + depth * 4 }
}

// Overlays que van SOBRE cualquier ventana apilada: visores a pantalla
// completa, lightboxes. La pila de Sheets vive en 60 + depth*4 (y el panel en
// +1), así que cualquier z-index fijo por debajo de eso queda ENTERRADO — es
// exactamente el bug que tuvo el visor de evidencias con su z-60.
export const Z_FULLSCREEN = 200

// Estilo de "ventana detrás": atenuada, encogida y desplazada hacia arriba —
// asoma tras la subventana activa, mostrando que están conectadas.
const layerBehindFx = (behind: number, isMobile: boolean): CSSProperties => behind > 0
  ? {
      transform: isMobile
        ? `translateY(${-6 - behind * 4}px) scale(${1 - 0.03 * behind})`
        : `translate(-50%, calc(-50% - ${12 + behind * 8}px)) scale(${1 - 0.035 * behind})`,
      filter: 'brightness(0.55) saturate(0.85)',
      pointerEvents: 'none',
    }
  : {}

// ── Sheet — en escritorio: modal CENTRADO; en teléfono: bottom sheet. Las
// subventanas se apilan al centro con la anterior visible detrás ─────────────
export function Sheet({ open, onClose, isMobile, children, width = 480, minWidth, tall = false }: {
  open: boolean; onClose: () => void; isMobile: boolean; children: ReactNode
  /** Ancho MÁXIMO en escritorio. La ventana crece con la pantalla hasta aquí. */
  width?: number
  /** Piso del ancho fluido; por defecto el 92% del máximo (nunca menos de 420) */
  minWidth?: number
  /** Ventanas de trabajo (proyecto, tarea): marco alto y estable, estilo Airtable */
  tall?: boolean
}) {
  const { behind, isTop, zBase } = useSheetLayer(open)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isTop) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, isTop])

  if (!open) return null

  const panel: CSSProperties = isMobile
    ? {
        position: 'fixed', left: 0, right: 0, bottom: 0, top: 'var(--space-6)', zIndex: zBase + 1,
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'sheet-up var(--motion-sheet)', transformOrigin: 'top center',
        transition: 'transform .28s cubic-bezier(.2,.8,.2,1), filter .28s',
        ...layerBehindFx(behind, true),
      }
    : {
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        // Ancho FLUIDO con techo: la ventana usa el espacio de la pantalla en
        // vez de quedarse en un ancho fijo, pero nunca pasa de su máximo — una
        // línea de texto de 1400px es ilegible, y una ventana pegada a los
        // bordes deja de leerse como ventana.
        width: `clamp(${Math.min(minWidth ?? Math.max(420, Math.round(width * 0.92)), width)}px, 92vw, ${width}px)`,
        // Alto: las ventanas de trabajo reservan su marco desde el inicio para
        // que el contenido no las haga crecer y encoger mientras se navega;
        // las demás solo tienen techo. En ambos casos, más alto que antes.
        maxHeight: 'min(92vh, 1040px)',
        ...(tall ? { height: 'min(92vh, 1040px)' } : null),
        zIndex: zBase + 1,
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sheet)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'sheet-pop var(--motion-sheet)',
        transition: 'transform .28s cubic-bezier(.2,.8,.2,1), filter .28s',
        ...layerBehindFx(behind, false),
      }

  // PORTAL a <body>: un Sheet anidado dentro del panel de otro Sheet heredaría
  // su pointerEvents:none y su filter (que además rompe position:fixed) cuando
  // el padre pasa a segundo plano — con el portal cada ventana vive en body y
  // la pila funciona sin importar dónde se renderice en el árbol de React.
  return createPortal(
    <>
      <style>{`
        @keyframes sheet-pop { from { transform: translate(-50%, calc(-50% + 18px)) scale(0.97); opacity: 0 } to { transform: translate(-50%, -50%); opacity: 1 } }
        @keyframes sheet-up { from { transform: translateY(32px); opacity: 0 } to { transform: none; opacity: 1 } }
        /* El panel limita su alto con maxHeight; sus hijos flex necesitan
           min-height:0 para poder encogerse — sin esto, un hijo con contenido
           largo empuja el panel y las zonas con overflow:auto nunca scrollean. */
        .hog-sheet-panel > * { min-height: 0 }
      `}</style>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: zBase > 60 ? 'var(--scrim-stacked)' : 'var(--scrim)', zIndex: zBase }} />
      <div role="dialog" aria-modal="true" className="hog-sheet-panel" style={panel}>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2) 0', flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
          </div>
        )}
        {children}
        {/* La bandera de reporte vive en el PRIMITIVO: toda ventana presente
            y futura la hereda sin que nadie tenga que acordarse de ponerla */}
        <FeedbackButton />
      </div>
    </>,
    document.body
  )
}
