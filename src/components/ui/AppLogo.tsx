interface Props {
  size?: number
  color?: string
}

export function AppLogo({ size = 20, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {/* Top arc */}
      <path d="M 24.73 15.21 A 43 43 0 0 1 75.27 15.21 L 65.87 28.16 A 27 27 0 0 0 34.13 28.16 Z" fill={color} />
      {/* Right arc */}
      <path d="M 84.79 24.73 A 43 43 0 0 1 84.79 75.27 L 71.84 65.87 A 27 27 0 0 0 71.84 34.13 Z" fill={color} />
      {/* Bottom arc */}
      <path d="M 75.27 84.79 A 43 43 0 0 1 24.73 84.79 L 34.13 71.84 A 27 27 0 0 0 65.87 71.84 Z" fill={color} />
      {/* Left arc */}
      <path d="M 15.21 75.27 A 43 43 0 0 1 15.21 24.73 L 28.16 34.13 A 27 27 0 0 0 28.16 65.87 Z" fill={color} />
    </svg>
  )
}

// Self-contained badge — dark green square with cream symbol
export function AppLogoBadge({ size = 28, radius = 6 }: { size?: number; radius?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: '#1B3A20',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <AppLogo size={size * 0.62} color="#F5F0E8" />
    </div>
  )
}
