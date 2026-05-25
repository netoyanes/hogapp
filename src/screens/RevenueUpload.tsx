import { EmptyState } from '../components/ui/EmptyState'

export function RevenueUpload() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '16px 24px', flexShrink: 0 }}>
        <h1 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '18px' }}>Revenue CSV Upload</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Master only · Import weekly revenue data</p>
      </div>
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon="📊"
          title="Revenue Upload coming in v0.2.0"
          description="CSV ingestion with validation and score auto-recalculation ships next iteration."
        />
      </div>
    </div>
  )
}
