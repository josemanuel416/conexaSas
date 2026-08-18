// Test de cálculo CUFE para debugging
const crypto = require('crypto');

// Datos extraídos del <cbc:Note> del XML de referencia
const cufeStringFromNote = 'SMSG1114562026-01-0414:06:54-05:0065700.00010.00040.00030.0065700.0090034576583000356497693913df092affad3d544dcb66a88651365000ee90f5762044ec5b0d00a6b21';

// CUFE esperado
const expectedCUFE = '9174da2992e57909ecd61e8629c89af2af124e3963e1b6838c93dd21aaafa717fd037023c14efef62b8f829e6add88c8';

console.log('=== TEST CÁLCULO CUFE ===\n');

// Prueba 1: Usando la cadena directamente del cbc:Note
let hash = crypto.createHash('sha384').update(cufeStringFromNote, 'utf8').digest('hex');

console.log('Prueba 1 - Cadena del cbc:Note:');
console.log('Cadena:', cufeStringFromNote);
console.log('Hash:  ', hash);
console.log('Espera:', expectedCUFE);
console.log('Match: ', hash === expectedCUFE ? '✅ SÍ' : '❌ NO\n');

// Prueba 2: Construyendo manualmente con el formato correcto
const numFac = 'SMSG111456';
const fecFac = '2026-01-04'; // CON guiones
const horFac = '14:06:54-05:00'; // CON dos puntos y zona horaria
const valFac = '65700.00'; // CON decimales
const codImp1 = '01';
const valImp1 = '0.00'; // CON decimales
const codImp2 = '04';
const valImp2 = '0.00'; // CON decimales
const codImp3 = '03';
const valImp3 = '0.00'; // CON decimales
const valTot = '65700.00'; // CON decimales
const nitOFE = '900345765';
const numAdq = '830003564';
const clTec = '97693913df092affad3d544dcb66a88651365000ee90f5762044ec5b0d00a6b2';
const tipoAmb = '1';

const cufeString = `${numFac}${fecFac}${horFac}${valFac}${codImp1}${valImp1}${codImp2}${valImp2}${codImp3}${valImp3}${valTot}${nitOFE}${numAdq}${clTec}${tipoAmb}`;
hash = crypto.createHash('sha384').update(cufeString, 'utf8').digest('hex');

console.log('Prueba 2 - Construido manualmente:');
console.log('Cadena:', cufeString);
console.log('Hash:  ', hash);
console.log('Espera:', expectedCUFE);
console.log('Match: ', hash === expectedCUFE ? '✅ SÍ' : '❌ NO\n');

console.log('Comparación de cadenas:');
console.log('Del Note:', cufeStringFromNote);
console.log('Manual:  ', cufeString);
console.log('Iguales: ', cufeStringFromNote === cufeString ? '✅ SÍ' : '❌ NO');
