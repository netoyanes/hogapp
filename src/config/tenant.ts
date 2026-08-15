// ─── Tenant configuration ────────────────────────────────────────────────────
// Change this file when forking for a new client. Everything else stays the same.

export interface TenantConfig {
  appName: string
  appSubtitle: string
  logo: { type: 'symbol' } | { type: 'letter'; letter: string; bg: string; fg: string }
  // Views available in this deployment. Role-based access still applies within this set.
  enabledViews: string[]
  // Per-sub-app title shown in the header/subtitle for each view.
  viewTitles: Record<string, string>
}

// ── HOG APP (default) ──
export const TENANT: TenantConfig = {
  appName: 'HOG APP',
  appSubtitle: 'Command Center',
  logo: { type: 'symbol' },
  enabledViews: [
    'resumen', 'dashboard', 'pulso', 'finanzas', 'nomina', 'tasks', 'crm', 'concierge', 'casa', 'events', 'objectives',
    'revenue', 'reports', 'activity', 'upload', 'templates',
    'invite', 'profile',
  ],
  viewTitles: {
    resumen:   'Mi Resumen',
    dashboard: 'Dashboard',
    pulso:     'Pulso Social',
    finanzas:  'Finanzas',
    tasks:     'Tareas',
    crm:       'Comercial',
    contacts:  'Comercial',
    events:    'Proyectos',
    content:   'Contenido',
    revenue:   'Ingresos',
    reports:   'Reportes',
    activity:  'Actividad',
    upload:    'Carga CSV',
    templates: 'Plantillas',
    concierge: 'Concierge',
    casa:      'La Casa',
    invite:    'Usuarios',
    profile:   'Perfil',
    social:    'Social',
    objectives:'Objetivos',
  },
}

// Returns the sub-app title for a view, falling back to the app subtitle.
export function viewTitle(view: string): string {
  return TENANT.viewTitles[view] ?? TENANT.appSubtitle
}

// ── SWELLS (example — paste into tenant.ts when deploying for Swells) ──
//
// export const TENANT: TenantConfig = {
//   appName: 'SWELLS',
//   appSubtitle: 'Command Center',
//   logo: { type: 'letter', letter: 'S', bg: '#0C4A6E', fg: '#FFFFFF' },
//   enabledViews: ['dashboard', 'tasks', 'crm', 'contacts', 'invite', 'profile'],
// }
