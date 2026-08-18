import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import forge from 'node-forge';
import { config } from '../config.js';
import { parseNitAndDv, normalizeEmissorNit } from './nit-dv.js';

function encryptionKey() {
  return crypto.createHash('sha256').update(config.jwt.secret).digest();
}

export function encryptSecret(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload) {
  if (!payload) return null;
  const [ivHex, dataHex] = payload.split(':');
  if (!ivHex || !dataHex) return null;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      encryptionKey(),
      Buffer.from(ivHex, 'hex')
    );
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/** Lee secreto cifrado o texto plano legacy (PIN SMTP/cert antes de encryptSecret). */
export function resolveSecret(stored) {
  if (!stored) return null;
  const decrypted = decryptSecret(stored);
  if (decrypted) return decrypted;
  if (!String(stored).includes(':')) return String(stored);
  return null;
}

function attrValue(attributes, names) {
  for (const attr of attributes || []) {
    const short = forge.pki.oids[attr.type] || attr.shortName || attr.name || attr.type;
    if (names.includes(short) || names.includes(attr.type)) {
      return String(attr.value || '').trim();
    }
  }
  return '';
}

function extractNitFromSubject(certificate) {
  const serial = attrValue(certificate.subject.attributes, ['serialNumber']);
  const orgId = attrValue(certificate.subject.attributes, ['organizationIdentifier', '2.5.4.97']);
  const cn = attrValue(certificate.subject.attributes, ['commonName', 'CN']);
  const sources = [serial, orgId, cn];

  for (const source of sources) {
    const parsed = parseNitAndDv(source);
    if (parsed.nit) return parsed;
  }
  return { nit: '', dv: '' };
}

function keysMatch(certificate, privateKey) {
  try {
    const publicKey = certificate.publicKey;
    if (publicKey?.n && privateKey?.n) {
      return publicKey.n.equals(privateKey.n) && publicKey.e.equals(privateKey.e);
    }
    const md = forge.md.sha256.create();
    md.update('conexa-cert-check', 'utf8');
    const signature = privateKey.sign(md);
    return publicKey.verify(md.digest().bytes(), signature);
  } catch {
    return false;
  }
}

function extractP12Contents(p12) {
  const certs = [];
  const keys = [];

  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (safeBag.cert) certs.push(safeBag.cert);
      if (safeBag.key) keys.push(safeBag.key);
    }
  }

  return { certs, keys };
}

function findMatchingCertKey(certs, keys) {
  for (const certificate of certs) {
    for (const privateKey of keys) {
      if (keysMatch(certificate, privateKey)) {
        return { certificate, privateKey };
      }
    }
  }
  return null;
}

function pickEndEntityCertificate(certs) {
  if (certs.length === 1) return certs[0];

  const withNit = certs.filter((cert) => extractNitFromSubject(cert).nit);
  if (withNit.length === 1) return withNit[0];

  const nonCa = certs.filter((cert) => {
    const basic = cert.getExtension?.('basicConstraints');
    return !basic || !basic.cA;
  });
  if (nonCa.length === 1) return nonCa[0];

  return withNit[0] || nonCa[0] || certs[certs.length - 1];
}

export function validateP12Certificate(buffer, password) {
  if (!buffer?.length) {
    throw new Error('El archivo del certificado está vacío');
  }
  if (!password?.trim()) {
    throw new Error('La contraseña del certificado es obligatoria');
  }

  let p12;
  try {
    const der = buffer.toString('binary');
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password.trim());
  } catch (err) {
    if (String(err.message || '').includes('MAC could not be verified')) {
      throw new Error('Contraseña del certificado incorrecta');
    }
    throw new Error('Archivo .p12/.pfx inválido o corrupto');
  }

  let certificate = null;
  let privateKey = null;
  const { certs, keys } = extractP12Contents(p12);

  if (!certs.length) throw new Error('No se encontró certificado dentro del archivo');
  if (!keys.length) throw new Error('No se encontró clave privada dentro del archivo');

  const matched = findMatchingCertKey(certs, keys);
  if (matched) {
    certificate = matched.certificate;
    privateKey = matched.privateKey;
  } else {
    certificate = pickEndEntityCertificate(certs);
    privateKey = keys[0];
    if (!keysMatch(certificate, privateKey)) {
      throw new Error(
        'No se pudo emparejar el certificado con la clave privada. Verifique el archivo .p12 y la contraseña.'
      );
    }
  }

  const now = new Date();
  const validFrom = certificate.validity.notBefore;
  const validTo = certificate.validity.notAfter;
  const isValid = now >= validFrom && now <= validTo;
  const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
  const subjectCn = attrValue(certificate.subject.attributes, ['commonName', 'CN']);
  const { nit: subjectNit, dv: subjectDv } = extractNitFromSubject(certificate);
  const fingerprint = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    subjectCn,
    subjectNit,
    subjectDv,
    validFrom,
    validTo,
    isValid,
    daysRemaining,
    fingerprint,
    keyBits: privateKey.n.bitLength(),
  };
}

export function companyCertDir(companyId) {
  return path.join(config.certStoragePath, String(companyId));
}

export function companyCertFile(companyId) {
  return path.join(companyCertDir(companyId), 'cert.p12');
}

export function saveCompanyCertificate(companyId, buffer) {
  const dir = companyCertDir(companyId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = companyCertFile(companyId);
  fs.writeFileSync(filePath, buffer);
  return path.relative(config.certStoragePath, filePath).replace(/\\/g, '/');
}

export function deleteCompanyCertificate(storageKey) {
  if (!storageKey) return;
  const filePath = path.join(config.certStoragePath, storageKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  const dir = path.dirname(filePath);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

export function syncCertificateToFePos(companyId, buffer, password, dianMeta = {}) {
  if (!config.fePosCertRoot) return { synced: false, reason: 'FEPOS_CERT_ROOT no configurado' };

  const targetDir = path.join(config.fePosCertRoot, String(companyId));
  fs.mkdirSync(targetDir, { recursive: true });
  const certPath = path.join(targetDir, 'cert.p12');
  fs.writeFileSync(certPath, buffer);

  writeFePosCompanyFiles(targetDir, companyId, password, dianMeta);

  return { synced: true, path: certPath };
}

function writeFePosCompanyFiles(targetDir, companyId, password, dianMeta = {}) {
  const meta = {
    companyId,
    updatedAt: new Date().toISOString(),
    certFile: 'cert.p12',
    softwareId: dianMeta.softwareId || '',
    nit: dianMeta.nit || '',
    dianEnvironment: dianMeta.dianEnvironment || '',
  };
  fs.writeFileSync(path.join(targetDir, 'meta.json'), JSON.stringify(meta, null, 2));

  const envLines = [
    `# Generado por Sever.Conexa — compañía ${companyId}`,
    `CERT_PASS=${password}`,
  ];
  if (dianMeta.softwareId) envLines.push(`SOFTWARE_ID=${dianMeta.softwareId}`);
  if (dianMeta.dianEnvironment) envLines.push(`DIAN_ENV=${dianMeta.dianEnvironment}`);
  fs.writeFileSync(path.join(targetDir, 'cert.env'), envLines.join('\n'), { mode: 0o600 });
}

/** Actualiza meta/cert.env en ServerFEpos sin volver a subir el .p12 */
export function syncFePosCompanyMeta(companyId, dianMeta = {}) {
  if (!config.fePosCertRoot) return { synced: false, reason: 'FEPOS_CERT_ROOT no configurado' };

  const targetDir = path.join(config.fePosCertRoot, String(companyId));
  if (!fs.existsSync(path.join(targetDir, 'cert.p12'))) {
    return { synced: false, reason: 'Certificado no sincronizado en ServerFEpos' };
  }

  let password = '';
  const certEnvPath = path.join(targetDir, 'cert.env');
  if (fs.existsSync(certEnvPath)) {
    for (const line of fs.readFileSync(certEnvPath, 'utf8').split(/\r?\n/)) {
      if (line.startsWith('CERT_PASS=')) password = line.slice('CERT_PASS='.length);
    }
  }

  writeFePosCompanyFiles(targetDir, companyId, password, dianMeta);
  return { synced: true, path: targetDir };
}

export function formatCertificateInfo(row, companyNit = '', companyDv = '') {
  if (!row?.dian_cert_storage_key) {
    return {
      configured: false,
      hasPassword: false,
    };
  }

  const companyBase = normalizeEmissorNit(companyNit, companyDv);
  const certBase = normalizeEmissorNit(row.dian_cert_subject_nit || '');
  const certDv = row.dian_cert_subject_dv != null && row.dian_cert_subject_dv !== ''
    ? String(row.dian_cert_subject_dv)
    : '';
  const now = new Date();
  const validTo = row.dian_cert_valid_to ? new Date(row.dian_cert_valid_to) : null;
  const isValid = validTo ? now <= validTo : false;
  const daysRemaining = validTo
    ? Math.floor((validTo - now) / (1000 * 60 * 60 * 24))
    : null;

  return {
    configured: true,
    hasPassword: Boolean(row.dian_cert_password_enc),
    subjectCn: row.dian_cert_subject_cn || '',
    subjectNit: certBase,
    subjectDv: certDv,
    nitMatches: !companyBase || !certBase || companyBase === certBase,
    dvMatches: !companyDv || !certDv || String(companyDv) === certDv,
    validFrom: row.dian_cert_valid_from,
    validTo: row.dian_cert_valid_to,
    isValid,
    daysRemaining,
    fingerprint: row.dian_cert_fingerprint || '',
    uploadedAt: row.dian_cert_uploaded_at,
    syncedToFePos: Boolean(row.dian_cert_synced_fepos_at),
    syncedAt: row.dian_cert_synced_fepos_at,
  };
}

export function assessCertificateReadiness(certificate, companyNit = '', companyDv = '') {
  const missing = [];
  const warnings = [];

  if (!certificate?.configured) {
    missing.push('Certificado digital .p12/.pfx');
    return { ready: false, missing, warnings };
  }

  if (!certificate.hasPassword) missing.push('Contraseña del certificado digital');
  if (!certificate.nitMatches) {
    missing.push(`NIT del certificado (${certificate.subjectNit || '?'}) no coincide con el emisor`);
  }
  if (certificate.subjectDv && companyDv && !certificate.dvMatches) {
    warnings.push(`DV del certificado (${certificate.subjectDv}) difiere del emisor (${companyDv})`);
  }
  if (!certificate.isValid) {
    missing.push('Certificado digital vencido o aún no vigente');
  } else if (certificate.daysRemaining != null && certificate.daysRemaining <= 30) {
    warnings.push(`Certificado vence en ${certificate.daysRemaining} días`);
  }
  if (!certificate.syncedToFePos) {
    warnings.push('Certificado pendiente de sincronizar con ServerFEpos');
  }

  return { ready: missing.length === 0, missing, warnings };
}

export function assessFePosSendReadiness({ fePosUrl } = {}) {
  const missing = [];
  const warnings = [];

  if (!fePosUrl) {
    missing.push('URL de ServerFEpos (FEPOS_URL) no configurada en la API');
  }

  return { ready: missing.length === 0, missing, warnings };
}
