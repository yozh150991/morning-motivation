/* Service worker застосунку «Ранкова мотивація» */
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()

// Оболонка застосунку (файли з білда)
precacheAndRoute(self.__WB_MANIFEST)

// Музичний трек із Supabase Storage: кеш-перший, тримаємо максимум 2 версії
registerRoute(
  ({ url }) => url.pathname.includes('/storage/v1/object/public/music/'),
  new CacheFirst({
    cacheName: 'music',
    plugins: [new ExpirationPlugin({ maxEntries: 2 })],
  })
)

// Шрифти Google
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({
    cacheName: 'fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 12 })],
  })
)

// ── Push-сповіщення ─────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Ранкова мотивація ☀️', body: event.data ? event.data.text() : '' }
  }

  const quotes = Array.isArray(data.quotes) ? data.quotes : []
  const body =
    data.body ||
    quotes.map((q) => (q.author ? `${q.text} — ${q.author}` : q.text)).join('\n\n') ||
    'Нова ранкова добірка чекає в застосунку.'

   const options = {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: data.date ? `morning-${data.date}` : 'morning',
    renotify: false,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data: { url: './' },
  }

  event.waitUntil(
    self.registration
      .showNotification(data.title || 'Ранкова мотивація ☀️', options)
      .catch((err) => {
        // Якщо щось пішло не так — показуємо найпростіше сповіщення,
        // щоб користувач принаймні дізнався про нову добірку
        console.error('showNotification failed:', err)
        return self.registration.showNotification('Ранкова мотивація ☀️', { body })
      })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
