const APP_DOMAIN = 'connetcgroup.com'
const PLATFORM_SUBDOMAIN = 'conexa'
const APEX_TENANT_SLUG = 'connetc-group-sas'
const RESERVED = new Set(['www', 'admin', 'api', 'app', 'mail', 'ftp', PLATFORM_SUBDOMAIN])

export function parseTenantHost(hostname) {
  const host = String(hostname || '').split(':')[0].trim().toLowerCase()

  if (!host || host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return { kind: 'local', host, slug: null }
  }

  if (host === APP_DOMAIN || host === `www.${APP_DOMAIN}`) {
    if (APEX_TENANT_SLUG) return { kind: 'tenant', host, slug: APEX_TENANT_SLUG }
    return { kind: 'apex', host, slug: null }
  }

  const suffix = `.${APP_DOMAIN}`
  if (!host.endsWith(suffix)) return { kind: 'unknown', host, slug: null }

  const sub = host.slice(0, -suffix.length)
  if (!sub || sub.includes('.')) return { kind: 'unknown', host, slug: null }
  if (sub === 'admin') return { kind: 'admin', host, slug: null }
  if (RESERVED.has(sub)) return { kind: 'platform', host, slug: null }
  return { kind: 'tenant', host, slug: sub }
}
