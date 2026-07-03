// E.164 phone helpers — MX-first (+52 default for 10-digit local numbers).
// The DB enforces ^\+[1-9][0-9]{7,14}$; normalize BEFORE any insert/lookup.

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('+')) {
    const d = trimmed.slice(1).replace(/\D/g, '')
    return /^[1-9][0-9]{7,14}$/.test(d) ? `+${d}` : null
  }
  const only = trimmed.replace(/\D/g, '')
  if (only.length === 10) return `+52${only}`                    // celular MX local
  if (only.length === 12 && only.startsWith('52')) return `+${only}`
  if (only.length === 13 && only.startsWith('521')) return `+52${only.slice(3)}` // legado WhatsApp +521
  if (only.length === 11 && only.startsWith('1')) return `+${only}`              // US/CA
  return null
}

/** +525511110001 → "+52 55 1111 0001" (display only) */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+52(\d{2})(\d{4})(\d{4})$/)
  if (m) return `+52 ${m[1]} ${m[2]} ${m[3]}`
  return e164
}

export function waLink(e164: string): string {
  return `https://wa.me/${e164.replace('+', '')}`
}
