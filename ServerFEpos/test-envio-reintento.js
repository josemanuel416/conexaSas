// test-envio-reintento.js
// Script para probar envío a DIAN con reintentos automáticos

require('dotenv').config();
const { signXML } = require('./services/signer');
const { createZipFromXml } = require('./services/packager');
const { sendToDian } = require('./services/dian-client');
const fs = require('fs');
const path = require('path');

const REINTENTOS_MAX = 3; // Número máximo de reintentos
const ESPERA_ENTRE_REINTENTOS = 30000; // 30 segundos entre reintentos

console.log('🧪 TEST CON REINTENTOS: Envío a DIAN\n');
console.log('=' .repeat(70));

// Función para esperar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testEnvioConReintento() {
  // Verificar configuración
  console.log('\n📋 CONFIGURACIÓN:');
  console.log(`   TEST_MODE: ${process.env.TEST_MODE}`);
  console.log(`   SEND_TO_DIAN: ${process.env.SEND_TO_DIAN}`);
  console.log(`   DIAN_ENV: ${process.env.DIAN_ENV}`);
  console.log(`   Reintentos máximos: ${REINTENTOS_MAX}`);
  console.log(`   Espera entre reintentos: ${ESPERA_ENTRE_REINTENTOS / 1000}s`);

  const TEST_MODE = process.env.TEST_MODE === 'true';
  const SEND_TO_DIAN = process.env.SEND_TO_DIAN === 'true';

  if (TEST_MODE || !SEND_TO_DIAN) {
    console.log('\n⚠️  ADVERTENCIA: No se enviará a DIAN real');
    console.log('   Para enviar realmente, configura:');
    console.log('   TEST_MODE=false');
    console.log('   SEND_TO_DIAN=true');
    return;
  }

  console.log('\n' + '=' .repeat(70));

  try {
    // 1. Cargar XML de prueba
    console.log('\n1️⃣  CARGANDO XML DE PRUEBA...');
    const logsDir = path.join(__dirname, 'logs');
    const files = fs.readdirSync(logsDir)
      .filter(f => f.endsWith('_input.xml'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      throw new Error('No hay archivos XML de prueba en logs/');
    }
    
    const xmlPath = path.join(logsDir, files[0]);
    const xmlContent = fs.readFileSync(xmlPath, 'utf8');
    
    const invoiceMatch = xmlContent.match(/<cbc:ID>([^<]+)<\/cbc:ID>/);
    const invoiceNum = invoiceMatch ? invoiceMatch[1] : 'DESCONOCIDO';
    
    console.log(`   ✅ XML cargado: ${files[0]}`);
    console.log(`   📄 Factura: ${invoiceNum}`);
    
    // 2. Firmar XML
    console.log('\n2️⃣  FIRMANDO XML...');
    const signedXml = await signXML(xmlContent);
    console.log('   ✅ XML firmado');
    
    // 3. Empaquetar en ZIP
    console.log('\n3️⃣  EMPAQUETANDO ZIP...');
    const timestamp = Date.now();
    const zipBuffer = await createZipFromXml(signedXml, timestamp);
    console.log('   ✅ ZIP creado');
    
    // 4. Intentar envío con reintentos
    console.log('\n4️⃣  ENVIANDO A DIAN CON REINTENTOS...');
    console.log('   ' + '─'.repeat(60));
    
    let intento = 1;
    let exito = false;
    let ultimoError = null;
    let respuesta = null;
    
    while (intento <= REINTENTOS_MAX && !exito) {
      try {
        console.log(`\n   🔄 Intento ${intento}/${REINTENTOS_MAX}`);
        console.log(`   ⏰ ${new Date().toLocaleString()}`);
        console.log('   ⏳ Enviando...');
        
        const startTime = Date.now();
        respuesta = await sendToDian(zipBuffer);
        const duration = Date.now() - startTime;
        
        console.log(`   ✅ Respuesta recibida en ${duration}ms`);
        console.log(`   📊 Código: ${respuesta.statusCode}`);
        console.log(`   📝 Mensaje: ${respuesta.statusMessage}`);
        
        // Verificar si fue exitoso
        if (respuesta.statusCode === '00' || respuesta.statusCode === '000') {
          exito = true;
          console.log('\n   🎉 ¡ÉXITO! Factura aceptada por la DIAN');
        } else {
          ultimoError = `Código ${respuesta.statusCode}: ${respuesta.statusMessage}`;
          console.log(`   ⚠️  Respuesta no exitosa: ${ultimoError}`);
        }
        
      } catch (error) {
        ultimoError = error.message;
        console.log(`   ❌ Error: ${error.message}`);
        
        // Identificar si es un error de timeout/red
        const esErrorReinentable = 
          error.message.includes('Timeout') ||
          error.message.includes('504') ||
          error.message.includes('503') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ECONNREFUSED');
        
        if (esErrorReinentable && intento < REINTENTOS_MAX) {
          const esperaSegundos = ESPERA_ENTRE_REINTENTOS / 1000;
          console.log(`   ⏱️  Esperando ${esperaSegundos}s antes del siguiente intento...`);
          await sleep(ESPERA_ENTRE_REINTENTOS);
        }
      }
      
      intento++;
    }
    
    // 5. Guardar respuesta
    if (respuesta) {
      const responsePath = path.join(__dirname, 'logs', `${timestamp}_response_retry.xml`);
      fs.writeFileSync(responsePath, 
        typeof respuesta.rawResponse === 'string' 
          ? respuesta.rawResponse 
          : JSON.stringify(respuesta.rawResponse, null, 2)
      );
      console.log(`\n   💾 Respuesta guardada: ${timestamp}_response_retry.xml`);
    }
    
    // 6. Resumen final
    console.log('\n' + '=' .repeat(70));
    
    if (exito) {
      console.log('✅ PRUEBA EXITOSA\n');
      console.log('📋 Resumen:');
      console.log(`   • Factura: ${invoiceNum}`);
      console.log(`   • Intentos necesarios: ${intento - 1}`);
      console.log(`   • Código respuesta: ${respuesta.statusCode}`);
      console.log(`   • Estado: ACEPTADA POR LA DIAN`);
    } else {
      console.log('❌ PRUEBA NO EXITOSA\n');
      console.log('📋 Resumen:');
      console.log(`   • Factura: ${invoiceNum}`);
      console.log(`   • Intentos realizados: ${intento - 1}`);
      console.log(`   • Último error: ${ultimoError}`);
      console.log('\n💡 Recomendaciones:');
      console.log('   • Verifica que el servidor de la DIAN esté disponible');
      console.log('   • Intenta en otro horario (menor tráfico)');
      console.log('   • Contacta soporte DIAN si el problema persiste');
      console.log('   • Revisa logs detallados para más información');
    }
    
    console.log('');
    
  } catch (error) {
    console.error('\n❌ ERROR CRÍTICO:', error.message);
    console.error('\n📋 Detalles:');
    console.error(error);
    process.exit(1);
  }
}

// Ejecutar prueba
testEnvioConReintento();
