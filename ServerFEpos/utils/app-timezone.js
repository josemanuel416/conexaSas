/** Zona horaria operativa: Bogotá / Lima / Quito (UTC−5, sin DST). */

const APP_TIMEZONE = process.env.TZ || 'America/Bogota';

if (!process.env.TZ) {
  process.env.TZ = APP_TIMEZONE;
}

function nowAppTimezoneParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}:${get('second')}-05:00`,
  };
}

function formatDateTimeEs(value, options = {}) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', { timeZone: APP_TIMEZONE, ...options });
}

module.exports = {
  APP_TIMEZONE,
  nowAppTimezoneParts,
  formatDateTimeEs,
};
