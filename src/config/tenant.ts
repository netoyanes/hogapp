// ─── Tenant configuration ────────────────────────────────────────────────────
// Change this file when forking for a new client. Everything else stays the same.

export interface TenantConfig {
  appName: string
  appSubtitle: string
  logo: { type: 'symbol' } | { type: 'letter'; letter: string; bg: string; fg: string }
  // Views available in this deployment. Role-based access still applies within this set.
  enabledViews: string[]
}

// ── HOG OPS (default) ──
export const TENANT: TenantConfig = {
  appName: 'HOG OPS',
  appSubtitle: 'Command Center',
  logo: { type: 'symbol' },
  enabledViews: [
    'dashboard', 'tasks', 'crm', 'contacts', 'calendar', 'content',
    'revenue', 'reports', 'activity', 'upload', 'templates',
    'invite', 'profile',
  ],
}

// ── SWELLS (example — paste into tenant.ts when deploying for Swells) ──
//
// export const TENANT: TenantConfig = {
//   appName: 'SWELLS',
//   appSubtitle: 'Command Center',
//   logo: { type: 'letter', letter: 'S', bg: '#0C4A6E', fg: '#FFFFFF' },
//   enabledViews: ['dashboard', 'tasks', 'crm', 'contacts', 'invite', 'profile'],
// }
