import { Fragment } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Fases de una tarea — lenguaje visual compartido por toda la app: el mismo
// color significa lo mismo en Mi Resumen, en Proyectos y donde se use después.
// REVISION vive en el paso de evidencia (de ahí regresó), pintado en rojo.
// ─────────────────────────────────────────────────────────────────────────────
export const TASK_PHASE: Record<string, { step: number; color: string; label: string }> = {
  OPEN:            { step: 0, color: '#8A8A8A', label: 'Abierta' },
  IN_PROGRESS:     { step: 1, color: '#3B82F6', label: 'En progreso' },
  PROOF_SUBMITTED: { step: 2, color: '#EAB308', label: 'Evidencia enviada' },
  REVISION:        { step: 2, color: '#EF4444', label: 'En revisión' },
  APPROVED:        { step: 3, color: '#22C55E', label: 'Aprobada' },
}
export const PHASE_LEGEND = ['OPEN', 'IN_PROGRESS', 'PROOF_SUBMITTED', 'REVISION', 'APPROVED'] as const

export const phaseOf = (status: string) => TASK_PHASE[status] ?? TASK_PHASE.OPEN

// Funnel minimalista ·—·—·—· que se llena hasta la fase actual
export function FunnelBar({ status }: { status: string }) {
  const p = phaseOf(status)
  return (
    <span title={p.label} aria-label={p.label}
      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      {[0, 1, 2, 3].map(i => {
        const on = i <= p.step
        const isNow = i === p.step
        return (
          <Fragment key={i}>
            {i > 0 && <span style={{ width: 9, height: 1.5, background: on ? p.color : 'var(--border-default)', opacity: on ? 0.7 : 1 }} />}
            <span style={{
              width: isNow ? 6 : 4, height: isNow ? 6 : 4, borderRadius: '50%',
              background: on ? p.color : 'var(--border-default)',
              boxShadow: isNow ? `0 0 0 2.5px color-mix(in srgb, ${p.color} 22%, transparent)` : undefined,
            }} />
          </Fragment>
        )
      })}
    </span>
  )
}

// Leyenda de una línea — se usa al pie de las listas que muestran fases
export function PhaseLegend({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', ...style }}>
      {PHASE_LEGEND.map(s => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: TASK_PHASE[s].color, flexShrink: 0 }} />
          {TASK_PHASE[s].label}
        </span>
      ))}
    </div>
  )
}
