import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase.js'
import { formatDayShort } from '../lib/dates.js'

export default function History() {
  const [days, setDays] = useState(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await sb
        .from('daily_selections')
        .select('day,quotes')
        .order('day', { ascending: false })
        .limit(60)
      setDays(data || [])
    })()
  }, [])

  return (
    <div>
      <p className="eyebrow">Архів ранків</p>
      <h1 className="day-title">Історія</h1>

      {days === null ? (
        <div className="loader" aria-label="Завантаження" />
      ) : days.length === 0 ? (
        <div className="card">
          <p className="muted">Історія зʼявиться після першої ранкової розсилки.</p>
        </div>
      ) : (
        <ul className="history-list">
          {days.map((d) => (
            <li className="card history-item" key={d.day}>
              <p className="history-date">{formatDayShort(d.day)}</p>
              {d.quotes.map((q, i) => (
                <p className="history-quote" key={i}>
                  {q.text}
                  {q.author && <span className="muted"> — {q.author}</span>}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
