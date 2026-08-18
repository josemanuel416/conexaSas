// validate-cert.js
// Script para validar certificado digital DIAN

require('dotenv').config();
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const CERT_PASS = process.env.CERT_PASS || '';
const certDir = path.join(__dirname, 'cert');

console.log('🔍 Validando Certificado Digital DIAN\n');
console.log('═══════════════════════════════════════════════════════\n');

// Buscar archivos de certificado
const certFiles = fs.readdirSync(certDir).filter(file => 
  file.endsWith('.p12') || file.endsWith('.pfx')
);

if (certFiles.length === 0) {
  console.error('❌ ERROR: No se encontraron certificados (.p12 o .pfx) en la carpeta cert/\n');
  console.log('📁 Archivos encontrados en cert/:');
  fs.readdirSync(certDir).forEach(file => console.log(`   - ${file}`));
  process.exit(1);
}

console.log('📁 Certificados encontrados:');
certFiles.forEach(file => console.log(`   ✓ ${file}`));
console.log('');

// Validar cada certificado
for (const certFile of certFiles) {
  const certPath = path.join(certDir, certFile);
  
  console.log(`\n🔐 Validando: ${certFile}`);
  console.log('─────────────────────────────────────────────────────');
  
  try {
    // Leer certificado
    console.log('📖 Leyendo archivo...');
    const p12Der = fs.readFileSync(certPath);
    console.log(`   ✓ Tamaño: ${(p12Der.length / 1024).toFixed(2)} KB`);
    
    // Intentar parsear
    console.log('\n🔓 Descifrando con contraseña...');
    console.log(`   Contraseña desde .env: ${CERT_PASS ? '****' + CERT_PASS.slice(-2) : '(vacía)'}`);
    
    const p12Asn1 = forge.asn1.fromDer(p12Der.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, CERT_PASS);
    
    console.log('   ✓ Certificado descifrado exitosamente');
    
    // Extraer certificado y clave privada
    console.log('\n📜 Extrayendo contenido...');
    
    let certificate = null;
    let privateKey = null;
    
    for (const safeContents of p12.safeContents) {
      for (const safeBag of safeContents.safeBags) {
        if (safeBag.type === forge.pki.oids.certBag) {
          certificate = safeBag.cert;
          console.log('   ✓ Certificado encontrado');
        }
        if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
          privateKey = safeBag.key;
          console.log('   ✓ Clave privada encontrada');
        }
      }
    }
    
    if (!certificate) {
      console.error('   ❌ No se encontró certificado en el archivo');
      continue;
    }
    
    if (!privateKey) {
      console.error('   ❌ No se encontró clave privada en el archivo');
      continue;
    }
    
    // Información del certificado
    console.log('\n📋 Información del Certificado:');
    console.log('─────────────────────────────────────────────────────');
    
    const subject = certificate.subject.attributes;
    const issuer = certificate.issuer.attributes;
    
    console.log('\n👤 Titular (Subject):');
    subject.forEach(attr => {
      const name = forge.pki.oids[attr.type] || attr.type;
      console.log(`   ${name}: ${attr.value}`);
    });
    
    console.log('\n🏢 Emisor (Issuer):');
    issuer.forEach(attr => {
      const name = forge.pki.oids[attr.type] || attr.type;
      console.log(`   ${name}: ${attr.value}`);
    });
    
    console.log('\n📅 Validez:');
    console.log(`   Válido desde: ${certificate.validity.notBefore.toLocaleString('es-CO')}`);
    console.log(`   Válido hasta: ${certificate.validity.notAfter.toLocaleString('es-CO')}`);
    
    // Verificar si está vigente
    const now = new Date();
    const isValid = now >= certificate.validity.notBefore && now <= certificate.validity.notAfter;
    
    if (isValid) {
      const daysRemaining = Math.floor((certificate.validity.notAfter - now) / (1000 * 60 * 60 * 24));
      console.log(`   Estado: ✅ VIGENTE (${daysRemaining} días restantes)`);
    } else if (now < certificate.validity.notBefore) {
      console.log(`   Estado: ⚠️  AÚN NO VÁLIDO`);
    } else {
      console.log(`   Estado: ❌ EXPIRADO`);
    }
    
    // Información de la clave
    console.log('\n🔑 Información de la Clave Privada:');
    console.log(`   Algoritmo: RSA`);
    console.log(`   Tamaño: ${privateKey.n.bitLength()} bits`);
    
    // Validar que la clave privada corresponda al certificado
    console.log('\n🔐 Validando coincidencia certificado-clave...');
    const publicKey = certificate.publicKey;
    
    if (publicKey.n.equals(privateKey.n) && publicKey.e.equals(privateKey.e)) {
      console.log('   ✓ La clave privada corresponde al certificado');
    } else {
      console.log('   ❌ ERROR: La clave privada NO corresponde al certificado');
    }
    
    // Extensiones
    if (certificate.extensions && certificate.extensions.length > 0) {
      console.log('\n📎 Extensiones:');
      certificate.extensions.forEach(ext => {
        const name = forge.pki.oids[ext.id] || ext.id;
        console.log(`   - ${name}${ext.critical ? ' (crítica)' : ''}`);
      });
    }
    
    // Generar PEM para verificación
    console.log('\n📝 Generando archivos PEM de prueba...');
    const certPem = forge.pki.certificateToPem(certificate);
    const keyPem = forge.pki.privateKeyToPem(privateKey);
    
    fs.writeFileSync(path.join(certDir, `${certFile}_cert.pem`), certPem);
    fs.writeFileSync(path.join(certDir, `${certFile}_key.pem`), keyPem);
    console.log(`   ✓ ${certFile}_cert.pem`);
    console.log(`   ✓ ${certFile}_key.pem`);
    
    console.log('\n✅ VALIDACIÓN EXITOSA');
    console.log('═══════════════════════════════════════════════════════');
    
    // Recomendación
    console.log('\n💡 Recomendación:');
    if (certFile !== 'cert.p12' && certFile !== 'cert.pfx') {
      console.log(`\n   El sistema busca "cert.p12" o "cert.pfx" por defecto.`);
      console.log(`   Renombra "${certFile}" a "cert.p12" o actualiza signer.js\n`);
      
      const newName = certFile.endsWith('.pfx') ? 'cert.p12' : 'cert.p12';
      console.log(`   Comando sugerido:`);
      console.log(`   Rename-Item "cert\\${certFile}" "cert\\${newName}"\n`);
    }
    
    if (!isValid) {
      console.log('\n   ⚠️  El certificado NO está vigente.');
      console.log('   Necesitas renovarlo antes de usarlo en producción.\n');
    }
    
  } catch (error) {
    console.error('\n❌ ERROR al validar certificado:');
    console.error('─────────────────────────────────────────────────────');
    
    if (error.message.includes('PKCS#12 MAC could not be verified')) {
      console.error('   ❌ Contraseña incorrecta');
      console.error(`   Contraseña actual en .env: ${CERT_PASS ? '****' + CERT_PASS.slice(-2) : '(vacía)'}`);
      console.error('\n   Verifica:');
      console.error('   1. Que CERT_PASS en .env tenga la contraseña correcta');
      console.error('   2. Que no haya espacios adicionales');
      console.error('   3. Que uses las mayúsculas/minúsculas correctas\n');
    } else {
      console.error(`   ${error.message}\n`);
      console.error('   Stack trace:');
      console.error(error.stack);
    }
    
    console.log('\n═══════════════════════════════════════════════════════\n');
  }
}
