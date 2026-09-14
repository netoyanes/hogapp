// ─────────────────────────────────────────────────────────────────────────────
// APERTURAS · APERTURA DE EJEMPLO
//
// Una tienda-café de dos semanas: obra ligera, mobiliario a medida y compras en
// línea. No es relleno — está armada para que se vea lo que la herramienta
// existe para detectar:
//
//   · una ruta crítica sin holgura (barra → instalación → prueba → apertura),
//   · seis partidas con precio estimado, sin cotización en firme,
//   · un presupuesto ya excedido, con Fase 1 comiéndose casi todo,
//   · una Fase 2 diferida a después de abrir, que cuesta dinero pero no
//     detiene la apertura.
//
// Se siembra desde la pantalla con un botón, no al arrancar: datos de ejemplo
// que aparecen solos son basura que alguien tiene que borrar.
// ─────────────────────────────────────────────────────────────────────────────

import { type Partida, type Proveedor, type Proyecto, masDias } from './modelo'

type ProveedorSemilla = Omit<Proveedor, 'id'> & { ref: string }
type PartidaSemilla = Omit<Partida, 'id' | 'proyecto_id' | 'proveedor_id' | 'depende_de'>
  & { ref: string; proveedor?: string; depende?: string[] }

export const PROVEEDORES_EJEMPLO: ProveedorSemilla[] = [
  { ref: 'carpinteria', nombre: 'Taller Mendoza', tipo: 'taller', oficio: 'carpinteria', anticipo_pct: 0.5, contacto: '55 1234 5678' },
  { ref: 'obra',        nombre: 'Constructora Rivas', tipo: 'contratista', oficio: 'albanileria', anticipo_pct: 0.4, contacto: '55 2345 6789' },
  { ref: 'pintor',      nombre: 'Pintores Ortega', tipo: 'contratista', oficio: 'pintura', anticipo_pct: 0.3, contacto: '55 3456 7890' },
  { ref: 'electrico',   nombre: 'Eléctrica Sandoval', tipo: 'contratista', oficio: 'electrica', anticipo_pct: 0.5, contacto: '55 4567 8901' },
  { ref: 'herreria',    nombre: 'Herrería Lupita', tipo: 'taller', oficio: 'herreria', anticipo_pct: 0.5, contacto: '55 5678 9012' },
  { ref: 'amazon',      nombre: 'Amazon MX', tipo: 'tienda_linea', anticipo_pct: 1, dominio: 'amazon.com.mx' },
  { ref: 'ml',          nombre: 'Mercado Libre', tipo: 'tienda_linea', anticipo_pct: 1, dominio: 'mercadolibre.com' },
  { ref: 'equipo',      nombre: 'Equipo interno', tipo: 'interno', anticipo_pct: 0 },
]

const F1 = 'Fase 1 · Obra y montaje'
const F2 = 'Fase 2 · Después de abrir'

const base = {
  avance: 0, anticipo_pagado: false, saldo_pagado: false,
  estimado: false, post_apertura: false, notas: null,
} as const

export const PARTIDAS_EJEMPLO: PartidaSemilla[] = [
  // ── La cadena que manda: cualquier día aquí es un día de apertura ────────
  {
    ...base, ref: 'demo', nombre: 'Demolición y retiro de cancelería', fase: F1,
    tipo: 'trabajo', proveedor: 'obra', oficio: 'albanileria',
    cantidad: 6, precio_unitario: 1800, dias_ejecucion: 2, avance: 100,
    anticipo_pagado: true, saldo_pagado: true,
  },
  {
    ...base, ref: 'electrica', nombre: 'Instalación eléctrica y salidas de barra', fase: F1,
    tipo: 'trabajo', proveedor: 'electrico', oficio: 'electrica', depende: ['demo'],
    cantidad: 22, precio_unitario: 950, dias_ejecucion: 3, avance: 60,
    anticipo_pagado: true,
  },
  {
    ...base, ref: 'tablaroca', nombre: 'Tablaroca en muro de barra', fase: F1,
    tipo: 'trabajo', proveedor: 'obra', oficio: 'tablaroca', depende: ['electrica'],
    cantidad: 34, precio_unitario: 520, dias_ejecucion: 2,
  },
  {
    ...base, ref: 'barra', nombre: 'Barra de servicio a medida', fase: F1,
    tipo: 'trabajo', proveedor: 'carpinteria', oficio: 'carpinteria', depende: ['tablaroca'],
    cantidad: 1, precio_unitario: 68000, dias_ejecucion: 4,
    notas: 'Encino macizo, 3.2 m. Incluye instalación.',
  },
  {
    ...base, ref: 'pintura', nombre: 'Pintura general', fase: F1,
    tipo: 'trabajo', proveedor: 'pintor', oficio: 'pintura', depende: ['tablaroca'],
    cantidad: 180, precio_unitario: 145, dias_ejecucion: 3,
  },
  {
    ...base, ref: 'montaje', nombre: 'Montaje de equipo y mobiliario', fase: F1,
    tipo: 'tarea', responsable: 'Operaciones', depende: ['barra', 'cafetera', 'sillas'],
    dias: 2, costo: 0, estimado: true,
    notas: 'Sin costo directo: lo hace el equipo. El monto en cero es a propósito.',
  },
  {
    ...base, ref: 'prueba', nombre: 'Prueba de servicio con staff', fase: F1,
    tipo: 'tarea', responsable: 'Gerencia', depende: ['montaje'],
    dias: 1, costo: 8000, estimado: true,
  },

  // ── Compras: la barra la ordena, el tiempo de entrega es la duración ─────
  {
    ...base, ref: 'cafetera', nombre: 'Cafetera espresso de 2 grupos', fase: F1,
    tipo: 'compra', proveedor: 'ml', depende: ['demo'],
    precio_unitario: 96000, cantidad: 1, dias_entrega: 6,
    url: 'https://articulo.mercadolibre.com.mx/MLM-cafetera-2-grupos',
    notas: 'Revisa el precio contra tu carrito antes de ordenar.',
  },
  {
    ...base, ref: 'sillas', nombre: 'Sillas de madera (10)', fase: F1,
    tipo: 'compra', proveedor: 'amazon', depende: ['demo'],
    precio_unitario: 1450, cantidad: 10, dias_entrega: 5, estimado: true,
    url: 'https://www.amazon.com.mx/dp/EJEMPLO',
  },
  {
    ...base, ref: 'lamparas', nombre: 'Lámparas colgantes (6)', fase: F1,
    tipo: 'compra', proveedor: 'amazon', depende: ['electrica'],
    precio_unitario: 2100, cantidad: 6, dias_entrega: 4, estimado: true,
  },
  {
    ...base, ref: 'vajilla', nombre: 'Vajilla y cristalería', fase: F1,
    tipo: 'compra', proveedor: 'ml', depende: ['demo'],
    precio_unitario: 24000, cantidad: 1, dias_entrega: 6, estimado: true,
  },

  // ── Lo que no está en la cadena: tiene holgura y se ve en el Gantt ───────
  {
    ...base, ref: 'letrero', nombre: 'Letrero exterior en herrería', fase: F1,
    tipo: 'trabajo', proveedor: 'herreria', oficio: 'herreria', depende: ['demo'],
    cantidad: 1, precio_unitario: 18000, dias_ejecucion: 5, estimado: true,
  },
  {
    ...base, ref: 'permisos', nombre: 'Permisos y aviso de funcionamiento', fase: F1,
    tipo: 'tarea', responsable: 'Administración',
    dias: 9, costo: 22000, estimado: true,
  },
  {
    ...base, ref: 'limpieza', nombre: 'Limpieza profunda previa', fase: F1,
    tipo: 'trabajo', proveedor: 'obra', oficio: 'limpieza', depende: ['pintura'],
    cantidad: 4, precio_unitario: 900, dias_ejecucion: 1,
  },

  // ── Fase 2: cuesta, pero no detiene la apertura ──────────────────────────
  {
    ...base, ref: 'terraza', nombre: 'Terraza y jardinera', fase: F2,
    tipo: 'trabajo', proveedor: 'obra', oficio: 'albanileria', depende: ['prueba'],
    cantidad: 14, precio_unitario: 2400, dias_ejecucion: 12,
    post_apertura: true, estimado: true,
  },
  {
    ...base, ref: 'toldo', nombre: 'Toldo retráctil', fase: F2,
    tipo: 'compra', proveedor: 'ml', depende: ['terraza'],
    precio_unitario: 31000, cantidad: 1, dias_entrega: 8, post_apertura: true,
  },
]

/** El proyecto de ejemplo, anclado a hoy para que el Gantt caiga sobre la fecha real. */
export function proyectoEjemplo(hoy: string): Omit<Proyecto, 'id'> & { notas: string } {
  return {
    nombre: 'Tienda-café Nuevo León',
    ciudad: 'Condesa, CDMX',
    // Arrancó hace tres días: así el panel tiene avance real contra planeado
    // desde el primer minuto, en vez de un proyecto que aún no empieza.
    inicio: masDias(hoy, -3),
    meta_apertura: masDias(hoy, 11),
    presupuesto_aprobado: 380000,
    reserva_pct: 0.1,
    notas: 'Apertura de ejemplo. Bórrala cuando cargues la tuya.',
  }
}
