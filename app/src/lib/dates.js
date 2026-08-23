const TZ = 'Europe/Warsaw'

/** Сьогоднішня дата у Варшаві у форматі YYYY-MM-DD */
export function todayWarsaw() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}

/** «пʼятниця, 3 липня» → «Пʼятниця, 3 липня» */
export function formatDayTitle(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  const s = d.toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** «3 лип. 2026» — коротко для історії */
export function formatDayShort(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })
}
