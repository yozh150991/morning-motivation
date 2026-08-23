const UNLOCK_KEY = 'mm_unlock'

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function rememberUnlock(hash) {
  localStorage.setItem(UNLOCK_KEY, hash)
}

export function isUnlocked(hash) {
  return !!hash && localStorage.getItem(UNLOCK_KEY) === hash
}

export function forgetUnlock() {
  localStorage.removeItem(UNLOCK_KEY)
}
