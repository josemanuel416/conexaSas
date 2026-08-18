import fs from 'fs';
import forge from 'node-forge';
import crypto from 'crypto';
import { DOMParser } from '@xmldom/xmldom';

const xml = fs.readFileSync(process.argv[2], 'utf8');
const certPath = process.argv[3];
const certPass = process.argv[4];

const doc = new DOMParser().parseFromString(xml, 'text/xml');
const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
const xmlCertB64 = sigNode.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'X509Certificate')[0].textContent.replace(/\s/g, '');

const p12Der = fs.readFileSync(certPath);
const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12Der.toString('binary')), false, certPass);
let certificate, privateKey;
for (const sc of p12.safeContents) {
  for (const bag of sc.safeBags) {
    if (bag.type === forge.pki.oids.certBag) certificate = bag.cert;
    if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) privateKey = bag.key;
  }
}

const p12CertDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
const p12CertB64 = forge.util.encode64(p12CertDer);
console.log('cert in xml matches p12:', xmlCertB64 === p12CertB64);

const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
const publicKeyPem = forge.pki.publicKeyToPem(certificate.publicKey);

const test = crypto.createSign('RSA-SHA256').update('hello').sign(privateKeyPem, 'base64');
const v1 = crypto.createVerify('RSA-SHA256').update('hello').verify(publicKeyPem, test, 'base64');
const p12CertPem = forge.pki.certificateToPem(certificate);
const v2 = crypto.createVerify('RSA-SHA256').update('hello').verify(p12CertPem, test, 'base64');
console.log('private key signs, public key from cert verifies:', v1, v2);
