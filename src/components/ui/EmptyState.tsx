interface Props {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon = '📭', title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="text-4xl mb-4">{icon}</span>
      <h3 style={{ color: 'var(--text-primary)' }} className="text-base font-semibold mb-2">{title}</h3>
      {description && (
        <p style={{ color: 'var(--text-secondary)' }} className="text-sm mb-6 max-w-xs">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{ background: 'var(--accent)', color: '#000' }}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
