export function calcNitVerificationDigit(nit) {
  const digits = String(nit || '').replace(/\D/g, '')
  if (!digits || !/^\d+$/.test(digits)) return null

  const weights = [0, 3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const len = digits.length
  let sum = 0

  for (let i = 0; i < len; i++) {
    sum += Number(digits[i]) * weights[len - i]
  }

  const remainder = sum % 11
  if (remainder <= 1) return remainder
  return 11 - remainder
}

/** Separa NIT base y DV desde textos tipo 900123456-7 o 9001234567 */
export function parseNitAndDv(value) {
  const text = String(value || '').trim()
  if (!text) return { nit: '', dv: '' }

  const separated = text.match(/(\d{8,10})\s*[-–—./]\s*(\d)/)
  if (separated) {
    return { nit: separated[1], dv: separated[2] }
  }

  const digits = text.replace(/\D/g, '')
  if (!digits) return { nit: '', dv: '' }

  if (digits.length === 10 || digits.length === 11) {
    for (const baseLen of [9, 10]) {
      const nit = digits.slice(0, baseLen)
      const dvPart = digits.slice(baseLen)
      if (!dvPart) continue
      const computed = calcNitVerificationDigit(nit)
      if (computed != null && String(computed) === dvPart.charAt(0)) {
        return { nit, dv: String(computed) }
      }
    }
  }

  if (digits.length >= 9 && digits.length <= 10) {
    return { nit: digits, dv: '' }
  }

  return { nit: digits.slice(0, 10), dv: '' }
}

export function normalizeEmissorNit(nit, dv = '') {
  if (dv !== '' && dv != null) {
    const base = String(nit || '').replace(/\D/g, '')
    if (base) return base.slice(0, 10)
  }
  return parseNitAndDv(nit).nit
}

export function normalizeDianDocumentType(code) {
  const map = { CC: '13', CE: '22', NIT: '31', PA: '41', DE: '42' }
  return map[String(code || '').toUpperCase()] || code || '13'
}
