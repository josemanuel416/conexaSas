/** Formato moneda COP (pesos colombianos) */
export function formatCop(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return ''
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

/** Convierte texto del input a número (acepta coma o punto decimal) */
export function parseMoneyInput(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  if (raw.includes(',')) {
    const [intPart, decPart = ''] = raw.split(',')
    const n = parseFloat(`${intPart.replace(/\./g, '')}.${decPart.replace(/\./g, '')}`)
    return Number.isNaN(n) ? 0 : n
  }
  const n = parseFloat(raw.replace(/\./g, ''))
  return Number.isNaN(n) ? 0 : n
}

/** Limpia el texto mientras se escribe: dígitos y un separador decimal */
export function sanitizeMoneyInput(value) {
  let s = String(value ?? '').replace(/[^\d.,]/g, '')
  const sepIdx = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
  if (sepIdx >= 0) {
    const intPart = s.slice(0, sepIdx).replace(/[.,]/g, '')
    const decPart = s.slice(sepIdx + 1).replace(/[.,]/g, '').slice(0, 2)
    s = decPart.length ? `${intPart},${decPart}` : `${intPart},`
  } else {
    s = s.replace(/[.,]/g, '')
  }
  return s
}

/** Valor inicial legible para el input */
export function moneyInputFromNumber(value) {
  if (value == null || value === '') return ''
  const n = Number(value)
  if (Number.isNaN(n) || n === 0) return ''
  const [intPart, decPart] = n.toFixed(2).split('.')
  if (decPart === '00') return String(Number(intPart))
  return `${Number(intPart)},${decPart}`
}
