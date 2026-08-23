import { useEffect, useRef, useState } from 'react'
import { trackUrl } from '../lib/supabase.js'

function fmt(sec) {
  if (!isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Обрій = прогрес-бар, сонце = кнопка Play/Pause.
 * Поки трек грає, сонце рухається вздовж обрію зі сходу на захід.
 */
export default function HorizonPlayer({ trackVersion, goToSettings }) {
  const audioRef = useRef(null)
  const lineRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [missing, setMissing] = useState(false)

  const src = trackVersion ? trackUrl(trackVersion) : null

  useEffect(() => {
    setMissing(false)
    setPlaying(false)
    setProgress(0)
    setCurrent(0)
  }, [trackVersion])

  if (!trackVersion || missing) {
    return (
      <div className="card player-empty">
        <p className="muted">
          {missing ? 'Не вдалося завантажити трек.' : 'Музики ще немає.'}{' '}
          Додай трек у Налаштуваннях — і ранок зазвучить.
        </p>
        <button className="btn" onClick={goToSettings}>
          До налаштувань
        </button>
      </div>
    )
  }

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      a.play().catch(() => setMissing(true))
    } else {
      a.pause()
    }
  }

  function seekFromPointer(e) {
    const a = audioRef.current
    const line = lineRef.current
    if (!a || !line || !isFinite(a.duration)) return
    const rect = line.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const ratio = Math.min(1, Math.max(0, x / rect.width))
    a.currentTime = ratio * a.duration
  }

  function onKeyDown(e) {
    const a = audioRef.current
    if (!a) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      toggle()
    } else if (e.key === 'ArrowRight') {
      a.currentTime = Math.min(a.duration || 0, a.currentTime + 10)
    } else if (e.key === 'ArrowLeft') {
      a.currentTime = Math.max(0, a.currentTime - 10)
    }
  }

  return (
    <div className="player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
          setCurrent(0)
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          setCurrent(a.currentTime)
          if (isFinite(a.duration) && a.duration > 0) setProgress(a.currentTime / a.duration)
        }}
        onError={() => setMissing(true)}
      />

      <div className="horizon" ref={lineRef} onClick={seekFromPointer}>
        <div className="horizon-line" />
        <button
          type="button"
          className={`sun ${playing ? 'playing' : ''}`}
          style={{ left: `${progress * 100}%` }}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          onKeyDown={onKeyDown}
          aria-label={playing ? 'Пауза' : 'Відтворити трек'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" fill="#14182E" />
              <rect x="14" y="5" width="4" height="14" rx="1" fill="#14182E" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="#14182E" />
            </svg>
          )}
        </button>
      </div>

      <div className="player-times muted">
        <span>{fmt(current)}</span>
        <span>{duration ? fmt(duration) : ''}</span>
      </div>
    </div>
  )
}
