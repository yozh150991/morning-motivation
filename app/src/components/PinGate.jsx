import { useState } from 'react'
import { saveSetting } from '../lib/supabase.js'
import { sha256, rememberUnlock } from '../lib/pin.js'

export default function PinGate({ pinHash, onUnlock, onPinCreated }) {
  const creating = !pinHash
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)

    if (creating) {
      if (pin.length < 4) return setError('PIN має містити щонайменше 4 цифри.')
      if (pin !== pin2) return setError('PIN-коди не збігаються.')
      setBusy(true)
      try {
        const hash = await sha256(pin)
        await saveSetting('pin_hash', hash)
        rememberUnlock(hash)
        await onPinCreated()
        onUnlock()
      } catch (err) {
        setError(err.message || String(err))
      } finally {
        setBusy(false)
      }
      return
    }

    const hash = await sha256(pin)
    if (hash === pinHash) {
      rememberUnlock(hash)
      onUnlock()
    } else {
      setError('Невірний PIN.')
      setPin('')
    }
  }

  return (
    <div className="screen center">
      <form className="card pin-card" onSubmit={submit}>
        <div className="pin-sun" aria-hidden="true" />
        <h1 className="pin-title">Ранкова мотивація</h1>
        <p className="muted">
          {creating
            ? 'Перший запуск. Придумай PIN — він захищатиме застосунок.'
            : 'Введи PIN, щоб відкрити.'}
        </p>

        <input
          className="input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder={creating ? 'Новий PIN (мінімум 4 цифри)' : 'PIN'}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
        {creating && (
          <input
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Повтори PIN"
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
          />
        )}

        {error && <p className="error-text">{error}</p>}

        <button className="btn primary" disabled={busy || !pin}>
          {creating ? 'Зберегти PIN' : 'Відкрити'}
        </button>
      </form>
    </div>
  )
}
