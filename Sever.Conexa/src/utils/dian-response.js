/**
 * Extrae ApplicationResponse y metadatos de validación desde la respuesta DIAN guardada.
 */

function decodeBase64Xml(value) {
  if (!value) return '';
  return Buffer.from(String(value).replace(/\s/g, ''), 'base64').toString('utf8');
}

function pickTag(xml, tag) {
  const re = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function pickAttr(xml, tag, attr) {
  const re = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function normalizeResponsePayload(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      return json.SendBillSyncResult || json.GetStatusZipResult?.DianResponse || json;
    } catch {
      return null;
    }
  }
  return { rawXml: text };
}

/**
 * @param {string} responseXml JSON DIAN, XML ApplicationResponse o base64
 */
export function parseDianApplicationResponse(responseXml) {
  const payload = normalizeResponsePayload(responseXml);
  if (!payload) {
    throw new Error('Respuesta DIAN vacía o ilegible');
  }

  let applicationResponseXml = payload.rawXml || '';
  if (payload.XmlBase64Bytes) {
    applicationResponseXml = decodeBase64Xml(payload.XmlBase64Bytes);
  }

  if (!applicationResponseXml.includes('ApplicationResponse')) {
    throw new Error('No se encontró ApplicationResponse en la respuesta DIAN');
  }

  const docRefBlock = applicationResponseXml.match(/<cac:DocumentReference[\s\S]*?<\/cac:DocumentReference>/i)?.[0] || '';
  const docResponseBlock = applicationResponseXml.match(/<cac:DocumentResponse[\s\S]*?<\/cac:DocumentResponse>/i)?.[0] || '';
  const invoiceId = pickTag(docRefBlock, 'ID');
  const cufe = pickTag(docRefBlock, 'UUID');
  const responseCode = pickTag(docResponseBlock.match(/<cac:Response[\s\S]*?<\/cac:Response>/i)?.[0] || '', 'ResponseCode') || '02';

  const issueDate = pickTag(applicationResponseXml, 'IssueDate');
  const issueTime = pickTag(applicationResponseXml, 'IssueTime');
  const applicationResponseId = pickTag(
    applicationResponseXml.match(/<ApplicationResponse[\s\S]*?>/i)?.[0] || applicationResponseXml,
    'ID'
  );

  return {
    applicationResponseXml,
    invoiceId,
    cufe,
    responseCode,
    issueDate,
    issueTime,
    applicationResponseId,
    validationDate: issueDate,
    validationTime: issueTime,
    validatorId: 'Unidad Especial Dirección de Impuestos y Aduanas Nacionales',
  };
}

function collectErrorMessages(errorMessages, errors) {
  if (!errorMessages) return;
  const list = Array.isArray(errorMessages) ? errorMessages : [errorMessages];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'string') {
      errors.push({ code: '', message: item });
      continue;
    }
    if (item.string) {
      const strings = Array.isArray(item.string) ? item.string : [item.string];
      for (const s of strings) {
        if (typeof s === 'string') errors.push({ code: '', message: s });
        else if (s?._) errors.push({ code: s.$?.code || s.code || '', message: s._ });
        else if (s) errors.push({ code: '', message: JSON.stringify(s) });
      }
      continue;
    }
    if (item._ || item.message) {
      errors.push({
        code: item.$?.code || item.code || '',
        message: item._ || item.message || JSON.stringify(item),
      });
      continue;
    }
    errors.push({ code: '', message: JSON.stringify(item) });
  }
}

/**
 * Extrae errores de validación DIAN desde JSON/XML guardado en dian_submissions.response_xml.
 */
export function extractDianValidationErrors(responseXml) {
  const errors = [];
  const payload = normalizeResponsePayload(responseXml);
  if (!payload) return errors;

  collectErrorMessages(payload.SendBillSyncResult?.ErrorMessage, errors);
  collectErrorMessages(payload.SendBillAsyncResult?.ErrorMessage, errors);
  collectErrorMessages(payload.GetStatusZipResult?.DianResponse?.ErrorMessage, errors);
  collectErrorMessages(payload.ErrorMessage, errors);

  if (!errors.length && payload.rawXml) {
    const blocks = payload.rawXml.match(/<(?:[a-zA-Z0-9_]+:)?Description[^>]*>([\s\S]*?)<\//gi) || [];
    for (const block of blocks.slice(0, 20)) {
      const msg = block.replace(/<[^>]+>/g, '').trim();
      if (msg) errors.push({ code: '', message: msg });
    }
  }

  return errors;
}

export function formatDianResponseForDisplay(responseXml) {
  if (!responseXml) return '';
  const text = String(responseXml).trim();
  if (!text) return '';
  if (text.startsWith('archivo:')) {
    return `La respuesta completa quedó en archivo del servidor: ${text.slice(8)}`;
  }
  if (text.startsWith('{')) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}
