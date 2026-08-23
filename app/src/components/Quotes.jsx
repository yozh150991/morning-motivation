import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase.js'

export default function Quotes({ showToast }) {
  const [quotes, setQuotes] = useState(null)
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editAuthor, setEditAuthor] = useState('')

  async function reload() {
    const { data, error } = await sb
      .from('quotes')
      .select('id,text,author,used,created_at')
      .order('created_at', { ascending: false })
    if (!error) setQuotes(data || [])
  }

  useEffect(() => {
    reload()
  }, [])

  async function add(e) {
    e.preventDefault()
    const raw = text.trim()
    if (!raw) return
    setBusy(true)
    try {
      if (bulkMode) {
        const parts = raw
          .split(/\n\s*\n+/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (!parts.length) return
        const { error } = await sb.from('quotes').insert(parts.map((t) => ({ text: t })))
        if (error) throw error
        showToast(`Додано цитат: ${parts.length}`)
      } else {
        const { error } = await sb
          .from('quotes')
          .insert({ text: raw, author: author.trim() || null })
        if (error) throw error
        showToast('Цитату додано')
      }
      setText('')
      setAuthor('')
      await reload()
    } catch (err) {
      showToast(`Помилка: ${err.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  function startEdit(q) {
    setEditingId(q.id)
    setEditText(q.text)
    setEditAuthor(q.author || '')
  }

  async function saveEdit(e) {
    e.preventDefault()
    const t = editText.trim()
    if (!t) return
    const { error } = await sb
      .from('quotes')
      .update({ text: t, author: editAuthor.trim() || null })
      .eq('id', editingId)
    if (error) {
      showToast(`Помилка: ${error.message}`)
      return
    }
    setEditingId(null)
    showToast('Збережено')
    await reload()
  }

  async function remove(q) {
    const short = q.text.length > 60 ? `${q.text.slice(0, 60)}…` : q.text
    if (!window.confirm(`Видалити цитату?\n\n«${short}»`)) return
    const { error } = await sb.from('quotes').delete().eq('id', q.id)
    if (error) {
      showToast(`Помилка: ${error.message}`)
      return
    }
    showToast('Видалено')
    await reload()
  }

  const total = quotes?.length ?? 0
  const unused = quotes?.filter((q) => !q.used).length ?? 0

  return (
    <div>
      <p className="eyebrow">Пул цитат</p>
      <h1 className="day-title">Цитати</h1>

      <form className="card add-form" onSubmit={add}>
        <div className="mode-row">
          <span className="muted">
            {bulkMode ? 'Кожна цитата — з нового абзацу (розділяй порожнім рядком)' : 'Одна цитата'}
          </span>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setBulkMode((v) => !v)}
          >
            {bulkMode ? 'Одна цитата' : 'Додати списком'}
          </button>
        </div>

        <textarea
          className="input"
          rows={bulkMode ? 7 : 3}
          placeholder={
            bulkMode
              ? 'Перша цитата…\n\nДруга цитата…\n\nТретя цитата…'
              : 'Текст цитати…'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {!bulkMode && (
          <input
            className="input"
            placeholder="Автор (необовʼязково)"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        )}
        <button className="btn primary" disabled={busy || !text.trim()}>
          {bulkMode ? 'Додати всі' : 'Додати цитату'}
        </button>
      </form>

      {quotes === null ? (
        <div className="loader" aria-label="Завантаження" />
      ) : (
        <>
          <p className="counter muted">
            У пулі: {total} · Ще не випадали в цьому циклі: {unused}
          </p>

          {total === 0 && (
            <div className="card">
              <p className="muted">
                Тут поки порожньо. Додай цитати — і вони почнуть приходити щоранку о 8:00.
              </p>
            </div>
          )}

          <ul className="quote-list">
            {quotes.map((q) =>
              editingId === q.id ? (
                <li className="card quote-item" key={q.id}>
                  <form onSubmit={saveEdit}>
                    <textarea
                      className="input"
                      rows={3}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                    />
                    <input
                      className="input"
                      placeholder="Автор (необовʼязково)"
                      value={editAuthor}
                      onChange={(e) => setEditAuthor(e.target.value)}
                    />
                    <div className="row">
                      <button className="btn primary small">Зберегти</button>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setEditingId(null)}
                      >
                        Скасувати
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li className="card quote-item" key={q.id}>
                  <p className="quote-text">{q.text}</p>
                  {q.author && <p className="quote-author muted">— {q.author}</p>}
                  <div className="row">
                    {!q.used && <span className="chip">чекає своєї черги</span>}
                    <span className="spacer" />
                    <button className="btn ghost small" onClick={() => startEdit(q)}>
                      Редагувати
                    </button>
                    <button className="btn ghost small danger" onClick={() => remove(q)}>
                      Видалити
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        </>
      )}
    </div>
  )
}
