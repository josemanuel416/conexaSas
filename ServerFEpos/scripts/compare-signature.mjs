import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import crypto from 'crypto';
import { SignedXml } from 'xml-crypto';

const XMLDSIG = 'http://www.w3.org/2000/09/xmldsig#';

function load(p) {
  return fs.readFileSync(p, 'utf8');
}

function sigInfo(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const sig = doc.getElementsByTagNameNS(XMLDSIG, 'Signature')[0];
  if (!sig) return null;
  const si = sig.getElementsByTagNameNS(XMLDSIG, 'SignedInfo')[0];
  const c14n = si?.getElementsByTagNameNS(XMLDSIG, 'CanonicalizationMethod')[0]?.getAttribute('Algorithm');
  const refs = Array.from(sig.getElementsByTagNameNS(XMLDSIG, 'Reference')).map((r) => ({
    id: r.getAttribute('Id'),
    uri: r.getAttribute('URI'),
    type: r.getAttribute('Type'),
    transforms: Array.from(r.getElementsByTagNameNS(XMLDSIG, 'Transform')).map((t) => t.getAttribute('Algorithm')),
    digest: r.getElementsByTagNameNS(XMLDSIG, 'DigestValue')[0]?.textContent,
  }));
  const keyInfo = sig.getElementsByTagNameNS(XMLDSIG, 'KeyInfo')[0];
  return {
    c14n,
    refs,
    keyInfoId: keyInfo?.getAttribute('Id'),
    hasRsa: !!sig.getElementsByTagNameNS(XMLDSIG, 'RSAKeyValue')[0],
    hasDataObj: !!doc.getElementsByTagNameNS('http://uri.etsi.org/01903/v1.3.2#', 'DataObjectFormat')[0],
    signedInfoHasXmlns: si?.getAttribute('xmlns:ds'),
  };
}

function verify(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const sigNode = doc.getElementsByTagNameNS(XMLDSIG, 'Signature')[0];
  if (!sigNode) return { ok: false, reason: 'sin firma' };
  const cert = sigNode.getElementsByTagNameNS(XMLDSIG, 'X509Certificate')[0]?.textContent?.replace(/\s/g, '');
  if (!cert) return { ok: false, reason: 'sin cert' };
  const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
  const sig = new SignedXml({ publicCert: pem });
  sig.loadSignature(sigNode);
  return { ok: sig.checkSignature(xml), refs: sig.references?.length };
}

const files = [
  ['referencia DIAN', 'C:/devcursor/ServerFEpos/validados_dian/referencia.txt'],
  ['NC aprobada abr-2026', 'C:/DevConexa/ServerFEpos/firmados/1775688131215_signed.xml'],
  ['SETP fallida actual', 'C:/DevConexa/ServerFEpos/firmados/1786851477697_signed.xml'],
];

for (const [label, path] of files) {
  console.log('\n===', label, '===');
  if (!fs.existsSync(path)) {
    console.log('NO EXISTE', path);
    continue;
  }
  const xml = load(path);
  console.log(JSON.stringify(sigInfo(xml), null, 2));
  try {
    console.log('verify:', verify(xml));
  } catch (e) {
    console.log('verify error:', e.message);
  }
}
