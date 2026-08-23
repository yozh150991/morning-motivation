import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase.js'
import { todayWarsaw, formatDayTitle } from '../lib/dates.js'
import { subscriptionState, enablePush, pushSupported, isIOS, isStandalone } from '../lib/push.js'
import HorizonPlayer from './HorizonPlayer.jsx'

export default function Today({ settings, goTo }) {
  const [selection, setSelection] = useState(undefined) // undefined=вантажиться, null=нема
  const [quoteCount, setQuoteCount] = useState(null)
  const [pushState, setPushState] = useState(null)
  const [pushError, setPushError] = useState(null)
  const day = todayWarsaw()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await sb
        .from('daily_selections')
        .select('day,quotes')
        .eq('day', day)
        .maybeSingle()
      if (alive) setSelection(data || null)

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
    setPushError(null)
    try {
      await enablePush()
      setPushState('on')
    } catch (e) {
      setPushError(e.message || String(e))
    }
  }

  const showIOSHint = isIOS() && !isStandalone()
  const showEnableBanner =
    pushState === 'off' || pushState === 'blocked' || (pushState === 'unsupported' && showIOSHint)

  return (
    <div className="today">
      <p className="eyebrow">{formatDayTitle(day)}</p>
      <h1 className="day-title">Ранкова добірка</h1>

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
              сайту — і ранкова добірка приходитиме о 8:00.
            </p>
          ) : (
            <>
              <p className="muted">Щоб добірка приходила о 8:00, увімкни сповіщення.</p>
              <button className="btn primary" onClick={handleEnablePush}>
                Увімкнути ранкові сповіщення
              </button>
              {pushError && <p className="error-text">{pushError}</p>}
            </>
          )}
        </div>
      )}

      {selection === undefined ? (
        <div className="loader" aria-label="Завантаження" />
      ) : selection ? (
        <div className="quotes-of-day">
          {selection.quotes.map((q, i) => (
            <figure className="quote" style={{ animationDelay: `${i * 90}ms` }} key={i}>
              <blockquote>{q.text}</blockquote>
              {q.author && <figcaption>— {q.author}</figcaption>}
            </figure>
          ))}
        </div>
      ) : (
        <div className="card">
          <p className="muted">
            Сьогоднішня добірка ще не сформована — перша розсилка приходить о 8:00.
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
