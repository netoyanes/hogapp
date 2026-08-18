export const APP_VERSION = "2.95.0"

export type ChangelogEntry = {
  version: string
  date: string
  type: "MAJOR" | "MINOR" | "PATCH"
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.95.0",
    date: "2026-08-18",
    type: "MINOR",
    changes: [
      "CONCIERGE · HOY rediseñado — arriba va LA SEMANA DEL GRUPO: reservas creadas, reservas vía concierge, comensales nuevos registrados, conversaciones, vistas del landing y no-shows, cada una comparada contra el MISMO CORTE de la semana pasada (lunes→hoy vs lunes→mismo día anterior, para no comparar un martes contra una semana completa)",
      "CONVERSIÓN CHAT→RESERVA de la semana en el encabezado: reservas nacidas en el concierge ÷ conversaciones nuevas — el número que dice si el bot vende o solo platica",
      "FIX del '31441 min': la 1ª respuesta se calculaba sobre conversaciones VIEJAS que recibían un mensaje hoy (una de hace 3 semanas metía 30 mil minutos a la mediana). Ahora solo cuenta conversaciones INICIADAS hoy",
      "Los KPIs de hoy explican su vacío: 'Confirmadas hoy —' ahora dice que no hay reservas para hoy, en vez de un guion mudo",
      "ATIENDE AHORA desahogado: los pendientes con más de 3 días se colapsan en un botón 'Ver N pendientes viejos' — un escalado de hace 16 días es backlog, no urgencia, y enterraba lo que sí es de ahorita",
    ]
  },
  {
    version: "2.94.1",
    date: "2026-08-18",
    type: "PATCH",
    changes: [
      "MENÚ OC — el Brunch Dominical (y el Especial de Sábado) ahora van ENMARCADOS como tarjeta con doble filete y fondo propio: son paquetes cerrados, no parte del menú corrido — antes al llegar a Entradas parecía que el brunch seguía",
      "La nota de la copa de espumoso cierra el marco como pie, con su filete",
      "El botón de idioma pasó a círculo compacto EN/ES — el largo tapaba los banners al flotar",
    ]
  },
  {
    version: "2.94.0",
    date: "2026-08-18",
    type: "MINOR",
    changes: [
      "MENÚ DEL OYSTER (/menu/oc.html) REORDENADO — primero promos y alimentos, bebidas al final: Especial de Sábado y Brunch Dominical arriba, luego conchas, entradas, oysters, especiales, barras, sandwiches, botanas y postres; la carta de bebidas cierra",
      "BRUNCH DOMINICAL cargado y ANUNCIADO: banner visible toda la semana ('Ostiones ilimitados, tostadas, caldo bichi y copa de espumoso') y su sección completa en la carta — ostiones ilimitados en todas sus salsas, tostada a elegir, caldo bichi, shots de cóctel de camarón con ostión, arroz amarillo con almejas, postre a elegir y copa de vino espumoso",
      "MENÚ BILINGÜE — botón EN/ES fijo arriba a la derecha: traduce secciones, grupos, descripciones, banners, notas y el aviso legal (~150 textos); nombres propios de platillos y cócteles se respetan. La elección se recuerda en el dispositivo",
      "Un solo origen de datos: el menú se sigue editando en español y el inglés sale de un diccionario — lo que no esté traducido cae al español en vez de romperse",
    ]
  },
  {
    version: "2.93.1",
    date: "2026-08-17",
    type: "PATCH",
    changes: [
      "FIX del preview de pautas: la función /api con ruta dinámica no se registraba en Vercel y /r/CODIGO servía el index estático (por eso el Sharing Debugger daba 206 y 'HOG APP'). Aplanada a función fija con el código por query",
      "Plan B listo en el repo (edge function og-share) por si Vercel siguiera sin registrar funciones",
    ]
  },
  {
    version: "2.93.0",
    date: "2026-08-17",
    type: "MINOR",
    changes: [
      "PREVIEW DE PAUTA CONFIGURABLE DESDE HOG APP — en Reservas → Compartir ahora eliges el TÍTULO, el TEXTO y la IMAGEN que Instagram y WhatsApp muestran al compartir o pautar el link /r/CODIGO de cada venue, con una mini vista previa de cómo lo pintará Meta",
      "La imagen se sube ahí mismo (1200×630 recomendado); sin configurar nada, cada venue sigue saliendo con el default 'Reserva tu mesa en {venue}'",
      "El portal wellness (/w/) reusa la imagen del venue con su propio texto de clases",
      "Requiere correr og_share.sql (columnas og_* + la función que se las sirve al robot de Meta sin abrirle la tabla)",
    ]
  },
  {
    version: "2.92.1",
    date: "2026-08-17",
    type: "PATCH",
    changes: [
      "PAUTAS QUE INVITAN A RESERVAR — nuevas URLs para anuncios y compartidos: /r/CODIGO (reservas) y /w/CODIGO (wellness). Instagram tomaba 'HOG APP' como copy porque su robot lee el HTML crudo sin ejecutar JavaScript; estas rutas le sirven el copy correcto ('Reserva tu mesa en El Oyster Club — elige día, hora y cuántos son') y redirigen al instante al landing real",
      "El botón COMPARTIR de Reservas y el link del portal Wellness ya copian estas URLs — usa SIEMPRE /r/CODIGO como destino de la pauta, no el ?reservar= directo",
      "El tracker de vistas del landing sigue contando igual: la redirección aterriza en el mismo ?reservar= de siempre",
    ]
  },
  {
    version: "2.92.0",
    date: "2026-08-17",
    type: "MINOR",
    changes: [
      "WELLNESS · DEAL POR INSTRUCTOR — cada instructor tiene su reparto del ingreso (lo típico del grupo: 60% instructor / 40% POD, y es el default). Se edita en Clases y precios, por persona",
      "El % se CONGELA en cada reserva al momento de reservar: renegociar el deal con un instructor no reescribe la contabilidad de clases ya vendidas",
      "INGRESOS ahora muestra el reparto en cada periodo (semana/quincena/mes): cuánto es del POD y cuánto de instructores, y una LIQUIDACIÓN POR INSTRUCTOR del mes — el número exacto con el que le pagas a cada quien (clases cobradas, deal aplicado, su parte y la del POD)",
      "Si ya corriste wellness.sql antes, recórrelo — agrega las columnas del deal sin tocar lo demás",
    ]
  },
  {
    version: "2.91.1",
    date: "2026-08-17",
    type: "PATCH",
    changes: [
      "WELLNESS — cuando el pago en línea falla, el portal ahora dice la CAUSA real (credenciales de Blumon, sandbox cerrado, función sin desplegar…) en vez del genérico 'no se pudo generar el pago'. El error de la edge function venía en un lugar donde el portal no lo leía",
      "Si el pago en línea no está disponible, el mensaje ofrece pagar en el estudio en vez de dejar al alumno en un callejón",
    ]
  },
  {
    version: "2.91.0",
    date: "2026-08-17",
    type: "MINOR",
    changes: [
      "WELLNESS — sub-portal completo en dos caras: la ADMIN dentro de HOG APP (app 'wellness') y un PORTAL PÚBLICO para alumnos (?wellness=CODIGO), arrancando con Dharma Yoga con Rafa (martes y jueves 7:30, sábado 11:00)",
      "PORTAL DEL ALUMNO sin contraseñas: ve la cartelera de los próximos 14 días con lugares disponibles, se registra UNA vez (nombre + teléfono) y su acceso queda guardado en el navegador; para volver desde otro teléfono basta poner su número. Reserva, cancela (hasta 3 h antes) y paga en línea",
      "PAGOS con Blumon Pay por CHECKOUT LINK: la tarjeta se teclea en la página de Blumon — jamás toca nuestro servidor (cero carga PCI). El monto sale de la base, no del navegador. El webhook de Blumon confirma el pago y la clase queda 'Pagada' sola. También hay cobro manual en el estudio (efectivo/transferencia)",
      "INSTRUCTORES con el MISMO login de HOG APP: con la app 'wellness' asignada, Rafa entra y ve una sola cosa — cuántos alumnos hay por horario en SUS clases, con nombres y pase de lista (asistió / no llegó)",
      "GERENTES WELLNESS (capability 'wellness_admin'): además administran clases, horarios y precios sin tocar código, ven la base de alumnos con cuánto ha gastado cada quien, y los INGRESOS por semana / quincena / mes — separando lo COBRADO de lo RESERVADO POR COBRAR (la proyección: gente que ya dijo que viene)",
      "El cupo se valida en el servidor: dos personas peleando el último lugar no lo duplican, y el precio de la reserva se congela al reservar",
      "Requiere: correr wellness.sql + desplegar la edge function wellness-pay (con los secrets de Blumon) + registrar el webhook con Blumon",
    ]
  },
  {
    version: "2.90.0",
    date: "2026-08-15",
    type: "MINOR",
    changes: [
      "NÓMINA DE TEMPORALES Y EVENTUALES — nueva área exclusiva del Master (por ahora) para preparar la nómina quincenal de todas las unidades y medirla contra lo que produjo cada venue",
      "PLANTILLA por venue: cada eventual con su puesto, tipo (temporal o eventual), tarifa por turno y teléfono. Nadie se borra — quien se va se da de baja, para que las quincenas ya pagadas no queden con renglones sin nombre",
      "QUINCENA a la mexicana (1–15 y 16 a fin de mes, no 14 días corridos): el gerente arma su nómina persona por persona con turnos × tarifa + bono − descuento, la ENVÍA a aprobación y el Master la APRUEBA. Aprobada ya no se edita",
      "OPERACIÓN SEMANAL por persona: turnos, horas, venta atribuida, incidencias y calificación de 1 a 5. Es lo que la quincena no dice — la quincena da el COSTO, esto da el RENDIMIENTO",
      "COSTO LABORAL cruzado con el revenue de Finanzas del mismo periodo: cada venue se compara contra el promedio del propio holding, no contra un número de industria inventado. Se marca en rojo el que se desvía más de 20% arriba",
      "PROYECCIÓN: con el histórico de quincenas aprobadas de cada venue se saca su % de costo laboral real y su costo por turno; escribes el revenue que esperas y te dice cuánta nómina aguanta y cuántos turnos compra",
      "El resumen avisa cuántos venues no han enviado su quincena — para no cerrar el periodo con huecos",
      "LISTO PARA LIBERAR sin tocar SQL: cuando quieras, le asignas la app 'nomina' al gerente en Usuarios y solo verá y capturará los venues que tiene asignados",
      "Requiere correr nomina.sql en Supabase",
    ]
  },
  {
    version: "2.89.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "COMERCIAL — cada tarjeta del pipeline ahora muestra QUIÉN ABRIÓ y QUIÉN CERRÓ el deal como iconos: el que lo trajo con anillo gris, el que lo cerró con anillo verde encimado. Si todavía no hay cerrador, un círculo punteado con '?' lo dice — de ahí salen las comisiones y ya no hay que abrir tarjeta por tarjeta para saberlo",
      "CANDADO EN PROPUESTA — ya no se puede mover un deal a 'Propuesta' sin capturar el MONTO propuesto y subir el PDF que se le mandó al cliente. La etapa afirma que el cliente ya tiene un número en la mano; sin eso, la columna miente y el pipeline suma dinero que nadie propuso",
      "El monto capturado se vuelve el valor del deal, y la propuesta queda registrada en la bitácora con su monto — auditable",
      "El PDF se ve en la ficha del deal con firma de quién lo subió y cuándo; en el board la tarjeta marca 📄 PDF",
      "Al crear un deal ya no se puede elegir 'Propuesta' directo: un deal que apenas nace no tiene una propuesta enviada. Se crea y se mueve, que es donde se pide el PDF",
      "Requiere correr crm_propuesta.sql — sin él la app no se rompe: pide solo el monto hasta que se aplique",
    ]
  },
  {
    version: "2.88.1",
    date: "2026-08-14",
    type: "PATCH",
    changes: [
      "LA CONVERSACIÓN EN RIEL llega también a las TAREAS: columna fija a la derecha de la ventana, retraíble con el botón 💬 del marco superior — igual que en Proyectos",
      "El marco de la tarea (título, compartir, conversación, cerrar) ahora queda FIJO arriba; solo el contenido scrollea",
      "Abrir o cerrar la conversación es UNA sola preferencia para tareas y proyectos: la cierras en un lado y quedó cerrada en el otro",
      "En pantallas angostas o teléfono la conversación regresa al cuerpo de la tarea — nunca desaparece por falta de espacio",
    ]
  },
  {
    version: "2.88.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "TEMA CLARO — HOG APP ahora se puede ver en claro, oscuro o AUTOMÁTICO (sigue a tu sistema: se aclara de día y se oscurece de noche sola). Se elige en Perfil → Apariencia y es por DISPOSITIVO: la tablet del host stand y tu laptop pueden verse distinto",
      "No es el tema oscuro invertido: sobre papel el latón brillante no se lee, así que el acento baja de tono y el texto sobre botones se aclara. Se corrigieron 20+ botones que tenían el texto en negro fijo y habrían quedado ilegibles en claro",
      "El tema se aplica ANTES de cargar la app: no hay parpadeo oscuro al entrar, y ya no depende de que todo el bundle levante bien",
      "VENTANAS MÁS ALTAS Y DE ANCHO FLUIDO — antes eran de ancho fijo con un salto brusco entre tamaños de pantalla; ahora crecen con la ventana hasta un máximo definido, y las de trabajo (proyecto, tarea) reservan su marco desde el inicio en vez de crecer y encoger según el contenido",
      "MARCO SUPERIOR DEL PROYECTO con acciones sobre la ventana entera: COPIAR LINK del proyecto (quien lo abra aterriza justo ahí) y botón para MOSTRAR/OCULTAR la conversación",
      "LA CONVERSACIÓN SALE DEL FONDO DEL SCROLL y pasa a columna fija a la derecha (en pantallas de 1200px+): ya no hay que recorrer todo el proyecto para escribirle a alguien, y mientras escribes sigues viendo lo que estás comentando. Se recuerda si la dejaste abierta o cerrada",
      "El chat vacío ahora ENSEÑA en vez de decir 'sin mensajes': explica para qué sirve y avisa que puedes @mencionar a alguien para que le llegue el aviso — la función que nadie descubría solo",
      "Archivar y restaurar proyectos, y copiar su link, ahora se leen en español en Actividad",
    ]
  },
  {
    version: "2.87.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "FIX GRAVE EN APROBACIÓN — el monto de arriba no era el del presupuesto: se leía una sola vez al abrir la ventana, así que agregabas una partida y seguía diciendo la cifra vieja (MX$3,100 arriba vs MX$3,333 abajo). Se enviaba a aprobar —y a Slack— un número equivocado. Ahora es el mismo dato, siempre",
      "EL FLUJO DE APROBACIÓN AHORA SE VE: riel de 4 pasos (armas presupuesto → envías → decide el aprobador → aprobado) marcando en cuál vas, el botón trae el NETO que estás mandando, y abajo dice qué va a pasar y A QUIÉN le llega, con nombre",
      "Si no hay nadie configurado como aprobador, te lo advierte ANTES de enviar en vez de mandarlo al vacío",
      "No se puede enviar un presupuesto sin partidas — no hay nada que decidir",
      "SELECTS Y CAMPOS ARREGLADOS EN TODA LA APP: los desplegables (venue, responsable, dueño de partida, tipo de gasto) se pintaban con el chrome gris del sistema operativo — barras con relieve que sobre el tema oscuro se leían como un error. Ahora usan el estilo de la app, con su flecha y su desplegable oscuro",
      "Fuera las flechitas de los campos numéricos (cantidad, costo, presupuesto) y los iconos de calendario/reloj ya se ven sobre fondo oscuro",
      "RELACIONADOS DEL EQUIPO rediseñado: era un muro de 25 chips con TODO el directorio, donde los seleccionados se perdían entre los demás. Ahora arriba van los elegidos (con inicial y ✕ para quitar) y abajo se busca por nombre",
      "La gente sin nombre capturado ya no aparece como chip '—' ni como opción de responsable: no se puede asignar un presupuesto a alguien que no se puede identificar",
      "'Enviar requisición al gerente' pasa a botón secundario — competía en acento con 'Enviar presupuesto a aprobación' como si fueran la misma decisión, y son cosas distintas",
    ]
  },
  {
    version: "2.86.1",
    date: "2026-08-14",
    type: "PATCH",
    changes: [
      "ARCHIVAR UN PROYECTO ARCHIVA SUS TAREAS — antes las tareas quedaban sueltas y seguían apareciendo como pendientes en el board y en Mi Resumen de quien las tuviera, aunque el proyecto ya no existiera a la vista",
      "Al RESTAURAR solo regresan las tareas que se archivaron CON el proyecto: las que alguien había archivado por su cuenta antes se quedan archivadas",
      "El aviso dice cuántas se llevó ('Archivado con 5 tareas') y el botón dentro del proyecto lo advierte antes de confirmar",
    ]
  },
  {
    version: "2.86.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "PROYECTOS · BARRA DE ESTADO FIJA — al volver de una distracción se ve de inmediato en qué proyecto estás: nombre, venue, fase, responsable, fechas y avance de tareas, siempre visibles arriba sin scrollear",
      "La ventana del proyecto ahora CRECE CON LA PANTALLA (hasta 860px en monitores grandes) en vez de quedarse en una sola columna angosta",
      "PRESUPUESTO UNIFICADO — 'Recursos requeridos' y 'Presupuesto por partidas' eran lo mismo y ahora son UNA sola lista: un bartender y una maceta se capturan igual, con TIPO DE GASTO (personal, mobiliario, materiales, equipo, servicios, marketing, operación), ZONA, cantidad × costo unitario, y subtotal por tipo",
      "Cada partida puede llevar su COTIZACIÓN adjunta (imagen o PDF) y su propio RESPONSABLE",
      "El botón ahora dice 'Enviar presupuesto a aprobación' y el neto ya no suma recursos por separado",
      "RELACIONADOS DEL EQUIPO en cada proyecto, además del responsable — se guardan al instante",
      "CONFIGURACIÓN DE APROBADORES (solo Master): botón en Proyectos para elegir quién aprueba los presupuestos; a quien marques le aparece la pestaña de Aprobación y le llega el aviso",
    ]
  },
  {
    version: "2.85.1",
    date: "2026-08-14",
    type: "PATCH",
    changes: [
      "TAREAS — botón para COPIAR EL LINK de cualquier archivo adjunto (y de los links): para trasladarlo a otra tarea basta pegarlo ahí como link adjunto, sin volver a subir el archivo",
    ]
  },
  {
    version: "2.85.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "TRACKER DEL LANDING DE RESERVAS — Concierge → Resumen ahora muestra, por venue: cuántas VISTAS tuvo el link público (?reservar=), cuántas PERSONAS distintas lo abrieron, cuántas RESERVAS salieron de ahí y la CONVERSIÓN (reservas ÷ personas)",
      "El registro es anónimo y no estorba: una vista por sesión (el refresh no duplica), visitante identificado por un id persistente del navegador, y si algo falla el landing carga como si nada",
      "El contador arranca desde que se activa el tracker — las vistas anteriores no se pueden reconstruir",
    ]
  },
  {
    version: "2.84.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "WHATSAPP — ahora se escuchan los REPORTES DE ENTREGA de Meta: hasta hoy la app decía 'enviado' cuando Meta solo lo había ACEPTADO, y si la entrega fallaba después nadie se enteraba. Cada falla queda registrada en Actividad con el destinatario, el motivo y el código de Meta",
      "La confirmación de reserva registra en el log a qué número resolvió Meta el envío (wa_id), para cachar formatos de número mal guardados",
    ]
  },
  {
    version: "2.83.1",
    date: "2026-08-14",
    type: "PATCH",
    changes: [
      "FIX importante: cuando la confirmación automática por WhatsApp fallaba, la app NO avisaba — quedabas creyendo que al cliente se le había avisado. Ahora el error siempre se muestra y dice qué revisar",
      "Los casos de 'no aplica' (walk-in, confirmación ya enviada, reserva sin confirmar) ahora se explican en vez de quedarse callados",
    ]
  },
  {
    version: "2.83.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "MI RESUMEN — 'Mis proyectos próximos' ahora trae TIMELINE, con el mismo lenguaje visual que las tareas: barra de color por fase a la izquierda (idea · en marcha · en revisión · aprobado · terminado) y una mini barra de avance",
      "La mini barra dice de un vistazo si el proyecto va a tiempo: el relleno son las tareas terminadas y la línea vertical es HOY. Si HOY va adelante del relleno, el proyecto viene atrasado y la barra se pinta en rojo",
      "Cada proyecto muestra también su avance en tareas (3/8) y su leyenda al pie",
    ]
  },
  {
    version: "2.82.1",
    date: "2026-08-14",
    type: "PATCH",
    changes: [
      "FIX: al dar Preview a un archivo adjunto, el visor se abría DETRÁS de la ventana de la tarea — su z-index fijo quedaba por debajo del sistema de ventanas apiladas",
      "FIX del mismo tipo: el panel de una oportunidad abierta desde el presupuesto de un proyecto quedaba detrás de la ventana del proyecto; ahora se apila encima como cualquier subventana",
    ]
  },
  {
    version: "2.82.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "PROGRAMA DEL EVENTO — nueva sección en cada proyecto para eventos de varios días: la agenda de lo que SUCEDE cada día, con horario de inicio y fin, lugar, quién la imparte y estado (planeada · confirmada · hecha · cancelada). Se lee agrupada por día, como el itinerario que se entrega al equipo",
      "Las actividades son distintas de las tareas a propósito: una tarea se completa (trabajo previo, con fecha límite y responsable), una actividad ocurre (Yoga, miércoles 10:30–12:00)",
      "Cada actividad puede generar sus propias TAREAS DE PREPARACIÓN ligadas a ella — así se gestiona individual sin sacarla del conjunto del evento, y se ve su avance (2/3 tareas) en la misma línea del programa",
      "El prompt de inyección SQL ya sabe cargar un programa completo de golpe: tareas de planeación + agenda de varios días en un solo bloque",
    ]
  },
  {
    version: "2.81.1",
    date: "2026-08-14",
    type: "PATCH",
    changes: [
      "FIX: los proyectos ARCHIVADOS seguían apareciendo en 'Mis proyectos próximos' del home — la lista filtraba cancelados pero no archivados",
    ]
  },
  {
    version: "2.81.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "BOT — ahora se comporta como CONCIERGE, no como vendedor: si el cliente saluda, primero se le saluda y se le pregunta en qué ayudarle; la reserva viene después de atender, no antes",
      "FIX grave: el bot decía 'no hay programación registrada en el sistema'. Ahora tiene PROHIBIDO exponer el sistema por dentro y prohibido cerrar con un 'no' pelón — siempre ofrece lo que SÍ hay",
      "El bot ya revisa las DOS fuentes de programación antes de contestar qué hay una noche: la agenda de DJs y los temas fijos de cada día del FAQ (Ladies Night, Martini Tuesday…). Un día sin DJ agendado ya no es 'un día sin nada'",
      "Si preguntan por HOY, contesta por hoy — antes brincaba a la agenda de mañana como si no hubiera escuchado",
      "El bot reconoce la ocasión detrás del mensaje ('es nuestra última noche en Mazatlán', un cumpleaños) y arma su sugerencia alrededor de eso",
      "JAMÁS menciona tiempos de permanencia ni horas de salida de la mesa, en ningún venue",
    ]
  },
  {
    version: "2.80.0",
    date: "2026-08-14",
    type: "MINOR",
    changes: [
      "ACTIVIDAD REDISEÑADA — ahora mide el uso real de cada área de HOG APP, no solo lista lo que pasó",
      "USO POR ÁREA: acciones y PERSONAS DISTINTAS por módulo (mucha acción de una sola persona no es adopción), tendencia vs. periodo anterior, venues activos, mapa de calor de cuándo se usa la app, y las ÁREAS DORMIDAS — los módulos que nadie tocó",
      "PERSONAS: ficha de cada quien separando 'qué trae encima' (tareas como responsable, dónde está relacionado, proyectos a cargo, vencidas) de 'qué hizo' (acciones, comentarios, reservas creadas, tareas compartidas y las vistas que generaron)",
      "ALMACENAMIENTO: cuántos GB pesan los archivos adjuntos, por bucket, con barra de consumo",
      "Cronología arreglada: las 42 acciones ahora se leen en español (antes 22 salían como task_archived o sql_injected), filtros por módulo y persona, búsqueda, entradas CLICKEABLES que abren la tarea/proyecto/deal, paginación real y export a CSV",
      "FIX de fondo: los conteos salían de las 300 filas traídas al navegador — 'Total' era el tope de la consulta y 'Semana' mentía si había más. Ahora se calculan en el servidor sobre la tabla completa",
      "Compartir una tarea por link ahora queda registrado, para cruzarlo contra las vistas externas que generó",
    ]
  },
  {
    version: "2.79.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "⚡SQL (solo Master) — botón flotante verde abajo a la derecha: pega el SQL que te propuso un agente de IA, PREVISUALIZA lo que crearía (proyectos, tareas, recursos y presupuesto, con venue, responsable, fechas y montos), edítalo si hace falta, y solo entonces FIRMA Y APLICA",
      "El preview es exacto, no una interpretación: el SQL corre de verdad contra la base y se revierte — lo que ves es lo que quedaría",
      "Si editas el SQL después de revisarlo, el botón de firmar se bloquea hasta volver a previsualizar: nadie firma algo que no vio",
      "El servidor rechaza todo lo que no sea alta (DDL, UPDATE, DELETE) y las tablas de permisos, ajustes y finanzas; cada inyección aplicada queda en Actividad",
      "Prompt para el equipo en docs/PROMPT_INYECTAR_SQL.md: cualquiera con Claude describe un evento o remodelación y te entrega el SQL listo",
    ]
  },
  {
    version: "2.78.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "PROYECTOS · TIMELINE POR TAREAS: cada proyecto se despliega con ▸ y sus tareas bajan como filas propias del timeline — el punto marca su fecha límite, pintado con el color de su fase y con borde rojo si va tarde; las que caen fuera de la ventana se señalan con ‹ › y las que no tienen fecha se marcan como tal. Un clic abre la tarea",
      "La lista de tareas dentro del proyecto usa el mismo lenguaje visual: barra de color por fase a la izquierda y mini funnel ·—·—·—· en lugar del estado en texto",
      "El sistema de fases vive ahora en un solo lugar (mismo color = mismo significado en Mi Resumen y en Proyectos)",
    ]
  },
  {
    version: "2.77.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "MI RESUMEN — cada tarea muestra ahora QUIÉN responde y QUIÉNES están involucrados: el responsable va destacado con anillo (o 'TÚ' si eres tú) y detrás los involucrados en círculos encimados; el cursor revela los nombres para saber a quién buscar",
      "TAREAS — cada archivo y cada link adjunto trae al pie una firma discreta: quién lo subió y hace cuánto, dentro del margen de la caja para no estorbar la vista del contenido",
    ]
  },
  {
    version: "2.76.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "TAREA COMPARTIDA — 'Abrir en HOG APP' ahora te lleva a la tarea REAL: si pertenece a un proyecto abre Proyectos, el proyecto y encima la ventana de la tarea (contexto completo para dar seguimiento); si es una tarea suelta abre Tareas con su ventana",
      "Al iniciar sesión desde la vista pública aterrizas directo en la tarea, ya no de regreso en la vista pública",
      "La vista pública ahora muestra a qué proyecto pertenece la tarea",
      "Los links con ?task= (notificaciones, Slack) también aterrizan en la pantalla donde vive la tarea, no en el dashboard",
    ]
  },
  {
    version: "2.75.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "MI RESUMEN — la lista de tareas ahora incluye también las tareas donde estás RELACIONADO (no solo las asignadas a ti), marcadas con un ojo",
      "Orden nuevo: lo más vencido primero, y dentro del mismo día lo tuyo antes que lo relacionado, por prioridad",
      "Sistema de color por fase en el borde izquierdo de cada tarea (gris abierta · azul en progreso · ámbar evidencia · rojo revisión · verde aprobada) + mini funnel ·—·—·—· que muestra de un vistazo qué tan avanzada va, con leyenda al pie",
    ]
  },
  {
    version: "2.74.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "TAREA COMPARTIDA — vista pública rediseñada para quien NO tiene HOG APP: sello 'VISTA PÚBLICA', banner que explica que es de solo lectura, y cierre invitando a iniciar sesión para comentar, dar feedback y ver el proyecto completo",
      "La conversación del equipo aparece bajo candado (se ve que existe y cuántos mensajes hay, pero no su contenido) — el chat interno nunca sale por el link",
      "Si quien abre el link ya tiene sesión, el cierre cambia a 'Abrir en HOG APP'",
    ]
  },
  {
    version: "2.73.1",
    date: "2026-08-13",
    type: "PATCH",
    changes: [
      "TAREA COMPARTIDA (?share=) ahora es PÚBLICA: cualquiera con el link ve todo el contenido — descripción, venue, asignado, links y evidencias — sin necesidad de iniciar sesión (antes pedía login con Google)",
      "Las tareas PRIVADAS nunca se exponen por link, el chat interno del equipo no viaja, y cada vista queda registrada en Actividad ('anónimo' si no hay sesión); copy de la vista ahora en español",
    ]
  },
  {
    version: "2.73.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "MI RESUMEN rediseñado hacia productividad: fuera las horas (son el indicador del Master para medir al equipo, no de autogestión)",
      "Nuevos KPIs mensuales con variación vs mes anterior (▲/▼): DEALS ACTIVOS y $ EN JUEGO (los que creaste o donde participas), TIEMPO DE RESPUESTA A ACTIVIDADES (de creada a cerrada) y A MENSAJES (de recibido a leído, medido con las ✓✓)",
      "El color del indicador premia la dirección correcta: más deals/$ en verde, tiempos de respuesta a la baja en verde",
    ]
  },
  {
    version: "2.72.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "BOT — cambio de venue en la misma conversación: si el cliente ya identificado en un venue pregunta por otra marca del holding, el bot ya no se queda 'pegado' — reconoce el cambio y sigue la charla sobre el venue nuevo",
      "BOT — responde en el idioma del cliente: si escribe un mensaje completo en otro idioma, el bot le contesta en ese idioma de ahí en adelante (antes forzaba español siempre)",
      "Concierge → Config: LINK DIRECTO por marca — con el mismo WhatsApp del holding, cada venue tiene su link (wa.me) con el mensaje prellenado mencionando su nombre, para pegar en bio/stories/anuncios; el cliente llega identificando el venue solo, sin preguntas",
    ]
  },
  {
    version: "2.71.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "CONVERTIR TAREA EN PROYECTO: nuevo botón en la ficha de la tarea — crea el proyecto en Proyectos con los datos de la tarea (nombre, descripción, venue, fecha, responsable), la tarea se traslada como su primera tarea (chat e historial intactos) y ahí mismo eliges a las personas relacionadas, que viajan con ella (siguen la tarea y quedan como colaboradores del proyecto); al terminar te abre el proyecto nuevo",
    ]
  },
  {
    version: "2.70.1",
    date: "2026-08-13",
    type: "PATCH",
    changes: [
      "FIX: el mensaje manual de confirmación por WhatsApp (wa.me) ahora va en texto plano sin emojis — en algunos teléfonos el prefill los corrompía (�) y llegaba a romper el link de 'mi reserva'",
    ]
  },
  {
    version: "2.70.0",
    date: "2026-08-13",
    type: "MINOR",
    changes: [
      "CONFIRMACIÓN AUTOMÁTICA POR WHATSAPP: al confirmar (o crear confirmada) una reserva, el cliente recibe su confirmación solo — por el chat del concierge si la reserva nació ahí, o por plantilla aprobada de WhatsApp si no; nunca se manda dos veces (edge function reservation-notify)",
      "BANDEJA — respuestas desde la app de Instagram: si alguien del equipo contesta un DM desde la propia app de IG, el mensaje ahora aparece en el hilo etiquetado 'Equipo · app de Instagram' y el bot se calla (la conversación pasa a Humano)",
      "RECLUTAMIENTO (solo Master): bolsa de trabajo del grupo — el bot ya NO ofrece reserva a quien busca empleo: registra al candidato (nombre, puesto, experiencia, ciudad, teléfono) y el equipo lo ve en Concierge → Reclutamiento con estados nuevo/contactado/entrevista/contratado/descartado",
    ]
  },
  {
    version: "2.69.1",
    date: "2026-08-13",
    type: "PATCH",
    changes: [
      "FIX: las sub-pantallas (p. ej. la conversación del Concierge) no dejaban scrollear — la ventana centrada limitaba el alto pero su contenido no podía encogerse; ahora todas las ventanas scrollean bien",
    ]
  },
  {
    version: "2.69.0",
    date: "2026-08-11",
    type: "MINOR",
    changes: [
      "FINANZAS — nueva app exclusiva del Master (acceso otorgable solo por él, app 'finanzas'): ingresos vs egresos por mes (12m), PASIVOS vivos (órdenes sin liquidar), ratio ingresos/egresos con semáforo de salud, saldo BANX y nómina espejo",
      "Conexión BANX (sandbox listo): edge functions banx-sync (ping, sync incremental con cursor, orden y nómina de prueba) y banx-webhook (firma HMAC verificada + dedup) — mapeo venue↔sucursal desde la app",
      "Captura rápida de ingresos por venue para medir 'cuánto gano en el tiempo' desde hoy",
    ]
  },
  {
    version: "2.68.1",
    date: "2026-08-11",
    type: "PATCH",
    changes: [
      "Nueva reserva (motor por mesas): cuando no hay horarios, el formulario diagnostica la CAUSA — día sin horario configurado, ninguna mesa acepta ese tamaño de grupo, u ocupación real",
    ]
  },
  {
    version: "2.68.0",
    date: "2026-08-11",
    type: "MINOR",
    changes: [
      "Reservas — CONFIRMAR POR WHATSAPP: botón en el panel que confirma la reserva y envía el mensaje con un mini-link personal (?mireserva=token); si la reserva nació en el concierge la manda el bot, si no se abre WhatsApp con el mensaje listo",
      "MI RESERVA (página pública del cliente): ve su reserva y puede avisar que llega ~10/20/30 min tarde (nota + alerta al equipo en Slack) o cancelar por imprevisto (con motivo opcional)",
      "Token único por reserva (manage_token) + acciones manage_* en la edge function public-reservation (v4 desplegada)",
      "FIX: al crear cliente dentro de Nueva reserva, la ventana se cerraba sola y te regresaba al día — las ventanas ahora se montan en un portal y las subventanas anidadas funcionan bien",
    ]
  },
  {
    version: "2.67.0",
    date: "2026-08-11",
    type: "MINOR",
    changes: [
      "LANDING PÚBLICO de El Oyster Club (?reservar=OC) con la identidad de la carta: portada con logo, lema y costas sobre azul cielo, formulario de reserva re-tematizado (Oswald/Cutive Mono/Inter, tinta) y botón VER EL MENÚ",
      "Menú en línea servido en /menu/oc.html (misma URL del dominio) con botón fijo RESERVAR MESA que regresa al landing — listo para compartir en redes y en el concierge",
    ]
  },
  {
    version: "2.66.0",
    date: "2026-08-11",
    type: "MINOR",
    changes: [
      "Proyectos — VINCULAR TAREAS EXISTENTES: buscador dentro del proyecto que lista tareas sueltas del Task Manager (sin proyecto) y las liga con un clic; botón de desvincular en cada tarea (la tarea sigue viva en Tareas)",
    ]
  },
  {
    version: "2.65.1",
    date: "2026-08-11",
    type: "PATCH",
    changes: [
      "Pulso Social ahora es EXCLUSIVO del Master — no aparece en el menú ni es accesible para ningún otro rol",
    ]
  },
  {
    version: "2.65.0",
    date: "2026-08-11",
    type: "MINOR",
    changes: [
      "PULSO SOCIAL — nueva app (dirección/marketing): conecta el Instagram, Facebook y Google Maps de cada venue y mide seguidores con tendencia, engagement, alcance, rating y reseñas",
      "Análisis de EMOCIÓN con IA: cada comentario/reseña se clasifica (sentimiento -1..1, emoción dominante, intención de compra 💰) — se ve el pulso de cada cuenta y las menciones recientes",
      "VENTAS POR DM medibles: reservas creadas vía concierge (WhatsApp/IG) por día + volumen de mensajes",
      "Edge function social-pulse (extracción + análisis, cron diario) y seed social_pulse.sql",
    ]
  },
  {
    version: "2.64.3",
    date: "2026-08-11",
    type: "PATCH",
    changes: [
      "Tabla de Proyectos: Estado y Avance junto al nombre (ya no se cortan con el scroll horizontal); números al final",
      "Calendario: los proyectos multi-día muestran el nombre solo el primer día (y al arrancar cada semana); el resto son bandas delgadas de color — adiós al chip repetido 19 veces",
      "Timeline: hitos agrupados por fecha (un rombo con contador cuando caen varios; verde solo si todos aprobados) y etiqueta de duración junto a las barras cortas",
    ]
  },
  {
    version: "2.64.2",
    date: "2026-08-11",
    type: "PATCH",
    changes: [
      "Timeline pulido: barras más altas con sombra y texto legible (X/Y tareas), hitos SOBRE la barra sin encimar el texto, fines de semana sombreados, chip HOY, hover por fila y barra mínima legible para proyectos de un día",
      "El botón '+ Evento' ahora es solo '+' — agrega evento o proyecto",
    ]
  },
  {
    version: "2.64.1",
    date: "2026-08-11",
    type: "PATCH",
    changes: [
      "Board de Proyectos en escritorio: fuera las flechas ‹ › — la fase se cambia arrastrando; en móvil se quedan (ahí no hay drag & drop)",
    ]
  },
  {
    version: "2.64.0",
    date: "2026-08-11",
    type: "MINOR",
    changes: [
      "DRAG & DROP en los kanban de escritorio (Tareas y Proyectos): arrastra la tarjeta a la fase — la columna destino se ilumina; en Proyectos, soltar en 'Aprobado' sigue siendo exclusivo del Aprobador",
      "En móvil se mantiene el patrón correcto de usabilidad: swipe + selector de estado en Tareas, flechas ‹ › en Proyectos (arrastrar en táctil pelea con el scroll)",
    ]
  },
  {
    version: "2.63.0",
    date: "2026-08-11",
    type: "MINOR",
    changes: [
      "MI RESUMEN — dashboard personal (todos los roles): tareas asignadas de la semana, horas por trabajar vs horas trabajadas la semana pasada, mensajes sin leer y tus proyectos próximos — todo clickeable",
      "CHAT en cada tarea, proyecto y deal del CRM — con @menciones (autocompletar, notificación campana + DM), DOBLE PALOMITA ✓✓ cuando alguien ya vio tu mensaje (tooltip dice quién) y tiempo real",
      "Contador de mensajes sin leer por entidad relacionada contigo (asignado, responsable, seguidor o participante)",
      "CLICK DERECHO en tareas y proyectos: Editar · Duplicar · Archivar — nada se elimina; lo archivado se ve y restaura con el filtro Archivados (proyectos lo estrena, tareas ya lo tenía)",
    ]
  },
  {
    version: "2.62.1",
    date: "2026-08-11",
    type: "PATCH",
    changes: [
      "Al guardar un cambio en la subventana de tarea (asignar responsable, estado, fecha…), la ventana del proyecto y la pantalla de Proyectos se refrescan SOLAS al volver — lista de tareas, iconografía, barras de avance e hitos del Timeline al día sin recargar",
    ]
  },
  {
    version: "2.62.0",
    date: "2026-08-11",
    type: "MINOR",
    changes: [
      "Proyectos — iconografía en la lista de tareas del plan: círculo con iniciales del ASIGNADO (o 'Sin asignar' punteado), círculos apilados de RELACIONADOS (+N), reloj con TIEMPO ESTIMADO y calendario con DEADLINE",
      "Semáforo del deadline: rojo vencido, ámbar a ≤2 días, gris con margen — tooltips con nombres completos y fechas",
    ]
  },
  {
    version: "2.61.0",
    date: "2026-08-11",
    type: "MINOR",
    changes: [
      "Ventanas CENTRADAS en escritorio: todo lo que se abre (proyecto, tarea, reserva, cliente, editor de piso…) aparece como modal al centro con animación, en vez de panel lateral",
      "SUBVENTANAS apiladas y conectadas: al abrir una tarea desde un proyecto (o un cliente desde una reserva), la ventana anterior queda visible detrás — atenuada, encogida y asomando arriba — y al cerrar la subventana regresa al frente",
      "Escape cierra solo la ventana de hasta arriba; el detalle de tarea se integra a la misma pila",
    ]
  },
  {
    version: "2.60.0",
    date: "2026-08-10",
    type: "MINOR",
    changes: [
      "Proyectos — vista TIMELINE (Gantt): una barra por proyecto sobre una ventana de semanas con navegación ‹ › y botón Hoy, línea roja de HOY, avance de tareas dentro de la barra y duración/tiempo restante por proyecto",
      "Hitos sobre la barra: cada tarea con fecha límite aparece como rombo (ámbar pendiente, verde aprobada) — los sprints se leen de un vistazo",
      "Proyecto sembrado: Bruma Records — nueva distribución (vinilos + café), 3 sprints / 15 tareas con fechas del 10 al 28 de agosto",
    ]
  },
  {
    version: "2.59.0",
    date: "2026-08-06",
    type: "MINOR",
    changes: [
      "Proyectos — vista APROBACIÓN (cabina del Gerente de Eficiencia): pendientes de decisión con su neto, cortes con sobregiro ordenados por Δ, y KPIs (por aprobar, sobregiro total)",
      "Piso — SECCIONES: cada mesa puede tener sección/estación (editor de piso) y el mesero filtra 'mis mesas'; MESA EXCEDIDA en rojo con ⚠ cuando pasa su duración + 20 min sin pedir cuenta (contador en el resumen)",
      "Reservas FASE 5 — CALIBRACIÓN: en Capacidad y horario, la duración REAL de las mesas (cierres del Piso, últimos 60 días) contra la configurada, con sugerencia (+10% de colchón, redondeo a 15) y botón para aplicarla en rangos con 5+ cierres",
    ]
  },
  {
    version: "2.58.0",
    date: "2026-08-06",
    type: "MINOR",
    changes: [
      "Proyectos — CORTE POST-EVENTO: cuando el plan termina (Realizado o fecha pasada) se abre el corte — monto real por partida (campo 'real $', verde bajo presupuesto / rojo sobre) con totales Real y Δ vs presupuesto",
      "Asistencia real vs esperada en el corte de eventos",
      "El ciclo del Gerente de Eficiencia queda completo: aprueba presupuesto → ejecuta el equipo → corte real contra lo aprobado",
    ]
  },
  {
    version: "2.57.0",
    date: "2026-08-06",
    type: "MINOR",
    changes: [
      "Reservas Fase 4 — el sistema opera solo: NO-SHOW AUTOMÁTICO cada 10 min al vencer la tolerancia del venue (hora local por venue), con registro en Actividad y resumen a Slack",
      "SIN GARANTÍA automático: reservas con depósito pendiente a menos de 24h se marcan (chip rojo + filtro en la barra de excepciones) y se alerta al equipo — el host decide si la sostiene",
      "LISTA DE ESPERA real: botón ⏳ Espera en Reservas — anotas nombre+pax en segundos, ves cuánto llevan esperando, y con teléfono los conviertes en reserva de un toque (o los mandas al Piso como walk-in)",
      "Requiere: SQL reservas_fase4.sql + crear la Edge Function reservations-cron + programar el cron",
    ]
  },
  {
    version: "2.56.0",
    date: "2026-08-06",
    type: "MINOR",
    changes: [
      "Proyectos — flujo de APROBACIÓN (Gerente de Eficiencia): el planner envía a aprobación, el plan entra a 'En aprobación' y solo el Aprobador (función asignable en Usuarios, o Master) puede Aprobar o Regresar con feedback obligatorio",
      "Panel de aprobación en cada plan: resumen financiero (gastos + recursos, patrocinios, neto), decisión con un toque e historial auditable de envíos/aprobaciones/regresos con comentarios",
      "Notificaciones en cada paso: campana + Slack DM al Aprobador al enviar, y al responsable al aprobar o regresar",
      "Board: nueva columna 'En aprobación'; mover a 'Aprobado' con flechas queda restringido al Aprobador",
    ]
  },
  {
    version: "2.55.1",
    date: "2026-08-06",
    type: "PATCH",
    changes: [
      "Proyectos: la barra de avance contaba tareas con un estado inexistente (DONE) — ahora cuenta las Aprobadas, el estado terminal real",
    ]
  },
  {
    version: "2.55.0",
    date: "2026-08-01",
    type: "MINOR",
    changes: [
      "Proyectos — 3 vistas: Tabla, BOARD por estado (Idea → Planeación → Aprobado → Realizado, con flechas para mover) y CALENDARIO mensual (planes multi-día pintados en su rango; navegación por mes)",
      "PLANTILLAS de plan: guarda un plan como plantilla (recursos + partidas + tareas típicas) y úsala al crear — 'Evento tipo POD' en un clic",
      "REQUISICIÓN al gerente: los recursos del plan se envían como tarea de alta prioridad al Task Manager del venue (área Piso, con lista de staff/equipo y presupuesto) + aviso a Slack",
      "La vista elegida se recuerda por dispositivo",
    ]
  },
  {
    version: "2.54.0",
    date: "2026-08-01",
    type: "MINOR",
    changes: [
      "Objetivos ahora es exclusivo del Master (dirección)",
      "Contenido retirado — la planeación de contenido vive en Proyectos",
      "Proyectos: columna de Avance — tareas hechas/total de cada plan con barra de progreso (verde al completar); también en las tarjetas de teléfono",
    ]
  },
  {
    version: "2.53.0",
    date: "2026-08-01",
    type: "MINOR",
    changes: [
      "Eventos evoluciona a PROYECTOS: planea eventos O proyectos multidisciplinarios (adecuación, remodelación, apertura, mantenimiento) chicos o grandes, con fecha inicio-fin y filtro Eventos/Proyectos",
      "Recursos requeridos por plan: 1 bartender, 2 meseros, 1 guardia, equipo… con cantidad y costo unitario (total autocalculado)",
      "Presupuesto por partidas: gastos (sombreros, vasos…) y patrocinios como ingresos — con totales Gastos/Patrocinios/Neto",
      "Patrocinio → botón 'Crear deal' lo conecta al pipeline de Comercial (CRM) y queda ligado a la partida",
      "Las tareas por bullets siguen siendo el puente operativo hacia el Task Manager (y hacia gerentes de venue en una fase futura)",
    ]
  },
  {
    version: "2.52.0",
    date: "2026-08-01",
    type: "MINOR",
    changes: [
      "Eventos rediseñado como TABLA (estilo Asana) en escritorio: columnas de fecha, día coloreado, evento, tipo, venue, hora, cover, presupuesto, asistencia, colaboradores, responsable y estado — con sumas por mes de presupuesto y asistencia",
      "Campos nuevos por evento: asistencia esperada, requerimientos y colaboradores/talento",
      "Tareas del evento por BULLETS: escribes una por línea y el botón 'Pasar a Tareas' las crea en el Task Manager ligadas al evento (venue y fecha límite incluidos); también al crear el evento",
      "En teléfono se mantienen las tarjetas compactas",
    ]
  },
  {
    version: "2.51.1",
    date: "2026-08-01",
    type: "PATCH",
    changes: [
      "Nueva reserva: el buscador de cliente abría el teclado numérico en iPhone y no dejaba escribir nombres — ahora abre el teclado normal",
    ]
  },
  {
    version: "2.51.0",
    date: "2026-08-01",
    type: "MINOR",
    changes: [
      "Link público: ahora ofrece HORARIOS CON LUGAR como chips para cualquier venue con aforo y horario configurados (no solo con motor de mesas) — el cliente elige de lo disponible en vez de adivinar una hora que rebota",
      "Si el horario elegido se llenó justo antes de enviar, el error sugiere las 3 horas cercanas con lugar",
      "Venues sin aforo/horario configurado siguen con hora libre (degrada bien, incluso con el function viejo desplegado)",
    ]
  },
  {
    version: "2.50.1",
    date: "2026-08-01",
    type: "PATCH",
    changes: [
      "Formulario público: ahora muestra el motivo real cuando el sistema rechaza (cupo a esa hora, teléfono inválido…) en lugar del genérico 'No se pudo enviar'",
      "Curva: espacio de cabecera en la escala — la barra más alta y su número ya no se cortan arriba",
    ]
  },
  {
    version: "2.50.0",
    date: "2026-08-01",
    type: "MINOR",
    changes: [
      "El cupo dejó de ser acumulado del día: ahora es un DETECTOR DE HORARIO — valida los pax simultáneos a la hora elegida usando las duraciones (la gente rota); max_pax del día = aforo del venue en un momento dado",
      "Nueva reserva: si a esa hora no cabe, sugiere los 3 horarios más cercanos con lugar (chips verdes de un toque); el sobrecupo sigue siendo autorización Ops/Master",
      "Misma regla en el link público y el bot (requieren re-paste): el bot responde con las horas SIN lugar y ofrece las cercanas libres, en lugar de rechazar la noche entera",
      "Curva de ocupación: escala fija anclada al aforo con riel de cupo por columna — una barra baja se lee como poca ocupación del cupo, no como cambio de escala",
    ]
  },
  {
    version: "2.49.4",
    date: "2026-08-01",
    type: "PATCH",
    changes: [
      "Botones del panel de la reserva homologados: todos píldora de 50px, contenido centrado con icono — dorado guardar, verde sentar, rojo tenue no-show, contorno cancelar/reactivar",
    ]
  },
  {
    version: "2.49.3",
    date: "2026-08-01",
    type: "PATCH",
    changes: [
      "Botones de Sentar en verde con icono de silla (fila AHORA, panel de la reserva y walk-in del Piso) — se identifican al vistazo",
    ]
  },
  {
    version: "2.49.2",
    date: "2026-08-01",
    type: "PATCH",
    changes: [
      "Header de Reservas compactado en móvil: buscador y '+' en la misma fila, placeholder corto, chips de excepciones en una línea con scroll (el Walk-in ya no se pierde)",
      "HoH: se quitó la fila de pestañas de Concierge cuando solo hay una (Reservas) — una fila más de pantalla para la lista",
      "Fecha bien escrita ('Sábado 1 de agosto', no '1 De Agosto'); un solo grupo por la mañana se etiqueta 'Hoy' y los días futuros van sin encabezados de momento",
    ]
  },
  {
    version: "2.49.1",
    date: "2026-07-31",
    type: "PATCH",
    changes: [
      "Panel de la reserva → Cliente: notas persistentes del cliente (se recuerdan en cada visita) y toggles VIP / Socio de un toque — disponible para HoH",
      "Los clientes Socio se reconocen en la fila igual que los VIP (chip dorado)",
      "El buscador general ahora es una barra visible arriba de Reservas (ya no una lupa chiquita)",
    ]
  },
  {
    version: "2.49.0",
    date: "2026-07-31",
    type: "MINOR",
    changes: [
      "Buscador general de reservas (lupa en el header): busca en todos tus venues y todas las fechas por nombre, teléfono o texto en notas; tocar un resultado salta a ese día y venue",
    ]
  },
  {
    version: "2.48.4",
    date: "2026-07-31",
    type: "PATCH",
    changes: [
      "Un solo panel al tocar la reserva: datos del cliente (nombre y teléfono editables, etiquetas, no-shows previos, acceso al perfil completo) + edición de la reserva + acciones, todo en la misma ventana",
      "Un solo botón 'Guardar cambios (reserva y cliente)' aplica ambos",
    ]
  },
  {
    version: "2.48.3",
    date: "2026-07-31",
    type: "PATCH",
    changes: [
      "HoH aterriza directo en Reservas al entrar (la tablet vive en el host stand); Reservas pasa al primer lugar de su barra inferior",
    ]
  },
  {
    version: "2.48.2",
    date: "2026-07-31",
    type: "PATCH",
    changes: [
      "Apps por usuario ahora aplica igual a HoH: con apps asignadas en Usuarios, la barra inferior de la tablet se arma desde esas apps (máx 4 + Perfil) y el aterrizaje inicial cae en la primera app asignada",
      "Sin asignación, HoH conserva su default: Mi turno · Reportar · Reservas · Perfil",
    ]
  },
  {
    version: "2.48.1",
    date: "2026-07-31",
    type: "PATCH",
    changes: [
      "Menú ⋯ de cada reserva ahora incluye edición completa (fecha, hora, pax, zona, notas) para cualquier rol con escritura — HoH incluido; los cambios quedan en Actividad",
      "El ⋯ aparece también en reservas cerradas, con 'Reactivar como confirmada' para corregir errores (no-show o cancelación por equivocación)",
      "'Sentar ya (llegada anticipada)' disponible en el menú de toda reserva solicitada/confirmada",
    ]
  },
  {
    version: "2.48.0",
    date: "2026-07-31",
    type: "MINOR",
    changes: [
      "Vista operativa HoH en Reservas → Día: barra de excepciones accionable (sin confirmar / sin mesa / depósitos / horarios por confirmar) que filtra la lista; 'Todo en orden' cuando no hay pendientes",
      "Lista agrupada por momento: AHORA (botón Sentar con confirmación, cuenta regresiva de no-show y acciones No-show / +10 min al vencerse), PRÓXIMAS (Confirmar o Llamar), MÁS TARDE (solo estado), CERRADAS al final",
      "Filas compactas sin avatar: hora, nombre, pax, mesa/zona, salida estimada y chips de estado (Sin mesa, Depósito pendiente, VIP, PR, Alergia) siempre visibles",
      "Curva operativa: marcador de 'ahora' con pasado atenuado, color rojo por conflicto de MESAS (la sobreventa real), colapsada en teléfono con resumen 'Pico X/Y a las HH:MM'",
      "Botón Walk-in en la barra (abre el Piso) y 'Sentar ya' para llegadas anticipadas en el menú de la reserva",
    ]
  },
  {
    version: "2.47.0",
    date: "2026-07-31",
    type: "MINOR",
    changes: [
      "Curva de ocupación en Reservas (vista Día): barras de 30 min con carga simultánea usando las duraciones configuradas del venue — azul ok, rojo sobreventa, ámbar pacing de cocina excedido",
      "Toggle Pax vs Mesas: 'mesas requeridas vs disponibles' detecta la sobreventa real; línea punteada con el aforo autocalculado del mobiliario",
      "Banner de sobreventa anticipada con rango horario y detalle; tocar una barra lista las reservas activas en ese slot con hora estimada de salida",
      "Duración por reserva (duration_min) — el motor por mesas la respeta sobre la duración por tamaño de grupo",
      "Propuestas de cambio de horario: la reserva marca '→ HH:MM por confirmar' y el equipo aplica o descarta cuando el cliente responde",
    ]
  },
  {
    version: "2.46.0",
    date: "2026-07-31",
    type: "MINOR",
    changes: [
      "Nuevo app Eventos: planeación de eventos multi-venue estilo Asana — lista agrupada por mes con descripción, fecha, tipo, cover y precio, presupuesto de costos, responsable y estado",
      "Eventos ↔ Tareas: cada evento liga tareas de ejecución (se crean desde el evento con venue y fecha límite ya puestos)",
      "Apps por usuario: en Usuarios ahora asignas qué apps ve cada quien (fila APPS); con asignación explícita el usuario ve SOLO esas apps + Perfil, sin asignación aplican los defaults de su rol",
      "Se retiraron Social y el Calendario mensual (sus atajos ahora abren Eventos)",
    ]
  },
  {
    version: "2.45.0",
    date: "2026-07-31",
    type: "MINOR",
    changes: [
      "Plataforma de reservas Fase 3 — Motor por mesas: disponibilidad calculada mesa por mesa (duraciones por grupo, buffer, pacing de cocina, combinaciones) con una sola implementación para app, link público y bot",
      "Parámetros por venue en Capacidad y horario: slot 15/30/60 min, duraciones por tamaño de grupo, buffer, pacing, % reservable en línea, grupo máx online y tolerancia de no-show — la regla de oro: todo número es configurable",
      "Nueva reserva: con motor activo se eligen horarios reales y la mesa se auto-asigna (mejor zona y capacidad); sobrecupo manual solo Ops/Master",
      "Link público: selector de horarios disponibles por fecha y grupo; grupos grandes se canalizan a WhatsApp",
      "Se activa por venue (switch 'Motor por mesas'); los venues sin motor siguen con cupo por noche",
    ]
  },
  {
    version: "2.44.1",
    date: "2026-07-31",
    type: "PATCH",
    changes: [
      "Registro con correo: la verificación de invitación fallaba para usuarios no-Google aunque la invitación existiera (RLS bloqueaba la consulta anónima) — ahora verifica vía función segura has_invitation",
    ]
  },
  {
    version: "2.44.0",
    date: "2026-07-30",
    type: "MINOR",
    changes: [
      "Plataforma de reservas Fase 2 — Piso operativo: nueva vista 'Piso' en Reservas con el plano en vivo (libre / reservada / sentada / en cuenta)",
      "Sentar desde el piso: toca una mesa libre y elige una reserva de hoy o registra un walk-in; barra con contador de asientos ocupados",
      "Ciclo de mesa: En cuenta → Cerrar mesa (libera y completa la reserva); Deshacer sentada por si fue error",
      "Horas reales de sentada, cuenta y salida quedan registradas por mesa — base de la calibración de duraciones (Fase 5)",
      "El piso se actualiza solo en todas las tablets del venue (realtime)",
    ]
  },
  {
    version: "2.43.0",
    date: "2026-07-30",
    type: "MINOR",
    changes: [
      "Plataforma de reservas Fase 1 — Zonas por venue: mesas o barra, reservable en línea, prioridad, horario propio y estado abierta/cerrada",
      "Editor de piso drag-and-drop (Reservas → botón de piso): el gerente arrastra mesas en el lienzo, define capacidad mín–máx y forma de cada una",
      "Combinaciones de mesas contiguas definidas por el gerente (ej. M3+M4) con capacidad combinada",
      "Capacidad total del venue autocalculada del mobiliario activo — nunca se captura a mano",
    ]
  },
  {
    version: "2.42.1",
    date: "2026-07-12",
    type: "PATCH",
    changes: [
      "Reservas: nueva vista 'Todas' — lista buscable de las reservas del venue (últimos 30 días en adelante) por nombre, teléfono o fecha; toca una para saltar a su día",
    ]
  },
  {
    version: "2.42.0",
    date: "2026-07-12",
    type: "MINOR",
    changes: [
      "Configuración de venue: horario de operación (abre/cierra) y cupo total por día, editable desde Reservas → Capacidad y horario",
      "Reservas — 'Espacios libres por hora': muestra hora por hora cuántos lugares quedan libres del cupo total, según las llegadas acumuladas (modelo de horarios libres)",
    ]
  },
  {
    version: "2.41.0",
    date: "2026-07-12",
    type: "MINOR",
    changes: [
      "Reservas en línea: link público por venue (?reservar=CÓDIGO) para que cualquiera reserve desde su teléfono, respetando cupo de la noche y umbral de apartado",
      "Reservas → botón Compartir: Master/Ops activa el link por venue y lo copia; las reservas entran como Solicitadas con fuente 'Reserva web' y aviso a Slack",
    ]
  },
  {
    version: "2.40.0",
    date: "2026-07-12",
    type: "MINOR",
    changes: [
      "Duplicar tarea — botón en el detalle que crea una copia con la misma configuración (área, venue, prioridad, horas, privacidad y links); arranca Abierta, sin fecha ni evidencia. Ideal para tareas recurrentes",
    ]
  },
  {
    version: "2.39.0",
    date: "2026-07-12",
    type: "MINOR",
    changes: [
      "Tareas — buscador por palabra clave: encuentra una tarea por cualquier parámetro (título, descripción, venue, persona, área, estatus, prioridad); soporta varias palabras",
      "Las unidades de negocio ahora se listan en orden alfabético en toda la app (Tareas, Concierge, Reservas, CRM, Usuarios, etc.)",
    ]
  },
  {
    version: "2.38.0",
    date: "2026-07-12",
    type: "MINOR",
    changes: [
      "Reacciones con emoji en los comentarios de Tareas y en la actividad de CRM (👍 ❤️ 🎉 …) — toca el ícono para reaccionar, toca de nuevo para quitar",
      "Se quitó el atajo de teclado 'C' para crear tarea (chocaba con copiar/pegar); la tarea se crea con el botón Crear tarea o desde la command palette",
    ]
  },
  {
    version: "2.37.2",
    date: "2026-07-12",
    type: "PATCH",
    changes: [
      "El bot también reconoce cuando el cliente responde a una HISTORIA de Instagram (incluidas historias promocionadas) y abre con el evento en promoción del FAQ",
      "Bandeja: chip 📖 Historia en esas conversaciones",
    ]
  },
  {
    version: "2.37.1",
    date: "2026-07-11",
    type: "PATCH",
    changes: [
      "El bot registra proveedores que escriben ofreciendo servicios (empresa, contacto, servicio, teléfono, correo) directo al directorio Comercial como Proveedor, avisa a Slack y escala — sin re-preguntar datos que ya dieron",
    ]
  },
  {
    version: "2.37.0",
    date: "2026-07-11",
    type: "MINOR",
    changes: [
      "Concierge — atribución de campañas: cuando un cliente escribe desde un anuncio (IG click-to-message o WhatsApp CTWA), el bot lo sabe y abre vendiendo ESE evento/promoción en vez del genérico '¿qué información necesitas?'",
      "La Bandeja muestra 📣 con el nombre del anuncio en las conversaciones que llegaron de campaña",
      "El referral queda guardado en la conversación — base para medir reservas por campaña",
    ]
  },
  {
    version: "2.36.1",
    date: "2026-07-11",
    type: "PATCH",
    changes: [
      "Perfil de HoH simplificado: sin Mi productividad ni integración de Slack — solo foto, Mi PIN y datos personales",
      "Login: el acceso de piso ahora se llama HoH",
    ]
  },
  {
    version: "2.36.0",
    date: "2026-07-11",
    type: "MINOR",
    changes: [
      "Acceso de piso (Heart of House): login con usuario + PIN, sin correo — pensado para la tablet del venue",
      "En Usuarios, Master crea el acceso (usuario ≥8 caracteres + PIN inicial + venue) y puede reiniciar el PIN",
      "El personal cambia su propio PIN desde Perfil para hacerlo personal",
      "Login: selector Correo / Equipo de piso en la pantalla de entrada",
    ]
  },
  {
    version: "2.35.0",
    date: "2026-07-10",
    type: "MINOR",
    changes: [
      "Tareas — el espacio de evidencia se divide en dos: Archivos adjuntos (subir) y Links adjuntos (referencias externas)",
      "Links adjuntos: pega varios links con nombre opcional; genera preview (YouTube embebido, imágenes/videos directos, favicon + dominio para el resto)",
      "Heart of House ahora también ve y gestiona Reservas — pensado para la tablet de host que tienen siempre en el venue",
    ]
  },
  {
    version: "2.34.0",
    date: "2026-07-10",
    type: "MINOR",
    changes: [
      "Tareas — nueva vista Lista: grupos colapsables por estatus (estilo tabla) con responsable, fecha límite, área y venue por fila",
      "Conmutador Kanban ↔ Lista en el header; tu elección queda guardada como tu vista default",
      "Alta rápida por grupo: escribe el título y Enter — la tarea nace en ese estatus y se completa después en el panel",
      "Los vencidos se marcan en rojo; misma data y filtros que el kanban",
    ]
  },
  {
    version: "2.33.1",
    date: "2026-07-10",
    type: "PATCH",
    changes: [
      "Editar tarea ahora registra en Actividad exactamente qué cambió, campo por campo (título, venue, área, prioridad, fechas, horas…) con el valor anterior y el nuevo",
      "Actividad muestra también las reasignaciones de tareas con quién → quién",
    ]
  },
  {
    version: "2.33.0",
    date: "2026-07-10",
    type: "MINOR",
    changes: [
      "Rol nuevo Dev · Auditoría: ve TODA la plataforma en solo lectura (dashboard, tareas, comercial, concierge con resumen y talento, La Casa, reportes, actividad)",
      "Propone mejoras creando tareas — su única escritura; sin acceso a Usuarios, Carga CSV ni Config del Concierge",
      "Disponible en Usuarios (invitar/cambiar rol) y en Vista previa por rol",
    ]
  },
  {
    version: "2.32.0",
    date: "2026-07-10",
    type: "MINOR",
    changes: [
      "Funciones por usuario: el rol define lo general y las funciones liberan áreas específicas por persona — se asignan desde Usuarios (Master)",
      "Primera función: 'Talento' — abre el booking de DJs y sus fees a alguien fuera de Ops (ej. el booker que vive en Marketing), incluyendo el fee en Comercial → DJs",
    ]
  },
  {
    version: "2.31.1",
    date: "2026-07-10",
    type: "PATCH",
    changes: [
      "Tareas: cualquier rol puede asignar tareas a cualquier persona al crearlas (antes solo Master/C-Level); para el equipo el campo arranca en 'yo' pero es editable",
    ]
  },
  {
    version: "2.31.0",
    date: "2026-07-10",
    type: "MINOR",
    changes: [
      "La Casa — arreglado el scroll en todas las hojas (checklist, reportar, plantillas, inventario): con listas largas ya se ve todo y el botón de enviar/revisar",
      "Feedback por foto: al tocar la foto de un punto se abre una pantalla con la imagen en grande donde el supervisor deja una observación puntual (solo si es necesario)",
      "El equipo de piso ve la observación 💬 marcada en el punto exacto al que se refiere",
    ]
  },
  {
    version: "2.30.2",
    date: "2026-07-10",
    type: "PATCH",
    changes: [
      "Marketing con acceso funcional completo en Concierge: ya puede crear/editar reservas y crear/editar clientes, no solo verlos",
      "Talento (DJs y fees) se mantiene solo para Ops/Master por ser dato de negociación",
    ]
  },
  {
    version: "2.30.1",
    date: "2026-07-10",
    type: "PATCH",
    changes: [
      "Perfil → Vista previa por rol: agregado Heart of House (faltaba desde que se creó el rol)",
      "Colores de rol completos para C-Level y Heart of House en el badge de perfil",
    ]
  },
  {
    version: "2.30.0",
    date: "2026-07-10",
    type: "MINOR",
    changes: [
      "Tareas: 'Tipo' reemplazado por 'Área' — 11 funciones reales del holding agrupadas en Operación / Comercial y Marketing / Corporativo / Tecnología",
      "Nuevo campo 'Impacto en cliente' (cara al cliente / interno) — el cliente puede ser consumidor F&B, huésped, cliente wellness o quien reserva un pod",
      "Las incidencias de La Casa se clasifican automáticamente como Mantenimiento e infraestructura",
      "Plantillas de tareas migradas al mismo esquema de área + impacto",
    ]
  },
  {
    version: "2.29.0",
    date: "2026-07-10",
    type: "MINOR",
    changes: [
      "Concierge → HOY: nueva primera pantalla de triage — todo accionable en 2 taps",
      "Cola 'Atiende ahora' priorizada (quejas → comprobantes → escaladas) con semáforo de espera; tap abre el hilo",
      "Reservas sin confirmar de hoy/mañana con botón Confirmar que avisa al cliente automáticamente",
      "La noche de hoy por venue: barra de ocupación, próximas llegadas; tap lleva a la agenda del venue",
      "Pulso de calidad del día: 1ª respuesta (mediana), esperando humano, % confirmadas, conversaciones",
    ]
  },
  {
    version: "2.28.0",
    date: "2026-07-09",
    type: "MINOR",
    changes: [
      "Directorio unificado — los DJs ya no viven en una base aparte: son contactos del directorio general con clasificación DJ y sus campos de talento (géneros, fee, rider, rating)",
      "Talento (Concierge) y el tab DJs de Comercial leen y escriben en el mismo directorio; las tocadas conservan todo su historial",
      "El bot registra DJs interesados directo en el directorio unificado",
    ]
  },
  {
    version: "2.27.0",
    date: "2026-07-09",
    type: "MINOR",
    changes: [
      "COMERCIAL — CRM y Directorio fusionados en una sola sección con tabs: Pipeline · Directorio · DJs",
      "El directorio de DJs (Talento) ahora se consulta desde Comercial; se sigue administrando en Concierge → Talento",
      "Marketing con acceso completo a Concierge: Bandeja (leer, tomar y responder), Reservas y Clientes",
      "Clientes consumidores fuera del directorio comercial — viven solo en Concierge → Clientes",
    ]
  },
  {
    version: "2.26.0",
    date: "2026-07-09",
    type: "MINOR",
    changes: [
      "LA CASA (Fase A) — la app operativa de piso, dentro de HOG APP",
      "Rol nuevo Heart of House: el personal de piso ve solo Mi turno · Reportar · Perfil",
      "Puestas a punto: checklists por venue con foto obligatoria por item, envío a revisión y aprobación del Ops Manager",
      "Reportar problema con foto — cada incidencia llega a Ops y se convierte en tarea de mantenimiento con un tap",
      "Inventario de mobiliario y hardware: ficha con foto, estado y costo; bitácora de cambios y traslados",
      "Ops Manager administra plantillas, revisa turnos y maneja inventario; C-Level entra en modo lectura",
    ]
  },
  {
    version: "2.25.0",
    date: "2026-07-08",
    type: "MINOR",
    changes: [
      "Config del Concierge rediseñada — un apartado por venue con bullets expandibles (Canales, Voz, Ritmo, Info bancaria, FAQ); sin espacio muerto",
      "Semáforo de conexión en vivo por canal, basado en tráfico real: verde = mensajes fluyendo, ámbar = encendido sin tráfico, gris = apagado",
      "Indicador ● por sección: se rellena cuando el Concierge ya tiene esa información",
      "Espacio para FAQ por venue listo — se guarda desde ya; el bot lo usará en la fase del viernes",
    ]
  },
  {
    version: "2.24.1",
    date: "2026-07-08",
    type: "PATCH",
    changes: [
      "Talento — crea al DJ directo desde el booking (nombre + fee + género, sin salir del flujo)",
      "Talento — log interno por DJ: cuántas veces tocó y cuánto cobró por cada fecha, con total y promedio",
    ]
  },
  {
    version: "2.24.0",
    date: "2026-07-08",
    type: "MINOR",
    changes: [
      "Talento — booking interno de DJs (Ops/Master): agenda semanal por venue, directorio con fee registrado y rider",
      "Gasto en fees del mes, tocadas y fee promedio de un vistazo; alta de DJ en 20 segundos",
      "Cada tocada registra su fee negociado, peticiones especiales de la fecha, estado y pago",
      "Bot (próximo deploy): vende la programación ('¿quién toca el sábado?') y recluta DJs que escriben por DM",
    ]
  },
  {
    version: "2.23.0",
    date: "2026-07-08",
    type: "MINOR",
    changes: [
      "Bandeja — las imágenes del cliente (comprobantes de depósito) se ven en el hilo; tap para abrir completa",
      "Bot: recibe imágenes por WhatsApp e Instagram; reconoce comprobantes de apartado y escala para validar",
      "Bot: notas operativas a la reserva ('voy en camino', 'llego tarde') con aviso instantáneo al equipo",
      "Bot: captura cumpleaños si el cliente lo menciona; quejas escalan con prioridad y dejan etiqueta en la ficha",
      "Bot: lista de espera manual cuando la noche está llena; si el grupo crece pide la diferencia del apartado",
    ]
  },
  {
    version: "2.22.0",
    date: "2026-07-08",
    type: "MINOR",
    changes: [
      "Bot: cancela reservas sin fricción cuando el cliente lo pide (auditado + Slack)",
      "Bot: al crear o modificar valida el cupo de la noche — nunca sobrevende; sobrecupo solo humano",
      "Bot: captura de eventos — fecha, pax aproximado, tipo de ocasión y área antes de escalar al equipo",
      "Clientes — cada ficha muestra quién la guardó (equipo o Concierge HOG) y por qué canal llegó (WhatsApp/Instagram)",
    ]
  },
  {
    version: "2.21.0",
    date: "2026-07-08",
    type: "MINOR",
    changes: [
      "Reservas — se eliminan los 3 horarios fijos: ahora es una hora de llegada libre, sin salida forzada",
      "El board de Reservas es una agenda por hora de llegada en lugar de columnas por turno",
      "Capacidad rediseñada: un cupo total por noche (reservas y pax) en vez de por horario — editor de Capacidad simplificado",
      "Bot Concierge ya no ofrece horarios fijos: pregunta la hora que el cliente prefiera y solo avisa si la noche está por llenarse",
    ]
  },
  {
    version: "2.20.0",
    date: "2026-07-08",
    type: "MINOR",
    changes: [
      "Bandeja — al confirmar una reserva, el cliente recibe su confirmación automática por el mismo canal",
      "Bot: el nombre del perfil de IG se usa solo para saludar (suele ser apodo) — el nombre real siempre se pide para la reserva",
      "Bot omnicanal: nombre y @handle de Instagram en la Bandeja, y anti-duplicados de reservas del mismo día",
    ]
  },
  {
    version: "2.19.1",
    date: "2026-07-08",
    type: "PATCH",
    changes: [
      "UX móvil — Dashboard: KPIs con sub-dato sin quebrarse, pulso operativo en tarjetas apiladas, fecha real en el subtítulo, nombre de marca sin duplicar",
      "UX móvil — Concierge: encabezado compacto (el top bar ya dice Concierge), pestañas sin cortarse (Config)",
      "Reservas recuerda tu último venue elegido en el dispositivo",
    ]
  },
  {
    version: "2.19.0",
    date: "2026-07-07",
    type: "MINOR",
    changes: [
      "Dashboard — Pulso operativo por marca: reservas del mes (bot vs manual), conversaciones del Concierge con escalaciones, y deals activos con pipeline en MXN",
      "KPIs nuevos arriba: Reservas del mes con % bot, Pipeline CRM total y actividad Social de la semana",
      "El indicador real para Master y C-Level: marketing + operación + ventas en una vista",
    ]
  },
  {
    version: "2.18.0",
    date: "2026-07-07",
    type: "MINOR",
    changes: [
      "Bandeja — preview de la reserva solicitada dentro del hilo con botón Confirmar (sin ir a buscarla al board)",
      "Bot: saludo siempre — breve, educado y funcional en el primer mensaje",
      "Bot: apartado OBLIGATORIO para grupos grandes — calcula pax × costo del onboarding, comparte CLABE y escala para validar el pago",
    ]
  },
  {
    version: "2.17.0",
    date: "2026-07-07",
    type: "MINOR",
    changes: [
      "Bandeja — responder como equipo ya LLEGA al WhatsApp del cliente (nueva función concierge-send)",
      "Onboarding de venues en Configuración: CLABE, banco y política de apartados por venue (piloto Bruma)",
      "El bot ofrece asegurar reservas grandes con depósito y comparte los datos solo si el cliente acepta",
      "Puente manual con CLABE en lo que se conecta Stripe (columna lista para su cuenta)",
    ]
  },
  {
    version: "2.16.1",
    date: "2026-07-07",
    type: "PATCH",
    changes: [
      "Reservas — cada tarjeta muestra quién reservó (miembro del equipo o Concierge HOG en brass)",
      "Las reservas del bot quedan en Actividad atribuidas a Concierge HOG",
      "Bot: el toggle ACTIVO/INACTIVO por venue+canal ahora sí manda — canal apagado pasa la conversación al equipo con aviso",
    ]
  },
  {
    version: "2.16.0",
    date: "2026-07-07",
    type: "MINOR",
    changes: [
      "Concierge unificado — Reservas, Bandeja del bot y Clientes viven ahora en una sola app",
      "Team/Ops ganan la Bandeja: pueden tomar conversaciones escaladas de sus venues",
      "Resumen y Configuración del bot siguen siendo solo Master",
      "Ícono nuevo (concha marina) — hospitalidad HOG y el mar; Marketing sin acceso a hospitalidad",
      "Los links viejos a Reservas (Slack/Calendario) redirigen solos a Concierge",
    ]
  },
  {
    version: "2.15.1",
    date: "2026-07-07",
    type: "PATCH",
    changes: [
      "Concierge — arreglado el scroll vertical de la pantalla (el contenido quedaba cortado)",
      "Bot: la ventana de cortesía ahora soporta horarios que cruzan medianoche (ej. 08:00–00:20)",
    ]
  },
  {
    version: "2.15.0",
    date: "2026-07-07",
    type: "MINOR",
    changes: [
      "Concierge Fase 2 (backend) — webhook + agente Claude conectan WhatsApp e Instagram vía Meta",
      "El bot busca disponibilidad real, crea clientes, crea reservas y escala a humano por herramientas",
      "Respeta el handoff: nunca responde si la conversación está en manos de un humano",
      "Cadena de 45s (batching) y seguimiento de 5 min despachados por cron, respetando ventana de cortesía",
      "Requiere secrets de Meta/Anthropic y activar el kill switch — inerte hasta configurarse",
    ]
  },
  {
    version: "2.14.0",
    date: "2026-07-07",
    type: "MINOR",
    changes: [
      "HOG Concierge (solo Master) — dashboard del bot de reservas: Resumen, Bandeja y Configuración",
      "Resumen: conversaciones por venue, % resuelto por bot, escalaciones, reservas por bot y conversión",
      "Bandeja en vivo con handoff humano↔bot: Tomar / Devolver al bot / Cerrar; responder toma la conversación",
      "Simulador de conversaciones para ensayar el flujo antes de conectar Meta",
      "Configuración sin deploy: kill switch global, voz por venue, delays (45s / 5min), ventana de cortesía y escalación por pax",
    ]
  },
  {
    version: "2.13.0",
    date: "2026-07-04",
    type: "MINOR",
    changes: [
      "Nueva reserva — botón \"Otro horario\" para capturar un horario a la medida (ej. 17:00–19:00)",
      "Pensado para eventos especiales o apertura anticipada; se toma sin límite de cupo",
      "El horario personalizado se guarda tal cual en la reserva sin tocar la capacidad configurada del venue",
    ]
  },
  {
    version: "2.12.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Usuarios — asignación de venues por usuario (chips con monograma + selector)",
      "Controla qué venues ve cada Ops/Team en Reservas; sin asignación = todos (se indica)",
      "Asignar/quitar venue queda auditado en Actividad",
    ]
  },
  {
    version: "2.11.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Aviso de privacidad completo como página pública (/?aviso=1) — derechos ARCO, finalidades, conservación",
      "El checkbox de consentimiento enlaza al resumen y a la página completa",
      "QA del programa Clientes + Reservas: arranque verificado en tablet 1024px y teléfono 390px sin errores",
    ]
  },
  {
    version: "2.10.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Calendario mensual muestra el conteo de reservas por día — tap abre Reservas en esa fecha",
      "Puente CRM: reserva de 15+ pax → 'Convertir en deal (Evento)' con contacto y deal pre-llenados",
      "Slack: aviso al canal en cada reserva nueva y en no-shows/cancelaciones de 8+ pax",
    ]
  },
  {
    version: "2.9.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Capacidad por venue — editor día × slot (máx. reservas y pax, activo) para Ops Manager+",
      "Atajo 'Copiar a la semana': replica los slots de un día en los otros 6",
      "Regla de sobrecupo: slot lleno bloquea el alta; Ops+ puede autorizar con registro a su nombre",
      "El sobrecupo valida tanto número de reservas como pax total del slot",
    ]
  },
  {
    version: "2.8.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Reservas — nuevo módulo: board del día por venue con realtime entre dispositivos",
      "Flujo de estados de un tap: Solicitada → Confirmada → Sentada → Completada (no-show/cancelar en menú)",
      "Completar una reserva registra la visita del cliente automáticamente — cero doble captura",
      "Alta de reserva ≤30s: busca cliente por teléfono o créalo inline, slots con disponibilidad",
      "Vista semanal con totales por día; capacidad por slot visible (6/10 reservas · 24/60 pax)",
      "Team aterriza en Reservas en tablet (Social en teléfono); Reservas en su bottom nav",
    ]
  },
  {
    version: "2.7.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Clientes — nuevo tab en el Directorio: base de clientes consumidores separada del B2B",
      "Alta en 2 pasos optimizada para el host stand, con dedupe por teléfono (E.164 único)",
      "Perfil de cliente: KPIs (visitas, no-shows), historial, próximas reservas, consentimientos, WhatsApp directo",
      "Privacidad LFPDPPP: consentimientos con timestamp, marketing opt-in nunca pre-marcado, anonimizar/eliminar solo MASTER",
      "Deep-link ?guest= abre el perfil sobre cualquier vista; todo auditado en Actividad",
    ]
  },
  {
    version: "2.6.1",
    date: "2026-06-18",
    type: "PATCH",
    changes: [
      "Móvil: las tarjetas de tareas y deals ya no se encogen — la lista scrollea correctamente",
      "Fases de Tareas y CRM como barra scrolleable horizontal con labels completos",
      "Color coding por fase: punto de color en cada segmento y tinte en el activo",
      "Header y banner 'Viendo como' respetan el notch/safe-area de iOS",
    ]
  },
  {
    version: "2.6.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Dashboard v2 — tarjetas de BU con monograma, salud como barra en el borde superior y dimensiones A–E como tira compacta de 5 segmentos",
      "Analítica y Mi productividad usan los tiles KPI del sistema v2",
      "Actividad, Usuarios y Perfil con headers en español",
      "Rediseño v2 completo: los 8 módulos entregados",
    ]
  },
  {
    version: "2.5.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Calendario unificado — un solo módulo con tabs Operación (tareas + eventos) y Contenido",
      "Los accesos 'Calendario' y 'Contenido' del menú abren el mismo hub con su tab preseleccionado",
      "Calendario en español (días, meses, header); eventos CRM conservan el tratamiento rosa 🎉",
    ]
  },
  {
    version: "2.4.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Objetivos v2 — el % de avance es el héroe (mono grande), barra delgada",
      "Desglose mensual como mini-tabla de 3 celdas (real vs meta por mes, con % y barra)",
      "Selector de trimestre como control segmentado",
      "El rol Team ahora aterriza en Social al entrar; managers en Tareas, Master en Dashboard",
      "Corregido: el borrador de autoevaluación ya no se pierde con el auto-refresh",
      "Objetivos completo en español",
    ]
  },
  {
    version: "2.3.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Social v2 — el composer es una sola línea que se expande al enfocarlo (patrón X/Twitter)",
      "Reacciones con área táctil de 44px+",
      "Directorio v2 — riel alfabético de scroll rápido en móvil",
      "Tipos de contacto en español (Cliente venue, Patrocinador, Socio, Proveedor, Prospecto)",
      "Directorio completo en español",
    ]
  },
  {
    version: "2.2.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "CRM v2 — el valor del deal es el ancla visual (mono grande) con línea de probabilidad debajo",
      "KPIs como tiles compactos con scroll horizontal en móvil (Pipeline, Ganado, Abiertos, Win rate)",
      "Móvil: lista por etapa con control segmentado en vez de kanban horizontal",
      "Créditos en el detalle del deal — 🔍 Finder y 🏆 Closer con avatares (base de comisiones)",
      "Motivo de pérdida ahora es OBLIGATORIO al marcar un deal como perdido",
      "Etapas y panel en español (Contactado, Propuesta, Negociación, Ganado, Perdido)",
    ]
  },
  {
    version: "2.1.0",
    date: "2026-06-18",
    type: "MINOR",
    changes: [
      "Tareas v2 — tarjetas compactas: prioridad como borde lateral, avatar del asignado, chip de BU con monograma, conteo de evidencias 📎",
      "Móvil: adiós kanban horizontal — lista por estado con control segmentado fijo bajo el header",
      "Desliza → para mover de estado (con hoja de selección), ← para abrir el detalle",
      "Cambio de estado unificado: el swipe y el panel disparan las mismas notificaciones (Slack, DM, log)",
      "Panel de detalle: metadata colapsable en 'Detalles' — comentarios y evidencia ganan espacio",
      "Modal de crear tarea y board en español",
    ]
  },
  {
    version: "2.0.0",
    date: "2026-06-18",
    type: "MAJOR",
    changes: [
      "Rediseño v2 — tema 'back-of-house at midnight': oscuros cálidos + acento latón en toda la app",
      "Paleta de búsqueda ⌘K / Ctrl+K — salta a módulos, busca tareas/deals/contactos, crea tareas",
      "Navegación móvil de 5 slots por rol + hoja 'Más' para el resto de vistas",
      "Campana de notificaciones al top bar (adiós FAB flotante); mismo badge y apertura de tareas",
      "Navegación y chrome unificados a español (es-MX)",
      "Sistema de identidad por unidad de negocio (tono fijo + monograma) listo para los siguientes módulos",
    ]
  },
  {
    version: "1.14.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Role preview — MASTER can view the app as any role from Profile to test access levels; amber banner with one-click exit",
      "Social redesigned as a true feed: centered column, card composer, edge-to-edge media, relative timestamps, bigger touch targets",
      "Mobile: social cards go full-bleed, greeting/composer scroll with the feed for more reading space",
      "Mobile: all create/edit forms (CRM, Directory, Objectives, Deal panel) now collapse to one column on narrow screens",
    ]
  },
  {
    version: "1.13.2",
    date: "2026-06-17",
    type: "PATCH",
    changes: [
      "Profile — new 'My Productivity' card so every user can see their own hours",
      "Shows weekly hours vs 40h goal, total credited hours, deals brought/closed, and actions",
      "Warns when approved tasks are missing estimated hours (so they don't count)",
    ]
  },
  {
    version: "1.13.1",
    date: "2026-06-17",
    type: "PATCH",
    changes: [
      "Social — rich link previews for articles/links (image, title, description) so you never leave the app",
      "Video/audio links (YouTube, Instagram, TikTok) already play inline; PDFs, images and HTML render inline too",
      "Link previews are cached and shown in the composer before publishing",
    ]
  },
  {
    version: "1.13.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Social redesigned as a real feed — one thought/copy box plus attachment tools",
      "Text-only posts supported; attach a link or a file to any thought",
      "Attachment preview before publishing, removable in one click",
      "Changelog modal is now collapsible — click any version to see its full log",
    ]
  },
  {
    version: "1.12.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "CRM → Calendar — deals of type EVENT now appear on the Calendar",
      "New dedicated Event Date field on EVENT deals (create + edit)",
      "Calendar events are pink with a 🎉 icon; click opens the deal panel inline",
      "Header shows a monthly events count alongside tasks",
    ]
  },
  {
    version: "1.11.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Activity Log — new Analytics tab with team productivity metrics",
      "Hours worked per user vs the 40h/week goal (auto from approved task hours)",
      "Deals brought $ (finder) and closed $ (closer) per user",
      "Actions per user, directory contact count, HOG team count, pipeline & won value",
      "Estimated build effort (horas nalga) derived from the changelog",
    ]
  },
  {
    version: "1.10.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Objectives — quarterly OKR dashboard with numeric metrics and automatic % progress",
      "Quarterly goals cascade to a monthly breakdown (per-month target + actual)",
      "C-Level set company objectives; managers set objectives for themselves and their team",
      "Self-evaluation (1-5 stars + note) on your own objectives",
      "Quarter/year selector with Company / Mine / Team sections and progress tiles",
    ]
  },
  {
    version: "1.9.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Social — new team feed with a daily welcome greeting",
      "Share links with auto-embed: YouTube (videos + shorts), Instagram (posts/reels), TikTok",
      "Share PDFs, images and HTML — rendered inline like task proofs",
      "Reactions on every post (👍 ❤️ 🔥); comments coming next",
      "Accessible to all roles from sidebar, bottom nav, and the app launcher",
    ]
  },
  {
    version: "1.8.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Directory — unified internal directory: external contacts + HOG team in one place",
      "Filter contacts by type (Venue Client, Sponsor, Partner, Vendor, Prospect, HOG Team)",
      "Finder tracking — every contact records who added it (finder's-fee owner)",
      "Closer tracking — deals record who closed them (closing-commission owner), shown in the deal log",
      "Entry-level (TEAM) users only see Venue Clients; managers & C-Level see the full directory",
      "Only MASTER can archive or delete contacts",
    ]
  },
  {
    version: "1.7.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Rebranded HOG OPS → HOG APP across the app, PWA manifest, emails, and notifications",
      "Each sub-app now shows its own title in the sidebar and mobile top bar",
    ]
  },
  {
    version: "0.1.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Initial build — Supabase schema, auth, user onboarding",
      "14 Business Units seeded from spec data",
      "Master Dashboard with BU Health Grid (14 cards)",
      "BU Onboarding Scoring Form — all 5 dimensions with live preview",
      "Health Score Engine — A/B/C/D/E dimensions",
      "Version badge + Changelog modal",
      "Role-based auth (MASTER / OPS_MANAGER / MARKETING / TEAM)",
      "Full design system — Geist fonts, green accent, dark base"
    ]
  },
  {
    version: "0.2.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Task Board — full kanban with 5 columns (Open, In Progress, Proof Submitted, Approved, Revision)",
      "Create Task modal — keyboard shortcut C from anywhere",
      "Task cards with priority, assignee, due date, proof indicator",
      "Filters by BU, priority, type, status",
      "Real-time task updates via Supabase"
    ]
  },
  {
    version: "0.3.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Task detail slide-over panel — view, edit, and change status inline",
      "Profile screen — avatar upload, personal info editor",
      "Slack webhook integration — connect a channel for task notifications",
      "Profile accessible from sidebar"
    ]
  },
  {
    version: "0.3.1",
    date: "2026-05-25",
    type: "PATCH",
    changes: [
      "Marketing Dashboard restricted to MASTER and C_LEVEL roles only",
      "Added C_LEVEL role — full dashboard visibility, no admin controls",
      "Non-privileged users land on Task Board by default"
    ]
  },
  {
    version: "0.4.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Task Proofs — upload photos/videos as evidence, auto-sets PROOF_SUBMITTED",
      "User Invitations — MASTER can invite team members with pre-assigned roles",
      "Slack auto-notifications — task created, status changed, proof uploaded",
      "App-wide Slack webhook stored in Supabase settings"
    ]
  },
  {
    version: "0.5.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Mobile-first layout — bottom navigation bar replaces sidebar on small screens",
      "Task detail panel goes full-screen on mobile",
      "Create task modal goes full-screen on mobile",
      "Changelog modal goes full-screen on mobile",
      "Filter bar and KPI strip scroll horizontally on small screens"
    ]
  },
  {
    version: "0.5.1",
    date: "2026-05-25",
    type: "PATCH",
    changes: [
      "Version badge hidden — now lives at the bottom of the Activity Log",
      "Collapsible dot replaced with inline badge (hover to reveal, click to open changelog)"
    ]
  },
  {
    version: "0.7.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Notification bell — real-time badge with unread count, per-user dropdown",
      "Push notifications via browser Notification API (Android + iOS PWA)",
      "Notifies admins and task assignees on: task created, status changed, proof uploaded, comment posted",
      "Mark all read / mark individual read on click",
      "Enable push banner inside the bell if permission not yet granted"
    ]
  },
  {
    version: "0.6.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Activity Log — real-time audit trail of all platform actions with user attribution",
      "Tracks: task created, status changed, proof uploaded, comment posted, user invited",
      "Activity stats: actions today, this week, total, most active user",
      "Avatar upload fixed — errors now surface, cache-busting prevents stale images",
      "Invitation-only access — Google OAuth and email signup blocked without a valid invite",
      "Uninvited users see an 'Access denied' banner and are signed out immediately"
    ]
  },
  {
    version: "0.8.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Task archiving — archive any task from the detail panel, restore at any time",
      "Archived tasks filter — toggle 'Archived' in the Task Board filter bar to view them",
      "Archived tasks are hidden from the main board by default",
      "ARCHIVED badge shown in the task header when viewing an archived task",
      "Archive and restore actions tracked in Activity Log"
    ]
  },
  {
    version: "1.6.0",
    date: "2026-06-16",
    type: "MINOR",
    changes: [
      "Open tasks/deals in an overlay panel straight from a notification — keep working on the screen you were on",
      "Click any task notification in the bell to open it in a slide-over without leaving your current view",
      "Slack DMs now include a direct 'Open in HOG OPS' deep-link to the task or deal",
      "Deal stage changes now also DM the deal owner",
    ]
  },
  {
    version: "1.5.3",
    date: "2026-06-16",
    type: "PATCH",
    changes: [
      "Slack DM notifications confirmed working — fixed missing chat:write scope on bot",
      "Improved error surfacing in Slack DM client code",
    ]
  },
  {
    version: "1.5.2",
    date: "2026-06-16",
    type: "PATCH",
    changes: [
      "Slack DM on task comment — assignee gets a DM when someone comments on their task",
      "Slack DM on CRM activity — deal owner gets a DM when someone logs a note/call/email on their deal",
    ]
  },
  {
    version: "1.5.1",
    date: "2026-06-16",
    type: "PATCH",
    changes: [
      "Fix Slack ID save for other users — RLS policy now allows MASTER to update all profiles",
      "Save button replaces unreliable onBlur for Slack ID assignment in User Management",
    ]
  },
  {
    version: "1.5.0",
    date: "2026-06-16",
    type: "MINOR",
    changes: [
      "Contacts directory — shared prospect/client list accessible to all users with search and deal count badge",
      "Author avatars — initials avatar shown on every task comment and CRM activity log entry",
      "Deal creator tracking — 'Deal created by' is always shown at the bottom of the activity timeline",
      "Slack DM bot — per-user Slack notifications via bot (task assigned, status changed) instead of channel-only",
      "Slack ID management — MASTER can assign Slack Member IDs to teammates from User Management"
    ]
  },
  {
    version: "1.4.0",
    date: "2026-06-03",
    type: "MINOR",
    changes: [
      "User Management — view all team members, edit roles inline, remove with confirmation",
      "Role changes and removals now show success/error feedback (surfaces RLS failures)",
      "Task Board & CRM default to showing the logged-in user's tasks/deals on load",
      "Task visibility extended — see tasks you're assigned to, created, or following",
      "Real-time auto-refresh — live updates on tab focus, visibility change, and 20s polling",
      "Notification bell converted to a fixed floating FAB, sits above mobile bottom nav",
      "Nav restricted to Task Board, CRM, and Profile for non-MASTER users",
      "Assignee and team-member dropdowns now filter out incomplete/ghost profiles",
      "Version number displayed below the login card",
      "Archived proofs hidden from task panel, archive events logged in Activity Log"
    ]
  },
  {
    version: "1.3.0",
    date: "2026-05-29",
    type: "MINOR",
    changes: [
      "Reports — upload HTML reports to Supabase Storage and open them inside the app",
      "Internal HTML viewer — full-screen iframe overlay with toolbar, ESC to close",
      "Task proofs now accept HTML files in addition to images, video, and PDF",
      "HTML proofs render inline (iframe) in the task panel and open full-screen in the proof modal",
      "Reports accessible from sidebar, bottom nav, and H app launcher",
      "BU tagging, drag & drop upload, inline rename, and delete on report cards"
    ]
  },
  {
    version: "1.2.0",
    date: "2026-05-26",
    type: "MINOR",
    changes: [
      "CRM Pipeline — manage commercial opportunities (sponsorships, partnerships, advertising, events) in a 6-stage Kanban",
      "Deal cards with value, probability bar, contact, BU badge, and close date",
      "Deal detail panel — stage switcher, lost-reason modal, edit mode, contact block",
      "Linked Tasks — connect any deal to existing tasks for traceability, open task panel inline",
      "Activity log per deal — log calls, emails, meetings, and notes with author and timestamp",
      "Pipeline stats header — total pipeline value, won value, open deal count, win rate",
      "Contact management — create new contacts inline or pick from existing ones",
      "Keyboard shortcut 3 → CRM (Calendar shifts to 4, Content to 5, Revenue to 6)"
    ]
  },
  {
    version: "1.1.0",
    date: "2026-05-26",
    type: "MINOR",
    changes: [
      "Content Calendar — monthly planning grid for social media content by BU and platform",
      "Plan posts for Instagram, Facebook, WhatsApp, TikTok or Other",
      "Content types: Post, Story, Reel, Video, Carousel",
      "Status workflow: Draft → Scheduled → Published (or Cancelled)",
      "Write full captions/copy with character counter directly in the calendar",
      "Link content entries to existing tasks for traceability",
      "Internal notes field for design requests and team instructions",
      "Filter by BU, platform, and status — platform color legend always visible",
      "Click any day cell + to add content, click an entry to edit or delete"
    ]
  },
  {
    version: "1.0.0",
    date: "2026-05-26",
    type: "MAJOR",
    changes: [
      "Calendar view — monthly grid showing all tasks with due dates, color-coded by priority",
      "Navigate months with arrows, filter by BU, click any task to open its detail panel",
      "Task Templates — MASTER/C_LEVEL can create, edit and delete reusable task blueprints",
      "Templates pre-fill type, priority, description, estimated hours, deadline type and BU",
      "Template picker in Create Task modal — any team member can apply a template",
      "Keyboard shortcut 3 → Calendar, 6 → Templates"
    ]
  },
  {
    version: "0.9.0",
    date: "2026-05-26",
    type: "MINOR",
    changes: [
      "Public / Private tasks — toggle visibility on any task from the detail panel or at creation",
      "Private tasks are only visible to creator, assignee, and related people",
      "Related People — add followers to any task so they can view and track progress",
      "Followers shown as pills on the task detail panel, removable with one click",
      "Lock icon on TaskCard for private tasks",
      "Outsiders with an invite can now use private tasks exclusively for their own work"
    ]
  }
]
