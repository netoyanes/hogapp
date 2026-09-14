// ─────────────────────────────────────────────────────────────────────────────
// APERTURAS · TOKENS VISUALES
//
// Dos reglas mandan sobre todo lo demás:
//
//  1. Lo CALCULADO se ve distinto de lo CAPTURADO. Lo capturado vive en cajas
//     con borde; lo calculado va en monospace, sin caja y en color secundario.
//     El usuario nunca debe dudar qué puede editar.
//  2. Lo ESTIMADO o en cero va en ámbar, en todas las pantallas. Es el riesgo
//     abierto del proyecto y tiene que ser imposible de ignorar.
//
// Colores, formatos y estilos viven aquí; los componentes que los usan, en
// ui.tsx. Separados porque un archivo que exporta ambas cosas rompe el recargado
// en caliente de Vite.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'

export const C_CRITICA = 'var(--status-risk)'
export const C_COMPRA = '#3D89C4'
export const C_TRABAJO = 'var(--status-healthy)'
export const C_ESTIMADO = 'var(--status-attention)'

export const colorDeTipo = (tipo: string) => tipo === 'compra' ? C_COMPRA : C_TRABAJO

export const mxn = (n: number) =>
  `$${Math.round(n).toLocaleString('es-MX')}`

export const pct = (n: number) => `${Math.round(n * 100)}%`

/** Ámbar cuando el monto es estimado o cero: los dos casos son riesgo. */
export const colorDeMonto = (monto: number, estimado: boolean) =>
  estimado || monto <= 0 ? C_ESTIMADO : 'var(--text-primary)'

export const dia = (f: string) =>
  new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

export const diaCorto = (f: string) =>
  new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric' })

export const card: CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)', padding: 14,
}

export const secTitle: CSSProperties = {
  fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase',
  fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', margin: '0 0 10px',
}

export const inp: CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8,
  color: 'var(--text-primary)', padding: '0 10px', fontSize: 13, outline: 'none',
  minHeight: 38, boxSizing: 'border-box', width: '100%',
}

export const btn: CSSProperties = {
  minHeight: 38, padding: '0 14px', borderRadius: 999, border: 'none',
  background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}

export const btnGhost: CSSProperties = {
  ...btn, background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border-default)',
}

