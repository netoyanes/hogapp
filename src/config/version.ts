export const APP_VERSION = "1.13.0"

export type ChangelogEntry = {
  version: string
  date: string
  type: "MAJOR" | "MINOR" | "PATCH"
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.13.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Social redesigned as a real feed — one thought/copy box plus attachment tools",
      "Text-only posts supported; attach a link or a file to any thought",
      "Attachment preview before publishing, removable in one click",
      "Changelog modal is now collapsible — click any version to see its full log",
    ]
  },
  {
    version: "1.12.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "CRM → Calendar — deals of type EVENT now appear on the Calendar",
      "New dedicated Event Date field on EVENT deals (create + edit)",
      "Calendar events are pink with a 🎉 icon; click opens the deal panel inline",
      "Header shows a monthly events count alongside tasks",
    ]
  },
  {
    version: "1.11.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Activity Log — new Analytics tab with team productivity metrics",
      "Hours worked per user vs the 40h/week goal (auto from approved task hours)",
      "Deals brought $ (finder) and closed $ (closer) per user",
      "Actions per user, directory contact count, HOG team count, pipeline & won value",
      "Estimated build effort (horas nalga) derived from the changelog",
    ]
  },
  {
    version: "1.10.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Objectives — quarterly OKR dashboard with numeric metrics and automatic % progress",
      "Quarterly goals cascade to a monthly breakdown (per-month target + actual)",
      "C-Level set company objectives; managers set objectives for themselves and their team",
      "Self-evaluation (1-5 stars + note) on your own objectives",
      "Quarter/year selector with Company / Mine / Team sections and progress tiles",
    ]
  },
  {
    version: "1.9.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Social — new team feed with a daily welcome greeting",
      "Share links with auto-embed: YouTube (videos + shorts), Instagram (posts/reels), TikTok",
      "Share PDFs, images and HTML — rendered inline like task proofs",
      "Reactions on every post (👍 ❤️ 🔥); comments coming next",
      "Accessible to all roles from sidebar, bottom nav, and the app launcher",
    ]
  },
  {
    version: "1.8.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Directory — unified internal directory: external contacts + HOG team in one place",
      "Filter contacts by type (Venue Client, Sponsor, Partner, Vendor, Prospect, HOG Team)",
      "Finder tracking — every contact records who added it (finder's-fee owner)",
      "Closer tracking — deals record who closed them (closing-commission owner), shown in the deal log",
      "Entry-level (TEAM) users only see Venue Clients; managers & C-Level see the full directory",
      "Only MASTER can archive or delete contacts",
    ]
  },
  {
    version: "1.7.0",
    date: "2026-06-17",
    type: "MINOR",
    changes: [
      "Rebranded HOG OPS → HOG APP across the app, PWA manifest, emails, and notifications",
      "Each sub-app now shows its own title in the sidebar and mobile top bar",
    ]
  },
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
    version: "1.6.0",
    date: "2026-06-16",
    type: "MINOR",
    changes: [
      "Open tasks/deals in an overlay panel straight from a notification — keep working on the screen you were on",
      "Click any task notification in the bell to open it in a slide-over without leaving your current view",
      "Slack DMs now include a direct 'Open in HOG OPS' deep-link to the task or deal",
      "Deal stage changes now also DM the deal owner",
    ]
  },
  {
    version: "1.5.3",
    date: "2026-06-16",
    type: "PATCH",
    changes: [
      "Slack DM notifications confirmed working — fixed missing chat:write scope on bot",
      "Improved error surfacing in Slack DM client code",
    ]
  },
  {
    version: "1.5.2",
    date: "2026-06-16",
    type: "PATCH",
    changes: [
      "Slack DM on task comment — assignee gets a DM when someone comments on their task",
      "Slack DM on CRM activity — deal owner gets a DM when someone logs a note/call/email on their deal",
    ]
  },
  {
    version: "1.5.1",
    date: "2026-06-16",
    type: "PATCH",
    changes: [
      "Fix Slack ID save for other users — RLS policy now allows MASTER to update all profiles",
      "Save button replaces unreliable onBlur for Slack ID assignment in User Management",
    ]
  },
  {
    version: "1.5.0",
    date: "2026-06-16",
    type: "MINOR",
    changes: [
      "Contacts directory — shared prospect/client list accessible to all users with search and deal count badge",
      "Author avatars — initials avatar shown on every task comment and CRM activity log entry",
      "Deal creator tracking — 'Deal created by' is always shown at the bottom of the activity timeline",
      "Slack DM bot — per-user Slack notifications via bot (task assigned, status changed) instead of channel-only",
      "Slack ID management — MASTER can assign Slack Member IDs to teammates from User Management"
    ]
  },
  {
    version: "1.4.0",
    date: "2026-06-03",
    type: "MINOR",
    changes: [
      "User Management — view all team members, edit roles inline, remove with confirmation",
      "Role changes and removals now show success/error feedback (surfaces RLS failures)",
      "Task Board & CRM default to showing the logged-in user's tasks/deals on load",
      "Task visibility extended — see tasks you're assigned to, created, or following",
      "Real-time auto-refresh — live updates on tab focus, visibility change, and 20s polling",
      "Notification bell converted to a fixed floating FAB, sits above mobile bottom nav",
      "Nav restricted to Task Board, CRM, and Profile for non-MASTER users",
      "Assignee and team-member dropdowns now filter out incomplete/ghost profiles",
      "Version number displayed below the login card",
      "Archived proofs hidden from task panel, archive events logged in Activity Log"
    ]
  },
  {
    version: "1.3.0",
    date: "2026-05-29",
    type: "MINOR",
    changes: [
      "Reports — upload HTML reports to Supabase Storage and open them inside the app",
      "Internal HTML viewer — full-screen iframe overlay with toolbar, ESC to close",
      "Task proofs now accept HTML files in addition to images, video, and PDF",
      "HTML proofs render inline (iframe) in the task panel and open full-screen in the proof modal",
      "Reports accessible from sidebar, bottom nav, and H app launcher",
      "BU tagging, drag & drop upload, inline rename, and delete on report cards"
    ]
  },
  {
    version: "1.2.0",
    date: "2026-05-26",
    type: "MINOR",
    changes: [
      "CRM Pipeline — manage commercial opportunities (sponsorships, partnerships, advertising, events) in a 6-stage Kanban",
      "Deal cards with value, probability bar, contact, BU badge, and close date",
      "Deal detail panel — stage switcher, lost-reason modal, edit mode, contact block",
      "Linked Tasks — connect any deal to existing tasks for traceability, open task panel inline",
      "Activity log per deal — log calls, emails, meetings, and notes with author and timestamp",
      "Pipeline stats header — total pipeline value, won value, open deal count, win rate",
      "Contact management — create new contacts inline or pick from existing ones",
      "Keyboard shortcut 3 → CRM (Calendar shifts to 4, Content to 5, Revenue to 6)"
    ]
  },
  {
    version: "1.1.0",
    date: "2026-05-26",
    type: "MINOR",
    changes: [
      "Content Calendar — monthly planning grid for social media content by BU and platform",
      "Plan posts for Instagram, Facebook, WhatsApp, TikTok or Other",
      "Content types: Post, Story, Reel, Video, Carousel",
      "Status workflow: Draft → Scheduled → Published (or Cancelled)",
      "Write full captions/copy with character counter directly in the calendar",
      "Link content entries to existing tasks for traceability",
      "Internal notes field for design requests and team instructions",
      "Filter by BU, platform, and status — platform color legend always visible",
      "Click any day cell + to add content, click an entry to edit or delete"
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
