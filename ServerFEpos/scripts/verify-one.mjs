import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';

const path = process.argv[2] || 'C:/DevConexa/ServerFEpos/firmados/1786851477697_signed.xml';
const xml = fs.readFileSync(path, 'utf8');
const doc = new DOMParser().parseFromString(xml, 'text/xml');
const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
const cert = sigNode.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'X509Certificate')[0].textContent.replace(/\s/g, '');
const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;

const sig = new SignedXml({ publicCert: pem });
sig.loadSignature(sigNode);
const ok = sig.checkSignature(xml);
console.log('checkSignature:', ok);
console.log('validationErrors:', sig.validationErrors);
