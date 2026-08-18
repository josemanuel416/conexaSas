// Test de cálculo SoftwareSecurityCode
const crypto = require('crypto');

const softwareId = '6b098f86-bf57-4451-9514-5c93ef5e9f51';
const claveTecnica = '97693913df092affad3d544dcb66a88651365000ee90f5762044ec5b0d00a6b2';
const prefix = 'SMSG';
const consecutive = '111456';

const expectedSSC = '8932cc0e239d0f3a4dbce8b157831adde829f8b41de02e1b3508c69a42697a9e7c3a9190e433f58cd722a94c91d9b423';

console.log('=== TEST CÁLCULO SoftwareSecurityCode ===\n');

// Orden confirmado: SoftwareID + LlaveTécnica + Prefijo + Consecutivo
const sscString = `${softwareId}${claveTecnica}${prefix}${consecutive}`;
const hash = crypto.createHash('sha384').update(sscString, 'utf8').digest('hex');

console.log('Orden: SoftwareID + LlaveTécnica + Prefijo + Consecutivo');
console.log('');
console.log('Componentes:');
console.log('  SoftwareID:    ', softwareId);
console.log('  LlaveTécnica:  ', claveTecnica);
console.log('  Prefijo:       ', prefix);
console.log('  Consecutivo:   ', consecutive);
console.log('');
console.log('Cadena completa:');
console.log(sscString);
console.log('');
console.log('Hash SHA-384:');
console.log('  Calculado:', hash);
console.log('  Esperado: ', expectedSSC);
console.log('');
console.log('Resultado:', hash === expectedSSC ? '✅ COINCIDE' : '❌ NO COINCIDE');

