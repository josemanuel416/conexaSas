/** Valida orden de elementos NAS según Anexo Técnico DIAN (CreditNote tipo 95). */
import { buildSupportAdjustmentNoteUbl } from '../src/utils/ubl-support-adjustment-note.js';

const sample = buildSupportAdjustmentNoteUbl({
  nota: {
    cnsDocAjuste: 'SEDS984000002',
    issueDate: '2026-08-23',
    issueTime: '17:00:00',
    detalle: 'Observación prueba',
    afectaIva: true,
    afectaImp: true,
    vlrImpuesto: 16500,
  },
  fcxp: {
    cnsDocSoporte: 'SEDS984000000',
    cude: 'abc123',
    issueDate: '2026-08-23',
    transmissionCode: '1',
  },
  company: {
    name: 'Test SA',
    nit: '900123456',
    verificationDigit: '1',
    dianSoftwareId: 'sw-id',
    address: 'Calle 1',
    cityCode: '11001',
    email: 'a@b.com',
    phone: '1',
  },
  vendor: {
    documentNumber: '11235943',
    firstName: 'Jose',
    lastName: 'Perez',
    personType: 'natural',
    address: 'Calle 2',
    cityCode: '08372',
    departmentCode: '08',
    cityName: 'Juan De Acosta',
    departmentName: 'Atlántico',
  },
  resolution: {
    resolutionNumber: '18760000001',
    prefix: 'SEDS',
    rangeFrom: 984000000,
    rangeTo: 984999999,
    validFrom: '2025-01-01',
    validTo: '2027-12-31',
    dianEnvironment: 'habilitacion',
  },
  lines: [{
    lineNumber: 1,
    description: 'Ajuste',
    quantity: 1,
    unitPrice: 150000,
    lineBase: 150000,
    taxAmount: 28500,
    taxRate: 19,
  }],
  withholdingTaxes: [{ vlrImpuesto: 16500, base: 150000, vlrCalc: 11, taxCode: '06', taxName: 'ReteRenta' }],
  conceptUbl: { referenceId: '1', responseCode: '1', description: 'Devolución parcial' },
});

const tags = [
  'cbc:CreditNoteTypeCode',
  'cbc:Note',
  'cbc:DocumentCurrencyCode',
  'cbc:LineCountNumeric',
  'cac:DiscrepancyResponse',
  'cac:BillingReference',
  'cac:AccountingSupplierParty',
];

const positions = Object.fromEntries(tags.map((t) => [t, sample.indexOf(`<${t}`)]));
console.log('Posiciones (deben ser crecientes):', positions);

const payable = sample.match(/PayableAmount[^>]*>([^<]+)/)?.[1];
const taxInc = sample.match(/TaxInclusiveAmount[^>]*>([^<]+)/)?.[1];
const refId = sample.match(/DiscrepancyResponse[\s\S]*?ReferenceID>([^<]+)/)?.[1];
const profile = sample.match(/<cbc:ProfileID>([^<]+)<\/cbc:ProfileID>/)?.[1];

const okOrder = tags.every((t, i) => i === 0 || positions[t] === -1 || positions[tags[i - 1]] < positions[t]);
console.log('Orden DIAN OK:', okOrder);
console.log('Payable == TaxInclusive:', payable === taxInc, payable, taxInc);
console.log('ReferenceID (1-4):', refId);
console.log('ProfileID length:', profile?.length, 'starts Nota:', profile?.startsWith('Nota de ajuste'));

if (!okOrder || payable !== taxInc || refId?.length > 4) {
  process.exit(1);
}
