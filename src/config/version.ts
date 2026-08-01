export const APP_VERSION = "2.49.3"

export type ChangelogEntry = {
  version: string
  date: string
  type: "MAJOR" | "MINOR" | "PATCH"
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
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
