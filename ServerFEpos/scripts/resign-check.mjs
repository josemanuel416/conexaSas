import fs from 'fs';
import forge from 'node-forge';
import crypto from 'crypto';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';

const xmlPath = process.argv[2];
const certPath = process.argv[3];
const certPass = process.argv[4];
const xml = fs.readFileSync(xmlPath, 'utf8');
const doc = new DOMParser().parseFromString(xml, 'text/xml');
const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
const sigValInXml = sigNode.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'SignatureValue')[0].textContent.replace(/\s/g, '');

const cert = sigNode.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'X509Certificate')[0].textContent.replace(/\s/g, '');
const pemCert = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;

const helper = new SignedXml({ publicCert: pemCert });
helper.loadSignature(sigNode);
const canon = helper.getCanonSignedInfoXml(doc);

const p12Der = fs.readFileSync(certPath);
const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12Der.toString('binary')), false, certPass);
let privateKey;
for (const sc of p12.safeContents) {
  for (const bag of sc.safeBags) {
    if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) privateKey = bag.key;
  }
}
const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
const recomputed = crypto.createSign('RSA-SHA256').update(canon).sign(privateKeyPem, 'base64');

console.log('canon len:', canon.length);
console.log('sig in xml  :', sigValInXml.slice(0, 40) + '...');
console.log('recomputed  :', recomputed.slice(0, 40) + '...');
console.log('match:', sigValInXml === recomputed);

const v = crypto.createVerify('RSA-SHA256');
v.update(canon);
console.log('verify recomputed with cert in xml:', v.verify(pemCert, recomputed, 'base64'));
v.update(canon);
console.log('verify xml sig with cert in xml:', v.verify(pemCert, sigValInXml, 'base64'));
