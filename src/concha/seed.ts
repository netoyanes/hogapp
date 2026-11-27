// Datos de ejemplo — el menú del diseño de Figma, puesto en la semana actual.
// Solo se usan la primera vez que la tablet abre el POS (o al reiniciar la demo);
// después todo se cambia desde la app y se sincroniza con Supabase.
import type { Catalogo, MenuItem } from './types'
import { lunesDe, sumarDias } from './logic'

export function catalogoDemo(hoy: string): Catalogo {
  const lun = lunesDe(hoy)
  const vie = sumarDias(lun, 4)
  let n = 0
  const mi = (platilloId: string, vigencia: MenuItem['vigencia'], desde: string, hasta: string, porciones: number | null): MenuItem =>
    ({ id: `m${++n}`, platilloId, turnoId: 'comida', vigencia, desde, hasta, porciones, orden: n })

  return {
    config: {
      metaDiaria: 40,
      sellosParaGratis: 10,
      fondoCajaSugerido: 50000,
      servicios: { aqui: true, llevar: true, domicilio: false },
      preciosIncluyenIva: null,
    },
    turnos: [
      { id: 'comida', nombre: 'Comida', dias: [1, 2, 3, 4, 5], inicio: '12:00', fin: '16:30', precioBase: 13000, sumaSello: true, activo: true },
      // Brunch: precio y sello pendientes del negocio → precio 0 hasta que se defina
      { id: 'brunch', nombre: 'Brunch', dias: [6], inicio: '09:30', fin: '15:00', precioBase: 0, sumaSello: null, activo: true },
    ],
    platillos: [
      { id: 'chicharron', nombre: 'Chicharrón a la mexicana', tipo: 'guiso', precio: null, costoIngredientes: null, activo: true },
      { id: 'fajitas', nombre: 'Fajitas de pollo', tipo: 'guiso', precio: null, costoIngredientes: null, activo: true },
      { id: 'albondigas', nombre: 'Albóndigas', tipo: 'guiso', precio: null, costoIngredientes: null, activo: true },
      { id: 'marlin', nombre: 'Marlín ranchero', tipo: 'guiso', precio: null, costoIngredientes: null, activo: true },
      { id: 'especial', nombre: 'Especial del chef', tipo: 'guiso', precio: null, costoIngredientes: null, activo: true },
      { id: 'colache', nombre: 'Colache de calabaza', tipo: 'guiso', precio: null, costoIngredientes: null, activo: true },
      { id: 'arroz', nombre: 'Arroz rojo', tipo: 'guarnicion', precio: null, costoIngredientes: null, activo: true },
      { id: 'frijoles', nombre: 'Frijoles', tipo: 'guarnicion', precio: null, costoIngredientes: null, activo: true },
      { id: 'fideo', nombre: 'Sopa de fideo', tipo: 'guarnicion', precio: null, costoIngredientes: null, activo: true },
      { id: 'verduras', nombre: 'Verduras al vapor', tipo: 'guarnicion', precio: null, costoIngredientes: null, activo: true },
      { id: 'jamaica', nombre: 'Jamaica', tipo: 'agua', precio: null, costoIngredientes: null, activo: true },
      { id: 'horchata', nombre: 'Horchata', tipo: 'agua', precio: null, costoIngredientes: null, activo: true },
      // Extras: precios PENDIENTES del negocio (null = no se pueden vender aún)
      { id: 'medio-litro', nombre: 'Medio litro de guiso', tipo: 'extra', precio: null, costoIngredientes: null, activo: true },
      { id: 'litro', nombre: 'Litro de guiso', tipo: 'extra', precio: null, costoIngredientes: null, activo: true },
      { id: 'arroz-extra', nombre: 'Arroz extra', tipo: 'extra', precio: null, costoIngredientes: null, activo: true },
      { id: 'agua-extra', nombre: 'Agua extra', tipo: 'extra', precio: null, costoIngredientes: null, activo: true },
    ],
    menu: [
      mi('chicharron', 'dia', hoy, hoy, 12),
      mi('fajitas', 'dia', hoy, hoy, 9),
      mi('albondigas', 'semana', lun, vie, 15),
      mi('marlin', 'semana', lun, vie, 6),
      mi('especial', 'rango', lun, sumarDias(lun, 11), 20),
      mi('colache', 'dia', hoy, hoy, 0),
      mi('arroz', 'semana', lun, vie, null),
      mi('frijoles', 'semana', lun, vie, null),
      mi('fideo', 'semana', lun, vie, null),
      mi('verduras', 'semana', lun, vie, null),
      mi('jamaica', 'semana', lun, vie, null),
      mi('horchata', 'semana', lun, vie, null),
      mi('medio-litro', 'semana', lun, vie, null),
      mi('litro', 'semana', lun, vie, null),
      mi('arroz-extra', 'semana', lun, vie, null),
      mi('agua-extra', 'semana', lun, vie, null),
    ],
    colaboraciones: [
      {
        id: 'colab-demo', chef: 'Chef invitado (ejemplo)', platilloId: 'especial',
        desde: lun, hasta: sumarDias(lun, 11), precio: 15000, costoIngredientes: 6000,
        repartoPct: 50, diasConReparto: 7, topeDia: null, topes: {}, activo: true,
      },
    ],
    descuentos: [
      { id: 'petroil', nombre: 'Grupo Petroil', etiqueta: 'Petroil 10%', tipo: 'convenio', codigo: null, porcentaje: 10, motivo: null, requiereCredencial: true, desde: null, hasta: null, aplicaAColaboracion: null, activo: true },
      { id: 'cfe', nombre: 'CFE', etiqueta: 'CFE 10%', tipo: 'convenio', codigo: null, porcentaje: 10, motivo: null, requiereCredencial: true, desde: null, hasta: null, aplicaAColaboracion: null, activo: true },
      { id: 'judicial', nombre: 'Poder Judicial', etiqueta: 'Poder Judicial 10%', tipo: 'convenio', codigo: null, porcentaje: 10, motivo: null, requiereCredencial: true, desde: null, hasta: null, aplicaAColaboracion: null, activo: true },
      { id: 'cma', nombre: 'CMA', etiqueta: 'CMA 10%', tipo: 'convenio', codigo: null, porcentaje: 10, motivo: null, requiereCredencial: true, desde: null, hasta: null, aplicaAColaboracion: null, activo: true },
      { id: 'frecuente', nombre: 'Cliente frecuente', etiqueta: 'Cliente frecuente', tipo: 'cliente_frecuente', codigo: null, porcentaje: 100, motivo: 'cliente frecuente', requiereCredencial: false, desde: null, hasta: null, aplicaAColaboracion: null, activo: true },
      { id: 'cortesia', nombre: 'Cortesía', etiqueta: 'Cortesía', tipo: 'sin_cobro', codigo: null, porcentaje: 100, motivo: 'cortesía', requiereCredencial: false, desde: null, hasta: null, aplicaAColaboracion: null, activo: true },
      { id: 'personal', nombre: 'Comida de personal', etiqueta: 'Personal', tipo: 'sin_cobro', codigo: null, porcentaje: 100, motivo: 'personal', requiereCredencial: false, desde: null, hasta: null, aplicaAColaboracion: null, activo: true },
      { id: 'bruma', nombre: 'Bruma', etiqueta: 'Bruma', tipo: 'sin_cobro', codigo: null, porcentaje: 100, motivo: 'bruma', requiereCredencial: false, desde: null, hasta: null, aplicaAColaboracion: null, activo: true },
    ],
  }
}
