// Códigos visuales del Project Manager, compartidos por TODA la app:
//
//   ProjectChip  — "Oyster Fest › Taller de ostiones": a qué proyecto (y a qué
//                  actividad) pertenece una tarea. Carpeta ámbar = proyecto,
//                  calendario azul = actividad. Va en la tarea, el board, Mi
//                  Semana y el calendario, siempre igual.
//   HealthBadge  — el andon: semáforo + causa. Nunca color sin causa.
//   StatusRing   — el círculo de estado de una tarea (anillo vacío, medio
//                  ámbar, amarillo, verde, rojo bloqueada).
//   DCounter     — "D-9" en mono, rojo si va atorado y falta poco.
import { FolderKanban, CalendarDays, ChevronRight, Ban } from 'lucide-react'
import { kindColor, ACTIVITY_COLOR } from '../../lib/projectKinds'
import { NIVEL_META, dTexto, type Salud, type Nivel } from '../../lib/projectHealth'

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }

export function ProjectChip({ name, kind, activity, onClick, size = 'md', maxWidth }: {
  name: string
  kind?: string | null
  activity?: string | null
  onClick?: () => void
  size?: 'sm' | 'md'
  maxWidth?: number
}) {
  const color = kindColor(kind)
  const fs = size === 'sm' ? 9.5 : 10.5
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag onClick={onClick} title={activity ? `Proyecto: ${name} · Actividad: ${activity}` : `Proyecto: ${name}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: maxWidth ?? 260, minWidth: 0,
        padding: size === 'sm' ? '1px 6px' : '2px 8px', borderRadius: 4,
        background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        color, fontSize: fs, fontWeight: 700, ...mono, cursor: onClick ? 'pointer' : 'default', textAlign: 'left', lineHeight: 1.5,
      }}>
      <FolderKanban size={size === 'sm' ? 10 : 11} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {activity && (
        <>
          <ChevronRight size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
          <CalendarDays size={size === 'sm' ? 10 : 11} style={{ flexShrink: 0, color: ACTIVITY_COLOR }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: ACTIVITY_COLOR }}>{activity}</span>
        </>
      )}
    </Tag>
  )
}

/** Chip de actividad sola (dentro de la ventana del proyecto ya se sabe el proyecto) */
export function ActivityChip({ label, tone = 'act', size = 'md' }: { label: string; tone?: 'act' | 'risk'; size?: 'sm' | 'md' }) {
  const color = tone === 'risk' ? 'var(--status-risk)' : ACTIVITY_COLOR
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: size === 'sm' ? '1px 6px' : '2px 7px', borderRadius: 4, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, color, fontSize: size === 'sm' ? 9.5 : 10, fontWeight: 700, whiteSpace: 'nowrap', ...mono }}>
      <CalendarDays size={10} /> {label}
    </span>
  )
}

export function Semaforo({ nivel, size = 10, pulse = false }: { nivel: Nivel; size?: number; pulse?: boolean }) {
  const m = NIVEL_META[nivel]
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: m.color, flexShrink: 0, display: 'inline-block', boxShadow: pulse && nivel === 'atorado' ? `0 0 0 3px ${m.bg}` : 'none' }} />
  )
}

/**
 * El andon. `compact` = solo punto + palabra (para filas de tabla);
 * default = franja con las dos peores causas (tarjeta); `full` = todas.
 */
export function HealthBadge({ salud, mode = 'strip', onCausa, style }: {
  salud: Salud
  mode?: 'dot' | 'compact' | 'strip' | 'full'
  onCausa?: (c: Salud['causas'][number]) => void
  style?: React.CSSProperties
}) {
  const m = NIVEL_META[salud.nivel]
  if (mode === 'dot') return <Semaforo nivel={salud.nivel} pulse />
  if (mode === 'compact') {
    return (
      <span title={salud.causas.map(c => c.texto).join('\n') || m.label}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: m.color, ...mono, ...style }}>
        <Semaforo nivel={salud.nivel} size={8} />{m.label}
      </span>
    )
  }
  const causas = mode === 'full' ? salud.causas : salud.causas.slice(0, 2)
  const resto = salud.causas.length - causas.length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 7, alignItems: 'start', padding: '5px 8px', borderRadius: 5, background: m.bg, color: m.color, fontSize: 11, lineHeight: 1.35, ...style }}>
      <span style={{ marginTop: 3 }}><Semaforo nivel={salud.nivel} pulse /></span>
      <div style={{ minWidth: 0 }}>
        <b style={{ fontWeight: 800 }}>{m.label}</b>
        {causas.length === 0 && salud.nivel === 'fluye' && (
          <span> · {salud.estaSemana ? `${salud.estaSemana} ${salud.estaSemana === 1 ? 'tarea vence' : 'tareas vencen'} esta semana` : `${salud.abiertas} ${salud.abiertas === 1 ? 'abierta' : 'abiertas'}`}</span>
        )}
        {causas.length === 0 && salud.nivel === 'sin_senal' && <span> · {salud.total === 0 ? 'sin tareas todavía' : 'sin fecha de proyecto'}</span>}
        {causas.map((c, i) => (
          <span key={i} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {onCausa && (c.taskId || c.activityId)
              ? <button onClick={e => { e.stopPropagation(); onCausa(c) }} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>{c.texto}</button>
              : c.texto}
          </span>
        ))}
        {resto > 0 && <span style={{ opacity: 0.8 }}>+{resto} más</span>}
      </div>
    </div>
  )
}

/** "D-9 al evento" — grande en mono; rojo si está atorado y falta poco */
export function DCounter({ salud, size = 'md' }: { salud: Salud; size?: 'sm' | 'md' | 'lg' }) {
  const t = dTexto(salud.dDias)
  if (!t) return null
  const urgente = salud.nivel === 'atorado' && salud.dDias != null && salud.dDias >= 0 && salud.dDias <= 14
  const fs = size === 'lg' ? 26 : size === 'md' ? 12 : 10.5
  return (
    <span className="num" title={`${t} ${salud.dLabel}`} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, ...mono, color: urgente ? 'var(--status-risk)' : salud.dDias != null && salud.dDias < 0 ? 'var(--text-tertiary)' : 'var(--text-primary)', fontWeight: 800, fontSize: fs, letterSpacing: size === 'lg' ? '-0.02em' : 0, lineHeight: 1 }}>
      {t}<span style={{ fontSize: size === 'lg' ? 10 : 9, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{salud.dLabel}</span>
    </span>
  )
}

/** Círculo de estado de una tarea — el mismo en la ventana, el timeline y Mi Semana */
export function StatusRing({ status, blocked = false, size = 11 }: { status: string; blocked?: boolean; size?: number }) {
  const base: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-block', boxSizing: 'border-box' }
  if (status === 'APPROVED') return <span title="Aprobada" style={{ ...base, background: 'var(--status-healthy)' }} />
  if (blocked) return <span title="Bloqueada" style={{ ...base, background: 'var(--status-risk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Ban size={size - 3} style={{ color: 'var(--bg-base)' }} /></span>
  if (status === 'PROOF_SUBMITTED' || status === 'REVISION') return <span title="En revisión" style={{ ...base, background: 'var(--status-attention)' }} />
  if (status === 'IN_PROGRESS') return <span title="En progreso" style={{ ...base, border: '2px solid var(--accent)', background: 'linear-gradient(90deg, var(--accent) 50%, transparent 50%)' }} />
  return <span title="Abierta" style={{ ...base, border: '2px solid var(--border-strong)' }} />
}

/** Chip de edad: "4 d en revisión" — solo cuando importa */
export function AgingChip({ dias, estado, hot = false }: { dias: number; estado: string; hot?: boolean }) {
  const color = hot ? 'var(--status-risk)' : 'var(--status-attention)'
  return (
    <span className="num" style={{ ...mono, fontSize: 9.5, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 13%, transparent)`, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
      {dias} d {estado}
    </span>
  )
}

export function BlockedChip({ reason }: { reason: string }) {
  return (
    <span title={reason} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...mono, fontSize: 9.5, fontWeight: 700, color: 'var(--status-risk)', background: 'color-mix(in srgb, var(--status-risk) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--status-risk) 45%, transparent)', padding: '1px 6px', borderRadius: 4, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      <Ban size={10} style={{ flexShrink: 0 }} /> Bloqueada · {reason}
    </span>
  )
}

export function DeadlineChip({ type }: { type: string | null | undefined }) {
  if (!type) return null
  const hard = type === 'HARD'
  return (
    <span title={hard ? 'Deadline duro: si se pasa, atora el proyecto' : 'Deadline flexible'} style={{ ...mono, fontSize: 9, fontWeight: 700, color: hard ? 'var(--status-risk)' : 'var(--text-tertiary)', border: `1px solid ${hard ? 'color-mix(in srgb, var(--status-risk) 45%, transparent)' : 'var(--border-default)'}`, padding: '0 5px', borderRadius: 4, lineHeight: '15px' }}>
      {hard ? 'HARD' : 'SOFT'}
    </span>
  )
}
