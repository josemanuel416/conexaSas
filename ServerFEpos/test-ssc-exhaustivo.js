// Test exhaustivo de SSC para encontrar la combinación correcta
require('dotenv').config();
const crypto = require('crypto');

const softwareId = process.env.SOFTWARE_ID;
const llaveTecnica = process.env.CLAVE_TECNICA;
const prefix = 'SMSG';
const consecutive = '111456';
const invoiceNumber = 'SMSG111456';

const expectedSSC = '8932cc0e239d0f3a4dbce8b157831adde829f8b41de02e1b3508c69a42697a9e7c3a9190e433f58cd722a94c91d9b423';

console.log('=== BÚSQUEDA DEL SSC CORRECTO ===\n');
console.log('SSC Esperado:', expectedSSC);
console.log('');

const tests = [
  {
    name: 'SoftwareID + LlaveTécnica + Prefijo + Consecutivo',
    value: `${softwareId}${llaveTecnica}${prefix}${consecutive}`
  },
  {
    name: 'SoftwareID + Prefijo + Consecutivo + LlaveTécnica',
    value: `${softwareId}${prefix}${consecutive}${llaveTecnica}`
  },
  {
    name: 'SoftwareID + InvoiceNumber + LlaveTécnica',
    value: `${softwareId}${invoiceNumber}${llaveTecnica}`
  },
  {
    name: 'SoftwareID + LlaveTécnica + InvoiceNumber',
    value: `${softwareId}${llaveTecnica}${invoiceNumber}`
  },
  {
    name: 'LlaveTécnica + SoftwareID + Prefijo + Consecutivo',
    value: `${llaveTecnica}${softwareId}${prefix}${consecutive}`
  },
  {
    name: 'Prefijo + Consecutivo + SoftwareID + LlaveTécnica',
    value: `${prefix}${consecutive}${softwareId}${llaveTecnica}`
  },
  {
    name: 'InvoiceNumber + SoftwareID + LlaveTécnica',
    value: `${invoiceNumber}${softwareId}${llaveTecnica}`
  },
  {
    name: 'InvoiceNumber + LlaveTécnica + SoftwareID',
    value: `${invoiceNumber}${llaveTecnica}${softwareId}`
  }
];

console.log('Probando diferentes combinaciones:\n');

let found = false;
for (let i = 0; i < tests.length; i++) {
  const test = tests[i];
  const hash = crypto.createHash('sha384').update(test.value, 'utf8').digest('hex');
  const match = hash === expectedSSC;
  
  console.log(`${i + 1}. ${test.name}`);
  console.log(`   Hash: ${hash.substring(0, 40)}...`);
  console.log(`   ${match ? '✅ COINCIDE' : '❌ No coincide'}`);
  console.log('');
  
  if (match) {
    found = true;
    console.log('🎉 FÓRMULA CORRECTA ENCONTRADA:');
    console.log('   ' + test.name);
    console.log('');
    console.log('Cadena completa:');
    console.log(test.value);
    console.log('');
  }
}

if (!found) {
  console.log('⚠️  Ninguna combinación coincide.');
  console.log('');
  console.log('Posibles razones:');
  console.log('1. El SSC esperado usa parámetros diferentes (otro consecutivo)');
  console.log('2. Hay un formato adicional no considerado');
  console.log('3. El SSC esperado fue generado en el registro inicial del software');
}
