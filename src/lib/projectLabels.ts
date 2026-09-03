// Etiquetas de proyecto/actividad para las tareas: una consulta chica por
// pantalla (board, Mi Semana, ventana de tarea) y un mapa listo para pintar el
// ProjectChip. Sin esto la tarea no dice a qué proyecto pertenece — el hueco
// que hacía que una tarea de proyecto pareciera suelta.
import { supabase } from './supabase'

export interface ProjectLabel { id: string; name: string; kind: string | null; bu_id?: string | null }
export interface ActivityLabel { id: string; title: string; date: string | null; event_id: string }

export interface ProjectLabels {
  projects: Record<string, ProjectLabel>
  activities: Record<string, ActivityLabel>
}

export async function loadProjectLabels(tasks: { event_id?: string | null; activity_id?: string | null }[]): Promise<ProjectLabels> {
  const pIds = [...new Set(tasks.map(t => t.event_id).filter((x): x is string => !!x))]
  const aIds = [...new Set(tasks.map(t => t.activity_id).filter((x): x is string => !!x))]
  const out: ProjectLabels = { projects: {}, activities: {} }
  if (!pIds.length && !aIds.length) return out
  const [p, a] = await Promise.all([
    pIds.length ? supabase.from('event_plans').select('id, name, kind, bu_id').in('id', pIds) : Promise.resolve({ data: [] as ProjectLabel[] }),
    // project_activities puede no existir aún (project_program.sql): el error se ignora
    aIds.length ? supabase.from('project_activities').select('id, title, date, event_id').in('id', aIds) : Promise.resolve({ data: [] as ActivityLabel[] }),
  ])
  for (const r of (p.data ?? []) as ProjectLabel[]) out.projects[r.id] = r
  for (const r of (a.data ?? []) as ActivityLabel[]) out.activities[r.id] = r
  return out
}

/** Lo que el ProjectChip necesita para una tarea, o null si es suelta */
export function chipDe(t: { event_id?: string | null; activity_id?: string | null }, labels: ProjectLabels) {
  const p = t.event_id ? labels.projects[t.event_id] : undefined
  if (!p) return null
  const a = t.activity_id ? labels.activities[t.activity_id] : undefined
  return { id: p.id, name: p.name, kind: p.kind, activity: a?.title ?? null }
}

/** Abre la ventana de un proyecto desde cualquier pantalla (App.tsx escucha) */
export function abrirProyecto(id: string) {
  window.dispatchEvent(new CustomEvent('hog:open-project', { detail: id }))
}
