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

/**
 * Просить браузер не видаляти дані сайту при нестачі місця.
 * Без цього Chrome на Android може вичистити сховище разом із
 * реєстрацією сервіс-воркера — і підписка зникає «сама собою».
 */
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted()
      if (!already) await navigator.storage.persist()
    }
  } catch {
    // не критично — просто йдемо далі
  }
}

/** Записує підписку в базу (upsert за endpoint) */
async function saveSubscription(sub) {
  const json = sub.toJSON()
  const { error } = await sb.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 250),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
}

/** Вмикає сповіщення на цьому пристрої */
export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Сповіщення заблоковано в системі. Дозволь їх у налаштуваннях браузера для цього сайту.'
        : 'Дозвіл не надано.'
    )
  }
  await requestPersistentStorage()
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  await saveSubscription(sub)
}

/**
 * Тихе самовідновлення — викликається при кожному відкритті застосунку.
 *
 * Chrome час від часу змінює endpoint підписки (після оновлення браузера,
 * очищення сховища, довгої неактивності). Тоді сервер отримує 410,
 * видаляє рядок — і розсилка «мовчить», хоча в налаштуваннях усе ввімкнено.
 *
 * Ця функція: якщо дозвіл є, але підписки немає — створює заново;
 * якщо є — освіжає last_seen_at, щоб було видно, що вона жива.
 * Повертає стан після перевірки.
 */
export async function ensureSubscription() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission !== 'granted') {
    return Notification.permission === 'denied' ? 'blocked' : 'off'
  }

  try {
    await requestPersistentStorage()
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()

    if (!sub) {
      // Дозвіл є, підписки немає — відновлюємо мовчки
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    await saveSubscription(sub)
    return 'on'
  } catch {
    return 'off'
  }
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

/** Локальне тестове сповіщення */
export async function showLocalTest() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Тест ✅', {
    body: 'Сповіщення працюють. Добірки приходитимуть за розкладом.',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
  })
}
