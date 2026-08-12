// ─────────────────────────────────────────────────────────────────────────────
// UI copy — single source of truth, es-MX.
// Sentence case, active voice; buttons say exactly what they do.
// Modules migrate their copy here as each one is redesigned (v2).
// English can be added later by swapping this map behind the same keys.
// ─────────────────────────────────────────────────────────────────────────────

export const STR = {
  common: {
    save: 'Guardar cambios',
    saving: 'Guardando…',
    saved: 'Guardado',
    cancel: 'Cancelar',
    create: 'Crear',
    edit: 'Editar',
    delete: 'Eliminar',
    archive: 'Archivar',
    restore: 'Restaurar',
    search: 'Buscar…',
    close: 'Cerrar',
    confirm: 'Confirmar',
    loading: 'Cargando…',
    retry: 'Reintentar',
    seeAll: 'Ver todo',
    today: 'Hoy',
    of: 'de',
  },
  nav: {
    resumen: 'Mi Resumen',
    dashboard: 'Dashboard',
    pulso: 'Pulso Social',
    finanzas: 'Finanzas',
    tasks: 'Tareas',
    crm: 'Comercial',
    reservations: 'Reservas',
    directory: 'Directorio',
    social: 'Social',
    objectives: 'Objetivos',
    events: 'Proyectos',
    calendar: 'Calendario',
    content: 'Contenido',
    revenue: 'Ingresos',
    activity: 'Actividad',
    templates: 'Plantillas',
    upload: 'Carga CSV',
    invite: 'Usuarios',
    reports: 'Reportes',
    concierge: 'Concierge',
    casa: 'La Casa',
    profile: 'Perfil',
    more: 'Más',
  },
  errors: {
    generic: 'Algo salió mal. Intenta de nuevo.',
    network: 'Sin conexión. Revisa tu internet y reintenta.',
    permission: 'No tienes permiso para hacer esto.',
    notFound: 'No encontramos lo que buscas.',
  },
  empty: {
    tasks: 'Aún no hay tareas. Crea la primera con C.',
    deals: 'Aún no hay oportunidades. Crea la primera.',
    contacts: 'El directorio está vacío. Agrega el primer contacto.',
    social: 'Aún no hay nada. Sé el primero en compartir algo.',
    objectives: 'No hay objetivos este trimestre. Crea el primero.',
    notifications: 'Sin notificaciones por ahora.',
    search: 'Nada coincide con tu búsqueda.',
  },
  viewAs: {
    banner: (role: string) => `Viendo como ${role}`,
    exit: 'Salir',
  },
} as const
