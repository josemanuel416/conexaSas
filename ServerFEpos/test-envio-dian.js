// test-envio-dian.js
// Script de prueba completo para verificar el envío SOAP a la DIAN

require("dotenv").config();
const { signXML } = require("./services/signer");
const { createZipFromXml } = require("./services/packager");
const { sendToDian } = require("./services/dian-client");
const fs = require("fs");
const path = require("path");

console.log("🧪 TEST COMPLETO: Envío a DIAN\n");
console.log("=".repeat(70));

// Verificar configuración
console.log("\n📋 CONFIGURACIÓN ACTUAL:");
console.log(`   TEST_MODE: ${process.env.TEST_MODE}`);
console.log(`   SEND_TO_DIAN: ${process.env.SEND_TO_DIAN}`);
console.log(`   DIAN_ENV: ${process.env.DIAN_ENV}`);
console.log(
  `   CERT_PASS: ${process.env.CERT_PASS ? "***configurada***" : "❌ NO CONFIGURADA"}`,
);

// Determinar comportamiento
const TEST_MODE = process.env.TEST_MODE === "true";
const SEND_TO_DIAN = process.env.SEND_TO_DIAN === "true";

console.log("\n🎯 COMPORTAMIENTO ESPERADO:");
if (TEST_MODE) {
  console.log("   ⚠️  Modo de prueba activo - NO se firmará ni enviará");
} else if (!SEND_TO_DIAN) {
  console.log(
    "   ⚠️  Se firmará con certificado real pero NO se enviará a DIAN",
  );
} else {
  console.log("   ✅ Se firmará con certificado real Y se enviará a DIAN");
  console.log(
    `   📡 Endpoint: https://vpfe-${process.env.DIAN_ENV === "produccion" ? "" : "hab."}dian.gov.co`,
  );
}

console.log("\n" + "=".repeat(70));

async function testEnvioDian() {
  try {
    // 1. Leer XML de prueba (usar el último input disponible)
    console.log("\n1️⃣  CARGANDO XML DE PRUEBA...");
    const logsDir = path.join(__dirname, "logs");
    const files = fs
      .readdirSync(logsDir)
      .filter((f) => f.endsWith("_input.xml"))
      .sort()
      .reverse();

    if (files.length === 0) {
      throw new Error("No hay archivos XML de prueba en logs/");
    }

    const xmlPath = path.join(logsDir, files[0]);
    const xmlContent = fs.readFileSync(xmlPath, "utf8");
    console.log(`   ✅ XML cargado: ${files[0]}`);
    console.log(`   📏 Tamaño: ${xmlContent.length} caracteres`);

    // Extraer número de factura para referencia
    const invoiceMatch = xmlContent.match(/<cbc:ID>([^<]+)<\/cbc:ID>/);
    const invoiceNum = invoiceMatch ? invoiceMatch[1] : "DESCONOCIDO";
    console.log(`   📄 Número de factura: ${invoiceNum}`);

    // 2. Firmar XML
    console.log("\n2️⃣  FIRMANDO XML...");
    const signedXml = await signXML(xmlContent);
    console.log("   ✅ XML firmado correctamente");
    console.log(`   📏 Tamaño firmado: ${signedXml.length} caracteres`);

    // Verificar que contiene firma
    const hasSignature = signedXml.includes("<ds:Signature");
    const hasCertificate = signedXml.includes("<ds:X509Certificate>");
    console.log(`   ${hasSignature ? "✅" : "❌"} Contiene nodo Signature`);
    console.log(
      `   ${hasCertificate ? "✅" : "❌"} Contiene certificado X.509`,
    );

    // 3. Empaquetar en ZIP
    console.log("\n3️⃣  EMPAQUETANDO EN ZIP...");
    const timestamp = Date.now();
    const zipBuffer = await createZipFromXml(signedXml, timestamp);
    console.log(`   ✅ ZIP creado correctamente`);
    console.log(`   📏 Tamaño: ${zipBuffer.length} bytes`);

    // 4. Enviar a DIAN
    console.log("\n4️⃣  ENVIANDO A DIAN...");
    console.log("   ⏳ Esperando respuesta...");

    const startTime = Date.now();
    const response = await sendToDian(zipBuffer);
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`   ✅ Respuesta recibida en ${duration}ms`);

    // 5. Analizar respuesta
    console.log("\n5️⃣  ANÁLISIS DE RESPUESTA:");
    console.log(`   📊 Código: ${response.statusCode}`);
    console.log(`   📝 Mensaje: ${response.statusMessage}`);
    console.log(`   ✔️  Válido: ${response.isValid || "N/A"}`);

    // Guardar respuesta
    const responsePath = path.join(
      __dirname,
      "logs",
      `${timestamp}_test_response.xml`,
    );
    fs.writeFileSync(
      responsePath,
      typeof response.rawResponse === "string"
        ? response.rawResponse
        : JSON.stringify(response.rawResponse, null, 2),
    );
    console.log(
      `   💾 Respuesta guardada en: logs/${timestamp}_test_response.xml`,
    );

    // Mostrar respuesta completa si es simulación
    if (
      typeof response.rawResponse === "string" &&
      response.rawResponse.includes("TestResponse")
    ) {
      console.log("\n   ⚠️  NOTA: Esta es una respuesta simulada");
      console.log("   Para enviar a DIAN real, asegúrate de que:");
      console.log("     - TEST_MODE=false");
      console.log("     - SEND_TO_DIAN=true");
    } else if (response.statusCode === "00") {
      console.log("\n   🎉 ¡ÉXITO! La factura fue aceptada por la DIAN");
    } else {
      console.log("\n   ⚠️  La DIAN rechazó la factura o hubo un error");
    }

    // 6. Resumen final
    console.log("\n" + "=".repeat(70));
    console.log("✅ PRUEBA COMPLETADA\n");
    console.log("📋 Resumen:");
    console.log(`   • Factura: ${invoiceNum}`);
    console.log(`   • Código respuesta: ${response.statusCode}`);
    console.log(`   • Tiempo de respuesta: ${duration}ms`);
    console.log(`   • Archivo de respuesta: ${timestamp}_test_response.xml`);
    console.log("");
  } catch (error) {
    console.error("\n❌ ERROR EN LA PRUEBA:", error.message);
    console.error("\n📋 Detalles completos:");
    console.error(error);

    console.log("\n💡 Posibles causas:");
    console.log("   - Error de red al conectar con DIAN");
    console.log("   - Certificado inválido o expirado");
    console.log("   - Error en la firma del XML");
    console.log("   - Formato de factura incorrecto");
    console.log("   - Credenciales WS-Security incorrectas");
    console.log("");

    process.exit(1);
  }
}

// Ejecutar prueba
testEnvioDian();
