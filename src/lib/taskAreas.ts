import type { TaskArea, ClientImpact } from '../types'

// Taxonomía de área para un grupo de hospitalidad completo: de piso a
// dirección. Agrupada en 4 macro-categorías para el <optgroup> del selector.
export const TASK_AREA_LABELS: Record<TaskArea, string> = {
  piso:          'Operación de piso',
  mantenimiento: 'Mantenimiento e infraestructura',
  concierge:     'Concierge y experiencia del cliente',
  talento:       'Talento y programación',
  marketing:     'Marketing y contenido',
  comercial:     'Comercial y alianzas',
  finanzas:      'Finanzas y administración',
  rrhh:          'Recursos humanos',
  legal:         'Legal y cumplimiento',
  direccion:     'Dirección y estrategia',
  tecnologia:    'Tecnología y producto',
}

export const TASK_AREA_GROUPS: { group: string; items: TaskArea[] }[] = [
  { group: 'Operación', items: ['piso', 'mantenimiento', 'concierge', 'talento'] },
  { group: 'Comercial y Marketing', items: ['marketing', 'comercial'] },
  { group: 'Corporativo', items: ['finanzas', 'rrhh', 'legal', 'direccion'] },
  { group: 'Tecnología', items: ['tecnologia'] },
]

// "Cliente" es el término paraguas: consumidor F&B, huésped de hotel, cliente
// de wellness, quien reserva un pod boutique — cualquiera de los 5 tipos de venue.
export const CLIENT_IMPACT_LABELS: Record<ClientImpact, string> = {
  client_facing: 'Cara al cliente',
  internal: 'Interno',
}
