import fs from 'fs';

const xml = fs.readFileSync('logs/1786851477697_input.xml', 'utf8');
const companyId = '70ad39d6-00f2-406e-b1d7-2720c2630100';
const technicalKey = process.env.CLAVE_TECNICA || 'b58ba2c85e49f826865a61829326ac3b99734956f275dd72a1b6b354c7b6230c';
const softwarePin = process.env.SOFTWARE_PIN || '12345';

const res = await fetch('http://localhost:3010/factura', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/xml',
    Accept: 'application/json',
    'X-Company-Id': companyId,
    'X-Dian-Technical-Key': technicalKey,
    'X-Dian-Software-Pin': softwarePin,
    'X-Dian-Software-Id': process.env.SOFTWARE_ID || '17eb7be2-0443-42d7-95fe-18296d155d87',
    'X-Dian-Environment': 'habilitacion',
  },
  body: xml,
  signal: AbortSignal.timeout(180000),
});

const body = await res.json();
console.log('HTTP', res.status);
console.log(JSON.stringify(body, null, 2));
