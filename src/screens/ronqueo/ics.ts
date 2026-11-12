// «agregar al calendario»: genera un .ics con la hora local de Mazatlán.
// Sinaloa dejó el horario de verano en 2022: America/Mazatlan es UTC-7 todo
// el año, así que el VTIMEZONE lleva una sola regla.
import { EVENTO } from './contenido'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

export function descargarIcs(codigo: string) {
  const c = EVENTO.calendario
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bruma Records//Ronqueo//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    `TZID:${c.zona}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0700',
    'TZOFFSETTO:-0700',
    'TZNAME:MST',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${codigo.toLowerCase()}-ronqueo@brumarecords`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${c.zona}:${c.inicio}`,
    `DTEND;TZID=${c.zona}:${c.fin}`,
    `SUMMARY:${esc(c.titulo)}`,
    `LOCATION:${esc(c.lugar)}`,
    `DESCRIPTION:${esc(`tu código: ${codigo}. ${c.descripcion}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc('hoy es el ronqueo. puertas 6:00 pm.')}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'ronqueo-bruma-records.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
