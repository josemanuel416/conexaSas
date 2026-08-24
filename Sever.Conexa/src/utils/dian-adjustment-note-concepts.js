/** Catálogo DIAN 16.2.4 — Concepto de corrección para notas de ajuste DS (tipo 95). */

export const DIAN_NAS_DOCUMENT_TYPE_CODE = '95';

export const DIAN_ADJUSTMENT_NOTE_CONCEPTS = [
  {
    code: '1',
    name: 'Devolución parcial de los bienes y/o no aceptación parcial del servicio',
    description: 'Acreditación parcial por devolución o rechazo parcial del servicio.',
  },
  {
    code: '2',
    name: 'Anulación del documento soporte en adquisiciones efectuadas a sujetos no obligados a expedir factura de venta o documento equivalente',
    description: 'Anulación total del documento soporte referenciado.',
  },
  {
    code: '3',
    name: 'Rebaja o descuento parcial o total',
    description: 'Descuento comercial parcial o total sobre el documento soporte.',
  },
  {
    code: '4',
    name: 'Ajuste de precio',
    description: 'Corrección parcial del valor del documento soporte.',
  },
  {
    code: '5',
    name: 'Otros',
    description: 'Otros conceptos de corrección ante la DIAN.',
  },
];

export function findAdjustmentNoteConceptByCode(code) {
  return DIAN_ADJUSTMENT_NOTE_CONCEPTS.find((c) => c.code === String(code)) || null;
}

export function buildAdjustmentNoteConceptUbl({ dianCode, description, referenceId = '1' }) {
  const catalog = findAdjustmentNoteConceptByCode(dianCode);
  const desc = String(description || catalog?.name || '').trim();
  if (!catalog) {
    throw Object.assign(new Error('Código DIAN de concepto de nota de ajuste no válido'), { status: 400 });
  }
  const sectionRef = String(referenceId || '1').replace(/\D/g, '').slice(0, 4) || '1';
  return {
    responseCode: catalog.code,
    referenceId: sectionRef,
    description: desc || catalog.name,
  };
}
