import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, TRACK_FILE } from '../config.js'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/** Читає всі налаштування як обʼєкт { key: value } */
export async function loadSettings() {
  const { data, error } = await sb.from('app_settings').select('key,value')
  if (error) throw error
  return Object.fromEntries((data || []).map((r) => [r.key, r.value]))
}

/** Зберігає одне налаштування */
export async function saveSetting(key, value) {
  const { error } = await sb
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

/** Публічний URL треку; version додається, щоб оминати старий кеш */
export function trackUrl(version) {
  const base = `${SUPABASE_URL}/storage/v1/object/public/music/${TRACK_FILE}`
  return version ? `${base}?v=${encodeURIComponent(version)}` : base
}
