// Test completo de CUFE y SSC con valores correctos
require('dotenv').config();
const crypto = require('crypto');

console.log('=== TEST COMPLETO - CUFE Y SSC ===\n');

// Verificar variables de entorno
console.log('1. Variables de entorno:');
console.log('   SOFTWARE_ID:', process.env.SOFTWARE_ID);
console.log('   CLAVE_TECNICA:', process.env.CLAVE_TECNICA);
console.log('');

// ============================================================
// TEST 1: CUFE
// ============================================================
console.log('2. TEST CUFE:');
console.log('   Fórmula: SHA-384(NumFac + FecFac + HorFac + ValFac + CodImp1 + ValImp1 + CodImp2 + ValImp2 + CodImp3 + ValImp3 + ValTot + NitOFE + NumAdq + ClTec + TipoAmbiente)');
console.log('');

const numFac = 'SMSG111456';
const fecFac = '2026-01-04';
const horFac = '14:06:54-05:00';
const valFac = '65700.00';
const codImp1 = '01';
const valImp1 = '0.00';
const codImp2 = '04';
const valImp2 = '0.00';
const codImp3 = '03';
const valImp3 = '0.00';
const valTot = '65700.00';
const nitOFE = '900345765';
const numAdq = '830003564';
const clTec = process.env.CLAVE_TECNICA;
const tipoAmb = '1';

const cufeString = `${numFac}${fecFac}${horFac}${valFac}${codImp1}${valImp1}${codImp2}${valImp2}${codImp3}${valImp3}${valTot}${nitOFE}${numAdq}${clTec}${tipoAmb}`;
const cufeHash = crypto.createHash('sha384').update(cufeString, 'utf8').digest('hex');

const expectedCUFE = '9174da2992e57909ecd61e8629c89af2af124e3963e1b6838c93dd21aaafa717fd037023c14efef62b8f829e6add88c8';

console.log('   Componentes:');
console.log('   - NumFac:', numFac);
console.log('   - FecFac:', fecFac);
console.log('   - HorFac:', horFac);
console.log('   - ValFac:', valFac);
console.log('   - CodImp1:', codImp1, 'ValImp1:', valImp1);
console.log('   - CodImp2:', codImp2, 'ValImp2:', valImp2);
console.log('   - CodImp3:', codImp3, 'ValImp3:', valImp3);
console.log('   - ValTot:', valTot);
console.log('   - NitOFE:', nitOFE);
console.log('   - NumAdq:', numAdq);
console.log('   - ClTec:', clTec.substring(0, 15) + '...');
console.log('   - TipoAmb:', tipoAmb);
console.log('');
console.log('   Cadena completa (primeros 100 chars):');
console.log('   ' + cufeString.substring(0, 100) + '...');
console.log('');
console.log('   Hash calculado:');
console.log('   ' + cufeHash);
console.log('   Hash esperado:');
console.log('   ' + expectedCUFE);
console.log('');
console.log('   Resultado:', cufeHash === expectedCUFE ? '✅ COINCIDE' : '❌ NO COINCIDE');
console.log('');

// ============================================================
// TEST 2: SoftwareSecurityCode
// ============================================================
console.log('3. TEST SoftwareSecurityCode:');
console.log('   Fórmula: SHA-384(SoftwareID + LlaveTécnica + Prefijo + Consecutivo)');
console.log('');

const softwareId = process.env.SOFTWARE_ID;
const llaveTecnica = process.env.CLAVE_TECNICA;
const prefix = 'SMSG';
const consecutive = '111456';

const sscString = `${softwareId}${llaveTecnica}${prefix}${consecutive}`;
const sscHash = crypto.createHash('sha384').update(sscString, 'utf8').digest('hex');

const expectedSSC = '8932cc0e239d0f3a4dbce8b157831adde829f8b41de02e1b3508c69a42697a9e7c3a9190e433f58cd722a94c91d9b423';

console.log('   Componentes:');
console.log('   - SoftwareID:', softwareId);
console.log('   - LlaveTécnica:', llaveTecnica.substring(0, 15) + '...');
console.log('   - Prefijo:', prefix);
console.log('   - Consecutivo:', consecutive);
console.log('');
console.log('   Cadena completa (primeros 100 chars):');
console.log('   ' + sscString.substring(0, 100) + '...');
console.log('');
console.log('   Hash calculado:');
console.log('   ' + sscHash);
console.log('   Hash esperado:');
console.log('   ' + expectedSSC);
console.log('');
console.log('   Resultado:', sscHash === expectedSSC ? '✅ COINCIDE' : '❌ NO COINCIDE');
console.log('');

// ============================================================
// RESUMEN
// ============================================================
console.log('='.repeat(60));
console.log('RESUMEN:');
console.log('  CUFE:', cufeHash === expectedCUFE ? '✅ CORRECTO' : '❌ INCORRECTO');
console.log('  SSC: ', sscHash === expectedSSC ? '✅ CORRECTO' : '❌ INCORRECTO');
console.log('='.repeat(60));

if (cufeHash === expectedCUFE && sscHash === expectedSSC) {
  console.log('\n🎉 TODOS LOS TESTS PASARON - Sistema listo para usar');
} else {
  console.log('\n⚠️  HAY ERRORES - Revisar configuración');
  if (cufeHash !== expectedCUFE) {
    console.log('   - CUFE no coincide');
  }
  if (sscHash !== expectedSSC) {
    console.log('   - SSC no coincide (puede ser normal si los parámetros de registro fueron diferentes)');
  }
}
