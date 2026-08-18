import { config } from '../config.js';

const FEPOS_FETCH_RETRIES = 2;
const FEPOS_RETRY_DELAY_MS = 2000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFePos(url, options, { retries = FEPOS_FETCH_RETRIES } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(FEPOS_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

/** Verifica que ServerFEpos esté arriba antes de firmar/enviar. */
export async function pingFePos(fePosUrl = config.fePosUrl) {
  if (!fePosUrl) {
    return { ok: false, error: 'FEPOS_URL no configurada en la API' };
  }

  const url = `${fePosUrl.replace(/\/$/, '')}/health`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const payload = await response.json().catch(() => ({}));
    return { ok: true, payload };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'sin respuesta',
      hint: 'Inicie ServerFEpos: cd ServerFEpos && npm run serve',
    };
  }
}

/**
 * Envía XML UBL a ServerFEpos para firma y envío DIAN.
 * @param {{ companyId: string, technicalKey: string, xml: string, fePosUrl?: string }} params
 */
export async function sendInvoiceToFePos({
  companyId,
  technicalKey,
  softwarePin,
  softwareId,
  dianEnvironment,
  testSetId,
  xml,
  fePosUrl = config.fePosUrl,
}) {
  if (!fePosUrl) {
    throw Object.assign(new Error('FEPOS_URL no configurada en la API'), { status: 503 });
  }

  const url = `${fePosUrl.replace(/\/$/, '')}/factura`;
  const headers = {
    'Content-Type': 'application/xml',
    Accept: 'application/json',
  };
  if (companyId) headers['X-Company-Id'] = String(companyId);
  if (technicalKey) headers['X-Dian-Technical-Key'] = String(technicalKey);
  if (softwarePin) headers['X-Dian-Software-Pin'] = String(softwarePin);
  if (softwareId) headers['X-Dian-Software-Id'] = String(softwareId);
  if (dianEnvironment) headers['X-Dian-Environment'] = String(dianEnvironment);
  if (testSetId) headers['X-Dian-Test-Set-Id'] = String(testSetId);

  let response;
  try {
    response = await fetchFePos(url, {
      method: 'POST',
      headers,
      body: xml,
      signal: AbortSignal.timeout(180000),
    });
  } catch (err) {
    throw Object.assign(
      new Error(`No se pudo conectar con ServerFEpos: ${err.message}. Verifique que esté en ejecución (${fePosUrl}).`),
      { status: 502, cause: err }
    );
  }

  let payload;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    const text = await response.text();
    payload = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(payload.error || payload.mensaje || `ServerFEpos respondió HTTP ${response.status}`),
      { status: response.status >= 500 ? 502 : 400, fePosPayload: payload }
    );
  }

  return payload;
}

/** Firma XML con ServerFEpos sin enviar a DIAN. */
export async function signXmlWithFePos({
  companyId,
  softwareId,
  dianEnvironment,
  xml,
  documentType,
  fePosUrl = config.fePosUrl,
}) {
  if (!fePosUrl) {
    throw Object.assign(new Error('FEPOS_URL no configurada en la API'), { status: 503 });
  }

  const url = `${fePosUrl.replace(/\/$/, '')}/firmar`;
  const headers = {
    'Content-Type': 'application/xml',
    Accept: 'application/json',
  };
  if (companyId) headers['X-Company-Id'] = String(companyId);
  if (softwareId) headers['X-Dian-Software-Id'] = String(softwareId);
  if (dianEnvironment) headers['X-Dian-Environment'] = String(dianEnvironment);
  if (documentType) headers['X-Document-Type'] = String(documentType);

  let response;
  try {
    response = await fetchFePos(url, {
      method: 'POST',
      headers,
      body: xml,
      signal: AbortSignal.timeout(120000),
    });
  } catch (err) {
    throw Object.assign(
      new Error(`No se pudo conectar con ServerFEpos: ${err.message}. Verifique que esté en ejecución (${fePosUrl}).`),
      { status: 502, cause: err }
    );
  }

  const payload = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) {
    throw Object.assign(
      new Error(payload.error || payload.mensaje || `ServerFEpos respondió HTTP ${response.status}`),
      { status: response.status >= 500 ? 502 : 400, fePosPayload: payload }
    );
  }
  return payload;
}

/** Consulta estado de un ZipKey en ServerFEpos (GetStatusZip vía DIAN). */
export async function getFePosZipStatus({
  zipKey,
  companyId,
  technicalKey,
  softwarePin,
  softwareId,
  dianEnvironment,
  fePosUrl = config.fePosUrl,
}) {
  if (!fePosUrl) {
    throw Object.assign(new Error('FEPOS_URL no configurada en la API'), { status: 503 });
  }
  if (!zipKey) {
    throw Object.assign(new Error('ZipKey no disponible para consultar estado'), { status: 400 });
  }

  const url = `${fePosUrl.replace(/\/$/, '')}/estado/${encodeURIComponent(zipKey)}`;
  const headers = { Accept: 'application/json' };
  if (companyId) headers['X-Company-Id'] = String(companyId);
  if (technicalKey) headers['X-Dian-Technical-Key'] = String(technicalKey);
  if (softwarePin) headers['X-Dian-Software-Pin'] = String(softwarePin);
  if (softwareId) headers['X-Dian-Software-Id'] = String(softwareId);
  if (dianEnvironment) headers['X-Dian-Environment'] = String(dianEnvironment);

  let response;
  try {
    response = await fetchFePos(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(120000),
    });
  } catch (err) {
    throw Object.assign(
      new Error(`No se pudo conectar con ServerFEpos: ${err.message}. Verifique que esté en ejecución (${fePosUrl}).`),
      { status: 502, cause: err }
    );
  }

  const payload = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) {
    throw Object.assign(
      new Error(payload.error || payload.mensaje || `ServerFEpos respondió HTTP ${response.status}`),
      { status: response.status >= 500 ? 502 : 400, fePosPayload: payload }
    );
  }
  return payload;
}

/** Consulta adquiriente en DIAN vía GetAcquirer (ServerFEpos). */
export async function lookupAcquirerFePos({
  companyId,
  documentType,
  documentNumber,
  softwarePin,
  softwareId,
  dianEnvironment,
  testSetId,
  fePosUrl = config.fePosUrl,
}) {
  if (!fePosUrl) {
    throw Object.assign(new Error('FEPOS_URL no configurada en la API'), { status: 503 });
  }

  const params = new URLSearchParams({
    documentType: String(documentType),
    documentNumber: String(documentNumber),
  });
  const url = `${fePosUrl.replace(/\/$/, '')}/adquiriente?${params.toString()}`;
  const headers = { Accept: 'application/json' };
  if (companyId) headers['X-Company-Id'] = String(companyId);
  if (softwarePin) headers['X-Dian-Software-Pin'] = String(softwarePin);
  if (softwareId) headers['X-Dian-Software-Id'] = String(softwareId);
  if (dianEnvironment) headers['X-Dian-Environment'] = String(dianEnvironment);
  if (testSetId) headers['X-Dian-Test-Set-Id'] = String(testSetId);

  let response;
  try {
    response = await fetchFePos(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(120000),
    });
  } catch (err) {
    throw Object.assign(
      new Error(`No se pudo conectar con ServerFEpos: ${err.message}. Verifique que esté en ejecución (${fePosUrl}).`),
      { status: 502, cause: err },
    );
  }

  const payload = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) {
    throw Object.assign(
      new Error(payload.error || payload.mensaje || `ServerFEpos respondió HTTP ${response.status}`),
      { status: response.status >= 500 ? 502 : 400, fePosPayload: payload },
    );
  }

  return {
    found: Boolean(payload.encontrado),
    statusCode: payload.codigo || '',
    message: payload.mensaje || '',
    receiverName: payload.nombre || '',
    receiverEmail: payload.email || '',
  };
}
