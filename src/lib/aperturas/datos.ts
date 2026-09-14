// ─────────────────────────────────────────────────────────────────────────────
// APERTURAS · PUENTE CON LA BASE
//
// Traduce entre las filas de Postgres y el modelo que consume el motor. Vive
// aparte porque el motor no debe saber que existe una base de datos, y las
// pantallas no deben saber cómo se llaman las columnas.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase'
import { type Partida, type Proveedor, type Proyecto, iso } from './modelo'
import { PARTIDAS_EJEMPLO, PROVEEDORES_EJEMPLO, proyectoEjemplo } from './ejemplo'

export interface ProyectoFila extends Proyecto {
  bu_id: string | null
  notas: string | null
  linea_base: Record<string, LineaBase> | null
  linea_base_at: string | null
  archivado: boolean
}

export interface LineaBase {
  dias: number
  monto: number
  depende_de: string[]
}

const num = (v: unknown) => v == null ? null : Number(v)

/** Postgres devuelve numeric como string; el motor necesita números de verdad. */
export const aPartida = (r: Record<string, unknown>): Partida => ({
  id: r.id as string,
  proyecto_id: r.proyecto_id as string,
  nombre: r.nombre as string,
  fase: (r.fase as string) ?? 'Obra',
  tipo: r.tipo as Partida['tipo'],
  depende_de: (r.depende_de as string[]) ?? [],
  proveedor_id: (r.proveedor_id as string) ?? null,
  avance: Number(r.avance ?? 0),
  anticipo_pagado: !!r.anticipo_pagado,
  saldo_pagado: !!r.saldo_pagado,
  estimado: !!r.estimado,
  post_apertura: !!r.post_apertura,
  no_antes_de: (r.no_antes_de as string) ?? null,
  notas: (r.notas as string) ?? null,
  url: (r.url as string) ?? null,
  foto: (r.foto as string) ?? null,
  precio_unitario: num(r.precio_unitario),
  cantidad: num(r.cantidad),
  dias_entrega: num(r.dias_entrega),
  oficio: (r.oficio as string) ?? null,
  dias_ejecucion: num(r.dias_ejecucion),
  responsable: (r.responsable as string) ?? null,
  dias: num(r.dias),
  costo: num(r.costo),
})

export const aProveedor = (r: Record<string, unknown>): Proveedor => ({
  id: r.id as string,
  nombre: r.nombre as string,
  tipo: r.tipo as Proveedor['tipo'],
  oficio: (r.oficio as string) ?? null,
  anticipo_pct: Number(r.anticipo_pct ?? 0),
  contacto: (r.contacto as string) ?? null,
  dominio: (r.dominio as string) ?? null,
})

export const aProyecto = (r: Record<string, unknown>): ProyectoFila => ({
  id: r.id as string,
  nombre: r.nombre as string,
  ciudad: (r.ciudad as string) ?? 'CDMX',
  inicio: r.inicio as string,
  meta_apertura: r.meta_apertura as string,
  presupuesto_aprobado: Number(r.presupuesto_aprobado ?? 0),
  reserva_pct: Number(r.reserva_pct ?? 0),
  bu_id: (r.bu_id as string) ?? null,
  notas: (r.notas as string) ?? null,
  linea_base: (r.linea_base as Record<string, LineaBase>) ?? null,
  linea_base_at: (r.linea_base_at as string) ?? null,
  archivado: !!r.archivado,
})

export async function cargarProyectos() {
  const { data, error } = await supabase.from('aperturas_proyectos')
    .select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(aProyecto)
}

export async function cargarProyecto(proyectoId: string) {
  const [{ data: parts, error: e1 }, { data: provs, error: e2 }] = await Promise.all([
    supabase.from('aperturas_partidas').select('*').eq('proyecto_id', proyectoId).order('orden'),
    supabase.from('aperturas_proveedores').select('*').eq('activo', true).order('nombre'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  return {
    partidas: (parts ?? []).map(aPartida),
    proveedores: (provs ?? []).map(aProveedor),
  }
}

/**
 * Siembra la apertura de ejemplo. Dos pasos porque las dependencias son ids
 * reales: primero se insertan las partidas, después se amarran entre sí con
 * los ids que devolvió Postgres.
 */
export async function sembrarEjemplo(hoy = iso(new Date())) {
  const { data: proy, error: e1 } = await supabase.from('aperturas_proyectos')
    .insert(proyectoEjemplo(hoy)).select().single()
  if (e1) throw e1

  // Los proveedores son globales: si ya existe uno con el mismo nombre se
  // reusa, para no llenar el catálogo de duplicados cada vez que se prueba.
  const { data: existentes } = await supabase.from('aperturas_proveedores').select('id, nombre')
  const porNombre = new Map((existentes ?? []).map(p => [p.nombre as string, p.id as string]))
  const faltantes = PROVEEDORES_EJEMPLO.filter(p => !porNombre.has(p.nombre))
  if (faltantes.length) {
    // Columna por columna, no un spread: `ref` y compañía son andamios del
    // ejemplo y no existen en la tabla.
    const { data, error } = await supabase.from('aperturas_proveedores').insert(
      faltantes.map(p => ({
        nombre: p.nombre, tipo: p.tipo, oficio: p.oficio ?? null,
        anticipo_pct: p.anticipo_pct, contacto: p.contacto ?? null, dominio: p.dominio ?? null,
      })),
    ).select('id, nombre')
    if (error) throw error
    for (const p of data ?? []) porNombre.set(p.nombre as string, p.id as string)
  }
  const idProveedor = new Map(PROVEEDORES_EJEMPLO.map(p => [p.ref, porNombre.get(p.nombre)!]))

  const filas = PARTIDAS_EJEMPLO.map((p, i) => ({
    proyecto_id: proy.id, orden: i * 10,
    proveedor_id: p.proveedor ? idProveedor.get(p.proveedor) ?? null : null,
    nombre: p.nombre, fase: p.fase, tipo: p.tipo, avance: p.avance,
    anticipo_pagado: p.anticipo_pagado, saldo_pagado: p.saldo_pagado,
    estimado: p.estimado, post_apertura: p.post_apertura, notas: p.notas ?? null,
    url: p.url ?? null, foto: p.foto ?? null,
    precio_unitario: p.precio_unitario ?? null, cantidad: p.cantidad ?? null,
    dias_entrega: p.dias_entrega ?? null,
    oficio: p.oficio ?? null, dias_ejecucion: p.dias_ejecucion ?? null,
    responsable: p.responsable ?? null, dias: p.dias ?? null, costo: p.costo ?? null,
  }))
  const { data: creadas, error: e2 } = await supabase.from('aperturas_partidas')
    .insert(filas).select('id, nombre')
  if (e2) throw e2

  // El insert no garantiza orden de regreso: se amarra por nombre, que en el
  // ejemplo es único.
  const idPorNombre = new Map((creadas ?? []).map(p => [p.nombre as string, p.id as string]))
  const conDeps = PARTIDAS_EJEMPLO.filter(p => p.depende?.length)
  for (const p of conDeps) {
    const deps = p.depende!
      .map(ref => idPorNombre.get(PARTIDAS_EJEMPLO.find(q => q.ref === ref)!.nombre))
      .filter((x): x is string => !!x)
    await supabase.from('aperturas_partidas')
      .update({ depende_de: deps }).eq('id', idPorNombre.get(p.nombre)!)
  }

  return proy.id as string
}

/** Foto del plan tal como está hoy: duración, monto y dependencias. */
export function tomarLineaBase(
  partidas: Partida[],
  duracion: (p: Partida) => number,
  monto: (p: Partida) => number,
): Record<string, LineaBase> {
  return Object.fromEntries(partidas.map(p => [p.id, {
    dias: duracion(p), monto: monto(p), depende_de: p.depende_de,
  }]))
}
