export const APP_VERSION = "0.1.0"

export type ChangelogEntry = {
  version: string
  date: string
  type: "MAJOR" | "MINOR" | "PATCH"
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
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
  }
]
