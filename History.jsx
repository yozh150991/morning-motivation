import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase.js'
import { formatDayShort } from '../lib/dates.js'
import { SLOT_META } from './Today.jsx'

export default function History() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await sb
        .from('daily_selections')
        .select('day,slot,quotes,read_at')
        .order('day', { ascending: false })
        .limit(90)
      // Порожні добірки (коли пул був порожній) в історії не показуємо
      const filtered = (data || []).filter((r) => (r.quotes || []).length > 0)
      // У межах одного дня — ранок перед вечором
      filtered.sort((a, b) => {
        if (a.day !== b.day) return a.day < b.day ? 1 : -1
        return (SLOT_META[a.slot]?.order ?? 9) - (SLOT_META[b.slot]?.order ?? 9)
      })
      setRows(filtered)
    })()
  }, [])

  return (
    <div>
      <p className="eyebrow">Архів добірок</p>
      <h1 className="day-title">Історія</h1>

      {rows === null ? (
        <div className="loader" aria-label="Завантаження" />
      ) : rows.length === 0 ? (
        <div className="card">
          <p className="muted">Історія зʼявиться після першої розсилки.</p>
        </div>
      ) : (
        <ul className="history-list">
          {rows.map((r) => (
            <li className="card history-item" key={`${r.day}-${r.slot}`}>
              <p className="history-date">
                {formatDayShort(r.day)} · {SLOT_META[r.slot]?.label || r.slot}
              </p>
              {r.quotes.map((q, i) => (
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
