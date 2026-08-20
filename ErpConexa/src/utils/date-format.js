/** Zona horaria operativa: Bogotá / Lima / Quito (UTC−5, sin DST). */

export const APP_TIMEZONE = 'America/Bogota'
export const APP_LOCALE = 'es-CO'

export function formatDate(value) {
  if (!value) return '—'

  const str = String(value).trim()
  const dateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return `${day}/${month}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return str

  return date.toLocaleDateString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatDateTime(value, options = {}) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
    ...options,
  })
}
