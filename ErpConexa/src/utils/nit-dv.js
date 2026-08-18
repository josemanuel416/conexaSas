/**
 * Dígito de verificación NIT Colombia (algoritmo DIAN mod 11).
 * @param {string|number} nit - Número sin DV
 * @returns {number|null}
 */
export function calcNitVerificationDigit(nit) {
  const digits = String(nit || '').replace(/\D/g, '')
  if (!digits || !/^\d+$/.test(digits)) return null

  const weights = [0, 3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const len = digits.length
  let sum = 0

  for (let i = 0; i < len; i++) {
    const digit = Number(digits[i])
    const weight = weights[len - i]
    sum += digit * weight
  }

  const remainder = sum % 11
  if (remainder <= 1) return remainder
  return 11 - remainder
}

export function formatNitWithDv(nit, dv) {
  const base = String(nit || '').replace(/\D/g, '')
  if (!base) return ''
  if (dv == null || dv === '') return base
  return `${base}-${dv}`
}
