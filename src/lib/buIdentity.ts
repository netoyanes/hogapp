// ─────────────────────────────────────────────────────────────────────────────
// BU identity system — the app's visual fingerprint.
// Each business unit has a FIXED hue + 2-letter monogram, used everywhere a BU
// appears (task cards, deals, calendar dots, health grid, filters).
//
// Hues are hand-tuned on a warm-shifted wheel (moderate saturation, ~60%
// lightness) so all 14 harmonize with the brass/amber theme. The 30–45° zone
// is reserved for the accent so no BU ever reads as "primary action".
// Unknown codes fall back to a deterministic hash hue.
// ─────────────────────────────────────────────────────────────────────────────

interface BUIdentity { h: number; s: number; l: number }

const BU_HUES: Record<string, BUIdentity> = {
  AJ:    { h: 16,  s: 60, l: 60 },  // Ajeno — terracotta
  CT:    { h: 160, s: 35, l: 58 },  // Calmabytonic — sage
  BM:    { h: 205, s: 45, l: 62 },  // Bruma MZT — steel blue
  BR:    { h: 275, s: 40, l: 66 },  // Bruma Records — violet
  PC:    { h: 335, s: 45, l: 66 },  // POD Condesa — rose
  PM:    { h: 192, s: 35, l: 55 },  // POD Mazatlán — teal
  AR:    { h: 24,  s: 55, l: 58 },  // Apricot ROMA — copper
  AM:    { h: 350, s: 50, l: 64 },  // Apricot MZT — coral
  ET:    { h: 250, s: 35, l: 66 },  // Eterno — periwinkle
  AC:    { h: 85,  s: 30, l: 55 },  // Amorcafemx — olive
  CM:    { h: 52,  s: 45, l: 58 },  // Cafesca_mx — gold
  CC:    { h: 120, s: 30, l: 55 },  // Casa Coyote — moss
  TONIC: { h: 172, s: 40, l: 55 },  // TONIC IV — aqua
  HG:    { h: 35,  s: 12, l: 62 },  // HOG corporate — warm gray
}

function hashHue(code: string): BUIdentity {
  let h = 0
  for (let i = 0; i < code.length; i++) h = code.charCodeAt(i) + ((h << 5) - h)
  return { h: Math.abs(h) % 360, s: 38, l: 60 }
}

function identity(code: string): BUIdentity {
  return BU_HUES[code.toUpperCase()] ?? hashHue(code)
}

/** Solid BU color — dots, bars, text on dark surfaces. */
export function buColor(code: string): string {
  const { h, s, l } = identity(code)
  return `hsl(${h}, ${s}%, ${l}%)`
}

/** Translucent fill for chip backgrounds. */
export function buColorBg(code: string): string {
  const { h, s, l } = identity(code)
  return `hsla(${h}, ${s}%, ${l}%, 0.14)`
}

/** Border tint for chips. */
export function buColorBorder(code: string): string {
  const { h, s, l } = identity(code)
  return `hsla(${h}, ${s}%, ${l}%, 0.35)`
}

/** 2-letter monogram (TONIC → TO). */
export function buMonogram(code: string): string {
  return code.slice(0, 2).toUpperCase()
}
