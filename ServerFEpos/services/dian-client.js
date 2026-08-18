// services/dian-client.js
require('dotenv').config();
const soap = require('soap');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { createDianSecurityFromP12 } = require('./ws-security');
const { loadLegacyConfig, cacheKeyForConfig } = require('./company-config');

function resolveDianUrls(dianEnv) {
  const env = dianEnv || process.env.DIAN_ENV || 'habilitacion';
  const isProduction = env === 'produccion';
  const soapUrl =
    isProduction
      ? process.env.DIAN_SOAP_URL_PROD || 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc?wsdl'
      : process.env.DIAN_SOAP_URL_HAB || 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc?wsdl';
  const endpoint =
    isProduction
      ? 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc'
      : 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc';
  return { env, soapUrl, endpoint };
}

const REQUEST_TIMEOUT_MS = parseInt(process.env.DIAN_REQUEST_TIMEOUT_MS || '120000', 10);

let cachedClient = null;
let cachedClientKey = null;

async function getOrCreateClient(companyConfig = null) {
  const cfg = companyConfig || loadLegacyConfig();
  const { soapUrl, endpoint } = resolveDianUrls(cfg.dianEnv);
  const cacheKey = `${soapUrl}|${endpoint}|${cacheKeyForConfig(cfg)}`;
  if (cachedClient && cachedClientKey === cacheKey) {
    console.log('[DIAN] Reutilizando cliente SOAP cacheado');
    return { client: cachedClient, endpoint, dianEnv: cfg.dianEnv };
  }

  console.log('[DIAN] Descargando WSDL (puede tardar 10-30s)...');
  const wsdlStart = Date.now();
  const client = await soap.createClientAsync(soapUrl, {
    forceSoap12Headers: true,
    namespaceArrayElements: false,
    wsdl_options: { timeout: REQUEST_TIMEOUT_MS },
  });
  console.log(`[DIAN] WSDL cargado en ${Date.now() - wsdlStart}ms`);

  client.setEndpoint(endpoint);

  const security = createDianSecurityFromP12(cfg.certPath, cfg.certPass);
  client.setSecurity(security);

  cachedClient = client;
  cachedClientKey = cacheKey;
  console.log(`[DIAN] Cliente SOAP creado (${cfg.source || 'legacy'}, compañía ${cfg.companyId || 'global'})`);
  return { client, endpoint, dianEnv: cfg.dianEnv };
}

function addWsaHeaders(client, operationName, endpoint) {
  const action = `http://wcf.dian.colombia/IWcfDianCustomerServices/${operationName}`;
  client.clearSoapHeaders();
  client.addSoapHeader(
    {
      Action: action,
      To: endpoint,
      MessageID: `urn:uuid:${crypto.randomUUID()}`,
      ReplyTo: { Address: 'http://www.w3.org/2005/08/addressing/anonymous' },
    },
    '', 'wsa', 'http://www.w3.org/2005/08/addressing'
  );
}

async function callWithTimeout(promise) {
  const timeout = new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(`Timeout: la DIAN no respondio en ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]);
}

function isStatusZipPending(result) {
  if (!result) return false;
  if (result.statusCode === '00' || result.isValid === true) return false;
  const msg = String(result.statusMessage || '').toLowerCase();
  if (msg.includes('proceso de valid') || msg.includes('en cola') || msg.includes('en proceso')) {
    return true;
  }
  return !result.statusCode && !result.errorMessages;
}

function isStatusZipFinal(result) {
  if (!result) return false;
  if (result.statusCode === '00' || result.isValid === true) return true;
  if (isStatusZipPending(result)) return false;
  if (result.errorMessages) return true;
  return Boolean(result.statusCode && result.statusCode !== '999');
}

async function pollStatusZipUntilFinal(zipKey, companyConfig, options = {}) {
  const maxAttempts = options.maxAttempts ?? 24;
  const intervalMs = options.intervalMs ?? 5000;
  const initialDelayMs = options.initialDelayMs ?? 5000;

  if (initialDelayMs > 0) {
    await new Promise((r) => setTimeout(r, initialDelayMs));
  }

  let lastResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastResult = await getStatusZip(zipKey, companyConfig);
    if (isStatusZipFinal(lastResult)) {
      return lastResult;
    }
    if (attempt < maxAttempts) {
      console.log(`[DIAN] ZipKey ${zipKey} en proceso (${attempt}/${maxAttempts}), reintento en ${intervalMs}ms...`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return { ...lastResult, pending: true };
}

async function sendTestSetToDian(zipBuffer, companyConfig, { zipFileName, testSetId }) {
  const { client, endpoint } = await getOrCreateClient(companyConfig);
  addWsaHeaders(client, 'SendTestSetAsync', endpoint);

  const encodedZip = zipBuffer.toString('base64');
  const fileName = zipFileName || `SETP_${Date.now()}.zip`;

  console.log(`[DIAN] SendTestSetAsync testSetId=${testSetId} file=${fileName}`);
  const startTime = Date.now();
  const result = await callWithTimeout(
    client.SendTestSetAsyncAsync({
      fileName,
      contentFile: encodedZip,
      testSetId,
    })
  );

  console.log(`[DIAN] SendTestSetAsync respondió en ${Date.now() - startTime}ms`);
  const rawResponse = result[0];
  console.log('[DIAN] Respuesta:', JSON.stringify(rawResponse, null, 2).substring(0, 1500));

  const testSetResult = rawResponse?.SendTestSetAsyncResult;
  const zipKey = testSetResult?.ZipKey || testSetResult?.zipKey || null;

  if (zipKey) {
    console.log(`[DIAN] Set de pruebas en cola. ZipKey: ${zipKey}`);
    const statusResult = await pollStatusZipUntilFinal(zipKey, companyConfig);
    return { ...statusResult, sendMethod: 'SendTestSetAsync', zipKey };
  }

  const statusCode = testSetResult?.StatusCode || '999';
  const statusMessage = testSetResult?.StatusDescription
    || testSetResult?.StatusMessage
    || 'Sin descripcion en SendTestSetAsync';
  const isValid = testSetResult?.IsValid === 'true' || testSetResult?.IsValid === true;

  return {
    rawResponse,
    statusCode,
    statusMessage,
    isValid,
    errorMessages: testSetResult?.ErrorMessage || null,
    sendMethod: 'SendTestSetAsync',
    zipKey,
  };
}

async function sendToDian(zipBuffer, companyConfig = null, sendOptions = {}) {
  const TEST_MODE = process.env.TEST_MODE === 'true';
  const SEND_TO_DIAN = process.env.SEND_TO_DIAN === 'true';
  const cfg = companyConfig || loadLegacyConfig();
  const { env: dianEnvLabel } = resolveDianUrls(cfg.dianEnv);
  const testSetId = sendOptions.testSetId || cfg.testSetId || '';
  const zipFileName = sendOptions.zipFileName || null;

  if (TEST_MODE || !SEND_TO_DIAN) {
    const mensaje = TEST_MODE
      ? 'MODO DE PRUEBA - Simulando respuesta de DIAN'
      : 'SEND_TO_DIAN=false - Simulando respuesta de DIAN (certificado usado para firma)';
    console.log(`[DIAN] ${mensaje}`);
    return {
      rawResponse: `<?xml version="1.0"?><TestResponse><CodigoMensaje>00</CodigoMensaje><DescripcionMensaje>${mensaje}</DescripcionMensaje></TestResponse>`,
      statusCode: '00',
      statusMessage: `${mensaje} - No enviado a DIAN real`,
    };
  }

  console.log(`[DIAN] Enviando a DIAN (${dianEnvLabel})`);
  const { client, endpoint } = await getOrCreateClient(cfg);

  if (cfg.dianEnv === 'habilitacion' && testSetId) {
    try {
      return await sendTestSetToDian(zipBuffer, cfg, { zipFileName, testSetId });
    } catch (err) {
      cachedClient = null;
      cachedClientKey = null;
      throw formatDianError(err);
    }
  }

  if (cfg.dianEnv === 'habilitacion' && !testSetId) {
    console.warn('[DIAN] Habilitación sin TestSetId: el gráfico DIAN no contará el documento. Use SendTestSetAsync.');
  }

  if (cfg.dianEnv === 'pruebas') {
    console.log('[DIAN] Ambiente pruebas: envío con SendBillSync (sin set de habilitación).');
  }

  const useSync = process.env.DIAN_SEND_MODE !== 'async';
  const operationName = useSync ? 'SendBillSync' : 'SendBillAsync';
  addWsaHeaders(client, operationName, endpoint);

  const encodedZip = zipBuffer.toString('base64');

  try {
    console.log(`[DIAN] Enviando peticion SOAP (${operationName})...`);
    const startTime = Date.now();

    const operationFn = useSync ? 'SendBillSyncAsync' : 'SendBillAsyncAsync';
    const result = await callWithTimeout(
      client[operationFn]({
        fileName: zipFileName || `invoice_${Date.now()}.zip`,
        contentFile: encodedZip,
      })
    );

    const duration = Date.now() - startTime;
    console.log(`[DIAN] Respuesta recibida en ${duration}ms`);

    const rawResponse = result[0];
    console.log('[DIAN] Respuesta:', JSON.stringify(rawResponse, null, 2).substring(0, 1500));

    // SendBillSync devuelve SendBillSyncResult, SendBillAsync devuelve SendBillAsyncResult
    const syncResult = rawResponse?.SendBillSyncResult;
    const asyncResult = rawResponse?.SendBillAsyncResult;
    const dianResult = syncResult || asyncResult;

    if (!dianResult) {
      return { rawResponse, statusCode: '999', statusMessage: 'Respuesta vacia de la DIAN', isValid: false };
    }

    // SendBillAsync puede devolver ZipKey (procesamiento diferido)
    if (asyncResult?.ZipKey && !asyncResult?.StatusCode) {
      const zipKey = asyncResult.ZipKey;
      console.log(`[DIAN] Procesamiento asincrono. ZipKey: ${zipKey}`);
      console.log('[DIAN] Consultando estado con GetStatusZip...');
      await new Promise(r => setTimeout(r, 5000));
      const statusResult = await getStatusZip(zipKey);
      return statusResult;
    }

    const statusCode = dianResult.StatusCode || '999';
    const statusMessage = dianResult.StatusDescription || dianResult.StatusMessage || 'Sin descripcion';
    const isValid = dianResult.IsValid === 'true' || dianResult.IsValid === true;
    const errorMessages = dianResult.ErrorMessage || null;

    if (errorMessages) {
      console.log('[DIAN] Errores de validacion:', JSON.stringify(errorMessages, null, 2));
    }

    return { rawResponse, statusCode, statusMessage, isValid, errorMessages };
  } catch (err) {
    cachedClient = null;
    cachedClientKey = null;
    throw formatDianError(err);
  }
}

async function getStatusZip(zipKey, companyConfig = null) {
  const { client, endpoint } = await getOrCreateClient(companyConfig);
  addWsaHeaders(client, 'GetStatusZip', endpoint);

  try {
    console.log(`[DIAN] GetStatusZip(${zipKey})...`);
    const result = await callWithTimeout(
      client.GetStatusZipAsync({ trackId: zipKey })
    );

    const rawResponse = result[0];
    console.log('[DIAN] GetStatusZip respuesta:', JSON.stringify(rawResponse, null, 2).substring(0, 1500));

    const dianResponse = rawResponse?.GetStatusZipResult?.DianResponse;

    if (dianResponse) {
      const statusCode = dianResponse.StatusCode || '999';
      const statusMessage = dianResponse.StatusDescription || '';
      const isValid = dianResponse.IsValid === 'true' || dianResponse.IsValid === true;
      const errorMessages = dianResponse.ErrorMessage;

      if (errorMessages) {
        console.log('[DIAN] Errores de validacion:', JSON.stringify(errorMessages, null, 2));
      }

      return {
        rawResponse,
        statusCode,
        statusMessage,
        isValid,
        errorMessages: errorMessages || null,
        zipKey,
      };
    }

    return {
      rawResponse,
      statusCode: '999',
      statusMessage: 'No se pudo interpretar la respuesta de GetStatusZip',
      isValid: false,
      zipKey,
    };
  } catch (err) {
    console.error('[DIAN] Error en GetStatusZip:', err.message);
    return {
      rawResponse: err.message,
      statusCode: '999',
      statusMessage: `Error consultando estado: ${err.message}`,
      isValid: false,
      zipKey,
    };
  }
}

function formatDianError(err) {
  console.error('[DIAN] Error SOAP:', err.message);
  let errorType = 'Error desconocido';
  let errorMsg = err.message || 'Error desconocido';
  let errorDetail = '';

  if (err.response) {
    const sc = err.response.status || err.response.statusCode;
    if (sc === 504 || sc === 503) { errorType = 'Timeout o Servicio No Disponible'; errorDetail = 'La DIAN no respondio.'; }
    else if (sc === 500) { errorType = 'Error Interno del Servidor'; errorDetail = 'La DIAN retorno error 500.'; }
    else if (sc === 401 || sc === 403) { errorType = 'Error de Autenticacion'; errorDetail = 'Credenciales WS-Security rechazadas.'; }
    else errorDetail = `HTTP ${sc}`;
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    errorType = 'Timeout de Conexion';
  } else if (err.code === 'ECONNREFUSED') {
    errorType = 'Conexion Rechazada';
  } else if (err.root?.Envelope?.Body?.Fault) {
    const fault = err.root.Envelope.Body.Fault;
    errorType = `SOAP Fault: ${fault?.Code?.Subcode?.Value || ''}`;
    errorDetail = fault?.Reason?.Text?.['_'] || fault?.Reason?.Text || '';
  }

  return new Error(`${errorType}: ${errorMsg}${errorDetail ? '\n' + errorDetail : ''}`);
}

async function getAcquirer({ identificationType, identificationNumber }, companyConfig = null) {
  const { client, endpoint } = await getOrCreateClient(companyConfig);
  addWsaHeaders(client, 'GetAcquirer', endpoint);

  const docType = String(identificationType || '').trim();
  const docNumber = String(identificationNumber || '').replace(/\D/g, '').trim();
  if (!docType || !docNumber) {
    throw new Error('identificationType e identificationNumber son requeridos');
  }

  try {
    console.log(`[DIAN] GetAcquirer type=${docType} number=${docNumber}`);
    const result = await callWithTimeout(
      client.GetAcquirerAsync({
        identificationType: docType,
        identificationNumber: docNumber,
      })
    );

    const rawResponse = result[0];
    console.log('[DIAN] GetAcquirer respuesta:', JSON.stringify(rawResponse, null, 2).substring(0, 1500));

    const acquirer = rawResponse?.GetAcquirerResult || {};
    const receiverName = String(acquirer.ReceiverName || '').trim();
    const receiverEmail = String(acquirer.ReceiverEmail || '').trim();
    const statusCode = String(acquirer.StatusCode || '').trim();
    const message = String(acquirer.Message || '').trim();
    const found = Boolean(receiverName) || statusCode === '00';

    return {
      rawResponse,
      found,
      statusCode,
      message,
      receiverName,
      receiverEmail,
    };
  } catch (err) {
    cachedClient = null;
    cachedClientKey = null;
    throw formatDianError(err);
  }
}

module.exports = {
  sendToDian,
  getStatusZip,
  getAcquirer,
  pollStatusZipUntilFinal,
  isStatusZipPending,
  isStatusZipFinal,
};
