import { useEffect, useRef, useState } from 'react'
import { sb, saveSetting, trackUrl } from '../lib/supabase.js'
import { TRACK_FILE } from '../config.js'
import {
  subscriptionState,
  enablePush,
  disablePush,
  showLocalTest,
  isIOS,
  isStandalone,
} from '../lib/push.js'
import { sha256, rememberUnlock } from '../lib/pin.js'

const STATE_LABEL = {
  on: 'Увімкнено на цьому пристрої',
  off: 'Вимкнено на цьому пристрої',
  blocked: 'Заблоковано в браузері',
  unsupported: 'Не підтримується в цьому режимі',
}

export default function Settings({ settings, onSettingsChanged, showToast }) {
  const [pushState, setPushState] = useState(null)
  const [busyPush, setBusyPush] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    subscriptionState().then(setPushState)
  }, [])

  async function togglePush() {
    setBusyPush(true)
    try {
      if (pushState === 'on') {
        await disablePush()
        setPushState('off')
        showToast('Сповіщення вимкнено')
      } else {
        await enablePush()
        setPushState('on')
        showToast('Сповіщення ввімкнено')
      }
    } catch (e) {
      showToast(e.message || String(e))
    } finally {
      setBusyPush(false)
    }
  }

  async function uploadTrack(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 45 * 1024 * 1024) {
      showToast('Файл завеликий. Рекомендовано до 45 МБ.')
      return
    }
    setUploading(true)
    try {
      const { error } = await sb.storage
        .from('music')
        .upload(TRACK_FILE, file, { upsert: true, contentType: file.type || 'audio/mpeg' })
      if (error) throw error
      const version = String(Date.now())
      await saveSetting('track_version', version)
      // Прогріваємо кеш нової версії, щоб грала й офлайн
      fetch(trackUrl(version)).catch(() => {})
      await onSettingsChanged()
      showToast('Трек оновлено')
    } catch (err) {
      showToast(`Помилка завантаження: ${err.message || err}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function changePin(e) {
    e.preventDefault()
    if (newPin.length < 4) {
      showToast('Новий PIN — щонайменше 4 цифри.')
      return
    }
    const oldHash = await sha256(oldPin)
    if (oldHash !== settings.pin_hash) {
      showToast('Поточний PIN невірний.')
      return
    }
    const newHash = await sha256(newPin)
    try {
      await saveSetting('pin_hash', newHash)
      rememberUnlock(newHash)
      await onSettingsChanged()
      setOldPin('')
      setNewPin('')
      showToast('PIN змінено')
    } catch (err) {
      showToast(`Помилка: ${err.message || err}`)
    }
  }

  const iosNeedsInstall = isIOS() && !isStandalone()
  const trackDate = settings.track_version
    ? new Date(Number(settings.track_version)).toLocaleDateString('uk-UA')
    : null

  return (
    <div>
      <p className="eyebrow">Керування</p>
      <h1 className="day-title">Налаштування</h1>

      <section className="card">
        <h2>Сповіщення</h2>
        <p className="muted">{pushState ? STATE_LABEL[pushState] : '…'}</p>
        {iosNeedsInstall ? (
          <p className="muted">
            На iPhone спершу додай застосунок на екран «Додому» (Поділитись → На екран «Додому»)
            і відкрий з іконки.
          </p>
        ) : (
          <div className="row">
            <button
              className="btn primary"
              onClick={togglePush}
              disabled={busyPush || pushState === 'blocked' || pushState === 'unsupported'}
            >
              {pushState === 'on' ? 'Вимкнути на цьому пристрої' : 'Увімкнути на цьому пристрої'}
            </button>
            <button className="btn ghost" onClick={() => showLocalTest().catch(() => {})}>
              Тестове сповіщення
            </button>
          </div>
        )}
        {pushState === 'blocked' && (
          <p className="muted">
            Щоб розблокувати: налаштування сайту в браузері → Сповіщення → Дозволити.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Музика</h2>
        <p className="muted">
          {trackDate ? `Трек завантажено (оновлено ${trackDate}).` : 'Трек ще не завантажено.'}
        </p>
        <label className="btn primary file-btn">
          {uploading ? 'Завантаження…' : trackDate ? 'Замінити трек' : 'Завантажити трек'}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={uploadTrack}
            disabled={uploading}
            hidden
          />
        </label>
        <p className="muted small-note">MP3 або інший аудіоформат, рекомендовано до 45 МБ.</p>
      </section>

      <section className="card">
        <h2>PIN</h2>
        <form onSubmit={changePin}>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            placeholder="Поточний PIN"
            value={oldPin}
            onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
          />
          <input
            className="input"
            type="password"
            inputMode="numeric"
            placeholder="Новий PIN (мінімум 4 цифри)"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
          />
          <button className="btn" disabled={!oldPin || !newPin}>
            Змінити PIN
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Як це працює</h2>
        <p className="muted">
          Щодня о 8:00 (за Варшавою) приходить сповіщення з 2–3 цитатами. Цитати обираються
          випадково без повторів, поки не використається весь пул — тоді цикл починається
          заново. Музика вмикається однією кнопкою на екрані «Сьогодні».
        </p>
      </section>
    </div>
  )
}
