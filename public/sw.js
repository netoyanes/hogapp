self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'HOG APP', {
      body: data.body ?? '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length > 0) return list[0].focus()
      return clients.openWindow(event.notification.data?.url ?? '/')
    })
  )
})

// Message from the page — show a notification without a push event
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon } = event.data
    self.registration.showNotification(title, { body, icon: icon ?? '/favicon.svg', badge: '/favicon.svg' })
  }
})

// ── Doña Concha · POS sin internet ─────────────────────────────────────────
// Solo /concha: la página y los archivos que ella carga se guardan en caché para
// que la tablet de caja abra aunque no haya red. El resto de HOG APP no cambia
// (sus peticiones no pasan por aquí). Las órdenes viven en el almacenamiento de
// la tablet y se suben a Supabase cuando vuelve la conexión.
const CONCHA_CACHE = 'concha-pos-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

function esConcha(url) {
  return /^\/concha\/?$/i.test(new URL(url).pathname)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // La página: red primero (para recibir versiones nuevas), caché si no hay red
  if (req.mode === 'navigate' && esConcha(req.url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copia = res.clone(); caches.open(CONCHA_CACHE).then((c) => c.put('/concha', copia)) }
          return res
        })
        .catch(() => caches.match('/concha', { ignoreVary: true }).then((r) => r || Response.error()))
    )
    return
  }

  // Archivos del build (llevan hash en el nombre, nunca cambian): caché primero.
  // Solo se guardan los que pide la pantalla del POS.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const enCache = await caches.match(req, { ignoreVary: true })
      if (enCache) return enCache
      const res = await fetch(req)
      const cliente = event.clientId ? await self.clients.get(event.clientId) : null
      if (res.ok && cliente && esConcha(cliente.url)) {
        const copia = res.clone()
        caches.open(CONCHA_CACHE).then((c) => c.put(req, copia))
      }
      return res
    })())
  }
})

// El POS avisa qué archivos cargó (la primera visita ocurre antes de que este
// service worker controle la página) para guardarlos y poder abrir sin red.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CONCHA_PRECACHE') return
  const urls = (event.data.urls || []).filter((u) => {
    try { const x = new URL(u, self.location.origin); return x.origin === self.location.origin && (x.pathname.startsWith('/assets/') || esConcha(x.href)) } catch { return false }
  })
  event.waitUntil(caches.open(CONCHA_CACHE).then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => null)))))
})
