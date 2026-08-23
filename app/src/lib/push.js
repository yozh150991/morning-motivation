import { sb } from './supabase.js'
import { VAPID_PUBLIC_KEY } from '../config.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  )
}

/** Поточний стан: 'on' | 'off' | 'blocked' | 'unsupported' */
export async function subscriptionState() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Вмикає ранкові сповіщення на цьому пристрої */
export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Сповіщення заблоковано в системі. Дозволь їх у налаштуваннях браузера для цього сайту.'
        : 'Дозвіл не надано.'
    )
  }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  const json = sub.toJSON()
  const { error } = await sb.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 250),
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
}

/** Вимикає сповіщення на цьому пристрої */
export async function disablePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

/** Локальне тестове сповіщення (перевіряє відображення на цьому пристрої) */
export async function showLocalTest() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Тест ✅', {
    body: 'Сповіщення працюють. Ранкова добірка приходитиме о 8:00.',
    icon: new URL('icons/icon-192.png', reg.scope).href,
    badge: new URL('icons/badge-96.png', reg.scope).href,
  })
}
