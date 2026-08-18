import fs from 'fs';
import crypto from 'crypto';
import { DOMParser } from '@xmldom/xmldom';
import { C14nCanonicalization } from 'xml-crypto/lib/c14n-canonicalization.js';
import { findAncestorNs } from 'xml-crypto/lib/utils.js';
import { SignedXml } from 'xml-crypto';

const XMLDSIG = 'http://www.w3.org/2000/09/xmldsig#';
const path = process.argv[2];
const xml = fs.readFileSync(path, 'utf8');
const doc = new DOMParser().parseFromString(xml, 'text/xml');
const sig = doc.getElementsByTagNameNS(XMLDSIG, 'Signature')[0];
const si = sig.getElementsByTagNameNS(XMLDSIG, 'SignedInfo')[0];
const c14n = new C14nCanonicalization();
const ancestorNamespaces = findAncestorNs(doc, "//*[local-name()='SignedInfo']");
const siBytes = c14n.process(si, { ancestorNamespaces }).toString();
const sigVal = sig.getElementsByTagNameNS(XMLDSIG, 'SignatureValue')[0].textContent.replace(/\s/g, '');
const cert = sig.getElementsByTagNameNS(XMLDSIG, 'X509Certificate')[0].textContent.replace(/\s/g, '');
const pem = `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;

const v = crypto.createVerify('RSA-SHA256');
v.update(siBytes);
const manual = v.verify(pem, sigVal, 'base64');
console.log('manual RSA verify:', manual);
console.log('SignedInfo c14n length:', siBytes.length);
console.log('SignedInfo c14n first 200:', siBytes.slice(0, 200));

const verifier = new SignedXml({ publicCert: pem });
verifier.loadSignature(sig);
console.log('xml-crypto checkSignature:', verifier.checkSignature(xml));
