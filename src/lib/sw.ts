let swReg: ServiceWorkerRegistration | null = null

export async function registerSW(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    swReg = await navigator.serviceWorker.register('/sw.js')
  } catch {
    // SW not critical — silently fail
  }
}

export async function swShowNotification(title: string, body?: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  // Prefer service worker (required on iOS)
  const reg = swReg ?? (await navigator.serviceWorker?.ready.catch(() => null))
  if (reg) {
    await reg.showNotification(title, { body, icon: '/favicon.svg', badge: '/favicon.svg' })
  } else {
    // Fallback for desktop browsers without SW
    new Notification(title, { body, icon: '/favicon.svg' })
  }
}
