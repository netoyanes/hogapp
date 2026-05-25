import { useEffect, useRef } from 'react'

interface Props {
  label: string
  score: number
  max: number
  animate?: boolean
}

export function ScoreBar({ label, score, max, animate = true }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const pct = max > 0 ? (score / max) * 100 : 0
  const color = pct >= 80 ? '#22C55E' : pct >= 60 ? '#EAB308' : pct > 0 ? '#EF4444' : '#3A3A3A'

  useEffect(() => {
    if (!barRef.current || !animate) return
    const el = barRef.current
    el.style.width = '0%'
    const raf = requestAnimationFrame(() => {
      el.style.transition = 'width 0.7s ease-out'
      el.style.width = `${pct}%`
    })
    return () => cancelAnimationFrame(raf)
  }, [pct, animate])

  return (
    <div className="flex items-center gap-2">
      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} className="text-xs w-16 shrink-0">
        {label}
      </span>
      <div style={{ background: 'var(--border-default)' }} className="flex-1 h-1.5 rounded-full overflow-hidden">
        <div
          ref={barRef}
          style={{ background: color, width: animate ? '0%' : `${pct}%` }}
          className="h-full rounded-full"
        />
      </div>
      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} className="text-xs w-10 text-right shrink-0">
        {score}/{max}
      </span>
    </div>
  )
}
