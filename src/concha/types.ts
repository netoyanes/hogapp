// Doña Concha · POS — modelo de datos del lado de la tablet.
//
// La tablet es la fuente de verdad mientras no hay internet: aquí vive la
// configuración (copia local de Supabase) y las órdenes del día. Cada orden
// se sube a Supabase cuando hay red (tablas concha_* en
// supabase/seeds/concha_pos.sql); los nombres de campo son los mismos en
// camelCase.
//
// Dinero: SIEMPRE en centavos enteros (13000 = $130.00).
// Fechas: 'YYYY-MM-DD' en hora de Mazatlán. Horas: 'HH:MM' de 24 h.

export type TipoPlatillo = 'guiso' | 'guarnicion' | 'agua' | 'extra'
export type Vigencia = 'semana' | 'dia' | 'rango'
export type Servicio = 'aqui' | 'llevar' | 'domicilio'
export type Canal = 'mostrador' | 'telefono'
export type EstadoOrden = 'abierta' | 'cobrada' | 'cancelada'
export type TipoDescuento = 'convenio' | 'codigo' | 'cliente_frecuente' | 'sin_cobro'
export type FormaPago = 'efectivo' | 'tarjeta'

export interface Config {
  metaDiaria: number
  sellosParaGratis: number
  fondoCajaSugerido: number
  /** A domicilio existe en el modelo pero se activa aquí */
  servicios: Record<Servicio, boolean>
  /** Pendiente del negocio: null = no decidido */
  preciosIncluyenIva: boolean | null
}

export interface Turno {
  id: string
  nombre: string            // Comida, Brunch, Desayuno
  dias: number[]            // 0 = domingo … 6 = sábado
  inicio: string            // '12:00'
  fin: string               // '16:30'
  precioBase: number        // centavos — la comida completa
  /** Pendiente para brunch: null = no decidido (no suma sello) */
  sumaSello: boolean | null
  activo: boolean
}

export interface Platillo {
  id: string
  nombre: string
  tipo: TipoPlatillo
  /** null = usa el precio base del turno (guisos). En extras, null = precio pendiente: no se vende */
  precio: number | null
  costoIngredientes: number | null
  activo: boolean
}

/** Vigencia de un platillo en el menú. Mover = cambiar fechas; copiar = otro registro. */
export interface MenuItem {
  id: string
  platilloId: string
  turnoId: string
  vigencia: Vigencia
  desde: string
  hasta: string
  /** Porciones por día (solo guisos). null = sin límite */
  porciones: number | null
  orden: number
}

/** Existencias por fecha + platillo */
export interface Existencia {
  fecha: string
  platilloId: string
  vendidas: number
  agotadoManual: boolean
}

export interface Colaboracion {
  id: string
  chef: string
  platilloId: string
  desde: string
  hasta: string
  precio: number
  costoIngredientes: number
  repartoPct: number        // 50
  diasConReparto: number    // 7 = la primera semana
  /** Tope de órdenes por día (opcional); `topes` lo sobreescribe por fecha */
  topeDia: number | null
  topes: Record<string, number>
  activo: boolean
}

export interface Descuento {
  id: string
  nombre: string            // Grupo Petroil
  etiqueta: string          // Petroil 10% (lo que dice el chip)
  tipo: TipoDescuento
  codigo: string | null     // solo tipo 'codigo'
  porcentaje: number        // 10, 100…
  motivo: string | null     // sin cobro: cortesía, personal, bruma
  requiereCredencial: boolean
  desde: string | null
  hasta: string | null
  /** Pendiente del negocio. null = sin decidir (se aplica como en el diseño) */
  aplicaAColaboracion: boolean | null
  activo: boolean
}

export interface Renglon {
  id: string
  tipo: 'comida' | 'extra'
  platilloId: string
  nombre: string
  guarniciones: { id: string; nombre: string }[]
  agua: { id: string; nombre: string } | null
  cantidad: number
  /** Copia al momento de vender */
  precioUnit: number
  costoUnit: number | null
  colaboracionId: string | null
}

export interface Pago {
  id: string
  forma: FormaPago
  monto: number
  recibido: number | null
  cambio: number | null
  propina: number
  referencia: string | null
}

export interface DescuentoAplicado {
  id: string
  nombre: string
  tipo: TipoDescuento
  porcentaje: number
  motivo: string | null
}

export interface Orden {
  id: string
  dispositivo: string
  fecha: string
  folio: number | null      // se asigna al cobrar
  creadaEn: string
  cobradaEn: string | null
  turnoId: string | null
  servicio: Servicio
  canal: Canal
  nombreCliente: string | null
  telefono: string | null
  /** Listo para cuando se active domicilio */
  direccion: string | null
  costoEnvio: number
  estado: EstadoOrden
  renglones: Renglon[]
  descuento: DescuentoAplicado | null
  codigoCapturado: string | null
  subtotal: number
  descuentoMonto: number
  total: number
  sinCobro: boolean
  /** Sin cobro: valor a precio de lista, como costo */
  costoSinCobro: number
  /** Sellos que suma la orden (comidas completas) */
  sellos: number
  /** Número de sello en la tarjeta física, si se marcó */
  selloNumero: number | null
  pagos: Pago[]
  cajero: string | null
  /** Usuario de quien cobró, legible en reportes */
  cajeroUsuario: string | null
  sincronizada: boolean
}

/**
 * Alguien que ya entró a la caja con internet en este dispositivo. Se guarda
 * una huella de su contraseña (PBKDF2 con sal) para reconocerlo sin red; la
 * contraseña nunca se guarda.
 */
export interface CajeroLocal {
  usuario: string
  nombre: string
  userId: string
  sal: string
  huella: string
}

/** Quién está cobrando ahora en este dispositivo */
export interface SesionCaja {
  usuario: string
  nombre: string
  userId: string
  desde: string
}

export interface Catalogo {
  config: Config
  turnos: Turno[]
  platillos: Platillo[]
  menu: MenuItem[]
  colaboraciones: Colaboracion[]
  descuentos: Descuento[]
}

export interface Gasto {
  id: string
  fecha: string
  concepto: string
  monto: number
  registradoPor: string | null
  creadoEn: string
  sincronizado: boolean
}

export interface FilaDesglose {
  clave: string
  nombre: string
  cantidad: number      // platillos u órdenes, según el desglose
  monto: number
  extra?: number        // p. ej. lo que le toca al chef
}

export interface Desglose {
  porGuiso: FilaDesglose[]
  porDescuento: FilaDesglose[]
  sinCobro: FilaDesglose[]
  colaboraciones: FilaDesglose[]
}

export interface Corte {
  id: string
  fecha: string
  fondo: number
  ventaTotal: number
  efectivo: number
  tarjeta: number
  /** Propinas: no son venta; se liquidan cada semana */
  propinas: number
  propinasEfectivo: number
  propinasTarjeta: number
  gastos: number
  sinCobroCosto: number
  /** fondo + ventas en efectivo + propinas en efectivo − gastos */
  efectivoAEntregar: number
  efectivoContado: number | null
  diferencia: number | null
  ordenes: number
  comidas: number
  ticketPromedio: number
  meta: number
  desglose: Desglose
  notas: string | null
  cerradoPor: string | null
  cerradoEn: string
  sincronizado: boolean
}
