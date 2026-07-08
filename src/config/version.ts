export const APP_VERSION = "2.16.1"

export type ChangelogEntry = {
  version: string
  date: string
  type: "MAJOR" | "MINOR" | "PATCH"
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
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
