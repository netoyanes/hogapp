// Tipos de proyecto del Project Manager — UNA lista para la ventana del
// proyecto, la tarjeta, el chip en las tareas y el timeline. El color del tipo
// es el código visual del proyecto en toda la app: quien ve un borde rosa ya
// sabe que es una remodelación antes de leer el nombre.
export type PlanKind = 'evento' | 'campana' | 'adecuacion' | 'remodelacion' | 'apertura' | 'mantenimiento' | 'interno' | 'otro'

export const KIND_META: Record<PlanKind, { label: string; color: string; hint: string }> = {
  evento:        { label: 'Evento',        color: '#E8A33D', hint: 'Un día o varios — con programa de actividades si dura más de uno' },
  campana:       { label: 'Campaña',       color: '#EC4899', hint: 'Marketing: canales, piezas, calendario de publicación' },
  adecuacion:    { label: 'Adecuación',    color: '#7FA3C2', hint: 'Cambio chico a un espacio existente' },
  remodelacion:  { label: 'Remodelación',  color: '#D98C9F', hint: 'Obra: requerimientos, cotizaciones, documentos' },
  apertura:      { label: 'Apertura',      color: '#5FBF7A', hint: 'Business unit nueva' },
  mantenimiento: { label: 'Mantenimiento', color: '#C9A76B', hint: 'Preventivo o correctivo' },
  interno:       { label: 'Interno',       color: '#B08BC9', hint: 'Proceso, sistema o mejora hacia adentro' },
  otro:          { label: 'Proyecto',      color: '#9C9488', hint: 'Sin plantilla — todas las secciones disponibles' },
}

export const KIND_ORDER: PlanKind[] = ['evento', 'campana', 'remodelacion', 'adecuacion', 'apertura', 'mantenimiento', 'interno', 'otro']

export const kindColor = (k: string | null | undefined) => KIND_META[(k as PlanKind) in KIND_META ? (k as PlanKind) : 'otro'].color
export const kindLabel = (k: string | null | undefined) => KIND_META[(k as PlanKind) in KIND_META ? (k as PlanKind) : 'otro'].label

// Color de ACTIVIDAD (lo que ocurre en fecha y hora dentro de un proyecto).
// Es distinto al de cualquier tipo de proyecto a propósito: en el timeline y
// en la lista de tareas, azul = actividad, y nunca se confunde con el proyecto.
export const ACTIVITY_COLOR = '#5E9FB8'
