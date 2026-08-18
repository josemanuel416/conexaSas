import { setCssVar } from 'quasar'
import { CONEXASOFT_BRAND, CONEXASOFT_COMPANY_THEME } from 'src/config/conexasoft-brand.js'

/** Paleta fija del panel administrativo ConexaSoft. */
export const ADMIN_THEME = { ...CONEXASOFT_COMPANY_THEME }

export const DEFAULT_COMPANY_THEME = { ...CONEXASOFT_COMPANY_THEME }

function applyQuasarBrandVars(brand) {
  setCssVar('primary', brand.primary)
  setCssVar('secondary', brand.secondary)
  setCssVar('accent', brand.accent)
  if (brand.dark) setCssVar('dark', brand.dark)
  if (brand.positive) setCssVar('positive', brand.positive)
  if (brand.negative) setCssVar('negative', brand.negative)
  if (brand.info) setCssVar('info', brand.info)
  if (brand.warning) setCssVar('warning', brand.warning)
}

function applyThemeToDocument(theme, { extended = false } = {}) {
  const t = normalizeTheme(theme)
  applyQuasarBrandVars(extended ? CONEXASOFT_BRAND : t)
  document.documentElement.style.setProperty('--company-primary', t.primary)
  document.documentElement.style.setProperty('--company-secondary', t.secondary)
  document.documentElement.style.setProperty('--company-accent', t.accent)
  return t
}

export function normalizeTheme(theme) {
  return {
    primary: theme?.primary || DEFAULT_COMPANY_THEME.primary,
    secondary: theme?.secondary || DEFAULT_COMPANY_THEME.secondary,
    accent: theme?.accent || DEFAULT_COMPANY_THEME.accent,
  }
}

export function applyCompanyTheme(theme) {
  return applyThemeToDocument(theme)
}

export function applyAdminTheme() {
  return applyThemeToDocument(ADMIN_THEME, { extended: true })
}

export function isAdminRoute() {
  const hash = window.location.hash || '#/'
  return hash.startsWith('#/admin')
}

export function getThemeFromAuth(auth) {
  return normalizeTheme(auth?.theme)
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function themeHeaderStyle(theme) {
  const t = normalizeTheme(theme)
  return {
    background: `linear-gradient(135deg, ${t.primary} 0%, ${t.secondary} 100%)`,
  }
}

export function themeSoftBg(theme) {
  const { r, g, b } = hexToRgb(normalizeTheme(theme).primary)
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.06)`,
  }
}
