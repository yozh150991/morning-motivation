import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSettings } from './lib/supabase.js'
import { isUnlocked } from './lib/pin.js'
import PinGate from './components/PinGate.jsx'
import Today from './components/Today.jsx'
import Quotes from './components/Quotes.jsx'
import History from './components/History.jsx'
import Settings from './components/Settings.jsx'

const TABS = [
  { id: 'today', label: 'Сьогодні' },
  { id: 'quotes', label: 'Цитати' },
  { id: 'history', label: 'Історія' },
  { id: 'settings', label: 'Налаштування' },
]

export default function App() {
  const [settings, setSettings] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [unlocked, setUnlocked] = useState(false)
  const [tab, setTab] = useState('today')
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((text) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const refreshSettings = useCallback(async () => {
    try {
      const s = await loadSettings()
      setSettings(s)
      setLoadError(null)
      if (isUnlocked(s.pin_hash)) setUnlocked(true)
      return s
    } catch (e) {
      setLoadError(e.message || String(e))
      return null
    }
  }, [])

  useEffect(() => {
    refreshSettings()
  }, [refreshSettings])

  if (loadError) {
    return (
      <div className="screen center">
        <div className="card error-card">
          <h2>Немає звʼязку з базою</h2>
          <p className="muted">
            Перевір інтернет і значення в <code>src/config.js</code>. Деталі: {loadError}
          </p>
          <button className="btn" onClick={refreshSettings}>
            Спробувати ще раз
          </button>
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="screen center">
        <div className="loader" aria-label="Завантаження" />
      </div>
    )
  }

  if (!unlocked) {
    return (
      <PinGate
        pinHash={settings.pin_hash}
        onUnlock={() => setUnlocked(true)}
        onPinCreated={refreshSettings}
      />
    )
  }

  return (
    <div className="app">
      <main className="screen">
        {tab === 'today' && <Today settings={settings} goTo={setTab} />}
        {tab === 'quotes' && <Quotes showToast={showToast} />}
        {tab === 'history' && <History />}
        {tab === 'settings' && (
          <Settings settings={settings} onSettingsChanged={refreshSettings} showToast={showToast} />
        )}
      </main>

      <nav className="tabbar" aria-label="Розділи">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
