/* Service worker застосунку «Ранкова мотивація» */
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from './config.js'

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
  ({ url }) =>
    url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
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
    'Нова добірка чекає в застосунку.'

  const options = {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: data.date ? `${data.slot || 'day'}-${data.date}` : 'motivation',
    renotify: Boolean(data.repeat),
    requireInteraction: true,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    data: { url: './' },
  }

  event.waitUntil(
    self.registration
      .showNotification(data.title || 'Ранкова мотивація ☀️', options)
      .catch(() =>
        // Запасний варіант, якщо щось у параметрах не влаштувало систему
        self.registration.showNotification('Ранкова мотивація ☀️', { body })
      )
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(scope) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(scope)
    })
  )
})

// ── Самовідновлення підписки ────────────────────────────────
// Браузер інколи сам змінює endpoint (оновлення Chrome, очищення
// сховища, довга неактивність). Тоді сервер отримує 410 і видаляє
// рядок — розсилка мовчить, хоча в налаштуваннях усе ввімкнено.
// Цей обробник підписується наново і записує нову підписку в базу.

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

function sbHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function saveSubscription(sub) {
  const json = sub.toJSON()
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
    method: 'POST',
    headers: {
      ...sbHeaders(),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: 'resubscribed-by-sw',
      last_seen_at: new Date().toISOString(),
    }),
  })
}

async function dropSubscription(endpoint) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: 'DELETE', headers: { ...sbHeaders(), Prefer: 'return=minimal' } }
  )
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        await saveSubscription(sub)
        const old = event.oldSubscription?.endpoint
        if (old && old !== sub.endpoint) await dropSubscription(old)
      } catch {
        // Якщо не вдалося — наступне відкриття застосунку відновить підписку
      }
    })()
  )
})
