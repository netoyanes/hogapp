// ─────────────────────────────────────────────────────────────────────────────
// Ronqueo · english version of the landing and confirmation copy.
//
// Same shape as contenido.ts (TypeScript checks it in idioma.tsx: if a text is
// missing here, the build fails). Lowercase, like the brand. Spanish stays the
// default; this file only shows when someone taps «EN» or opens ?lang=en.
//
// [bracketed] texts are PLACEHOLDERS, same as in contenido.ts — update both.
// ─────────────────────────────────────────────────────────────────────────────
import { EVENTO as EVENTO_ES, FOTOS as FOTOS_ES, type Resp } from './contenido'

export type { Resp, FotoId } from './contenido'

export const EVENTO = {
  ...EVENTO_ES,
  calendario: {
    ...EVENTO_ES.calendario,
    titulo: 'all you can eat · ronqueo edition · bruma records',
    descripcion: 'doors 6:00 pm · ronqueo 7:30 pm · all you can eat 8:00 – 9:00 pm. come early, really.',
  },
}

export const NAV = {
  links: [
    { texto: 'the night', href: '#la-noche' },
    { texto: 'the menu', href: '#cortes' },
    { texto: 'the dj', href: '#dj' },
    { texto: 'who', href: '#quien' },
    { texto: 'ticket', href: '#boleto' },
  ],
  cta: 'get your ticket',
}

export const HERO = {
  pill: { d: 'fri nov 20 · bruma records · mzt', m: 'fri nov 20 · mzt' } as Resp,
  titulo: ['all you can eat.', 'ronqueo edition.'],
  bajada: {
    d: 'a whole tuna broken down live in front of you and served in every cut, no limits. one night, 50 seats.',
    m: 'a whole tuna broken down live in front of you and served in every cut, no limits. 50 seats.',
  } as Resp,
  ctaPrincipal: 'get your ticket · $1,500',
  ctaSecundario: 'see the night',
  sello: ['all you can eat', 'ronqueo edition'],
  fotoAlt: 'a whole tuna on the board, with the knife ready for the ronqueo',
}

export const DATOS: { etiqueta: string; valor: Resp }[] = [
  { etiqueta: 'when', valor: { d: 'friday nov 20', m: 'fri nov 20' } },
  { etiqueta: 'doors', valor: '6:00 pm' },
  { etiqueta: 'ronqueo', valor: '7:30 pm' },
  { etiqueta: 'where', valor: 'bruma records · mzt' },
  { etiqueta: 'seats', valor: '50' },
]

export const FOTOS: typeof FOTOS_ES = {
  samu: { ...FOTOS_ES.samu, alt: 'chef samu breaking down the tuna at the table' },
  atun: { ...FOTOS_ES.atun, alt: 'hands on a whole tuna, opened for the ronqueo' },
  cuchillos: { ...FOTOS_ES.cuchillos, alt: 'the ronqueo knives on the work table' },
  djRetrato: { ...FOTOS_ES.djRetrato, alt: 'red pig flower, black and white portrait with a crown' },
  djRojo: { ...FOTOS_ES.djRojo, alt: 'red pig flower dancing under red light' },
}

export const LA_NOCHE = {
  titulo: ['the night,', 'in three cuts.'],
  indice: '01 · 02 · 03',
  momentos: [
    {
      id: undefined as string | undefined,
      num: '01',
      titulo: 'the ronqueo',
      texto: {
        d: 'chef samu presents the whole fish and breaks it down in front of you. what each cut is, where it comes from and why it tastes different.',
        m: 'chef samu breaks down the whole fish in front of you and explains each cut.',
      } as Resp,
      foto: 'samu' as const,
    },
    {
      id: 'cortes',
      num: '02',
      titulo: 'every cut',
      texto: {
        d: 'each part of the tuna prepared in a different style. [cuts and preparations tbd with the kitchen]',
        m: 'each part of the tuna in a different style. [cuts tbd with the kitchen]',
      } as Resp,
      foto: 'atun' as const,
    },
    {
      id: undefined,
      num: '03',
      titulo: 'no limits',
      texto: {
        d: 'all you can eat tasting from 8:00 to 9:00 pm. then the bar takes over the night and the music keeps going.',
        m: 'all you can eat from 8:00 to 9:00 pm. then, bar and music.',
      } as Resp,
      foto: 'cuchillos' as const,
    },
  ],
}

export const ITINERARIO = {
  titulo: { d: 'how the night runs.', m: 'how the night\nruns.' } as Resp,
  horario: [
    { hora: '6:00 pm', que: 'doors and welcome drink', detalle: 'welcome drink for anyone arriving between 6:00 and 7:00. live music.' },
    { hora: '7:30 pm', que: 'the ronqueo begins', detalle: 'chef samu opens the fish and explains each cut.' },
    { hora: '8:00 – 9:00', que: 'all you can eat', detalle: 'every cut, prepared on the spot, no limits.' },
    { hora: '9:00 pm →', que: 'the bar and the booth', detalle: 'arinka at the bar with a cocktail made for the tuna. red pig flower in the booth.' },
  ],
}

export const DJ = {
  pill: 'dj set · all night',
  etiqueta: 'in the booth',
  nombre: 'red pig flower.',
  texto: 'plays through dinner service and stays in the booth after the kitchen closes.' as Resp,
  horario: 'during service · 9:00 pm →',
  bio: [
    'seoul-born artist whose path has taken her through tokyo, london and berlin; today she lives in brussels.',
    'she brings her own twist to contemporary techno: she has played clubs around the world, has been releasing her productions for a decade and co-founded the sound of vast label.',
    'she also makes digital art, shown at the ncca in moscow, goldsmiths in london and the asia culture centre in gwangju.',
  ],
  datos: ['techno', 'seoul → brussels', 'sound of vast'],
  links: [
    { texto: '@redpigflower', href: 'https://instagram.com/redpigflower', etiqueta: 'red pig flower on instagram' },
    { texto: 'redpigflower.com', href: 'https://redpigflower.com', etiqueta: 'red pig flower website' },
  ],
}

export const QUIEN = {
  titulo: { d: "who's behind it.", m: "who's behind\nit." } as Resp,
  fichas: [
    { rol: 'in the kitchen', nombre: 'chef samu', texto: { d: 'oyster club. runs the ronqueo from start to finish.', m: 'oyster club' } as Resp },
    { rol: 'in the booth', nombre: 'red pig flower', texto: { d: 'seoul-born techno dj, now in brussels. plays through service and stays when the kitchen closes.', m: 'techno · seoul → brussels' } as Resp },
    { rol: 'at the bar', nombre: 'arinka', texto: { d: 'head bartender at bruma records. serves a cocktail made for the tuna.', m: 'head bartender at bruma records' } as Resp },
  ],
}

export const BOLETO = {
  pill: 'presale · only 50 seats',
  precio: '$1,500',
  porPersona: 'per person',
  destacado: 'all you can eat · no limits',
  incluye: [
    { d: 'entry and welcome drink', m: 'entry and welcome drink' },
    { d: 'the live ronqueo and an explanation of each cut', m: 'the live ronqueo' },
    { d: 'all you can eat tasting', m: 'all you can eat tasting' },
    { d: 'live music all night', m: 'live music' },
  ] as Resp[],
  compra: {
    titulo: 'get your ticket',
    lugares: 'seats',
    total: 'total',
    campos: {
      nombre: 'name for the guest list',
      correo: 'email (your code goes here)',
      whatsapp: 'whatsapp',
    },
    pagar: 'pay',
    legal: 'secure payment with stripe · credit or debit card · your BOLETO code arrives by email instantly.',
    agotado: 'sold out',
    cargando: 'opening stripe…',
    cancelado: "the payment didn't go through. your seats are held for a little while; you can try again.",
  },
  nota: {
    d: 'tables are assigned in order of purchase. groups under four may share a table with other guests. [refund policy tbd]',
    m: 'tables by order of purchase. groups under four may share a table. [refund policy tbd]',
  } as Resp,
}

export const PREGUNTAS = {
  titulo: { d: 'what people ask.', m: 'what people\nask.' } as Resp,
  lista: [
    { p: { d: "what's a ronqueo?", m: "what's a ronqueo?" }, r: { d: 'the live breakdown of a whole tuna, from the full fish to the plate.', m: 'the live breakdown of a whole tuna, from the full fish to the plate.' } },
    { p: { d: 'does the ticket include drinks?', m: 'drinks included?' }, r: { d: 'it includes a welcome drink for anyone arriving between 6:00 and 7:00 pm. the bar stays open all night.', m: 'a welcome drink from 6:00 to 7:00 pm. the bar stays open all night.' } },
    { p: { d: 'can i arrive after 7:30?', m: 'can i arrive late?' }, r: { d: 'yes, but the ronqueo starts on time. come early, really.', m: 'yes, but the ronqueo starts on time. come early, really.' } },
    { p: { d: 'is there a non-fish option?', m: 'is there a non-fish option?' }, r: { d: '[tbd with the kitchen]', m: '[tbd with the kitchen]' } },
  ] as { p: Resp; r: Resp }[],
}

export const CIERRE = {
  titulo: { d: '50 seats.\none could be yours.', m: '50 seats.\none could\nbe yours.' } as Resp,
  cta: 'get your ticket · $1,500',
}

export const FOOTER = {
  lineas: [
    'bruma records · café-bar & music',
    'niños héroes 1511, col. centro · mazatlán, sinaloa',
    '@bruma_rec · #ronqueobruma',
  ],
}

export const BARRA_MOVIL = {
  precio: '$1,500',
  cta: 'get your ticket',
}

export const CONFIRMACION = {
  etiqueta: 'payment confirmed',
  titulo: (nombre: string) => [`done, ${nombre}.`, 'your seat has a name.'],
  tuCodigo: 'your code',
  detalle: (lugares: number, total: string) => `${lugares} ${lugares === 1 ? 'seat' : 'seats'} · ${total} mxn`,
  fecha: 'friday nov 20 · doors 6:00 pm',
  lugar: 'bruma records · mazatlán',
  correo: (correo: string) => `we sent your code and receipt to ${correo}. show it at the door, on your phone or as a screenshot.`,
  calendario: 'add to calendar',
  compartir: "share with who's coming",
  compartirTexto: (codigo: string) => `i'm going to all you can eat · ronqueo edition at bruma records, fri nov 20, 6:00 pm. my code: ${codigo}. get yours:`,
  cierre: 'come early, really.',
  procesando: "we're confirming your payment with stripe. this takes a few seconds…",
  noEncontrado: "we couldn't find this payment. if you were charged, message us and we'll sort it out.",
}

export const UI = {
  idioma: { boton: 'ES', aria: 'versión en español', lang: 'es' },
  tituloDoc: 'all you can eat · ronqueo edition · bruma records',
  inicio: 'bruma records · home',
  saltar: 'skip to tickets',
  secciones: 'sections',
  abrirMenu: 'open menu',
  cerrarMenu: 'close menu',
  datosEvento: 'event details',
  enCorto: 'in short',
  nuevaPestana: '(opens in a new tab)',
  boletoSr: 'ticket: ',
  quedan: (r: number, c: number) => `${r} of ${c} seats left`,
  incluye: 'includes',
  cierre: 'closing',
  agotado: 'sold out',
  lugaresN: (n: number) => `${n} seats`,
  lugarN: (n: number) => `${n} ${n === 1 ? 'seat' : 'seats'}`,
  quitarLugar: 'remove a seat',
  agregarLugar: 'add a seat',
  errNombre: 'write the name for the guest list',
  errCorreo: 'check your email: your code goes there',
  errWhatsapp: 'your whatsapp, 10 digits',
  soloQuedan: (n: number) => `only ${n} seats left. adjust the quantity.`,
  errPago: "we couldn't open the payment. try again in a moment.",
  phNombre: 'name on the list',
  phCorreo: 'you@email.com',
  phWhatsapp: '669 000 0000',
  gracias: {
    noEncontradoEt: 'payment not found',
    unMomento: 'one moment',
    regresar: 'back to tickets',
    codigoAria: 'your entry code',
    linkCopiado: 'link copied',
    tituloDoc: (codigo: string) => `${codigo} · ronqueo · bruma records`,
  },
  ics: {
    tuCodigo: (codigo: string) => `your code: ${codigo}.`,
    alarma: 'the ronqueo is today. doors 6:00 pm.',
  },
}
