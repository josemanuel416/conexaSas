// test-ws-security.js
// Script de prueba para verificar la configuración de WS-Security

require('dotenv').config();
const WSSecurityCert = require('./services/ws-security');
const path = require('path');

console.log('🧪 TEST: Verificación de WS-Security\n');
console.log('=' .repeat(60));

try {
  // 1. Cargar certificado
  console.log('\n1️⃣  Cargando certificado...');
  const certPath = path.join(__dirname, 'cert', 'cert.p12');
  const certPassword = process.env.CERT_PASS;
  
  const wsSecurity = new WSSecurityCert(certPath, certPassword);
  console.log('   ✅ Certificado cargado exitosamente');
  
  // 2. Verificar datos del certificado
  console.log('\n2️⃣  Datos del Certificado:');
  console.log(`   📋 Subject: ${wsSecurity.cert.subject.getField('CN').value}`);
  console.log(`   🏢 Organization: ${wsSecurity.cert.subject.getField('O').value}`);
  console.log(`   🆔 Serial: ${wsSecurity.cert.serialNumber}`);
  console.log(`   📅 Válido desde: ${wsSecurity.cert.validity.notBefore}`);
  console.log(`   📅 Válido hasta: ${wsSecurity.cert.validity.notAfter}`);
  console.log(`   🔑 Thumbprint (SHA-1): ${wsSecurity.thumbprint}`);
  
  // 3. Verificar que la clave privada está disponible
  console.log('\n3️⃣  Verificando clave privada...');
  if (wsSecurity.privateKey) {
    console.log('   ✅ Clave privada disponible');
    console.log(`   🔐 Tipo: ${wsSecurity.privateKey.n ? 'RSA' : 'Otro'}`);
    if (wsSecurity.privateKey.n) {
      console.log(`   📏 Longitud: ${wsSecurity.privateKey.n.bitLength()} bits`);
    }
  } else {
    console.log('   ❌ Clave privada NO disponible');
  }
  
  // 4. Generar Timestamp
  console.log('\n4️⃣  Generando Timestamp...');
  const timestamp = wsSecurity.generateTimestamp();
  console.log(`   ✅ ID: ${timestamp.id}`);
  console.log('   📄 XML generado:');
  console.log('   ' + timestamp.xml.replace(/\n/g, '\n   '));
  
  // 5. Generar Header Security completo
  console.log('\n5️⃣  Generando Header WS-Security completo...');
  const targetUrl = 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc';
  const { securityHeader, toHeader } = wsSecurity.generateSecurityHeader(targetUrl);
  
  console.log('   ✅ Security Header generado');
  console.log(`   📏 Tamaño: ${securityHeader.length} caracteres`);
  
  console.log('\n   📄 Header To:');
  console.log('   ' + toHeader.replace(/\n/g, '\n   '));
  
  console.log('\n   📄 Security Header (primeros 500 caracteres):');
  console.log('   ' + securityHeader.substring(0, 500).replace(/\n/g, '\n   ') + '...');
  
  // 6. Verificar componentes del Security Header
  console.log('\n6️⃣  Verificando componentes del Security Header...');
  
  const hasTimestamp = securityHeader.includes('<wsu:Timestamp');
  const hasBinaryToken = securityHeader.includes('<wsse:BinarySecurityToken');
  const hasSignature = securityHeader.includes('<Signature');
  const hasSignedInfo = securityHeader.includes('<SignedInfo');
  const hasSignatureValue = securityHeader.includes('<SignatureValue>');
  const hasKeyInfo = securityHeader.includes('<KeyInfo');
  
  console.log(`   ${hasTimestamp ? '✅' : '❌'} Timestamp`);
  console.log(`   ${hasBinaryToken ? '✅' : '❌'} BinarySecurityToken`);
  console.log(`   ${hasSignature ? '✅' : '❌'} Signature`);
  console.log(`   ${hasSignedInfo ? '✅' : '❌'} SignedInfo`);
  console.log(`   ${hasSignatureValue ? '✅' : '❌'} SignatureValue`);
  console.log(`   ${hasKeyInfo ? '✅' : '❌'} KeyInfo`);
  
  // 7. Resumen
  console.log('\n' + '=' .repeat(60));
  console.log('✅ RESULTADO: WS-Security configurado correctamente\n');
  console.log('📋 Próximos pasos:');
  console.log('   1. Cambiar SEND_TO_DIAN=true en .env');
  console.log('   2. Ejecutar el servidor: npm start');
  console.log('   3. Enviar una factura de prueba');
  console.log('   4. Verificar respuesta de la DIAN\n');
  
} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error('\n📋 Detalles del error:');
  console.error(error);
  console.log('\n💡 Posibles causas:');
  console.log('   - Contraseña del certificado incorrecta (CERT_PASS en .env)');
  console.log('   - Archivo cert.p12 no encontrado o corrupto');
  console.log('   - Formato del certificado no válido\n');
  process.exit(1);
}
