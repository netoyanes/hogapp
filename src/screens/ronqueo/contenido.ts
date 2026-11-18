// ─────────────────────────────────────────────────────────────────────────────
// Ronqueo · todo el contenido del landing y la confirmación en un solo lugar.
//
// Fuente: Figma «BRUMA RECORDS · Design System» (frames 78:57, 79:93, 80:184,
// 80:230). El copy va en minúsculas tal como está en Figma; no lo «corrijas».
//
// Los textos entre [corchetes] son PLACEHOLDERS del diseño: todavía no tienen
// valor. Cámbialos aquí y en ningún otro lado. Cuando un texto cambia entre
// desktop y mobile, va como { d: desktop, m: mobile }.
//
// OJO: el precio, el cupo y el máximo por compra que COBRA el servidor viven
// en supabase/functions/ronqueo-tickets/index.ts (y el cupo en la base). Los
// de aquí son solo para pintar; si los cambias, cámbialos también allá.
// ─────────────────────────────────────────────────────────────────────────────

export type Resp = string | { d: string; m: string }

export const EVENTO = {
  precio: 1500, // MXN por lugar
  moneda: 'mxn',
  cupo: 50,
  // false: el sitio NO muestra cuántos lugares quedan (solo «50 lugares»).
  // El cupo se sigue controlando igual en el servidor, y si se agota el sitio
  // dice «ya no quedan lugares». Para mostrar el conteo: pon true aquí Y el
  // secret RONQUEO_MOSTRAR_RESTANTES=true en Supabase (si no, el servidor no lo manda).
  mostrarRestantes: false,
  maxPorCompra: 10,
  // Para el .ics de «agregar al calendario» (hora local de Mazatlán)
  calendario: {
    titulo: 'all you can eat · edición ronqueo · bruma records',
    inicio: '20261127T180000', // vie 27 nov 2026, 6:00 pm (puertas) — se movió del 20 al 27
    fin: '20261127T230000', // [hora de cierre por definir] — se asume 11:00 pm
    zona: 'America/Mazatlan',
    lugar: 'bruma records · niños héroes 1511, col. centro, mazatlán, sinaloa',
    descripcion: 'puertas 6:00 pm · ronqueo 7:30 pm · all you can eat 8:00 – 9:00 pm. llega temprano, de verdad.',
  },
}

export const NAV = {
  links: [
    { texto: 'la noche', href: '#la-noche' },
    { texto: 'el menú', href: '#cortes' },
    { texto: 'la música', href: '#musica' },
    { texto: 'quién', href: '#quien' },
    { texto: 'boleto', href: '#boleto' },
  ],
  cta: 'compra tu boleto',
}

export const HERO = {
  pill: { d: 'vie 27 nov · bruma records · mzt', m: 'vie 27 nov · mzt' } as Resp,
  titulo: ['all you can eat.', 'edición ronqueo.'],
  bajada: {
    d: 'un atún completo se despieza en vivo frente a ti y se sirve en todos sus cortes, sin límite, con música en vivo toda la noche. una noche, 50 lugares.',
    m: 'un atún completo se despieza en vivo frente a ti y se sirve en todos sus cortes, sin límite. música en vivo, 50 lugares.',
  } as Resp,
  ctaPrincipal: 'compra tu boleto · $1,500',
  ctaSecundario: 'ver la noche',
  sello: ['all you can eat', 'edición ronqueo'],
  fotoAlt: 'un atún completo sobre la tabla, con el cuchillo listo para el ronqueo',
}

export const DATOS: { etiqueta: string; valor: Resp }[] = [
  { etiqueta: 'cuándo', valor: { d: 'viernes 27 nov', m: 'vie 27 nov' } },
  { etiqueta: 'puertas', valor: '6:00 pm' },
  { etiqueta: 'ronqueo', valor: '7:30 pm' },
  { etiqueta: 'dónde', valor: 'bruma records · mzt' },
  { etiqueta: 'lugares', valor: '50' },
]

// Fotos del evento (public/ronqueo/img, generadas con scripts/ronqueo-fotos.mjs).
// `pos` es el object-position: qué parte de la foto queda a la vista al recortar.
export const FOTOS = {
  samu: { base: 'samu-ronqueo', anchos: [480, 972], alt: 'el chef samu despieza el atún frente a la mesa', pos: 'center 42%' },
  atun: { base: 'atun-manos', anchos: [480, 972], alt: 'manos sobre un atún completo, abierto para el ronqueo', pos: 'center 45%' },
  cuchillos: { base: 'cuchillos', anchos: [480, 954], alt: 'los cuchillos del ronqueo sobre la mesa de trabajo', pos: 'center 40%' },
}
export type FotoId = keyof typeof FOTOS

export const LA_NOCHE = {
  titulo: ['la noche,', 'en tres cortes.'],
  indice: '01 · 02 · 03',
  momentos: [
    {
      id: undefined as string | undefined,
      num: '01',
      titulo: 'el ronqueo',
      texto: {
        d: 'el chef samu presenta la pieza completa y la despieza frente a ti. qué es cada corte, de dónde sale y por qué sabe distinto.',
        m: 'el chef samu despieza la pieza completa frente a ti y explica cada corte.',
      } as Resp,
      foto: 'samu' as FotoId,
    },
    {
      id: 'cortes',
      num: '02',
      titulo: 'todos los cortes',
      texto: {
        d: 'cada parte del atún preparada en un estilo distinto. [cortes y preparaciones por definir con cocina]',
        m: 'cada parte del atún en un estilo distinto. [cortes por definir con cocina]',
      } as Resp,
      foto: 'atun' as FotoId,
    },
    {
      id: undefined,
      num: '03',
      titulo: 'sin límite',
      texto: {
        d: 'degustación all you can eat de 8:00 a 9:00 pm. después la barra toma la noche y la música sigue.',
        m: 'all you can eat de 8:00 a 9:00 pm. después, barra y música.',
      } as Resp,
      foto: 'cuchillos' as FotoId,
    },
  ],
}

export const ITINERARIO = {
  titulo: { d: 'cómo corre la noche.', m: 'cómo corre\nla noche.' } as Resp,
  horario: [
    { hora: '6:00 pm', que: 'puertas y welcome drink', detalle: 'welcome drink para quien llegue entre 6:00 y 7:00. música en vivo.' },
    { hora: '7:30 pm', que: 'empieza el ronqueo', detalle: 'el chef samu abre la pieza y explica cada corte.' },
    { hora: '8:00 – 9:00', que: 'all you can eat', detalle: 'todos los cortes, preparados al momento, sin límite.' },
    { hora: '9:00 pm →', que: 'la barra y la música', detalle: 'arinka en la barra con un coctel pensado para el atún. la música en vivo sigue.' },
  ],
}

// Música en vivo: reemplaza la sección de la DJ (ya no viene). Sin foto ni
// nombre de artista hasta que haya uno confirmado.
export const MUSICA = {
  pill: 'música en vivo · toda la noche',
  titulo: { d: 'la noche suena en vivo.', m: 'la noche suena\nen vivo.' } as Resp,
  texto: 'música en vivo desde que se abren las puertas: acompaña el welcome drink, el ronqueo y el all you can eat, y se queda cuando la cocina cierra.' as Resp,
  momentos: [
    { hora: '6:00 pm', que: 'llegas con welcome drink y música' },
    { hora: '7:30 pm', que: 'el ronqueo, con la noche ya sonando' },
    { hora: '9:00 pm →', que: 'la barra y la música siguen' },
  ],
}

export const QUIEN = {
  titulo: { d: 'quién está detrás.', m: 'quién está\ndetrás.' } as Resp,
  fichas: [
    { rol: 'en cocina', nombre: 'chef samu', texto: { d: 'oyster club. lleva el ronqueo de principio a fin.', m: 'oyster club' } as Resp },
    { rol: 'en la barra', nombre: 'arinka', texto: { d: 'head bartender de bruma records. presenta un coctel para el atún.', m: 'head bartender de bruma records' } as Resp },
  ],
}

export const BOLETO = {
  pill: 'venta general · solo 50 lugares',
  precio: '$1,500',
  porPersona: 'por persona',
  // Se destaca junto al precio: el boleto es all you can eat, sin límite
  destacado: 'all you can eat · sin límite',
  incluye: [
    { d: 'acceso y welcome drink', m: 'acceso y welcome drink' },
    { d: 'el ronqueo en vivo y la explicación de cada corte', m: 'el ronqueo en vivo' },
    { d: 'degustación all you can eat', m: 'degustación all you can eat' },
    { d: 'música en vivo toda la noche', m: 'música en vivo' },
  ] as Resp[],
  compra: {
    titulo: 'compra tu boleto',
    lugares: 'lugares',
    total: 'total',
    campos: {
      nombre: 'nombre para la lista',
      correo: 'correo (aquí llega tu código)',
      whatsapp: 'whatsapp',
    },
    pagar: 'pagar',
    legal: 'pago seguro con stripe · tarjeta de crédito o débito · recibes tu código BOLETO por correo al instante.',
    agotado: 'ya no quedan lugares',
    cargando: 'abriendo stripe…',
    cancelado: 'el pago no se completó. tus lugares siguen disponibles un rato; puedes intentarlo otra vez.',
  },
  nota: {
    d: 'las mesas se asignan por orden de compra. grupos de menos de cuatro pueden compartir mesa con otros invitados. [política de reembolso por definir]',
    m: 'mesas por orden de compra. grupos de menos de cuatro pueden compartir mesa. [política de reembolso por definir]',
  } as Resp,
}

export const PREGUNTAS = {
  titulo: { d: 'lo que nos preguntan.', m: 'lo que nos\npreguntan.' } as Resp,
  lista: [
    { p: { d: '¿qué es un ronqueo?', m: '¿qué es un ronqueo?' }, r: { d: 'el despiece de un atún completo, en vivo, de la pieza entera al plato.', m: 'el despiece de un atún completo, en vivo, de la pieza entera al plato.' } },
    { p: { d: '¿el boleto incluye bebidas?', m: '¿incluye bebidas?' }, r: { d: 'incluye el welcome drink para quien llegue entre 6:00 y 7:00 pm. la barra queda abierta toda la noche.', m: 'el welcome drink de 6:00 a 7:00 pm. la barra queda abierta toda la noche.' } },
    { p: { d: '¿puedo llegar después de las 7:30?', m: '¿puedo llegar tarde?' }, r: { d: 'sí, pero el ronqueo empieza a su hora. llega temprano, de verdad.', m: 'sí, pero el ronqueo empieza a su hora. llega temprano, de verdad.' } },
    { p: { d: '¿hay opción sin pescado?', m: '¿hay opción sin pescado?' }, r: { d: '[por definir con cocina]', m: '[por definir con cocina]' } },
  ] as { p: Resp; r: Resp }[],
}

export const CIERRE = {
  titulo: { d: '50 lugares.\nuno puede ser tuyo.', m: '50 lugares.\nuno puede\nser tuyo.' } as Resp,
  cta: 'compra tu boleto · $1,500',
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
  cta: 'compra tu boleto',
}

export const CONFIRMACION = {
  etiqueta: 'pago confirmado',
  titulo: (nombre: string) => [`listo, ${nombre}.`, 'tu lugar tiene nombre.'],
  tuCodigo: 'tu código',
  detalle: (lugares: number, total: string) => `${lugares} ${lugares === 1 ? 'lugar' : 'lugares'} · ${total} mxn`,
  fecha: 'viernes 27 nov · puertas 6:00 pm',
  lugar: 'bruma records · mazatlán',
  correo: (correo: string) => `te mandamos el código y el recibo a ${correo}. enséñalo en la puerta, desde el teléfono o en captura.`,
  calendario: 'agregar al calendario',
  compartir: 'compartir con quien viene',
  compartirTexto: (codigo: string) => `voy al all you can eat · edición ronqueo de bruma records, vie 27 nov 6:00 pm. mi código: ${codigo}. compra el tuyo:`,
  cierre: 'llega temprano, de verdad.',
  // Estados que no están en Figma (el webhook todavía no llega, o el link es viejo)
  procesando: 'estamos confirmando tu pago con stripe. esto tarda unos segundos…',
  noEncontrado: 'no encontramos este pago. si ya te cobraron, escríbenos y lo resolvemos.',
}

// Textos de interfaz (botones, avisos, etiquetas para lectores de pantalla)
export const UI = {
  idioma: { boton: 'EN', aria: 'english version', lang: 'en' },
  tituloDoc: 'all you can eat · edición ronqueo · bruma records',
  inicio: 'bruma records · inicio',
  saltar: 'ir a comprar boleto',
  secciones: 'secciones',
  abrirMenu: 'abrir menú',
  cerrarMenu: 'cerrar menú',
  datosEvento: 'datos del evento',
  enCorto: 'en corto',
  nuevaPestana: '(se abre en otra pestaña)',
  boletoSr: 'boleto: ',
  quedan: (r: number, c: number) => `quedan ${r} de ${c} lugares`,
  incluye: 'incluye',
  cierre: 'cierre',
  agotado: 'agotado',
  lugaresN: (n: number) => `${n} lugares`,
  lugarN: (n: number) => `${n} ${n === 1 ? 'lugar' : 'lugares'}`,
  quitarLugar: 'quitar un lugar',
  agregarLugar: 'agregar un lugar',
  errNombre: 'escribe el nombre que va en la lista',
  errCorreo: 'revisa tu correo: ahí llega tu código',
  errWhatsapp: 'tu whatsapp a 10 dígitos',
  soloQuedan: (n: number) => `solo quedan ${n} lugares. ajusta la cantidad.`,
  errPago: 'no pudimos abrir el pago. intenta otra vez en un momento.',
  phNombre: 'como te anotamos',
  phCorreo: 'tu@correo.com',
  phWhatsapp: '669 000 0000',
  gracias: {
    noEncontradoEt: 'pago no encontrado',
    unMomento: 'un momento',
    regresar: 'regresar al boleto',
    codigoAria: 'tu código de acceso',
    linkCopiado: 'link copiado',
    tituloDoc: (codigo: string) => `${codigo} · ronqueo · bruma records`,
  },
  ics: {
    tuCodigo: (codigo: string) => `tu código: ${codigo}.`,
    alarma: 'hoy es el ronqueo. puertas 6:00 pm.',
  },
}
