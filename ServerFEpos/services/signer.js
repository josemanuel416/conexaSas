// services/signer.js - Firma XAdES-EPES para DIAN Colombia
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const crypto = require('crypto');
const { nowAppTimezoneParts } = require('../utils/app-timezone');
require('dotenv').config();

const CERT_PASS = process.env.CERT_PASS || '';

function findCertPath() {
  const certDir = path.join(__dirname, '../cert');
  for (const name of ['cert.p12', 'cert.pfx']) {
    const full = path.join(certDir, name);
    if (fs.existsSync(full)) return full;
  }
  const allFiles = fs.existsSync(certDir) ? fs.readdirSync(certDir) : [];
  const found = allFiles.find(f => f.endsWith('.p12') || f.endsWith('.pfx'));
  if (found) return path.join(certDir, found);
  return path.join(certDir, 'cert.p12');
}

const CERT_PATH = findCertPath();

const DIAN_POLICY_URL = 'https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf';
const DIAN_POLICY_HASH = 'dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=';

const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const EXT_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';

function localElementName(node) {
  if (!node) return '';
  const raw = node.localName || node.nodeName || node.tagName || '';
  return raw.includes(':') ? raw.split(':').pop() : raw;
}

function isAttachedDocumentRoot(doc) {
  return /AttachedDocument$/i.test(localElementName(doc.documentElement));
}

function getExtensionContents(doc) {
  const byNs = doc.getElementsByTagNameNS(EXT_NS, 'ExtensionContent');
  if (byNs?.length) return byNs;

  const byPrefix = doc.getElementsByTagName('ext:ExtensionContent');
  if (byPrefix?.length) return byPrefix;

  const all = doc.getElementsByTagName('*');
  const found = [];
  for (let i = 0; i < all.length; i += 1) {
    if (localElementName(all[i]) === 'ExtensionContent') found.push(all[i]);
  }
  return found;
}
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const { C14nCanonicalization } = require('xml-crypto/lib/c14n-canonicalization');
const { findAncestorNs } = require('xml-crypto/lib/utils');
const { SignedXml } = require('xml-crypto');
const DIGEST_SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const SIG_RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

const OID_TO_SHORT = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST',
  '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.12': 'T', '2.5.4.42': 'GN',
  '2.5.4.4': 'SN', '2.5.4.5': 'SERIALNUMBER', '2.5.4.9': 'STREET',
  '1.2.840.113549.1.9.1': 'E', '0.9.2342.19200300.100.1.25': 'DC',
};

function hexSerialToDecimal(hexStr) {
  let hex = hexStr.replace(/:/g, '').toLowerCase();
  if (hex.length % 2 !== 0) hex = '0' + hex;
  let decimal = '0';
  for (let i = 0; i < hex.length; i++) {
    const digit = parseInt(hex[i], 16);
    let carry = digit;
    const r = [];
    for (let j = decimal.length - 1; j >= 0; j--) {
      const val = parseInt(decimal[j], 10) * 16 + carry;
      r.unshift(val % 10);
      carry = Math.floor(val / 10);
    }
    while (carry > 0) {
      r.unshift(carry % 10);
      carry = Math.floor(carry / 10);
    }
    decimal = r.join('') || '0';
  }
  return decimal;
}

function formatIssuerRfc2253(issuerAttributes) {
  const parts = [];
  for (let i = issuerAttributes.length - 1; i >= 0; i--) {
    const attr = issuerAttributes[i];
    const shortName = OID_TO_SHORT[attr.type] || forge.pki.oids[attr.type] || attr.type;
    parts.push(`${shortName}=${attr.value}`);
  }
  return parts.join(', ');
}

function extractTaxAmount(doc, taxSchemeId) {
  const taxTotals = doc.getElementsByTagName('cac:TaxTotal');
  for (let i = 0; i < taxTotals.length; i++) {
    const subtotals = taxTotals[i].getElementsByTagName('cac:TaxSubtotal');
    for (let j = 0; j < subtotals.length; j++) {
      const scheme = subtotals[j].getElementsByTagName('cac:TaxScheme')[0];
      if (!scheme) continue;
      const schemeId = scheme.getElementsByTagName('cbc:ID')[0]?.textContent?.trim();
      if (schemeId === taxSchemeId) {
        return subtotals[j].getElementsByTagName('cbc:TaxAmount')[0]?.textContent?.trim() || '0.00';
      }
    }
  }
  return '0.00';
}

function calculateSoftwareSecurityCode(softwareId, softwarePin, prefix, consecutive) {
  const sscString = `${softwareId}${softwarePin}${prefix}${consecutive}`;
  return crypto.createHash('sha384').update(sscString, 'utf8').digest('hex');
}

function calculateCUFE(doc, claveTecnica, softwarePin) {
  const isCreditNote = !!doc.getElementsByTagName('cbc:CreditNoteTypeCode')[0];
  const key = isCreditNote
    ? (softwarePin || '')
    : (claveTecnica || process.env.CLAVE_TECNICA || '');
  if (!key) {
    console.warn(isCreditNote ? '[CUDE] PIN software no configurado' : '[CUFE] CLAVE_TECNICA no configurada');
  }

  const invoiceNumber = doc.getElementsByTagName('cbc:ID')[0]?.textContent || '';
  const issueDate = doc.getElementsByTagName('cbc:IssueDate')[0]?.textContent || '';
  const issueTime = doc.getElementsByTagName('cbc:IssueTime')[0]?.textContent || '';
  const lineExtension = doc.getElementsByTagName('cbc:LineExtensionAmount')[0]?.textContent || '0.00';

  const valImp1 = extractTaxAmount(doc, '01');
  const valImp2 = extractTaxAmount(doc, '04');
  const valImp3 = extractTaxAmount(doc, '03');
  const payable = doc.getElementsByTagName('cbc:PayableAmount')[0]?.textContent || '0.00';

  const supplierParty = doc.getElementsByTagName('cac:AccountingSupplierParty')[0];
  const supplierID = supplierParty?.getElementsByTagName('cbc:CompanyID')[0]?.textContent || '';
  const customerParty = doc.getElementsByTagName('cac:AccountingCustomerParty')[0];
  const customerID = customerParty?.getElementsByTagName('cbc:CompanyID')[0]?.textContent || '';
  const profileExecutionID = doc.getElementsByTagName('cbc:ProfileExecutionID')[0]?.textContent || '2';

  // En CUFE de factura el tipo documento (01) coincide con el código IVA.
  // En CUDE de NC el tipo 91 NO va en la cadena; el primer slot es el impuesto 01.
  const firstAmountSlot = isCreditNote ? '01' : (
    doc.getElementsByTagName('cbc:InvoiceTypeCode')[0]?.textContent?.trim() || '01'
  );

  const cufeString = `${invoiceNumber}${issueDate}${issueTime}${lineExtension}${firstAmountSlot}${valImp1}04${valImp2}03${valImp3}${payable}${supplierID}${customerID}${key}${profileExecutionID}`;
  const hash = crypto.createHash('sha384').update(cufeString, 'utf8').digest('hex');

  console.log(isCreditNote ? '[CUDE] Cadena:' : '[CUFE] Cadena:', cufeString);
  console.log(isCreditNote ? '[CUDE] SHA-384:' : '[CUFE] SHA-384:', hash);
  return hash;
}

/**
 * Remueve todas las firmas ds:Signature existentes del segundo ExtensionContent
 * para evitar firmas duplicadas cuando el XML viene pre-firmado.
 */
function removeExistingSignatures(doc) {
  const attached = isAttachedDocumentRoot(doc);
  const extContents = getExtensionContents(doc);
  if (!extContents || extContents.length === 0) return;

  const targets = attached
    ? [extContents[0]]
    : extContents.length >= 2 ? [extContents[1]] : [];

  for (const target of targets) {
    const sigs = target.getElementsByTagNameNS(XMLDSIG_NS, 'Signature');
    for (let i = sigs.length - 1; i >= 0; i--) {
      sigs[i].parentNode.removeChild(sigs[i]);
    }
  }
}

function inclusiveC14n(node, ancestorDoc = null, xpathExpr = "//*[local-name()='SignedInfo']") {
  const c14n = new C14nCanonicalization();
  const options = {};
  if (ancestorDoc) {
    options.ancestorNamespaces = findAncestorNs(ancestorDoc, xpathExpr);
  }
  return c14n.process(node, options).toString();
}

function digestNodeInDoc(node, doc) {
  const nodeId = node.getAttribute?.('Id');
  const xpathExpr = nodeId ? `//*[@Id='${nodeId}']` : '//*';
  const canon = inclusiveC14n(node, doc, xpathExpr);
  return crypto.createHash('sha256').update(canon).digest('base64');
}

function inclusiveC14nFromString(xmlString) {
  const d = new DOMParser().parseFromString(xmlString, 'text/xml');
  return inclusiveC14n(d.documentElement);
}

function encodeBigIntBase64(bn) {
  let hex = bn.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return Buffer.from(hex, 'hex').toString('base64');
}

function buildRsaKeyValueXml(publicKey) {
  return `<ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${encodeBigIntBase64(publicKey.n)}</ds:Modulus><ds:Exponent>${encodeBigIntBase64(publicKey.e)}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue>`;
}

function getSignedInfoCanon(doc, signatureNode) {
  const helper = new SignedXml({});
  helper.signatureNode = signatureNode;
  helper.canonicalizationAlgorithm = C14N;
  return helper.getCanonSignedInfoXml(doc);
}

function readSoftwareIdFromDoc(doc, fallback = '') {
  const els = doc.getElementsByTagNameNS('*', 'SoftwareID');
  return els[0]?.textContent?.trim() || fallback;
}

function digestEmbeddedElement(outerXml, ns, localName) {
  const doc = new DOMParser().parseFromString(outerXml, 'text/xml');
  const el = doc.getElementsByTagNameNS(ns, localName)[0];
  if (!el) throw new Error(`No se encontró ${localName} para digest`);
  return crypto.createHash('sha256').update(inclusiveC14n(el)).digest('base64');
}

function getSigningTimeFromDoc(doc) {
  const issueDate = doc.getElementsByTagName('cbc:IssueDate')[0]?.textContent?.trim() || '';
  const issueTime = doc.getElementsByTagName('cbc:IssueTime')[0]?.textContent?.trim() || '';
  if (issueDate && issueTime) {
    if (/[+-]\d{2}:\d{2}$/.test(issueTime)) {
      return `${issueDate}T${issueTime}`;
    }
    return `${issueDate}T${issueTime}-05:00`;
  }
  const { date, time } = nowAppTimezoneParts();
  return `${date}T${time}`;
}

async function signXML(xmlString, companyConfig = null) {
  const TEST_MODE = process.env.TEST_MODE === 'true';
  if (TEST_MODE) {
    console.log('[SIGNER] MODO DE PRUEBA - XML no sera firmado');
    return `<!-- MODO DE PRUEBA: XML NO FIRMADO -->\n${xmlString}`;
  }

  const { loadLegacyConfig } = require('./company-config');
  const cfg = companyConfig || loadLegacyConfig();
  const certPath = cfg.certPath || CERT_PATH;
  const certPass = cfg.certPass || (cfg.source === 'company' ? '' : CERT_PASS);
  const softwareId = cfg.softwareId || (cfg.source === 'company' ? '' : process.env.SOFTWARE_ID || '');
  const claveTecnica = cfg.claveTecnica || (cfg.source === 'company' ? '' : process.env.CLAVE_TECNICA || '');

  if (cfg.source === 'company') {
    console.log('[SIGNER] Emisor compañía', cfg.companyId, '| ambiente:', cfg.dianEnv || 'habilitacion');
    if (!claveTecnica) console.warn('[SIGNER] Clave técnica no recibida (header X-Dian-Technical-Key)');
    if (!cfg.softwarePin) console.warn('[SIGNER] PIN software no recibido (header X-Dian-Software-Pin)');
  }

  if (!fs.existsSync(certPath)) {
    throw new Error(`Certificado no encontrado en: ${certPath}`);
  }

  if (!certPass) {
    throw new Error('Contraseña del certificado (CERT_PASS) no configurada');
  }

  try {
    const p12Der = fs.readFileSync(certPath);
    const p12Asn1 = forge.asn1.fromDer(p12Der.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, certPass);

    let certificate, privateKey;
    const candidateCerts = [];
    for (const sc of p12.safeContents) {
      for (const bag of sc.safeBags) {
        if (bag.type === forge.pki.oids.certBag && bag.cert) candidateCerts.push(bag.cert);
        if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) privateKey = bag.key;
      }
    }
    if (!privateKey) throw new Error('Certificado o clave privada no encontrados en el P12');

    const privateKeyPemForMatch = forge.pki.privateKeyToPem(privateKey);
    const probe = crypto.createSign('RSA-SHA256').update('conexa-cert-match').sign(privateKeyPemForMatch, 'base64');
    certificate = candidateCerts.find((cert) => {
      try {
        const pem = forge.pki.certificateToPem(cert);
        return crypto.createVerify('RSA-SHA256').update('conexa-cert-match').verify(pem, probe, 'base64');
      } catch {
        return false;
      }
    }) || null;

    if (!certificate) {
      throw new Error('Ningún certificado del P12 corresponde a la clave privada (revise cert.p12)');
    }
    const privateKeyPem = privateKeyPemForMatch;
    const serializer = new XMLSerializer();
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
    const isAttachedDocument = isAttachedDocumentRoot(doc)
      || /^AttachedDocument$/i.test(String(cfg.documentType || '').trim());

    // --- Remover firmas existentes para evitar duplicados ---
    removeExistingSignatures(doc);

    let cufe = null;
    if (!isAttachedDocument) {
      // --- Calcular y asignar CUFE ---
      cufe = calculateCUFE(doc, claveTecnica, cfg.softwarePin || (cfg.source === 'company' ? '' : process.env.SOFTWARE_PIN || ''));
      const uuidEl = doc.getElementsByTagName('cbc:UUID')[0];
      if (uuidEl) {
        uuidEl.textContent = cufe;
        console.log('[SIGNER] CUFE asignado');
      }

      // --- Calcular y asignar SSC (usar SoftwareID del XML para coincidir con UBL) ---
      const softwareIdVal = readSoftwareIdFromDoc(doc, softwareId);
      const softwarePinVal = cfg.softwarePin || (cfg.source === 'company' ? '' : process.env.SOFTWARE_PIN || '');
      const invoiceNumber = doc.getElementsByTagName('cbc:ID')[0]?.textContent || '';
      const stsPrefix = doc.getElementsByTagNameNS('*', 'Prefix');
      let prefix = '';
      let consecutive = invoiceNumber;
      if (stsPrefix && stsPrefix.length > 0) {
        prefix = stsPrefix[0].textContent || '';
        if (invoiceNumber.startsWith(prefix)) consecutive = invoiceNumber.substring(prefix.length);
      } else {
        const m = invoiceNumber.match(/^([A-Z]+)(\d+)$/);
        if (m) { prefix = m[1]; consecutive = m[2]; }
      }
      const ssc = calculateSoftwareSecurityCode(softwareIdVal, softwarePinVal, prefix, consecutive);
      const sscEls = doc.getElementsByTagNameNS('*', 'SoftwareSecurityCode');
      if (sscEls && sscEls.length > 0) sscEls[0].textContent = ssc;
    } else {
      console.log('[SIGNER] AttachedDocument: sin CUFE/SSC');
    }

    // --- Datos del certificado ---
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
    const certDigest = crypto.createHash('sha256').update(certDer, 'binary').digest('base64');
    const certSerialDec = hexSerialToDecimal(certificate.serialNumber);
    const certIssuer = formatIssuerRfc2253(certificate.issuer.attributes);
    const certBase64 = forge.util.encode64(certDer);

    const signingTime = getSigningTimeFromDoc(doc);
    const sigUuid = crypto.randomUUID();
    const signatureId = `xmldsig-${sigUuid}`;
    const keyInfoId = 'KeyInfo';
    const signedPropertiesId = `${signatureId}-signedprops`;
    const signatureValueId = `${signatureId}-sigvalue`;
    const refDocId = `${signatureId}-ref0`;
    const refKeyInfoId = `${signatureId}-ref1`;

    const keyInfoInner = `<ds:X509Data><ds:X509Certificate>${certBase64}</ds:X509Certificate></ds:X509Data>`;

    const signedPropsXml =
      `<xades:SignedProperties Id="${signedPropertiesId}">` +
      `<xades:SignedSignatureProperties>` +
      `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
      `<xades:SigningCertificate><xades:Cert>` +
      `<xades:CertDigest><ds:DigestMethod Algorithm="${DIGEST_SHA256}"/><ds:DigestValue>${certDigest}</ds:DigestValue></xades:CertDigest>` +
      `<xades:IssuerSerial><ds:X509IssuerName>${certIssuer}</ds:X509IssuerName><ds:X509SerialNumber>${certSerialDec}</ds:X509SerialNumber></xades:IssuerSerial>` +
      `</xades:Cert></xades:SigningCertificate>` +
      `<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId>` +
      `<xades:SigPolicyId><xades:Identifier>${DIAN_POLICY_URL}</xades:Identifier></xades:SigPolicyId>` +
      `<xades:SigPolicyHash><ds:DigestMethod Algorithm="${DIGEST_SHA256}"/><ds:DigestValue>${DIAN_POLICY_HASH}</ds:DigestValue></xades:SigPolicyHash>` +
      `</xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>` +
      `<xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>supplier</xades:ClaimedRole></xades:ClaimedRoles></xades:SignerRole>` +
      `</xades:SignedSignatureProperties>` +
      `</xades:SignedProperties>`;

    const xmlClean = serializer.serializeToString(doc);
    const docClean = new DOMParser().parseFromString(xmlClean, 'text/xml');
    const documentDigest = crypto.createHash('sha256').update(inclusiveC14n(docClean.documentElement)).digest('base64');

    const signedInfoInner =
      `<ds:SignedInfo>` +
      `<ds:CanonicalizationMethod Algorithm="${C14N}"/>` +
      `<ds:SignatureMethod Algorithm="${SIG_RSA_SHA256}"/>` +
      `<ds:Reference Id="${refDocId}" URI="">` +
      `<ds:Transforms>` +
      `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
      `</ds:Transforms>` +
      `<ds:DigestMethod Algorithm="${DIGEST_SHA256}"/>` +
      `<ds:DigestValue>${documentDigest}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference Id="${refKeyInfoId}" URI="#${keyInfoId}">` +
      `<ds:DigestMethod Algorithm="${DIGEST_SHA256}"/>` +
      `<ds:DigestValue>PLACEHOLDER</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropertiesId}">` +
      `<ds:DigestMethod Algorithm="${DIGEST_SHA256}"/>` +
      `<ds:DigestValue>PLACEHOLDER</ds:DigestValue>` +
      `</ds:Reference>` +
      `</ds:SignedInfo>`;

    const fullSignatureShell =
      `<ds:Signature xmlns:ds="${XMLDSIG_NS}" Id="${signatureId}">` +
      signedInfoInner +
      `<ds:SignatureValue Id="${signatureValueId}"></ds:SignatureValue>` +
      `<ds:KeyInfo Id="${keyInfoId}">${keyInfoInner}</ds:KeyInfo>` +
      `<ds:Object>` +
      `<xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${signatureId}">` +
      signedPropsXml +
      `</xades:QualifyingProperties>` +
      `</ds:Object>` +
      `</ds:Signature>`;

    const extContents = getExtensionContents(doc);
    const sigSlot = isAttachedDocument ? 0 : 1;
    const minSlots = isAttachedDocument ? 1 : 2;
    if (!extContents || extContents.length < minSlots) {
      throw new Error(`Se necesitan al menos ${minSlots} ExtensionContent en UBLExtensions`);
    }

    const sigDoc = new DOMParser().parseFromString(fullSignatureShell, 'text/xml');
    const sigNode = doc.importNode(sigDoc.documentElement, true);
    extContents[sigSlot].appendChild(sigNode);

    const keyInfoNode = sigNode.getElementsByTagNameNS(XMLDSIG_NS, 'KeyInfo')[0];
    const signedPropsNode = sigNode.getElementsByTagNameNS(XADES_NS, 'SignedProperties')[0];
    const keyInfoDigest = digestNodeInDoc(keyInfoNode, doc);
    const signedPropsDigest = digestNodeInDoc(signedPropsNode, doc);

    const refs = sigNode.getElementsByTagNameNS(XMLDSIG_NS, 'Reference');
    refs[1].getElementsByTagNameNS(XMLDSIG_NS, 'DigestValue')[0].textContent = keyInfoDigest;
    refs[2].getElementsByTagNameNS(XMLDSIG_NS, 'DigestValue')[0].textContent = signedPropsDigest;

    const signedInfoC14n = getSignedInfoCanon(doc, sigNode);
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signedInfoC14n);
    const signatureValue = signer.sign(privateKeyPem, 'base64');

    const sigValueEl = sigNode.getElementsByTagNameNS(XMLDSIG_NS, 'SignatureValue')[0];
    sigValueEl.textContent = signatureValue;

    const signedXml = serializer.serializeToString(doc);
    console.log('[SIGNER] XML firmado con XAdES-EPES (C14N inclusivo, RSA-SHA256)');
    console.log('[SIGNER] CUFE:', cufe);
    return { signedXml, cufe };

  } catch (error) {
    console.error('[SIGNER] Error al firmar:', error);
    throw new Error(`Error al generar firma digital: ${error.message}`);
  }
}

module.exports = { signXML };
