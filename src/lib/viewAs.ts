// Role preview ("view as") — a MASTER can simulate any role to test access levels.
// The override lives in localStorage and only applies when the real role is MASTER.

const VIEW_AS_KEY = 'hog_view_as_role'

export function getViewAsRole(): string | null {
  return localStorage.getItem(VIEW_AS_KEY)
}

export function setViewAsRole(role: string | null) {
  if (role) localStorage.setItem(VIEW_AS_KEY, role)
  else localStorage.removeItem(VIEW_AS_KEY)
  window.location.reload()
}
