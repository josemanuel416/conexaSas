/** Catálogo DIAN ConceptoNotaCredito + TipoOperacionNC (homologación UBL). */

export const DIAN_NC_CUSTOMIZATION_ID = '20';
export const DIAN_NC_DOCUMENT_TYPE_CODE = '91';
export const DIAN_NC_OPERATION_TYPE = '20';

export const DIAN_CREDIT_NOTE_CONCEPTS = [
  {
    code: '1',
    name: 'Devolución parcial de bienes y/o no aceptación parcial del servicio',
    description: 'Acreditación parcial por devolución o rechazo parcial.',
    scope: 'parcial',
    dianCustomizationId: DIAN_NC_CUSTOMIZATION_ID,
    dianDocumentTypeCode: DIAN_NC_DOCUMENT_TYPE_CODE,
    dianOperationType: DIAN_NC_OPERATION_TYPE,
  },
  {
    code: '2',
    name: 'Anulación de factura electrónica',
    description: 'Anulación total de la factura de venta referenciada.',
    scope: 'total',
    dianCustomizationId: DIAN_NC_CUSTOMIZATION_ID,
    dianDocumentTypeCode: DIAN_NC_DOCUMENT_TYPE_CODE,
    dianOperationType: DIAN_NC_OPERATION_TYPE,
  },
  {
    code: '3',
    name: 'Rebaja o descuento parcial o total',
    description: 'Descuento comercial parcial o total sobre la factura.',
    scope: 'ambos',
    dianCustomizationId: DIAN_NC_CUSTOMIZATION_ID,
    dianDocumentTypeCode: DIAN_NC_DOCUMENT_TYPE_CODE,
    dianOperationType: DIAN_NC_OPERATION_TYPE,
  },
  {
    code: '4',
    name: 'Ajuste de precio',
    description: 'Corrección parcial del valor facturado.',
    scope: 'parcial',
    dianCustomizationId: DIAN_NC_CUSTOMIZATION_ID,
    dianDocumentTypeCode: DIAN_NC_DOCUMENT_TYPE_CODE,
    dianOperationType: DIAN_NC_OPERATION_TYPE,
  },
  {
    code: '5',
    name: 'Otros',
    description: 'Otros conceptos de corrección ante la DIAN.',
    scope: 'ambos',
    dianCustomizationId: DIAN_NC_CUSTOMIZATION_ID,
    dianDocumentTypeCode: DIAN_NC_DOCUMENT_TYPE_CODE,
    dianOperationType: DIAN_NC_OPERATION_TYPE,
  },
];

export function formatCreditNoteConcept(row) {
  if (!row) return null;
  return {
    code: row.code,
    name: row.name,
    description: row.description || '',
    scope: row.scope,
    dianCustomizationId: row.dian_customization_id || DIAN_NC_CUSTOMIZATION_ID,
    dianDocumentTypeCode: row.dian_document_type_code || DIAN_NC_DOCUMENT_TYPE_CODE,
    dianOperationType: row.dian_operation_type || DIAN_NC_OPERATION_TYPE,
    sortOrder: Number(row.sort_order) || 0,
    isActive: row.is_active !== false,
  };
}

export function findCreditNoteConceptByCode(code) {
  return DIAN_CREDIT_NOTE_CONCEPTS.find((c) => c.code === String(code)) || null;
}

export function resolveCreditNoteScope(concept, scope) {
  if (!concept) return null;
  if (concept.scope === 'ambos') return scope === 'total' ? 'total' : 'parcial';
  return concept.scope;
}

export function validateCreditNoteConcept({ conceptCode, scope, sourceInvoice, lines }) {
  const concept = findCreditNoteConceptByCode(conceptCode);
  if (!concept) {
    throw Object.assign(new Error('Concepto de nota crédito DIAN no válido'), { status: 400 });
  }

  const effectiveScope = resolveCreditNoteScope(concept, scope);
  if (concept.scope === 'ambos' && !['parcial', 'total'].includes(effectiveScope)) {
    throw Object.assign(
      new Error('Indique si la nota crédito es parcial o total'),
      { status: 400 }
    );
  }

  const sourceTotal = Number(sourceInvoice?.total) || 0;
  const ncTotal = (lines || []).reduce((sum, line) => {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const discount = Number(line.discountAmount) || 0;
    const rate = Number(line.taxRate) || 0;
    const base = Math.max(0, qty * price - discount);
    return sum + base + Math.round(base * (rate / 100) * 100) / 100;
  }, 0);

  if (effectiveScope === 'total' && sourceTotal > 0 && Math.abs(ncTotal - sourceTotal) > 0.02) {
    throw Object.assign(
      new Error(`El concepto "${concept.name}" exige acreditación total (${sourceTotal.toFixed(2)})`),
      { status: 400 }
    );
  }

  if (effectiveScope === 'parcial' && sourceTotal > 0 && ncTotal >= sourceTotal - 0.02) {
    throw Object.assign(
      new Error('El concepto parcial exige un valor menor al total de la factura origen'),
      { status: 400 }
    );
  }

  return { concept, effectiveScope };
}

export function buildCreditNoteConceptUbl(concept, effectiveScope, { sourceNumber }) {
  return {
    code: concept.code,
    name: concept.name,
    scope: effectiveScope,
    customizationId: concept.dianCustomizationId,
    documentTypeCode: concept.dianDocumentTypeCode,
    responseCode: concept.code,
    referenceId: sourceNumber,
    description: concept.name,
    profileId: 'DIAN 2.1: Nota Crédito de Factura Electrónica de Venta',
  };
}
