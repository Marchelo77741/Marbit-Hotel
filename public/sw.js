// Service worker: guarda la app en el dispositivo para que abra SIN internet (y sin depender de Netlify)
// después de la primera visita. Estrategia: caché primero, y se actualiza en segundo plano.
const CACHE = 'reservaciones-posada-v4'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon-64.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const isNav = req.mode === 'navigate'
      const cached = (await cache.match(isNav ? '/index.html' : req)) || (await cache.match(req))
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(isNav ? '/index.html' : req, res.clone())
          return res
        })
        .catch(() => undefined)
      if (cached) {
        event.waitUntil(network)
        return cached
      }
      const res = await network
      return res || (isNav ? cache.match('/index.html') : Response.error())
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow('/')
    }),
  )
})
