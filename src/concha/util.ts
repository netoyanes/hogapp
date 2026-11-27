// Doña Concha · POS — utilidades compartidas entre la tablet y el celular.
import { useEffect, useState } from 'react'
import type { Catalogo, Orden } from './types'

export function nuevaOrden(fecha: string, turnoId: string | null, dispositivo: string): Orden {
  return {
    id: crypto.randomUUID(), dispositivo, fecha, folio: null,
    creadaEn: new Date().toISOString(), cobradaEn: null, turnoId,
    servicio: 'aqui', canal: 'mostrador', nombreCliente: null, telefono: null,
    direccion: null, costoEnvio: 0, estado: 'abierta', renglones: [],
    descuento: null, codigoCapturado: null, subtotal: 0, descuentoMonto: 0, total: 0,
    sinCobro: false, costoSinCobro: 0, sellos: 0, selloNumero: null, pagos: [],
    cajero: null, sincronizada: false,
  }
}

export function useAhora(ms = 15000) {
  const [t, setT] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setT(new Date()), ms); return () => clearInterval(id) }, [ms])
  return t
}

/** Guarda en caché lo que cargó el POS para abrir sin internet (ver public/sw.js) */
export function usePrecache() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(reg => {
      const urls = ['/concha', ...performance.getEntriesByType('resource').map(e => e.name)]
      reg.active?.postMessage({ type: 'CONCHA_PRECACHE', urls })
    }).catch(() => {})
  }, [])
}

export function useEnLinea() {
  const [on, setOn] = useState(() => navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false)
    window.addEventListener('online', a); window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  return on
}


/** Texto del descuento aplicado, para la línea de totales */
export function textoDescuento(orden: Orden, cat: Catalogo): string | null {
  const d = orden.descuento
  if (!d) return null
  if (d.tipo === 'sin_cobro') return `Sin cobro · ${d.nombre}`
  if (d.tipo === 'cliente_frecuente') return 'Cliente frecuente · comida gratis'
  if (d.tipo === 'codigo') return `Código ${orden.codigoCapturado ?? ''} ${d.porcentaje}%`
  return `Descuento ${cat.descuentos.find(x => x.id === d.id)?.etiqueta ?? d.nombre}`
}
