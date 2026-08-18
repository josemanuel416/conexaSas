import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { signXML } = require('../services/signer.js');
const { loadCompanyConfig } = require('../services/company-config.js');

const input = fs.readFileSync('logs/1786851477697_input.xml', 'utf8');
const cfg = loadCompanyConfig('70ad39d6-00f2-406e-b1d7-2720c2630100', {
  claveTecnica: process.env.CLAVE_TECNICA,
  softwarePin: process.env.SOFTWARE_PIN || '12345',
});

const { signedXml, cufe } = await signXML(input, cfg);
const out = `firmados/test-${Date.now()}_signed.xml`;
fs.writeFileSync(out, signedXml);
console.log('CUFE:', cufe);
console.log('Wrote:', out);
