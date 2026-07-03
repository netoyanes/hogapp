import { useState } from 'react'
import { CalendarView } from './CalendarView'
import { ContentCalendar } from './ContentCalendar'
import { SegmentedControl } from '../components/v2'

// One Calendar module, two tabs — VISUAL merge only. "Operación" mounts the
// task+events calendar, "Contenido" mounts the content calendar. Data models
// and flows stay untouched; the nav ids 'calendar' and 'content' both land
// here (preselecting their tab) so shortcuts and deep habits keep working.
type Tab = 'ops' | 'content'

interface Props {
  initialTab?: Tab
  userRole?: string
  defaultBuFilter?: string
}

export function CalendarHub({ initialTab = 'ops', userRole, defaultBuFilter }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ maxWidth: 420 }}>
          <SegmentedControl
            options={[
              { id: 'ops', label: 'Operación' },
              { id: 'content', label: 'Contenido' },
            ]}
            value={tab}
            onChange={(id) => setTab(id as Tab)}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'ops'
          ? <CalendarView userRole={userRole} defaultBuFilter={defaultBuFilter} />
          : <ContentCalendar userRole={userRole} />}
      </div>
    </div>
  )
}
