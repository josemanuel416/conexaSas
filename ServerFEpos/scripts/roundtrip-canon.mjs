import fs from 'fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';

const xml = fs.readFileSync(process.argv[2], 'utf8');
const doc1 = new DOMParser().parseFromString(xml, 'text/xml');
const serialized = new XMLSerializer().serializeToString(doc1);
const doc2 = new DOMParser().parseFromString(serialized, 'text/xml');

function canon(doc) {
  const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  const cert = sigNode.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'X509Certificate')[0].textContent.replace(/\s/g, '');
  const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
  const sig = new SignedXml({ publicCert: pem });
  sig.loadSignature(sigNode);
  return sig.getCanonSignedInfoXml(doc);
}

const c1 = canon(doc1);
const c2 = canon(doc2);
console.log('same after roundtrip:', c1 === c2);
console.log('len1', c1.length, 'len2', c2.length);
if (c1 !== c2) {
  for (let i = 0; i < Math.max(c1.length, c2.length); i++) {
    if (c1[i] !== c2[i]) {
      console.log('diff at', i, JSON.stringify(c1.slice(i, i + 40)), JSON.stringify(c2.slice(i, i + 40)));
      break;
    }
  }
}
