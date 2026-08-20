// server.js
require('dotenv').config();
process.env.TZ = process.env.TZ || 'America/Bogota';
const express = require('express');
const fs = require('fs');
const path = require('path');
const { signXML } = require('./services/signer');
const { createZipFromXml, buildDianFileName } = require('./services/packager');
const { sendToDian, getStatusZip, getAcquirer } = require('./services/dian-client');
const { loadCompanyConfig } = require('./services/company-config');

// Handlers para errores no capturados — salir en errores fatales de arranque
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Error no capturado:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`[FATAL] Puerto ${process.env.PORT || 3010} en uso. Cierre la otra instancia de ServerFEpos.`);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Promesa rechazada no manejada:', reason);
});

const app = express();
const PORT = process.env.PORT || 3010;

// Servir archivos estáticos (página de prueba)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ServerFEpos',
    port: PORT,
    uptimeSec: Math.floor(process.uptime()),
    pid: process.pid,
  });
});

// Middleware para recibir XML crudo
app.use('/factura', express.text({ type: 'application/xml' }));
app.use('/firmar', express.text({ type: 'application/xml' }));

app.post('/factura', async (req, res) => {
  console.log('[SERVER] POST /factura');
  const xmlInput = req.body;

  if (!xmlInput || typeof xmlInput !== 'string') {
    console.log('[SERVER] XML invalido o faltante');
    return res.status(400).json({ error: 'XML inválido o faltante' });
  }

  const companyId = req.get('X-Company-Id') || req.query.companyId || null;
  const technicalKey = req.get('X-Dian-Technical-Key') || req.query.technicalKey || '';
  const softwarePin = req.get('X-Dian-Software-Pin') || req.query.softwarePin || '';
  const softwareId = req.get('X-Dian-Software-Id') || req.query.softwareId || '';
  const dianEnv = req.get('X-Dian-Environment') || req.query.dianEnvironment || '';
  const testSetId = req.get('X-Dian-Test-Set-Id') || req.query.testSetId || '';
  const companyConfig = loadCompanyConfig(companyId, {
    claveTecnica: technicalKey,
    softwarePin,
    softwareId,
    dianEnv,
    testSetId,
  });
  console.log('[SERVER] Compañía:', companyConfig.companyId || 'legacy', '| cert:', companyConfig.certPath, '| ambiente:', companyConfig.dianEnv, '| testSet:', companyConfig.testSetId || '—');

  try {
    console.log('[SERVER] XML recibido, longitud:', xmlInput.length);
    const timestamp = Date.now();
    const xmlPath = path.join(__dirname, 'logs', `${timestamp}_input.xml`);
    fs.writeFileSync(xmlPath, xmlInput, 'utf8');
    console.log('[SERVER] XML guardado en:', xmlPath);

    const t0 = Date.now();
    console.log('[SERVER] Paso 1/4: Firmando XML...');
    const { signedXml, cufe } = await signXML(xmlInput, companyConfig);
    console.log(`[SERVER] Paso 1/4: Firma completada (${Date.now() - t0}ms)`);
    const signedPath = path.join(__dirname, 'logs', `${timestamp}_signed.xml`);
    fs.writeFileSync(signedPath, signedXml, 'utf8');

    const firmadosDir = path.join(__dirname, 'firmados');
    if (fs.existsSync(firmadosDir)) {
      fs.writeFileSync(path.join(firmadosDir, `${timestamp}_signed.xml`), signedXml, 'utf8');
    }

    const zipFileName = buildDianFileName(signedXml) || `${timestamp}_factura.xml`;

    console.log('[SERVER] Paso 2/4: Creando ZIP...');
    const zipBuffer = await createZipFromXml(signedXml, timestamp);
    console.log(`[SERVER] Paso 2/4: ZIP creado (${Date.now() - t0}ms)`);

    console.log('[SERVER] Paso 3/4: Enviando a DIAN (puede tardar 30-60s la primera vez)...');
    const dianResponse = await sendToDian(zipBuffer, companyConfig, {
      zipFileName,
      testSetId: companyConfig.testSetId || testSetId,
    });
    console.log(`[SERVER] Paso 4/4: Respuesta DIAN recibida (${Date.now() - t0}ms total)`);

    const responsePath = path.join(__dirname, 'logs', `${timestamp}_response.xml`);
    const rawStr = typeof dianResponse.rawResponse === 'string'
      ? dianResponse.rawResponse
      : JSON.stringify(dianResponse.rawResponse, null, 2);
    fs.writeFileSync(responsePath, rawStr, 'utf8');

    const isApproved = dianResponse.statusCode === '00';
    const isPending = Boolean(dianResponse.pending) || (
      dianResponse.statusCode !== '00' && String(dianResponse.statusMessage || '').toLowerCase().includes('proceso')
    );

    const responsePayload = {
      aprobada: isApproved,
      pendiente: isPending,
      codigo: dianResponse.statusCode,
      mensaje: dianResponse.statusMessage,
      archivo_respuesta: `${timestamp}_response.xml`,
      archivo_firmado: `${timestamp}_signed.xml`,
      zipFileName,
      cufe: cufe || null,
      signedXml,
      responseXml: rawStr,
    };
    if (dianResponse.zipKey) responsePayload.zipKey = dianResponse.zipKey;
    if (dianResponse.errorMessages) responsePayload.errores = dianResponse.errorMessages;

    res.json(responsePayload);

  } catch (err) {
    console.error('[SERVER] Error en procesamiento:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.json());

app.get('/adquiriente', async (req, res) => {
  const documentType = req.query.documentType || req.query.identificationType || '';
  const documentNumber = req.query.documentNumber || req.query.identificationNumber || '';
  if (!documentType || !documentNumber) {
    return res.status(400).json({ error: 'documentType y documentNumber son requeridos' });
  }

  const companyId = req.get('X-Company-Id') || req.query.companyId || null;
  const softwarePin = req.get('X-Dian-Software-Pin') || req.query.softwarePin || '';
  const softwareId = req.get('X-Dian-Software-Id') || req.query.softwareId || '';
  const dianEnv = req.get('X-Dian-Environment') || req.query.dianEnvironment || '';
  const testSetId = req.get('X-Dian-Test-Set-Id') || req.query.testSetId || '';
  const companyConfig = loadCompanyConfig(companyId, {
    softwarePin,
    softwareId,
    dianEnv,
    testSetId,
  });

  console.log(`[SERVER] GET /adquiriente type=${documentType} number=${documentNumber}`);
  try {
    const result = await getAcquirer(
      { identificationType: documentType, identificationNumber: documentNumber },
      companyConfig,
    );
    res.json({
      encontrado: result.found,
      codigo: result.statusCode,
      mensaje: result.message,
      nombre: result.receiverName,
      email: result.receiverEmail,
    });
  } catch (err) {
    console.error('[SERVER] Error consultando adquiriente:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/estado/:zipKey', async (req, res) => {
  const { zipKey } = req.params;
  const companyId = req.get('X-Company-Id') || req.query.companyId || null;
  const technicalKey = req.get('X-Dian-Technical-Key') || req.query.technicalKey || '';
  const softwarePin = req.get('X-Dian-Software-Pin') || req.query.softwarePin || '';
  const softwareId = req.get('X-Dian-Software-Id') || req.query.softwareId || '';
  const dianEnv = req.get('X-Dian-Environment') || req.query.dianEnvironment || '';
  const companyConfig = loadCompanyConfig(companyId, {
    claveTecnica: technicalKey,
    softwarePin,
    softwareId,
    dianEnv,
  });
  console.log(`[SERVER] GET /estado/${zipKey}`);
  try {
    const result = await getStatusZip(zipKey, companyConfig);
    const responsePath = path.join(__dirname, 'logs', `status_${zipKey}.json`);
    fs.writeFileSync(responsePath, JSON.stringify(result, null, 2), 'utf8');
    res.json({
      aprobada: result.statusCode === '00',
      codigo: result.statusCode,
      mensaje: result.statusMessage,
      errores: result.errorMessages || null,
      zipKey,
    });
  } catch (err) {
    console.error('[SERVER] Error consultando estado:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/firmar', async (req, res) => {
  console.log('[SERVER] POST /firmar');
  const xmlInput = req.body;
  if (!xmlInput || typeof xmlInput !== 'string') {
    return res.status(400).json({ error: 'XML inválido o faltante' });
  }

  const companyId = req.get('X-Company-Id') || req.query.companyId || null;
  const softwareId = req.get('X-Dian-Software-Id') || req.query.softwareId || '';
  const dianEnv = req.get('X-Dian-Environment') || req.query.dianEnvironment || '';
  const documentType = req.get('X-Document-Type') || req.query.documentType || '';
  const companyConfig = loadCompanyConfig(companyId, { softwareId, dianEnv, documentType });
  console.log('[SERVER] Firma compañía:', companyConfig.companyId || 'legacy', '| ambiente:', companyConfig.dianEnv);

  try {
    const timestamp = Date.now();
    const { signedXml } = await signXML(xmlInput, companyConfig);
    const signedPath = path.join(__dirname, 'logs', `${timestamp}_signed.xml`);
    fs.writeFileSync(signedPath, signedXml, 'utf8');
    res.json({
      firmado: true,
      archivo_firmado: `${timestamp}_signed.xml`,
      signedXml,
    });
  } catch (err) {
    console.error('[SERVER] Error firmando:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const REQUEST_TIMEOUT_MS = parseInt(process.env.SERVER_REQUEST_TIMEOUT_MS || '300000', 10);

const server = app.listen(PORT, () => {
  console.log(`[SERVER] ServerFEpos escuchando en puerto ${PORT} (pid ${process.pid})`);
  console.log(`[SERVER] Health: http://localhost:${PORT}/health`);
});

server.timeout = REQUEST_TIMEOUT_MS;
server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = REQUEST_TIMEOUT_MS + 10000;
server.keepAliveTimeout = 120000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[FATAL] Puerto ${PORT} ya está en uso. Solo debe haber una instancia de ServerFEpos.`);
    process.exit(1);
  }
  console.error('[FATAL] Error al iniciar servidor:', err.message);
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SERVER] ${signal} recibido, cerrando conexiones...`);
  server.close(() => {
    console.log('[SERVER] Puerto liberado');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[SERVER] Cierre forzado tras espera');
    process.exit(1);
  }, 15000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));