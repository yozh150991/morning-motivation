import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase.js'
import { todayWarsaw, formatDayTitle } from '../lib/dates.js'
import { subscriptionState, enablePush, isIOS, isStandalone } from '../lib/push.js'
import HorizonPlayer from './HorizonPlayer.jsx'

// Слоти дня — мають збігатися зі SLOTS у sender/send_morning.py
export const SLOT_META = {
  morning: { label: 'Ранкова добірка', order: 1 },
  evening: { label: 'Вечірня добірка', order: 2 },
}

export default function Today({ settings, goTo }) {
  const [rows, setRows] = useState(undefined) // undefined=вантажиться, []=нічого немає
  const [quoteCount, setQuoteCount] = useState(null)
  const [pushState, setPushState] = useState(null)
  const [error, setError] = useState(null)
  const [marking, setMarking] = useState(null) // slot, який зараз позначається
  const day = todayWarsaw()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await sb
        .from('daily_selections')
        .select('day,slot,quotes,read_at')
        .eq('day', day)
      if (alive) {
        const sorted = (data || []).sort(
          (a, b) => (SLOT_META[a.slot]?.order ?? 9) - (SLOT_META[b.slot]?.order ?? 9)
        )
        setRows(sorted)
      }

      const { count } = await sb.from('quotes').select('id', { count: 'exact', head: true })
      if (alive) setQuoteCount(count ?? 0)

      const st = await subscriptionState()
      if (alive) setPushState(st)
    })()
    return () => {
      alive = false
    }
  }, [day])

  async function handleEnablePush() {
    setError(null)
    try {
      await enablePush()
      setPushState('on')
    } catch (e) {
      setError(e.message || String(e))
    }
  }

  async function markAsRead(slot) {
    setMarking(slot)
    setError(null)
    try {
      const readAt = new Date().toISOString()
      const { error: err } = await sb
        .from('daily_selections')
        .update({ read_at: readAt })
        .eq('day', day)
        .eq('slot', slot)
      if (err) throw err
      setRows((prev) => prev.map((r) => (r.slot === slot ? { ...r, read_at: readAt } : r)))
      // Прибираємо сповіщення зі шторки, якщо воно ще висить
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        const notes = await reg.getNotifications()
        notes.forEach((n) => n.close())
      }
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setMarking(null)
    }
  }

  const showIOSHint = isIOS() && !isStandalone()
  const showEnableBanner =
    pushState === 'off' || pushState === 'blocked' || (pushState === 'unsupported' && showIOSHint)
  const withQuotes = (rows || []).filter((r) => (r.quotes || []).length > 0)

  return (
    <div className="today">
      <p className="eyebrow">{formatDayTitle(day)}</p>
      <h1 className="day-title">Сьогодні</h1>

      {showEnableBanner && (
        <div className="card banner">
          {showIOSHint ? (
            <p className="muted">
              На iPhone: додай застосунок на екран «Додому» (Поділитись → На екран «Додому»),
              відкрий з іконки — і тут зʼявиться кнопка ввімкнення сповіщень.
            </p>
          ) : pushState === 'blocked' ? (
            <p className="muted">
              Сповіщення заблоковано в браузері. Дозволь їх для цього сайту в налаштуваннях
              сайту — і добірки приходитимуть за розкладом.
            </p>
          ) : (
            <>
              <p className="muted">Щоб добірки приходили о 10:00 і 20:00, увімкни сповіщення.</p>
              <button className="btn primary" onClick={handleEnablePush}>
                Увімкнути сповіщення
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {rows === undefined ? (
        <div className="loader" aria-label="Завантаження" />
      ) : withQuotes.length > 0 ? (
        withQuotes.map((row) => (
          <section className="slot" key={row.slot}>
            <p className="slot-label">{SLOT_META[row.slot]?.label || row.slot}</p>

            <div className="quotes-of-day">
              {row.quotes.map((q, i) => (
                <figure className="quote" style={{ animationDelay: `${i * 90}ms` }} key={i}>
                  <blockquote>{q.text}</blockquote>
                  {q.author && <figcaption>— {q.author}</figcaption>}
                </figure>
              ))}
            </div>

            {row.read_at ? (
              <p className="read-mark">✓ Прочитано</p>
            ) : (
              <>
                <button
                  className="btn primary read-btn"
                  onClick={() => markAsRead(row.slot)}
                  disabled={marking === row.slot}
                >
                  {marking === row.slot ? 'Позначаю…' : 'Прочитано'}
                </button>
                <p className="muted small-note">
                  Доки не позначиш, нагадування приходитиме кожні 15 хвилин.
                </p>
              </>
            )}
          </section>
        ))
      ) : (
        <div className="card">
          <p className="muted">
            Сьогоднішня добірка ще не сформована — вона зʼявиться з розсилкою о 10:00.
          </p>
          {quoteCount === 0 && (
            <>
              <p className="muted">Пул поки порожній. Додай першу цитату, щоб було з чого обирати.</p>
              <button className="btn" onClick={() => goTo('quotes')}>
                Додати цитати
              </button>
            </>
          )}
        </div>
      )}

      <HorizonPlayer
        trackVersion={settings.track_version}
        goToSettings={() => goTo('settings')}
      />
    </div>
  )
}
