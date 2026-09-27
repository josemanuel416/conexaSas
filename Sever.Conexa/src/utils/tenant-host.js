import { config } from '../config.js';

const RESERVED = new Set(['www', 'admin', 'api', 'app', 'mail', 'ftp']);

export function parseTenantHost(hostHeader) {
  const host = String(hostHeader || '').split(':')[0].trim().toLowerCase();
  const base = config.appDomain;
  const platform = config.platformSubdomain;

  if (!host || host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return { kind: 'local', host, slug: null };
  }

  if (host === base || host === `www.${base}`) {
    if (config.apexTenantSlug) {
      return { kind: 'tenant', host, slug: config.apexTenantSlug };
    }
    return { kind: 'apex', host, slug: null };
  }

  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) {
    return { kind: 'unknown', host, slug: null };
  }

  const sub = host.slice(0, -suffix.length);
  if (!sub || sub.includes('.')) {
    return { kind: 'unknown', host, slug: null };
  }

  if (sub === 'admin') return { kind: 'admin', host, slug: null };
  if (sub === platform || RESERVED.has(sub)) return { kind: 'platform', host, slug: null };
  return { kind: 'tenant', host, slug: sub };
}
