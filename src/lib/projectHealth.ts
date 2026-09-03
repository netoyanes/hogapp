// ─────────────────────────────────────────────────────────────────────────────
// SALUD DEL PROYECTO — el andon.
//
// Cuatro niveles derivados de lo que el equipo ya captura porque lo necesita
// para trabajar (fecha límite, tipo de deadline, responsable, estado, fecha
// de la actividad) más un solo dato nuevo: el bloqueo explícito con causa.
// Nadie "pone" el semáforo. Un estado que alguien tiene que actualizar se
// vuelve mentira en dos semanas.
//
// Cada causa nombra la tarea (y a la persona, si el que llama pasa nameOf):
// "Atorado" solo no sirve; "Atorado · permiso venció hace 2 d · Rodrigo" sí,
// porque ya sabes qué hacer y con quién.
//
// Es la ÚNICA fuente de estas reglas: tarjeta, ventana, timeline y Mi Semana
// llaman a calcularSalud y pintan lo que devuelve.
// ─────────────────────────────────────────────────────────────────────────────

export type Nivel = 'atorado' | 'riesgo' | 'fluye' | 'sin_senal'

export interface Causa {
  nivel: 'atorado' | 'riesgo'
  texto: string
  taskId?: string
  activityId?: string
}

export interface HealthTask {
  id: string
  title: string
  status: string
  due_date?: string | null
  deadline_type?: string | null
  assigned_to?: string | null
  activity_id?: string | null
  blocked_reason?: string | null
  status_changed_at?: string | null
  updated_at?: string | null
}
export interface HealthActivity {
  id: string
  title: string
  date: string
  status?: string | null
}
export interface HealthPlan {
  date: string | null
  end_date?: string | null
  status?: string | null
  budget?: number | null
  actual_cost?: number | null
}

export interface Salud {
  nivel: Nivel
  causas: Causa[]
  /** Días al arranque (positivo = faltan), o al cierre si ya arrancó. null sin fecha. */
  dDias: number | null
  /** Etiqueta corta del contador: "al evento" · "a entrega" · "terminó" */
  dLabel: string
  abiertas: number
  hechas: number
  total: number
  vencidas: number
  sinDueno: number
  /** Tareas que vencen en los próximos 7 días (incluye hoy) */
  estaSemana: number
  /** Tareas cerradas por semana en las últimas 4 (ritmo) */
  ritmo: number | null
}

// Umbrales en un solo lugar. Si mañana cambian, cambian aquí.
export const UMBRALES = {
  zonaCaliente: 7,        // días antes de una actividad en que sus tareas abiertas la ponen en rojo
  revisionDias: 3,        // días en revisión que ya son bloqueo
  quietaDias: 5,          // días en el mismo estado que ya son riesgo
  proyectoQuietoDias: 7,  // días sin ningún movimiento en el proyecto
  inicioCercano: 14,      // …cuando el arranque está a menos de esto
  porVencer: 2,           // días para "vence pronto"
}

const DAY = 86400000
const toD = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00').getTime()
export const hoyISO = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}
const diasEntre = (a: string, b: string) => Math.round((toD(b) - toD(a)) / DAY)
// Días CALENDARIO desde un timestamp: algo que cambió el sábado "lleva 4 d"
// el miércoles aunque no hayan pasado 96 horas completas.
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diasDesde = (ts: string, hoy: string) => diasEntre(isoLocal(new Date(ts)), hoy)

export const esHecha = (status: string) => status === 'APPROVED'
export const esBloqueada = (t: Pick<HealthTask, 'blocked_reason' | 'status'>) => !!t.blocked_reason && !esHecha(t.status)

/** Días que la tarea lleva en su estado actual (null si no hay dato). */
export function edadEnEstado(t: Pick<HealthTask, 'status_changed_at' | 'updated_at'>, hoy = hoyISO()): number | null {
  const ts = t.status_changed_at ?? t.updated_at
  return ts ? Math.max(0, diasDesde(ts, hoy)) : null
}

const corto = (s: string, n = 34) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
const quien = (id: string | null | undefined, nameOf?: (id: string) => string | null) => {
  if (!id || !nameOf) return ''
  const n = nameOf(id)
  return n ? ` · ${n.split(' ')[0]}` : ''
}
const dLabelDe = (n: number) => n === 0 ? 'hoy' : n === 1 ? 'hace 1 d' : `hace ${n} d`

export function calcularSalud(
  plan: HealthPlan,
  tasks: HealthTask[],
  activities: HealthActivity[] = [],
  nameOf?: (id: string) => string | null,
  hoy = hoyISO(),
): Salud {
  const vivas = tasks
  const abiertas = vivas.filter(t => !esHecha(t.status))
  const hechas = vivas.length - abiertas.length
  const atorado: Causa[] = []
  const riesgo: Causa[] = []

  // ── Contador D-n ──
  let dDias: number | null = null
  let dLabel = ''
  if (plan.date) {
    const fin = plan.end_date ?? plan.date
    if (plan.date > hoy) { dDias = diasEntre(hoy, plan.date); dLabel = 'al arranque' }
    else if (fin >= hoy) { dDias = diasEntre(hoy, fin); dLabel = plan.end_date && plan.end_date !== plan.date ? 'a cierre' : 'hoy' }
    else { dDias = -diasEntre(fin, hoy); dLabel = 'terminó' }
  }

  // ── Bloqueos explícitos (andon): siempre atorado ──
  for (const t of abiertas) if (esBloqueada(t)) {
    atorado.push({ nivel: 'atorado', taskId: t.id, texto: `${corto(t.title)} bloqueada${quien(t.assigned_to, nameOf)}: ${corto(t.blocked_reason!, 40)}` })
  }

  // ── Vencidas: HARD atora, SOFT es riesgo ──
  let vencidas = 0
  for (const t of abiertas) {
    if (!t.due_date || t.due_date >= hoy) continue
    vencidas++
    if (esBloqueada(t)) continue // ya está arriba
    const d = diasEntre(t.due_date, hoy)
    const txt = `${corto(t.title)} venció ${dLabelDe(d)}${quien(t.assigned_to, nameOf)}`
    if (t.deadline_type === 'HARD') atorado.push({ nivel: 'atorado', taskId: t.id, texto: txt })
    else riesgo.push({ nivel: 'riesgo', taskId: t.id, texto: txt })
  }

  // ── Actividad en zona caliente con tareas abiertas ──
  const abiertasPorAct = new Map<string, number>()
  for (const t of abiertas) if (t.activity_id) abiertasPorAct.set(t.activity_id, (abiertasPorAct.get(t.activity_id) ?? 0) + 1)
  for (const a of activities) {
    if (a.status === 'cancelada' || a.status === 'hecha') continue
    const n = abiertasPorAct.get(a.id) ?? 0
    if (!n) continue
    const d = diasEntre(hoy, a.date)
    if (d >= 0 && d <= UMBRALES.zonaCaliente) {
      atorado.push({ nivel: 'atorado', activityId: a.id, texto: `${corto(a.title)} ${d === 0 ? 'es hoy' : `en ${d} d`} con ${n} ${n === 1 ? 'tarea abierta' : 'tareas abiertas'}` })
    }
  }

  // ── En revisión demasiado tiempo: alguien más la tiene detenida ──
  for (const t of abiertas) {
    if (t.status !== 'PROOF_SUBMITTED' && t.status !== 'REVISION') continue
    const e = edadEnEstado(t, hoy)
    if (e != null && e > UMBRALES.revisionDias) atorado.push({ nivel: 'atorado', taskId: t.id, texto: `${corto(t.title)} lleva ${e} d en revisión` })
  }

  // ── Sin dueño ──
  const sinDueno = abiertas.filter(t => !t.assigned_to).length
  if (sinDueno) riesgo.push({ nivel: 'riesgo', texto: `${sinDueno} ${sinDueno === 1 ? 'tarea sin responsable' : 'tareas sin responsable'}` })

  // ── Vence pronto y no ha empezado ──
  for (const t of abiertas) {
    if (t.status !== 'OPEN' || !t.due_date || t.due_date < hoy) continue
    const d = diasEntre(hoy, t.due_date)
    if (d <= UMBRALES.porVencer) riesgo.push({ nivel: 'riesgo', taskId: t.id, texto: `${corto(t.title)} vence ${d === 0 ? 'hoy' : `en ${d} d`} y no ha empezado${quien(t.assigned_to, nameOf)}` })
  }

  // ── Presupuesto rebasado ──
  if (plan.budget && plan.actual_cost != null && plan.actual_cost > plan.budget) {
    riesgo.push({ nivel: 'riesgo', texto: `Gasto real al ${Math.round((plan.actual_cost / plan.budget) * 100)}% del presupuesto` })
  }

  // ── Quieta: mucho tiempo en el mismo estado ──
  for (const t of abiertas) {
    if (t.status === 'PROOF_SUBMITTED' || t.status === 'REVISION' || esBloqueada(t)) continue
    const e = edadEnEstado(t, hoy)
    if (e != null && e > UMBRALES.quietaDias && t.status === 'IN_PROGRESS') riesgo.push({ nivel: 'riesgo', taskId: t.id, texto: `${corto(t.title)} lleva ${e} d en progreso sin cerrar${quien(t.assigned_to, nameOf)}` })
  }

  // ── Proyecto sin movimiento con el arranque encima ──
  if (abiertas.length && plan.date && dDias != null && dDias >= 0 && dDias <= UMBRALES.inicioCercano) {
    const ultimo = Math.max(...vivas.map(t => (t.updated_at ? new Date(t.updated_at).getTime() : 0)))
    if (ultimo > 0 && diasDesde(new Date(ultimo).toISOString(), hoy) > UMBRALES.proyectoQuietoDias) {
      atorado.push({ nivel: 'atorado', texto: `Sin movimiento en ${UMBRALES.proyectoQuietoDias}+ d y arranca en ${dDias} d` })
    }
  }

  // ── Esta semana ──
  const estaSemana = abiertas.filter(t => t.due_date && t.due_date >= hoy && diasEntre(hoy, t.due_date) <= 7).length

  // ── Ritmo: cerradas por semana en las últimas 4 (aprox. con updated_at) ──
  let ritmo: number | null = null
  const cerradasRecientes = vivas.filter(t => esHecha(t.status) && t.updated_at && diasDesde(t.updated_at, hoy) <= 28).length
  if (cerradasRecientes > 0 || hechas > 0) ritmo = Math.round((cerradasRecientes / 4) * 10) / 10

  const nivel: Nivel = plan.status === 'done' || plan.status === 'cancelled'
    ? 'sin_senal'
    : atorado.length ? 'atorado'
    : riesgo.length ? 'riesgo'
    : (vivas.length === 0 || !plan.date) ? 'sin_senal'
    : 'fluye'

  // Las causas van de peor a menos peor; la tarjeta enseña las dos primeras
  return { nivel, causas: [...atorado, ...riesgo], dDias, dLabel, abiertas: abiertas.length, hechas, total: vivas.length, vencidas, sinDueno, estaSemana, ritmo }
}

export const NIVEL_META: Record<Nivel, { label: string; color: string; bg: string }> = {
  atorado:   { label: 'Atorado',   color: 'var(--status-risk)',      bg: 'color-mix(in srgb, var(--status-risk) 14%, transparent)' },
  riesgo:    { label: 'En riesgo', color: 'var(--status-attention)', bg: 'color-mix(in srgb, var(--status-attention) 13%, transparent)' },
  fluye:     { label: 'Fluye',     color: 'var(--status-healthy)',   bg: 'color-mix(in srgb, var(--status-healthy) 13%, transparent)' },
  sin_senal: { label: 'Sin señal', color: 'var(--status-none)',      bg: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' },
}

/** "D-9" · "D+3" · "D-0" — el contador que se lee más rápido que una fecha */
export const dTexto = (d: number | null) => d == null ? null : d >= 0 ? `D-${d}` : `D+${Math.abs(d)}`
