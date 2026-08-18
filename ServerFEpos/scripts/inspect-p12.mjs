import fs from 'fs';
import forge from 'node-forge';
import crypto from 'crypto';

const certPath = process.argv[2];
const certPass = process.argv[3];
const p12Der = fs.readFileSync(certPath);
const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12Der.toString('binary')), false, certPass);

const certs = [];
let privateKey = null;
for (const sc of p12.safeContents) {
  for (const bag of sc.safeBags) {
    if (bag.type === forge.pki.oids.certBag && bag.cert) {
      certs.push(bag.cert);
    }
    if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) privateKey = bag.key;
  }
}

console.log('Certs in p12:', certs.length);
const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

for (let i = 0; i < certs.length; i++) {
  const c = certs[i];
  const subj = c.subject.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ');
  const pem = forge.pki.certificateToPem(c);
  const test = crypto.createSign('RSA-SHA256').update('probe').sign(privateKeyPem, 'base64');
  const ok = crypto.createVerify('RSA-SHA256').update('probe').verify(pem, test, 'base64');
  console.log(`#${i + 1}`, subj.slice(0, 80), '| matches key:', ok);
}
