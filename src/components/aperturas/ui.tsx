// ─────────────────────────────────────────────────────────────────────────────
// APERTURAS · COMPONENTES COMPARTIDOS
//
// Las piezas que repiten las cuatro pantallas. Los colores y estilos que usan
// están en tokens.ts, con el porqué de cada uno.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import { pct, C_ESTIMADO } from './tokens'

/** Campo capturado: etiqueta, caja y una línea de ayuda cuando hace falta. */
export function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      {children}
      {ayuda && <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{ayuda}</span>}
    </label>
  )
}

/** Valor derivado: monospace, sin caja. Se lee, no se toca. */
export function Calculado({ label, valor, color, hint }: {
  label: string; valor: string; color?: string; hint?: string
}) {
  return (
    <div title={hint} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="num" style={{
        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
        color: color ?? 'var(--text-secondary)',
      }}>{valor}</span>
    </div>
  )
}

export function Casilla({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: ReactNode
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-secondary)' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
      {label}
    </label>
  )
}

/** Indicador de autoguardado. Discreto por diseño: informa, no interrumpe. */
export function Guardado({ estado }: { estado: 'listo' | 'guardando' | 'guardado' | 'error' }) {
  if (estado === 'listo') return null
  const texto = estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado' : 'No se guardó'
  return (
    <span style={{
      fontSize: 10.5, fontFamily: 'var(--font-mono)',
      color: estado === 'error' ? 'var(--status-risk)' : 'var(--text-tertiary)',
      opacity: estado === 'guardado' ? 0.7 : 1, whiteSpace: 'nowrap',
    }}>{texto}</span>
  )
}

/** Barra de avance con su meta planeada marcada encima. */
export function Barra({ valor, planeado, color, alto = 6 }: {
  valor: number; planeado?: number; color?: string; alto?: number
}) {
  const atrasado = planeado != null && valor < planeado - 0.02
  return (
    <div style={{ position: 'relative', height: alto, background: 'var(--bg-elevated)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(100, Math.max(0, valor * 100))}%`, height: '100%',
        background: color ?? (atrasado ? C_ESTIMADO : 'var(--status-healthy)'), borderRadius: 999,
      }} />
      {planeado != null && (
        <div title={`Planeado a hoy: ${pct(planeado)}`} style={{
          position: 'absolute', top: -1, bottom: -1, left: `${Math.min(100, planeado * 100)}%`,
          width: 2, background: 'var(--text-primary)', opacity: 0.55,
        }} />
      )}
    </div>
  )
}
