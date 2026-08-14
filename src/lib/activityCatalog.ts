import {
  CheckSquare, ArrowRight, Paperclip, MessageSquare, UserPlus, Activity, Archive,
  AlertTriangle, FolderKanban, Handshake, Shell, Music, Landmark, ClipboardCheck,
  Shield, Zap, Eye, Link2, Bot, Users,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE ACTIVIDAD — la fuente única de verdad de qué significa cada
// acción registrada en activity_log.
//
// Cada acción declara a qué MÓDULO de HOG APP pertenece; de ahí salen los
// filtros de la cronología y toda la medición de uso por área. Si mañana se
// registra una acción nueva sin darla de alta aquí, el fallback la muestra
// legible (nunca el nombre técnico crudo) y la manda a 'sistema'.
// ─────────────────────────────────────────────────────────────────────────────

export type ModuleId =
  | 'tareas' | 'proyectos' | 'concierge' | 'comercial' | 'clientes'
  | 'talento' | 'finanzas' | 'casa' | 'sistema'

export const MODULES: Record<ModuleId, { label: string; color: string; icon: React.ElementType }> = {
  tareas:    { label: 'Tareas',     color: '#7FA3C2', icon: CheckSquare },
  proyectos: { label: 'Proyectos',  color: '#E8A33D', icon: FolderKanban },
  concierge: { label: 'Concierge',  color: '#5FBF7A', icon: Shell },
  comercial: { label: 'Comercial',  color: '#8FBF9F', icon: Handshake },
  clientes:  { label: 'Clientes',   color: '#06B6D4', icon: Users },
  talento:   { label: 'Talento',    color: '#A855F7', icon: Music },
  finanzas:  { label: 'Finanzas',   color: '#3D89C4', icon: Landmark },
  casa:      { label: 'La Casa',    color: '#F97316', icon: ClipboardCheck },
  sistema:   { label: 'Sistema',    color: '#8A8A8A', icon: Shield },
}
export const MODULE_ORDER: ModuleId[] = [
  'tareas', 'proyectos', 'concierge', 'comercial', 'clientes', 'talento', 'finanzas', 'casa', 'sistema',
]

type D = Record<string, unknown> | null
const s = (v: unknown, fb = '') => (v == null ? fb : String(v))
// Los estados de tarea viajan en bruto en details.to — aquí se humanizan
const ESTADO: Record<string, string> = {
  OPEN: 'Abierta', IN_PROGRESS: 'En progreso', PROOF_SUBMITTED: 'Evidencia enviada',
  APPROVED: 'Aprobada', REVISION: 'En revisión',
}
const estado = (v: unknown) => ESTADO[s(v)] ?? s(v, '—')
const via = (d: D) => (d?.via ? ` · ${String(d.via).replace(/_/g, ' ')}` : '')

export interface ActionDef {
  module: ModuleId
  icon: React.ElementType
  color: string
  label: (d: D) => string
  /** Acción de peso: se resalta en la cronología (permisos, dinero, sobrecupo…) */
  notable?: boolean
}

export const ACTIONS: Record<string, ActionDef> = {
  // ── Tareas ────────────────────────────────────────────────────────────────
  task_created:      { module: 'tareas', icon: CheckSquare,   color: '#22C55E', label: d => `creó la tarea "${s(d?.title)}"` },
  task_edited:       { module: 'tareas', icon: CheckSquare,   color: '#7FA3C2', label: d => `editó "${s(d?.title)}"${d?.cambios ? ` — ${s(d.cambios)}` : ''}` },
  status_changed:    { module: 'tareas', icon: ArrowRight,    color: '#3B82F6', label: d => `movió "${s(d?.title)}" a ${estado(d?.to)}` },
  assignee_changed:  { module: 'tareas', icon: UserPlus,      color: '#A855F7', label: d => `reasignó "${s(d?.title)}": ${s(d?.from, '—')} → ${s(d?.to, '—')}` },
  proof_uploaded:    { module: 'tareas', icon: Paperclip,     color: '#EAB308', label: d => `subió evidencia a "${s(d?.title)}"` },
  proof_archived:    { module: 'tareas', icon: Archive,       color: '#EF4444', label: d => `archivó una evidencia de "${s(d?.title)}"` },
  link_added:        { module: 'tareas', icon: Link2,         color: '#06B6D4', label: d => `agregó un link a "${s(d?.title)}"` },
  comment_posted:    { module: 'tareas', icon: MessageSquare, color: '#6B7280', label: d => `comentó en "${s(d?.title)}"` },
  task_archived:     { module: 'tareas', icon: Archive,       color: '#EAB308', label: d => `archivó la tarea "${s(d?.title)}"` },
  task_restored:     { module: 'tareas', icon: Archive,       color: '#5FBF7A', label: d => `restauró la tarea "${s(d?.title)}"` },
  task_shared:       { module: 'tareas', icon: Link2,        color: '#06B6D4', label: d => `compartió por link "${s(d?.title)}"` },
  task_viewed_externally: { module: 'tareas', icon: Eye,      color: '#8A8A8A', label: d => `abrió por link compartido "${s(d?.title)}" (${s(d?.viewer, 'anónimo')})` },

  // ── Proyectos ─────────────────────────────────────────────────────────────
  event_created:     { module: 'proyectos', icon: FolderKanban, color: '#22C55E', label: d => `creó el proyecto "${s(d?.name)}"` },
  event_updated:     { module: 'proyectos', icon: FolderKanban, color: '#E8A33D', label: d => `actualizó el proyecto "${s(d?.name)}"${via(d)}` },
  event_archived:    { module: 'proyectos', icon: Archive,      color: '#EAB308', label: d => `archivó el proyecto "${s(d?.name)}"` },
  task_linked:       { module: 'proyectos', icon: Link2,        color: '#06B6D4', label: d => `ligó una tarea al proyecto "${s(d?.event)}"` },
  task_converted_to_project: { module: 'proyectos', icon: FolderKanban, color: '#22C55E', label: d => `convirtió la tarea "${s(d?.task)}" en el proyecto "${s(d?.name)}"` },

  // ── Concierge y reservas ──────────────────────────────────────────────────
  reservation_created:   { module: 'concierge', icon: CheckSquare, color: '#5FBF7A', label: d => `creó reserva de ${s(d?.guest)}${d?.bu ? ` en ${s(d.bu)}` : ''}${d?.date ? ` (${s(d.date)} · ${s(d.pax)} pax)` : ''}` },
  reservation_status:    { module: 'concierge', icon: ArrowRight,  color: '#7FA3C2', label: d => `movió la reserva de ${s(d?.guest)}${d?.bu ? ` en ${s(d.bu)}` : ''} a ${s(d?.to)}` },
  reservation_confirmed: { module: 'concierge', icon: CheckSquare, color: '#5FBF7A', label: d => `confirmó la reserva de ${s(d?.guest)}${via(d)}` },
  reservation_updated:   { module: 'concierge', icon: ArrowRight,  color: '#7FA3C2', label: d => `actualizó una reserva${d?.guest ? ` de ${s(d.guest)}` : ''}${d?.antes && d?.ahora ? ` (${s(d.antes)} → ${s(d.ahora)})` : ''}${via(d)}` },
  reservation_confirm_wa_auto: { module: 'concierge', icon: Bot,   color: '#5FBF7A', label: d => `envió confirmación automática por WhatsApp a ${s(d?.guest)}${d?.venue ? ` (${s(d.venue)})` : ''}` },
  reservation_overbooked:{ module: 'concierge', icon: AlertTriangle, color: '#FACC15', notable: true, label: d => `autorizó SOBRECUPO para ${s(d?.guest)} en ${s(d?.bu)} (${s(d?.slot)} · ${s(d?.pax)} pax)` },
  book:                  { module: 'concierge', icon: CheckSquare, color: '#5FBF7A', label: d => `reservó${d?.bu ? ` en ${s(d.bu)}` : ''}` },
  concierge_config_saved:{ module: 'concierge', icon: Bot,        color: '#8A8A8A', label: d => `ajustó el bot de ${s(d?.bu, 'un venue')}${d?.channel ? ` (${s(d.channel)})` : ''}${d?.campo ? ` — ${s(d.campo)}` : ''}` },
  concierge_simulated:   { module: 'concierge', icon: Bot,        color: '#8A8A8A', label: () => `probó el bot en el simulador` },
  venue_faq_saved:       { module: 'concierge', icon: Bot,        color: '#8A8A8A', label: d => `guardó el FAQ del bot de ${s(d?.bu, 'un venue')}` },
  venue_payment_config_saved: { module: 'concierge', icon: Landmark, color: '#3D89C4', notable: true, label: d => `cambió los datos bancarios de apartados${d?.bu ? ` de ${s(d.bu)}` : ''}` },

  // ── Comercial ─────────────────────────────────────────────────────────────
  deal_created: { module: 'comercial', icon: Handshake, color: '#8FBF9F', label: d => `creó la oportunidad "${s(d?.title)}"${d?.event ? ` (desde ${s(d.event)})` : ''}` },
  vendor_registered: { module: 'comercial', icon: UserPlus, color: '#F97316', label: d => `registró al proveedor "${s(d?.empresa)}"${d?.servicio ? ` (${s(d.servicio)})` : ''}` },
  vendor_updated:    { module: 'comercial', icon: UserPlus, color: '#F97316', label: d => `actualizó al proveedor "${s(d?.empresa)}"` },

  // ── Clientes ──────────────────────────────────────────────────────────────
  guest_created:    { module: 'clientes', icon: UserPlus, color: '#5FBF7A', label: d => `registró al cliente "${s(d?.name)}"${d?.bu ? ` en ${s(d.bu)}` : ''}` },
  guest_updated:    { module: 'clientes', icon: UserPlus, color: '#7FA3C2', label: d => `editó al cliente "${s(d?.name)}"` },
  guest_archived:   { module: 'clientes', icon: Archive,  color: '#EAB308', label: d => `archivó al cliente "${s(d?.name)}"` },
  guest_restored:   { module: 'clientes', icon: Archive,  color: '#5FBF7A', label: d => `restauró al cliente "${s(d?.name)}"` },
  guest_anonymized: { module: 'clientes', icon: Shield,   color: '#E5533C', notable: true, label: d => `anonimizó al cliente "${s(d?.name)}"` },
  guest_deleted:    { module: 'clientes', icon: Shield,   color: '#E5533C', notable: true, label: d => `eliminó al cliente "${s(d?.name)}"` },

  // ── Talento ───────────────────────────────────────────────────────────────
  dj_created: { module: 'talento', icon: Music, color: '#A855F7', label: d => `dio de alta al DJ "${s(d?.stage_name)}"${d?.fee ? ` (fee $${s(d.fee)})` : ''}` },
  dj_updated: { module: 'talento', icon: Music, color: '#A855F7', label: d => `actualizó al DJ "${s(d?.stage_name)}"` },

  // ── Sistema, accesos y auditoría ──────────────────────────────────────────
  user_invited:       { module: 'sistema', icon: UserPlus, color: '#A855F7', notable: true, label: d => `invitó a ${s(d?.email)} como ${s(d?.role)}` },
  app_granted:        { module: 'sistema', icon: Shield,   color: '#5FBF7A', notable: true, label: d => `dio acceso a ${s(d?.app)} a ${s(d?.member)}` },
  app_revoked:        { module: 'sistema', icon: Shield,   color: '#E5533C', notable: true, label: d => `quitó el acceso a ${s(d?.app)} de ${s(d?.member)}` },
  capability_granted: { module: 'sistema', icon: Shield,   color: '#5FBF7A', notable: true, label: d => `otorgó la función "${s(d?.capability)}" a ${s(d?.member)}` },
  capability_revoked: { module: 'sistema', icon: Shield,   color: '#E5533C', notable: true, label: d => `retiró la función "${s(d?.capability)}" de ${s(d?.member)}` },
  venue_assigned:     { module: 'sistema', icon: UserPlus, color: '#5FBF7A', label: d => `asignó ${s(d?.bu)} a ${s(d?.member)}` },
  venue_unassigned:   { module: 'sistema', icon: UserPlus, color: '#EAB308', label: d => `quitó ${s(d?.bu)} a ${s(d?.member)}` },
  hoh_created:        { module: 'casa',    icon: UserPlus, color: '#A78BFA', label: d => `creó acceso de piso "${s(d?.full_name)}" (@${s(d?.username)})` },
  hoh_pin_reset:      { module: 'casa',    icon: Shield,   color: '#A78BFA', label: d => `reinició el PIN de @${s(d?.username)}` },
  sql_injected:       { module: 'sistema', icon: Zap,      color: '#39FF14', notable: true, label: d => {
    const c = d?.creado as { proyectos?: unknown[]; tareas?: unknown[] } | undefined
    const n = (c?.proyectos?.length ?? 0) + (c?.tareas?.length ?? 0)
    return `inyectó SQL${n ? ` — creó ${n} registro${n === 1 ? '' : 's'}` : ''}`
  } },
  info:               { module: 'sistema', icon: Activity, color: '#8A8A8A', label: d => s(d?.message ?? d?.msg, 'registró una nota del sistema') },
}

// Verbo legible para acciones que aún no están en el catálogo: nunca se
// muestra el nombre técnico crudo al usuario.
const VERBO_FALLBACK: [RegExp, string][] = [
  [/_created$|_create$/, 'creó'], [/_updated$|_edited$/, 'actualizó'],
  [/_archived$/, 'archivó'], [/_restored$/, 'restauró'], [/_deleted$/, 'eliminó'],
  [/_granted$/, 'otorgó'], [/_revoked$/, 'retiró'], [/_saved$/, 'guardó'],
  [/_confirmed$/, 'confirmó'], [/_sent$/, 'envió'], [/_viewed$/, 'consultó'],
]
const SUSTANTIVO: Record<string, string> = {
  task: 'una tarea', event: 'un proyecto', reservation: 'una reserva',
  guest: 'un cliente', deal: 'una oportunidad', dj: 'un DJ', user: 'un usuario',
  proof: 'una evidencia', link: 'un link', vendor: 'un proveedor',
  venue: 'un venue', app: 'un acceso', capability: 'una función',
  concierge: 'el concierge', comment: 'un comentario', hoh: 'un acceso de piso',
}

/** Resuelve cualquier acción — esté o no en el catálogo — a algo mostrable. */
export function describeAction(action: string, details: Record<string, unknown> | null): {
  module: ModuleId; icon: React.ElementType; color: string; text: string; notable: boolean
} {
  const def = ACTIONS[action]
  if (def) return { module: def.module, icon: def.icon, color: def.color, text: def.label(details), notable: !!def.notable }

  // Fallback: "<verbo> <sustantivo>" a partir del nombre técnico
  const verbo = VERBO_FALLBACK.find(([re]) => re.test(action))?.[1] ?? 'registró'
  const raiz = action.split('_')[0]
  const sust = SUSTANTIVO[raiz] ?? `algo (${action.replace(/_/g, ' ')})`
  const titulo = details?.title ?? details?.name ?? details?.guest
  return {
    module: 'sistema', icon: Activity, color: '#8A8A8A', notable: false,
    text: `${verbo} ${sust}${titulo ? ` "${String(titulo)}"` : ''}`,
  }
}

/** Módulo de una acción, para agrupar y medir uso por área. */
export const moduleOf = (action: string): ModuleId => ACTIONS[action]?.module ?? 'sistema'
