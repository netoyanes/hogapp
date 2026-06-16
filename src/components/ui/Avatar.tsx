const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#22C55E', '#EAB308', '#14B8A6', '#F43F5E']

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function pickColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: pickColor(name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        fontSize: Math.round(size * 0.38),
        fontWeight: 700, color: '#fff',
        fontFamily: 'var(--font-ui)',
        userSelect: 'none',
      }}
    >
      {getInitials(name)}
    </div>
  )
}
