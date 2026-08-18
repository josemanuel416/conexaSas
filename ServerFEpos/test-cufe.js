// Test de cálculo CUFE para debugging
const crypto = require('crypto');

// Datos extraídos del XML de referencia
const numFac = 'SMSG111456';
const fecFac = '20260104';
const horFac = '140654'; // Hora completa HHmmss
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

// CUFE esperado
const expectedCUFE = '9174da2992e57909ecd61e8629c89af2af124e3963e1b6838c93dd21aaafa717fd037023c14efef62b8f829e6add88c8';

console.log('=== TEST CÁLCULO CUFE ===\n');

// Prueba 1: Con decimales
let cufeString = `${numFac}${fecFac}${horFac}${valFac}${codImp1}${valImp1}${codImp2}${valImp2}${codImp3}${valImp3}${valTot}${nitOFE}${numAdq}${clTec}${tipoAmb}`;
let hash = crypto.createHash('sha384').update(cufeString, 'utf8').digest('hex');

console.log('Prueba 1 - Con decimales:');
console.log('Cadena:', cufeString);
console.log('Hash:  ', hash);
console.log('Espera:', expectedCUFE);
console.log('Match: ', hash === expectedCUFE ? '✅ SÍ' : '❌ NO\n');

// Prueba 2: Sin decimales
const valFac2 = '6570000';
const valImp12 = '000';
const valImp22 = '000';
const valImp32 = '000';
const valTot2 = '6570000';

cufeString = `${numFac}${fecFac}${horFac}${valFac2}${codImp1}${valImp12}${codImp2}${valImp22}${codImp3}${valImp32}${valTot2}${nitOFE}${numAdq}${clTec}${tipoAmb}`;
hash = crypto.createHash('sha384').update(cufeString, 'utf8').digest('hex');

console.log('Prueba 2 - Sin decimales (6 dígitos):');
console.log('Cadena:', cufeString);
console.log('Hash:  ', hash);
console.log('Espera:', expectedCUFE);
console.log('Match: ', hash === expectedCUFE ? '✅ SÍ' : '❌ NO\n');

// Prueba 3: Sin decimales (7 dígitos con ceros a la izquierda)
const valFac3 = '0657000';
const valImp13 = '0000000';
const valImp23 = '0000000';
const valImp33 = '0000000';
const valTot3 = '0657000';

cufeString = `${numFac}${fecFac}${horFac}${valFac3}${codImp1}${valImp13}${codImp2}${valImp23}${codImp3}${valImp33}${valTot3}${nitOFE}${numAdq}${clTec}${tipoAmb}`;
hash = crypto.createHash('sha384').update(cufeString, 'utf8').digest('hex');

console.log('Prueba 3 - Sin decimales (7 dígitos con ceros):');
console.log('Cadena:', cufeString);
console.log('Hash:  ', hash);
console.log('Espera:', expectedCUFE);
console.log('Match: ', hash === expectedCUFE ? '✅ SÍ' : '❌ NO\n');

