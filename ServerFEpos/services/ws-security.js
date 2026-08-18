// services/ws-security.js
// WS-Security para DIAN/WCF: RSA-SHA256, SHA256 digest, exc-c14n.
// Basado en la implementación probada de SOAPDIAN (DianWSSecurity).

const crypto = require('crypto');
const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');

const OASIS_BASE = 'http://docs.oasis-open.org/wss/2004/01';
const WSU_NS = `${OASIS_BASE}/oasis-200401-wss-wssecurity-utility-1.0.xsd`;
const WSSE_NS = `${OASIS_BASE}/oasis-200401-wss-wssecurity-secext-1.0.xsd`;
const WS_ADDR = 'http://www.w3.org/2005/08/addressing';
const BASE64_BINARY_TYPE = `${OASIS_BASE}/oasis-200401-wss-soap-message-security-1.0#Base64Binary`;
const X509_V3_VALUE_TYPE = `${OASIS_BASE}/oasis-200401-wss-x509-token-profile-1.0#X509v3`;

const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const DIGEST_SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const SIG_RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const WCF_NS = 'http://wcf.dian.colombia';

function generateSegmentId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function dateStringForSOAP(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`
  );
}

function insertStr(src, dst, pos) {
  return dst.slice(0, pos) + src + dst.slice(pos);
}

function insertSecurityBlock(xml, envelopeKey, secHeader, placement) {
  if (placement === 'last') {
    const close = xml.indexOf(`</${envelopeKey}:Header>`);
    if (close < 0) throw new Error('SOAP Header closing tag not found.');
    return insertStr(secHeader, xml, close);
  }
  const openRe = new RegExp(`<${envelopeKey}:Header\\b[^>]*>`);
  const match = xml.match(openRe);
  if (!match || match.index === undefined) throw new Error('SOAP Header opening tag not found.');
  return insertStr(secHeader, xml, match.index + match[0].length);
}

/**
 * Rewrites the SOAP Body to use wcf: namespace prefix,
 * matching what DIAN/WCF expects (e.g. <wcf:SendBillAsync>).
 */
function fixSoapBody(xml) {
  const wrapperRe =
    /<(?:[\w]+:)?IWcfDianCustomerServices_(\w+)_InputMessage(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w]+:)?IWcfDianCustomerServices_\1_InputMessage>/;
  const match = xml.match(wrapperRe);
  if (!match) return xml;

  const operationName = match[1];
  const innerContent = match[2];
  const fixedChildren = innerContent
    .replace(/<(\w+)>/g, '<wcf:$1>')
    .replace(/<\/(\w+)>/g, '</wcf:$1>');
  const replacement = `<wcf:${operationName} xmlns:wcf="${WCF_NS}">${fixedChildren}</wcf:${operationName}>`;
  return xml.replace(wrapperRe, replacement);
}

/**
 * Extracts PEM private key and certificate from a P12/PFX file.
 */
function parseP12ToPem(certBuffer, password) {
  const p12Asn1 = forge.asn1.fromDer(certBuffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];

  if (!keyBags || !keyBags.length || !certBags || !certBags.length) {
    throw new Error('P12 does not contain private key and certificate.');
  }

  const privateKey = keyBags[0].key;
  if (!privateKey) {
    throw new Error('Unable to extract private key from P12.');
  }

  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
  const probe = crypto.createSign('RSA-SHA256').update('conexa-cert-match').sign(privateKeyPem, 'base64');
  const certificate = certBags.map((b) => b.cert).find((cert) => {
    if (!cert) return false;
    try {
      const pem = forge.pki.certificateToPem(cert);
      return crypto.createVerify('RSA-SHA256').update('conexa-cert-match').verify(pem, probe, 'base64');
    } catch {
      return false;
    }
  });

  if (!certificate) {
    throw new Error('Ningún certificado del P12 corresponde a la clave privada.');
  }

  return {
    privateKeyPem,
    certificatePem: forge.pki.certificateToPem(certificate),
  };
}

/**
 * DianWSSecurity - ISecurity-compatible class for the `soap` library.
 * Implements postProcess to inject WS-Security headers and sign the SOAP envelope.
 */
class DianWSSecurity {
  constructor(privateKeyPem, certificatePem) {
    this.privateKeyPem = privateKeyPem;

    const cert = forge.pki.certificateFromPem(certificatePem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();

    this.publicCertDerBase64 = certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/[\r\n]/g, '');
  }

  addOptions() {}
  addSoapHeaders() {}
  toXML() { return ''; }

  postProcess(xml, envelopeKey) {
    xml = fixSoapBody(xml);

    const created = dateStringForSOAP(new Date());
    const expires = dateStringForSOAP(addMinutes(new Date(), 10));
    const baseId = generateSegmentId();
    const x509Id = `X509-${baseId}`;
    const tsId = `TS-${baseId}`;
    const sigId = `SIG-${baseId}`;
    const kiId = `KI-${baseId}`;
    const strId = `STR-${baseId}`;
    const toId = `ID-${baseId}`;

    xml = xml.replace(
      /<wsa:To(?=[\s>])/,
      `<wsa:To wsu:Id="${toId}" xmlns:wsu="${WSU_NS}"`
    );

    const timestampBlock =
      `<wsu:Timestamp wsu:Id="${tsId}">` +
      `<wsu:Created>${created}</wsu:Created>` +
      `<wsu:Expires>${expires}</wsu:Expires>` +
      `</wsu:Timestamp>`;

    const bstBlock =
      `<wsse:BinarySecurityToken ` +
      `EncodingType="${BASE64_BINARY_TYPE}" ` +
      `ValueType="${X509_V3_VALUE_TYPE}" ` +
      `wsu:Id="${x509Id}">${this.publicCertDerBase64}</wsse:BinarySecurityToken>`;

    const secHeader =
      `<wsse:Security xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}" ${envelopeKey}:mustUnderstand="1">` +
      timestampBlock +
      bstBlock +
      `</wsse:Security>`;

    const xmlWithSec = insertSecurityBlock(xml, envelopeKey, secHeader, 'first');

    const toXpath = `//*[@wsu:Id='${toId}']`;

    const x509IdRef = x509Id;
    const strIdRef = strId;

    const signer = new SignedXml({
      idMode: 'wssecurity',
      signatureAlgorithm: SIG_RSA_SHA256,
      canonicalizationAlgorithm: EXC_C14N,
      inclusiveNamespacesPrefixList: ['wsa', envelopeKey, 'wcf'],
      privateKey: this.privateKeyPem,
      keyInfoAttributes: { Id: kiId },
      getKeyInfoContent: () => {
        return (
          `<wsse:SecurityTokenReference xmlns:wsse="${WSSE_NS}" wsu:Id="${strIdRef}" xmlns:wsu="${WSU_NS}">` +
          `<wsse:Reference URI="#${x509IdRef}" ValueType="${X509_V3_VALUE_TYPE}"/>` +
          `</wsse:SecurityTokenReference>`
        );
      }
    });

    signer.addReference({
      xpath: toXpath,
      transforms: [EXC_C14N],
      digestAlgorithm: DIGEST_SHA256,
      uri: `#${toId}`,
      isEmptyUri: false,
      inclusiveNamespacesPrefixList: [envelopeKey, 'wcf']
    });

    const signerOptions = {
      prefix: 'ds',
      attrs: { Id: sigId },
      existingPrefixes: {
        wsse: WSSE_NS,
        wsu: WSU_NS,
        wsa: WS_ADDR,
        soap: 'http://www.w3.org/2003/05/soap-envelope',
        wcf: WCF_NS
      }
    };

    signer.computeSignature(xmlWithSec, signerOptions);

    const originalXmlWithIds = signer.getOriginalXmlWithIds();
    const signatureXml = signer.getSignatureXml();
    const finalXml = insertStr(signatureXml, originalXmlWithIds, originalXmlWithIds.indexOf('</wsse:Security>'));

    return finalXml;
  }
}

/**
 * Creates a DianWSSecurity instance from a P12/PFX file.
 */
function createDianSecurityFromP12(certPath, password) {
  const fs = require('fs');
  const certBuffer = fs.readFileSync(certPath);
  const { privateKeyPem, certificatePem } = parseP12ToPem(certBuffer, password);
  return new DianWSSecurity(privateKeyPem, certificatePem);
}

module.exports = { DianWSSecurity, createDianSecurityFromP12, parseP12ToPem };
