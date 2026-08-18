/** Códigos de tipo de documento DIAN (schemeName) */
export const DIAN_DOCUMENT_TYPES = [
  { label: 'Cédula de ciudadanía (CC)', value: '13', abbr: 'CC' },
  { label: 'Cédula de extranjería (CE)', value: '22', abbr: 'CE' },
  { label: 'NIT', value: '31', abbr: 'NIT' },
  { label: 'Pasaporte', value: '41', abbr: 'PA' },
  { label: 'Documento extranjero', value: '42', abbr: 'DE' },
]

export const PERSON_TYPES = [
  { label: 'Persona natural', value: 'natural' },
  { label: 'Persona jurídica', value: 'juridica' },
]

/** Responsabilidad fiscal DIAN (listName 48) — adquiriente */
export const TAX_LEVEL_OPTIONS = [
  { label: 'No responsable de IVA — Persona natural', value: 'R-99-PN', personType: 'natural', vat: false },
  { label: 'No responsable de IVA — Persona jurídica', value: 'R-99-PJ', personType: 'juridica', vat: false },
  { label: 'Responsable de IVA', value: 'O-48', vat: true },
  { label: 'Régimen simple de tributación', value: 'O-47', vat: false },
]

export function documentTypeLabel(code) {
  return DIAN_DOCUMENT_TYPES.find((d) => d.value === code)?.abbr || code
}

export function isNitDocument(code) {
  return code === '31'
}

export function defaultPersonTypeForDocument(code) {
  return code === '31' ? 'juridica' : 'natural'
}

export function defaultTaxLevel(personType, isVatResponsible = false) {
  if (isVatResponsible) return 'O-48'
  return personType === 'juridica' ? 'R-99-PJ' : 'R-99-PN'
}

export function normalizeLegacyDocumentType(code) {
  const map = { CC: '13', CE: '22', NIT: '31', PA: '41', DE: '42' }
  return map[code?.toUpperCase?.()] || code || '13'
}
