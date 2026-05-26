export const APP_VERSION = "1.0.0"

export type ChangelogEntry = {
  version: string
  date: string
  type: "MAJOR" | "MINOR" | "PATCH"
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Initial build — Supabase schema, auth, user onboarding",
      "14 Business Units seeded from spec data",
      "Master Dashboard with BU Health Grid (14 cards)",
      "BU Onboarding Scoring Form — all 5 dimensions with live preview",
      "Health Score Engine — A/B/C/D/E dimensions",
      "Version badge + Changelog modal",
      "Role-based auth (MASTER / OPS_MANAGER / MARKETING / TEAM)",
      "Full design system — Geist fonts, green accent, dark base"
    ]
  },
  {
    version: "0.2.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Task Board — full kanban with 5 columns (Open, In Progress, Proof Submitted, Approved, Revision)",
      "Create Task modal — keyboard shortcut C from anywhere",
      "Task cards with priority, assignee, due date, proof indicator",
      "Filters by BU, priority, type, status",
      "Real-time task updates via Supabase"
    ]
  },
  {
    version: "0.3.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Task detail slide-over panel — view, edit, and change status inline",
      "Profile screen — avatar upload, personal info editor",
      "Slack webhook integration — connect a channel for task notifications",
      "Profile accessible from sidebar"
    ]
  },
  {
    version: "0.3.1",
    date: "2026-05-25",
    type: "PATCH",
    changes: [
      "Marketing Dashboard restricted to MASTER and C_LEVEL roles only",
      "Added C_LEVEL role — full dashboard visibility, no admin controls",
      "Non-privileged users land on Task Board by default"
    ]
  },
  {
    version: "0.4.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Task Proofs — upload photos/videos as evidence, auto-sets PROOF_SUBMITTED",
      "User Invitations — MASTER can invite team members with pre-assigned roles",
      "Slack auto-notifications — task created, status changed, proof uploaded",
      "App-wide Slack webhook stored in Supabase settings"
    ]
  },
  {
    version: "0.5.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Mobile-first layout — bottom navigation bar replaces sidebar on small screens",
      "Task detail panel goes full-screen on mobile",
      "Create task modal goes full-screen on mobile",
      "Changelog modal goes full-screen on mobile",
      "Filter bar and KPI strip scroll horizontally on small screens"
    ]
  },
  {
    version: "0.5.1",
    date: "2026-05-25",
    type: "PATCH",
    changes: [
      "Version badge hidden — now lives at the bottom of the Activity Log",
      "Collapsible dot replaced with inline badge (hover to reveal, click to open changelog)"
    ]
  },
  {
    version: "0.7.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Notification bell — real-time badge with unread count, per-user dropdown",
      "Push notifications via browser Notification API (Android + iOS PWA)",
      "Notifies admins and task assignees on: task created, status changed, proof uploaded, comment posted",
      "Mark all read / mark individual read on click",
      "Enable push banner inside the bell if permission not yet granted"
    ]
  },
  {
    version: "0.6.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Activity Log — real-time audit trail of all platform actions with user attribution",
      "Tracks: task created, status changed, proof uploaded, comment posted, user invited",
      "Activity stats: actions today, this week, total, most active user",
      "Avatar upload fixed — errors now surface, cache-busting prevents stale images",
      "Invitation-only access — Google OAuth and email signup blocked without a valid invite",
      "Uninvited users see an 'Access denied' banner and are signed out immediately"
    ]
  },
  {
    version: "0.8.0",
    date: "2026-05-25",
    type: "MINOR",
    changes: [
      "Task archiving — archive any task from the detail panel, restore at any time",
      "Archived tasks filter — toggle 'Archived' in the Task Board filter bar to view them",
      "Archived tasks are hidden from the main board by default",
      "ARCHIVED badge shown in the task header when viewing an archived task",
      "Archive and restore actions tracked in Activity Log"
    ]
  },
  {
    version: "1.0.0",
    date: "2026-05-26",
    type: "MAJOR",
    changes: [
      "Calendar view — monthly grid showing all tasks with due dates, color-coded by priority",
      "Navigate months with arrows, filter by BU, click any task to open its detail panel",
      "Task Templates — MASTER/C_LEVEL can create, edit and delete reusable task blueprints",
      "Templates pre-fill type, priority, description, estimated hours, deadline type and BU",
      "Template picker in Create Task modal — any team member can apply a template",
      "Keyboard shortcut 3 → Calendar, 6 → Templates"
    ]
  },
  {
    version: "0.9.0",
    date: "2026-05-26",
    type: "MINOR",
    changes: [
      "Public / Private tasks — toggle visibility on any task from the detail panel or at creation",
      "Private tasks are only visible to creator, assignee, and related people",
      "Related People — add followers to any task so they can view and track progress",
      "Followers shown as pills on the task detail panel, removable with one click",
      "Lock icon on TaskCard for private tasks",
      "Outsiders with an invite can now use private tasks exclusively for their own work"
    ]
  }
]
