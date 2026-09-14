// ─────────────────────────────────────────────────────────────────────────────
// APERTURAS · MOTOR DE CÁLCULO
//
// Todo lo que este archivo produce es DERIVADO. No guarda nada, no toca la red,
// no sabe qué es React. Se le dan las partidas y el proyecto, y devuelve el
// cronograma, el flujo de caja, el avance y las alertas.
//
// Esa pureza es el punto: es la única forma de que el Gantt, el flujo de caja
// y el tablero no se contradigan. Los tres leen de aquí.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type Partida, type Proyecto, type Proveedor,
  montoDe, duracionDe, masDias, diasEntre, presupuestoEjecutable,
} from './modelo'

// ── Cronograma ───────────────────────────────────────────────────────────────

export interface Barra {
  id: string
  /** Offset en días desde el inicio del proyecto. */
  inicio_temprano: number
  fin_temprano: number
  inicio_tardio: number
  fin_tardio: number
  /** Días que puede retrasarse sin mover su fecha límite. */
  holgura: number
  /**
   * Bloquea la apertura. Lo diferido a Fase 2 nunca lo es, aunque tenga
   * holgura cero contra el fin del proyecto: pintarlo de rojo en el Gantt
   * diría "esto detiene la apertura", que es justo lo contrario.
   */
  critica: boolean
  duracion: number
  /** Fechas ya resueltas, listas para pintar. */
  fecha_inicio: string
  /** Último día de trabajo. Para duración 0 es igual a fecha_inicio. */
  fecha_fin: string
}

export interface Cronograma {
  barras: Map<string, Barra>
  /** Orden topológico; las partidas en ciclo quedan fuera. */
  orden: string[]
  /** Ids que no se pudieron programar por depender de sí mismas (en cadena). */
  ciclos: string[]
  /** Duración total en días, Fase 2 incluida. */
  duracion_total: number
  /** Días hasta que todo lo que condiciona la apertura está listo. */
  duracion_apertura: number
  /** Fecha en que se puede abrir. */
  fin: string
  /** Fecha en que termina absolutamente todo, diferidos incluidos. */
  fin_total: string
  /** Días de sobra (+) o de retraso (−) contra la meta de apertura. */
  colchon: number
}

/**
 * Ruta crítica clásica, sobre días naturales.
 *
 * La pasada hacia adelante da el arranque más temprano posible; la pasada hacia
 * atrás, el más tardío que todavía abre a tiempo. La diferencia es la holgura,
 * y las partidas con holgura cero son las que de verdad mandan sobre la fecha
 * de apertura — mover cualquier otra no cambia nada.
 */
export function programar(proyecto: Proyecto, partidas: Partida[]): Cronograma {
  const porId = new Map(partidas.map(p => [p.id, p]))

  // Solo cuentan las dependencias hacia partidas que existen: una partida
  // borrada no debe congelar el cronograma de las que quedaron.
  const previas = new Map<string, string[]>()
  const siguientes = new Map<string, string[]>()
  for (const p of partidas) { previas.set(p.id, []); siguientes.set(p.id, []) }
  for (const p of partidas) {
    for (const dep of p.depende_de) {
      if (dep === p.id || !porId.has(dep)) continue
      previas.get(p.id)!.push(dep)
      siguientes.get(dep)!.push(p.id)
    }
  }

  // ── Orden topológico (Kahn). Lo que sobra al final está en un ciclo ────────
  const pendientes = new Map<string, number>()
  for (const p of partidas) pendientes.set(p.id, previas.get(p.id)!.length)
  const cola = partidas.filter(p => pendientes.get(p.id) === 0).map(p => p.id)
  const orden: string[] = []
  while (cola.length) {
    const id = cola.shift()!
    orden.push(id)
    for (const sig of siguientes.get(id)!) {
      const n = pendientes.get(sig)! - 1
      pendientes.set(sig, n)
      if (n === 0) cola.push(sig)
    }
  }
  const enOrden = new Set(orden)
  const ciclos = partidas.filter(p => !enOrden.has(p.id)).map(p => p.id)

  // ── Pasada hacia adelante ─────────────────────────────────────────────────
  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  for (const id of orden) {
    const dur = duracionDe(porId.get(id)!)
    const inicio = previas.get(id)!.reduce((max, dep) => Math.max(max, ef.get(dep) ?? 0), 0)
    es.set(id, inicio)
    ef.set(id, inicio + dur)
  }

  const duracion_total = orden.reduce((max, id) => Math.max(max, ef.get(id) ?? 0), 0)
  // Lo que de verdad condiciona abrir. Sin esta distinción, una terraza
  // programada para dos meses después de la apertura le regalaría holgura a la
  // ruta crítica y el cronograma dejaría de avisar cuando sí hay problema.
  const duracion_apertura = orden
    .filter(id => !porId.get(id)!.post_apertura)
    .reduce((max, id) => Math.max(max, ef.get(id) ?? 0), 0)

  // ── Pasada hacia atrás ────────────────────────────────────────────────────
  // Cada partida se mide contra SU fecha límite: la apertura para lo que la
  // condiciona, el fin del proyecto para lo diferido.
  const lf = new Map<string, number>()
  const ls = new Map<string, number>()
  for (let i = orden.length - 1; i >= 0; i--) {
    const id = orden[i]
    const p = porId.get(id)!
    const dur = duracionDe(p)
    const limite = p.post_apertura ? duracion_total : duracion_apertura
    const sigs = siguientes.get(id)!.filter(s => enOrden.has(s))
    let fin = sigs.length
      ? sigs.reduce((min, s) => Math.min(min, ls.get(s) ?? limite), limite)
      : limite
    // Una partida que condiciona la apertura no puede terminar después de
    // ella, aunque su única sucesora sea de Fase 2.
    if (!p.post_apertura) fin = Math.min(fin, duracion_apertura)
    lf.set(id, fin)
    ls.set(id, fin - dur)
  }

  const barras = new Map<string, Barra>()
  for (const p of partidas) {
    const dur = duracionDe(p)
    // Una partida en ciclo no tiene fechas confiables: se muestra pegada al
    // inicio y la alerta se encarga de gritar. Inventarle una fecha sería peor.
    const a = es.get(p.id) ?? 0
    const b = ef.get(p.id) ?? dur
    const c = ls.get(p.id) ?? a
    const d = lf.get(p.id) ?? b
    const holgura = enOrden.has(p.id) ? c - a : 0
    barras.set(p.id, {
      id: p.id,
      inicio_temprano: a, fin_temprano: b,
      inicio_tardio: c, fin_tardio: d,
      holgura,
      critica: enOrden.has(p.id) && !p.post_apertura && holgura === 0 && dur > 0,
      duracion: dur,
      fecha_inicio: masDias(proyecto.inicio, a),
      fecha_fin: masDias(proyecto.inicio, Math.max(a, b - 1)),
    })
  }

  const fin = masDias(proyecto.inicio, Math.max(0, duracion_apertura - 1))

  return {
    barras, orden, ciclos, duracion_total, duracion_apertura, fin,
    fin_total: masDias(proyecto.inicio, Math.max(0, duracion_total - 1)),
    colchon: diasEntre(fin, proyecto.meta_apertura),
  }
}

// ── Flujo de caja ────────────────────────────────────────────────────────────

export interface Pago {
  partida_id: string
  partida: string
  proveedor_id?: string | null
  clase: 'anticipo' | 'saldo'
  fecha: string
  monto: number
  pagado: boolean
  /** Dinero de una partida todavía estimada: puede moverse. */
  estimado: boolean
}

export interface DiaFlujo {
  fecha: string
  monto: number
  acumulado: number
  pagos: Pago[]
}

/**
 * Anticipo que corresponde a una partida.
 *
 * El proveedor manda cuando existe. Cuando no, el default distingue lo único
 * que importa: una compra en línea se paga completa al ordenar (por eso su
 * dinero sale el día que arranca, no el día que llega), y un trabajo se paga
 * al terminar salvo que se pacte anticipo.
 */
export function anticipoPctDe(p: Partida, prov?: Proveedor | null): number {
  if (prov) return Math.min(1, Math.max(0, prov.anticipo_pct))
  return p.tipo === 'compra' ? 1 : 0
}

/**
 * Cada partida genera hasta dos pagos: el anticipo el día que arranca y el
 * saldo el día que termina. Es el puente entre el cronograma y el banco — y la
 * razón por la que mover una fecha en el Gantt mueve el dinero solo.
 */
export function pagosDe(
  partidas: Partida[], crono: Cronograma, proveedores: Proveedor[],
): Pago[] {
  const porProv = new Map(proveedores.map(p => [p.id, p]))
  const pagos: Pago[] = []

  for (const p of partidas) {
    const barra = crono.barras.get(p.id)
    if (!barra) continue
    const monto = montoDe(p)
    if (monto <= 0) continue

    const prov = p.proveedor_id ? porProv.get(p.proveedor_id) ?? null : null
    const pct = anticipoPctDe(p, prov)
    const anticipo = Math.round(monto * pct * 100) / 100
    const saldo = Math.round((monto - anticipo) * 100) / 100

    if (anticipo > 0) pagos.push({
      partida_id: p.id, partida: p.nombre, proveedor_id: p.proveedor_id,
      clase: 'anticipo', fecha: barra.fecha_inicio, monto: anticipo,
      pagado: p.anticipo_pagado, estimado: p.estimado,
    })
    if (saldo > 0) pagos.push({
      partida_id: p.id, partida: p.nombre, proveedor_id: p.proveedor_id,
      clase: 'saldo', fecha: barra.fecha_fin, monto: saldo,
      pagado: p.saldo_pagado, estimado: p.estimado,
    })
  }

  return pagos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.partida.localeCompare(b.partida))
}

export interface Semana {
  /** Lunes de la semana. */
  inicio: string
  programado: number
  pagado: number
  /** Acumulado de lo programado, para la línea contra el presupuesto. */
  acumulado: number
  acumulado_pagado: number
}

/** Lunes de la semana en que cae una fecha. La semana laboral empieza ahí. */
export const lunesDe = (fecha: string) => {
  const d = new Date(fecha + 'T00:00:00')
  return masDias(fecha, -((d.getDay() + 6) % 7))
}

/**
 * Flujo semanal: programado contra pagado.
 *
 * Semanal y no diario porque así se negocia con el banco y con los
 * proveedores: nadie pregunta cuánto sale el martes, preguntan cuánto sale
 * esta semana. Se rellenan las semanas sin movimiento para que el hueco se vea.
 */
export function flujoPorSemana(pagos: Pago[]): Semana[] {
  if (!pagos.length) return []
  const prog = new Map<string, number>()
  const pag = new Map<string, number>()
  for (const p of pagos) {
    const k = lunesDe(p.fecha)
    prog.set(k, (prog.get(k) ?? 0) + p.monto)
    if (p.pagado) pag.set(k, (pag.get(k) ?? 0) + p.monto)
  }
  const claves = [...prog.keys()].sort()
  const semanas: Semana[] = []
  let acumulado = 0, acumulado_pagado = 0
  for (let k = claves[0]; k <= claves[claves.length - 1]; k = masDias(k, 7)) {
    const programado = prog.get(k) ?? 0
    const pagado = pag.get(k) ?? 0
    acumulado += programado
    acumulado_pagado += pagado
    semanas.push({ inicio: k, programado, pagado, acumulado, acumulado_pagado })
  }
  return semanas
}

/** Agrupa los pagos por día y acumula. Solo días con movimiento. */
export function flujoPorDia(pagos: Pago[]): DiaFlujo[] {
  const dias = new Map<string, Pago[]>()
  for (const p of pagos) {
    const lista = dias.get(p.fecha)
    if (lista) lista.push(p); else dias.set(p.fecha, [p])
  }
  let acumulado = 0
  return [...dias.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, lista]) => {
      const monto = lista.reduce((s, p) => s + p.monto, 0)
      acumulado += monto
      return { fecha, monto, acumulado, pagos: lista }
    })
}

/** El pico de caja: el día en que más dinero sale. Es el que quiebra aperturas. */
export function semanaPico(flujo: DiaFlujo[]): { fecha: string; monto: number } | null {
  if (!flujo.length) return null
  // Ventana móvil de 7 días naturales sobre el calendario, no sobre los días
  // con movimiento: dos pagos con cinco días vacíos en medio sí caen en la
  // misma semana y hay que juntarlos.
  let mejor = { fecha: flujo[0].fecha, monto: 0 }
  for (let i = 0; i < flujo.length; i++) {
    const corte = masDias(flujo[i].fecha, 6)
    let suma = 0
    for (let j = i; j < flujo.length && flujo[j].fecha <= corte; j++) suma += flujo[j].monto
    if (suma > mejor.monto) mejor = { fecha: flujo[i].fecha, monto: suma }
  }
  return mejor
}

// ── Dinero del proyecto ──────────────────────────────────────────────────────

export interface Presupuesto {
  aprobado: number
  reserva: number
  ejecutable: number
  comprometido: number
  /** Comprometido que todavía es una estimación, no un precio en firme. */
  estimado: number
  pagado: number
  por_pagar: number
  /** Ejecutable − comprometido. Negativo = sobregiro. */
  disponible: number
  /** 0–1 del ejecutable. */
  consumo: number
}

export function presupuestoDe(
  proyecto: Proyecto, partidas: Partida[], pagos: Pago[],
): Presupuesto {
  const comprometido = partidas.reduce((s, p) => s + montoDe(p), 0)
  const estimado = partidas.filter(p => p.estimado).reduce((s, p) => s + montoDe(p), 0)
  const pagado = pagos.filter(p => p.pagado).reduce((s, p) => s + p.monto, 0)
  const ejecutable = presupuestoEjecutable(proyecto)
  return {
    aprobado: proyecto.presupuesto_aprobado,
    reserva: proyecto.presupuesto_aprobado - ejecutable,
    ejecutable,
    comprometido,
    estimado,
    pagado,
    por_pagar: pagos.filter(p => !p.pagado).reduce((s, p) => s + p.monto, 0),
    disponible: ejecutable - comprometido,
    consumo: ejecutable > 0 ? comprometido / ejecutable : 0,
  }
}

/**
 * Avance físico ponderado por monto.
 *
 * Contar partidas por igual miente: "18 de 24 listas" suena bien aunque falte
 * la cocina, que es la mitad del presupuesto. Ponderar por dinero es la
 * aproximación honesta a cuánta obra hay hecha.
 */
export function avanceDe(partidas: Partida[]): number {
  const total = partidas.reduce((s, p) => s + montoDe(p), 0)
  if (total <= 0) {
    if (!partidas.length) return 0
    return partidas.reduce((s, p) => s + p.avance, 0) / partidas.length / 100
  }
  return partidas.reduce((s, p) => s + montoDe(p) * Math.min(100, Math.max(0, p.avance)), 0) / total / 100
}

/**
 * Avance que DEBERÍA llevarse hoy, ponderado por monto.
 *
 * Para cada partida, la fracción transcurrida de su ventana: si empezó hace 3
 * días y dura 6, debería ir al 50%. Es la única vara honesta para decir
 * "atrasado": comparar el avance real contra el calendario, no contra un deseo.
 */
export function avancePlaneado(partidas: Partida[], crono: Cronograma, hoy: string): number {
  const total = partidas.reduce((s, p) => s + montoDe(p), 0)
  if (total <= 0) return 0
  let acumulado = 0
  for (const p of partidas) {
    const monto = montoDe(p)
    if (monto <= 0) continue
    acumulado += monto * fraccionPlaneada(p, crono, hoy)
  }
  return acumulado / total
}

/** Fracción de la ventana de una partida ya transcurrida al día `hoy` (0–1). */
export function fraccionPlaneada(p: Partida, crono: Cronograma, hoy: string): number {
  const b = crono.barras.get(p.id)
  if (!b) return 0
  if (hoy < b.fecha_inicio) return 0
  if (b.duracion <= 0) return 1
  if (hoy > b.fecha_fin) return 1
  // +1 porque el día de inicio ya es un día trabajado.
  return Math.min(1, (diasEntre(b.fecha_inicio, hoy) + 1) / b.duracion)
}

/** Partidas que esperan a esta. El "bloquea a" del panel de detalle. */
export function sucesoresDe(id: string, partidas: Partida[]): Partida[] {
  return partidas.filter(p => p.depende_de.includes(id) && p.id !== id)
}

/** Avance por fase, ponderado por monto, con su dinero. */
export interface Fase { nombre: string; monto: number; avance: number; partidas: number }

export function fasesDe(partidas: Partida[]): Fase[] {
  const mapa = new Map<string, Partida[]>()
  for (const p of partidas) {
    const lista = mapa.get(p.fase)
    if (lista) lista.push(p); else mapa.set(p.fase, [p])
  }
  return [...mapa.entries()].map(([nombre, ps]) => ({
    nombre,
    monto: ps.reduce((s, p) => s + montoDe(p), 0),
    avance: avanceDe(ps),
    partidas: ps.length,
  })).sort((a, b) => b.monto - a.monto)
}

// ── Alertas ──────────────────────────────────────────────────────────────────

export type Gravedad = 'roja' | 'ambar'

export interface Alerta {
  id: string
  gravedad: Gravedad
  titulo: string
  detalle: string
  partida_id?: string
}

/**
 * Lo que hay que ver sin buscarlo.
 *
 * El criterio para que algo entre aquí: que sea accionable hoy. Una alerta que
 * no cambia lo que haces en la mañana solo entrena a la gente a ignorarlas.
 */
export function alertasDe(
  proyecto: Proyecto, partidas: Partida[], crono: Cronograma,
  pres: Presupuesto, hoy: string,
): Alerta[] {
  const alertas: Alerta[] = []
  const porId = new Map(partidas.map(p => [p.id, p]))
  const dinero = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

  // 1. Ciclos. Antes que nada: con un ciclo, todo lo demás es ficción.
  if (crono.ciclos.length) {
    alertas.push({
      id: 'ciclo',
      gravedad: 'roja',
      titulo: 'Dependencias circulares',
      detalle: `${crono.ciclos.map(id => porId.get(id)?.nombre ?? id).join(', ')} se esperan entre sí. El cronograma no puede resolverlas; quita una dependencia.`,
    })
  }

  // 2. La fecha de apertura.
  if (crono.colchon < 0) {
    alertas.push({
      id: 'fecha',
      gravedad: 'roja',
      titulo: `La apertura se pasa ${Math.abs(crono.colchon)} día${Math.abs(crono.colchon) === 1 ? '' : 's'}`,
      detalle: `Con las duraciones de hoy se termina el ${crono.fin} y la meta es el ${proyecto.meta_apertura}. Solo acortar la ruta crítica mueve esta fecha.`,
    })
  } else if (crono.colchon <= 3 && crono.duracion_apertura > 0) {
    alertas.push({
      id: 'fecha',
      gravedad: 'ambar',
      titulo: crono.colchon === 1 ? 'Queda 1 día de colchón' : `Quedan ${crono.colchon} días de colchón`,
      detalle: 'Cualquier retraso en la ruta crítica se come la fecha de apertura.',
    })
  }

  // 3. El presupuesto.
  if (pres.disponible < 0) {
    alertas.push({
      id: 'presupuesto',
      gravedad: 'roja',
      titulo: `Sobregiro de ${dinero(-pres.disponible)}`,
      detalle: `Comprometido ${dinero(pres.comprometido)} contra ${dinero(pres.ejecutable)} ejecutables. La reserva de ${dinero(pres.reserva)} es para imprevistos, no para cubrir esto.`,
    })
  } else if (pres.consumo >= 0.9) {
    alertas.push({
      id: 'presupuesto',
      gravedad: 'ambar',
      titulo: `${Math.round(pres.consumo * 100)}% del presupuesto ejecutable comprometido`,
      detalle: `Quedan ${dinero(pres.disponible)} para todo lo que falte capturar.`,
    })
  }

  // 4. Estimados. El número que decide si el presupuesto es real o un deseo.
  if (pres.comprometido > 0 && pres.estimado / pres.comprometido >= 0.3) {
    alertas.push({
      id: 'estimados',
      gravedad: 'ambar',
      titulo: `${Math.round(pres.estimado / pres.comprometido * 100)}% del presupuesto sigue estimado`,
      detalle: `${dinero(pres.estimado)} sin cotización en firme. Es el dinero que todavía puede crecer.`,
    })
  }

  // 5. Atrasos: la partida debió terminar y no está al 100.
  for (const p of partidas) {
    const b = crono.barras.get(p.id)
    if (!b || p.avance >= 100) continue
    if (b.fecha_fin < hoy) {
      const dias = diasEntre(b.fecha_fin, hoy)
      alertas.push({
        id: `atraso:${p.id}`,
        gravedad: b.critica ? 'roja' : 'ambar',
        titulo: `${p.nombre} lleva ${dias} día${dias === 1 ? '' : 's'} de retraso`,
        detalle: b.critica
          ? 'Está en la ruta crítica: cada día de retraso es un día menos de apertura.'
          : `Tiene ${b.holgura} día${b.holgura === 1 ? '' : 's'} de holgura antes de tocar la fecha.`,
        partida_id: p.id,
      })
    }
  }

  // 6. Partida crítica sin proveedor. Ya empezó su ventana y no hay a quién
  //    llamar: es el atraso de la semana entrante, visible hoy.
  for (const p of partidas) {
    const b = crono.barras.get(p.id)
    if (!b || !b.critica || p.proveedor_id || p.tipo === 'tarea') continue
    if (b.fecha_inicio <= masDias(hoy, 7)) {
      alertas.push({
        id: `sinprov:${p.id}`,
        gravedad: 'ambar',
        titulo: `${p.nombre} no tiene proveedor`,
        detalle: `Es crítica y arranca el ${b.fecha_inicio}. Sin proveedor asignado no hay quién la ejecute.`,
        partida_id: p.id,
      })
    }
  }

  return alertas.sort((a, b) => (a.gravedad === b.gravedad ? 0 : a.gravedad === 'roja' ? -1 : 1))
}

// ── Todo junto ───────────────────────────────────────────────────────────────

export interface Tablero {
  crono: Cronograma
  pagos: Pago[]
  flujo: DiaFlujo[]
  semanas: Semana[]
  pico: { fecha: string; monto: number } | null
  presupuesto: Presupuesto
  avance: number
  planeado: number
  /** Pagado / comprometido. */
  financiero: number
  fases: Fase[]
  alertas: Alerta[]
}

/** Una sola llamada: lo que necesita cualquier pantalla del módulo. */
export function calcular(
  proyecto: Proyecto, partidas: Partida[], proveedores: Proveedor[], hoy: string,
): Tablero {
  const crono = programar(proyecto, partidas)
  const pagos = pagosDe(partidas, crono, proveedores)
  const flujo = flujoPorDia(pagos)
  const presupuesto = presupuestoDe(proyecto, partidas, pagos)
  return {
    crono, pagos, flujo,
    semanas: flujoPorSemana(pagos),
    pico: semanaPico(flujo),
    presupuesto,
    avance: avanceDe(partidas),
    planeado: avancePlaneado(partidas, crono, hoy),
    financiero: presupuesto.comprometido > 0 ? presupuesto.pagado / presupuesto.comprometido : 0,
    fases: fasesDe(partidas),
    alertas: alertasDe(proyecto, partidas, crono, presupuesto, hoy),
  }
}
