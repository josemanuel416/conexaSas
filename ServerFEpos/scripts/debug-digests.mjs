import fs from 'fs';
import crypto from 'crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { C14nCanonicalization } from 'xml-crypto/lib/c14n-canonicalization.js';
import { SignedXml } from 'xml-crypto';

const XMLDSIG = 'http://www.w3.org/2000/09/xmldsig#';
const XADES = 'http://uri.etsi.org/01903/v1.3.2#';
const path = process.argv[2];

const xml = fs.readFileSync(path, 'utf8');
const doc = new DOMParser().parseFromString(xml, 'text/xml');
const sig = doc.getElementsByTagNameNS(XMLDSIG, 'Signature')[0];
const c14n = new C14nCanonicalization();

function sha256b64(data) {
  return crypto.createHash('sha256').update(data).digest('base64');
}

function inc(node) {
  return c14n.process(node).toString();
}

const refs = Array.from(sig.getElementsByTagNameNS(XMLDSIG, 'Reference'));
for (const ref of refs) {
  const uri = ref.getAttribute('URI') || '';
  const type = ref.getAttribute('Type') || '';
  const expected = ref.getElementsByTagNameNS(XMLDSIG, 'DigestValue')[0]?.textContent?.trim();
  let computed = null;

  if (uri === '' && !type) {
    const clone = doc.cloneNode(true);
    const sigs = clone.getElementsByTagNameNS(XMLDSIG, 'Signature');
    for (let i = sigs.length - 1; i >= 0; i--) sigs[i].parentNode.removeChild(sigs[i]);
    computed = sha256b64(inc(clone.documentElement));
  } else if (uri === '#KeyInfo') {
    const ki = sig.getElementsByTagNameNS(XMLDSIG, 'KeyInfo')[0];
    computed = sha256b64(inc(ki));
  } else if (type.includes('SignedProperties')) {
    const sp = doc.getElementById(uri.slice(1)) ||
      Array.from(doc.getElementsByTagNameNS(XADES, 'SignedProperties')).find((n) => n.getAttribute('Id') === uri.slice(1));
    computed = sp ? sha256b64(inc(sp)) : 'NOT_FOUND';
  }

  console.log({ uri, type, expected, computed, ok: expected === computed });
}

const cert = sig.getElementsByTagNameNS(XMLDSIG, 'X509Certificate')[0].textContent.replace(/\s/g, '');
const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
const verifier = new SignedXml({ publicCert: pem });
verifier.loadSignature(sig);
console.log('checkSignature:', verifier.checkSignature(xml));
