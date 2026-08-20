/** Zona horaria operativa: Bogotá / Lima / Quito (UTC−5, sin DST). */

export const APP_TIMEZONE = process.env.TZ || 'America/Bogota';
export const APP_LOCALE = 'es-CO';

if (!process.env.TZ) {
  process.env.TZ = APP_TIMEZONE;
}

export function parseInputDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00`);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function todayIsoDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(date);
}

export function currentYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
  }).format(date));
}

export function yearFromDateValue(value) {
  if (!value) return currentYear();
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return Number(s.slice(0, 4));
  const d = parseInputDate(value);
  if (!d) return currentYear();
  return currentYear(d);
}

export function formatDateEs(value, options = {}) {
  if (!value) return '—';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [, y, m, d] = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return `${d}/${m}/${y}`;
  }
  const d = parseInputDate(value);
  if (!d) return s.slice(0, 10);
  return d.toLocaleDateString(APP_LOCALE, { timeZone: APP_TIMEZONE, ...options });
}

export function formatDateTimeEs(value, options = {}) {
  const d = parseInputDate(value) ?? (value instanceof Date ? value : new Date(value));
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(APP_LOCALE, { timeZone: APP_TIMEZONE, ...options });
}

export function formatPrintDateTime(value = new Date()) {
  return formatDateTimeEs(value, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function nowAppTimezoneParts(date = new Date()) {
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
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}
