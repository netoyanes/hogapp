// ─────────────────────────────────────────────────────────────────────────────
// Acceso de piso (Heart of House): usuario + PIN, sin correo.
// El usuario se convierte en un email sintético para reusar Supabase Auth (y con
// ello toda la RLS por auth.uid()). El PIN es la contraseña real; se le antepone
// un prefijo fijo para superar el mínimo de longitud de Supabase — el staff solo
// conoce y escribe su PIN.
// ─────────────────────────────────────────────────────────────────────────────

export const HOH_EMAIL_DOMAIN = 'piso.hoglocal.app'

// usuario → email interno. El usuario ya viene normalizado (a-z0-9, minúsculas).
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${HOH_EMAIL_DOMAIN}`
}

// PIN → contraseña de Supabase (prefijo fijo para pasar el mínimo de 6 chars).
export function pinToPassword(pin: string): string {
  return `hog-pin-${pin.trim()}`
}

// Reglas: usuario mínimo 8, solo letras/números en minúscula; PIN 4–6 dígitos.
export function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}
export function isValidUsername(u: string): boolean {
  return /^[a-z0-9]{8,}$/.test(u)
}
export function isValidPin(p: string): boolean {
  return /^\d{4,6}$/.test(p)
}
