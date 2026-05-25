import { EmptyState } from '../components/ui/EmptyState'

export function TaskBoard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '16px 24px', flexShrink: 0 }}>
        <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '18px' }}>Task Board</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Kanban · All Business Units</p>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon="🗂️"
          title="Task Board coming in v0.2.0"
          description="Press C anywhere to create a task. Full kanban view ships next iteration."
          action={{ label: 'Create task (C)', onClick: () => {} }}
        />
      </div>
    </div>
  )
}
