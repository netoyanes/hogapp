// Secciones de la ventana del proyecto — la ventana es MODULAR: el tipo de
// proyecto decide qué viene abierto de entrada, y el usuario agrega o quita
// secciones según la información que tenga. Lo básico (nombre, venue, tipo,
// fechas, responsable, estado) siempre está; todo lo demás es un módulo.
import type { PlanKind } from './projectKinds'

export type ModuloId =
  | 'brief' | 'asistencia' | 'campana' | 'cliente' | 'equipo' | 'requerimientos'
  | 'tareas' | 'programa' | 'presupuesto' | 'documentos' | 'timeline' | 'corte'

export const MODULOS: { id: ModuloId; label: string; hint: string; avanzado?: boolean }[] = [
  { id: 'brief',          label: 'Brief',               hint: 'Concepto, copy, contexto — de qué va' },
  { id: 'tareas',         label: 'Tareas',              hint: 'Lo que hay que hacer antes, del proyecto y de cada actividad' },
  { id: 'programa',       label: 'Programa',            hint: 'Lo que OCURRE, con día y hora — actividades' },
  { id: 'presupuesto',    label: 'Presupuesto',         hint: 'Partidas de gasto y patrocinios, con cotización' },
  { id: 'asistencia',     label: 'Asistencia y cover',  hint: 'Cover, asistencia esperada y real' },
  { id: 'campana',        label: 'Canales y KPI',       hint: 'Dónde se publica, qué se mide, cuál es la meta' },
  { id: 'cliente',        label: 'Cliente externo',     hint: 'Quién contrata, contacto y precio de venta' },
  { id: 'equipo',         label: 'Equipo',              hint: 'Relacionados del equipo interno' },
  { id: 'requerimientos', label: 'Requerimientos y talento', hint: 'Qué se necesita y quién viene de fuera' },
  { id: 'documentos',     label: 'Documentos',          hint: 'Planos, renders, contratos, fotos' },
  { id: 'timeline',       label: 'Timeline',            hint: 'Proyecto, actividades y tareas en semanas', avanzado: true },
  { id: 'corte',          label: 'Corte',               hint: 'Ingreso y gasto reales, utilidad', avanzado: true },
]

// Plantilla por tipo: qué secciones vienen abiertas. "Proyecto" (otro) es el
// default y trae lo mínimo — el resto se agrega con "+ Sección".
export const DEFAULTS: Record<PlanKind, ModuloId[]> = {
  evento:        ['brief', 'asistencia', 'tareas', 'presupuesto', 'programa'],
  campana:       ['brief', 'campana', 'tareas', 'presupuesto', 'timeline'],
  remodelacion:  ['requerimientos', 'presupuesto', 'tareas', 'documentos', 'timeline'],
  adecuacion:    ['requerimientos', 'presupuesto', 'tareas', 'documentos'],
  apertura:      ['brief', 'tareas', 'programa', 'presupuesto', 'equipo', 'requerimientos', 'documentos', 'timeline'],
  mantenimiento: ['tareas', 'presupuesto', 'documentos'],
  interno:       ['brief', 'tareas'],
  otro:          ['brief', 'tareas'],
}

export const moduloMeta = (id: ModuloId) => MODULOS.find(m => m.id === id)!

// Campos que dependen del tipo y viven en event_plans.extra (jsonb)
export const EXTRA_CAMPOS: Record<'campana' | 'cliente' | 'interno', { key: string; label: string; placeholder: string; tipo?: 'number' | 'text' | 'textarea' }[]> = {
  campana: [
    { key: 'canales', label: 'Canales', placeholder: 'Instagram, TikTok, WhatsApp, PR, pauta…' },
    { key: 'objetivo', label: 'Objetivo', placeholder: 'Llenar el taller del sábado, 40 reservas nuevas…' },
    { key: 'kpi', label: 'KPI y meta', placeholder: 'Reservas desde link: 60 · alcance: 25k · CPL < $40' },
    { key: 'piezas', label: 'Piezas', placeholder: 'Reel teaser, 3 stories, flyer, copy WhatsApp', tipo: 'textarea' },
  ],
  cliente: [
    { key: 'cliente_nombre', label: 'Cliente', placeholder: 'Empresa o persona que contrata' },
    { key: 'cliente_contacto', label: 'Contacto', placeholder: 'Nombre · teléfono · correo' },
    { key: 'precio_venta', label: 'Precio de venta (MXN)', placeholder: '0', tipo: 'number' },
    { key: 'condiciones', label: 'Condiciones', placeholder: '50% anticipo, resto contra entrega…' },
  ],
  interno: [
    { key: 'area_solicitante', label: 'Área solicitante', placeholder: 'Operaciones, Marketing, Dirección…' },
    { key: 'beneficio', label: 'Qué resuelve', placeholder: 'El problema que atiende o la mejora que trae' },
  ],
}
