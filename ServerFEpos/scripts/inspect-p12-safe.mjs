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
    if (bag.type === forge.pki.oids.certBag && bag.cert) certs.push(bag.cert);
    if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) privateKey = bag.key;
  }
}

if (!privateKey) {
  console.log(JSON.stringify({ ok: false, error: 'sin clave privada' }));
  process.exit(1);
}

const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
const probe = crypto.createSign('RSA-SHA256').update('conexa-cert-match').sign(privateKeyPem, 'base64');
const entries = certs.map((cert, i) => {
  const cn = cert.subject.getField('CN')?.value || '(sin CN)';
  const pem = forge.pki.certificateToPem(cert);
  const matchesKey = crypto.createVerify('RSA-SHA256').update('conexa-cert-match').verify(pem, probe, 'base64');
  return { index: i + 1, cn, matchesKey };
});

console.log(JSON.stringify({
  ok: true,
  file: certPath,
  bytes: p12Der.length,
  signingCert: entries.find((e) => e.matchesKey)?.cn || null,
  certs: entries,
}, null, 2));
