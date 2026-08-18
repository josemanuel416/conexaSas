// Resuelve certificado y variables DIAN por compañía (multi-tenant)
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const COMPANIES_ROOT = path.join(__dirname, '..', 'cert', 'companies');
const LEGACY_CERT_DIR = path.join(__dirname, '..', 'cert');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function findLegacyCertPath() {
  for (const name of ['cert.p12', 'cert.pfx']) {
    const full = path.join(LEGACY_CERT_DIR, name);
    if (fs.existsSync(full)) return full;
  }
  if (!fs.existsSync(LEGACY_CERT_DIR)) return path.join(LEGACY_CERT_DIR, 'cert.p12');
  const found = fs.readdirSync(LEGACY_CERT_DIR).find((f) => /\.(p12|pfx)$/i.test(f));
  return found ? path.join(LEGACY_CERT_DIR, found) : path.join(LEGACY_CERT_DIR, 'cert.p12');
}

function loadLegacyConfig(overrides = {}) {
  const certEnv = parseEnvFile(path.join(LEGACY_CERT_DIR, 'cert.env'));
  return {
    companyId: null,
    source: 'legacy',
    certPath: findLegacyCertPath(),
    certPass: overrides.certPass || certEnv.CERT_PASS || process.env.CERT_PASS || '',
    softwareId: overrides.softwareId || certEnv.SOFTWARE_ID || process.env.SOFTWARE_ID || '',
    softwarePin: overrides.softwarePin || certEnv.SOFTWARE_PIN || process.env.SOFTWARE_PIN || '',
    claveTecnica: overrides.claveTecnica || certEnv.CLAVE_TECNICA || process.env.CLAVE_TECNICA || '',
    dianEnv: overrides.dianEnv || certEnv.DIAN_ENV || process.env.DIAN_ENV || 'habilitacion',
  };
}

/**
 * @param {string|null} companyId
 * @param {{ claveTecnica?: string, softwareId?: string, dianEnv?: string }} overrides
 */
function loadCompanyConfig(companyId, overrides = {}) {
  if (!companyId) {
    return loadLegacyConfig(overrides);
  }

  const companyDir = path.join(COMPANIES_ROOT, String(companyId));
  const certPath = path.join(companyDir, 'cert.p12');

  if (!fs.existsSync(certPath)) {
    console.warn(`[CONFIG] Certificado no encontrado para compañía ${companyId}, usando legacy`);
    return loadLegacyConfig(overrides);
  }

  const certEnv = parseEnvFile(path.join(companyDir, 'cert.env'));
  let meta = {};
  const metaPath = path.join(companyDir, 'meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      meta = {};
    }
  }

  return {
    companyId: String(companyId),
    source: 'company',
    certPath,
    // Solo cert.env / meta / overrides — no mezclar con .env global de ServerFEpos
    certPass: overrides.certPass || certEnv.CERT_PASS || '',
    softwareId:
      overrides.softwareId ||
      meta.softwareId ||
      certEnv.SOFTWARE_ID ||
      '',
    softwarePin:
      overrides.softwarePin ||
      meta.softwarePin ||
      certEnv.SOFTWARE_PIN ||
      '',
    claveTecnica:
      overrides.claveTecnica ||
      meta.claveTecnica ||
      certEnv.CLAVE_TECNICA ||
      '',
    dianEnv:
      overrides.dianEnv ||
      meta.dianEnvironment ||
      certEnv.DIAN_ENV ||
      'habilitacion',
    documentType: overrides.documentType || '',
    testSetId: overrides.testSetId || meta.testSetId || certEnv.TEST_SET_ID || '',
  };
}

function cacheKeyForConfig(cfg) {
  let certMtime = '';
  try {
    if (cfg.certPath && fs.existsSync(cfg.certPath)) {
      certMtime = String(fs.statSync(cfg.certPath).mtimeMs);
    }
  } catch {
    certMtime = '';
  }
  return `${cfg.certPath}|${certMtime}|${cfg.certPass}|${cfg.dianEnv}`;
}

module.exports = {
  loadCompanyConfig,
  loadLegacyConfig,
  cacheKeyForConfig,
  COMPANIES_ROOT,
};
