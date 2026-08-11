import { useEffect, useState, type ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// CLICK DERECHO — menú contextual genérico (Editar · Duplicar · Archivar…).
// Uso: const { openMenu, menuElement } = useContextMenu()
//      <tr onContextMenu={e => openMenu(e, [{ label, icon, onClick }...])}>
//      … y renderiza {menuElement} una vez en el componente.
// En táctil no hay click derecho: las mismas acciones deben existir en la UI.
// ─────────────────────────────────────────────────────────────────────────────

export interface CtxItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  onClick: () => void
}

export function useContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null)

  const openMenu = (e: React.MouseEvent, items: CtxItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  const menuElement = menu ? (
    <div style={{
      position: 'fixed', zIndex: 300,
      left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - menu.items.length * 40 - 12),
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10,
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden', minWidth: 180, padding: 4,
    }}>
      {menu.items.map((it, i) => (
        <button key={i}
          onClick={e => { e.stopPropagation(); setMenu(null); it.onClick() }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 38, padding: '0 10px', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 600, color: it.danger ? 'var(--status-risk)' : 'var(--text-primary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          {it.icon}{it.label}
        </button>
      ))}
    </div>
  ) : null

  return { openMenu, menuElement }
}
