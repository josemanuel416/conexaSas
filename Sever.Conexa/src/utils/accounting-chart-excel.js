import ExcelJS from 'exceljs';
import {
  getAccountLevel,
  getParentAccountCode,
  normalizeAccountCode,
  sortAccountsByLevel,
  buildImportValidationMaps,
  validateAccountRow,
} from './accounting-chart-rules.js';

const TEMPLATE_HEADERS = [
  { key: 'code', header: 'cuenta', width: 14 },
  { key: 'name', header: 'nombre_cuenta', width: 40 },
  { key: 'accountType', header: 'tipo', width: 12 },
  { key: 'accountClass', header: 'clase', width: 12 },
  { key: 'status', header: 'estado', width: 12 },
  { key: 'requiresThirdParty', header: 'mtercero', width: 12 },
  { key: 'requiresTax', header: 'deimpuesto', width: 12 },
  { key: 'taxCode', header: 'codigo_impuesto', width: 16 },
  { key: 'requiresInvoice', header: 'mfactura', width: 12 },
  { key: 'requiresCostCenter', header: 'mccosto', width: 12 },
];

const EXAMPLE_ROWS = [
  ['1', 'ACTIVO', 'suma', 'otros', 'activo', 'no', 'no', '', 'no', 'no'],
  ['11', 'DISPONIBLE', 'suma', 'otros', 'activo', 'no', 'no', '', 'no', 'no'],
  ['1105', 'CAJA', 'detalle', 'otros', 'activo', 'no', 'no', '', 'no', 'no'],
  ['13', 'DEUDORES', 'suma', 'cxc', 'activo', 'si', 'no', '', 'si', 'no'],
  ['1305', 'CLIENTES NACIONALES', 'detalle', 'cxc', 'activo', 'si', 'no', '', 'si', 'no'],
];

const INSTRUCTIONS = [
  'REGLAS DEL PLAN DE CUENTAS',
  '',
  '1. Longitud del código (cuenta):',
  '   - Nivel 1: 1 dígito (ej. 1)',
  '   - Nivel 2: 2 dígitos (ej. 11)',
  '   - Nivel 3: 4 dígitos (ej. 1105)',
  '   - Nivel 4: 6 dígitos, Nivel 5: 8 dígitos, etc.',
  '   - No use longitudes impares (3, 5, 7...) excepto el nivel 1.',
  '',
  '2. Cuenta suma (padre): se calcula automáticamente.',
  '   - Nivel 2: primer dígito (ej. cuenta 11 → suma 1)',
  '   - Nivel 3 en adelante: cuenta sin los últimos 2 dígitos (ej. 1105 → 11)',
  '',
  '3. tipo: suma | detalle',
  '4. clase: cxc | cxp | otros',
  '5. estado: activo | inactivo',
  '6. mtercero, deimpuesto, mfactura, mccosto: si | no',
  '',
  'Importe las filas en la hoja "Plan de cuentas". No modifique los encabezados.',
];

export function buildChartTemplateFileName() {
  return 'Plan-contable-plantilla.xlsx';
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  row.alignment = { vertical: 'middle', horizontal: 'center' };
}

export async function buildChartTemplateExcel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ErpConexa';
  wb.created = new Date();

  const ws = wb.addWorksheet('Plan de cuentas');
  ws.columns = TEMPLATE_HEADERS;

  const headerRow = ws.getRow(1);
  headerRow.values = TEMPLATE_HEADERS.map((h) => h.header);
  styleHeaderRow(headerRow);

  for (const example of EXAMPLE_ROWS) {
    ws.addRow(example);
  }

  ws.getCell('A8').note = {
    texts: [{ text: 'Solo dígitos. Longitudes válidas: 1, 2, 4, 6, 8...' }],
  };

  const help = wb.addWorksheet('Instrucciones');
  INSTRUCTIONS.forEach((line, idx) => {
    const row = help.getRow(idx + 1);
    row.getCell(1).value = line;
    if (idx === 0) row.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1565C0' } };
  });
  help.getColumn(1).width = 90;

  return wb.xlsx.writeBuffer();
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value.text != null) return String(value.text);
  if (typeof value === 'object' && value.result != null) return String(value.result);
  return String(value).trim();
}

function mapHeader(header) {
  const h = cellText(header).toLowerCase().replace(/\s+/g, '_');
  const map = {
    cuenta: 'code',
    codigo: 'code',
    codigo_cuenta: 'code',
    nombre_cuenta: 'name',
    nombre: 'name',
    tipo: 'accountType',
    clase: 'accountClass',
    estado: 'status',
    mtercero: 'requiresThirdParty',
    deimpuesto: 'requiresTax',
    codigo_impuesto: 'taxCode',
    mfactura: 'requiresInvoice',
    mccosto: 'requiresCostCenter',
  };
  return map[h] || null;
}

export async function parseChartImportExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.getWorksheet('Plan de cuentas') || wb.worksheets[0];
  if (!ws) {
    throw Object.assign(new Error('El archivo no contiene hojas'), { status: 400 });
  }

  const headerRow = ws.getRow(1);
  const colMap = new Map();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const field = mapHeader(cell.value);
    if (field) colMap.set(colNumber, field);
  });

  if (![...colMap.values()].includes('code') || ![...colMap.values()].includes('name')) {
    throw Object.assign(
      new Error('Encabezados requeridos: cuenta, nombre_cuenta'),
      { status: 400 },
    );
  }

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    colMap.forEach((field, colNumber) => {
      item[field] = cellText(row.getCell(colNumber).value);
    });
    if (!item.code && !item.name) return;
    rows.push({ rowNumber, ...item });
  });

  return rows;
}

export function validateChartImportRows(rawRows) {
  const normalized = rawRows.map((r) => ({
    ...r,
    code: normalizeAccountCode(r.code),
  }));

  const { codeSet, parentTypeByCode } = buildImportValidationMaps(normalized);
  const errors = [];
  const validRows = [];

  for (const row of normalized) {
    const result = validateAccountRow(row, codeSet, parentTypeByCode);
    if (!result.ok) {
      errors.push({
        row: row.rowNumber,
        code: row.code || '',
        messages: result.errors,
      });
    } else {
      validRows.push({ rowNumber: row.rowNumber, ...result.data });
    }
  }

  const duplicateCodes = new Map();
  for (const row of normalized) {
    if (!row.code) continue;
    duplicateCodes.set(row.code, (duplicateCodes.get(row.code) || 0) + 1);
  }
  for (const [code, count] of duplicateCodes.entries()) {
    if (count > 1) {
      errors.push({
        row: null,
        code,
        messages: [`La cuenta "${code}" está repetida ${count} veces`],
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    rows: sortAccountsByLevel(validRows),
  };
}

export async function exportCurrentChartExcel(accounts = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ErpConexa';
  const ws = wb.addWorksheet('Plan de cuentas');
  ws.columns = [
    ...TEMPLATE_HEADERS,
    { key: 'level', header: 'nivel', width: 8 },
    { key: 'parentCode', header: 'cuenta_suma', width: 14 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.values = [...TEMPLATE_HEADERS.map((h) => h.header), 'nivel', 'cuenta_suma'];
  styleHeaderRow(headerRow);

  for (const acc of accounts) {
    ws.addRow([
      acc.code,
      acc.name,
      acc.accountType,
      acc.accountClass,
      acc.status,
      acc.requiresThirdParty ? 'si' : 'no',
      acc.requiresTax ? 'si' : 'no',
      acc.taxCode || '',
      acc.requiresInvoice ? 'si' : 'no',
      acc.requiresCostCenter ? 'si' : 'no',
      acc.level ?? getAccountLevel(acc.code),
      acc.parentAccountCode || getParentAccountCode(acc.code) || '',
    ]);
  }

  return wb.xlsx.writeBuffer();
}

export function buildChartExportFileName() {
  return `Plan-contable-${new Date().toISOString().slice(0, 10)}.xlsx`;
}
